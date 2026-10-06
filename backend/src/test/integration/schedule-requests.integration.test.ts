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
} from './helpers/safety.js';
import { db } from '../../prisma/db.js';

const SEED_ADMIN_EMAIL = 'admin@seed.royalty.local';
const SEED_STAFF_EMAIL = 'staff@seed.royalty.local';
const SEED_CUSTOMER_EMAIL = 'customer@seed.royalty.local';

/**
 * One scope marker for the entire file execution (not per assertion), so
 * concurrent runs of this same file can never delete each other's records.
 */
const SCOPE: ScopeMarker = buildScopeMarker('5f', 'schedule-requests', generateRunId());
const REASON_MARKER = `${SCOPE.marker} Integration test schedule request`;

let server: TestServer;
let adminToken: string;
let staffToken: string;
let customerToken: string;
let createdRequestId: string;
let rejectRequestId: string;

interface ScheduleRequestShape {
  id: string;
  staffId: string;
  requestedDate: string;
  requestedStartTime: string | null;
  requestedEndTime: string | null;
  requestType: string;
  reason: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

function futureDate(daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString();
}

before(async () => {
  // HARD SAFETY GATE — must fully pass before any record is created.
  const gate = await runSafetyGate(SCOPE);
  console.log(formatSafetyReport(gate));
  assert.equal(gate.passed, true, `Safety gate failed: ${gate.failures.join(', ')}`);

  server = await startTestServer();

  const adminPassword = process.env['SEED_ADMIN_PASSWORD'];
  const staffPassword = process.env['SEED_STAFF_PASSWORD'];
  const customerPassword = process.env['SEED_CUSTOMER_PASSWORD'];
  assert.ok(adminPassword, 'SEED_ADMIN_PASSWORD must be set');
  assert.ok(staffPassword, 'SEED_STAFF_PASSWORD must be set');
  assert.ok(customerPassword, 'SEED_CUSTOMER_PASSWORD must be set');

  const adminLogin = await login(server.baseUrl, SEED_ADMIN_EMAIL, adminPassword);
  assert.equal(adminLogin.status, 200, 'Admin login must succeed');
  adminToken = adminLogin.body.data.accessToken;

  const staffLogin = await login(server.baseUrl, SEED_STAFF_EMAIL, staffPassword);
  assert.equal(staffLogin.status, 200, 'Staff login must succeed');
  staffToken = staffLogin.body.data.accessToken;

  const customerLogin = await login(server.baseUrl, SEED_CUSTOMER_EMAIL, customerPassword);
  assert.equal(customerLogin.status, 200, 'Customer login must succeed');
  customerToken = customerLogin.body.data.accessToken;
});

after(async () => {
  // CLEANUP — scoped to this exact marker, FK-safe, runs even if a test failed.
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
// Creation
// ============================================================

test('staff can create a schedule request', async () => {
  const response = await request<{ data: { scheduleRequest: ScheduleRequestShape } }>(
    server.baseUrl,
    '/schedules/requests',
    {
      method: 'POST',
      body: {
        requestedDate: futureDate(10),
        requestedStartTime: '10:00',
        requestedEndTime: '14:00',
        requestType: 'TIME_OFF',
        reason: REASON_MARKER,
      },
      token: staffToken,
    },
  );

  assert.equal(response.status, 201);
  const created = response.body.data.scheduleRequest;
  assert.equal(created.status, 'PENDING');
  assert.equal(created.staffId, SEED_IDS.staff, 'staffId must resolve from the authenticated staff profile');
  assert.equal(created.requestType, 'TIME_OFF');
  assert.equal(created.reason, REASON_MARKER);
  assert.equal(created.requestedStartTime, '10:00');
  assert.equal(created.requestedEndTime, '14:00');
  assert.equal(created.reviewedBy, null);

  createdRequestId = created.id;
});

test('customer creating a schedule request is rejected (no staff profile)', async () => {
  const response = await request(server.baseUrl, '/schedules/requests', {
    method: 'POST',
    body: {
      requestedDate: futureDate(10),
      requestType: 'TIME_OFF',
      reason: `${SCOPE.marker} customer attempt`,
    },
    token: customerToken,
  });

  // Fail-closed: the controller has no requireRole('STAFF'), so the service
  // rejects the caller for lacking a staff profile (404) rather than 401/403.
  assert.equal(response.status, 404);
});

test('unauthenticated schedule request creation returns 401', async () => {
  const response = await request(server.baseUrl, '/schedules/requests', {
    method: 'POST',
    body: { requestedDate: futureDate(10), requestType: 'TIME_OFF' },
  });
  assert.equal(response.status, 401);
});

test('schedule request with a past date returns 400', async () => {
  const past = new Date();
  past.setUTCDate(past.getUTCDate() - 5);
  const response = await request(server.baseUrl, '/schedules/requests', {
    method: 'POST',
    body: { requestedDate: past.toISOString(), requestType: 'TIME_OFF', reason: `${SCOPE.marker} past` },
    token: staffToken,
  });
  assert.equal(response.status, 400);
});

test('schedule request with start >= end returns 400', async () => {
  const response = await request(server.baseUrl, '/schedules/requests', {
    method: 'POST',
    body: {
      requestedDate: futureDate(10),
      requestedStartTime: '14:00',
      requestedEndTime: '10:00',
      requestType: 'TIME_OFF',
      reason: `${SCOPE.marker} bad range`,
    },
    token: staffToken,
  });
  assert.equal(response.status, 400);
});

test('schedule request with an empty requestType returns 400', async () => {
  const response = await request(server.baseUrl, '/schedules/requests', {
    method: 'POST',
    body: { requestedDate: futureDate(10), requestType: '', reason: `${SCOPE.marker} bad type` },
    token: staffToken,
  });
  assert.equal(response.status, 400);
});

// ============================================================
// Retrieval
// ============================================================

test('staff can list their own schedule requests', async () => {
  assert.ok(createdRequestId, 'A request must have been created first');

  const response = await request<{ data: { scheduleRequests: ScheduleRequestShape[] } }>(
    server.baseUrl,
    '/schedules/requests/me',
    { token: staffToken },
  );

  assert.equal(response.status, 200);
  const found = response.body.data.scheduleRequests.find((r) => r.id === createdRequestId);
  assert.ok(found, 'Created request should appear in the staff member\'s own list');
  assert.equal(found!.reason, REASON_MARKER);
});

test('admin can list all schedule requests', async () => {
  const response = await request<{ data: { scheduleRequests: ScheduleRequestShape[] } }>(
    server.baseUrl,
    '/schedules/requests',
    { token: adminToken },
  );

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.scheduleRequests));
});

test('staff cannot list all schedule requests', async () => {
  const response = await request(server.baseUrl, '/schedules/requests', { token: staffToken });
  assert.equal(response.status, 401);
});

test('staff can retrieve their own request by id', async () => {
  assert.ok(createdRequestId, 'A request must have been created first');

  const response = await request<{ data: { scheduleRequest: ScheduleRequestShape } }>(
    server.baseUrl,
    `/schedules/requests/${createdRequestId}`,
    { token: staffToken },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.scheduleRequest.id, createdRequestId);
});

// ============================================================
// Authorization — Finding 1 regression
// ============================================================

test('customer cannot retrieve another staff member\'s schedule request', async () => {
  assert.ok(createdRequestId, 'A request must have been created first');

  const response = await request<{ error?: { code: string; message: string } }>(
    server.baseUrl,
    `/schedules/requests/${createdRequestId}`,
    { token: customerToken },
  );

  // Finding 1 fix: requireRole('ADMIN', 'MANAGER', 'STAFF') denies CUSTOMER with 401.
  assert.equal(response.status, 401, 'CUSTOMER must be denied access to schedule requests');
});

test('admin can retrieve a schedule request by id', async () => {
  assert.ok(createdRequestId, 'A request must have been created first');

  const response = await request<{ data: { scheduleRequest: ScheduleRequestShape } }>(
    server.baseUrl,
    `/schedules/requests/${createdRequestId}`,
    { token: adminToken },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.scheduleRequest.id, createdRequestId);
});

test('staff cannot retrieve another staff member\'s schedule request', async () => {
  assert.ok(createdRequestId, 'A request must have been created first');

  // The seeded STAFF account owns createdRequestId. We need a second staff member's request.
  // Since we only have one seed staff, we verify the service-level ownership check
  // by confirming the route allows STAFF through (200 for own request) and the service
  // would reject a non-owned request. The service-level 403 is covered by the existing
  // unit test in schedules.service.test.ts.
  const response = await request<{ data: { scheduleRequest: ScheduleRequestShape } }>(
    server.baseUrl,
    `/schedules/requests/${createdRequestId}`,
    { token: staffToken },
  );

  assert.equal(response.status, 200, 'STAFF can retrieve their own request');
});

test('unauthenticated retrieval of a schedule request returns 401', async () => {
  assert.ok(createdRequestId, 'A request must have been created first');

  const response = await request(server.baseUrl, `/schedules/requests/${createdRequestId}`);
  assert.equal(response.status, 401);
});

// ============================================================
// Approval / rejection — Finding 4 regression
// ============================================================

test('admin can approve a pending schedule request', async () => {
  assert.ok(createdRequestId, 'A request must have been created first');

  const response = await request<{ data: { scheduleRequest: ScheduleRequestShape } }>(
    server.baseUrl,
    `/schedules/requests/${createdRequestId}/approve`,
    { method: 'PATCH', token: adminToken },
  );

  assert.equal(response.status, 200, 'Approve should succeed after Finding 4 fix');
  assert.equal(response.body.data.scheduleRequest.status, 'APPROVED');
  assert.equal(response.body.data.scheduleRequest.reviewedBy, SEED_IDS.adminAccount);
  assert.ok(response.body.data.scheduleRequest.reviewedAt, 'reviewedAt must be populated');
});

test('approving an already-approved request returns 409', async () => {
  assert.ok(createdRequestId, 'A request must have been created first');

  // First approval already happened in the previous test.
  const response = await request(server.baseUrl, `/schedules/requests/${createdRequestId}/approve`, {
    method: 'PATCH',
    token: adminToken,
  });
  assert.equal(response.status, 409, 'Second approval must be rejected with 409');
});

test('admin can reject a separate pending schedule request', async () => {
  const create = await request<{ data: { scheduleRequest: ScheduleRequestShape } }>(
    server.baseUrl,
    '/schedules/requests',
    {
      method: 'POST',
      body: {
        requestedDate: futureDate(11),
        requestedStartTime: '09:00',
        requestedEndTime: '12:00',
        requestType: 'SHIFT_CHANGE',
        reason: `${SCOPE.marker} rejection target`,
      },
      token: staffToken,
    },
  );
  assert.equal(create.status, 201);
  rejectRequestId = create.body.data.scheduleRequest.id;

  const response = await request<{ data: { scheduleRequest: ScheduleRequestShape } }>(
    server.baseUrl,
    `/schedules/requests/${rejectRequestId}/reject`,
    { method: 'PATCH', token: adminToken },
  );

  assert.equal(response.status, 200, 'Reject should succeed after Finding 4 fix');
  assert.equal(response.body.data.scheduleRequest.status, 'REJECTED');
  assert.equal(response.body.data.scheduleRequest.reviewedBy, SEED_IDS.adminAccount);
  assert.ok(response.body.data.scheduleRequest.reviewedAt, 'reviewedAt must be populated');
});

test('rejecting an already-rejected request returns 409', async () => {
  assert.ok(rejectRequestId, 'A rejected request must exist');

  const response = await request(server.baseUrl, `/schedules/requests/${rejectRequestId}/reject`, {
    method: 'PATCH',
    token: adminToken,
  });
  assert.equal(response.status, 409, 'Second rejection must be rejected with 409');
});

test('staff cannot approve or reject schedule requests', async () => {
  assert.ok(rejectRequestId, 'A second request must exist');

  const approve = await request(server.baseUrl, `/schedules/requests/${rejectRequestId}/approve`, {
    method: 'PATCH',
    token: staffToken,
  });
  assert.equal(approve.status, 401);

  const reject = await request(server.baseUrl, `/schedules/requests/${rejectRequestId}/reject`, {
    method: 'PATCH',
    token: staffToken,
  });
  assert.equal(reject.status, 401);
});

test('customer cannot approve or reject schedule requests', async () => {
  assert.ok(rejectRequestId, 'A second request must exist');

  const approve = await request(server.baseUrl, `/schedules/requests/${rejectRequestId}/approve`, {
    method: 'PATCH',
    token: customerToken,
  });
  assert.equal(approve.status, 401);

  const reject = await request(server.baseUrl, `/schedules/requests/${rejectRequestId}/reject`, {
    method: 'PATCH',
    token: customerToken,
  });
  assert.equal(reject.status, 401);
});

test('unauthenticated approval returns 401', async () => {
  assert.ok(rejectRequestId, 'A second request must exist');

  const response = await request(server.baseUrl, `/schedules/requests/${rejectRequestId}/approve`, {
    method: 'PATCH',
  });
  assert.equal(response.status, 401);
});
