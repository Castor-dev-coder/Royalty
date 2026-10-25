import { randomUUID } from 'node:crypto';
import { db } from '../../prisma/db.js';
import { categoryRatingsFromRows, computeOverallRating, type CategoryRatings } from '../reviews/reviews.rules.js';
import { ReviewPhotosService } from '../reviews/photos.service.js';
import {
  pgNumeric,
  pgVarchar,
  staffIdOf,
  staffWhere,
  withStaffAssignment,
} from '../../prisma/contract-compat.js';
import { env } from '../../config/env.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js';
import { generateAuditLog } from '../../utils/audit.js';
import {
  fromPrismaDate,
  fromPrismaDateString,
  fromPrismaTime,
  isoWeekdayToPostgres,
  normalizeTimeOnly,
  toPlainDate,
  toPlainTime,
} from '../../utils/date-time.js';
import { StaffService, type EligibleStaffInfo } from '../staff/staff.service.js';
import type { CreateAppointmentInput } from './appointments.schemas.js';
import type { CalendarAvailabilityQuery } from './appointments.schemas.js';
import {
  AppointmentStatus,
  buildAvailableStartWindows,
  calculateEndTime,
  canTransitionStatus,
  dateOnly,
  dateString,
  hasAppointmentTimePassed,
  isoDayOfWeek,
  incrementTime,
  localDateAndTime,
  sumDecimalStrings,
  timeRangesOverlap,
  weekdayName,
} from './appointments.rules.js';
type AppointmentRecord = {
  id: string;
  appointmentCode: string;
  customerId: string;
  staffId: string | null;
  appointmentDate: Date | string | Temporal.PlainDate;
  startTime: string | Temporal.PlainTime;
  endTime: string | Temporal.PlainTime;
  totalAmount: unknown;
  status: AppointmentStatus;
  createdAt: Date;
  updatedAt: Date;
};

interface TransactionContext {
  orm: typeof db.orm;
}

interface BookingService {
  id: string;
  name: string;
  price: string;
  durationMinutes: number;
}

interface BookingPlan {
  /** Date-only column: already normalized to 'YYYY-MM-DD' at the DB boundary. */
  appointmentDate: string;
  endTime: string;
  totalAmount: string;
  services: BookingService[];
  available: boolean;
  /** First clear rule message when available is false. */
  unavailableReason?: string;
}

type EligibleCalendarStaff = EligibleStaffInfo;

export interface AppointmentInfo {
  id: string;
  appointmentCode: string;
  customerId: string;
  staffId: string | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  status: AppointmentStatus;
  services: Array<{
    id: string;
    serviceId: string;
    serviceName: string;
    price: number;
    durationMinutes: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompletedAppointmentInfo extends AppointmentInfo {
  staff: { id: string; firstName: string; lastName: string; primaryRole: string } | null;
  reviewEligible: boolean;
  alreadyReviewed: boolean;
}

/**
 * The caller's own appointment with its review status — the read side of the
 * review flow: which visits are reviewed and which are still reviewable.
 */
export interface MineAppointmentInfo extends AppointmentInfo {
  alreadyReviewed: boolean;
  /** Assigned staff identity for display; null when unassigned. */
  staff: { id: string; firstName: string; lastName: string } | null;
  review: {
    /** Computed category average (1 dp), or the grandfathered legacy rating. */
    overallRating: number;
    /** Four category ratings, or null for grandfathered reviews (overall-only). */
    ratings: CategoryRatings | null;
    comment: string | null;
    /** Visible photos only: { position, url }. */
    photos: Array<{ position: number; url: string }>;
  } | null;
}

/**
 * A staff member's own appointment, enriched with the client identity.
 *
 * This mirrors CompletedAppointmentInfo, which enriches the customer's own
 * completed list with the staff identity. Without the client name a staff
 * member cannot tell who is booked, and the appointment carries only a
 * customer ID.
 */
export interface StaffAppointmentInfo extends AppointmentInfo {
  customer: { id: string; firstName: string; lastName: string; phone: string | null } | null;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function serializeDecimal(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new BadRequestError('A stored appointment amount is invalid');
  return result;
}

async function collect<T>(records: AsyncIterable<T> | Iterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}

type ApplicationAppointmentRecord = Omit<AppointmentRecord, 'appointmentDate' | 'startTime' | 'endTime'> & {
  appointmentDate: Date;
  startTime: string;
  endTime: string;
};

function toApplicationAppointment(appointment: AppointmentRecord): ApplicationAppointmentRecord {
  return {
    ...appointment,
    appointmentDate: fromPrismaDate(appointment.appointmentDate),
    startTime: fromPrismaTime(appointment.startTime),
    endTime: fromPrismaTime(appointment.endTime),
  };
}

export class AppointmentsService {
  static async getCalendarAvailability(input: CalendarAvailabilityQuery): Promise<{
    timezone: string;
    dates: Array<{
      date: string;
      staff: Array<EligibleCalendarStaff & { windows: ReturnType<typeof buildAvailableStartWindows> }>;
    }>;
  }> {
    const services = await Promise.all(input.serviceIds.map(async (serviceId) => {
      const service = await db.orm.public.Service.where({ id: serviceId }).first();
      if (!service) throw new NotFoundError(`Service not found: ${serviceId}`);
      if (!service.isActive) throw new BadRequestError(`Service is inactive: ${service.name}`);
      return service;
    }));
    const durationMinutes = services.reduce((total, service) => total + service.durationMinutes, 0);
    const eligibleStaff = await StaffService.listEligibleForServices(input.serviceIds);
    const selectedStaff = input.staffId
      ? eligibleStaff.filter((staff) => staff.id === input.staffId)
      : eligibleStaff;
    const firstDate = dateOnly(input.from).getTime();
    const lastDate = dateOnly(input.to).getTime();
    const localNow = localDateAndTime(new Date(), env.STUDIO_TIME_ZONE);
    const dates: Array<{
      date: string;
      staff: Array<EligibleCalendarStaff & { windows: ReturnType<typeof buildAvailableStartWindows> }>;
    }> = [];

    for (let dateValue = firstDate; dateValue <= lastDate; dateValue += 24 * 60 * 60 * 1000) {
      const date = new Date(dateValue).toISOString().slice(0, 10);
      if (date < localNow.date) continue;
      const dayOfWeek = isoWeekdayToPostgres(isoDayOfWeek(date));
      const businessHour = await db.orm.public.BusinessHour.where({ dayOfWeek }).first();
      if (!businessHour?.isOpen || !businessHour.openTime || !businessHour.closeTime) continue;
      const businessOpen = fromPrismaTime(businessHour.openTime);
      const businessClose = fromPrismaTime(businessHour.closeTime);

      const availableStaff: Array<EligibleCalendarStaff & { windows: ReturnType<typeof buildAvailableStartWindows> }> = [];
      for (const staff of selectedStaff) {
        const [schedules, appointments] = await Promise.all([
          db.orm.public.StaffSchedule.where({ staffId: staff.id, dayOfWeek, isActive: true }).all(),
          db.orm.public.Appointment.where(staffWhere({ staffId: staff.id, appointmentDate: toPlainDate(date) })).all(),
        ]);
        const scheduleWindows = schedules
          .filter((schedule) => {
            const effectiveUntil = schedule.effectiveUntil ? fromPrismaDateString(schedule.effectiveUntil) : null;
            return fromPrismaDateString(schedule.effectiveFrom) <= date && (!effectiveUntil || effectiveUntil >= date);
          })
          .map((schedule) => ({
            startTime: fromPrismaTime(schedule.startTime) > businessOpen ? fromPrismaTime(schedule.startTime) : businessOpen,
            endTime: fromPrismaTime(schedule.endTime) < businessClose ? fromPrismaTime(schedule.endTime) : businessClose,
          }))
          .filter((window) => window.startTime < window.endTime);
        if (date === localNow.date) {
          const firstFutureMinute = incrementTime(localNow.time, 1);
          if (!firstFutureMinute) continue;
          for (const window of scheduleWindows) {
            if (window.startTime < firstFutureMinute) window.startTime = firstFutureMinute;
          }
        }

        const bookedWindows = appointments
          .filter((appointment) => appointment.status === 'RESERVED' || appointment.status === 'CONFIRMED')
          .map((appointment) => ({
            startTime: fromPrismaTime(appointment.startTime),
            endTime: fromPrismaTime(appointment.endTime),
          }));
        const windows = buildAvailableStartWindows(scheduleWindows, bookedWindows, durationMinutes);
        if (windows.length > 0) availableStaff.push({ ...staff, windows });
      }
      if (availableStaff.length > 0) dates.push({ date, staff: availableStaff });
    }

    return { timezone: env.STUDIO_TIME_ZONE, dates };
  }

  static async create(data: CreateAppointmentInput, requestingUserId: string): Promise<AppointmentInfo> {
    const customer = await db.orm.public.Customer.where({ accountId: requestingUserId }).first();
    if (!customer) throw new NotFoundError('No customer profile found for this account');

    const plan = await this.getBookingPlan(data);
    if (!plan.available) {
      const reason = plan.unavailableReason ?? 'The requested staff member is not available for this appointment';
      if (reason === 'The chosen stylist already has a booking at that time.') {
        throw new ConflictError(reason);
      }
      throw new BadRequestError(reason);
    }

    // Server-side re-validation (never trust the client's recommendation):
    // the chosen staff must cover every category the selected services need.
    if (data.staffId) {
      const neededCategories = new Set<string>();
      for (const serviceId of data.serviceIds) {
        const service = await db.orm.public.Service.where({ id: serviceId }).first();
        if (service) neededCategories.add(String(service.categoryId));
      }
      const links = await db.orm.public.StaffCategory.where({ staffId: data.staffId }).all();
      const covered = links.map((link) => String(link.categoryId));
      const missing = [...neededCategories].filter((categoryId) => !covered.includes(categoryId));
      if (missing.length > 0) {
        throw new ConflictError('The chosen stylist does not cover every selected service category');
      }
    }

    let appointmentId = '';
    await db.transaction(async (tx: TransactionContext) => {
      const appointment = await tx.orm.public.Appointment.create(withStaffAssignment({
        appointmentCode: pgVarchar<40>(`APT-${randomUUID().toUpperCase()}`),
        customerId: customer.id,
        appointmentDate: toPlainDate(plan.appointmentDate),
        startTime: toPlainTime(data.startTime),
        endTime: toPlainTime(plan.endTime),
        totalAmount: pgNumeric(plan.totalAmount),
        status: 'RESERVED',
      }, data.staffId));
      appointmentId = appointment.id;

      for (const service of plan.services) {
        await tx.orm.public.AppointmentService.create({
          appointmentId: appointment.id,
          serviceId: service.id,
          serviceName: pgVarchar<200>(service.name),
          price: pgNumeric(service.price),
          durationMinutes: service.durationMinutes,
        });
      }
    });

    const appointment = await db.orm.public.Appointment.where({ id: appointmentId }).first();
    if (!appointment) throw new NotFoundError('Appointment could not be loaded after creation');

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'CREATE_APPOINTMENT',
      entityType: 'Appointment',
      entityId: appointment.id,
      newData: {
        appointmentCode: appointment.appointmentCode,
        customerId: appointment.customerId,
        staffId: staffIdOf(appointment),
        appointmentDate: appointment.appointmentDate,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        totalAmount: plan.totalAmount,
        status: appointment.status,
      },
    });

    return this.mapAppointment(toApplicationAppointment(appointment));
  }

  static async checkAvailability(data: CreateAppointmentInput): Promise<{
    available: boolean;
    endTime: string;
    totalAmount: number;
  }> {
    const plan = await this.getBookingPlan(data);
    return {
      available: plan.available,
      endTime: plan.endTime,
      totalAmount: serializeDecimal(plan.totalAmount),
    };
  }

  static async listAll(page: number, limit: number): Promise<{ appointments: AppointmentInfo[]; total: number }> {
    const totalResult = await db.orm.public.Appointment
      .where({})
      .aggregate((aggregate) => ({ total: aggregate.count() }));
    const total = typeof totalResult.total === 'number' ? totalResult.total : 0;
    const skip = (page - 1) * limit;
    const query = db.orm.public.Appointment.orderBy((appointment) => appointment.appointmentDate.desc());
    const appointmentsRaw = await query.offset(skip).limit(limit).all();
    const appointments = await collect(appointmentsRaw as Iterable<AppointmentRecord> | AsyncIterable<AppointmentRecord>);
    return {
      appointments: await Promise.all(appointments.map((appointment) => this.mapAppointment(toApplicationAppointment(appointment)))),
      total,
    };
  }

  static async listMine(
    requestingUserId: string,
    role: string,
    page: number,
    limit: number
  ): Promise<{ appointments: AppointmentInfo[]; total: number }> {
    const customer = await db.orm.public.Customer.where({ accountId: requestingUserId }).first();
    if (!customer) throw new NotFoundError('No customer profile found for this account');
    if (role !== 'CUSTOMER' && role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenError('Only customers and administrators can view customer appointments');
    }

    const totalResult = await db.orm.public.Appointment
      .where({ customerId: customer.id })
      .aggregate((aggregate) => ({ total: aggregate.count() }));
    const total = typeof totalResult.total === 'number' ? totalResult.total : 0;
    const skip = (page - 1) * limit;
    const query = db.orm.public.Appointment.where({ customerId: customer.id })
      .orderBy((appointment) => appointment.appointmentDate.desc());
    const appointmentsRaw = await query.offset(skip).limit(limit).all();
    const appointments = await collect(appointmentsRaw as Iterable<AppointmentRecord> | AsyncIterable<AppointmentRecord>);
    return {
      appointments: await Promise.all(appointments.map((appointment) => this.mapAppointment(toApplicationAppointment(appointment)))),
      total,
    };
  }

  /**
   * The caller's appointments with services and review status. Read-only;
   * the review flag mirrors the one-review-per-appointment unique constraint.
   */
  static async listMineWithReviewStatus(
    requestingUserId: string,
    role: string,
    page: number,
    limit: number
  ): Promise<{ appointments: MineAppointmentInfo[]; total: number }> {
    const customer = await db.orm.public.Customer.where({ accountId: requestingUserId }).first();
    if (!customer) {
      // Staff-side roles have no customer profile. They must never see other
      // customers' appointments, so they get their own (empty) list.
      if (role === 'ADMIN' || role === 'MANAGER') return { appointments: [], total: 0 };
      throw new NotFoundError('No customer profile found for this account');
    }
    if (role !== 'CUSTOMER' && role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenError('Only customers and administrators can view customer appointments');
    }

    const totalResult = await db.orm.public.Appointment
      .where({ customerId: customer.id })
      .aggregate((aggregate) => ({ total: aggregate.count() }));
    const total = typeof totalResult.total === 'number' ? totalResult.total : 0;
    const skip = (page - 1) * limit;
    const query = db.orm.public.Appointment.where({ customerId: customer.id })
      .orderBy((appointment) => appointment.appointmentDate.desc());
    const appointmentsRaw = await query.offset(skip).limit(limit).all();
    const mineRecords = await collect(appointmentsRaw as Iterable<AppointmentRecord> | AsyncIterable<AppointmentRecord>);
    return {
      appointments: await Promise.all(mineRecords.map(async (appointment): Promise<MineAppointmentInfo> => {
        const [mapped, review, staffRecord] = await Promise.all([
          this.mapAppointment(toApplicationAppointment(appointment)),
          db.orm.public.Review.where({ appointmentId: appointment.id }).first(),
          appointment.staffId
            ? db.orm.public.Staff.where({ id: appointment.staffId }).first()
            : Promise.resolve(null),
        ]);
        const staff = staffRecord
          ? { id: staffRecord.id, firstName: staffRecord.firstName, lastName: staffRecord.lastName }
          : null;
        if (!review) return { ...mapped, alreadyReviewed: false, staff, review: null };
        const ratingRows = await db.orm.public.ReviewRating.where({ reviewId: review.id }).all();
        const ratings = categoryRatingsFromRows(ratingRows.map((row) => ({ category: row.category, rating: row.rating })));
        return {
          ...mapped,
          alreadyReviewed: true,
          staff,
          review: {
            overallRating: ratings ? computeOverallRating(ratings) : review.rating,
            ratings,
            comment: review.comment,
            photos: await ReviewPhotosService.visiblePhotos(String(review.id)),
          },
        };
      })),
      total,
    };
  }

  static async listCompletedMine(
    requestingUserId: string,
    page: number,
    limit: number
  ): Promise<{ appointments: CompletedAppointmentInfo[]; total: number }> {
    const customer = await db.orm.public.Customer.where({ accountId: requestingUserId }).first();
    if (!customer) throw new NotFoundError('No customer profile found for this account');

    const totalResult = await db.orm.public.Appointment
      .where({ customerId: customer.id, status: 'COMPLETED' })
      .aggregate((aggregate) => ({ total: aggregate.count() }));
    const total = typeof totalResult.total === 'number' ? totalResult.total : 0;
    const skip = (page - 1) * limit;
    const appointmentsRaw = db.orm.public.Appointment.where({ customerId: customer.id, status: 'COMPLETED' })
      .orderBy((appointment) => appointment.appointmentDate.desc());
    const appointmentRecords = await appointmentsRaw.offset(skip).limit(limit).all();
    const appointments = await collect(appointmentRecords as Iterable<AppointmentRecord> | AsyncIterable<AppointmentRecord>);
    const completed = await Promise.all(appointments.map(async (appointment): Promise<CompletedAppointmentInfo> => {
      const [mapped, staff, review] = await Promise.all([
        this.mapAppointment(toApplicationAppointment(appointment)),
        appointment.staffId ? db.orm.public.Staff.where({ id: appointment.staffId }).first() : Promise.resolve(null),
        db.orm.public.Review.where({ appointmentId: appointment.id }).first(),
      ]);
      const alreadyReviewed = review !== null;
      return {
        ...mapped,
        staff: staff ? {
          id: staff.id,
          firstName: staff.firstName,
          lastName: staff.lastName,
          primaryRole: staff.primaryRole,
        } : null,
        reviewEligible: !alreadyReviewed,
        alreadyReviewed,
      };
    }));

    return { appointments: completed, total };
  }

  static async listForStaff(
    requestingUserId: string,
    page: number,
    limit: number
  ): Promise<{ appointments: StaffAppointmentInfo[]; total: number }> {
    const staff = await db.orm.public.Staff.where({ accountId: requestingUserId }).first();
    if (!staff) throw new NotFoundError('No staff profile found for this account');

    const totalResult = await db.orm.public.Appointment
      .where(staffWhere({ staffId: staff.id }))
      .aggregate((aggregate) => ({ total: aggregate.count() }));
    const total = typeof totalResult.total === 'number' ? totalResult.total : 0;
    const skip = (page - 1) * limit;
    const query = db.orm.public.Appointment.where(staffWhere({ staffId: staff.id }))
      .orderBy((appointment) => appointment.appointmentDate.desc());
    const appointmentsRaw = await query.offset(skip).limit(limit).all();
    const appointments = await collect(appointmentsRaw as Iterable<AppointmentRecord> | AsyncIterable<AppointmentRecord>);
    return {
      appointments: await Promise.all(appointments.map(async (appointment) => {
        const [mapped, customer] = await Promise.all([
          this.mapAppointment(toApplicationAppointment(appointment)),
          db.orm.public.Customer.where({ id: appointment.customerId }).first(),
        ]);
        return {
          ...mapped,
          customer: customer
            ? {
                id: customer.id,
                firstName: customer.firstName,
                lastName: customer.lastName,
                phone: customer.phone,
              }
            : null,
        };
      })),
      total,
    };
  }

  static async getById(appointmentId: string, requestingUserId: string, role: string): Promise<AppointmentInfo> {
    const appointment = await db.orm.public.Appointment.where({ id: appointmentId }).first();
    if (!appointment) throw new NotFoundError('Appointment not found');
    await this.assertCanView(appointment, requestingUserId, role);
    return this.mapAppointment(toApplicationAppointment(appointment));
  }

  static async updateStatus(
    appointmentId: string,
    nextStatus: AppointmentStatus,
    requestingUserId: string,
    role: string
  ): Promise<AppointmentInfo> {
    const appointment = await db.orm.public.Appointment.where({ id: appointmentId }).first();
    if (!appointment) throw new NotFoundError('Appointment not found');
    await this.assertCanView(appointment, requestingUserId, role);

    if (!canTransitionStatus(appointment.status, nextStatus)) {
      throw new ConflictError(`Appointment cannot transition from ${appointment.status} to ${nextStatus}`);
    }

    if (role === 'CUSTOMER') {
      if (nextStatus !== 'CANCELLED') {
        throw new ForbiddenError('Customers may only cancel their own appointments');
      }
      if (hasAppointmentTimePassed(fromPrismaDate(appointment.appointmentDate), fromPrismaTime(appointment.startTime), new Date(), env.STUDIO_TIME_ZONE)) {
        throw new ConflictError('An appointment can only be cancelled before its start time');
      }
    } else if (role === 'STAFF') {
      if (staffIdOf(appointment) === null) throw new ForbiddenError('This appointment is not assigned to a staff member');
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenError('You do not have permission to change this appointment');
    }

    if (nextStatus === 'COMPLETED' && !hasAppointmentTimePassed(fromPrismaDate(appointment.appointmentDate), fromPrismaTime(appointment.endTime), new Date(), env.STUDIO_TIME_ZONE)) {
      throw new ConflictError('An appointment cannot be completed before its end time');
    }
    if (nextStatus === 'NO_SHOW' && !hasAppointmentTimePassed(fromPrismaDate(appointment.appointmentDate), fromPrismaTime(appointment.endTime), new Date(), env.STUDIO_TIME_ZONE)) {
      throw new ConflictError('An appointment cannot be marked as no-show before its end time');
    }

    const updated = await db.orm.public.Appointment.where({ id: appointmentId, status: appointment.status })
      .update({ status: nextStatus });
    if (!updated) throw new ConflictError('Appointment status changed concurrently; reload and try again');

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'UPDATE_APPOINTMENT_STATUS',
      entityType: 'Appointment',
      entityId: appointmentId,
      oldData: { status: appointment.status },
      newData: { status: updated.status },
    });

    return this.mapAppointment(toApplicationAppointment(updated));
  }

  private static async getBookingPlan(data: CreateAppointmentInput): Promise<BookingPlan> {
    const requestedDate = dateOnly(data.appointmentDate);
    const localNow = localDateAndTime(new Date(), env.STUDIO_TIME_ZONE);
    if (data.appointmentDate < localNow.date ||
      (data.appointmentDate === localNow.date && data.startTime <= localNow.time)) {
      throw new BadRequestError('Appointment date and time must be in the future');
    }

    const serviceRows: BookingService[] = [];
    for (const serviceId of data.serviceIds) {
      const service = await db.orm.public.Service.where({ id: serviceId }).first();
      if (!service) throw new NotFoundError(`Service not found: ${serviceId}`);
      if (!service.isActive) throw new BadRequestError(`Service is inactive: ${service.name}`);
      const category = await db.orm.public.ServiceCategory.where({ id: service.categoryId }).first();
      if (!category || !category.isActive) throw new BadRequestError(`Service category is inactive: ${service.name}`);
      serviceRows.push({
        id: service.id,
        name: service.name,
        price: String(service.price),
        durationMinutes: service.durationMinutes,
      });
    }

    const endTime = calculateEndTime(data.startTime, serviceRows.map((service) => service.durationMinutes));
    const staff = await db.orm.public.Staff.where({ id: data.staffId }).first();
    if (!staff) throw new NotFoundError('Staff member not found');

    const assignments = await db.orm.public.StaffService.where({ staffId: staff.id }).all();
    const assignedServiceIds = new Set(assignments.map((assignment) => assignment.serviceId));
    if (serviceRows.some((service) => !assignedServiceIds.has(service.id))) {
      throw new BadRequestError('The selected staff member is not assigned to every selected service');
    }

    // Booking rules (Asia/Manila wall clock throughout). Each failure gets its
    // own clear reason; the first reason is what the caller sees.
    const reasons: string[] = [];
    const dayOfWeek = isoWeekdayToPostgres(isoDayOfWeek(data.appointmentDate));
    const weekday = weekdayName(dayOfWeek);
    const businessHour = await db.orm.public.BusinessHour.where({ dayOfWeek }).first();
    const businessOpen = businessHour?.openTime ? fromPrismaTime(businessHour.openTime) : null;
    const businessClose = businessHour?.closeTime ? fromPrismaTime(businessHour.closeTime) : null;
    if (!businessHour || !businessHour.isOpen || !businessHour.openTime || !businessHour.closeTime ||
      !businessOpen || !businessClose) {
      reasons.push(`The salon is closed on ${weekday}.`);
    } else if (data.startTime < businessOpen) {
      reasons.push(`The salon opens at ${businessOpen} on ${weekday}.`);
    } else if (endTime > businessClose) {
      reasons.push(`The appointment must end by ${businessClose} on ${weekday}.`);
    }

    const schedules = await db.orm.public.StaffSchedule.where({ staffId: staff.id, dayOfWeek, isActive: true }).all();
    const dateValue = requestedDate.getTime();
    const hasMatchingSchedule = schedules.some((schedule) => {
      const scheduleEndDate = schedule.effectiveUntil ? fromPrismaDateString(schedule.effectiveUntil) : null;
      return fromPrismaDateString(schedule.effectiveFrom) <= data.appointmentDate &&
        (!scheduleEndDate || scheduleEndDate >= data.appointmentDate) &&
        data.startTime >= fromPrismaTime(schedule.startTime) && endTime <= fromPrismaTime(schedule.endTime);
    });
    if (!hasMatchingSchedule || !Number.isFinite(dateValue)) {
      reasons.push('The chosen stylist is not scheduled at that time.');
    }

    // Approved time off (full day or a time window) excludes the stylist.
    const timeOffRequests = await db.orm.public.ScheduleRequest.where({ staffId: staff.id, status: 'APPROVED' }).all();
    const onTimeOff = timeOffRequests.some((request) => {
      if (fromPrismaDateString(request.requestedDate) !== data.appointmentDate) return false;
      const offStart = request.requestedStartTime ? fromPrismaTime(request.requestedStartTime) : null;
      const offEnd = request.requestedEndTime ? fromPrismaTime(request.requestedEndTime) : null;
      if (!offStart || !offEnd) return true;
      return timeRangesOverlap(data.startTime, endTime, offStart, offEnd);
    });
    if (onTimeOff) {
      reasons.push('The chosen stylist is on approved time off that day.');
    }

    const staffAppointments = await db.orm.public.Appointment.where(staffWhere({ staffId: staff.id })).all();
    const hasConflict = staffAppointments.some((appointment) => {
      if (fromPrismaDateString(appointment.appointmentDate) !== data.appointmentDate) return false;
      if (appointment.status !== 'RESERVED' && appointment.status !== 'CONFIRMED') return false;
      return timeRangesOverlap(data.startTime, endTime, fromPrismaTime(appointment.startTime), fromPrismaTime(appointment.endTime));
    });
    if (hasConflict) {
      reasons.push('The chosen stylist already has a booking at that time.');
    }

    return {
      appointmentDate: dateString(requestedDate),
      endTime,
      totalAmount: sumDecimalStrings(serviceRows.map((service) => service.price)),
      services: serviceRows,
      available: reasons.length === 0,
      unavailableReason: reasons[0],
    };
  }

  private static async assertCanView(
    appointment: { customerId: string },
    requestingUserId: string,
    role: string
  ): Promise<void> {
    if (role === 'ADMIN' || role === 'MANAGER') return;
    if (role === 'CUSTOMER') {
      const customer = await db.orm.public.Customer.where({ accountId: requestingUserId }).first();
      if (!customer) throw new NotFoundError('No customer profile found for this account');
      if (appointment.customerId !== customer.id) throw new ForbiddenError('You can only access your own appointments');
      return;
    }
    if (role === 'STAFF') {
      const staff = await db.orm.public.Staff.where({ accountId: requestingUserId }).first();
      if (!staff) throw new NotFoundError('No staff profile found for this account');
      if (staffIdOf(appointment) !== staff.id) throw new ForbiddenError('You can only access appointments assigned to you');
      return;
    }
    throw new ForbiddenError('You do not have permission to access this appointment');
  }

  private static async mapAppointment(appointment: {
    id: string;
    appointmentCode: string;
    customerId: string;
    appointmentDate: Date;
    startTime: Date | string;
    endTime: Date | string;
    totalAmount: unknown;
    status: AppointmentStatus;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<AppointmentInfo> {
    const services = await db.orm.public.AppointmentService.where({ appointmentId: appointment.id }).all();
    return {
      id: appointment.id,
      appointmentCode: appointment.appointmentCode,
      customerId: appointment.customerId,
      staffId: staffIdOf(appointment),
      appointmentDate: dateString(appointment.appointmentDate),
      startTime: normalizeTimeOnly(appointment.startTime),
      endTime: normalizeTimeOnly(appointment.endTime),
      totalAmount: serializeDecimal(appointment.totalAmount),
      status: appointment.status,
      services: services.map((service) => ({
        id: service.id,
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        price: serializeDecimal(service.price),
        durationMinutes: service.durationMinutes,
      })),
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
    };
  }
}