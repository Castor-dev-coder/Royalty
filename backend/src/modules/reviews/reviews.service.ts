import { db } from '../../prisma/db.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js';
import { dateString } from '../appointments/appointments.rules.js';
import { getReviewEligibility } from './reviews.rules.js';
import type { CreateReviewInput, ReviewListQuery } from './reviews.schemas.js';

interface ReviewRecord {
  id: string;
  appointmentId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface ReviewInfo {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  appointment: {
    id: string;
    appointmentCode: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    totalAmount: number;
    services: Array<{
      id: string;
      serviceId: string;
      serviceName: string;
      price: number;
      durationMinutes: number;
    }>;
    staff: { id: string; firstName: string; lastName: string; primaryRole: string } | null;
  };
}

async function collect<T>(records: AsyncIterable<T> | Iterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}

function decimalNumber(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new BadRequestError('A stored appointment amount is invalid');
  return result;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return ['P2002', '23505'].includes(String(error.code));
}

export class ReviewsService {
  static async create(input: CreateReviewInput, requestingAccountId: string): Promise<ReviewInfo> {
    const customer = await db.orm.public.Customer.where({ accountId: requestingAccountId }).first();
    if (!customer) throw new NotFoundError('No customer profile found for this account');

    const appointment = await db.orm.public.Appointment.where({ id: input.appointmentId }).first();
    if (!appointment) throw new NotFoundError('Appointment not found');

    const existing = await db.orm.public.Review.where({ appointmentId: appointment.id }).first();
    const eligibility = getReviewEligibility(
      appointment.status,
      appointment.customerId === customer.id,
      existing != null
    );
    if (eligibility === 'NOT_OWNER') throw new ForbiddenError('You can only review your own appointments');
    if (eligibility === 'NOT_COMPLETED') throw new ConflictError('Only completed appointments can be reviewed');
    if (eligibility === 'ALREADY_REVIEWED') throw new ConflictError('This appointment has already been reviewed');

    let review;
    try {
      review = await db.orm.public.Review.create({
        appointmentId: appointment.id,
        customerId: customer.id,
        rating: input.rating,
        comment: input.comment ?? null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('This appointment has already been reviewed');
      throw error;
    }

    return this.mapReview(review);
  }

  static async list(query: ReviewListQuery): Promise<{ reviews: ReviewInfo[]; total: number }> {
    const reviewQuery = query.rating === undefined
      ? db.orm.public.Review.where({})
      : db.orm.public.Review.where({ rating: query.rating });
    const totalResult = await reviewQuery.count();
    const total = typeof totalResult === 'number' ? totalResult : 0;
    const ordered = (query.rating === undefined
      ? db.orm.public.Review.where({})
      : db.orm.public.Review.where({ rating: query.rating }))
      .orderBy((review) => review.createdAt.desc());
    // @ts-expect-error - Prisma 8 RC types omit supported skip/take methods on ordered collections
    const queryRecords = ordered.skip((query.page - 1) * query.limit).take(query.limit).all() as
      Iterable<ReviewRecord> | AsyncIterable<ReviewRecord>;
    const records = await collect(queryRecords);
    const reviews = await Promise.all(records.map((review) => this.mapReview(review)));
    return { reviews, total };
  }

  private static async mapReview(review: {
    id: string;
    appointmentId: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
  }): Promise<ReviewInfo> {
    const appointment = await db.orm.public.Appointment.where({ id: review.appointmentId }).first();
    if (!appointment) throw new NotFoundError('Review appointment not found');
    const [serviceRows, staff] = await Promise.all([
      db.orm.public.AppointmentService.where({ appointmentId: appointment.id }).all(),
      appointment.staffId ? db.orm.public.Staff.where({ id: appointment.staffId }).first() : Promise.resolve(null),
    ]);

    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      appointment: {
        id: appointment.id,
        appointmentCode: appointment.appointmentCode,
        appointmentDate: dateString(appointment.appointmentDate),
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        totalAmount: decimalNumber(appointment.totalAmount),
        services: serviceRows.map((service) => ({
          id: service.id,
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          price: decimalNumber(service.price),
          durationMinutes: service.durationMinutes,
        })),
        staff: staff ? {
          id: staff.id,
          firstName: staff.firstName,
          lastName: staff.lastName,
          primaryRole: staff.primaryRole,
        } : null,
      },
    };
  }
}