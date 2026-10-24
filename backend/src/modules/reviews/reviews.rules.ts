// Pure review-eligibility rules for visit-level reviews. No I/O here: the
// service layer gathers the facts and maps the result to HTTP errors.

export type ReviewRejectionReason = 'NOT_OWNER' | 'NOT_COMPLETED' | 'ALREADY_REVIEWED';

export type ReviewEligibility = 'ELIGIBLE' | ReviewRejectionReason;

export const REVIEW_CATEGORY_KEYS = ['service', 'products', 'staff', 'timeManagement'] as const;
export type ReviewCategoryKey = (typeof REVIEW_CATEGORY_KEYS)[number];

/** Request keys → review_rating_category enum values. */
export const REVIEW_CATEGORY_ENUM = {
  service: 'SERVICE',
  products: 'PRODUCTS',
  staff: 'STAFF',
  timeManagement: 'TIME_MANAGEMENT',
} as const;

export type CategoryRatings = Record<ReviewCategoryKey, number>;

export interface ReviewEligibilityInput {
  /** Appointment status; only the exact value 'COMPLETED' is reviewable. */
  appointmentStatus: string;
  /** Customer id of the caller (derived from the authenticated token). */
  callerCustomerId: string;
  /** Customer id that owns the appointment. */
  appointmentOwnerId: string;
  /** Existing review for this appointment, if any. */
  existingReview: { id: string } | null;
}

/**
 * Rejection precedence (first failure wins): ownership, then status, then
 * duplicates — so a caller never learns anything about an appointment they
 * do not own. The reviews_appointment_id_key unique constraint is the final
 * duplicate guard under concurrency.
 */
export function getReviewEligibility(input: ReviewEligibilityInput): ReviewEligibility {
  if (input.callerCustomerId !== input.appointmentOwnerId) return 'NOT_OWNER';
  if (input.appointmentStatus !== 'COMPLETED') return 'NOT_COMPLETED';
  if (input.existingReview != null) return 'ALREADY_REVIEWED';
  return 'ELIGIBLE';
}

/** Display overall: average of the four category ratings, to one decimal place. */
export function computeOverallRating(ratings: CategoryRatings): number {
  const total = ratings.service + ratings.products + ratings.staff + ratings.timeManagement;
  return Math.round((total / 4) * 10) / 10;
}

/**
 * Deprecated legacy value for reviews.rating (G-07): rounded average of the
 * four category ratings, kept only for compatibility with the non-null column.
 */
export function legacyOverallRating(ratings: CategoryRatings): number {
  const total = ratings.service + ratings.products + ratings.staff + ratings.timeManagement;
  return Math.round(total / 4);
}

/** Maps review_ratings rows (category enum + rating) to the request-shaped object. */
export function categoryRatingsFromRows(
  rows: ReadonlyArray<{ category: string; rating: number }>
): CategoryRatings | null {
  if (rows.length !== 4) return null;
  const byEnum = new Map(rows.map((row) => [row.category, row.rating]));
  const ratings = {} as CategoryRatings;
  for (const key of REVIEW_CATEGORY_KEYS) {
    const value = byEnum.get(REVIEW_CATEGORY_ENUM[key]);
    if (value === undefined) return null;
    ratings[key] = value;
  }
  return ratings;
}
