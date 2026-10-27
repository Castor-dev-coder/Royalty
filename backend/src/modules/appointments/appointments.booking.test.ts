// Booking rules (A3/A4): shop hours, staff shifts and approved time off, with
// the clear error text POST /appointments must return. Fake ORM: these are
// rule tests, not database tests (the hosted-DB suite is test:integration).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, mock, test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { AppointmentsService }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./appointments.service.js'),
]);

type Row = Record<string, unknown> & { id?: string };
const world: Record<string, Row[]> = {
  Customer: [], Staff: [], Service: [], ServiceCategory: [], StaffService: [],
  StaffCategory: [], StaffSchedule: [], BusinessHour: [], ScheduleRequest: [], Appointment: [],
};
let seq = 1;

function table(name: string) {
  return {
    where: (filter: Record<string, unknown>) => ({
      first: async () => world[name].find((row) => Object.entries(filter).every(([k, v]) => row[k] === v)) ?? null,
      all: async () => world[name].filter((row) => Object.entries(filter).every(([k, v]) => row[k] === v)),
    }),
    create: async (data: Record<string, unknown>) => {
      const row = { ...data, id: `row-${seq++}` } as Row;
      world[name].push(row);
      return row;
    },
    all: async () => world[name],
  };
}
(db as unknown as { orm: unknown }).orm = {
  public: {
    Customer: table('Customer'), Staff: table('Staff'), Service: table('Service'),
    ServiceCategory: table('ServiceCategory'), StaffService: table('StaffService'),
    StaffCategory: table('StaffCategory'), StaffSchedule: table('StaffSchedule'),
    BusinessHour: table('BusinessHour'), ScheduleRequest: table('ScheduleRequest'),
    Appointment: table('Appointment'), AuditLog: table('Customer'),
  },
};

const USER = 'acc-customer';
const STAFF_ID = 'staff-1';
const SVC = 'svc-1';

// The booking policy allows only the current calendar month (Asia/Manila) and
// rejects the past, so the clock is frozen at the start of the fixtures'
// month: 2099-06-15 is then both in-month and future in every run.
before(() => {
  mock.timers.enable({ now: Date.parse('2099-06-01T02:00:00Z'), apis: ['Date'] });
});
after(() => {
  mock.timers.reset();
});

/** A far-future date so the "must be in the future" rule never interferes. */
const DATE = '2099-06-15';
const WEEKDAY = new Date(`${DATE}T12:00:00Z`).getUTCDay();
const WEEKDAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][WEEKDAY];

interface SeedOpts {
  open?: string | null
  close?: string | null
  isOpen?: boolean
  shift?: { start: string; end: string } | null
  timeOff?: { start?: string; end?: string; status?: string } | null
}

function seed(opts: SeedOpts = {}): void {
  for (const key of Object.keys(world)) world[key] = [];
  world.Customer.push({ id: 'cust-1', accountId: USER });
  world.Staff.push({ id: STAFF_ID, accountId: 'acc-staff', firstName: 'Sty', lastName: 'List', workStatus: 'ON_DUTY', primaryRole: 'Stylist' });
  world.ServiceCategory.push({ id: 'cat-1', name: 'Hair', isActive: true });
  world.Service.push({ id: SVC, categoryId: 'cat-1', name: 'Haircut', price: 450, durationMinutes: 60, isActive: true });
  world.StaffService.push({ staffId: STAFF_ID, serviceId: SVC });
  world.StaffCategory.push({ staffId: STAFF_ID, categoryId: 'cat-1' });
  world.BusinessHour.push({
    id: `bh-${WEEKDAY}`,
    dayOfWeek: WEEKDAY,
    openTime: opts.open === null ? null : `${opts.open ?? '09:00'}:00`,
    closeTime: opts.close === null ? null : `${opts.close ?? '17:00'}:00`,
    isOpen: opts.isOpen ?? true,
  });
  if (opts.shift !== null) {
    const shift = opts.shift ?? { start: '09:00', end: '17:00' };
    world.StaffSchedule.push({
      id: 'sch-1', staffId: STAFF_ID, dayOfWeek: WEEKDAY,
      startTime: `${shift.start}:00`, endTime: `${shift.end}:00`,
      effectiveFrom: '2099-01-01', effectiveUntil: null, isActive: true,
    });
  }
  if (opts.timeOff) {
    world.ScheduleRequest.push({
      id: 'off-1', staffId: STAFF_ID, requestedDate: DATE,
      requestedStartTime: opts.timeOff.start ? `${opts.timeOff.start}:00` : null,
      requestedEndTime: opts.timeOff.end ? `${opts.timeOff.end}:00` : null,
      status: opts.timeOff.status ?? 'APPROVED',
    });
  }
}

function book(startTime = '10:00'): Promise<unknown> {
  return AppointmentsService.create(
    { staffId: STAFF_ID, appointmentDate: DATE, startTime, serviceIds: [SVC] } as never,
    USER,
  );
}

test('a3: a slot before opening is rejected with the opening time', async () => {
  seed({ open: '09:00', close: '17:00' });
  await assert.rejects(() => book('08:00'), new RegExp(`The salon opens at 09:00 on ${WEEKDAY_NAME}\\.`));
});

test('a3: a slot after closing is rejected with the closing time', async () => {
  seed({ open: '09:00', close: '17:00' });
  await assert.rejects(() => book('17:00'), new RegExp(`The appointment must end by 17:00 on ${WEEKDAY_NAME}\\.`));
});

test('a3: a duration that crosses closing is rejected', async () => {
  seed({ open: '09:00', close: '17:00' });
  // 16:30 + 60 minutes ends 17:30, past the 17:00 close.
  await assert.rejects(() => book('16:30'), new RegExp(`The appointment must end by 17:00 on ${WEEKDAY_NAME}\\.`));
});

test('a3: a closed day is rejected naming the day', async () => {
  seed({ isOpen: false });
  await assert.rejects(() => book('10:00'), new RegExp(`The salon is closed on ${WEEKDAY_NAME}\\.`));
});

test('a3: an accepted slot reports availability', async () => {
  seed({ open: '09:00', close: '17:00' });
  const result = await AppointmentsService.checkAvailability(
    { staffId: STAFF_ID, appointmentDate: DATE, startTime: '10:00', serviceIds: [SVC] } as never,
  ) as { available: boolean };
  assert.equal(result.available, true);
});

test('a4: a stylist not scheduled that day is rejected', async () => {
  seed({ shift: null });
  await assert.rejects(() => book('10:00'), /not scheduled at that time/);
});

test('a4: a shift that ends before the slot ends is rejected', async () => {
  seed({ shift: { start: '09:00', end: '10:30' } });
  await assert.rejects(() => book('10:00'), /not scheduled at that time/);
});

test('a4: approved time off is rejected', async () => {
  seed({ timeOff: {} });
  await assert.rejects(() => book('10:00'), /on approved time off that day/);
});

test('a4: pending time off does not block the slot', async () => {
  seed({ timeOff: { status: 'PENDING' } });
  const result = await AppointmentsService.checkAvailability(
    { staffId: STAFF_ID, appointmentDate: DATE, startTime: '10:00', serviceIds: [SVC] } as never,
  ) as { available: boolean };
  assert.equal(result.available, true);
});
