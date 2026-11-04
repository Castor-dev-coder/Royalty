// Staff attendance: clock in / clock out / view / corrections.
//
// Timestamps come from the server only (never from the client). STAFF and
// MANAGER clock; ADMIN accounts never do (and so never have rows). The hidden
// system account is filtered out of every view. Corrections are audited, and a
// manager may never correct their own shifts — only an ADMIN or another
// manager can.
import { db } from '../../prisma/db.js'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js'
import { generateAuditLog } from '../../utils/audit.js'
import { toTemporalInstant } from '../../utils/date-time.js'

export const OPEN_TOO_LONG_MS = 16 * 60 * 60 * 1000

export interface AttendanceRecord {
  id: string
  accountId: string | null
  staffId: string | null
  firstName: string
  lastName: string
  role: string
  timeIn: string
  timeOut: string | null
  openTooLong: boolean
}

function displayFor(row: Record<string, unknown>): { firstName: string; lastName: string; role: string } {
  return {
    firstName: String(row.firstName ?? ''),
    lastName: String(row.lastName ?? ''),
    role: String(row.role ?? 'STAFF'),
  }
}

async function toRecord(row: Record<string, unknown>): Promise<AttendanceRecord> {
  let firstName = ''
  let lastName = ''
  let role = 'STAFF'
  if (row.accountId) {
    const account = await db.orm.public.Account.where({ id: String(row.accountId) }).first()
    if (account) {
      role = String(account.role)
      const staff = await db.orm.public.Staff.where({ accountId: String(row.accountId) }).first()
      if (staff) {
        firstName = String(staff.firstName ?? '')
        lastName = String(staff.lastName ?? '')
      } else {
        const email = String(account.email ?? '')
        firstName = email.split('@')[0] ?? ''
      }
    }
  } else if (row.staffId) {
    const staff = await db.orm.public.Staff.where({ id: String(row.staffId) }).first()
    if (staff) ({ firstName, lastName } = displayFor({ firstName: staff.firstName, lastName: staff.lastName, role: 'STAFF' }))
  }
  const timeIn = new Date(String(row.timeIn)).toISOString()
  const timeOut = row.timeOut ? new Date(String(row.timeOut)).toISOString() : null
  return {
    id: String(row.id),
    accountId: row.accountId ? String(row.accountId) : null,
    staffId: row.staffId ? String(row.staffId) : null,
    firstName,
    lastName,
    role,
    timeIn,
    timeOut,
    openTooLong: timeOut === null && Date.now() - new Date(timeIn).getTime() > OPEN_TOO_LONG_MS,
  }
}

export class AttendanceService {
  /** POST /attendance/clock-in — one open shift per account. */
  static async clockIn(userId: string, role: string): Promise<AttendanceRecord> {
    if (role === 'ADMIN') {
      throw new BadRequestError('ADMIN accounts do not clock in')
    }
    const open = await db.orm.public.StaffAttendance.where({ accountId: userId, timeOut: null }).first()
    if (open) throw new ConflictError('You already have an open shift')
    // timeIn is set by the database default (server timestamp).
    const row = await db.orm.public.StaffAttendance.create({ accountId: userId, staffId: null })
    return toRecord(row)
  }

  /** POST /attendance/clock-out. */
  static async clockOut(userId: string, role: string): Promise<AttendanceRecord> {
    if (role === 'ADMIN') {
      throw new BadRequestError('ADMIN accounts do not clock out')
    }
    const open = await db.orm.public.StaffAttendance.where({ accountId: userId, timeOut: null }).first()
    if (!open) throw new BadRequestError('You have no open shift to end')
    const updated = await db.orm.public.StaffAttendance.where({ id: open.id }).update({ timeOut: toTemporalInstant(new Date()) })
    return toRecord(updated ?? open)
  }

  /** GET /attendance — STAFF see only themselves; MANAGER/ADMIN see all. */
  static async list(userId: string, role: string, scope: string): Promise<AttendanceRecord[]> {
    const all = await db.orm.public.StaffAttendance.all()
    const rows: AttendanceRecord[] = []
    for (const row of all) {
      if (row.accountId && String(row.accountId) === userId && (role === 'STAFF' || scope === 'mine')) {
        rows.push(await toRecord(row))
        continue
      }
      if (role === 'STAFF' || scope === 'mine') continue
      // Hidden (system) accounts never appear in any attendance view.
      if (row.accountId) {
        const account = await db.orm.public.Account.where({ id: String(row.accountId) }).first()
        if (!account || account.isSystem) continue
      }
      rows.push(await toRecord(row))
    }
    return rows.sort((a, b) => b.timeIn.localeCompare(a.timeIn))
  }

  /** PATCH /attendance/:id — audited corrections; never self-corrections. */
  static async correct(
    userId: string,
    role: string,
    recordId: string,
    patch: { timeIn?: string; timeOut?: string | null },
  ): Promise<AttendanceRecord> {
    if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenError('Only managers and admins can correct attendance')
    }
    const row = await db.orm.public.StaffAttendance.where({ id: recordId }).first()
    if (!row) throw new NotFoundError('Attendance record not found')
    if (row.accountId && String(row.accountId) === userId) {
      throw new ForbiddenError('A manager cannot correct their own shifts')
    }

    const nextTimeIn = patch.timeIn ? new Date(patch.timeIn) : new Date(String(row.timeIn))
    if (Number.isNaN(nextTimeIn.getTime())) throw new BadRequestError('timeIn must be a valid timestamp')
    let nextTimeOut: Date | null = null
    if (patch.timeOut !== undefined) {
      if (patch.timeOut !== null) {
        nextTimeOut = new Date(patch.timeOut)
        if (Number.isNaN(nextTimeOut.getTime())) throw new BadRequestError('timeOut must be a valid timestamp')
      }
    } else if (row.timeOut) {
      nextTimeOut = new Date(String(row.timeOut))
    }
    if (nextTimeOut && nextTimeOut.getTime() <= nextTimeIn.getTime()) {
      throw new BadRequestError('timeOut must be after timeIn')
    }

    const updated = await db.orm.public.StaffAttendance.where({ id: recordId }).update({
      timeIn: toTemporalInstant(nextTimeIn),
      timeOut: nextTimeOut ? toTemporalInstant(nextTimeOut) : null,
    })
    await generateAuditLog({
      actorAccountId: userId,
      action: 'CORRECT_ATTENDANCE',
      entityType: 'StaffAttendance',
      entityId: recordId,
      oldData: { timeIn: row.timeIn, timeOut: row.timeOut },
      newData: { timeIn: nextTimeIn, timeOut: nextTimeOut },
    })
    return toRecord(updated ?? row)
  }
}
