import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { after, before, test } from 'node:test';

// Deterministic, DB-free environment: a dummy connection string (never used —
// the ORM is replaced with a fake below), development mode so error bodies
// include details, and random JWT secrets for signing real test tokens.
process.env.DATABASE_URL = 'postgres://route-test:route-test@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { reviewsRouter }, { appointmentsRouter }, { errorHandler, notFoundHandler }, { createAccessToken }] =
  await Promise.all([
    import('../prisma/db.js'),
    import('./reviews.js'),
    import('./appointments.js'),
    import('../middleware/error.js'),
    import('../lib/jwt.js'),
  ]);

const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_ACCOUNT_ID = '66666666-6666-4666-8666-666666666666';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const APPOINTMENT_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_APPOINTMENT_ID = '33333333-3333-4333-8333-333333333334';

const customerToken = createAccessToken({ sub: ACCOUNT_ID, email: 'customer@example.com', role: 'CUSTOMER' });
const managerToken = createAccessToken({ sub: OTHER_ACCOUNT_ID, email: 'manager@example.com', role: 'MANAGER' });

const RATINGS = { service: 4, products: 4, staff: 5, timeManagement: 5 };

interface RatingRow {
  id?: string;
  reviewId: string;
  category: string;
  rating: number;
}

interface FakeData {
  customer?: { id: string } | null;
  appointment?: Record<string, unknown> | null;
  appointments?: Array<Record<string, unknown>>;
  servicesByAppointment?: Record<string, Array<Record<string, unknown>>>;
  reviews?: Array<Record<string, unknown>>;
  ratingRows?: RatingRow[];
  createError?: unknown;
  failRatingOnCall?: number;
}

// Committed rows vs transaction buffer: rows written inside db.transaction are
// published only when the callback resolves — a mid-transaction throw discards
// them, which is the rollback semantics under test.
const store: { reviews: Array<Record<string, unknown>>; ratings: RatingRow[] } = { reviews: [], ratings: [] };
let buffer: { reviews: Array<Record<string, unknown>>; ratings: RatingRow[] } | null = null;
let ratingCreateCalls = 0;

function sink() {
  return buffer ?? store;
}

function appointmentFixture(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    appointmentCode: `APT-${id.slice(0, 6)}`,
    appointmentDate: new Date('2026-10-24T00:00:00Z'),
    startTime: '11:00',
    endTime: '12:00',
    totalAmount: '800.00',
    customerId: CUSTOMER_ID,
    status: 'COMPLETED',
    staffId: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

function allReviews(data: FakeData): Array<Record<string, unknown>> {
  return [...(data.reviews ?? []), ...store.reviews];
}

function allRatingRows(data: FakeData): RatingRow[] {
  return [...(data.ratingRows ?? []), ...store.ratings];
}

function installFakeOrm(data: FakeData): FakeData {
  store.reviews = [];
  store.ratings = [];
  buffer = null;
  ratingCreateCalls = 0;
  const services = data.servicesByAppointment ?? {
    [APPOINTMENT_ID]: [
      { id: 'apptsrv-1', serviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', serviceName: 'Classic Haircut', price: 800, durationMinutes: 45 },
    ],
  };
  const publicSchema = {
    Customer: {
      where: (query: Record<string, unknown>) => ({
        first: async () => ('customer' in data ? data.customer : { id: CUSTOMER_ID }),
      }),
    },
    Appointment: {
      where: (query: Record<string, unknown>) => ({
        first: async () => data.appointment ?? appointmentFixture(APPOINTMENT_ID),
        aggregate: async (fn: (a: { count: () => number }) => { total: number }) =>
          fn({ count: () => (data.appointments ?? []).length }),
        orderBy: () => ({ offset: () => ({ limit: () => ({ all: async () => data.appointments ?? [] }) }) }),
      }),
    },
    AppointmentService: {
      where: (query: Record<string, unknown>) => ({ all: async () => services[String(query.appointmentId)] ?? [] }),
    },
    Review: {
      where: (query: Record<string, unknown>) => {
        const rows = () => allReviews(data);
        return {
          first: async () => rows().find((r) => r['appointmentId'] === query['appointmentId']) ?? null,
          aggregate: async (fn: (a: { count: () => number }) => { total: number }) => fn({ count: () => rows().length }),
          orderBy: () => ({ offset: () => ({ limit: () => ({ all: () => rows() }) }) }),
        };
      },
      create: async (input: Record<string, unknown>) => {
        if (data.createError) throw data.createError;
        const row = { id: `rev-${store.reviews.length + 1}`, ...input, createdAt: new Date('2026-10-24T12:00:00Z') };
        sink().reviews.push(row);
        return row;
      },
    },
    ReviewRating: {
      where: (query: Record<string, unknown>) => ({
        all: async () => allRatingRows(data).filter((row) => row.reviewId === query['reviewId']),
      }),
      create: async (input: RatingRow) => {
        ratingCreateCalls += 1;
        if (data.failRatingOnCall === ratingCreateCalls) throw new Error('injected rating insert failure');
        sink().ratings.push(input);
        return { id: `rr-${ratingCreateCalls}`, ...input };
      },
    },
    ReviewPhoto: { where: () => ({ all: async () => [] }) },
    Staff: { where: () => ({ first: async () => null }) },
  };
  (db as unknown as { orm: unknown }).orm = { public: publicSchema };
  (db as unknown as { transaction: unknown }).transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    buffer = { reviews: [], ratings: [] };
    try {
      const result = await fn({ orm: { public: publicSchema } });
      store.reviews.push(...buffer.reviews);
      store.ratings.push(...buffer.ratings);
      return result;
    } finally {
      buffer = null;
    }
  };
  return data;
}

let server: http.Server;
let baseUrl = '';

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/reviews', reviewsRouter);
  app.use('/appointments', appointmentsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

async function postJson(path: string, body: unknown, token?: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function getJson(path: string, token?: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: response.status, body: await response.json() };
}

const validBody = { appointmentId: APPOINTMENT_ID, ratings: RATINGS, comment: 'Great service' };

test('creates the review and four category ratings in one transaction', async () => {
  installFakeOrm({});
  const { status, body } = await postJson('/reviews', validBody, customerToken);

  assert.equal(status, 201);
  const review = body.data.review;
  // Legacy reviews.rating holds the rounded average (4.5 -> 5); display overall is 4.5.
  assert.equal(review.rating, 5);
  assert.equal(review.overallRating, 4.5);
  assert.deepEqual(review.ratings, RATINGS);
  assert.deepEqual(store.reviews.map((r) => [r['appointmentId'], r['customerId'], r['rating'], r['comment']]), [
    [APPOINTMENT_ID, CUSTOMER_ID, 5, 'Great service'],
  ]);
  assert.deepEqual(
    store.ratings.map((r) => [r.reviewId, r.category, r.rating]),
    [
      ['rev-1', 'SERVICE', 4],
      ['rev-1', 'PRODUCTS', 4],
      ['rev-1', 'STAFF', 5],
      ['rev-1', 'TIME_MANAGEMENT', 5],
    ]
  );
});

test('a failure on the third rating insert rolls back the review row', async () => {
  installFakeOrm({ failRatingOnCall: 3 });
  const { status } = await postJson('/reviews', validBody, customerToken);

  assert.equal(status, 500);
  assert.equal(store.reviews.length, 0, 'no review row may survive the failed transaction');
  assert.equal(store.ratings.length, 0, 'no rating rows may survive the failed transaction');
});

for (const [label, body] of [
  ['old top-level rating body', { appointmentId: APPOINTMENT_ID, rating: 5 }],
  ['missing one category rating', { appointmentId: APPOINTMENT_ID, ratings: { service: 5, products: 5, staff: 5 } }],
  ['extra category key', { appointmentId: APPOINTMENT_ID, ratings: { ...RATINGS, ambiance: 5 } }],
  ['rating zero', { appointmentId: APPOINTMENT_ID, ratings: { ...RATINGS, service: 0 } }],
  ['rating six', { appointmentId: APPOINTMENT_ID, ratings: { ...RATINGS, service: 6 } }],
  ['rating 1.5', { appointmentId: APPOINTMENT_ID, ratings: { ...RATINGS, service: 1.5 } }],
] as const) {
  test(`rejects ${label} with 400`, async () => {
    installFakeOrm({});
    const { status, body: res } = await postJson('/reviews', body, customerToken);
    assert.equal(status, 400);
    assert.equal(res.error.code, 'BAD_REQUEST');
    assert.equal(res.error.message, 'Validation failed');
  });
}

test('rejects a comment over the 2000 character limit with 400', async () => {
  installFakeOrm({});
  const { status, body } = await postJson('/reviews', { ...validBody, comment: 'x'.repeat(2001) }, customerToken);
  assert.equal(status, 400);
  assert.ok((body.error.details ?? []).some((d: { path: string }) => d.path === 'comment'));
});

test('rejects a duplicate review for the appointment with 409', async () => {
  installFakeOrm({ reviews: [{ id: 'review-existing', appointmentId: APPOINTMENT_ID, customerId: CUSTOMER_ID, rating: 5, comment: null }] });
  const { status, body } = await postJson('/reviews', validBody, customerToken);
  assert.equal(status, 409);
  assert.equal(body.error.code, 'CONFLICT');
  assert.equal(body.error.message, 'This appointment has already been reviewed');
});

test('maps a unique-constraint race to 409 outside the failed transaction', async () => {
  installFakeOrm({ createError: { code: 'P2002' } });
  const { status, body } = await postJson('/reviews', validBody, customerToken);
  assert.equal(status, 409);
  assert.equal(body.error.code, 'CONFLICT');
  assert.equal(body.error.message, 'This appointment has already been reviewed');
  assert.equal(store.reviews.length, 0);
});

test('rejects a review of a non-completed appointment with 409', async () => {
  installFakeOrm({ appointment: appointmentFixture(APPOINTMENT_ID, { status: 'CONFIRMED' }) });
  const { status, body } = await postJson('/reviews', validBody, customerToken);
  assert.equal(status, 409);
  assert.equal(body.error.message, 'Only completed appointments can be reviewed');
});

test('rejects a review by a non-owner with 403', async () => {
  installFakeOrm({ appointment: appointmentFixture(APPOINTMENT_ID, { customerId: OTHER_CUSTOMER_ID }) });
  const { status, body } = await postJson('/reviews', validBody, customerToken);
  assert.equal(status, 403);
  assert.equal(body.error.message, 'You can only review your own appointments');
});

test('rejects an unauthenticated request with 401', async () => {
  installFakeOrm({});
  const { status, body } = await postJson('/reviews', validBody);
  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('rejects a non-CUSTOMER role with the existing requireRole status (401, by design)', async () => {
  installFakeOrm({});
  const { status, body } = await postJson('/reviews', validBody, managerToken);
  assert.equal(status, 401);
  assert.match(body.error.message, /Required roles: CUSTOMER/);
});

test('GET /reviews computes the overall from four category rows', async () => {
  installFakeOrm({
    reviews: [{ id: 'rev-new', appointmentId: APPOINTMENT_ID, customerId: CUSTOMER_ID, rating: 5, comment: 'Great', createdAt: new Date('2026-10-24T12:00:00Z') }],
    ratingRows: [
      { reviewId: 'rev-new', category: 'SERVICE', rating: 4 },
      { reviewId: 'rev-new', category: 'PRODUCTS', rating: 4 },
      { reviewId: 'rev-new', category: 'STAFF', rating: 5 },
      { reviewId: 'rev-new', category: 'TIME_MANAGEMENT', rating: 5 },
    ],
  });
  const { status, body } = await getJson('/reviews?page=1&limit=20');
  assert.equal(status, 200);
  const review = body.data.reviews.find((r: any) => r.id === 'rev-new');
  assert.equal(review.overallRating, 4.5);
  assert.deepEqual(review.ratings, RATINGS);
});

test('GET /reviews falls back to the legacy rating for a grandfathered review', async () => {
  installFakeOrm({
    reviews: [{ id: 'rev-legacy', appointmentId: APPOINTMENT_ID, customerId: CUSTOMER_ID, rating: 5, comment: 'Old review', createdAt: new Date('2025-01-01T12:00:00Z') }],
    ratingRows: [],
  });
  const { status, body } = await getJson('/reviews?page=1&limit=20');
  assert.equal(status, 200);
  const review = body.data.reviews.find((r: any) => r.id === 'rev-legacy');
  assert.equal(review.overallRating, 5);
  assert.equal(review.ratings, null);
  assert.equal(review.rating, 5);
});

test('GET /appointments/mine returns the review with overall, categories, and comment', async () => {
  installFakeOrm({
    appointments: [appointmentFixture(APPOINTMENT_ID), appointmentFixture(SECOND_APPOINTMENT_ID, { status: 'CONFIRMED' })],
    reviews: [
      { id: 'rev-mine', appointmentId: SECOND_APPOINTMENT_ID, customerId: CUSTOMER_ID, rating: 4, comment: 'Lovely' },
    ],
    ratingRows: [
      { reviewId: 'rev-mine', category: 'SERVICE', rating: 3 },
      { reviewId: 'rev-mine', category: 'PRODUCTS', rating: 4 },
      { reviewId: 'rev-mine', category: 'STAFF', rating: 4 },
      { reviewId: 'rev-mine', category: 'TIME_MANAGEMENT', rating: 4 },
    ],
  });
  const { status, body } = await getJson('/appointments/mine?page=1&limit=20', customerToken);
  assert.equal(status, 200);
  const [first, second] = body.data.appointments;
  assert.equal(first.alreadyReviewed, false);
  assert.equal(first.review, null);
  assert.equal(second.alreadyReviewed, true);
  assert.equal(second.review.overallRating, 3.8);
  assert.deepEqual(second.review.ratings, { service: 3, products: 4, staff: 4, timeManagement: 4 });
  assert.equal(second.review.comment, 'Lovely');
});

test('the /mine route precedes the parameterized /:id route', () => {
  interface RouterLayer {
    route?: { path: string; methods: Record<string, boolean> };
  }
  const stack = (appointmentsRouter as unknown as { stack: RouterLayer[] }).stack;
  const index = (path: string) =>
    stack.findIndex((layer) => layer.route?.path === path && layer.route.methods['get']);
  assert.ok(index('/mine') > -1 && index('/mine') < index('/:id'));
});
