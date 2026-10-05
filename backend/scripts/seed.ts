/*
 * ============================================================================
 * PRODUCTION DEPLOYMENT SAFETY — REMOVE DEVELOPMENT SEED
 * ============================================================================
 *
 * This file inserts DETERMINISTIC DEVELOPMENT/TEST FIXTURES into the shared
 * database. It is a development utility and MUST NOT be part of any production
 * startup, build, migration, or deploy command.
 *
 * Before ANY production deployment, complete every step below:
 *
 *   1. Remove/disable the `db:seed` package command from the production
 *      workflow (build, start, release, and deploy scripts).
 *   2. Remove development seed data from the shared development database when
 *      it is no longer needed (`npm run db:seed:remove`, see REMOVAL below).
 *   3. Remove `SEED_ADMIN_PASSWORD`, `SEED_CUSTOMER_PASSWORD`, and
 *      `SEED_STAFF_PASSWORD` from deployment/production environment
 *      configuration.
 *   4. Do NOT copy seed credentials into Render/Vercel/production secrets.
 *   5. Confirm `db:seed` is not part of any production startup/build/deploy
 *      command.
 *   6. Confirm this script is not being used as production application
 *      initialization (it must never be the way a production database is
 *      populated).
 *   7. Keep `db:seed:remove` available only for deliberate development
 *      cleanup.
 *   8. Re-check this list before the final production deployment.
 *
 * The seed accounts use the reserved `@seed.royalty.local` email domain and a
 * real bcrypt password hash, so they are genuine credentials. Removing them
 * from the database without also removing the environment variables would
 * leave a usable ADMIN account behind.
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * BUSINESS HOURS LIMITATION (read before seeding a shared database)
 * ---------------------------------------------------------------------------
 *
 * `business_hours.day_of_week` is GLOBALLY UNIQUE (`unique_business_day`, one
 * row per weekday 0-6, so at most 7 rows can ever exist in the table).
 *
 * That means the seeded business hours CANNOT coexist with any other
 * business-hours configuration. This seed is therefore only safe when the
 * shared development database's business hours are intended to BE the seeded
 * configuration. If the database later needs different hours, this seed's rows
 * must be replaced, not supplemented.
 *
 * Note also that the existing application path
 * `PATCH /schedules/business-hours` (ADMIN/MANAGER only) performs a full
 * replacement: `BusinessHour.where({}).delete()` followed by inserts of all 7
 * days. Calling it will therefore destroy the seeded business-hours rows.
 * That is pre-existing application behaviour and is intentionally NOT changed
 * here.
 *
 * ---------------------------------------------------------------------------
 * ISOLATION MODEL
 * ---------------------------------------------------------------------------
 *
 * There is no separate development/test database, so isolation is logical:
 *
 *   - Every seeded row has a fixed UUID from a visually distinct namespace
 *     (11111111-..., 22222222-..., etc.), so seed rows are recognisable in any
 *     query output and separable from real data by ID.
 *   - Accounts use the reserved `@seed.royalty.local` email domain.
 *   - Appointments use the fixed `APT-SEED-####` code series.
 *
 * Idempotency and conflict detection key ONLY on those deterministic UUIDs and
 * appointment codes — never on dates. Appointment dates are deliberately
 * relative to the studio-local "today" so the fixture stays valid when the seed
 * is run months later, which means a re-run on a different day legitimately
 * produces different date values for the same fixed IDs. That must not be
 * mistaken for a conflicting dataset.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCRIPT NEVER TOUCHES
 * ---------------------------------------------------------------------------
 *
 * The unrelated external tables `post`, `posts`, `user`, `users` are declared
 * `@@control(external)` in the Prisma contract. They are not part of the
 * contract at all, so no write in this file can address them. They are also
 * never named in any write or delete below.
 *
 * This script never issues TRUNCATE, never deletes by a broad/unfiltered
 * predicate, and never uses `where({}).delete()`. Every delete is scoped to an
 * explicit list of deterministic seed UUIDs.
 *
 * ---------------------------------------------------------------------------
 * VALIDATION
 * ---------------------------------------------------------------------------
 *
 * Direct ORM writes bypass the Zod schemas and the service layer entirely, so
 * this script re-implements the relevant application limits and FAILS BEFORE
 * OPENING THE TRANSACTION if the fixture itself is invalid.
 *
 * ---------------------------------------------------------------------------
 * REMOVAL
 * ---------------------------------------------------------------------------
 *
 * `npm run db:seed:remove` tears the dataset down. It is deliberately NOT
 * reachable through `db:seed`, and it REFUSES TO RUN unless
 * `SEED_REMOVE_CONFIRM=royalty-seed-delete` is set explicitly. That variable is
 * never defaulted, so a stray invocation cannot delete anything.
 *
 * Teardown only deletes rows whose deterministic IDs match the expected
 * SEED_VERSION; anything unexpected is refused rather than deleted.
 */

import bcrypt from 'bcryptjs';
import { db } from '../src/prisma/db.js';
import { env } from '../src/config/env.js';
import { pgNumeric, pgVarchar } from '../src/prisma/contract-compat.js';
import { localDateAndTime } from '../src/modules/appointments/appointments.rules.js';

// ===========================================================================
// SEED VERSION
// ===========================================================================

/**
 * Bump this when the expected fixture content changes. Teardown refuses to
 * delete rows that do not match the version it was written for.
 */
const SEED_VERSION = '1';

/** Reserved email domain for seeded accounts. */
const SEED_EMAIL_DOMAIN = '@seed.royalty.local';

/** Value that must be set explicitly to authorise teardown. Never defaulted. */
const REMOVE_CONFIRMATION_VALUE = 'royalty-seed-delete';

/** Number of tables the seed writes to. */
const SEED_TABLE_COUNT = 10;

// ===========================================================================
// DETERMINISTIC IDENTIFIERS
// ===========================================================================

const ID = {
  adminAccount: '11111111-0000-4000-8000-000000000001',
  customerAccount: '11111111-0000-4000-8000-000000000002',
  staffAccount: '11111111-0000-4000-8000-000000000003',
  customer: '22222222-0000-4000-8000-000000000001',
  staff: '33333333-0000-4000-8000-000000000001',
  categoryHair: '44444444-0000-4000-8000-000000000001',
  categoryNails: '44444444-0000-4000-8000-000000000002',
  serviceHaircut: '55555555-0000-4000-8000-000000000001',
  serviceHairColor: '55555555-0000-4000-8000-000000000002',
  serviceGelManicure: '55555555-0000-4000-8000-000000000003',
  serviceSpaPedicure: '55555555-0000-4000-8000-000000000004',
  // business hours: one per PostgreSQL weekday 0-6 (0 = Sunday)
  businessHours: [
    '77777777-0000-4000-8000-000000000000',
    '77777777-0000-4000-8000-000000000001',
    '77777777-0000-4000-8000-000000000002',
    '77777777-0000-4000-8000-000000000003',
    '77777777-0000-4000-8000-000000000004',
    '77777777-0000-4000-8000-000000000005',
    '77777777-0000-4000-8000-000000000006',
  ],
  scheduleMonday: '88888888-0000-4000-8000-000000000001',
  scheduleTuesday: '88888888-0000-4000-8000-000000000002',
  // appointments
  apptPastCompleted: '99999999-0000-4000-8000-000000000001',
  apptPastConfirmed: '99999999-0000-4000-8000-000000000002',
  apptFutureReserved: '99999999-0000-4000-8000-000000000003',
  apptFutureReserved2: '99999999-0000-4000-8000-000000000004',
} as const;

/** `appointment_services` has no `id`; it is keyed by its appointment pair. */
const APPOINTMENT_SERVICES: ReadonlyArray<{
  appointmentId: string;
  serviceId: string;
  serviceName: string;
  price: string;
  durationMinutes: number;
}> = [
  // APT-SEED-0001 — Signature Haircut + Hair Color (165 min, 2250.00)
  { appointmentId: ID.apptFutureReserved, serviceId: ID.serviceHaircut, serviceName: 'Signature Haircut', price: '450.00', durationMinutes: 45 },
  { appointmentId: ID.apptFutureReserved, serviceId: ID.serviceHairColor, serviceName: 'Hair Color', price: '1800.00', durationMinutes: 120 },
  // APT-SEED-0002 — Gel Manicure (60 min, 600.00)
  { appointmentId: ID.apptPastConfirmed, serviceId: ID.serviceGelManicure, serviceName: 'Gel Manicure', price: '600.00', durationMinutes: 60 },
  // APT-SEED-0003 — Gel Manicure (60 min, 600.00) — enables reviews
  { appointmentId: ID.apptPastCompleted, serviceId: ID.serviceGelManicure, serviceName: 'Gel Manicure', price: '600.00', durationMinutes: 60 },
  // APT-SEED-0004 — Gel Manicure + Spa Pedicure (135 min, 1900.00)
  { appointmentId: ID.apptFutureReserved2, serviceId: ID.serviceGelManicure, serviceName: 'Gel Manicure', price: '600.00', durationMinutes: 60 },
  { appointmentId: ID.apptFutureReserved2, serviceId: ID.serviceSpaPedicure, serviceName: 'Spa Pedicure', price: '950.00', durationMinutes: 75 },
];

const APPOINTMENT_CODES = {
  apptFutureReserved: 'APT-SEED-0001',   // next Monday, 2 services, RESERVED
  apptPastConfirmed: 'APT-SEED-0002',    // past Tuesday, 1 service, CONFIRMED
  apptPastCompleted: 'APT-SEED-0003',    // past Tuesday, 1 service, COMPLETED
  apptFutureReserved2: 'APT-SEED-0004', // next Tuesday, 2 services, RESERVED
} as const;

/** Flat list of every seeded appointment code (used for conflict detection). */
const APPOINTMENT_CODE_LIST: string[] = Object.values(APPOINTMENT_CODES);

/** Fixed past date so `effective_from <= any fixture date` always holds. */
const SCHEDULE_EFFECTIVE_FROM = '2026-01-05';

/** Staff availability window; every seeded appointment must fit inside it. */
const STAFF_WINDOW = { start: '09:00', end: '17:00' } as const;

/** Business hours for open days; every seeded appointment must fit inside. */
const BUSINESS_WINDOW = { start: '09:00', end: '18:00' } as const;

/** Seeded staff schedules, keyed by PostgreSQL weekday 0-6 (Monday=1, Tuesday=2). */
const SCHEDULES: ReadonlyArray<{
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}> = [
  { id: ID.scheduleMonday, dayOfWeek: 1, startTime: STAFF_WINDOW.start, endTime: STAFF_WINDOW.end },
  { id: ID.scheduleTuesday, dayOfWeek: 2, startTime: STAFF_WINDOW.start, endTime: STAFF_WINDOW.end },
];

// ===========================================================================
// FIXTURE DEFINITION
// ===========================================================================

type AppointmentStatus = 'RESERVED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

type ServiceDef = {
  id: string;
  categoryId: string;
  name: string;
  price: string;
  durationMinutes: number;
};

type AppointmentDef = {
  id: string;
  code: string;
  /** ISO weekday 1-7 (Monday=1) that this appointment must fall on. */
  isoWeekday: number;
  /** How the date is chosen, relative to the studio-local today. */
  dateStrategy: 'nextWeekday' | 'strictlyFutureWeekday' | 'pastWeekday';
  daysAgo?: number;
  startTime: string;
  endTime: string;
  totalAmount: string;
  status: AppointmentStatus;
  /** Service IDs attached to this appointment. */
  serviceIds: string[];
};

const SERVICES: ServiceDef[] = [
  { id: ID.serviceHaircut, categoryId: ID.categoryHair, name: 'Signature Haircut', price: '450.00', durationMinutes: 45 },
  { id: ID.serviceHairColor, categoryId: ID.categoryHair, name: 'Hair Color', price: '1800.00', durationMinutes: 120 },
  { id: ID.serviceGelManicure, categoryId: ID.categoryNails, name: 'Gel Manicure', price: '600.00', durationMinutes: 60 },
  { id: ID.serviceSpaPedicure, categoryId: ID.categoryNails, name: 'Spa Pedicure', price: '950.00', durationMinutes: 75 },
];

const APPOINTMENTS: AppointmentDef[] = [
  {
    id: ID.apptFutureReserved,
    code: APPOINTMENT_CODES.apptFutureReserved,
    isoWeekday: 1, // Monday — has a seeded staff schedule
    // Strictly future: never today's Monday, so 10:00-12:45 is always ahead of
    // the clock no matter what time the seed runs.
    dateStrategy: 'strictlyFutureWeekday',
    startTime: '10:00',
    endTime: '12:45', // 45 + 120 = 165 minutes
    totalAmount: '2250.00',
    status: 'RESERVED',
    serviceIds: [ID.serviceHaircut, ID.serviceHairColor],
  },
  {
    id: ID.apptPastConfirmed,
    code: APPOINTMENT_CODES.apptPastConfirmed,
    isoWeekday: 2, // Tuesday — has a seeded staff schedule
    dateStrategy: 'pastWeekday',
    daysAgo: 7,
    startTime: '09:00',
    endTime: '10:00', // 60 minutes
    totalAmount: '600.00',
    status: 'CONFIRMED',
    serviceIds: [ID.serviceGelManicure],
  },
  {
    id: ID.apptPastCompleted,
    code: APPOINTMENT_CODES.apptPastCompleted,
    isoWeekday: 2, // Tuesday
    dateStrategy: 'pastWeekday',
    daysAgo: 30,
    startTime: '09:00',
    endTime: '10:00', // 60 minutes
    totalAmount: '600.00',
    status: 'COMPLETED',
    serviceIds: [ID.serviceGelManicure],
  },
  {
    id: ID.apptFutureReserved2,
    code: APPOINTMENT_CODES.apptFutureReserved2,
    isoWeekday: 2, // Tuesday
    dateStrategy: 'nextWeekday',
    startTime: '13:00',
    endTime: '15:15', // 60 + 75 = 135 minutes
    totalAmount: '1550.00',
    status: 'RESERVED',
    serviceIds: [ID.serviceGelManicure, ID.serviceSpaPedicure],
  },
];

/** Exact number of rows the seed inserts, derived so it cannot drift. */
const SEED_ROW_COUNT =
  3 +                                    // accounts
  1 +                                    // customers
  1 +                                    // staff
  2 +                                    // service_categories
  SERVICES.length +                      // services
  SERVICES.length +                      // staff_services (one per service)
  ID.businessHours.length +              // business_hours (7)
  SCHEDULES.length +                     // staff_schedules
  APPOINTMENTS.length +                  // appointments
  APPOINTMENT_SERVICES.length;           // appointment_services

// ===========================================================================
// DATE HELPERS (studio-local, never UTC)
// ===========================================================================

/** `YYYY-MM-DD` for a Date shifted by whole days, computed in UTC space. */
/*
 * Minimal ambient declarations for the Temporal subset this script uses.
 *
 * `Temporal` is a Node runtime global (Node 22+; this project runs Node 26) but
 * TypeScript 5.9's bundled `lib.*.d.ts` files do not yet declare it, and there is
 * no `@types/temporal` installed. Only the two types the seed actually
 * constructs are declared here, which is enough for type-checking without
 * changing tsconfig.json or adding a dependency.
 */
type PlainTime = { hour: number; minute: number; second: number };
type PlainDate = { year: number; month: number; day: number };

declare const Temporal: {
  PlainTime: {
    from(value: string): PlainTime & { toString(): string };
  };
  PlainDate: {
    from(value: string): PlainDate & { toString(): string };
  };
};

function shiftDate(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** ISO weekday 1-7 (Monday=1 ... Sunday=7) for a `YYYY-MM-DD` string. */
function isoWeekdayOf(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** ISO weekday 1-7 -> PostgreSQL weekday 0-6 (Sunday=0 ... Saturday=6). */
function isoWeekdayToPostgres(isoWeekday: number): number {
  return isoWeekday === 7 ? 0 : isoWeekday;
}

/** Nearest date (today or later) whose ISO weekday matches. */
function nextWeekdayOnOrAfter(today: string, isoWeekday: number): string {
  for (let offset = 0; offset <= 6; offset += 1) {
    const candidate = shiftDate(today, offset);
    if (isoWeekdayOf(candidate) === isoWeekday) return candidate;
  }
  throw new Error(`Could not resolve next ISO weekday ${isoWeekday}`);
}

/**
 * Nearest date STRICTLY AFTER `today` whose ISO weekday matches.
 *
 * Used by the future RESERVED fixtures so they are always in the future. The
 * on-or-after variant can return today, which would make the fixture's
 * validity depend on the time of day the seed happens to run: a Monday 14:00
 * seed would place a 10:00-12:45 appointment in the past. Starting the search
 * at offset 1 makes `date > today` unconditionally true, so the fixture stays
 * valid at every hour of the day.
 */
function nextWeekdayStrictlyAfter(today: string, isoWeekday: number): string {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = shiftDate(today, offset);
    if (isoWeekdayOf(candidate) === isoWeekday) return candidate;
  }
  throw new Error(`Could not resolve a future ISO weekday ${isoWeekday}`);
}

/**
 * Most recent date that is at least `minDaysAgo` days in the past AND falls on
 * `isoWeekday`. Backtracking by a fixed number of days would land on an
 * arbitrary weekday, which for these fixtures means a day with no seeded staff
 * schedule, so the weekday is preserved deliberately.
 */
function pastWeekdayOnOrBefore(today: string, isoWeekday: number, minDaysAgo: number): string {
  for (let offset = minDaysAgo; offset <= minDaysAgo + 6; offset += 1) {
    const candidate = shiftDate(today, -offset);
    if (isoWeekdayOf(candidate) === isoWeekday) return candidate;
  }
  throw new Error(`Could not resolve past ISO weekday ${isoWeekday} at least ${minDaysAgo} days ago`);
}

/**
 * Prisma 8's temporal codecs (`pg/time-temporal@1`, `pg/date-temporal@1`)
 * require real Temporal values, not strings. Passing `'09:00'` or
 * `'2026-01-05'` fails at encode time with:
 *
 *   Codec 'pg/time-temporal@1' encodes a Temporal.PlainTime, but received a string.
 *
 * The contract's generated types do not catch this because they are expressed as
 * opaque `CodecTypes['pg/time-temporal@1']['input']` aliases, so the wrong value
 * type-checks and only fails when the statement is built.
 */
function plainTime(hhmm: string): PlainTime {
  return Temporal.PlainTime.from(hhmm);
}

function plainDate(isoDate: string): PlainDate {
  return Temporal.PlainDate.from(isoDate);
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Adds decimal strings without floating-point error. */
function addDecimalStrings(values: string[]): string {
  const total = values.reduce((sum, value) => sum + Math.round(Number(value) * 100), 0);
  return (total / 100).toFixed(2);
}

// ===========================================================================
// SELF-VALIDATION (runs before any database write)
// ===========================================================================

function validateFixtures(today: string, nowTime = '00:00'): void {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(message);

  // --- accounts -----------------------------------------------------------
  const emails = [
    ['admin', `admin${SEED_EMAIL_DOMAIN}`],
    ['customer', `customer${SEED_EMAIL_DOMAIN}`],
    ['staff', `staff${SEED_EMAIL_DOMAIN}`],
  ] as const;
  for (const [label, email] of emails) {
    if (email.length > 255) fail(`${label} email exceeds varchar(255)`);
    if (!email.endsWith(SEED_EMAIL_DOMAIN)) fail(`${label} email is outside the seed domain`);
  }
  if (new Set(emails.map(([, e]) => e)).size !== emails.length) fail('seed account emails are not unique');

  // --- service categories (varchar(100)) ---------------------------------
  const categoryNames = ['Hair', 'Nails'];
  for (const name of categoryNames) {
    if (name.length < 1 || name.length > 100) fail(`category name "${name}" exceeds varchar(100)`);
  }
  if (new Set(categoryNames).size !== categoryNames.length) fail('service categories must be distinct');

  // --- services (varchar(200), duration 1-300, price >= 0) ---------------
  for (const service of SERVICES) {
    if (service.name.length < 1 || service.name.length > 200) fail(`service name "${service.name}" exceeds varchar(200)`);
    if (service.durationMinutes < 1 || service.durationMinutes > 300) {
      fail(`service "${service.name}" duration ${service.durationMinutes} is outside 1-300`);
    }
    if (Number(service.price) < 0) fail(`service "${service.name}" price is negative`);
  }
  if (new Set(SERVICES.map((s) => s.name)).size !== SERVICES.length) {
    fail('service names must be unique within the seed fixture');
  }

  // --- staff / customer profile field widths ------------------------------
  const people: Array<[string, string, string, string | null]> = [
    ['customer.firstName', 'Ada', 'Reyes', '+639000000001'],
    ['customer.lastName', 'Reyes', '', null],
    ['staff.firstName', 'Maria', 'Santos', '+639000000002'],
  ];
  for (const [label, first, , phone] of people) {
    if (first.length < 1 || first.length > 100) fail(`${label} exceeds varchar(100)`);
    if (phone !== null && phone.length > 30) fail(`${label} phone exceeds varchar(30)`);
  }
  if ('Senior Stylist'.length > 100) fail('staff.primary_role exceeds varchar(100)');

  // --- business hours (CHECK day 0-6, open < close, closed => null times) -
  if (ID.businessHours.length !== 7) fail('there must be exactly 7 business-hour rows');
  for (let day = 0; day < 7; day += 1) {
    const isOpen = day !== 0; // Sunday closed
    if (isOpen) {
      if (toMinutes(BUSINESS_WINDOW.start) >= toMinutes(BUSINESS_WINDOW.end)) {
        fail(`business hours window is invalid for day ${day}`);
      }
    }
  }

  // --- staff schedules (CHECK day 0-6, start < end, until >= from) -------
  const schedules = [
    { label: 'scheduleMonday', day: 1 },
    { label: 'scheduleTuesday', day: 2 },
  ];
  for (const schedule of schedules) {
    if (schedule.day < 0 || schedule.day > 6) fail(`${schedule.label} day_of_week outside 0-6`);
    if (toMinutes(STAFF_WINDOW.start) >= toMinutes(STAFF_WINDOW.end)) fail(`${schedule.label} window invalid`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(SCHEDULE_EFFECTIVE_FROM)) fail('effective_from is not a valid date');

  // --- appointments -------------------------------------------------------
  for (const appointment of APPOINTMENTS) {
    const label = `${appointment.code}`;
    if (appointment.code.length < 1 || appointment.code.length > 40) fail(`${label} code exceeds varchar(40)`);
    if (new Set(APPOINTMENT_CODE_LIST).size !== APPOINTMENT_CODE_LIST.length) {
      fail('appointment codes are not unique');
    }

    // window must be internally valid
    if (!/^\d{2}:\d{2}$/.test(appointment.startTime) || !/^\d{2}:\d{2}$/.test(appointment.endTime)) {
      fail(`${label} has an invalid time format`);
    }
    if (toMinutes(appointment.startTime) >= toMinutes(appointment.endTime)) {
      fail(`${label} start_time must be before end_time (CHECK valid_appointment_time)`);
    }

    // end_time MUST equal start_time + sum(durations) — this is how the
    // application computes it (AppointmentsService.getBookingPlan calls
    // calculateEndTime(startTime, durations)); it is never an input.
    const attached = APPOINTMENT_SERVICES.filter((row) => row.appointmentId === appointment.id);
    if (attached.length !== appointment.serviceIds.length) fail(`${label} service attachment count mismatch`);
    const durationSum = attached.reduce((sum, row) => sum + row.durationMinutes, 0);
    const expectedEnd = toTime(toMinutes(appointment.startTime) + durationSum);
    if (expectedEnd !== appointment.endTime) {
      fail(`${label} end_time ${appointment.endTime} must be ${expectedEnd} (start + sum(durations) = ${durationSum} min)`);
    }

    // total_amount MUST equal the sum of the snapshot prices
    const priceSum = addDecimalStrings(attached.map((row) => row.price));
    if (priceSum !== appointment.totalAmount) {
      fail(`${label} total_amount ${appointment.totalAmount} must equal sum of service snapshots ${priceSum}`);
    }
    if (Number(appointment.totalAmount) < 0) fail(`${label} total_amount is negative (CHECK valid_appointment_amount)`);

    // snapshot column widths
    for (const row of attached) {
      if (row.serviceName.length < 1 || row.serviceName.length > 200) fail(`${label} snapshot name exceeds varchar(200)`);
      if (row.durationMinutes < 1 || row.durationMinutes > 300) {
        fail(`${label} snapshot duration ${row.durationMinutes} is outside 1-300`);
      }
      if (Number(row.price) < 0) fail(`${label} snapshot price is negative`);
      // a snapshot must agree with the service it was copied from
      const source = SERVICES.find((s) => s.id === row.serviceId);
      if (!source) fail(`${label} snapshot references unknown service ${row.serviceId}`);
      else {
        if (source.name !== row.serviceName) fail(`${label} snapshot name "${row.serviceName}" does not match service "${source.name}"`);
        if (source.durationMinutes !== row.durationMinutes) fail(`${label} snapshot duration ${row.durationMinutes} does not match service ${source.durationMinutes}`);
        if (source.price !== row.price) fail(`${label} snapshot price ${row.price} does not match service ${source.price}`);
      }
    }

    // every attached service must exist in the fixture
    for (const serviceId of appointment.serviceIds) {
      if (!SERVICES.some((s) => s.id === serviceId)) fail(`${label} references unknown service ${serviceId}`);
    }

    // the appointment must fall inside the staff window and business hours
    if (toMinutes(appointment.startTime) < toMinutes(STAFF_WINDOW.start) ||
        toMinutes(appointment.endTime) > toMinutes(STAFF_WINDOW.end)) {
      fail(`${label} does not fit inside the staff schedule window ${STAFF_WINDOW.start}-${STAFF_WINDOW.end}`);
    }
    if (toMinutes(appointment.startTime) < toMinutes(BUSINESS_WINDOW.start) ||
        toMinutes(appointment.endTime) > toMinutes(BUSINESS_WINDOW.end)) {
      fail(`${label} does not fit inside business hours ${BUSINESS_WINDOW.start}-${BUSINESS_WINDOW.end}`);
    }

    // the chosen date must actually be the weekday with a seeded schedule,
    // and must be inside the schedule's effective range
    const date = resolveAppointmentDate(appointment, today);
    if (isoWeekdayOf(date) !== appointment.isoWeekday) {
      fail(`${label} date ${date} is ISO weekday ${isoWeekdayOf(date)}, expected ${appointment.isoWeekday}`);
    }
    const postgresDay = isoWeekdayToPostgres(isoWeekdayOf(date));
    if (postgresDay !== 1 && postgresDay !== 2) {
      fail(`${label} falls on PostgreSQL weekday ${postgresDay}, which has no seeded staff schedule`);
    }
    // A strictly-future fixture must be unconditionally in the future: the date
    // alone decides it, so no hour of the current day can invalidate it.
    if (appointment.dateStrategy === 'strictlyFutureWeekday' && date <= today) {
      fail(`${label} uses the strictly-future strategy but resolved to ${date}, which is not after today ${today}`);
    }
    // the appointment's own time window must fit the schedule row for that day
    const scheduleWindow = SCHEDULES.find((s) => s.dayOfWeek === postgresDay);
    if (!scheduleWindow) {
      fail(`${label} falls on PostgreSQL weekday ${postgresDay}, which has no seeded staff schedule`);
    } else if (toMinutes(appointment.startTime) < toMinutes(scheduleWindow.startTime) ||
               toMinutes(appointment.endTime) > toMinutes(scheduleWindow.endTime)) {
      fail(
        `${label} ${appointment.startTime}-${appointment.endTime} does not fit the seeded ` +
          `schedule for PostgreSQL weekday ${postgresDay} ` +
          `(${scheduleWindow.startTime}-${scheduleWindow.endTime})`
      );
    }
    if (date < SCHEDULE_EFFECTIVE_FROM) {
      fail(`${label} date ${date} precedes the staff schedule effective_from ${SCHEDULE_EFFECTIVE_FROM}`);
    }

    // status must agree with the fixture's time position, because the
    // application gates COMPLETED / CANCELLED on the appointment time vs now
    if (appointment.status === 'COMPLETED' && date >= today) {
      fail(`${label} is COMPLETED but its date ${date} is not in the past`);
    }
    if (appointment.status === 'CONFIRMED' && date >= today) {
      fail(`${label} is CONFIRMED but its date ${date} is not in the past (CONFIRMED -> COMPLETED requires a past end time)`);
    }
    // A RESERVED fixture must still be cancellable/bookable, which the
    // application gates on the appointment time versus now — including the
    // time-of-day when the fixture lands on today's date.
    if (appointment.status === 'RESERVED') {
      const startsLater = date > today || (date === today && appointment.startTime > nowTime);
      if (!startsLater) {
        fail(`${label} is RESERVED but ${date} ${appointment.startTime} is not in the future (now ${today} ${nowTime})`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Seed fixture is invalid (${errors.length} problem(s)):`);
    for (const error of errors) console.error(`  - ${error}`);
    throw new Error('Refusing to seed: the fixture failed self-validation.');
  }
}

/** Resolves an appointment's date from the studio-local today. */
function resolveAppointmentDate(appointment: AppointmentDef, today: string): string {
  if (appointment.dateStrategy === 'pastWeekday') {
    return pastWeekdayOnOrBefore(today, appointment.isoWeekday, appointment.daysAgo ?? 0);
  }
  if (appointment.dateStrategy === 'strictlyFutureWeekday') {
    return nextWeekdayStrictlyAfter(today, appointment.isoWeekday);
  }
  return nextWeekdayOnOrAfter(today, appointment.isoWeekday);
}

// ===========================================================================
// PASSWORD RESOLUTION
// ===========================================================================

type SeedPasswords = { admin: string; customer: string; staff: string };

function readSeedPasswords(): SeedPasswords {
  const read = (name: string): string => {
    const value = process.env[name];
    if (value === undefined || value.trim() === '') {
      throw new Error(
        `Missing ${name}. Seed passwords must be supplied via environment variables; ` +
          `never hardcode them. Add the variable name to backend/.env.example.`
      );
    }
    return value;
  };

  return {
    admin: read('SEED_ADMIN_PASSWORD'),
    customer: read('SEED_CUSTOMER_PASSWORD'),
    staff: read('SEED_STAFF_PASSWORD'),
  };
}

// ===========================================================================
// PREFLIGHT — three outcomes: clean / already seeded / conflicting
// ===========================================================================

type Preflight =
  | { state: 'clean' }
  | { state: 'seeded' }
  | { state: 'conflict'; detail: string };

async function preflight(): Promise<Preflight> {
  const foundAccounts = await db.orm.public.Account.where({ id: ID.adminAccount }).first();
  const foundStaff = await db.orm.public.Staff.where({ id: ID.staff }).first();
  const foundCategory = await db.orm.public.ServiceCategory.where({ id: ID.categoryHair }).first();
  const foundAppointment = await db.orm.public.Appointment.where({ id: ID.apptFutureReserved }).first();

  const presentCount =
    (foundAccounts ? 1 : 0) + (foundStaff ? 1 : 0) +
    (foundCategory ? 1 : 0) + (foundAppointment ? 1 : 0);

  if (presentCount === 0) return { state: 'clean' };

  // Any seed row present means this is not a clean slate. Distinguish a
  // complete, matching dataset (idempotent re-run) from anything else.
  if (presentCount < 4) {
    return {
      state: 'conflict',
      detail:
        'Some deterministic seed records already exist but not all of them. ' +
        'The dataset is partial. Refusing to modify it automatically — inspect and ' +
        'remove it manually with `npm run db:seed:remove` if appropriate.',
    };
  }

  // Representative rows present: verify the dataset is really ours and matches
  // the expected version. Appointment dates are intentionally relative, so the
  // check keys on deterministic IDs, codes, and the seed email domain only.
  const accountOk = foundAccounts !== null && String(foundAccounts.email).endsWith(SEED_EMAIL_DOMAIN);
  const appointmentOk = foundAppointment !== null &&
    APPOINTMENT_CODE_LIST.includes(String(foundAppointment.appointmentCode));

  if (!accountOk || !appointmentOk) {
    return {
      state: 'conflict',
      detail:
        'Deterministic seed IDs are occupied by records that do not match the expected ' +
        `seed dataset (SEED_VERSION ${SEED_VERSION}). Refusing to overwrite them.`,
    };
  }

  // Confirm the seeded accounts really carry the expected roles.
  const roles = await Promise.all(
    [ID.adminAccount, ID.customerAccount, ID.staffAccount].map(async (accountId) => {
      const row = await db.orm.public.Account.where({ id: accountId }).first();
      return row ? String(row.role) : 'MISSING';
    })
  );
  const expectedRoles = ['ADMIN', 'CUSTOMER', 'STAFF'];
  if (roles.some((role, index) => role !== expectedRoles[index])) {
    return {
      state: 'conflict',
      detail:
        `Seed accounts exist with unexpected roles [${roles.join(', ')}]; ` +
        `expected [${expectedRoles.join(', ')}] for SEED_VERSION ${SEED_VERSION}.`,
    };
  }

  return { state: 'seeded' };
}

// ===========================================================================
// SEED
// ===========================================================================

type Tx = { orm: typeof db.orm };

async function seed(): Promise<void> {
  const local = localDateAndTime(new Date(), env.STUDIO_TIME_ZONE);
  const today = local.date;

  console.log(`Studio timezone: ${env.STUDIO_TIME_ZONE}  |  local today: ${today} ${local.time}`);
  console.log(`SEED_VERSION ${SEED_VERSION}`);

  // 1. Validate the fixture BEFORE any database write.
  validateFixtures(today, local.time);

  // 2. Preflight: clean / already seeded / conflict.
  const state = await preflight();
  if (state.state === 'seeded') {
    console.log(`Seed data (SEED_VERSION ${SEED_VERSION}) is already present. Nothing to do.`);
    return;
  }
  if (state.state === 'conflict') {
    console.error('Seed preflight found conflicting or partial seed state.');
    console.error(`  ${state.detail}`);
    throw new Error('Refusing to seed: conflicting seed state.');
  }
  console.log('Preflight: clean (no seed records present).');

  // 3. Hash passwords BEFORE opening the transaction. bcrypt cost 12 is
  //    deliberately slow; keeping it outside the transaction avoids holding a
  //    database transaction open across CPU-bound work.
  const passwords = readSeedPasswords();
  console.log('Hashing seed passwords (bcrypt cost 12)...');
  const [adminHash, customerHash, staffHash] = await Promise.all([
    bcrypt.hash(passwords.admin, 12),
    bcrypt.hash(passwords.customer, 12),
    bcrypt.hash(passwords.staff, 12),
  ]);
  console.log('Password hashing complete.');

  // 4. Insert the complete dataset in ONE transaction, in dependency order.
  await db.transaction(async (tx: Tx) => {
    // accounts
    await tx.orm.public.Account.create({
      id: ID.adminAccount,
      email: pgVarchar<255>(`admin${SEED_EMAIL_DOMAIN}`),
      passwordHash: adminHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    await tx.orm.public.Account.create({
      id: ID.customerAccount,
      email: pgVarchar<255>(`customer${SEED_EMAIL_DOMAIN}`),
      passwordHash: customerHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
    });
    await tx.orm.public.Account.create({
      id: ID.staffAccount,
      email: pgVarchar<255>(`staff${SEED_EMAIL_DOMAIN}`),
      passwordHash: staffHash,
      role: 'STAFF',
      status: 'ACTIVE',
    });

    // customers
    await tx.orm.public.Customer.create({
      id: ID.customer,
      accountId: ID.customerAccount,
      firstName: pgVarchar<100>('Ada'),
      lastName: pgVarchar<100>('Reyes'),
      gender: pgVarchar<30>('female'),
      phone: pgVarchar<30>('+639000000001'),
    });

    // staff
    await tx.orm.public.Staff.create({
      id: ID.staff,
      accountId: ID.staffAccount,
      firstName: pgVarchar<100>('Maria'),
      lastName: pgVarchar<100>('Santos'),
      primaryRole: pgVarchar<100>('Senior Stylist'),
      employmentType: 'PART_TIME',
      workStatus: 'ON_DUTY',
      phone: pgVarchar<30>('+639000000002'),
    });

    // service_categories
    await tx.orm.public.ServiceCategory.create({ id: ID.categoryHair, name: pgVarchar<100>('Hair'), isActive: true });
    await tx.orm.public.ServiceCategory.create({ id: ID.categoryNails, name: pgVarchar<100>('Nails'), isActive: true });

    // services
    for (const service of SERVICES) {
      await tx.orm.public.Service.create({
        id: service.id,
        categoryId: service.categoryId,
        name: pgVarchar<200>(service.name),
        description: null,
        price: pgNumeric(service.price),
        durationMinutes: service.durationMinutes,
        isActive: true,
      });
    }

    // staff_services — makes the staff member eligible for every service, which
    // is what StaffService.listEligibleForServices reads.
    for (const service of SERVICES) {
      await tx.orm.public.StaffService.create({ staffId: ID.staff, serviceId: service.id });
    }

    // business_hours — PostgreSQL weekday 0-6, 0 = Sunday. Sunday closed.
    for (let day = 0; day < 7; day += 1) {
      const isOpen = day !== 0;
      await tx.orm.public.BusinessHour.create({
        id: ID.businessHours[day],
        dayOfWeek: day,
        isOpen,
        openTime: isOpen ? plainTime(BUSINESS_WINDOW.start) : null,
        closeTime: isOpen ? plainTime(BUSINESS_WINDOW.end) : null,
      });
    }

    // staff_schedules — Monday and Tuesday, fixed past effective_from, open ended.
    for (const schedule of SCHEDULES) {
      await tx.orm.public.StaffSchedule.create({
        id: schedule.id,
        staffId: ID.staff,
        dayOfWeek: schedule.dayOfWeek,
        startTime: plainTime(schedule.startTime),
        endTime: plainTime(schedule.endTime),
        effectiveFrom: plainDate(SCHEDULE_EFFECTIVE_FROM),
        effectiveUntil: null,
        isActive: true,
      });
    }

    // appointments
    for (const appointment of APPOINTMENTS) {
      const appointmentDate = resolveAppointmentDate(appointment, today);
      await tx.orm.public.Appointment.create({
        id: appointment.id,
        appointmentCode: pgVarchar<40>(appointment.code),
        customerId: ID.customer,
        staffId: ID.staff,
        appointmentDate: plainDate(appointmentDate),
        startTime: plainTime(appointment.startTime),
        endTime: plainTime(appointment.endTime),
        totalAmount: pgNumeric(appointment.totalAmount),
        status: appointment.status,
      });
      console.log(`  ${appointment.code}  ${appointmentDate}  ${appointment.startTime}-${appointment.endTime}  ${appointment.status}`);
    }

    // appointment_services — denormalised snapshots of name/price/duration,
    // exactly as AppointmentsService.create writes them at booking time.
    for (const row of APPOINTMENT_SERVICES) {
      await tx.orm.public.AppointmentService.create({
        appointmentId: row.appointmentId,
        serviceId: row.serviceId,
        serviceName: pgVarchar<200>(row.serviceName),
        price: pgNumeric(row.price),
        durationMinutes: row.durationMinutes,
      });
    }
  });

  console.log(`Seed complete: SEED_VERSION ${SEED_VERSION}, ${SEED_ROW_COUNT} rows across ${SEED_TABLE_COUNT} tables.`);
  console.log('No payments, reviews, schedule_requests, or audit_logs were created (Batch 5 will exercise those).');
}

// ===========================================================================
// TEARDOWN
// ===========================================================================

/**
 * Deletes the seed dataset in reverse dependency order, inside one
 * transaction, scoped strictly to the deterministic IDs above.
 *
 * Refuses to run without explicit confirmation, and refuses to delete rows
 * that do not match the expected SEED_VERSION.
 */
async function remove(): Promise<void> {
  const supplied = process.env['SEED_REMOVE_CONFIRM'];
  if (supplied !== REMOVE_CONFIRMATION_VALUE) {
    console.error('Teardown REFUSED: explicit confirmation required.');
    console.error('');
    console.error(`Set the environment variable to run teardown:`);
    console.error(`  SEED_REMOVE_CONFIRM=${REMOVE_CONFIRMATION_VALUE} npm run db:seed:remove`);
    console.error('');
    console.error('This deletes only the deterministic seed records listed in scripts/seed.ts.');
    process.exit(1);
  }

  console.log(`Teardown: removing seed dataset SEED_VERSION ${SEED_VERSION}.`);

  // Verify the rows are actually the expected seed before deleting anything.
  const account = await db.orm.public.Account.where({ id: ID.adminAccount }).first();
  if (account === null) {
    console.log('No seed account found — nothing to remove.');
    return;
  }
  if (!String(account.email).endsWith(SEED_EMAIL_DOMAIN)) {
    console.error('Teardown REFUSED: the deterministic seed ID is occupied by a record that is not seed data.');
    process.exit(1);
  }
  const appointment = await db.orm.public.Appointment.where({ id: ID.apptFutureReserved }).first();
  if (appointment !== null &&
      !APPOINTMENT_CODE_LIST.includes(String(appointment.appointmentCode))) {
    console.error('Teardown REFUSED: the deterministic appointment ID is occupied by an unexpected record.');
    process.exit(1);
  }

  await db.transaction(async (tx: Tx) => {
    // 1. appointment_services — deleted by explicit appointment id
    for (const id of [ID.apptFutureReserved, ID.apptPastConfirmed, ID.apptPastCompleted, ID.apptFutureReserved2]) {
      await tx.orm.public.AppointmentService.where({ appointmentId: id }).delete();
    }

    // 2. appointments — fixed ids only
    for (const id of [ID.apptFutureReserved, ID.apptPastConfirmed, ID.apptPastCompleted, ID.apptFutureReserved2]) {
      await tx.orm.public.Appointment.where({ id }).delete();
    }

    // 3. staff_schedules — fixed ids only
    for (const schedule of SCHEDULES) {
      await tx.orm.public.StaffSchedule.where({ id: schedule.id }).delete();
    }

    // 4. staff_services — fixed staff id only
    await tx.orm.public.StaffService.where({ staffId: ID.staff }).delete();

    // 5. services — fixed ids only
    for (const service of SERVICES) {
      await tx.orm.public.Service.where({ id: service.id }).delete();
    }

    // 6. business_hours — fixed ids only (never a day_of_week predicate, never all rows)
    for (const id of ID.businessHours) {
      await tx.orm.public.BusinessHour.where({ id }).delete();
    }

    // 7. service_categories — fixed ids only
    await tx.orm.public.ServiceCategory.where({ id: ID.categoryHair }).delete();
    await tx.orm.public.ServiceCategory.where({ id: ID.categoryNails }).delete();

    // 8. staff — fixed id
    await tx.orm.public.Staff.where({ id: ID.staff }).delete();

    // 9. customers — fixed id
    await tx.orm.public.Customer.where({ id: ID.customer }).delete();

    // 10. accounts — fixed ids only
    for (const id of [ID.adminAccount, ID.customerAccount, ID.staffAccount]) {
      await tx.orm.public.Account.where({ id }).delete();
    }
  });

  console.log('Teardown complete. No external tables were touched.');
}

// ===========================================================================
// ENTRY POINT
// ===========================================================================

async function main(): Promise<void> {
  const action = process.argv[2];
  if (action === 'remove') {
    await remove();
    return;
  }
  if (action !== undefined && action !== 'seed') {
    console.error(`Unknown argument "${action}".`);
    console.error('Usage:');
    console.error('  npm run db:seed                     seed (preflight + idempotent)');
    console.error('  npm run db:seed:remove              teardown (requires SEED_REMOVE_CONFIRM)');
    process.exit(1);
  }
  await seed();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
