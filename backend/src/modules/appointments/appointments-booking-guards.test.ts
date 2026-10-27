// Final-booking validation gaps (§7c): a booking that includes a deactivated
// service (or a service in an inactive category) is refused outright, a
// double-booking collides with 409, and the chosen stylist must cover every
// selected service category. Fake ORM: rule tests, not database tests.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, mock, test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { AppointmentsService }, { ConflictError, BadRequestError }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./appointments.service.js'),
  import('../../errors/index.js'),
]);

type Row = Record<string, unknown> & { id?: string };
const world: Record<string, Row[]> = {
  Customer: [], Staff: [], Service: [], ServiceCategory: [], StaffService: [],
  StaffCategory: [], StaffSchedule: [], BusinessHour: [], ScheduleRequest: [],
  Appointment: [], AppointmentService: [], AuditLog: [],
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
    Customer: table('Customer'), Staff: table('Staff'), Service: table('Service'),
    ServiceCategory: table('ServiceCategory'), StaffService: table('StaffService'),
    StaffCategory: table('StaffCategory'), StaffSchedule: table('StaffSchedule'),
    BusinessHour: table('BusinessHour'), ScheduleRequest: table('ScheduleRequest'),
    Appointment: table('Appointment'), AppointmentService: table('AppointmentService'),
    AuditLog: table('AuditLog'),
  },
};
// The successful branch of create() runs inside a transaction; the fake simply
// runs the callback against the same fake ORM.
(db as unknown as { transaction: unknown }).transaction = async (fn: (tx: { orm: unknown }) => Promise<void>) =>
  fn({ orm: (db as unknown as { orm: unknown }).orm });

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

const DATE = '2099-06-15';
const WEEKDAY = new Date(`${DATE}T12:00:00Z`).getUTCDay();

interface SeedOpts {
  serviceActive?: boolean;
  categoryActive?: boolean;
  staffCoversCategory?: boolean;
  existingBooking?: boolean;
}

function seed(opts: SeedOpts = {}): void {
  for (const key of Object.keys(world)) world[key] = [];
  world.Customer.push({ id: 'cust-1', accountId: USER });
  world.Staff.push({ id: STAFF_ID, accountId: 'acc-staff', firstName: 'Sty', lastName: 'List', workStatus: 'ON_DUTY', primaryRole: 'Stylist' });
  world.ServiceCategory.push({ id: 'cat-1', name: 'Hair', isActive: opts.categoryActive ?? true });
  world.Service.push({
    id: SVC, categoryId: 'cat-1', name: 'Haircut', price: 450, durationMinutes: 60,
    isActive: opts.serviceActive ?? true,
  });
  world.StaffService.push({ id: 'ss-1', staffId: STAFF_ID, serviceId: SVC });
  if (opts.staffCoversCategory !== false) {
    world.StaffCategory.push({ id: 'sc-1', staffId: STAFF_ID, categoryId: 'cat-1' });
  }
  world.StaffSchedule.push({
    id: 'sch-1', staffId: STAFF_ID, dayOfWeek: WEEKDAY,
    startTime: '09:00:00', endTime: '17:00:00',
    effectiveFrom: '2099-01-01', effectiveUntil: null, isActive: true,
  });
  world.BusinessHour.push({
    id: `bh-${WEEKDAY}`, dayOfWeek: WEEKDAY, openTime: '09:00:00', closeTime: '17:00:00', isOpen: true,
  });
  if (opts.existingBooking) {
    world.Appointment.push({
      id: 'apt-existing', appointmentCode: 'APT-99999', customerId: 'cust-2', staffId: STAFF_ID,
      appointmentDate: DATE, startTime: '10:00:00', endTime: '11:00:00', status: 'RESERVED',
    });
  }
}

function book(startTime = '10:00'): Promise<unknown> {
  return AppointmentsService.create(
    { staffId: STAFF_ID, appointmentDate: DATE, startTime, serviceIds: [SVC] } as never,
    USER,
  );
}

test('booking a deactivated service is refused naming the service', async () => {
  seed({ serviceActive: false });
  await assert.rejects(
    () => book('10:00'),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestError);
      assert.equal((error as { statusCode: number }).statusCode, 400);
      assert.equal((error as Error).message, 'Service is inactive: Haircut');
      return true;
    },
  );
  assert.equal(world.Appointment.length, 0);
});

test('booking a service in an inactive category is refused', async () => {
  seed({ categoryActive: false });
  await assert.rejects(() => book('10:00'), /Service category is inactive: Haircut/);
  assert.equal(world.Appointment.length, 0);
});

test('a booking that collides with an existing reservation is refused with 409', async () => {
  seed({ existingBooking: true });
  await assert.rejects(
    () => book('10:30'),
    (error: unknown) => {
      assert.ok(error instanceof ConflictError);
      assert.equal((error as { statusCode: number }).statusCode, 409);
      assert.equal((error as Error).message, 'The chosen stylist already has a booking at that time.');
      return true;
    },
  );
  assert.equal(world.Appointment.length, 1);
});

test('a stylist who does not cover the service category is refused with 409', async () => {
  seed({ staffCoversCategory: false });
  await assert.rejects(
    () => book('10:00'),
    (error: unknown) => {
      assert.ok(error instanceof ConflictError);
      assert.equal((error as { statusCode: number }).statusCode, 409);
      assert.equal((error as Error).message, 'The chosen stylist does not cover every selected service category');
      return true;
    },
  );
  assert.equal(world.Appointment.length, 0);
});

test('a stylist not scheduled at that time is refused (final-booking guard)', async () => {
  seed();
  world.StaffSchedule.length = 0;
  await assert.rejects(() => book('10:00'), /not scheduled at that time/);
  assert.equal(world.Appointment.length, 0);
});

test('the guards hold on the availability check too', async () => {
  seed({ serviceActive: false });
  await assert.rejects(
    () => AppointmentsService.checkAvailability(
      { staffId: STAFF_ID, appointmentDate: DATE, startTime: '10:00', serviceIds: [SVC] } as never,
    ),
    /Service is inactive: Haircut/,
  );
});
