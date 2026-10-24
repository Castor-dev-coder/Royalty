import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { ReviewsService } from './reviews.service.js';

test('review service uses the authenticated customer and returns safe appointment details', async (context) => {
  const appointmentId = '00000000-0000-4000-8000-000000000001';
  const customer = { id: 'customer-own' };
  const appointment = {
    id: appointmentId,
    customerId: customer.id,
    status: 'COMPLETED',
    appointmentCode: 'APT-TEST',
    appointmentDate: new Date('2099-01-01T00:00:00.000Z'),
    startTime: '09:00',
    endTime: '10:00',
    totalAmount: '25.00',
    staffId: null,
  };
  const customerWhere = mock.method(db.orm.public.Customer, 'where', () => ({ first: async () => customer }));
  const appointmentWhere = mock.method(db.orm.public.Appointment, 'where', () => ({ first: async () => appointment }));
  const reviewWhere = mock.method(db.orm.public.Review, 'where', () => ({ first: async () => null }));
  const reviewInputs: Array<{ appointmentId: string; customerId: string; rating: number; comment: string | null }> = [];
  const reviewCreate = mock.method(db.orm.public.Review, 'create', async (input: typeof reviewInputs[number]) => {
    reviewInputs.push(input);
    return { id: 'review-1', ...input, createdAt: new Date('2099-01-02T00:00:00.000Z') };
  });
  const ratingInputs: Array<{ reviewId: string; category: string; rating: number }> = [];
  const ratingCreate = mock.method(db.orm.public.ReviewRating, 'create', async (input: typeof ratingInputs[number]) => {
    ratingInputs.push(input);
    return { id: `rating-${ratingInputs.length}`, ...input };
  });
  const ratingWhere = mock.method(db.orm.public.ReviewRating, 'where', () => ({
    all: async () => ratingInputs.map((row, index) => ({ id: `rating-${index + 1}`, ...row })),
  }));
  const transaction = mock.method(db, 'transaction', (fn: (tx: unknown) => Promise<unknown>) => fn({ orm: db.orm }));
  const appointmentServicesWhere = mock.method(db.orm.public.AppointmentService, 'where', () => ({ all: async () => [] }));

  context.after(() => {
    customerWhere.mock.restore();
    appointmentWhere.mock.restore();
    reviewWhere.mock.restore();
    reviewCreate.mock.restore();
    ratingCreate.mock.restore();
    ratingWhere.mock.restore();
    transaction.mock.restore();
    appointmentServicesWhere.mock.restore();
  });

  const result = await ReviewsService.create(
    { appointmentId, ratings: { service: 4, products: 4, staff: 5, timeManagement: 5 }, comment: 'Solid work' },
    'authenticated-account'
  );
  assert.equal(transaction.mock.callCount(), 1, 'review and ratings must go through one transaction');
  assert.equal(reviewInputs[0]?.customerId, customer.id);
  // reviews.rating is required, so the deprecated overall is the rounded average (4.5 -> 5).
  assert.equal(reviewInputs[0]?.rating, 5);
  assert.equal(reviewInputs[0]?.comment, 'Solid work');
  assert.deepEqual(
    ratingInputs.map((row) => [row.reviewId, row.category, row.rating]),
    [
      ['review-1', 'SERVICE', 4],
      ['review-1', 'PRODUCTS', 4],
      ['review-1', 'STAFF', 5],
      ['review-1', 'TIME_MANAGEMENT', 5],
    ]
  );
  assert.equal(result.overallRating, 4.5);
  assert.deepEqual(result.ratings, { service: 4, products: 4, staff: 5, timeManagement: 5 });
  assert.equal(result.appointment.appointmentCode, 'APT-TEST');
  assert.equal(result.appointment.totalAmount, 25);
  assert.equal('customerId' in result, false);
});