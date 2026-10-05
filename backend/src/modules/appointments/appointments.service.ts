import { randomUUID } from 'node:crypto';
import { db } from '../../prisma/db.js';
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
      throw new ConflictError('The requested staff member is not available for this appointment');
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
    const totalResult = await db.orm.public.Appointment.where({}).count();
    const total = typeof totalResult === 'number' ? totalResult : 0;
    const skip = (page - 1) * limit;
    const query = db.orm.public.Appointment.orderBy((appointment) => appointment.appointmentDate.desc());
    // @ts-expect-error - Prisma 8 RC types omit supported skip/take methods on ordered collections
    const appointmentsRaw = await query.skip(skip).take(limit).all();
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

    const totalResult = await db.orm.public.Appointment.where({ customerId: customer.id }).count();
    const total = typeof totalResult === 'number' ? totalResult : 0;
    const skip = (page - 1) * limit;
    const query = db.orm.public.Appointment.where({ customerId: customer.id })
      .orderBy((appointment) => appointment.appointmentDate.desc());
    // @ts-expect-error - Prisma 8 RC types omit supported skip/take methods on ordered collections
    const appointmentsRaw = await query.skip(skip).take(limit).all();
    const appointments = await collect(appointmentsRaw as Iterable<AppointmentRecord> | AsyncIterable<AppointmentRecord>);
    return {
      appointments: await Promise.all(appointments.map((appointment) => this.mapAppointment(toApplicationAppointment(appointment)))),
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

    const query = db.orm.public.Appointment.where({ customerId: customer.id, status: 'COMPLETED' });
    const totalResult = await query.count();
    const total = typeof totalResult === 'number' ? totalResult : 0;
    const skip = (page - 1) * limit;
    const appointmentsRaw = db.orm.public.Appointment.where({ customerId: customer.id, status: 'COMPLETED' })
      .orderBy((appointment) => appointment.appointmentDate.desc());
    // @ts-expect-error - Prisma 8 RC types omit supported skip/take methods on ordered collections
    const appointmentRecords = await appointmentsRaw.skip(skip).take(limit).all();
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
  ): Promise<{ appointments: AppointmentInfo[]; total: number }> {
    const staff = await db.orm.public.Staff.where({ accountId: requestingUserId }).first();
    if (!staff) throw new NotFoundError('No staff profile found for this account');

    const totalResult = await db.orm.public.Appointment.where(staffWhere({ staffId: staff.id })).count();
    const total = typeof totalResult === 'number' ? totalResult : 0;
    const skip = (page - 1) * limit;
    const query = db.orm.public.Appointment.where(staffWhere({ staffId: staff.id }))
      .orderBy((appointment) => appointment.appointmentDate.desc());
    // @ts-expect-error - Prisma 8 RC types omit supported skip/take methods on ordered collections
    const appointmentsRaw = await query.skip(skip).take(limit).all();
    const appointments = await collect(appointmentsRaw as Iterable<AppointmentRecord> | AsyncIterable<AppointmentRecord>);
    return {
      appointments: await Promise.all(appointments.map((appointment) => this.mapAppointment(toApplicationAppointment(appointment)))),
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

    let available = staff.workStatus === 'ON_DUTY';
    const dayOfWeek = isoWeekdayToPostgres(isoDayOfWeek(data.appointmentDate));
    const businessHour = await db.orm.public.BusinessHour.where({ dayOfWeek }).first();
    const businessOpen = businessHour?.openTime ? fromPrismaTime(businessHour.openTime) : null;
    const businessClose = businessHour?.closeTime ? fromPrismaTime(businessHour.closeTime) : null;
    if (!businessHour || !businessHour.isOpen || !businessHour.openTime || !businessHour.closeTime ||
      !businessOpen || !businessClose || data.startTime < businessOpen || endTime > businessClose) {
      available = false;
    }

    const schedules = await db.orm.public.StaffSchedule.where({ staffId: staff.id, dayOfWeek, isActive: true }).all();
    const dateValue = requestedDate.getTime();
    const hasMatchingSchedule = schedules.some((schedule) => {
      const scheduleEndDate = schedule.effectiveUntil ? fromPrismaDateString(schedule.effectiveUntil) : null;
      return fromPrismaDateString(schedule.effectiveFrom) <= data.appointmentDate &&
        (!scheduleEndDate || scheduleEndDate >= data.appointmentDate) &&
        data.startTime >= fromPrismaTime(schedule.startTime) && endTime <= fromPrismaTime(schedule.endTime);
    });
    if (!hasMatchingSchedule || !Number.isFinite(dateValue)) available = false;

    const staffAppointments = await db.orm.public.Appointment.where(staffWhere({ staffId: staff.id })).all();
    const hasConflict = staffAppointments.some((appointment) => {
      if (fromPrismaDateString(appointment.appointmentDate) !== data.appointmentDate) return false;
      if (appointment.status !== 'RESERVED' && appointment.status !== 'CONFIRMED') return false;
      return timeRangesOverlap(data.startTime, endTime, fromPrismaTime(appointment.startTime), fromPrismaTime(appointment.endTime));
    });
    if (hasConflict) available = false;

    return {
      appointmentDate: dateString(requestedDate),
      endTime,
      totalAmount: sumDecimalStrings(serviceRows.map((service) => service.price)),
      services: serviceRows,
      available,
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