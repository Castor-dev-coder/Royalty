import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from './helpers/server.js';
import { request } from './helpers/http.js';
import { login } from './helpers/auth.js';
import { cleanupTestRecords, countScopedRecords, type ScopeMarker } from './helpers/cleanup.js';
import {
  buildScopeMarker,
  generateRunId,
  runSafetyGate,
  formatSafetyReport,
  SEED_IDS,
  SEED_APPOINTMENT_CODES,
} from './helpers/safety.js';
import { pgNumeric, pgVarchar } from '../../prisma/contract-compat.js';
import { toPlainDate, toPlainTime } from '../../utils/date-time.js';
import { db } from '../../prisma/db.js';

const SEED_CUSTOMER_EMAIL = 'customer@seed.royalty.local';
const SEED_STAFF_EMAIL = 'staff@seed.royalty.local';
const SEED_ADMIN_EMAIL = 'admin@seed.royalty.local';

const SCOPE: ScopeMarker = buildScopeMarker('5f', 'reviews', generateRunId(), 'REV');
const TEST_EMAIL = `test+${SCOPE.emailToken}@test.royalty.local`;
const TEST_PASSWORD = 'TestPassword123!';
/** varchar(40): 'APT-TEST-REV-xxxxxxxx' = 21 chars. */
const COMPLETED_CODE = `APT-TEST-${SCOPE.codeToken}`;
const RESERVED_CODE = `APT-TEST-${SCOPE.codeToken}-R`;

let server: TestServer;
let testCustomerToken: string;
let seedCustomerToken: string;
let staffToken: string;
let adminToken: string;
let testCustomerId: string;
let completedAppointmentId: string;
let reservedAppointmentId: string;

interface ReviewShape {
  id: string;
  rating: number;
  comment: string | null;
  appointment: { id: string; appointmentCode: string };
}

interface ReviewListResponse {
  data: {
    reviews: ReviewShape[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function pastDate(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function futureDate(daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

before(async () => {
  // HARD SAFETY GATE — must fully pass before any record is created.
  const gate = await runSafetyGate(SCOPE);
  console.log(formatSafetyReport(gate));
  assert.equal(gate.passed, true, `Safety gate failed: ${gate.failures.join(', ')}`);

  server = await startTestServer();

  const customerPassword = process.env['SEED_CUSTOMER_PASSWORD'];
  const staffPassword = process.env['SEED_STAFF_PASSWORD'];
  const adminPassword = process.env['SEED_ADMIN_PASSWORD'];
  assert.ok(customerPassword, 'SEED_CUSTOMER_PASSWORD must be set');
  assert.ok(staffPassword, 'SEED_STAFF_PASSWORD must be set');
  assert.ok(adminPassword, 'SEED_ADMIN_PASSWORD must be set');

  // Dedicated test customer (scoped email), created through the real API.
  const register = await request(server.baseUrl, '/auth/register', {
    method: 'POST',
    body: { email: TEST_EMAIL, password: TEST_PASSWORD, firstName: 'Review', lastName: 'Tester' },
  });
  assert.equal(register.status, 201, 'Test customer registration should succeed');

  const testLogin = await login(server.baseUrl, TEST_EMAIL, TEST_PASSWORD);
  assert.equal(testLogin.status, 200, 'Test customer login should succeed');
  testCustomerToken = testLogin.body.data.accessToken;

  const seedCustomerLogin = await login(server.baseUrl, SEED_CUSTOMER_EMAIL, customerPassword);
  assert.equal(seedCustomerLogin.status, 200);
  seedCustomerToken = seedCustomerLogin.body.data.accessToken;

  const staffLogin = await login(server.baseUrl, SEED_STAFF_EMAIL, staffPassword);
  assert.equal(staffLogin.status, 200);
  staffToken = staffLogin.body.data.accessToken;

  const adminLogin = await login(server.baseUrl, SEED_ADMIN_EMAIL, adminPassword);
  assert.equal(adminLogin.status, 200);
  adminToken = adminLogin.body.data.accessToken;

  // Resolve the dedicated customer profile created by registration.
  const testAccountId = testLogin.body.data.id;
  const testCustomer = await db.orm.public.Customer.where({ accountId: testAccountId }).first();
  assert.ok(testCustomer, 'Registration must create a customer profile');
  testCustomerId = testCustomer.id;

  // Fixtures the API cannot build: a past COMPLETED appointment and a future
  // RESERVED one, both owned by the dedicated test customer. The seeded
  // APT-SEED-0003 appointment is never touched.
  const completed = await db.orm.public.Appointment.create({
    appointmentCode: pgVarchar<40>(COMPLETED_CODE),
    customerId: testCustomerId,
    staffId: SEED_IDS.staff,
    appointmentDate: toPlainDate(pastDate(30)),
    startTime: toPlainTime('09:00'),
    endTime: toPlainTime('10:00'),
    totalAmount: pgNumeric('600.00'),
    status: 'COMPLETED',
  });
  completedAppointmentId = completed.id;

  const reserved = await db.orm.public.Appointment.create({
    appointmentCode: pgVarchar<40>(RESERVED_CODE),
    customerId: testCustomerId,
    staffId: SEED_IDS.staff,
    appointmentDate: toPlainDate(futureDate(20)),
    startTime: toPlainTime('09:00'),
    endTime: toPlainTime('10:00'),
    totalAmount: pgNumeric('600.00'),
    status: 'RESERVED',
  });
  reservedAppointmentId = reserved.id;

  for (const appointmentId of [completedAppointmentId, reservedAppointmentId]) {
    await db.orm.public.AppointmentService.create({
      appointmentId,
      serviceId: SEED_IDS.serviceGelManicure,
      serviceName: pgVarchar<200>('Gel Manicure'),
      price: pgNumeric('600.00'),
      durationMinutes: 60,
    });
  }
});

after(async () => {
  if (server) {
    try {
      const cleaned = await cleanupTestRecords(SCOPE);
      console.log(`[${SCOPE.marker}] cleanup:`, JSON.stringify(cleaned));
      const remaining = await countScopedRecords(SCOPE);
      console.log(`[${SCOPE.marker}] remaining:`, JSON.stringify(remaining));
      const totalRemaining = Object.values(remaining).reduce((sum, n) => sum + n, 0);
      assert.equal(totalRemaining, 0, `Scoped cleanup left ${totalRemaining} records behind`);
    } finally {
      await server.close();
    }
  }
  await db.close();
});

// ============================================================
// Successful review
// ============================================================

test('owner can review a completed appointment', async () => {
  const response = await request<{
    data: { review: { id: string; rating: number; comment: string | null; appointment: { id: string } } };
  }>(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: completedAppointmentId, rating: 5, comment: 'Excellent service' },
    token: testCustomerToken,
  });

  assert.equal(response.status, 201);
  const review = response.body.data.review;
  assert.ok(review.id, 'Review should have an id');
  assert.equal(review.rating, 5);
  assert.equal(review.comment, 'Excellent service');
  assert.equal(review.appointment.id, completedAppointmentId);
});

test('created review is persisted and publicly listable', async () => {
  const response = await request<ReviewListResponse>(server.baseUrl, '/reviews?page=1&limit=100');

  assert.equal(response.status, 200);
  const found = response.body.data.reviews.find((r) => r.rating === 5 && r.comment === 'Excellent service');
  assert.ok(found, 'Created review should appear in the public list');
});

test('duplicate review for the same appointment returns 409', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: completedAppointmentId, rating: 4, comment: 'second attempt' },
    token: testCustomerToken,
  });
  assert.equal(response.status, 409);
});

// ============================================================
// Eligibility
// ============================================================

test('non-owner cannot review another customer\'s appointment', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: completedAppointmentId, rating: 5 },
    token: seedCustomerToken,
  });
  assert.equal(response.status, 403);
});

test('owner cannot review a non-completed appointment', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: reservedAppointmentId, rating: 5 },
    token: testCustomerToken,
  });
  assert.equal(response.status, 409);
});

// ============================================================
// Validation
// ============================================================

test('rating 0 is rejected', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: completedAppointmentId, rating: 0 },
    token: testCustomerToken,
  });
  assert.equal(response.status, 400);
});

test('rating 6 is rejected', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: completedAppointmentId, rating: 6 },
    token: testCustomerToken,
  });
  assert.equal(response.status, 400);
});

test('fractional rating is rejected', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: completedAppointmentId, rating: 4.5 },
    token: testCustomerToken,
  });
  assert.equal(response.status, 400);
});

test('missing appointmentId is rejected', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { rating: 5 },
    token: testCustomerToken,
  });
  assert.equal(response.status, 400);
});

// ============================================================
// Authentication
// ============================================================

test('public review listing is reachable without a token', async () => {
  const response = await request(server.baseUrl, '/reviews?page=1&limit=20');
  assert.equal(response.status, 200);
});

test('rating filter returns only matching reviews', async () => {
  const response = await request<ReviewListResponse>(server.baseUrl, '/reviews?page=1&limit=100&rating=5');
  assert.equal(response.status, 200);
  assert.ok(response.body.data.reviews.length >= 1);
  for (const review of response.body.data.reviews) {
    assert.equal(review.rating, 5);
  }
});

test('invalid rating filter is rejected', async () => {
  const response = await request(server.baseUrl, '/reviews?page=1&limit=20&rating=6');
  assert.equal(response.status, 400);
});

test('staff cannot create a review', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: completedAppointmentId, rating: 5 },
    token: staffToken,
  });
  assert.equal(response.status, 401);
});

test('admin cannot create a review', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: completedAppointmentId, rating: 5 },
    token: adminToken,
  });
  assert.equal(response.status, 401);
});

test('unauthenticated review creation returns 401', async () => {
  const response = await request(server.baseUrl, '/reviews', {
    method: 'POST',
    body: { appointmentId: completedAppointmentId, rating: 5 },
  });
  assert.equal(response.status, 401);
});

// ============================================================
// Seed protection
// ============================================================

test('seeded completed appointment remains unreviewed', async () => {
  const response = await request<ReviewListResponse>(server.baseUrl, '/reviews?page=1&limit=100');
  assert.equal(response.status, 200);
  const seedReview = response.body.data.reviews.find(
    (r) => r.appointment.appointmentCode === SEED_APPOINTMENT_CODES.apptPastCompleted,
  );
  assert.equal(seedReview, undefined, `${SEED_APPOINTMENT_CODES.apptPastCompleted} must remain untouched`);
});
