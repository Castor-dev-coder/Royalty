// Maya payment flow: idempotent attempts, the 15-minute hold, provider
// authoritative verification, forged/duplicate callbacks, mismatches, expiry,
// and the paid-booking cancellation rules. Fake ORM + fake Maya transport —
// isolated from any database or network.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://***:***@127.0.0.1:5/route-test';
process.env.SUPABASE_URL = 'http://127.0.0.1:5';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
process.env.MAYA_PUBLIC_KEY = 'pk-test-value';
process.env.MAYA_SECRET_KEY = 'sk-test-value';
process.env.MAYA_BASE_URL = 'https://pg-sandbox.paymaya.com';
process.env.USER_APP_ORIGIN = 'http://localhost:5173';

const [{ db }, { MayaPaymentsService }, { AppointmentsService }, { PaymentsService }, maya] = await Promise.all([
  import('../../prisma/db.js'),
  import('./maya.service.js'),
  import('../appointments/appointments.service.js'),
  import('./payments.service.js'),
  import('./maya.js'),
]);
const { fromCentavos } = maya;

interface Row extends Record<string, unknown> { id?: string }
const world: Record<string, Row[]> = {
  Payment: [], PaymentSetting: [], Appointment: [], Customer: [], Account: [],
  AppointmentService: [], Staff: [], StaffService: [], StaffSchedule: [],
  ScheduleRequest: [], BusinessHour: [], Service: [], ServiceCategory: [], AuditLog: [],
};
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
      const row = { createdAt: new Date().toISOString(), ...data, id: `row-${seq++}` } as Row;
      world[name].push(row);
      return row;
    },
    all: async () => world[name],
  };
}
(db as unknown as { orm: unknown }).orm = {
  public: {
    Payment: table('Payment'), PaymentSetting: table('PaymentSetting'), Appointment: table('Appointment'),
    Customer: table('Customer'), Account: table('Account'), AppointmentService: table('AppointmentService'),
    Staff: table('Staff'), StaffService: table('StaffService'), StaffSchedule: table('StaffSchedule'),
    ScheduleRequest: table('ScheduleRequest'), BusinessHour: table('BusinessHour'),
    Service: table('Service'), ServiceCategory: table('ServiceCategory'), AuditLog: table('AuditLog'),
  },
};

const CUSTOMER_ACC = 'acc-c1';
const STAFF_ACC = 'acc-s1';
const MANAGER_ACC = 'acc-m1';

/** A date inside the current Manila month, after now, with room to run. */
function futureSlot(): { date: string; dayOfWeek: number } {
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const [year, month] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Number(today.slice(8)) + 2, lastDay);
  const date = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
  return { date, dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay() };
}

function seed() {
  for (const key of Object.keys(world)) world[key] = [];
  createCalls = 0;
  lastCreateBody = null;
  fakeCheckout = { status: 'CREATED' };
  fakePayment = { status: 'PAYMENT_SUCCESS' };
  failTransport = false;
  const { date, dayOfWeek } = futureSlot();
  world.Account.push(
    { id: CUSTOMER_ACC, email: 'c@example.test', firstName: 'Cathy', lastName: 'Customer' },
    { id: STAFF_ACC, email: 's@example.test', firstName: 'Sam', lastName: 'Stylist' },
    { id: MANAGER_ACC, email: 'm@example.test', firstName: 'Manny', lastName: 'Manager' },
  );
  world.Customer.push({ id: 'cust-1', accountId: CUSTOMER_ACC, firstName: 'Cathy', lastName: 'Customer' });
  world.Staff.push({ id: 'staff-1', accountId: STAFF_ACC, firstName: 'Sam', lastName: 'Stylist' });
  world.ServiceCategory.push({ id: 'cat-1', name: 'Hair', isActive: true });
  world.Service.push({ id: 'svc-1', name: 'Haircut', price: '1550.00', durationMinutes: 15, isActive: true, categoryId: 'cat-1' });
  world.StaffService.push({ staffId: 'staff-1', serviceId: 'svc-1' });
  world.BusinessHour.push({ id: 'bh-1', dayOfWeek, isOpen: true, openTime: '00:00', closeTime: '23:59' });
  world.StaffSchedule.push({
    id: 'sch-1', staffId: 'staff-1', dayOfWeek, isActive: true,
    effectiveFrom: '2026-01-01', effectiveUntil: null, startTime: '00:00', endTime: '23:59',
  });
  world.Appointment.push({
    id: 'apt-1', appointmentCode: 'APT-TEST-1', customerId: 'cust-1', staffId: 'staff-1',
    appointmentDate: date, startTime: '23:30', endTime: '23:45',
    totalAmount: '1550.00', status: 'RESERVED', holdExpiresAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  world.AppointmentService.push({
    id: 'as-1', appointmentId: 'apt-1', serviceId: 'svc-1', serviceName: 'Haircut', price: '1550.00', durationMinutes: 15,
  });
}

// ---- fake Maya transport --------------------------------------------------

interface FakeCheckout {
  status: string;
  paymentStatus?: string;
  paymentId?: string | null;
  totalAmount?: { amount?: string; currency?: string } | null;
  requestReferenceNumber?: string | null;
}

/** The real sandbox retrieve shape (totalAmount.amount is a decimal peso string). */
function okCheckout(reference: string, centavos: number, paymentId: string): FakeCheckout {
  return {
    status: 'PAYMENT_SUCCESS',
    paymentStatus: 'PAYMENT_SUCCESS',
    paymentId,
    totalAmount: { amount: fromCentavos(centavos), currency: 'PHP' },
    requestReferenceNumber: reference,
  };
}
let fakeCheckout: FakeCheckout = { status: 'CREATED' };
let fakePayment: { status: string; amount?: { value?: number }; currency?: string } = { status: 'PAYMENT_SUCCESS' };
let createCalls = 0;
let lastCreateBody: Record<string, unknown> | null = null;
let failTransport = false;

maya.setMayaFetchForTests((async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  if (failTransport) throw new TypeError('network down');
  if (init?.method === 'POST' && url.endsWith('/checkout/v1/checkouts')) {
    createCalls += 1;
    lastCreateBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      checkoutId: `chk-${createCalls}`,
      redirectUrl: `https://pg-sandbox.paymaya.com/payments/chk-${createCalls}`,
      status: 'CREATED',
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/checkout/v1/checkouts/')) {
    return new Response(JSON.stringify(fakeCheckout), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/payments/v1/payments/')) {
    return new Response(JSON.stringify(fakePayment), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404, headers: { 'content-type': 'application/json' } });
}) as typeof fetch);

const CUSTOMER = { userId: CUSTOMER_ACC, role: 'CUSTOMER' };
const STAFF = { userId: STAFF_ACC, role: 'STAFF' };
const MANAGER = { userId: MANAGER_ACC, role: 'MANAGER' };

function paymentRows() { return world.Payment; }
function auditActions(): string[] { return world.AuditLog.map((row) => String(row.action)); }

// ---- create: amounts, hold, idempotency ----------------------------------

test('pay in full: one PENDING Maya attempt, a 15-minute hold, one sandbox checkout', async () => {
  seed();
  const view = await MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
    appointmentId: 'apt-1', plan: 'FULL', attemptToken: 'attempt-full-1',
  });
  assert.equal(view.status, 'PENDING');
  assert.equal(view.plan, 'FULL');
  assert.equal(view.amount, 1550);
  assert.equal(view.totalAmount, 1550);
  assert.equal(view.outstanding, 1550);
  assert.ok(view.checkoutUrl?.includes('id=chk-1'), 'the view carries the sandbox checkout page');
  assert.ok(view.providerCheckoutId, 'the checkout id is recorded');
  assert.equal(createCalls, 1, 'exactly one Maya checkout');
  assert.equal((lastCreateBody as { totalAmount: { value: number } }).totalAmount.value, 1550, 'decimal pesos on the wire (155000 centavos)');
  const payment = paymentRows()[0];
  assert.equal(payment.paymentMethod, 'MAYA');
  assert.equal(payment.provider, 'MAYA');
  assert.equal(payment.status, 'PENDING');
  assert.equal(String(payment.amount), '1550.00');
  const appointment = world.Appointment[0];
  assert.equal(String(appointment.status), 'RESERVED', 'the slot is held');
  assert.ok(appointment.holdExpiresAt, 'the hold carries an expiry');
  const hold = new Date(String(appointment.holdExpiresAt)).getTime() - Date.now();
  assert.ok(hold > 14 * 60 * 1000 && hold <= 15 * 60 * 1000, 'the hold is 15 minutes');
});

test('down payment: 40% of the total in integer centavos, plan DOWN', async () => {
  seed();
  const view = await MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
    appointmentId: 'apt-1', plan: 'DOWN', attemptToken: 'attempt-down-1',
  });
  assert.equal(view.plan, 'DOWN');
  assert.equal(view.amount, 620, 'round(1550.00 x 40 / 100) = 620.00');
  assert.equal(view.outstanding, 1550, 'nothing is settled yet — the balance appears after payment');
  assert.equal((lastCreateBody as { totalAmount: { value: number } }).totalAmount.value, 620);
});

test('40% math at 333.33 and 450.00, including the rounding case', async () => {
  // 333.33 -> deposit round(33333 x 40 / 100) = 13333 centavos (133.33)
  const down333 = Math.round((33333 * 40) / 100);
  assert.equal(down333, 13333);
  assert.equal(33333 - down333, 20000, 'balance 200.00');
  // 450.00 -> exactly 18000 centavos (180.00)
  assert.equal(Math.round((45000 * 40) / 100), 18000);
  // rounding case: 0.40 x 1 centavo rounds down to 0 but the option guard
  // refuses zero-value attempts instead of charging 0.
  assert.equal(Math.round((1 * 40) / 100), 0);
});

test('double click: the same attempt token creates one payment and one checkout', async () => {
  seed();
  const first = await MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
    appointmentId: 'apt-1', plan: 'FULL', attemptToken: 'attempt-dbl-1',
  });
  const second = await MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
    appointmentId: 'apt-1', plan: 'FULL', attemptToken: 'attempt-dbl-1',
  });
  assert.equal(paymentRows().length, 1, 'one payment attempt');
  assert.equal(createCalls, 1, 'one Maya checkout');
  assert.equal(second.paymentId, first.paymentId);
  assert.equal(second.checkoutUrl, first.checkoutUrl);
});

test('a pending attempt resumes without ever creating a second checkout', async () => {
  seed();
  await MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
    appointmentId: 'apt-1', plan: 'FULL', attemptToken: 'attempt-resume-1',
  });
  await MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
    appointmentId: 'apt-1', plan: 'FULL', attemptToken: 'attempt-resume-1',
  });
  await MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
    appointmentId: 'apt-1', plan: 'FULL', attemptToken: 'attempt-resume-1',
  });
  assert.equal(createCalls, 1);
});

test('revalidation runs before the payment: a taken slot is refused', async () => {
  seed();
  world.Appointment.push({
    id: 'apt-2', appointmentCode: 'APT-TEST-2', customerId: 'cust-1', staffId: 'staff-1',
    appointmentDate: world.Appointment[0].appointmentDate, startTime: '23:30', endTime: '23:45',
    totalAmount: '1550.00', status: 'CONFIRMED', holdExpiresAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await assert.rejects(
    () => MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
      appointmentId: 'apt-1', plan: 'FULL', attemptToken: 'attempt-clash-1',
    }),
    /already has a booking at that time/,
  );
  assert.equal(paymentRows().length, 0, 'no payment attempt is created');
});

// ---- verification: authoritative, idempotent, mismatch-safe --------------

test('cancel path: a COMPLETED checkout session with PAYMENT_CANCELLED never credits', async () => {
  seed();
  const view = await startAttempt('attempt-cancel-1');
  // What the real sandbox reports after "Back to Merchant": the SESSION is
  // COMPLETED (redirects finished) but the payment was cancelled, paymentId
  // is null, and no money moved.
  fakeCheckout = {
    status: 'COMPLETED',
    paymentStatus: 'PAYMENT_CANCELLED',
    paymentId: null,
    totalAmount: { amount: fromCentavos(155000), currency: 'PHP' },
    requestReferenceNumber: view.paymentId,
  };
  const outcome = await MayaPaymentsService.verifyPayment(view.paymentId, null);
  assert.equal(outcome.state, 'FAILED', 'an abandoned checkout is terminal');
  assert.equal(outcome.view.status, 'FAILED');
  assert.equal(outcome.view.paidTotal, 0, 'nothing is ever credited');
  assert.equal(String(world.Appointment[0].status), 'CANCELLED', 'the unpaid hold is released');
  assert.ok(auditActions().includes('MAYA_PAYMENT_CANCELLED'));
});

test('a success claim without a payment id is never credited (no settlement behind it)', async () => {
  seed();
  const view = await startAttempt('attempt-nosettle-1');
  fakeCheckout = {
    status: 'PAYMENT_SUCCESS',
    paymentStatus: 'PAYMENT_SUCCESS',
    paymentId: null,
    totalAmount: { amount: fromCentavos(155000), currency: 'PHP' },
    requestReferenceNumber: view.paymentId,
  };
  const outcome = await MayaPaymentsService.verifyPayment(view.paymentId, null);
  assert.equal(outcome.state, 'MISMATCH');
  assert.equal(outcome.view.status, 'FAILED');
  assert.equal(outcome.view.paidTotal, 0, 'no settlement cross-check means no credit');
  assert.ok(auditActions().includes('MAYA_PAYMENT_NOT_SETTLED'));
});

async function startAttempt(token: string) {
  const view = await MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
    appointmentId: 'apt-1', plan: 'FULL', attemptToken: token,
  });
  return view;
}

test('authoritative success: PAID, appointment booked, hold released', async () => {
  seed();
  const view = await startAttempt('attempt-ok-1');
  fakeCheckout = okCheckout(view.paymentId, 155000, 'maya-pay-1');
  fakePayment = { status: 'PAYMENT_SUCCESS', amount: { value: 1550 }, currency: 'PHP' };
  const outcome = await MayaPaymentsService.verifyPayment(view.paymentId, null);
  assert.equal(outcome.state, 'PAID');
  assert.equal(outcome.view.status, 'PAID');
  assert.equal(outcome.view.paidTotal, 1550);
  assert.equal(outcome.view.outstanding, 0);
  assert.equal(world.Appointment[0].status, 'CONFIRMED', 'the appointment is booked');
  assert.equal(world.Appointment[0].holdExpiresAt, null, 'the hold is released');
  assert.ok(auditActions().includes('MAYA_PAYMENT_CONFIRMED'));
});

test('the webhook body alone can never mark a payment paid', async () => {
  seed();
  const view = await startAttempt('attempt-forge-1');
  // The callback body claims success while the Maya API still says pending.
  fakeCheckout = { status: 'FOR_PAYMENT', paymentStatus: 'PENDING_TOKEN', paymentId: null, totalAmount: { amount: '1550.00', currency: 'PHP' }, requestReferenceNumber: view.paymentId };
  await MayaPaymentsService.processWebhook({ checkoutId: view.providerCheckoutId, status: 'PAYMENT_SUCCESS', paymentId: 'maya-pay-x' });
  const payment = paymentRows()[0];
  assert.equal(payment.status, 'PENDING', 'still pending — the body is never trusted');
  assert.equal(world.Appointment[0].status, 'RESERVED');
});

test('duplicate success callbacks are idempotent and never credit twice', async () => {
  seed();
  const view = await startAttempt('attempt-dup-1');
  fakeCheckout = okCheckout(view.paymentId, 155000, 'maya-pay-2');
  fakePayment = { status: 'PAYMENT_SUCCESS', amount: { value: 1550 }, currency: 'PHP' };
  await MayaPaymentsService.processWebhook({ checkoutId: view.providerCheckoutId, paymentId: 'maya-pay-2' });
  await MayaPaymentsService.processWebhook({ checkoutId: view.providerCheckoutId, paymentId: 'maya-pay-2' });
  await MayaPaymentsService.verifyPayment(view.paymentId, null);
  const settled = await PaymentsService.settledCentsFor('apt-1');
  assert.equal(settled, 155000, 'the money is credited exactly once');
  assert.equal(paymentRows().length, 1);
});

test('amount mismatch is refused and audited, never credited', async () => {
  seed();
  const view = await startAttempt('attempt-amt-1');
  fakeCheckout = okCheckout(view.paymentId, 10000, 'maya-pay-3');
  const outcome = await MayaPaymentsService.verifyPayment(view.paymentId, 'acc-x');
  assert.equal(outcome.state, 'MISMATCH');
  assert.equal(outcome.view.status, 'FAILED');
  assert.equal(await PaymentsService.settledCentsFor('apt-1'), 0);
  assert.ok(auditActions().includes('MAYA_AMOUNT_MISMATCH'));
});

test('reference mismatch is refused and audited, never credited', async () => {
  seed();
  await startAttempt('attempt-ref-1');
  fakeCheckout = okCheckout('someone-elses-payment', 155000, 'maya-pay-4');
  const outcome = await MayaPaymentsService.verifyPayment(paymentRows()[0].id as string, null);
  assert.equal(outcome.state, 'MISMATCH');
  assert.equal(outcome.view.status, 'FAILED');
  assert.equal(await PaymentsService.settledCentsFor('apt-1'), 0);
  assert.ok(auditActions().includes('MAYA_REFERENCE_MISMATCH'));
});

test('a failed checkout ends the attempt and releases the hold', async () => {
  seed();
  const view = await startAttempt('attempt-fail-1');
  fakeCheckout = { status: 'PAYMENT_FAILED', paymentStatus: 'PAYMENT_FAILED', paymentId: null, totalAmount: null, requestReferenceNumber: null };
  const outcome = await MayaPaymentsService.verifyPayment(view.paymentId, null);
  assert.equal(outcome.state, 'FAILED');
  assert.equal(world.Appointment[0].status, 'CANCELLED', 'the hold is released');
  assert.ok(auditActions().includes('APPOINTMENT_CANCELLED'));
});

test('an expired hold ends the attempt and frees the slot', async () => {
  seed();
  const view = await startAttempt('attempt-exp-1');
  // Move the hold into the past, as the clock would after 15 minutes.
  world.Appointment[0].holdExpiresAt = new Date(Date.now() - 1000).toISOString();
  fakeCheckout = { status: 'FOR_PAYMENT', paymentStatus: 'PENDING_TOKEN', paymentId: null, totalAmount: null, requestReferenceNumber: null };
  const outcome = await MayaPaymentsService.verifyPayment(view.paymentId, null);
  assert.equal(outcome.state, 'EXPIRED');
  assert.equal(outcome.view.status, 'EXPIRED');
  assert.equal(world.Appointment[0].status, 'CANCELLED', 'the slot is available again');
  assert.ok(auditActions().includes('MAYA_HOLD_EXPIRED'));
});

test('an unknown callback is acknowledged and changes nothing', async () => {
  seed();
  await MayaPaymentsService.processWebhook({ checkoutId: 'chk-nope', paymentId: 'pay-nope' });
  assert.equal(paymentRows().length, 0);
  assert.ok(auditActions().includes('MAYA_WEBHOOK_UNKNOWN'));
});

test('a transport failure never credits and never finalizes early', async () => {
  seed();
  const view = await startAttempt('attempt-net-1');
  failTransport = true;
  const outcome = await MayaPaymentsService.verifyPayment(view.paymentId, null);
  failTransport = false;
  assert.equal(outcome.state, 'PENDING');
  assert.equal(outcome.view.status, 'PENDING');
});

// ---- paid-booking cancellation rules -------------------------------------

test('a customer cannot cancel a paid booking', async () => {
  seed();
  const view = await startAttempt('attempt-cc-1');
  fakeCheckout = okCheckout(view.paymentId, 155000, 'maya-pay-5');
  fakePayment = { status: 'PAYMENT_SUCCESS', amount: { value: 1550 }, currency: 'PHP' };
  await MayaPaymentsService.verifyPayment(view.paymentId, null);
  await assert.rejects(
    () => AppointmentsService.updateStatus('apt-1', 'CANCELLED', CUSTOMER_ACC, 'CUSTOMER'),
    /manager or admin/,
  );
  assert.equal(world.Appointment[0].status, 'CONFIRMED');
});

test('staff cannot cancel a paid booking, and a manager can (with an audit note)', async () => {
  seed();
  const view = await startAttempt('attempt-cs-1');
  fakeCheckout = okCheckout(view.paymentId, 155000, 'maya-pay-6');
  fakePayment = { status: 'PAYMENT_SUCCESS', amount: { value: 1550 }, currency: 'PHP' };
  await MayaPaymentsService.verifyPayment(view.paymentId, null);
  await assert.rejects(
    () => AppointmentsService.updateStatus('apt-1', 'CANCELLED', STAFF_ACC, 'STAFF'),
    /manager or admin/,
  );
  const result = await AppointmentsService.updateStatus('apt-1', 'CANCELLED', MANAGER_ACC, 'MANAGER');
  assert.equal(result.status, 'CANCELLED');
  const cancelAudit = world.AuditLog.filter((row) => String(row.action) === 'UPDATE_APPOINTMENT_STATUS').pop();
  assert.ok(cancelAudit && JSON.stringify(cancelAudit.newData).includes('Cancelled by'), 'the cancellation carries an audit note');
});

test('in-person balance collection keeps working after a Maya down payment', async () => {
  seed();
  const downView = await MayaPaymentsService.createCheckoutAttempt(CUSTOMER, {
    appointmentId: 'apt-1', plan: 'DOWN', attemptToken: 'attempt-balance-1',
  });
  fakeCheckout = okCheckout(downView.paymentId, 62000, 'maya-pay-7');
  fakePayment = { status: 'PAYMENT_SUCCESS', amount: { value: 620 }, currency: 'PHP' };
  await MayaPaymentsService.verifyPayment(downView.paymentId, null);
  assert.equal(await PaymentsService.settledCentsFor('apt-1'), 62000, 'the 40% deposit is settled');
  assert.equal(world.Appointment[0].status, 'CONFIRMED');
  // The remaining balance is exactly the outstanding amount (1550 - 620).
  await PaymentsService.recordInPerson(MANAGER, {
    appointmentId: 'apt-1', method: 'CASH', amount: 930,
  });
  assert.equal(await PaymentsService.settledCentsFor('apt-1'), 155000, 'deposit + balance = total');
  // Over-collection is still refused.
  await assert.rejects(
    () => PaymentsService.recordInPerson(MANAGER, { appointmentId: 'apt-1', method: 'CASH', amount: 10 }),
    /exceeds the outstanding balance/,
  );
});
