import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { AttendanceService }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./attendance.service.js'),
]);

const MANAGER = 'm1';
const OTHER_MANAGER = 'm2';
const ADMIN = 'a1';
const HIDDEN = 'sys1';
const STAFF_USER = 's1';

interface Row extends Record<string, unknown> { id: string }
const world: Record<string, Row[]> = { StaffAttendance: [], Account: [], Staff: [], AuditLog: [] };
let seq = 1;

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
      const row = { timeIn: new Date().toISOString(), timeOut: null, ...data, id: `row-${seq++}` } as Row;
      world[name].push(row);
      return row;
    },
    all: async () => world[name],
  };
}

(db as unknown as { orm: unknown }).orm = {
  public: {
    StaffAttendance: table('StaffAttendance'),
    Account: table('Account'),
    Staff: table('Staff'),
    AuditLog: table('AuditLog'),
  },
};

function seed(): void {
  world.StaffAttendance = [];
  world.AuditLog = [];
  world.Account = [
    { id: MANAGER, email: 'mgr1@example.com', role: 'MANAGER', status: 'ACTIVE', isSystem: false },
    { id: OTHER_MANAGER, email: 'mgr2@example.com', role: 'MANAGER', status: 'ACTIVE', isSystem: false },
    { id: ADMIN, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: false },
    { id: HIDDEN, email: 'hidden@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: true },
    { id: STAFF_USER, email: 'staff@example.com', role: 'STAFF', status: 'ACTIVE', isSystem: false },
  ];
  world.Staff = [
    { id: 'st-mgr1', accountId: MANAGER, firstName: 'Manny', lastName: 'One' },
    { id: 'st-mgr2', accountId: OTHER_MANAGER, firstName: 'Manny', lastName: 'Two' },
    { id: 'st-s1', accountId: STAFF_USER, firstName: 'Stella', lastName: 'Staff' },
  ];
}

test('manager can clock in and out', async () => {
  seed();
  const open = await AttendanceService.clockIn(MANAGER, 'MANAGER');
  assert.equal(open.timeOut, null);
  const closed = await AttendanceService.clockOut(MANAGER, 'MANAGER');
  assert.ok(closed.timeOut);
  assert.equal(closed.openTooLong, false);
});

test('double time-in is rejected', async () => {
  seed();
  await AttendanceService.clockIn(MANAGER, 'MANAGER');
  await assert.rejects(() => AttendanceService.clockIn(MANAGER, 'MANAGER'), /open shift/);
});

test('time-out without a shift is rejected', async () => {
  seed();
  await assert.rejects(() => AttendanceService.clockOut(MANAGER, 'MANAGER'), /no open shift/);
});

test('a manager cannot correct their own shift (403)', async () => {
  seed();
  const open = await AttendanceService.clockIn(MANAGER, 'MANAGER');
  await assert.rejects(
    () => AttendanceService.correct(MANAGER, 'MANAGER', open.id, { timeOut: new Date().toISOString() }),
    /own shifts/,
  );
});

test("another manager's correction is accepted and audited", async () => {
  seed();
  const open = await AttendanceService.clockIn(MANAGER, 'MANAGER');
  const corrected = await AttendanceService.correct(OTHER_MANAGER, 'MANAGER', open.id, {
    timeOut: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.ok(corrected.timeOut);
  const audit = world.AuditLog.filter((row) => row.action === 'CORRECT_ATTENDANCE' && row.entityId === open.id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorAccountId, OTHER_MANAGER);
});

test('ADMIN cannot clock in', async () => {
  seed();
  await assert.rejects(() => AttendanceService.clockIn(ADMIN, 'ADMIN'), /ADMIN accounts do not clock in/);
});

test('the hidden admin is absent from every attendance view', async () => {
  seed();
  await AttendanceService.clockIn(MANAGER, 'MANAGER');
  await AttendanceService.clockIn(STAFF_USER, 'STAFF');
  // Even a stray row owned by the hidden account must never surface.
  world.StaffAttendance.push({
    id: 'row-hidden',
    accountId: HIDDEN,
    staffId: null,
    timeIn: new Date().toISOString(),
    timeOut: null,
  });
  for (const viewer of [
    { userId: MANAGER, role: 'MANAGER', scope: 'all' },
    { userId: ADMIN, role: 'ADMIN', scope: 'all' },
  ]) {
    const records = await AttendanceService.list(viewer.userId, viewer.role, viewer.scope);
    assert.ok(!records.some((record) => record.accountId === HIDDEN));
    assert.ok(records.some((record) => record.accountId === MANAGER));
    assert.ok(records.some((record) => record.accountId === STAFF_USER));
  }
  const ownOnly = await AttendanceService.list(STAFF_USER, 'STAFF', 'mine');
  assert.equal(ownOnly.length, 1);
  assert.equal(ownOnly[0].accountId, STAFF_USER);
});

test('open shifts over 16 hours are flagged', async () => {
  seed();
  world.StaffAttendance.push({
    id: 'row-old',
    accountId: MANAGER,
    staffId: null,
    timeIn: new Date(Date.now() - 17 * 60 * 60 * 1000).toISOString(),
    timeOut: null,
  });
  const records = await AttendanceService.list(ADMIN, 'ADMIN', 'all');
  const flagged = records.find((record) => record.id === 'row-old');
  assert.equal(flagged?.openTooLong, true);
});
