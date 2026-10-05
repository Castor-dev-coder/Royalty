import assert from 'node:assert/strict';
import test from 'node:test';
import { getReviewEligibility } from './reviews.rules.js';
import { createReviewSchema, reviewListQuerySchema } from './reviews.schemas.js';

const appointmentId = '00000000-0000-4000-8000-000000000001';

test('review request derives customer identity and validates 1-5 integer rating', () => {
  const valid = createReviewSchema.safeParse({ appointmentId, rating: 5, customerId: 'client-controlled' });
  assert.equal(valid.success, true);
  if (valid.success) assert.equal('customerId' in valid.data, false);
  assert.equal(createReviewSchema.safeParse({ appointmentId, rating: 0 }).success, false);
  assert.equal(createReviewSchema.safeParse({ appointmentId, rating: 6 }).success, false);
  assert.equal(createReviewSchema.safeParse({ appointmentId, rating: 4.5 }).success, false);
});

test('review creation eligibility requires ownership, completion, and no existing review', () => {
  assert.equal(getReviewEligibility('COMPLETED', true, false), 'ELIGIBLE');
  for (const status of ['RESERVED', 'CONFIRMED', 'CANCELLED', 'NO_SHOW']) {
    assert.equal(getReviewEligibility(status, true, false), 'NOT_COMPLETED');
  }
  assert.equal(getReviewEligibility('COMPLETED', false, false), 'NOT_OWNER');
  assert.equal(getReviewEligibility('COMPLETED', true, true), 'ALREADY_REVIEWED');
});

test('public review listing supports only valid rating filters', () => {
  assert.equal(reviewListQuerySchema.safeParse({ rating: '5' }).success, true);
  assert.equal(reviewListQuerySchema.safeParse({ rating: '0' }).success, false);
  assert.equal(reviewListQuerySchema.safeParse({ rating: '2.5' }).success, false);
});