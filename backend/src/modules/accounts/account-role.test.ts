// Role authorization (§3): only ADMIN may write an account's role; MANAGER,
// STAFF and CUSTOMER attempts are refused. No creation path can mint an ADMIN
// (hidden-admin prevention), and smuggled payload fields never become stored
// state. Fake ORM: these are rule tests, not database tests.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { AccountService }, { updateAccountRoleSchema, createStaffAccountSchema }, { ForbiddenError, BadRequestError, NotFoundError }] =
  await Promise.all([
    import('../../prisma/db.js'),
    import('./accounts.service.js'),
    import('./accounts.schemas.js'),
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
      aggregate: async (fn: (a: { count: () => number }) => { total: number }) =>
        fn({ count: () => world[name].filter((row) => Object.entries(filter).every(([k, v]) => row[k] === v)).length }),
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

const ADMIN_ID = 'account-admin-1';
const SECOND_ADMIN_ID = 'account-admin-2';
const MANAGER_ID = 'account-manager-1';
const STAFF_ID = 'account-staff-1';
const CUSTOMER_ID = 'account-customer-1';
const TARGET_ID = 'account-target-1';
const SYSTEM_ID = 'account-system-1';

function seedWorld(): void {
  world.Account = [
    { id: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: false },
    { id: MANAGER_ID, email: 'manager@example.com', role: 'MANAGER', status: 'ACTIVE', isSystem: false },
    { id: STAFF_ID, email: 'staff@example.com', role: 'STAFF', status: 'ACTIVE', isSystem: false },
    { id: CUSTOMER_ID, email: 'customer@example.com', role: 'CUSTOMER', status: 'ACTIVE', isSystem: false },
    { id: TARGET_ID, email: 'target@example.com', role: 'STAFF', status: 'ACTIVE', isSystem: false },
    { id: SYSTEM_ID, email: 'system@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: true },
  ];
  world.Staff = [];
  world.StaffCategory = [];
  world.ServiceCategory = [];
  world.AuditLog = [];
}

test('ADMIN can promote an account to MANAGER and the change persists', async () => {
  seedWorld();
  const updated = await AccountService.updateRole(TARGET_ID, 'MANAGER', ADMIN_ID);
  assert.equal(updated.role, 'MANAGER');
  assert.equal(world.Account.find((row) => row.id === TARGET_ID)?.role, 'MANAGER');
  assert.ok(world.AuditLog.some((row) => row.action === 'UPDATE_ACCOUNT_ROLE' && row.entityId === TARGET_ID));
});

test('ADMIN can promote an account to ADMIN', async () => {
  seedWorld();
  const updated = await AccountService.updateRole(TARGET_ID, 'ADMIN', ADMIN_ID);
  assert.equal(updated.role, 'ADMIN');
});

test('ADMIN can demote a MANAGER to STAFF', async () => {
  seedWorld();
  const updated = await AccountService.updateRole(MANAGER_ID, 'STAFF', ADMIN_ID);
  assert.equal(updated.role, 'STAFF');
});

test('MANAGER cannot write any role (promote, demote, or self-promote)', async () => {
  seedWorld();
  for (const [target, role] of [[TARGET_ID, 'ADMIN'], [TARGET_ID, 'STAFF'], [MANAGER_ID, 'ADMIN']] as const) {
    await assert.rejects(
      () => AccountService.updateRole(target, role, MANAGER_ID),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError);
        assert.equal((error as { statusCode: number }).statusCode, 403);
        assert.equal((error as Error).message, 'Only administrators can change account roles');
        return true;
      },
    );
  }
  assert.equal(world.Account.find((row) => row.id === TARGET_ID)?.role, 'STAFF');
  assert.equal(world.Account.find((row) => row.id === MANAGER_ID)?.role, 'MANAGER');
});

test('STAFF and CUSTOMER cannot write any role', async () => {
  seedWorld();
  for (const caller of [STAFF_ID, CUSTOMER_ID]) {
    await assert.rejects(
      () => AccountService.updateRole(TARGET_ID, 'ADMIN', caller),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError);
        return true;
      },
    );
  }
  assert.equal(world.Account.find((row) => row.id === TARGET_ID)?.role, 'STAFF');
});

test('the last visible active admin cannot be demoted', async () => {
  seedWorld();
  await assert.rejects(
    () => AccountService.updateRole(ADMIN_ID, 'MANAGER', ADMIN_ID),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestError);
      assert.equal((error as Error).message, 'Cannot change the role of the only active admin account');
      return true;
    },
  );
  assert.equal(world.Account.find((row) => row.id === ADMIN_ID)?.role, 'ADMIN');
});

test('an admin can be demoted while a second active admin remains', async () => {
  seedWorld();
  world.Account.push({ id: SECOND_ADMIN_ID, email: 'admin2@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: false });
  const updated = await AccountService.updateRole(SECOND_ADMIN_ID, 'MANAGER', ADMIN_ID);
  assert.equal(updated.role, 'MANAGER');
});

test('role changes on the hidden system account return 404', async () => {
  seedWorld();
  await assert.rejects(
    () => AccountService.updateRole(SYSTEM_ID, 'STAFF', ADMIN_ID),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundError);
      assert.equal((error as { statusCode: number }).statusCode, 404);
      return true;
    },
  );
});

test('role changes on an unknown account return 404', async () => {
  seedWorld();
  await assert.rejects(
    () => AccountService.updateRole('00000000-0000-4000-8000-000000000000', 'STAFF', ADMIN_ID),
    NotFoundError,
  );
});

test('no creation path accepts an ADMIN role, not even for an ADMIN caller', async () => {
  seedWorld();
  for (const caller of [ADMIN_ID, MANAGER_ID]) {
    await assert.rejects(
      () => AccountService.createStaffAccount({
        email: 'new@example.com',
        password: 'temporary-pass-1',
        role: 'ADMIN' as never,
        firstName: 'New',
        lastName: 'Stylist',
      }, caller),
      BadRequestError,
    );
  }
  assert.equal(world.Account.some((row) => row.email === 'new@example.com'), false);
});

test('the creation schema refuses an ADMIN role outright', () => {
  assert.equal(createStaffAccountSchema.safeParse({
    email: 'new@example.com', password: 'temporary-pass-1', role: 'ADMIN', firstName: 'New', lastName: 'Stylist',
  }).success, false);
});

test('smuggled fields in account creation never become stored state', async () => {
  seedWorld();
  const result = await AccountService.createStaffAccount({
    email: 'smuggled@example.com',
    password: 'temporary-pass-1',
    role: 'STAFF',
    firstName: 'Sly',
    lastName: 'Fields',
    // Attempted privilege smuggles, ignored by the service:
    isSystem: true,
    status: 'DEACTIVATED',
    passwordHash: 'attacker-chosen',
  } as never, ADMIN_ID);
  const account = world.Account.find((row) => row.id === result.accountId);
  assert.equal(account?.isSystem, false);
  assert.equal(account?.status, 'ACTIVE');
  assert.equal(account?.role, 'STAFF');
  assert.notEqual(account?.passwordHash, 'attacker-chosen');
});

test('the role-update schema strips smuggled fields and rejects unknown roles', () => {
  const parsed = updateAccountRoleSchema.safeParse({ role: 'MANAGER', isSystem: true, status: 'DEACTIVATED' });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success && parsed.data, { role: 'MANAGER' });
  assert.equal(updateAccountRoleSchema.safeParse({ role: 'SUPERADMIN' }).success, false);
});
