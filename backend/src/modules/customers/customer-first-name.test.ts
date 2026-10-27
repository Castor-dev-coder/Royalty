// First-name immutability (§3): the customer profile is set at account
// creation (registration) and its first name can never be changed afterwards,
// by any role — ADMIN included. LastName, gender and phone stay editable.
// Fake ORM: these are rule tests, not database tests.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { CustomerService }, { ValidationError }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./customers.service.js'),
  import('../../errors/index.js'),
]);

interface Row extends Record<string, unknown> { id: string }
const world: Record<string, Row[]> = { Account: [], Customer: [], AuditLog: [] };
let nextId = 1;

function table(name: string) {
  return {
    where: (filter: Record<string, unknown>) => ({
      first: async () => world[name].find((row) => Object.entries(filter).every(([k, v]) => row[k] === v)) ?? null,
      all: async () => world[name].filter((row) => Object.entries(filter).every(([k, v]) => row[k] === v)),
      update: async (patch: Record<string, unknown>) => {
        const row = world[name].find((candidate) => Object.entries(filter).every(([k, v]) => candidate[k] === v));
        if (!row) return null;
        Object.assign(row, patch);
        return row;
      },
    }),
    create: async (data: Record<string, unknown>) => {
      const row = { ...data, id: String(data.id ?? `gen-${nextId++}`) } as Row;
      world[name].push(row);
      return row;
    },
  };
}

(db as unknown as { orm: unknown }).orm = {
  public: {
    Account: table('Account'),
    Customer: table('Customer'),
    AuditLog: table('AuditLog'),
  },
};

const CUSTOMER_ID = 'customer-row-1';
const ACCOUNT_ID = 'account-customer-1';
const ADMIN_ID = 'account-admin-1';
const MANAGER_ID = 'account-manager-1';

function seedWorld(): void {
  world.Account = [
    { id: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: false },
    { id: MANAGER_ID, email: 'manager@example.com', role: 'MANAGER', status: 'ACTIVE', isSystem: false },
    { id: ACCOUNT_ID, email: 'customer@example.com', role: 'CUSTOMER', status: 'ACTIVE', isSystem: false },
  ];
  world.Customer = [{
    id: CUSTOMER_ID, accountId: ACCOUNT_ID, firstName: 'Ana', lastName: 'Cruz',
    gender: 'female', phone: '09175551100',
  }];
  world.AuditLog = [];
}

function firstNameChangeCall(callerId: string, callerRole: string): Promise<unknown> {
  return CustomerService.update(
    CUSTOMER_ID,
    { firstName: 'Anne', lastName: 'Cruz', phone: '09175551100' },
    callerId,
    callerRole,
  );
}

test('allowed update: other customer fields change while the first name stays put', async () => {
  seedWorld();
  const updated = await CustomerService.update(
    CUSTOMER_ID,
    { lastName: 'Reyes', gender: 'X', phone: '09175551199' },
    ACCOUNT_ID,
    'CUSTOMER',
  );
  assert.equal(updated.lastName, 'Reyes');
  assert.equal(updated.phone, '09175551199');
  assert.equal(updated.firstName, 'Ana');
  assert.equal(world.Customer[0].firstName, 'Ana');
});

test('a CUSTOMER cannot change their own first name after account creation', async () => {
  seedWorld();
  await assert.rejects(
    () => firstNameChangeCall(ACCOUNT_ID, 'CUSTOMER'),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal((error as { statusCode: number }).statusCode, 400);
      assert.equal((error as { code: string }).code, 'VALIDATION_ERROR');
      assert.equal((error as Error).message, 'First name cannot be changed after account creation');
      return true;
    },
  );
  assert.equal(world.Customer[0].firstName, 'Ana');
});

test('an ADMIN cannot change a customer first name after account creation', async () => {
  seedWorld();
  await assert.rejects(
    () => firstNameChangeCall(ADMIN_ID, 'ADMIN'),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal((error as Error).message, 'First name cannot be changed after account creation');
      return true;
    },
  );
  assert.equal(world.Customer[0].firstName, 'Ana');
});

test('a MANAGER cannot change a customer first name after account creation', async () => {
  seedWorld();
  await assert.rejects(
    () => firstNameChangeCall(MANAGER_ID, 'MANAGER'),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal((error as Error).message, 'First name cannot be changed after account creation');
      return true;
    },
  );
  assert.equal(world.Customer[0].firstName, 'Ana');
});

test('a STAFF caller cannot change a customer first name', async () => {
  seedWorld();
  world.Account.push({ id: 'account-staff-1', email: 'staff@example.com', role: 'STAFF', status: 'ACTIVE', isSystem: false });
  await assert.rejects(() => firstNameChangeCall('account-staff-1', 'STAFF'), /permission/);
  assert.equal(world.Customer[0].firstName, 'Ana');
});

test('echoing the stored first name back is a no-op, not a change', async () => {
  seedWorld();
  const updated = await CustomerService.update(
    CUSTOMER_ID,
    { firstName: 'Ana', lastName: 'Reyes' },
    ACCOUNT_ID,
    'CUSTOMER',
  );
  assert.equal(updated.firstName, 'Ana');
  assert.equal(updated.lastName, 'Reyes');
});

test('create still accepts a first name and stores it', async () => {
  seedWorld();
  world.Account.push({ id: 'account-fresh', email: 'fresh@example.com', role: 'CUSTOMER', status: 'ACTIVE', isSystem: false });
  const created = await CustomerService.create(
    { accountId: 'account-fresh', firstName: 'Juan', lastName: 'Dela Cruz', phone: '09175551122' },
    ADMIN_ID,
    'ADMIN',
  );
  assert.equal(created.firstName, 'Juan');
  assert.equal(created.lastName, 'Dela Cruz');
});
