// First-name immutability (§3): after account creation the first name can
// never be changed through the staff update path, by any role — ADMIN
// included. LastName and the other fields stay editable. Fake ORM: these are
// rule tests, not database tests (the hosted-DB suite is test:integration).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { StaffService }, { ValidationError, ForbiddenError }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./staff.service.js'),
  import('../../errors/index.js'),
]);

interface Row extends Record<string, unknown> { id: string }
const world: Record<string, Row[]> = { Account: [], Staff: [], StaffCategory: [], ServiceCategory: [], AuditLog: [] };
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
      delete: async () => {
        world[name] = world[name].filter((row) => !Object.entries(filter).every(([k, v]) => row[k] === v));
      },
    }),
    create: async (data: Record<string, unknown>) => {
      const row = { ...data, id: String(data.id ?? `gen-${nextId++}`) } as Row;
      world[name].push(row);
      return row;
    },
    all: async () => world[name],
    orderBy: () => ({ all: async () => world[name] }),
    aggregate: async (fn: (a: { count: () => number }) => { total: number }) => fn({ count: () => world[name].length }),
  };
}

(db as unknown as { orm: unknown }).orm = {
  public: {
    Account: table('Account'),
    Staff: table('Staff'),
    StaffCategory: table('StaffCategory'),
    ServiceCategory: table('ServiceCategory'),
    AuditLog: table('AuditLog'),
  },
};

const STAFF_ID = 'staff-row-1';
const ACCOUNT_ID = 'account-staff-1';
const ADMIN_ID = 'account-admin-1';
const MANAGER_ID = 'account-manager-1';
const OTHER_STAFF_ID = 'account-staff-2';
const CUSTOMER_ID = 'account-customer-1';

function seedWorld(): void {
  world.Account = [
    { id: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: false },
    { id: MANAGER_ID, email: 'manager@example.com', role: 'MANAGER', status: 'ACTIVE', isSystem: false },
    { id: ACCOUNT_ID, email: 'staff@example.com', role: 'STAFF', status: 'ACTIVE', isSystem: false },
    { id: OTHER_STAFF_ID, email: 'staff2@example.com', role: 'STAFF', status: 'ACTIVE', isSystem: false },
    { id: CUSTOMER_ID, email: 'customer@example.com', role: 'CUSTOMER', status: 'ACTIVE', isSystem: false },
  ];
  world.Staff = [{
    id: STAFF_ID, accountId: ACCOUNT_ID, firstName: 'Maria', lastName: 'Santos',
    phone: '09175551100', primaryRole: 'Stylist', employmentType: 'FULL_TIME',
    workStatus: 'ON_DUTY', position: null, bio: null, coveredRoles: [], showOnTeam: true,
  }];
  world.StaffCategory = [{ id: 'sc-1', staffId: STAFF_ID, categoryId: 'cat-1' }];
  world.ServiceCategory = [{ id: 'cat-1', name: 'Hair', isActive: true }];
  world.AuditLog = [];
}

test('allowed update: other fields change while the first name stays put', async () => {
  seedWorld();
  const updated = await StaffService.updateEmployment(
    STAFF_ID,
    { lastName: 'Reyes', phone: '09175551199', bio: 'New bio' },
    ADMIN_ID,
  );
  assert.equal(updated.lastName, 'Reyes');
  assert.equal(updated.phone, '09175551199');
  assert.equal(updated.firstName, 'Maria');
  assert.equal(world.Staff[0].firstName, 'Maria');
});

test('ADMIN cannot change the first name after account creation', async () => {
  seedWorld();
  await assert.rejects(
    () => StaffService.updateEmployment(STAFF_ID, { firstName: 'María' }, ADMIN_ID),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal((error as { statusCode: number }).statusCode, 400);
      assert.equal((error as { code: string }).code, 'VALIDATION_ERROR');
      assert.equal((error as Error).message, 'First name cannot be changed after account creation');
      return true;
    },
  );
  assert.equal(world.Staff[0].firstName, 'Maria');
});

test('MANAGER cannot change the first name after account creation', async () => {
  seedWorld();
  await assert.rejects(
    () => StaffService.updateEmployment(STAFF_ID, { firstName: 'Manuel' }, MANAGER_ID),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal((error as Error).message, 'First name cannot be changed after account creation');
      return true;
    },
  );
  assert.equal(world.Staff[0].firstName, 'Maria');
});

test('a STAFF caller cannot change any name through the staff update path', async () => {
  seedWorld();
  await assert.rejects(
    () => StaffService.updateEmployment(STAFF_ID, { firstName: 'Impostor' }, OTHER_STAFF_ID),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenError);
      assert.equal((error as { statusCode: number }).statusCode, 403);
      return true;
    },
  );
  assert.equal(world.Staff[0].firstName, 'Maria');
});

test('a CUSTOMER caller cannot change any name through the staff update path', async () => {
  seedWorld();
  await assert.rejects(
    () => StaffService.updateEmployment(STAFF_ID, { firstName: 'Impostor' }, CUSTOMER_ID),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenError);
      assert.equal((error as { statusCode: number }).statusCode, 403);
      return true;
    },
  );
  assert.equal(world.Staff[0].firstName, 'Maria');
});

test('echoing the stored first name back is a no-op, not a change', async () => {
  seedWorld();
  const updated = await StaffService.updateEmployment(
    STAFF_ID,
    { firstName: 'Maria', lastName: 'Reyes' },
    ADMIN_ID,
  );
  assert.equal(updated.firstName, 'Maria');
  assert.equal(updated.lastName, 'Reyes');
});

test('create still accepts a first name and stores it', async () => {
  seedWorld();
  world.Account.push({ id: 'account-fresh', email: 'fresh@example.com', role: 'STAFF', status: 'ACTIVE', isSystem: false });
  const created = await StaffService.create(
    {
      accountId: 'account-fresh',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      primaryRole: 'Stylist',
      employmentType: 'FULL_TIME',
    },
    ADMIN_ID,
  );
  assert.equal(created.firstName, 'Juan');
  assert.equal(created.lastName, 'Dela Cruz');
});
