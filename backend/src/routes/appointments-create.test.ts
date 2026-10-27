// Diagnosis evidence for the 2026-10-27 hosted-harness "appointment create
// 400": the harness booked 2026-11-18 (Wednesday) while the seeded staff
// schedule covers Monday+Tuesday only, so the booking rules correctly answer
// 400 'The chosen stylist is not scheduled at that time.' with no field-level
// detail paths (details are for schema failures only). Fake ORM, real router.
//
// Since then, new bookings are also limited to the current Asia/Manila
// calendar month, so the harness's original November dates would now be
// rejected even earlier. The clock is frozen at 2026-10-26 08:01 Manila and
// the scenario dates moved inside October, keeping the same diagnosis
// (Wednesday unscheduled vs Monday scheduled) deterministic in any month.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { appointmentsRouter }, { errorHandler, notFoundHandler }, { createAccessToken }] =
  await Promise.all([
    import('../prisma/db.js'),
    import('./appointments.js'),
    import('../middleware/error.js'),
    import('../lib/jwt.js'),
  ]);

const CUSTOMER_ACCOUNT = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '33333333-0000-4000-8000-000000000001';
const SVC_ID = '55555555-0000-4000-8000-000000000001';
const customerToken = createAccessToken({ sub: CUSTOMER_ACCOUNT, email: 'customer@example.com', role: 'CUSTOMER' });

type Row = Record<string, unknown> & { id?: string };
const world: Record<string, Row[]> = {
  Customer: [], Staff: [], Service: [], ServiceCategory: [], StaffService: [],
  StaffCategory: [], StaffSchedule: [], BusinessHour: [], ScheduleRequest: [],
  Appointment: [], AppointmentService: [], AuditLog: [],
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
const publicSchema = {
  Customer: table('Customer'), Staff: table('Staff'), Service: table('Service'),
  ServiceCategory: table('ServiceCategory'), StaffService: table('StaffService'),
  StaffCategory: table('StaffCategory'), StaffSchedule: table('StaffSchedule'),
  BusinessHour: table('BusinessHour'), ScheduleRequest: table('ScheduleRequest'),
  Appointment: table('Appointment'), AppointmentService: table('AppointmentService'),
  AuditLog: table('AuditLog'),
};
(db as unknown as { orm: unknown }).orm = { public: publicSchema };
(db as unknown as { transaction: unknown }).transaction = async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({ orm: { public: publicSchema } });

/** Mirrors the hosted seed: hours Mon-Sat 09:00-18:00, staff shift Mon+Tue 09:00-17:00. */
function seed(): void {
  for (const key of Object.keys(world)) world[key] = [];
  world.Customer.push({ id: '11111111-1111-4111-8111-111111111112', accountId: CUSTOMER_ACCOUNT });
  world.Staff.push({ id: STAFF_ID, accountId: '22222222-2222-4222-8222-222222222222', firstName: 'Maria', lastName: 'Santos', workStatus: 'ON_DUTY', primaryRole: 'Senior Stylist' });
  world.ServiceCategory.push({ id: '44444444-4444-4444-8444-444444444444', name: 'Hair', isActive: true });
  world.Service.push({ id: SVC_ID, categoryId: '44444444-4444-4444-8444-444444444444', name: 'Haircut', price: 450, durationMinutes: 60, isActive: true });
  world.StaffService.push({ staffId: STAFF_ID, serviceId: SVC_ID });
  world.StaffCategory.push({ staffId: STAFF_ID, categoryId: '44444444-4444-4444-8444-444444444444' });
  for (let day = 0; day < 7; day += 1) {
    const isOpen = day !== 0;
    world.BusinessHour.push({
      id: `bh-${day}`, dayOfWeek: day, isOpen,
      openTime: isOpen ? '09:00:00' : null, closeTime: isOpen ? '18:00:00' : null,
    });
  }
  for (const day of [1, 2]) {
    world.StaffSchedule.push({
      id: `sch-${day}`, staffId: STAFF_ID, dayOfWeek: day, isActive: true,
      startTime: '09:00:00', endTime: '17:00:00',
      effectiveFrom: '2026-01-05', effectiveUntil: null,
    });
  }
}

let baseUrl = '';
before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/appointments', appointmentsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  (globalThis as unknown as { __server: http.Server }).__server = server;
});
after(() => {
  (globalThis as unknown as { __server: http.Server }).__server.close();
});

async function postAppointment(
  body: Record<string, unknown>,
  token: string = customerToken,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

test('an in-month Wednesday with no staff schedule is rejected as unscheduled, with no detail paths', async (t) => {
  t.mock.timers.enable({ now: Date.parse('2026-10-26T00:01:00Z'), apis: ['Date'] });
  seed();
  const { status, body } = await postAppointment({
    staffId: STAFF_ID, appointmentDate: '2026-10-28', startTime: '10:00', serviceIds: [SVC_ID],
  });
  const error = body.error as { code: string; message: string; details?: unknown };
  assert.equal(status, 400);
  assert.equal(error.code, 'BAD_REQUEST');
  assert.equal(error.message, 'The chosen stylist is not scheduled at that time.');
  assert.equal(error.details, undefined, 'business-rule 400s carry the message, not field detail paths');
});

test('a schema-invalid startTime gets a 400 whose detail path names the field', async () => {
  seed();
  const { status, body } = await postAppointment({
    staffId: STAFF_ID, appointmentDate: '2026-11-18', startTime: '10:00:00', serviceIds: [SVC_ID],
  });
  const error = body.error as { code: string; message: string; details?: Array<{ path: string; message: string }> };
  assert.equal(status, 400);
  assert.equal(error.code, 'BAD_REQUEST');
  assert.ok(error.details?.some((detail) => detail.path === 'startTime'), `expected startTime detail path, got ${JSON.stringify(error.details)}`);
});

test('the same payload on an in-month scheduled Monday creates the appointment', async (t) => {
  t.mock.timers.enable({ now: Date.parse('2026-10-26T00:01:00Z'), apis: ['Date'] });
  seed();
  const { status, body } = await postAppointment({
    staffId: STAFF_ID, appointmentDate: '2026-10-26', startTime: '10:00', serviceIds: [SVC_ID],
  });
  assert.equal(status, 201);
  assert.equal(world.Appointment.length, 1, 'the appointment row must exist after create');
  assert.ok(world.AppointmentService.length >= 1, 'the service row must exist after create');
  const data = body.data as { appointment?: { appointmentCode?: string } };
  assert.match(data?.appointment?.appointmentCode ?? '', /^APT-\d{5}$/, 'the response must carry a five-digit APT- reference');
});

test('an out-of-month date is rejected with the calendar-month error, even when otherwise valid', async (t) => {
  t.mock.timers.enable({ now: Date.parse('2026-10-26T00:01:00Z'), apis: ['Date'] });
  seed();
  const { status, body } = await postAppointment({
    staffId: STAFF_ID, appointmentDate: '2026-11-18', startTime: '10:00', serviceIds: [SVC_ID],
  });
  const error = body.error as { code: string; message: string; details?: unknown };
  assert.equal(status, 400);
  assert.equal(error.code, 'BAD_REQUEST');
  assert.match(error.message, /current calendar month/i);
  assert.equal(error.details, undefined, 'business-rule 400s carry the message, not field detail paths');
});

test('a past date is rejected before any booking rule runs', async (t) => {
  t.mock.timers.enable({ now: Date.parse('2026-10-26T00:01:00Z'), apis: ['Date'] });
  seed();
  const { status, body } = await postAppointment({
    staffId: STAFF_ID, appointmentDate: '2026-10-20', startTime: '10:00', serviceIds: [SVC_ID],
  });
  const error = body.error as { message: string };
  assert.equal(status, 400);
  assert.equal(error.message, 'Appointment date and time must be in the future');
});

test('the month boundary follows the Manila calendar, not UTC', async (t) => {
  // 2026-10-31T16:01Z is already Nov 1 in Manila: Oct 31 must be rejected.
  t.mock.timers.enable({ now: Date.parse('2026-10-31T16:01:00Z'), apis: ['Date'] });
  // Minted after the clock freeze, so its expiry sits inside the frozen time.
  const token = createAccessToken({ sub: CUSTOMER_ACCOUNT, email: 'customer@example.com', role: 'CUSTOMER' });
  seed();
  const { status, body } = await postAppointment({
    staffId: STAFF_ID, appointmentDate: '2026-10-31', startTime: '10:00', serviceIds: [SVC_ID],
  }, token);
  const error = body.error as { message: string };
  assert.equal(status, 400);
  assert.match(error.message, /current calendar month/i);
});
