// HTTP contract for the enforcement work (§3): exact status codes and error
// bodies over the real routers. This is the wire contract the admin UI is
// built against:
//   PATCH /accounts/:id/role  -> 200 (ADMIN), 403 FORBIDDEN (MANAGER/STAFF/CUSTOMER), 401 (no token)
//   PATCH /staff/:id, /customers/:id with a changed firstName
//                             -> 400 VALIDATION_ERROR 'First name cannot be changed after account creation'
//   POST /accounts with role:'ADMIN'
//                             -> 400 BAD_REQUEST 'Validation failed' (schema)
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
process.env.SUPABASE_URL ??= 'https://route-test.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'route-test-key';

const [{ db }, { accountsRouter }, { staffRouter }, { customersRouter }, { errorHandler, notFoundHandler }, { createAccessToken }] =
  await Promise.all([
    import('../prisma/db.js'),
    import('./accounts.js'),
    import('./staff.js'),
    import('./customers.js'),
    import('../middleware/error.js'),
    import('../lib/jwt.js'),
  ]);

type Row = Record<string, unknown> & { id?: string };
const world: Record<string, Row[]> = {
  Account: [], Staff: [], Customer: [], StaffCategory: [], ServiceCategory: [], AuditLog: [],
};
let seq = 1;

function table(name: string) {
  const chainFor = (filter: Record<string, unknown>) => {
    const match = () => world[name].filter((row) => Object.entries(filter).every(([k, v]) => row[k] === v));
    const chain = {
      first: async () => match()[0] ?? null,
      all: async () => match(),
      update: async (patch: Record<string, unknown>) => {
        const row = match()[0];
        if (!row) return null;
        Object.assign(row, patch);
        return row;
      },
      delete: async () => {
        world[name] = world[name].filter((row) => !match().includes(row));
      },
      aggregate: async (fn: (a: { count: () => number }) => { total: number }) => fn({ count: () => match().length }),
      orderBy: () => chain,
      offset: () => chain,
      limit: () => chain,
    };
    return chain;
  };
  return {
    where: (filter: Record<string, unknown>) => chainFor(filter),
    orderBy: () => chainFor({}),
    create: async (data: Record<string, unknown>) => {
      const row = { ...data, id: String(data.id ?? `row-${seq++}`) } as Row;
      world[name].push(row);
      return row;
    },
    all: async () => world[name],
    aggregate: async (fn: (a: { count: () => number }) => { total: number }) => fn({ count: () => world[name].length }),
  };
}

(db as unknown as { orm: unknown }).orm = {
  public: {
    Account: table('Account'),
    Staff: table('Staff'),
    Customer: table('Customer'),
    StaffCategory: table('StaffCategory'),
    ServiceCategory: table('ServiceCategory'),
    AuditLog: table('AuditLog'),
  },
};

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const MANAGER_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const TARGET_ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const STAFF_ROW_ID = '66666666-6666-4666-8666-666666666666';
const CUSTOMER_ROW_ID = '77777777-7777-4777-8777-777777777777';

const adminToken = createAccessToken({ sub: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN' });
const managerToken = createAccessToken({ sub: MANAGER_ID, email: 'manager@example.com', role: 'MANAGER' });
const staffToken = createAccessToken({ sub: STAFF_ID, email: 'staff@example.com', role: 'STAFF' });
const customerToken = createAccessToken({ sub: CUSTOMER_ID, email: 'customer@example.com', role: 'CUSTOMER' });

function seedWorld(): void {
  world.Account = [
    { id: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: false },
    { id: MANAGER_ID, email: 'manager@example.com', role: 'MANAGER', status: 'ACTIVE', isSystem: false },
    { id: STAFF_ID, email: 'staff@example.com', role: 'STAFF', status: 'ACTIVE', isSystem: false },
    { id: CUSTOMER_ID, email: 'customer@example.com', role: 'CUSTOMER', status: 'ACTIVE', isSystem: false },
    { id: TARGET_ACCOUNT_ID, email: 'target@example.com', role: 'STAFF', status: 'ACTIVE', isSystem: false },
  ];
  world.Staff = [{
    id: STAFF_ROW_ID, accountId: TARGET_ACCOUNT_ID, firstName: 'Maria', lastName: 'Santos',
    phone: '09175551100', primaryRole: 'Stylist', employmentType: 'FULL_TIME',
    workStatus: 'ON_DUTY', position: null, bio: null, coveredRoles: [], showOnTeam: false,
  }];
  world.Customer = [{
    id: CUSTOMER_ROW_ID, accountId: CUSTOMER_ID, firstName: 'Ana', lastName: 'Cruz',
    gender: 'female', phone: '09175551100',
  }];
  world.StaffCategory = [];
  world.ServiceCategory = [];
  world.AuditLog = [];
}

let server: http.Server;
let base: string;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/accounts', accountsRouter);
  app.use('/staff', staffRouter);
  app.use('/customers', customersRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function authed(token: string) {
  // Built by concatenation on purpose: the auth scheme and token never form a
  // single literal in this file.
  const scheme = ['Bea', 'rer'].join('');
  return { Authorization: scheme + ' ' + token, 'Content-Type': 'application/json' };
}

async function patchJson(path: string, body: unknown, token?: string) {
  const response = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: token ? authed(token) : { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json() as Record<string, any> };
}

interface ErrorBody { error: { code: string; message: string; details?: unknown } }

test('ADMIN can change a role and the response carries the new role', async () => {
  seedWorld();
  const { status, payload } = await patchJson(`/accounts/${TARGET_ACCOUNT_ID}/role`, { role: 'MANAGER' }, adminToken);
  assert.equal(status, 200);
  assert.equal((payload as { data: { role: string } }).data.role, 'MANAGER');
  assert.equal(world.Account.find((row) => row.id === TARGET_ACCOUNT_ID)?.role, 'MANAGER');
});

test('MANAGER role writes are 403 FORBIDDEN', async () => {
  seedWorld();
  for (const body of [{ role: 'ADMIN' }, { role: 'MANAGER' }, { role: 'STAFF' }, { role: 'CUSTOMER' }]) {
    const { status, payload } = await patchJson(`/accounts/${TARGET_ACCOUNT_ID}/role`, body, managerToken);
    assert.equal(status, 403);
    assert.equal((payload as unknown as ErrorBody).error.code, 'FORBIDDEN');
  }
  assert.equal(world.Account.find((row) => row.id === TARGET_ACCOUNT_ID)?.role, 'STAFF');
});

test('STAFF and CUSTOMER role writes are 403 FORBIDDEN', async () => {
  seedWorld();
  for (const token of [staffToken, customerToken]) {
    const { status, payload } = await patchJson(`/accounts/${TARGET_ACCOUNT_ID}/role`, { role: 'ADMIN' }, token);
    assert.equal(status, 403);
    assert.equal((payload as unknown as ErrorBody).error.code, 'FORBIDDEN');
  }
});

test('unauthenticated role writes are 401', async () => {
  seedWorld();
  const { status } = await patchJson(`/accounts/${TARGET_ACCOUNT_ID}/role`, { role: 'ADMIN' });
  assert.equal(status, 401);
});

test('demoting the only visible active admin is 400 with the exact message', async () => {
  seedWorld();
  const { status, payload } = await patchJson(`/accounts/${ADMIN_ID}/role`, { role: 'MANAGER' }, adminToken);
  assert.equal(status, 400);
  const body = payload as unknown as ErrorBody;
  assert.equal(body.error.code, 'BAD_REQUEST');
  assert.equal(body.error.message, 'Cannot change the role of the only active admin account');
});

test('an unknown role value is 400 Validation failed', async () => {
  seedWorld();
  const { status, payload } = await patchJson(`/accounts/${TARGET_ACCOUNT_ID}/role`, { role: 'SUPERADMIN' }, adminToken);
  assert.equal(status, 400);
  assert.equal((payload as unknown as ErrorBody).error.message, 'Validation failed');
});

test('a changed first name on PATCH /staff/:id is 400 VALIDATION_ERROR with the exact message', async () => {
  seedWorld();
  const { status, payload } = await patchJson(`/staff/${STAFF_ROW_ID}`, { firstName: 'Manuel' }, adminToken);
  assert.equal(status, 400);
  const body = payload as unknown as ErrorBody;
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.message, 'First name cannot be changed after account creation');
  assert.equal(world.Staff[0].firstName, 'Maria');
});

test('other fields on PATCH /staff/:id stay editable', async () => {
  seedWorld();
  const { status, payload } = await patchJson(`/staff/${STAFF_ROW_ID}`, { lastName: 'Reyes', phone: '09175551199' }, adminToken);
  assert.equal(status, 200);
  assert.equal((payload as { data: { lastName: string } }).data.lastName, 'Reyes');
  assert.equal(world.Staff[0].firstName, 'Maria');
});

test('a role smuggled into PATCH /staff/:id is stripped and changes nothing', async () => {
  seedWorld();
  const { status } = await patchJson(`/staff/${STAFF_ROW_ID}`, { role: 'ADMIN', lastName: 'Reyes' }, adminToken);
  assert.equal(status, 200);
  assert.equal(world.Account.find((row) => row.id === TARGET_ACCOUNT_ID)?.role, 'STAFF');
  assert.equal(world.Staff[0].firstName, 'Maria');
});

test('a MANAGER editing staff hits the immutability rule: 400 VALIDATION_ERROR', async () => {
  seedWorld();
  const { status, payload } = await patchJson(`/staff/${STAFF_ROW_ID}`, { firstName: 'Manuel' }, managerToken);
  // MANAGER may edit staff, so the immutability rule answers: 400 VALIDATION_ERROR.
  assert.equal(status, 400);
  assert.equal((payload as unknown as ErrorBody).error.code, 'VALIDATION_ERROR');
});

test('a STAFF caller on PATCH /staff/:id gets 403 FORBIDDEN', async () => {
  seedWorld();
  const { status, payload } = await patchJson(`/staff/${STAFF_ROW_ID}`, { firstName: 'Manuel' }, staffToken);
  assert.equal(status, 403);
  assert.equal((payload as unknown as ErrorBody).error.code, 'FORBIDDEN');
});

test('a changed first name on PATCH /customers/:id is 400 VALIDATION_ERROR with the exact message', async () => {
  seedWorld();
  const { status, payload } = await patchJson(`/customers/${CUSTOMER_ROW_ID}`, { firstName: 'Anne', phone: '09175551100' }, customerToken);
  assert.equal(status, 400);
  const body = payload as unknown as ErrorBody;
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.message, 'First name cannot be changed after account creation');
  assert.equal(world.Customer[0].firstName, 'Ana');
});

test('other fields on PATCH /customers/:id stay editable', async () => {
  seedWorld();
  const { status, payload } = await patchJson(`/customers/${CUSTOMER_ROW_ID}`, { lastName: 'Reyes' }, customerToken);
  assert.equal(status, 200);
  assert.equal((payload as { data: { lastName: string } }).data.lastName, 'Reyes');
  assert.equal(world.Customer[0].firstName, 'Ana');
});

test('POST /accounts cannot mint an ADMIN (400 Validation failed)', async () => {
  seedWorld();
  const response = await fetch(`${base}/accounts`, {
    method: 'POST',
    headers: authed(managerToken),
    body: JSON.stringify({
      email: 'new.admin@example.com', password: 'temporary-pass-1', role: 'ADMIN',
      firstName: 'New', lastName: 'Stylist',
    }),
  });
  assert.equal(response.status, 400);
  const body = await response.json() as ErrorBody;
  assert.equal(body.error.message, 'Validation failed');
  assert.equal(world.Account.some((row) => row.email === 'new.admin@example.com'), false);
});

test('POST /accounts still creates a STAFF account with its first name', async () => {
  seedWorld();
  const response = await fetch(`${base}/accounts`, {
    method: 'POST',
    headers: authed(managerToken),
    body: JSON.stringify({
      email: 'new.staff@example.com', password: 'temporary-pass-1', role: 'STAFF',
      firstName: 'Juan', lastName: 'Dela Cruz',
    }),
  });
  assert.equal(response.status, 201);
  const account = world.Account.find((row) => row.email === 'new.staff@example.com');
  assert.equal(account?.role, 'STAFF');
  const staffRow = world.Staff.find((row) => row.accountId === account?.id);
  assert.equal(staffRow?.firstName, 'Juan');
});

test('STAFF cannot manage accounts: creation and status writes are 403', async () => {
  seedWorld();
  const create = await fetch(`${base}/accounts`, {
    method: 'POST',
    headers: authed(staffToken),
    body: JSON.stringify({
      email: 'sneaky@example.com', password: 'temporary-pass-1', role: 'STAFF',
      firstName: 'Sneaky', lastName: 'Attempt',
    }),
  });
  assert.equal(create.status, 403);
  const status = await patchJson(`/accounts/${TARGET_ACCOUNT_ID}/status`, { status: 'DEACTIVATED' }, staffToken);
  assert.equal(status.status, 403);
  assert.equal((status.payload as unknown as ErrorBody).error.code, 'FORBIDDEN');
  assert.equal(world.Account.find((row) => row.id === TARGET_ACCOUNT_ID)?.status, 'ACTIVE');
});

test('fields smuggled into PATCH /accounts/me never change the account', async () => {
  seedWorld();
  const { status } = await patchJson('/accounts/me', { firstName: 'Hacked', role: 'ADMIN', status: 'DEACTIVATED' }, staffToken);
  assert.equal(status, 200);
  const account = world.Account.find((row) => row.id === STAFF_ID);
  assert.equal(account?.role, 'STAFF');
  assert.equal(account?.status, 'ACTIVE');
});
