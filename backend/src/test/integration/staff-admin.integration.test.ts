import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from './helpers/server.js';
import { request } from './helpers/http.js';
import { runPreflightChecks } from './helpers/preflight.js';
import { login } from './helpers/auth.js';
import { cleanupTestRecords } from './helpers/cleanup.js';
import { db } from '../../prisma/db.js';

const SEED_ADMIN_EMAIL = 'admin@seed.royalty.local';
const SEED_STAFF_EMAIL = 'staff@seed.royalty.local';
const SEED_CUSTOMER_EMAIL = 'customer@seed.royalty.local';
const SEED_STAFF_ID = '33333333-0000-4000-8000-000000000001';
const SEED_SERVICE_IDS = [
  '55555555-0000-4000-8000-000000000001',
  '55555555-0000-4000-8000-000000000002',
  '55555555-0000-4000-8000-000000000003',
  '55555555-0000-4000-8000-000000000004',
];

let server: TestServer;
let adminToken: string;
let staffToken: string;
let customerToken: string;
let testCategoryId: string;
let testServiceId: string;

before(async () => {
  const preflight = await runPreflightChecks();
  assert.equal(preflight.passed, true, `Preflight failed: ${preflight.reason}`);

  server = await startTestServer();

  const adminPassword = process.env['SEED_ADMIN_PASSWORD'];
  const staffPassword = process.env['SEED_STAFF_PASSWORD'];
  const customerPassword = process.env['SEED_CUSTOMER_PASSWORD'];
  assert.ok(adminPassword, 'SEED_ADMIN_PASSWORD must be set');
  assert.ok(staffPassword, 'SEED_STAFF_PASSWORD must be set');
  assert.ok(customerPassword, 'SEED_CUSTOMER_PASSWORD must be set');

  const adminLogin = await login(server.baseUrl, SEED_ADMIN_EMAIL, adminPassword!);
  assert.equal(adminLogin.status, 200, 'Admin login must succeed');
  adminToken = adminLogin.body.data.accessToken;

  const staffLogin = await login(server.baseUrl, SEED_STAFF_EMAIL, staffPassword!);
  assert.equal(staffLogin.status, 200, 'Staff login must succeed');
  staffToken = staffLogin.body.data.accessToken;

  const customerLogin = await login(server.baseUrl, SEED_CUSTOMER_EMAIL, customerPassword!);
  assert.equal(customerLogin.status, 200, 'Customer login must succeed');
  customerToken = customerLogin.body.data.accessToken;
});

after(async () => {
  // Cleanup runs in the lifecycle hook (not a test body) so it still executes
  // when an earlier assertion fails. Scoped to this file's own fixtures.
  if (server) {
    try {
      await cleanupTestRecords('batch5e');
    } finally {
      await server.close();
    }
  }
  await db.close();
});

// ============================================================
// STAFF: Authentication and profile
// ============================================================

test('staff can authenticate and verify /api/me', async () => {
  const response = await request<{
    data: { user: { userId: string; email: string; role: string } };
  }>(server.baseUrl, '/api/me', { token: staffToken });

  assert.equal(response.status, 200);
  const meData = response.body.data ?? response.body;
  const meUser = meData.user ?? meData;
  assert.equal(meUser.email, SEED_STAFF_EMAIL);
  assert.equal(meUser.role, 'STAFF');
});

test('staff can access own profile via GET /staff/me', async () => {
  const response = await request<{
    data: {
      id: string;
      accountId: string;
      firstName: string;
      lastName: string;
      phone: string | null;
      primaryRole: string;
      employmentType: string;
      workStatus: string;
    };
  }>(server.baseUrl, '/staff/me', { token: staffToken });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.id, SEED_STAFF_ID);
  assert.equal(response.body.data.firstName, 'Maria');
  assert.equal(response.body.data.lastName, 'Santos');
  assert.equal(response.body.data.primaryRole, 'Senior Stylist');
  assert.equal(response.body.data.employmentType, 'PART_TIME');
  assert.equal(response.body.data.workStatus, 'ON_DUTY');
});

// ============================================================
// STAFF: Appointment access
// ============================================================

test('staff can view assigned appointments via GET /appointments/staff/me', async () => {
  const response = await request<{
    data: {
      appointments: Array<{
        id: string;
        appointmentCode: string;
        status: string;
        staffId: string | null;
      }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>(server.baseUrl, '/appointments/staff/me?page=1&limit=100', { token: staffToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.appointments), 'appointments should be an array');
  assert.ok(response.body.data.appointments.length > 0, 'Should have at least one assigned appointment');

  for (const appointment of response.body.data.appointments) {
    assert.equal(appointment.staffId, SEED_STAFF_ID, 'All appointments should be assigned to seeded staff');
  }
});

// ============================================================
// STAFF: Schedule access
// ============================================================

test('staff can view own schedules via GET /schedules/staff/me', async () => {
  const response = await request<{
    data: {
      staffSchedules: Array<{
        id: string;
        staffId: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isActive: boolean;
      }>;
    };
  }>(server.baseUrl, '/schedules/staff/me', { token: staffToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.staffSchedules), 'staffSchedules should be an array');
  assert.ok(response.body.data.staffSchedules.length > 0, 'Should have at least one schedule');

  for (const schedule of response.body.data.staffSchedules) {
    assert.equal(schedule.staffId, SEED_STAFF_ID, 'All schedules should belong to seeded staff');
  }
});

// ============================================================
// STAFF: Authorization boundaries
// ============================================================

test('staff cannot access admin-only GET /staff', async () => {
  const response = await request(server.baseUrl, '/staff?page=1&limit=20', { token: staffToken });
  assert.equal(response.status, 401);
});

test('staff cannot access admin-only GET /accounts', async () => {
  const response = await request(server.baseUrl, '/accounts?page=1&limit=20', { token: staffToken });
  assert.equal(response.status, 401);
});

test('staff cannot create staff via POST /staff', async () => {
  const response = await request(server.baseUrl, '/staff', {
    method: 'POST',
    body: {
      accountId: '00000000-0000-4000-8000-000000000001',
      firstName: 'Test',
      lastName: 'Staff',
      primaryRole: 'Stylist',
      employmentType: 'FULL_TIME',
    },
    token: staffToken,
  });
  assert.equal(response.status, 401);
});

test('staff cannot access admin-only GET /customers', async () => {
  const response = await request(server.baseUrl, '/customers?page=1&limit=20', { token: staffToken });
  assert.equal(response.status, 401);
});

test('staff cannot access admin-only GET /appointments', async () => {
  // requireRole throws UnauthorizedError (401) for a role mismatch, by design.
  const response = await request(server.baseUrl, '/appointments?page=1&limit=20', { token: staffToken });
  assert.equal(response.status, 401);
});

// ============================================================
// ADMIN: Authentication and profile
// ============================================================

test('admin can authenticate and verify /api/me', async () => {
  const response = await request<{
    data: { user: { userId: string; email: string; role: string } };
  }>(server.baseUrl, '/api/me', { token: adminToken });

  assert.equal(response.status, 200);
  const meData = response.body.data ?? response.body;
  const meUser = meData.user ?? meData;
  assert.equal(meUser.email, SEED_ADMIN_EMAIL);
  assert.equal(meUser.role, 'ADMIN');
});

// ============================================================
// ADMIN: Account management
// ============================================================

test('admin can list accounts via GET /accounts', async () => {
  const response = await request<{
    data: {
      accounts: Array<{
        id: string;
        email: string;
        role: string;
        status: string;
      }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>(server.baseUrl, '/accounts?page=1&limit=100', { token: adminToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.accounts), 'accounts should be an array');
  assert.ok(response.body.data.accounts.length >= 3, 'Should have at least 3 seed accounts');

  const emails = response.body.data.accounts.map((a) => a.email);
  assert.ok(emails.includes(SEED_ADMIN_EMAIL), 'Admin account should exist');
  assert.ok(emails.includes(SEED_STAFF_EMAIL), 'Staff account should exist');
  assert.ok(emails.includes(SEED_CUSTOMER_EMAIL), 'Customer account should exist');
});

// ============================================================
// ADMIN: Staff management
// ============================================================

test('admin can list staff via GET /staff', async () => {
  const response = await request<{
    data: {
      staff: Array<{
        id: string;
        firstName: string;
        lastName: string;
        primaryRole: string;
        workStatus: string;
      }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>(server.baseUrl, '/staff?page=1&limit=100', { token: adminToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.staff), 'staff should be an array');
  assert.ok(response.body.data.staff.length >= 1, 'Should have at least 1 staff member');

  const staffIds = response.body.data.staff.map((s) => s.id);
  assert.ok(staffIds.includes(SEED_STAFF_ID), 'Seeded staff should exist');
});

// ============================================================
// ADMIN: Customer management
// ============================================================

test('admin can list customers via GET /customers', async () => {
  const response = await request<{
    data: {
      customers: Array<{
        id: string;
        firstName: string;
        lastName: string;
      }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>(server.baseUrl, '/customers?page=1&limit=100', { token: adminToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.customers), 'customers should be an array');
  assert.ok(response.body.data.customers.length >= 1, 'Should have at least 1 customer');
});

// ============================================================
// ADMIN: Appointment management
// ============================================================

test('admin can list all appointments via GET /appointments', async () => {
  const response = await request<{
    data: {
      appointments: Array<{
        id: string;
        appointmentCode: string;
        status: string;
      }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>(server.baseUrl, '/appointments?page=1&limit=100', { token: adminToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.appointments), 'appointments should be an array');
  assert.ok(response.body.data.appointments.length >= 4, 'Should have at least 4 seed appointments');

  const codes = response.body.data.appointments.map((a) => a.appointmentCode);
  assert.ok(codes.includes('APT-SEED-0001'), 'APT-SEED-0001 should exist');
  assert.ok(codes.includes('APT-SEED-0002'), 'APT-SEED-0002 should exist');
  assert.ok(codes.includes('APT-SEED-0003'), 'APT-SEED-0003 should exist');
  assert.ok(codes.includes('APT-SEED-0004'), 'APT-SEED-0004 should exist');
});

// ============================================================
// ADMIN: Schedule management
// ============================================================

test('admin can view business hours via GET /schedules/business-hours', async () => {
  const response = await request<{
    data: {
      businessHours: Array<{
        dayOfWeek: number;
        openTime: string | null;
        closeTime: string | null;
        isOpen: boolean;
      }>;
    };
  }>(server.baseUrl, '/schedules/business-hours', { token: adminToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.businessHours), 'businessHours should be an array');
  assert.ok(response.body.data.businessHours.length >= 7, 'Should have 7 days of business hours');
});

test('admin can view all staff schedules via GET /schedules/staff', async () => {
  const response = await request<{
    data: {
      staffSchedules: Array<{
        id: string;
        staffId: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
      }>;
    };
  }>(server.baseUrl, '/schedules/staff', { token: adminToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.staffSchedules), 'staffSchedules should be an array');
  assert.ok(response.body.data.staffSchedules.length >= 2, 'Should have at least 2 staff schedules');
});

// ============================================================
// ADMIN: Service catalog management
// ============================================================

test('admin can create service category', async () => {
  const response = await request<{
    data: { category: { id: string; name: string; isActive: boolean } };
  }>(server.baseUrl, '/services/categories', {
    method: 'POST',
    body: { name: '[TEST] Batch 5E Category' },
    token: adminToken,
  });

  assert.equal(response.status, 201);
  assert.ok(response.body.data.category.id, 'Category should have an ID');
  assert.equal(response.body.data.category.name, '[TEST] Batch 5E Category');
  assert.equal(response.body.data.category.isActive, true);

  testCategoryId = response.body.data.category.id;
});

test('admin can create service', async () => {
  assert.ok(testCategoryId, 'Test category must be created first');

  const response = await request<{
    data: { service: { id: string; name: string; price: number; durationMinutes: number } };
  }>(server.baseUrl, '/services', {
    method: 'POST',
    body: {
      categoryId: testCategoryId,
      name: '[TEST] Batch 5E Service',
      description: 'Test service for Batch 5E',
      price: 999,
      durationMinutes: 30,
    },
    token: adminToken,
  });

  assert.equal(response.status, 201);
  assert.ok(response.body.data.service.id, 'Service should have an ID');
  assert.equal(response.body.data.service.name, '[TEST] Batch 5E Service');
  assert.equal(response.body.data.service.price, 999);
  assert.equal(response.body.data.service.durationMinutes, 30);

  testServiceId = response.body.data.service.id;
});

test('admin can assign staff to service', async () => {
  assert.ok(testServiceId, 'Test service must be created first');

  const response = await request<{
    data: { message: string };
  }>(server.baseUrl, `/services/${testServiceId}/assign`, {
    method: 'POST',
    body: { staffIds: [SEED_STAFF_ID] },
    token: adminToken,
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.message, 'Staff assigned successfully');
});

test('admin can view staff assigned to service', async () => {
  assert.ok(testServiceId, 'Test service must be created first');

  const response = await request<{
    data: {
      staff: Array<{ id: string; firstName: string; lastName: string }>;
    };
  }>(server.baseUrl, `/services/${testServiceId}/staff`, { token: adminToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.staff), 'staff should be an array');
  assert.ok(response.body.data.staff.length >= 1, 'Should have at least 1 assigned staff');
  assert.ok(
    response.body.data.staff.some((s) => s.id === SEED_STAFF_ID),
    'Seeded staff should be assigned',
  );
});

test('admin can view services for staff', async () => {
  const response = await request<{
    data: {
      services: Array<{ id: string; name: string }>;
    };
  }>(server.baseUrl, `/services/staff/${SEED_STAFF_ID}/services`, { token: adminToken });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.services), 'services should be an array');
  assert.ok(response.body.data.services.length >= 4, 'Should have at least 4 services');
});

// ============================================================
// ADMIN: Authorization boundaries
// ============================================================

test('admin cannot be accessed by staff role', async () => {
  const response = await request(server.baseUrl, '/accounts?page=1&limit=20', { token: staffToken });
  assert.equal(response.status, 401);
});

// ============================================================
// Role boundaries: CUSTOMER → STAFF/ADMIN
// ============================================================

test('customer cannot access staff-only GET /staff', async () => {
  const response = await request(server.baseUrl, '/staff?page=1&limit=20', { token: customerToken });
  assert.equal(response.status, 401);
});

test('customer cannot access admin-only GET /accounts', async () => {
  const response = await request(server.baseUrl, '/accounts?page=1&limit=20', { token: customerToken });
  assert.equal(response.status, 401);
});

test('customer cannot access admin-only GET /customers', async () => {
  const response = await request(server.baseUrl, '/customers?page=1&limit=20', { token: customerToken });
  assert.equal(response.status, 401);
});

test('customer cannot access admin-only GET /appointments', async () => {
  const response = await request(server.baseUrl, '/appointments?page=1&limit=20', { token: customerToken });
  assert.equal(response.status, 401);
});

test('customer cannot access admin-only GET /schedules/business-hours', async () => {
  const response = await request(server.baseUrl, '/schedules/business-hours', { token: customerToken });
  assert.equal(response.status, 401);
});

// ============================================================
// Role boundaries: Unauthenticated
// ============================================================

test('unauthenticated request to protected endpoint returns 401', async () => {
  const response = await request(server.baseUrl, '/staff/me');
  assert.equal(response.status, 401);
});

test('unauthenticated request to admin endpoint returns 401', async () => {
  const response = await request(server.baseUrl, '/accounts?page=1&limit=20');
  assert.equal(response.status, 401);
});

// ============================================================
// Scoped fixture ownership
// ============================================================

test('test fixtures carry the scoped marker for file-owned cleanup', async () => {
  assert.ok(testCategoryId, 'Test category must be created first');
  assert.ok(testServiceId, 'Test service must be created first');

  // Cleanup runs in after() and identifies this file's fixtures by the scoped
  // marker, so it can never delete another integration file's active data.
  const category = await db.orm.public.ServiceCategory.where({ id: testCategoryId }).first();
  const service = await db.orm.public.Service.where({ id: testServiceId }).first();
  assert.ok(category, 'Test category should still exist at this point');
  assert.ok(service, 'Test service should still exist at this point');
  assert.ok(
    category.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes('batch5e'),
    `Test category should identify this file (got: ${category.name})`,
  );
  assert.ok(
    service.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes('batch5e'),
    `Test service should identify this file (got: ${service.name})`,
  );
});
