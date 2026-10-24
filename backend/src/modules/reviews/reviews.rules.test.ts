import assert from 'node:assert/strict';
import test from 'node:test';
import {
  categoryRatingsFromRows,
  computeOverallRating,
  getReviewEligibility,
  legacyOverallRating,
  type ReviewEligibilityInput,
} from './reviews.rules.js';
import { createReviewSchema, reviewListQuerySchema } from './reviews.schemas.js';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const APPOINTMENT_ID = '33333333-3333-4333-8333-333333333333';
const EXISTING_REVIEW = { id: '44444444-4444-4444-8444-444444444444' };

function eligibleInput(overrides: Partial<ReviewEligibilityInput> = {}): ReviewEligibilityInput {
  return {
    appointmentStatus: 'COMPLETED',
    callerCustomerId: CUSTOMER_ID,
    appointmentOwnerId: CUSTOMER_ID,
    existingReview: null,
    ...overrides,
  };
}

test('eligible when completed, owned, and not yet reviewed', () => {
  assert.equal(getReviewEligibility(eligibleInput()), 'ELIGIBLE');
});

test('NOT_COMPLETED for every status other than the exact value COMPLETED', () => {
  for (const status of ['RESERVED', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'completed', '']) {
    assert.equal(
      getReviewEligibility(eligibleInput({ appointmentStatus: status })),
      'NOT_COMPLETED',
      `status ${JSON.stringify(status)} must be rejected`
    );
  }
});

test('NOT_OWNER when the caller does not own the appointment', () => {
  assert.equal(
    getReviewEligibility(eligibleInput({ appointmentOwnerId: OTHER_CUSTOMER_ID })),
    'NOT_OWNER'
  );
});

test('ALREADY_REVIEWED when the appointment already has a review', () => {
  assert.equal(getReviewEligibility(eligibleInput({ existingReview: EXISTING_REVIEW })), 'ALREADY_REVIEWED');
});

test('precedence: ownership is checked before status and duplicates', () => {
  assert.equal(
    getReviewEligibility(
      eligibleInput({
        appointmentOwnerId: OTHER_CUSTOMER_ID,
        appointmentStatus: 'CONFIRMED',
        existingReview: EXISTING_REVIEW,
      })
    ),
    'NOT_OWNER'
  );
});

test('precedence: status is checked before duplicates', () => {
  assert.equal(
    getReviewEligibility(eligibleInput({ appointmentStatus: 'CANCELLED', existingReview: EXISTING_REVIEW })),
    'NOT_COMPLETED'
  );
});

const RATINGS = { service: 4, products: 4, staff: 5, timeManagement: 5 };

test('create body is strict: four category ratings required, unknown keys rejected', () => {
  const valid = createReviewSchema.safeParse({
    appointmentId: APPOINTMENT_ID,
    ratings: RATINGS,
    comment: 'Great service',
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.deepEqual(valid.data, {
      appointmentId: APPOINTMENT_ID,
      ratings: RATINGS,
      comment: 'Great service',
    });
  }
  // Client-controlled identity (or any unknown key) is rejected, not stripped.
  assert.equal(
    createReviewSchema.safeParse({ appointmentId: APPOINTMENT_ID, ratings: RATINGS, customerId: 'client-controlled' }).success,
    false
  );
  // The old top-level-rating body is now an unknown key and must be rejected.
  assert.equal(createReviewSchema.safeParse({ appointmentId: APPOINTMENT_ID, rating: 5 }).success, false);
  // A missing category rating is rejected.
  assert.equal(
    createReviewSchema.safeParse({ appointmentId: APPOINTMENT_ID, ratings: { service: 5, products: 5, staff: 5 } }).success,
    false
  );
  // An extra key inside ratings is rejected.
  assert.equal(
    createReviewSchema.safeParse({ appointmentId: APPOINTMENT_ID, ratings: { ...RATINGS, ambiance: 5 } }).success,
    false
  );
});

test('each category rating must be an integer from 1 to 5', () => {
  assert.equal(createReviewSchema.safeParse({ appointmentId: APPOINTMENT_ID, ratings: RATINGS }).success, true);
  for (const value of [0, 6, 1.5]) {
    assert.equal(
      createReviewSchema.safeParse({ appointmentId: APPOINTMENT_ID, ratings: { ...RATINGS, service: value } }).success,
      false,
      `rating ${value} must be rejected`
    );
  }
});

test('comment is optional with a 2000 character maximum', () => {
  assert.equal(createReviewSchema.safeParse({ appointmentId: APPOINTMENT_ID, ratings: RATINGS }).success, true);
  assert.equal(
    createReviewSchema.safeParse({ appointmentId: APPOINTMENT_ID, ratings: RATINGS, comment: 'x'.repeat(2000) }).success,
    true
  );
  assert.equal(
    createReviewSchema.safeParse({ appointmentId: APPOINTMENT_ID, ratings: RATINGS, comment: 'x'.repeat(2001) }).success,
    false
  );
});

test('overall rating: average to one decimal, legacy overall rounded', () => {
  assert.equal(computeOverallRating(RATINGS), 4.5);
  assert.equal(computeOverallRating({ service: 1, products: 2, staff: 3, timeManagement: 4 }), 2.5);
  assert.equal(legacyOverallRating(RATINGS), 5);
  assert.equal(legacyOverallRating({ service: 1, products: 2, staff: 3, timeManagement: 4 }), 3);
});

test('category rows map back to ratings only when all four exist', () => {
  const rows = [
    { category: 'SERVICE', rating: 4 },
    { category: 'PRODUCTS', rating: 4 },
    { category: 'STAFF', rating: 5 },
    { category: 'TIME_MANAGEMENT', rating: 5 },
  ];
  assert.deepEqual(categoryRatingsFromRows(rows), RATINGS);
  assert.equal(categoryRatingsFromRows(rows.slice(0, 3)), null);
  assert.equal(categoryRatingsFromRows([...rows.slice(0, 3), { category: 'AMBIANCE', rating: 5 }]), null);
});

test('public review listing supports only valid rating filters', () => {
  assert.equal(reviewListQuerySchema.safeParse({ rating: '5' }).success, true);
  assert.equal(reviewListQuerySchema.safeParse({ rating: '0' }).success, false);
  assert.equal(reviewListQuerySchema.safeParse({ rating: '2.5' }).success, false);
});
