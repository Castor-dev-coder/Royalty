// Integration guard: attendance timestamps against the REAL database, so
// codec mistakes (Temporal.Instant / PlainDate at the ORM boundary) fail the
// test run instead of surfacing live. Skips only when no real DATABASE_URL is
// provided. Creates its rows and deletes them again by exact id; never logs
// credentials or connection strings.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

// The suite's other files intentionally fake the DSN; this one must not.
if (!process.env.DATABASE_URL && existsSync('.env')) {
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (line) {
    const value = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
    process.env.DATABASE_URL = value;
  }
}
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const DB_URL = process.env.DATABASE_URL ?? '';
const REAL_DB = DB_URL !== '' && !DB_URL.includes('127.0.0.1:5');

test(
  'attendance timestamps round-trip against the real database (codec guard)',
  { skip: REAL_DB ? false : 'no real DATABASE_URL - integration skipped' },
  async () => {
    const { db } = await import('../../prisma/db.js');
    const { AttendanceService } = await import('../../modules/attendance/attendance.service.js');

    const accounts = await db.orm.public.Account.all();
    const manager = accounts.find((a: any) => a.role === 'MANAGER' && !a.isSystem);
    const admin = accounts.find((a: any) => a.role === 'ADMIN' && !a.isSystem);
    assert.ok(manager, 'a non-system MANAGER account must exist');

    const created: string[] = [];
    try {
      // create: timeIn comes back from the database default
      const open = await AttendanceService.clockIn(String((manager as any).id), 'MANAGER');
      created.push(open.id);
      assert.ok(!Number.isNaN(Date.parse(open.timeIn)), 'timeIn must parse as a timestamp');
      assert.equal(open.timeOut, null);

      // open-shift filter (NULL comparison through the codec): second clock-in conflicts
      await assert.rejects(() => AttendanceService.clockIn(String((manager as any).id), 'MANAGER'), /open shift/);

      // update: timeOut is written as Temporal.Instant - the codec bug class
      const closed = await AttendanceService.clockOut(String((manager as any).id), 'MANAGER');
      assert.ok(closed.timeOut, 'timeOut must be persisted');
      assert.ok(Date.parse(closed.timeOut) > Date.parse(closed.timeIn), 'timeOut must be after timeIn');

      if (admin) {
        // correction writes timestamps through the same codec path and is audited
        const corrected = await AttendanceService.correct(String((admin as any).id), 'ADMIN', open.id, {
          timeOut: new Date(Date.now() + 60_000).toISOString(),
        });
        assert.ok(corrected.timeOut, 'corrected timeOut must be persisted');
      }
    } finally {
      // clean up by exact id
      for (const id of created) await db.orm.public.StaffAttendance.where({ id }).delete();
    }
  },
);
