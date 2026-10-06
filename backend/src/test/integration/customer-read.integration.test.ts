import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from './helpers/server.js';
import { request } from './helpers/http.js';
import { runPreflightChecks } from './helpers/preflight.js';
import { login, getMe } from './helpers/auth.js';
import { db } from '../../prisma/db.js';

const SEED_CUSTOMER_EMAIL = 'customer@seed.royalty.local';
const SEED_STAFF_ID = '33333333-0000-4000-8000-000000000001';
const SEED_SERVICE_IDS = [
  '55555555-0000-4000-8000-000000000001',
  '55555555-0000-4000-8000-000000000002',
  '55555555-0000-4000-8000-000000000003',
  '55555555-0000-4000-8000-000000000004',
];
const SEED_APPOINTMENT_IDS = [
  '99999999-0000-4000-8000-000000000001',
  '99999999-0000-4000-8000-000000000002',
  '99999999-0000-4000-8000-000000000003',
  '99999999-0000-4000-8000-000000000004',
];

const customerPassword = process.env['SEED_CUSTOMER_PASSWORD'];

let server: TestServer;
let accessToken: string;

/**
 * Derive the next Monday date (YYYY-MM-DD) from today.
 * If today is Monday, returns next Monday (7 days ahead).
 */
function getNextMonday(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ...
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  return nextMonday.toISOString().slice(0, 10);
}

/**
 * Add days to a YYYY-MM-DD date string.
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

before(async () => {
  const preflight = await runPreflightChecks();
  assert.equal(preflight.passed, true, `Preflight failed: ${preflight.reason}`);

  assert.ok(customerPassword, 'SEED_CUSTOMER_PASSWORD must be set');

  server = await startTestServer();

  const loginResponse = await login(server.baseUrl, SEED_CUSTOMER_EMAIL, customerPassword!);
  assert.equal(loginResponse.status, 200, 'Customer login must succeed');
  accessToken = loginResponse.body.data.accessToken;
});

after(async () => {
  if (server) {
    await server.close();
  }
  await db.close();
});

// ============================================================
// 1. GET /services
// ============================================================

test('GET /services returns seeded services with correct shape', async () => {
  const response = await request<{
    data: {
      services: Array<{
        id: string;
        categoryId: string;
        categoryName: string;
        name: string;
        description: string | null;
        price: number;
        durationMinutes: number;
        isActive: boolean;
      }>;
    };
  }>(server.baseUrl, '/services', { token: accessToken });

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(Array.isArray(response.body.data.services), 'services should be an array');
  assert.ok(response.body.data.services.length >= 4, 'Should have at least 4 seeded services');

  const serviceNames = response.body.data.services.map((s) => s.name);
  assert.ok(serviceNames.includes('Signature Haircut'), 'Signature Haircut should exist');
  assert.ok(serviceNames.includes('Hair Color'), 'Hair Color should exist');
  assert.ok(serviceNames.includes('Gel Manicure'), 'Gel Manicure should exist');
  assert.ok(serviceNames.includes('Spa Pedicure'), 'Spa Pedicure should exist');

  for (const service of response.body.data.services) {
    assert.ok(service.id, 'Service should have id');
    assert.ok(service.categoryId, 'Service should have categoryId');
    assert.ok(service.categoryName, 'Service should have categoryName');
    assert.ok(service.name, 'Service should have name');
    assert.equal(typeof service.price, 'number', 'price should be a number');
    assert.equal(typeof service.durationMinutes, 'number', 'durationMinutes should be a number');
    assert.equal(service.isActive, true, 'Seeded services should be active');
  }
});

// ============================================================
// 2. GET /services/categories
// ============================================================

test('GET /services/categories returns Hair and Nails', async () => {
  const response = await request<{
    data: {
      categories: Array<{
        id: string;
        name: string;
        isActive: boolean;
      }>;
    };
  }>(server.baseUrl, '/services/categories', { token: accessToken });

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(Array.isArray(response.body.data.categories), 'categories should be an array');
  assert.ok(response.body.data.categories.length >= 2, 'Should have at least 2 categories');

  const categoryNames = response.body.data.categories.map((c) => c.name);
  assert.ok(categoryNames.includes('Hair'), 'Hair category should exist');
  assert.ok(categoryNames.includes('Nails'), 'Nails category should exist');
});

// ============================================================
// 3. GET /staff/eligible
// ============================================================

test('GET /staff/eligible returns seeded staff for seeded services', async () => {
  const serviceIdsParam = SEED_SERVICE_IDS.join(',');
  const response = await request<{
    data: {
      staff: Array<{
        id: string;
        firstName: string;
        lastName: string;
        primaryRole: string;
      }>;
    };
  }>(server.baseUrl, `/staff/eligible?serviceIds=${serviceIdsParam}`, { token: accessToken });

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(Array.isArray(response.body.data.staff), 'staff should be an array');
  assert.ok(response.body.data.staff.length >= 1, 'Should have at least 1 eligible staff');

  const staffNames = response.body.data.staff.map((s) => `${s.firstName} ${s.lastName}`);
  assert.ok(staffNames.includes('Maria Santos'), 'Maria Santos should be eligible');

  for (const staff of response.body.data.staff) {
    assert.ok(staff.id, 'Staff should have id');
    assert.ok(staff.firstName, 'Staff should have firstName');
    assert.ok(staff.lastName, 'Staff should have lastName');
    assert.ok(staff.primaryRole, 'Staff should have primaryRole');
  }
});

// ============================================================
// 4. GET /schedules/staff/:id
// ============================================================

test('GET /schedules/staff/:id returns seeded schedules with Temporal-safe serialization', async () => {
  const response = await request<{
    data: {
      staffSchedules: Array<{
        id: string;
        staffId: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        effectiveFrom: Date;
        effectiveUntil: Date | null;
        isActive: boolean;
      }>;
    };
  }>(server.baseUrl, `/schedules/staff/${SEED_STAFF_ID}`, { token: accessToken });

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(Array.isArray(response.body.data.staffSchedules), 'staffSchedules should be an array');
  assert.ok(response.body.data.staffSchedules.length >= 2, 'Should have at least 2 schedules');

  const mondaySchedule = response.body.data.staffSchedules.find((s) => s.dayOfWeek === 1);
  assert.ok(mondaySchedule, 'Monday schedule should exist');
  assert.equal(mondaySchedule!.startTime, '09:00', 'Monday start time should be 09:00');
  assert.equal(mondaySchedule!.endTime, '17:00', 'Monday end time should be 17:00');
  assert.equal(typeof mondaySchedule!.effectiveFrom, 'string', 'effectiveFrom should be a string after JSON serialization');
  assert.equal(mondaySchedule!.effectiveUntil, null, 'effectiveUntil should be null');
  assert.equal(mondaySchedule!.isActive, true, 'Schedule should be active');

  const tuesdaySchedule = response.body.data.staffSchedules.find((s) => s.dayOfWeek === 2);
  assert.ok(tuesdaySchedule, 'Tuesday schedule should exist');
  assert.equal(tuesdaySchedule!.startTime, '09:00', 'Tuesday start time should be 09:00');
  assert.equal(tuesdaySchedule!.endTime, '17:00', 'Tuesday end time should be 17:00');

  // Verify no Temporal objects leak through JSON
  const rawJson = JSON.stringify(response.body);
  assert.ok(!rawJson.includes('Temporal'), 'No Temporal objects should leak through JSON');
});

// ============================================================
// 5. GET /appointments/availability
// ============================================================

test('GET /appointments/availability returns availability for seeded schedule', async () => {
  const nextMonday = getNextMonday();
  const serviceIdsParam = SEED_SERVICE_IDS.slice(0, 1).join(',');

  const response = await request<{
    data: {
      available: boolean;
      endTime: string;
      totalAmount: number;
    };
  }>(
    server.baseUrl,
    `/appointments/availability?staffId=${SEED_STAFF_ID}&appointmentDate=${nextMonday}&startTime=09:00&serviceIds=${serviceIdsParam}`,
    { token: accessToken },
  );

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.equal(typeof response.body.data.available, 'boolean', 'available should be a boolean');
  assert.equal(typeof response.body.data.endTime, 'string', 'endTime should be a string');
  assert.equal(typeof response.body.data.totalAmount, 'number', 'totalAmount should be a number');
});

// ============================================================
// 6. GET /appointments/availability/calendar
// ============================================================

test('GET /appointments/availability/calendar returns calendar with Temporal-safe dates', async () => {
  const nextMonday = getNextMonday();
  const toDate = addDays(nextMonday, 7);
  const serviceIdsParam = SEED_SERVICE_IDS.join(',');

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
          windows: Array<{
            startTime: string;
            latestStartTime: string;
          }>;
        }>;
      }>;
    };
  }>(
    server.baseUrl,
    `/appointments/availability/calendar?from=${nextMonday}&to=${toDate}&serviceIds=${serviceIdsParam}`,
    { token: accessToken },
  );

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(response.body.data.timezone, 'timezone should exist');
  assert.ok(Array.isArray(response.body.data.dates), 'dates should be an array');

  // Verify no Temporal objects leak through JSON
  const rawJson = JSON.stringify(response.body);
  assert.ok(!rawJson.includes('Temporal'), 'No Temporal objects should leak through JSON');
});

// ============================================================
// 7. GET /appointments/me
// ============================================================

test('GET /appointments/me returns seeded customer appointments', async () => {
  const response = await request<{
    data: {
      appointments: Array<{
        id: string;
        appointmentCode: string;
        appointmentDate: string;
        startTime: string;
        endTime: string;
        status: string;
        totalAmount: number;
      }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>(server.baseUrl, '/appointments/me?page=1&limit=20', { token: accessToken });

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(Array.isArray(response.body.data.appointments), 'appointments should be an array');
  assert.ok(response.body.data.appointments.length >= 4, 'Should have at least 4 seeded appointments');

  const codes = response.body.data.appointments.map((a) => a.appointmentCode);
  assert.ok(codes.includes('APT-SEED-0001'), 'APT-SEED-0001 should exist');
  assert.ok(codes.includes('APT-SEED-0002'), 'APT-SEED-0002 should exist');
  assert.ok(codes.includes('APT-SEED-0003'), 'APT-SEED-0003 should exist');
  assert.ok(codes.includes('APT-SEED-0004'), 'APT-SEED-0004 should exist');

  for (const appointment of response.body.data.appointments) {
    assert.ok(appointment.id, 'Appointment should have id');
    assert.ok(appointment.appointmentCode, 'Appointment should have code');
    assert.equal(typeof appointment.appointmentDate, 'string', 'appointmentDate should be a string');
    assert.equal(typeof appointment.startTime, 'string', 'startTime should be a string');
    assert.equal(typeof appointment.endTime, 'string', 'endTime should be a string');
    assert.equal(typeof appointment.totalAmount, 'number', 'totalAmount should be a number');
  }

  // Verify no Temporal objects leak through JSON
  const rawJson = JSON.stringify(response.body);
  assert.ok(!rawJson.includes('Temporal'), 'No Temporal objects should leak through JSON');
});

// ============================================================
// 8. GET /appointments/:id
// ============================================================

test('GET /appointments/:id returns seeded appointment with Temporal-safe serialization', async () => {
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
  }>(server.baseUrl, `/appointments/${SEED_APPOINTMENT_IDS[0]}`, { token: accessToken });

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(response.body.data.appointment, 'Response should have appointment');

  const appointment = response.body.data.appointment;
  assert.equal(appointment.id, SEED_APPOINTMENT_IDS[0]);
  assert.equal(appointment.appointmentCode, 'APT-SEED-0003');
  assert.equal(appointment.status, 'COMPLETED');
  assert.equal(typeof appointment.appointmentDate, 'string', 'appointmentDate should be a string');
  assert.equal(typeof appointment.startTime, 'string', 'startTime should be a string');
  assert.equal(typeof appointment.endTime, 'string', 'endTime should be a string');
  assert.equal(typeof appointment.totalAmount, 'number', 'totalAmount should be a number');
  assert.ok(Array.isArray(appointment.services), 'services should be an array');
  assert.ok(appointment.services.length >= 1, 'Should have at least 1 service');

  // Verify no Temporal objects leak through JSON
  const rawJson = JSON.stringify(response.body);
  assert.ok(!rawJson.includes('Temporal'), 'No Temporal objects should leak through JSON');
});

// ============================================================
// 9. GET /appointments/me/completed
// ============================================================

test('GET /appointments/me/completed returns completed appointments', async () => {
  const response = await request<{
    data: {
      appointments: Array<{
        id: string;
        appointmentCode: string;
        appointmentDate: string;
        startTime: string;
        endTime: string;
        status: string;
        totalAmount: number;
      }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>(server.baseUrl, '/appointments/me/completed?page=1&limit=20', { token: accessToken });

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(Array.isArray(response.body.data.appointments), 'appointments should be an array');
  assert.ok(response.body.data.appointments.length >= 1, 'Should have at least 1 completed appointment');

  const codes = response.body.data.appointments.map((a) => a.appointmentCode);
  assert.ok(codes.includes('APT-SEED-0003'), 'APT-SEED-0003 should be in completed list');

  for (const appointment of response.body.data.appointments) {
    assert.equal(appointment.status, 'COMPLETED', 'All appointments should be COMPLETED');
    assert.equal(typeof appointment.appointmentDate, 'string', 'appointmentDate should be a string');
    assert.equal(typeof appointment.startTime, 'string', 'startTime should be a string');
    assert.equal(typeof appointment.endTime, 'string', 'endTime should be a string');
  }

  // Verify no Temporal objects leak through JSON
  const rawJson = JSON.stringify(response.body);
  assert.ok(!rawJson.includes('Temporal'), 'No Temporal objects should leak through JSON');
});

// ============================================================
// 10. GET /reviews
// ============================================================

test('GET /reviews returns empty list when no reviews exist', async () => {
  const response = await request<{
    data: {
      reviews: unknown[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>(server.baseUrl, '/reviews?page=1&limit=20');

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(Array.isArray(response.body.data.reviews), 'reviews should be an array');
  assert.equal(response.body.data.reviews.length, 0, 'Should have 0 reviews');
  assert.equal(response.body.data.total, 0, 'Total should be 0');
});

// ============================================================
// 11. Authorization: missing token on protected customer endpoint
// ============================================================

test('GET /appointments/me without token returns 401', async () => {
  const response = await request(server.baseUrl, '/appointments/me?page=1&limit=20');

  assert.equal(response.status, 401);
  const body = response.body as { error: { code: string; message: string } };
  assert.ok(body.error, 'Response should have error');
  assert.equal(body.error.code, 'UNAUTHORIZED');
});
