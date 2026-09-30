import { randomUUID } from 'node:crypto';
import { db } from '../../prisma/db.js';
import { env } from '../../config/env.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js';
import { generateAuditLog } from '../../utils/audit.js';
import type { CreateAppointmentInput } from './appointments.schemas.js';

type AppointmentStatus = 'RESERVED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
type AppointmentRecord = {
  id: string;
  appointmentCode: string;
  customerId: string;
  staffId: string | null;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
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
  appointmentDate: Date;
  endTime: string;
  totalAmount: string;
  services: BookingService[];
  available: boolean;
}

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

function localDateAndTime(now: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: env.STUDIO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isoDayOfWeek(value: string): number {
  const day = dateOnly(value).getUTCDay();
  return day === 0 ? 7 : day;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function sumDecimalStrings(values: string[]): string {
  const parts = values.map((value) => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) throw new BadRequestError('A service price has an unsupported numeric format');
    return { whole: match[1], fraction: match[2] ?? '' };
  });
  const scale = Math.max(0, ...parts.map((part) => part.fraction.length));
  const total = parts.reduce((sum, part) => {
    const scaled = `${part.whole}${part.fraction.padEnd(scale, '0')}`;
    return sum + BigInt(scaled);
  }, 0n);
  if (scale === 0) return total.toString();

  const digits = total.toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function serializeDecimal(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new BadRequestError('A stored appointment amount is invalid');
  return result;
}

function isBeforeLocalStart(appointmentDate: Date, startTime: string, now: Date): boolean {
  const localNow = localDateAndTime(now);
  const date = dateString(appointmentDate);
  return date > localNow.date || (date === localNow.date && startTime > localNow.time);
}

async function collect<T>(records: AsyncIterable<T> | Iterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}

export class AppointmentsService {
  static async create(data: CreateAppointmentInput, requestingUserId: string): Promise<AppointmentInfo> {
    const customer = await db.orm.public.Customer.where({ accountId: requestingUserId }).first();
    if (!customer) throw new NotFoundError('No customer profile found for this account');

    const plan = await this.getBookingPlan(data);
    if (!plan.available) {
      throw new ConflictError('The requested staff member is not available for this appointment');
    }

    let appointmentId = '';
    await db.transaction(async (tx: TransactionContext) => {
      const appointment = await tx.orm.public.Appointment.create({
        appointmentCode: `APT-${randomUUID().toUpperCase()}`,
        customerId: customer.id,
        staffId: data.staffId,
        appointmentDate: plan.appointmentDate,
        startTime: data.startTime,
        endTime: plan.endTime,
        totalAmount: plan.totalAmount,
        status: 'RESERVED',
      });
      appointmentId = appointment.id;

      for (const service of plan.services) {
        await tx.orm.public.AppointmentService.create({
          appointmentId: appointment.id,
          serviceId: service.id,
          serviceName: service.name,
          price: service.price,
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
        staffId: appointment.staffId,
        appointmentDate: appointment.appointmentDate,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        totalAmount: plan.totalAmount,
        status: appointment.status,
      },
    });

    return this.mapAppointment(appointment);
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
      appointments: await Promise.all(appointments.map((appointment) => this.mapAppointment(appointment))),
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
      appointments: await Promise.all(appointments.map((appointment) => this.mapAppointment(appointment))),
      total,
    };
  }

  static async listForStaff(
    requestingUserId: string,
    page: number,
    limit: number
  ): Promise<{ appointments: AppointmentInfo[]; total: number }> {
    const staff = await db.orm.public.Staff.where({ accountId: requestingUserId }).first();
    if (!staff) throw new NotFoundError('No staff profile found for this account');

    const totalResult = await db.orm.public.Appointment.where({ staffId: staff.id }).count();
    const total = typeof totalResult === 'number' ? totalResult : 0;
    const skip = (page - 1) * limit;
    const query = db.orm.public.Appointment.where({ staffId: staff.id })
      .orderBy((appointment) => appointment.appointmentDate.desc());
    // @ts-expect-error - Prisma 8 RC types omit supported skip/take methods on ordered collections
    const appointmentsRaw = await query.skip(skip).take(limit).all();
    const appointments = await collect(appointmentsRaw as Iterable<AppointmentRecord> | AsyncIterable<AppointmentRecord>);
    return {
      appointments: await Promise.all(appointments.map((appointment) => this.mapAppointment(appointment))),
      total,
    };
  }

  static async getById(appointmentId: string, requestingUserId: string, role: string): Promise<AppointmentInfo> {
    const appointment = await db.orm.public.Appointment.where({ id: appointmentId }).first();
    if (!appointment) throw new NotFoundError('Appointment not found');
    await this.assertCanView(appointment, requestingUserId, role);
    return this.mapAppointment(appointment);
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

    const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      RESERVED: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
      COMPLETED: [],
      CANCELLED: [],
      NO_SHOW: [],
    };
    if (!transitions[appointment.status].includes(nextStatus)) {
      throw new ConflictError(`Appointment cannot transition from ${appointment.status} to ${nextStatus}`);
    }

    if (role === 'CUSTOMER') {
      if (nextStatus !== 'CANCELLED') {
        throw new ForbiddenError('Customers may only cancel their own appointments');
      }
      if (!isBeforeLocalStart(appointment.appointmentDate, appointment.startTime, new Date())) {
        throw new ConflictError('An appointment can only be cancelled before its start time');
      }
    } else if (role === 'STAFF') {
      if (appointment.staffId === null) throw new ForbiddenError('This appointment is not assigned to a staff member');
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenError('You do not have permission to change this appointment');
    }

    if (nextStatus === 'COMPLETED' && isBeforeLocalStart(appointment.appointmentDate, appointment.endTime, new Date())) {
      throw new ConflictError('An appointment cannot be completed before its end time');
    }
    if (nextStatus === 'NO_SHOW' && isBeforeLocalStart(appointment.appointmentDate, appointment.endTime, new Date())) {
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

    return this.mapAppointment(updated);
  }

  private static async getBookingPlan(data: CreateAppointmentInput): Promise<BookingPlan> {
    const requestedDate = dateOnly(data.appointmentDate);
    const localNow = localDateAndTime(new Date());
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

    const totalDuration = serviceRows.reduce((sum, service) => sum + service.durationMinutes, 0);
    const startMinutes = toMinutes(data.startTime);
    const endMinutes = startMinutes + totalDuration;
    if (endMinutes >= 24 * 60) throw new BadRequestError('Appointment cannot extend past midnight');
    const endTime = fromMinutes(endMinutes);
    const staff = await db.orm.public.Staff.where({ id: data.staffId }).first();
    if (!staff) throw new NotFoundError('Staff member not found');

    const assignments = await db.orm.public.StaffService.where({ staffId: staff.id }).all();
    const assignedServiceIds = new Set(assignments.map((assignment) => assignment.serviceId));
    if (serviceRows.some((service) => !assignedServiceIds.has(service.id))) {
      throw new BadRequestError('The selected staff member is not assigned to every selected service');
    }

    let available = staff.workStatus === 'ON_DUTY';
    const dayOfWeek = isoDayOfWeek(data.appointmentDate);
    const businessHour = await db.orm.public.BusinessHour.where({ dayOfWeek }).first();
    if (!businessHour || !businessHour.isOpen || !businessHour.openTime || !businessHour.closeTime ||
      data.startTime < businessHour.openTime || endTime > businessHour.closeTime) {
      available = false;
    }

    const schedules = await db.orm.public.StaffSchedule.where({ staffId: staff.id, dayOfWeek, isActive: true }).all();
    const dateValue = requestedDate.getTime();
    const hasMatchingSchedule = schedules.some((schedule) => {
      const scheduleEndDate = schedule.effectiveUntil ? dateString(schedule.effectiveUntil) : null;
      return dateString(schedule.effectiveFrom) <= data.appointmentDate &&
        (!scheduleEndDate || scheduleEndDate >= data.appointmentDate) &&
        data.startTime >= schedule.startTime && endTime <= schedule.endTime;
    });
    if (!hasMatchingSchedule || !Number.isFinite(dateValue)) available = false;

    const staffAppointments = await db.orm.public.Appointment.where({ staffId: staff.id }).all();
    const hasConflict = staffAppointments.some((appointment) => {
      if (appointment.appointmentDate.toISOString().slice(0, 10) !== data.appointmentDate) return false;
      if (appointment.status !== 'RESERVED' && appointment.status !== 'CONFIRMED') return false;
      return data.startTime < appointment.endTime && appointment.startTime < endTime;
    });
    if (hasConflict) available = false;

    return {
      appointmentDate: requestedDate,
      endTime,
      totalAmount: sumDecimalStrings(serviceRows.map((service) => service.price)),
      services: serviceRows,
      available,
    };
  }

  private static async assertCanView(
    appointment: { customerId: string; staffId: string | null },
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
      if (appointment.staffId !== staff.id) throw new ForbiddenError('You can only access appointments assigned to you');
      return;
    }
    throw new ForbiddenError('You do not have permission to access this appointment');
  }

  private static async mapAppointment(appointment: {
    id: string;
    appointmentCode: string;
    customerId: string;
    staffId: string | null;
    appointmentDate: Date;
    startTime: string;
    endTime: string;
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
      staffId: appointment.staffId,
      appointmentDate: dateString(appointment.appointmentDate),
      startTime: appointment.startTime,
      endTime: appointment.endTime,
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