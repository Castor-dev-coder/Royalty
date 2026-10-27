// Regression guard for the review-list pool exhaustion: enrichment runs a
// query chain per row, so an unbounded Promise.all fanned out N x ~5
// concurrent queries and exceeded the 15-session pooler cap (EMAXCONNSESSION).
// The list must bound that fan-out; this test watches real mock-ORM query
// concurrency through ReviewsService.list().
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { ReviewPhotosService } from './photos.service.js';

process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
const { ReviewsService } = await import('./reviews.service.js');

function makeHarness(rowCount = 6) {
  let active = 0;
  let peak = 0;
  // Sync queries return their rows immediately but stay "in flight" briefly,
  // so the counter measures real overlap between concurrent row chains.
  const trackSync = <T>(value: T): T => {
    active++;
    peak = Math.max(peak, active);
    setTimeout(() => { active--; }, 2);
    return value;
  };
  const trackAsync = async <T>(value: T): Promise<T> => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return value;
  };
  const reviews = Array.from({ length: rowCount }, (_, i) => ({
    id: `review-${i}`,
    appointmentId: `appt-${i}`,
    rating: 4,
    comment: `QA sample ${i}`,
    createdAt: new Date('2026-10-20T02:00:00Z'),
  }));
  return {
    reviews,
    peak: () => peak,
    install(context: { after: (fn: () => void) => void }) {
      const restore: Array<() => void> = [];
      const spy = <T extends object, K extends keyof T>(target: T, key: K, impl: unknown) => {
        const mocked = mock.method(target, key, impl as never);
        restore.push(() => mocked.mock.restore());
      };
      spy(db.orm.public.Review, 'where', () => ({
        aggregate: async () => trackAsync({ total: rowCount }),
        orderBy: () => ({
          offset: () => ({ limit: () => ({ all: () => trackSync(reviews) }) }),
        }),
      }));
      spy(db.orm.public.Appointment, 'where', () => ({
        first: async () => trackAsync({
          id: 'appt-x', appointmentCode: 'APT-00042', customerId: 'cust-1', staffId: 'staff-1',
          appointmentDate: new Date('2026-10-20T00:00:00Z'), startTime: '10:00', endTime: '11:00',
          totalAmount: '500', status: 'COMPLETED', createdAt: new Date(), updatedAt: new Date(),
        }),
      }));
      spy(db.orm.public.AppointmentService, 'where', () => ({
        all: () => trackSync([{ id: 'as-1', serviceId: 'svc-1', serviceName: 'QA Service', price: '500', durationMinutes: 60 }]),
      }));
      spy(db.orm.public.Staff, 'where', () => ({
        first: async () => trackAsync({ id: 'staff-1', firstName: 'Sam', lastName: 'Stylist', primaryRole: 'Stylist' }),
      }));
      spy(db.orm.public.ReviewRating, 'where', () => ({ all: () => trackSync([]) }));
      spy(ReviewPhotosService, 'visiblePhotos', async () => trackAsync([]));
      context.after(() => { for (const undo of restore) undo(); });
    },
  };
}

test('review listing bounds the per-row query fan-out (pool safety)', async (context) => {
  const harness = makeHarness(6);
  harness.install(context);
  const { reviews, total } = await ReviewsService.list({ page: 1, limit: 6 } as never);
  assert.equal(total, 6);
  assert.equal(reviews.length, 6);
  // Two bounded workers x at most 3 in-row queries = 6; the unbounded
  // Promise.all reached 18+ here and exhausted the pooler.
  assert.ok(harness.peak() <= 6, `expected peak <= 6 concurrent queries, saw ${harness.peak()}`);
  assert.ok(harness.peak() >= 2, 'the fan-out must still run rows in parallel');
});

test('a failing row query propagates instead of being swallowed', async (context) => {
  const harness = makeHarness(3);
  harness.install(context);
  mock.method(db.orm.public.ReviewRating, 'where', () => ({
    all: () => { throw new Error('connection lost'); },
  }));
  await assert.rejects(ReviewsService.list({ page: 1, limit: 3 } as never), /connection lost/);
});
