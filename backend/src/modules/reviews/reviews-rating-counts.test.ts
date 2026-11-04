// The review list returns the full-dataset star distribution: the aggregate
// covers every review (not the current page) and the bucket counts always sum
// to the review total, including empty buckets and the no-reviews case.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { ReviewPhotosService } from './photos.service.js';

process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
const { ReviewsService } = await import('./reviews.service.js');

function install(context: { after: (fn: () => void) => void }, starTotals: Record<string, number>, rows: Array<Record<string, unknown>>) {
  const restore: Array<() => void> = [];
  const spy = <T extends object, K extends keyof T>(target: T, key: K, impl: unknown) => {
    const mocked = mock.method(target, key, impl as never);
    restore.push(() => mocked.mock.restore());
  };
  context.after(() => { for (const undo of restore) undo(); });
  const grandTotal = Object.values(starTotals).reduce((a, b) => a + b, 0);
  spy(db.orm.public.Review, 'where', (args: { rating?: number } = {}) => ({
    aggregate: async () => ({ total: args.rating === undefined ? grandTotal : (starTotals[String(args.rating)] ?? 0) }),
    orderBy: () => ({ offset: () => ({ limit: () => ({ all: () => rows }) }) }),
  }));
  spy(db.orm.public.Appointment, 'where', () => ({
    first: async () => ({
      id: 'appt-1', appointmentCode: 'APT-00042', customerId: 'cust-1', staffId: 'staff-1',
      appointmentDate: new Date('2026-10-20T00:00:00Z'), startTime: '10:00', endTime: '11:00',
      totalAmount: '500', status: 'COMPLETED', createdAt: new Date(), updatedAt: new Date(),
    }),
  }));
  spy(db.orm.public.AppointmentService, 'where', () => ({
    all: () => [{ id: 'as-1', serviceId: 'svc-1', serviceName: 'QA Service', price: '500', durationMinutes: 60 }],
  }));
  spy(db.orm.public.Staff, 'where', () => ({
    first: async () => ({ id: 'staff-1', firstName: 'Sam', lastName: 'Stylist', primaryRole: 'Stylist' }),
  }));
  spy(db.orm.public.ReviewRating, 'where', () => ({ all: () => [] }));
  spy(ReviewPhotosService, 'visiblePhotos', async () => []);
}

test('review list returns the full-dataset rating distribution', async (context) => {
  const rows = [{ id: 'r1', appointmentId: 'appt-1', rating: 5, comment: 'QA sample', createdAt: new Date() }];
  install(context, { '5': 2, '4': 1, '3': 0, '2': 0, '1': 0 }, rows);
  const result = await ReviewsService.list({ page: 1, limit: 10 } as never);
  assert.equal(result.total, 3);
  assert.deepEqual(result.ratingCounts, { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 });
  // The counts describe the same population as the total.
  const sum = Object.values(result.ratingCounts).reduce((a, b) => a + b, 0);
  assert.equal(sum, result.total);
});

test('review list returns zeroed buckets for a dataset without reviews', async (context) => {
  install(context, { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 }, []);
  const result = await ReviewsService.list({ page: 1, limit: 10 } as never);
  assert.equal(result.total, 0);
  assert.deepEqual(result.ratingCounts, { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
});
