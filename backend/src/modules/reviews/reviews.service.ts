import { db } from '../../prisma/db.js';
import { staffIdOf } from '../../prisma/contract-compat.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js';
import { fromPrismaDateString, fromPrismaTime } from '../../utils/date-time.js';
import { mapWithConcurrency } from '../../utils/concurrency.js';
import {
  categoryRatingsFromRows,
  computeOverallRating,
  getReviewEligibility,
  legacyOverallRating,
  REVIEW_CATEGORY_ENUM,
  REVIEW_CATEGORY_KEYS,
  type CategoryRatings,
} from './reviews.rules.js';
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
  /** Display overall: computed category average, or the grandfathered legacy rating. */
  overallRating: number;
  /** Four category ratings, or null for grandfathered reviews (overall-only). */
  ratings: CategoryRatings | null;
  comment: string | null;
  /** Visible photos only: { position, url }. Hidden photos never appear. */
  photos: Array<{ position: number; url: string }>;
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

import { ReviewPhotosService } from './photos.service.js'

export class ReviewsService {
  static async create(input: CreateReviewInput, requestingAccountId: string): Promise<ReviewInfo> {
    const customer = await db.orm.public.Customer.where({ accountId: requestingAccountId }).first();
    if (!customer) throw new NotFoundError('No customer profile found for this account');

    const appointment = await db.orm.public.Appointment.where({ id: input.appointmentId }).first();
    if (!appointment) throw new NotFoundError('Appointment not found');

    const existing = await db.orm.public.Review.where({ appointmentId: appointment.id }).first();
    const eligibility = getReviewEligibility({
      appointmentStatus: appointment.status,
      callerCustomerId: customer.id,
      appointmentOwnerId: appointment.customerId,
      existingReview: existing,
    });
    if (eligibility === 'NOT_OWNER') throw new ForbiddenError('You can only review your own appointments');
    if (eligibility === 'NOT_COMPLETED') throw new ConflictError('Only completed appointments can be reviewed');
    if (eligibility === 'ALREADY_REVIEWED') throw new ConflictError('This appointment has already been reviewed');

    let review;
    try {
      // One transaction: the review row and its four category rating rows commit
      // or roll back together. The unique-violation mapping below runs OUTSIDE
      // this failed transaction so a race still becomes a clean 409.
      review = await db.transaction(async (tx) => {
        const created = await tx.orm.public.Review.create({
          appointmentId: appointment.id,
          customerId: customer.id,
          // DEPRECATED (G-07): legacy overall kept for compatibility with the
          // non-null reviews.rating column — Math.round of the four-rating average.
          rating: legacyOverallRating(input.ratings),
          comment: input.comment ?? null,
        });
        for (const key of REVIEW_CATEGORY_KEYS) {
          await tx.orm.public.ReviewRating.create({
            reviewId: created.id,
            category: REVIEW_CATEGORY_ENUM[key],
            rating: input.ratings[key],
          });
        }
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('This appointment has already been reviewed');
      throw error;
    }

    return this.mapReview(review);
  }

  static async list(query: ReviewListQuery): Promise<{ reviews: ReviewInfo[]; total: number; ratingCounts: Record<1 | 2 | 3 | 4 | 5, number> }> {
    const totalResult = await (query.rating === undefined
      ? db.orm.public.Review.where({})
      : db.orm.public.Review.where({ rating: query.rating }))
      .aggregate((aggregate) => ({ total: aggregate.count() }));
    const total = typeof totalResult.total === 'number' ? totalResult.total : 0;
    // Full-dataset star distribution (every review, not the current page):
    // five bounded count queries over the integer star column.
    const starEntries = await Promise.all(
      ([5, 4, 3, 2, 1] as const).map(async (star) => {
        const result = await db.orm.public.Review.where({ rating: star })
          .aggregate((aggregate) => ({ total: aggregate.count() }));
        return [star, typeof result.total === 'number' ? result.total : 0] as const;
      }),
    );
    const ratingCounts = Object.fromEntries(starEntries) as Record<1 | 2 | 3 | 4 | 5, number>;
    const ordered = (query.rating === undefined
      ? db.orm.public.Review.where({})
      : db.orm.public.Review.where({ rating: query.rating }))
      .orderBy((review) => review.createdAt.desc());
    const queryRecords = ordered.offset((query.page - 1) * query.limit).limit(query.limit).all() as
      Iterable<ReviewRecord> | AsyncIterable<ReviewRecord>;
    const records = await collect(queryRecords);
    // Bounded fan-out: each mapReview runs ~5 queries, so N parallel rows
    // would exhaust the shared connection pool (hard cap: 15 sessions).
    const reviews = await mapWithConcurrency(records, 2, (review) => this.mapReview(review));
    return { reviews, total, ratingCounts };
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
    const appointmentStaffId = staffIdOf(appointment);
    const [serviceRows, staff, ratingRows] = await Promise.all([
      db.orm.public.AppointmentService.where({ appointmentId: appointment.id }).all(),
      appointmentStaffId ? db.orm.public.Staff.where({ id: appointmentStaffId }).first() : Promise.resolve(null),
      db.orm.public.ReviewRating.where({ reviewId: review.id }).all(),
    ]);
    const ratings = categoryRatingsFromRows(ratingRows.map((row) => ({ category: row.category, rating: row.rating })));
    const photos = await ReviewPhotosService.visiblePhotos(String(review.id));

    return {
      id: review.id,
      rating: review.rating,
      overallRating: ratings ? computeOverallRating(ratings) : review.rating,
      ratings,
      comment: review.comment,
      photos,
      createdAt: review.createdAt,
      appointment: {
        id: appointment.id,
        appointmentCode: appointment.appointmentCode,
        appointmentDate: fromPrismaDateString(appointment.appointmentDate),
        startTime: fromPrismaTime(appointment.startTime),
        endTime: fromPrismaTime(appointment.endTime),
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