import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startTestServer, type TestServer } from './helpers/server.js';
import { request } from './helpers/http.js';
import { runPreflightChecks } from './helpers/preflight.js';
import { login } from './helpers/auth.js';
import { cleanupTestRecords } from './helpers/cleanup.js';
import { pgVarchar } from '../../prisma/contract-compat.js';
import { db } from '../../prisma/db.js';

const TEST_EMAIL = 'test-customer-batch5d@test.royalty.local';
const TEST_PASSWORD = 'TestPassword123!';
const SEED_STAFF_ID = '33333333-0000-4000-8000-000000000001';
const SEED_SERVICE_IDS = [
  '55555555-0000-4000-8000-000000000001',
  '55555555-0000-4000-8000-000000000002',
  '55555555-0000-4000-8000-000000000003',
  '55555555-0000-4000-8000-000000000004',
];

let server: TestServer;
let accessToken: string;
let testAppointmentId: string;
let seededAppointmentId: string;

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getFutureDate(daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

interface CalendarSlot {
  date: string;
  staffId: string;
  startTime: string;
  serviceId: string;
}

function findValidSlot(calendarData: {
  dates: Array<{
    date: string;
    staff: Array<{
      id: string;
      windows: Array<{ startTime: string; latestStartTime: string }>;
    }>;
  }>;
}): CalendarSlot | null {
  for (const day of calendarData.dates) {
    for (const staff of day.staff) {
      if (staff.windows.length > 0) {
        return {
          date: day.date,
          staffId: staff.id,
          startTime: staff.windows[0]!.startTime,
          serviceId: SEED_SERVICE_IDS[0]!,
        };
      }
    }
  }
  return null;
}

before(async () => {
  const preflight = await runPreflightChecks();
  assert.equal(preflight.passed, true, `Preflight failed: ${preflight.reason}`);

  server = await startTestServer();

  // Register a dedicated test customer
  const registerResponse = await request<{
    data: { id: string; email: string, role: string, accessToken: string, refreshToken: string };
  }>(server.baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      firstName: 'Test',
      lastName: 'Customer',
    },
  });
  assert.equal(registerResponse.status, 201, 'Test customer registration should succeed');

  // Login as test customer
  const loginResponse = await login(server.baseUrl, TEST_EMAIL, TEST_PASSWORD);
  assert.equal(loginResponse.status, 200, 'Test customer login should succeed');
  accessToken = loginResponse.body.data.accessToken;

  // Fetch a seeded appointment ID for cross-customer access test
  const seededCustomerPassword = process.env['SEED_CUSTOMER_PASSWORD'];
  assert.ok(seededCustomerPassword, 'SEED_CUSTOMER_PASSWORD must be set');
  const seededLogin = await login(server.baseUrl, 'customer@seed.royalty.local', seededCustomerPassword);
  assert.equal(seededLogin.status, 200, 'Seeded customer login must succeed');
  const seededAppointments = await request<{
    data: { appointments: Array<{ id: string }> };
  }>(server.baseUrl, '/appointments/me?page=1&limit=1', { token: seededLogin.body.data.accessToken });
  assert.equal(seededAppointments.status, 200, 'Seeded customer appointments must be accessible');
  seededAppointmentId = seededAppointments.body.data.appointments[0]!.id;
});

after(async () => {
  // Cleanup runs in the lifecycle hook (not a test body) so it still executes
  // when an earlier assertion fails. Scoped to this file's own fixtures.
  if (server) {
    try {
      await cleanupTestRecords('batch5d');
    } finally {
      await server.close();
    }
  }
  await db.close();
});

// ============================================================
// 1. Register and authenticate test customer
// ============================================================

test('test customer can register and authenticate', async () => {
  // Registration and login already done in before() — verify token works
  const meResponse = await request<{
    data: { user: { userId: string; email: string; role: string } };
  }>(server.baseUrl, '/api/me', { token: accessToken });

  assert.equal(meResponse.status, 200);
  const meData = meResponse.body.data ?? meResponse.body;
  const meUser = meData.user ?? meData;
  assert.equal(meUser.email, TEST_EMAIL);
  assert.equal(meUser.role, 'CUSTOMER');
});

// ============================================================
// 2. Discover eligible staff and services
// ============================================================

test('test customer can discover eligible staff for seeded services', async () => {
  const serviceIdsParam = SEED_SERVICE_IDS.join(',');
  const response = await request<{
    data: {
      staff: Array<{ id: string; firstName: string; lastName: string; primaryRole: string }>;
    };
  }>(server.baseUrl, `/staff/eligible?serviceIds=${serviceIdsParam}`, { token: accessToken });

  assert.equal(response.status, 200);
  assert.ok(response.body.data.staff.length >= 1, 'Should have at least 1 eligible staff');
  assert.ok(
    response.body.data.staff.some((s) => s.id === SEED_STAFF_ID),
    'Seeded staff should be eligible',
  );
});

// ============================================================
// 3. Find valid availability slot
// ============================================================

test('test customer can find valid availability slot', async () => {
  const fromDate = getFutureDate(1);
  const toDate = getFutureDate(14);
  const serviceIdsParam = SEED_SERVICE_IDS[0]!;

  const response = await request<{
    data: {
      timezone: string;
      dates: Array<{
        date: string;
        staff: Array<{
          id: string;
          firstName: string;
          lastName: string;
          primaryRole: string;
          windows: Array<{ startTime: string; latestStartTime: string }>;
        }>;
      }>;
    };
  }>(
    server.baseUrl,
    `/appointments/availability/calendar?from=${fromDate}&to=${toDate}&serviceIds=${serviceIdsParam}`,
    { token: accessToken },
  );

  assert.equal(response.status, 200);
  assert.ok(response.body.data.dates.length > 0, 'Should have at least one available date');

  const slot = findValidSlot(response.body.data);
  assert.ok(slot, 'Should find at least one valid slot');
});

// ============================================================
// 4. Create appointment
// ============================================================

test('test customer can create appointment', async () => {
  // First find a valid slot
  const fromDate = getFutureDate(1);
  const toDate = getFutureDate(14);
  const serviceIdsParam = SEED_SERVICE_IDS[0]!;

  const calendarResponse = await request<{
    data: {
      dates: Array<{
        date: string;
        staff: Array<{
          id: string;
          windows: Array<{ startTime: string; latestStartTime: string }>;
        }>;
      }>;
    };
  }>(
    server.baseUrl,
    `/appointments/availability/calendar?from=${fromDate}&to=${toDate}&serviceIds=${serviceIdsParam}`,
    { token: accessToken },
  );

  assert.equal(calendarResponse.status, 200);
  const slot = findValidSlot(calendarResponse.body.data);
  assert.ok(slot, 'Must find a valid slot before creating appointment');

  const createResponse = await request<{
    data: {
      appointment: {
        id: string;
        appointmentCode: string;
        customerId: string;
        staffId: string | null;
        appointmentDate: string;
        startTime: string;
        endTime: string;
        totalAmount: number;
        status: string;
        services: Array<{
          id: string;
          serviceId: string;
          serviceName: string;
          price: number;
          durationMinutes: number;
        }>;
      };
    };
  }>(server.baseUrl, '/appointments', {
    method: 'POST',
    body: {
      staffId: slot!.staffId,
      appointmentDate: slot!.date,
      startTime: slot!.startTime,
      serviceIds: [slot!.serviceId],
    },
    token: accessToken,
  });

  assert.equal(createResponse.status, 201, 'Appointment creation should return 201');
  const appointment = createResponse.body.data.appointment;

  assert.ok(appointment.id, 'Appointment should have an ID');
  assert.ok(appointment.appointmentCode, 'Appointment should have a code');
  assert.ok(appointment.appointmentCode.startsWith('APT-'), 'Code should start with APT-');
  assert.equal(appointment.status, 'RESERVED', 'Initial status should be RESERVED');
  assert.equal(appointment.staffId, slot!.staffId, 'Staff ID should match');
  assert.equal(appointment.appointmentDate, slot!.date, 'Date should match');
  assert.equal(appointment.startTime, slot!.startTime, 'Start time should match');
  assert.equal(typeof appointment.endTime, 'string', 'End time should be a string');
  assert.equal(typeof appointment.totalAmount, 'number', 'Total amount should be a number');
  assert.ok(appointment.totalAmount > 0, 'Total amount should be positive');
  assert.ok(Array.isArray(appointment.services), 'Services should be an array');
  assert.equal(appointment.services.length, 1, 'Should have 1 service');
  assert.equal(appointment.services[0]!.serviceId, slot!.serviceId, 'Service ID should match');

  // Rewrite the generated code to carry the scoped test marker. The production
  // generator emits `APT-{uuid}`; test data must be identifiable by code alone
  // so cleanup never depends on the owning customer still existing.
  const markedCode = pgVarchar<40>(`APT-TEST-BATCH5D-${randomUUID().slice(0, 8).toUpperCase()}`);
  const rewritten = await db.orm.public.Appointment.where({ id: appointment.id }).update({
    appointmentCode: markedCode,
  });
  assert.ok(rewritten, 'Test appointment code should be rewritten to the scoped marker');

  testAppointmentId = appointment.id;
});

// ============================================================
// 5. Verify persisted appointment
// ============================================================

test('created appointment is retrievable and has correct persisted state', async () => {
  assert.ok(testAppointmentId, 'Test appointment must be created first');

  const response = await request<{
    data: {
      appointment: {
        id: string;
        appointmentCode: string;
        customerId: string;
        staffId: string | null;
        appointmentDate: string;
        startTime: string;
        endTime: string;
        totalAmount: number;
        status: string;
        services: Array<{
          id: string;
          serviceId: string;
          serviceName: string;
          price: number;
          durationMinutes: number;
        }>;
      };
    };
  }>(server.baseUrl, `/appointments/${testAppointmentId}`, { token: accessToken });

  assert.equal(response.status, 200);
  const appointment = response.body.data.appointment;

  assert.equal(appointment.id, testAppointmentId);
  assert.equal(appointment.status, 'RESERVED');
  assert.equal(typeof appointment.appointmentDate, 'string', 'Date should be a string');
  assert.equal(typeof appointment.startTime, 'string', 'Start time should be a string');
  assert.equal(typeof appointment.endTime, 'string', 'End time should be a string');
  assert.ok(!JSON.stringify(response.body).includes('Temporal'), 'No Temporal leak');

  // Verify pricing snapshot
  assert.ok(appointment.services.length >= 1, 'Should have services');
  const totalFromServices = appointment.services.reduce((sum, s) => sum + s.price, 0);
  assert.equal(appointment.totalAmount, totalFromServices, 'Total should match service prices');
});

// ============================================================
// 6. Appointment appears in customer's list
// ============================================================

test('created appointment appears in customer appointment list', async () => {
  assert.ok(testAppointmentId, 'Test appointment must be created first');

  const response = await request<{
    data: {
      appointments: Array<{ id: string; appointmentCode: string; status: string }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>(server.baseUrl, '/appointments/me?page=1&limit=100', { token: accessToken });

  assert.equal(response.status, 200);
  const found = response.body.data.appointments.find((a) => a.id === testAppointmentId);
  assert.ok(found, 'Test appointment should appear in customer list');
  assert.equal(found!.status, 'RESERVED');
});

// ============================================================
// 7. Cancel appointment (customer lifecycle mutation)
// ============================================================

test('test customer can cancel their own appointment', async () => {
  assert.ok(testAppointmentId, 'Test appointment must be created first');

  const response = await request<{
    data: {
      appointment: {
        id: string;
        status: string;
      };
    };
  }>(server.baseUrl, `/appointments/${testAppointmentId}/status`, {
    method: 'PATCH',
    body: { status: 'CANCELLED' },
    token: accessToken,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.appointment.status, 'CANCELLED');
});

// ============================================================
// 8. Verify cancellation persisted
// ============================================================

test('cancelled appointment status is persisted', async () => {
  assert.ok(testAppointmentId, 'Test appointment must be created first');

  const response = await request<{
    data: { appointment: { id: string; status: string } };
  }>(server.baseUrl, `/appointments/${testAppointmentId}`, { token: accessToken });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.appointment.status, 'CANCELLED');
});

// ============================================================
// 9. Invalid status transition is rejected
// ============================================================

test('invalid status transition from CANCELLED is rejected', async () => {
  assert.ok(testAppointmentId, 'Test appointment must be created first');

  const response = await request<{
    data: { appointment: { id: string; status: string } };
  }>(server.baseUrl, `/appointments/${testAppointmentId}/status`, {
    method: 'PATCH',
    body: { status: 'CONFIRMED' },
    token: accessToken,
  });

  assert.equal(response.status, 409, 'CANCELLED → CONFIRMED should be rejected');
});

// ============================================================
// 10. Authorization: cannot access another customer's appointment
// ============================================================

test('customer cannot access another customer\'s appointment', async () => {
  assert.ok(seededAppointmentId, 'Seeded appointment ID must be available');

  const response = await request<{
    data: { appointment: { id: string } };
  }>(server.baseUrl, `/appointments/${seededAppointmentId}`, { token: accessToken });

  assert.equal(response.status, 403, 'Should be forbidden');
});

// ============================================================
// 11. Test appointment is identifiable by the scoped marker
// ============================================================

test('test appointment carries the APT-TEST marker for scoped cleanup', async () => {
  assert.ok(testAppointmentId, 'Test appointment must be created first');

  // Cleanup runs in after() and identifies this file's appointment by the
  // APT-TEST-* marker, independently of whether its customer still exists.
  const appointment = await db.orm.public.Appointment.where({ id: testAppointmentId }).first();
  assert.ok(appointment, 'Test appointment should still exist at this point');
  assert.ok(
    appointment.appointmentCode.startsWith('APT-TEST-'),
    `Test appointment code should carry the APT-TEST- marker (got: ${appointment.appointmentCode})`,
  );
  assert.ok(
    appointment.appointmentCode.includes('BATCH5D'),
    `Test appointment code should identify this file (got: ${appointment.appointmentCode})`,
  );
});
