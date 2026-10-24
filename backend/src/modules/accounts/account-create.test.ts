import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { AccountService }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./accounts.service.js'),
]);

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CAT_ID = '44444444-0000-4000-8000-000000000003';

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

function seedWorld(): void {
  world.Account = [{ id: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: false }];
  world.Staff = [];
  world.StaffCategory = [];
  world.ServiceCategory = [{ id: CAT_ID, name: 'Hair Cutting', isActive: true }];
  world.AuditLog = [];
}

const baseInput = {
  email: 'new.staff@example.com',
  password: 'temporary-pass-1',
  role: 'STAFF' as const,
  firstName: 'New',
  lastName: 'Stylist',
  showOnTeam: true,
  specialties: [CAT_ID],
};

test('creating an ADMIN is refused (400) — no path creates an admin', async () => {
  seedWorld();
  await assert.rejects(
    () => AccountService.createStaffAccount({ ...baseInput, role: 'ADMIN' as never }, ADMIN_ID),
    /Only STAFF and MANAGER/,
  );
});

test('create STAFF with specialties: account + staff profile + staff_categories', async () => {
  seedWorld();
  const result = await AccountService.createStaffAccount(baseInput, ADMIN_ID);
  assert.ok(result.accountId);
  assert.ok(result.staffId);
  const account = world.Account.find((row) => row.id === result.accountId);
  assert.equal(account?.role, 'STAFF');
  assert.equal(account?.isSystem, false);
  const staff = world.Staff.find((row) => row.id === result.staffId);
  assert.equal(staff?.showOnTeam, true);
  const links = world.StaffCategory.filter((row) => row.staffId === result.staffId);
  assert.equal(links.length, 1);
  assert.equal(links[0].categoryId, CAT_ID);
});

test('team visibility requires at least one specialty', async () => {
  seedWorld();
  await assert.rejects(
    () => AccountService.createStaffAccount({ ...baseInput, specialties: [] }, ADMIN_ID),
    /at least one specialty/,
  );
});

test('duplicate email is a 409-mapped conflict', async () => {
  seedWorld();
  await AccountService.createStaffAccount(baseInput, ADMIN_ID);
  await assert.rejects(
    () => AccountService.createStaffAccount(baseInput, ADMIN_ID),
    /already exists/,
  );
});

test('unknown specialty category is rejected', async () => {
  seedWorld();
  await assert.rejects(
    () => AccountService.createStaffAccount({ ...baseInput, specialties: ['99999999-0000-4000-8000-000000000009'] }, ADMIN_ID),
    /Unknown category/,
  );
});

test('a non-admin/manager requester cannot create accounts', async () => {
  seedWorld();
  world.Account.push({ id: 'cust-1', email: 'c@example.com', role: 'CUSTOMER', status: 'ACTIVE', isSystem: false });
  await assert.rejects(
    () => AccountService.createStaffAccount(baseInput, 'cust-1'),
    /permission/,
  );
});
