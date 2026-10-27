// Payment rules: server-calculated amounts, deposit/balance guards, one-way
// confirmation, permissions. Fake ORM — isolated from any database.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://***:***@127.0.0.1:5/route-test';
// Dummy loopback values so proof-URL minting can run against a mocked fetch
// (no Supabase call is ever made by tests).
process.env.SUPABASE_URL = 'http://127.0.0.1:5';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { PaymentsService }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./payments.service.js'),
]);

interface Row extends Record<string, unknown> { id?: string }
const world: Record<string, Row[]> = {
  Payment: [], PaymentSetting: [], Appointment: [], Customer: [], Account: [],
  AppointmentService: [], Staff: [], AuditLog: [],
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
    Staff: table('Staff'), AuditLog: table('AuditLog'),
  },
};

const CUSTOMER_ACC = 'acc-c1';
const STAFF_ACC = 'acc-s1';
const MANAGER_ACC = 'acc-m1';
const APT = 'apt-1';

function seed(opts: { total?: number; settings?: Record<string, unknown> | null; payments?: Row[] } = {}): void {
  for (const key of Object.keys(world)) world[key] = [];
  world.Account = [
    { id: CUSTOMER_ACC, email: 'c@x', role: 'CUSTOMER', status: 'ACTIVE', isSystem: false },
    { id: STAFF_ACC, email: 's@x', role: 'STAFF', status: 'ACTIVE', isSystem: false },
    { id: MANAGER_ACC, email: 'm@x', role: 'MANAGER', status: 'ACTIVE', isSystem: false },
  ];
  world.Customer = [{ id: 'cust-1', accountId: CUSTOMER_ACC, firstName: 'Cat', lastName: 'Tomer' }];
  world.Staff = [{ id: 'st-1', accountId: STAFF_ACC, firstName: 'Sta', lastName: 'Ff' }];
  world.Appointment = [{
    id: APT, appointmentCode: 'APT-TEST', customerId: 'cust-1', staffId: 'st-1',
    status: 'RESERVED', totalAmount: opts.total ?? 1000,
  }];
  world.AppointmentService = [{ id: 'as-1', appointmentId: APT, serviceName: 'Haircut', price: opts.total ?? 1000, durationMinutes: 45 }];
  world.PaymentSetting = opts.settings === undefined
    ? [{ id: 'set-1', gcashQrUrl: 'https://cdn/qr.png', receiverName: 'Royalty Salon', accountNumberMasked: '09•• ••• 1234', downPaymentKind: 'PERCENT', downPaymentValue: 40 }]
    : (opts.settings ? [opts.settings as Row] : []);
  world.Payment = (opts.payments ?? []).map((row) => ({ createdAt: new Date('2026-10-26T10:00:00Z').toISOString(), ...row }));
  world.AuditLog = [];
}

test('quote: FULL equals outstanding and DOWN equals DEPOSIT_PERCENT of the total', async () => {
  seed({ total: 1000 });
  const quote = await PaymentsService.quote(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
  assert.equal(quote.totalAmount, 1000);
  assert.equal(quote.outstanding, 1000);
  assert.deepEqual(quote.options, [
    { key: 'FULL', amount: 1000 },
    { key: 'DOWN', amount: 400 }, // round(1000 x 40 / 100)
  ]);
});

test('quote: the PERCENT rate is the server setting, not the row value', async () => {
  // A row claiming 50 must not move the rate: one setting (DEPOSIT_PERCENT).
  seed({ total: 1000, settings: { id: 'set-1', downPaymentKind: 'PERCENT', downPaymentValue: 50, gcashQrUrl: 'https://cdn/qr.png', receiverName: null, accountNumberMasked: null } });
  const quote = await PaymentsService.quote(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
  assert.deepEqual(quote.options, [
    { key: 'FULL', amount: 1000 },
    { key: 'DOWN', amount: 400 },
  ]);
  assert.equal(quote.settings.downPaymentValue, 40);
});

test('quote: deposit rounding is integer-centavo (round, not floor)', async () => {
  const balanceAfter = (outstanding: number, deposit: number) => Math.round((outstanding - deposit) * 100) / 100;

  // 333.33 -> deposit 133.33, balance 200.00
  seed({ total: 333.33 });
  let quote = await PaymentsService.quote(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
  assert.deepEqual(quote.options.map((option) => option.amount), [333.33, 133.33]);
  assert.equal(balanceAfter(quote.outstanding, 133.33), 200);

  // 1,550 -> deposit 620.00, balance 930.00
  seed({ total: 1550 });
  quote = await PaymentsService.quote(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
  assert.deepEqual(quote.options.map((option) => option.amount), [1550, 620]);
  assert.equal(balanceAfter(quote.outstanding, 620), 930);

  // 450 -> deposit 180.00, balance 270.00
  seed({ total: 450 });
  quote = await PaymentsService.quote(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
  assert.deepEqual(quote.options.map((option) => option.amount), [450, 180]);
  assert.equal(balanceAfter(quote.outstanding, 180), 270);

  // rounds up: 333.37 -> 13334.8 centavos -> deposit 133.35, balance 200.02
  seed({ total: 333.37 });
  quote = await PaymentsService.quote(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
  assert.deepEqual(quote.options.map((option) => option.amount), [333.37, 133.35]);
  assert.equal(balanceAfter(quote.outstanding, 133.35), 200.02);
});

test('quote: DOWN is hidden when the policy is NONE and when it covers everything', async () => {
  seed({ total: 1000, settings: { id: 'set-1', downPaymentKind: 'NONE', downPaymentValue: 0, gcashQrUrl: null, receiverName: null, accountNumberMasked: null } });
  const none = await PaymentsService.quote(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
  assert.deepEqual(none.options, [{ key: 'FULL', amount: 1000 }]);

  seed({ total: 100, settings: { id: 'set-1', downPaymentKind: 'FIXED', downPaymentValue: 500, gcashQrUrl: null, receiverName: null, accountNumberMasked: null } });
  const capped = await PaymentsService.quote(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
  assert.deepEqual(capped.options, [{ key: 'FULL', amount: 100 }]);
});

test('quote: a verified deposit reduces the outstanding balance', async () => {
  seed({ total: 1000, payments: [{ id: 'p1', appointmentId: APT, amount: 500, status: 'VERIFIED', channel: 'ONLINE', paymentMethod: 'GCASH' }] });
  const quote = await PaymentsService.quote(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
  assert.equal(quote.verifiedTotal, 500);
  assert.equal(quote.outstanding, 500);
  // The deposit option exists only before a deposit exists.
  assert.deepEqual(quote.options, [{ key: 'FULL', amount: 500 }]);
});

test('online submission uses the server amount and creates an UNVERIFIED GCash row', async () => {
  seed({ total: 1000 });
  const payment = await PaymentsService.submitOnline(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' }, {
    option: 'DOWN', referenceNo: 'GCASH-REF-1', proofStoragePath: 'payments/proof.png',
  });
  assert.equal(payment.amount, 400); // the server's quoted deposit, never the browser's
  assert.equal(payment.status, 'UNVERIFIED');
  assert.equal(payment.channel, 'ONLINE');
  assert.equal(payment.paymentMethod, 'GCASH');
  const audits = world.AuditLog.filter((row) => row.action === 'SUBMIT_ONLINE_PAYMENT');
  assert.equal(audits.length, 1);
});

test('a second online submission while one is pending is rejected', async () => {
  seed({ total: 1000, payments: [{ id: 'p1', appointmentId: APT, amount: 500, status: 'UNVERIFIED', channel: 'ONLINE', paymentMethod: 'GCASH', referenceNo: 'R1' }] });
  await assert.rejects(
    () => PaymentsService.submitOnline(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' }, { option: 'FULL', referenceNo: 'R2', proofStoragePath: 'p' }),
    /already awaiting verification/,
  );
});

test('staff cannot submit online payments', async () => {
  seed();
  await assert.rejects(
    () => PaymentsService.submitOnline(APT, { userId: STAFF_ACC, role: 'STAFF' }, { option: 'FULL', referenceNo: 'R', proofStoragePath: 'p' }),
    /Only customers/,
  );
});

test('in-person payment is recorded VERIFIED with the actor and cannot exceed outstanding', async () => {
  seed({ total: 1000, payments: [{ id: 'p1', appointmentId: APT, amount: 500, status: 'VERIFIED', channel: 'ONLINE', paymentMethod: 'GCASH' }] });
  const ok = await PaymentsService.recordInPerson({ userId: STAFF_ACC, role: 'STAFF' }, { appointmentId: APT, method: 'CASH', amount: 500 });
  assert.equal(ok.status, 'VERIFIED');
  assert.equal(ok.channel, 'IN_PERSON');
  assert.equal(ok.recordedBy, STAFF_ACC);
  assert.equal(ok.verifiedBy, STAFF_ACC);

  await assert.rejects(
    () => PaymentsService.recordInPerson({ userId: STAFF_ACC, role: 'STAFF' }, { appointmentId: APT, method: 'CASH', amount: 0.5 }),
    /exceeds the outstanding balance/,
  );
});

test('zero and negative in-person amounts are rejected', async () => {
  seed();
  await assert.rejects(
    () => PaymentsService.recordInPerson({ userId: MANAGER_ACC, role: 'MANAGER' }, { appointmentId: APT, method: 'CASH', amount: 0 }),
    /greater than zero/,
  );
});

test('confirmation is one-way: an already confirmed payment cannot be re-confirmed', async () => {
  seed({ payments: [{ id: 'p1', appointmentId: APT, amount: 500, status: 'VERIFIED', channel: 'ONLINE', paymentMethod: 'GCASH', verifiedBy: MANAGER_ACC, verifiedAt: new Date().toISOString() }] });
  await assert.rejects(
    () => PaymentsService.setStatus({ userId: MANAGER_ACC, role: 'MANAGER' }, 'p1', 'VERIFIED'),
    /already been confirmed/,
  );
});

test('staff cannot verify online proof; managers can (and it is audited)', async () => {
  seed({ payments: [{ id: 'p1', appointmentId: APT, amount: 500, status: 'UNVERIFIED', channel: 'ONLINE', paymentMethod: 'GCASH', referenceNo: 'R1' }] });
  await assert.rejects(
    () => PaymentsService.setStatus({ userId: STAFF_ACC, role: 'STAFF' }, 'p1', 'VERIFIED'),
    /Only managers and admins/,
  );
  const verified = await PaymentsService.setStatus({ userId: MANAGER_ACC, role: 'MANAGER' }, 'p1', 'VERIFIED');
  assert.equal(verified.status, 'VERIFIED');
  assert.equal(verified.verifiedBy, MANAGER_ACC);
  assert.equal(world.AuditLog.filter((row) => row.action === 'VERIFY_PAYMENT').length, 1);
});

await test('references are normalized before they are stored', async () => {
  seed();
  const payment = await PaymentsService.submitOnline(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' }, {
    option: 'FULL', referenceNo: '  gc 12 3ab ', proofStoragePath: 'payments/p1.png',
  });
  assert.equal(payment.referenceNo, 'GC123AB');
});

await test('a unique violation on the reference maps to a generic 409 that reveals nothing', async () => {
  seed({ payments: [
    { id: 'pay-old', appointmentId: APT, amount: 500, paymentMethod: 'GCASH', channel: 'ONLINE', status: 'VERIFIED', referenceNo: 'GC123AB', proofUrl: 'payments/a.png', proofStoragePath: 'payments/a.png' },
  ] });
  const paymentTable = (db as unknown as { orm: { public: { Payment: { create: (d: Record<string, unknown>) => Promise<unknown> } } } }).orm.public.Payment;
  const original = paymentTable.create.bind(paymentTable);
  paymentTable.create = async (data: Record<string, unknown>) => {
    const duplicate = world.Payment.some((row) => String(row.referenceNo) === String(data.referenceNo));
    if (duplicate) {
      const error = new Error('duplicate key value violates unique constraint "payments_reference_no_key"') as Error & { code: string };
      error.code = '23505';
      throw error;
    }
    return original(data);
  };
  try {
    // 'dup 1' normalizes to DUP1; the seeded row carries the same normalized value.
    world.Payment[0].referenceNo = 'DUP1';
    await assert.rejects(
      () => PaymentsService.submitOnline(APT, { userId: CUSTOMER_ACC, role: 'CUSTOMER' }, { option: 'FULL', referenceNo: 'dup 1', proofStoragePath: 'payments/b.png' }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, 'CONFLICT');
        assert.match(error.message, /already been used/i);
        assert.doesNotMatch(error.message, /DUP1|dup 1/i);
        return true;
      },
    );
  } finally {
    paymentTable.create = original;
  }
});

await test('proof URLs: owner customer and managers get signed links, staff is refused', async () => {
  seed({ payments: [
    { id: 'pay-1', appointmentId: APT, amount: 500, paymentMethod: 'GCASH', channel: 'ONLINE', status: 'VERIFIED', referenceNo: 'R1', proofUrl: 'payments/x.png', proofStoragePath: 'payments/x.png' },
  ] });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ signedURL: '/object/sign/payment-proofs/payments/x.png?token=test' }), { status: 200 })) as typeof fetch;
  try {
    const url = await PaymentsService.proofSignedUrl('pay-1', { userId: CUSTOMER_ACC, role: 'CUSTOMER' });
    assert.match(url, /token=test/);
    const managerUrl = await PaymentsService.proofSignedUrl('pay-1', { userId: MANAGER_ACC, role: 'MANAGER' });
    assert.match(managerUrl, /token=test/);
    await assert.rejects(
      () => PaymentsService.proofSignedUrl('pay-1', { userId: STAFF_ACC, role: 'STAFF' }),
      /not available to staff/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('settings defaults to the approved PERCENT policy (DEPOSIT_PERCENT) when unset', async () => {
  seed({ settings: null });
  const settings = await PaymentsService.getSettings();
  assert.equal(settings.downPaymentKind, 'PERCENT');
  assert.equal(settings.downPaymentValue, 40); // DEPOSIT_PERCENT
  assert.equal(settings.configured, false);
});
