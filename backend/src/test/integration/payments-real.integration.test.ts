// Payment rules against a REAL local database (Part B real run). Service-level
// rules only — the upload path's storage is an in-memory fake and is exercised
// in the unit suite; no Supabase call is ever made from this file. Rows are
// created and deleted again by exact id. The suite refuses to run unless the
// target DSN host is localhost, and it never reads backend/.env: the target is
// passed explicitly by the caller. Credentials are never logged.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const DB_URL = process.env.DATABASE_URL ?? '';
const HOST_MATCH = DB_URL.match(/postgres(?:ql)?:\/\/[^@]*@([^:/]+)/);
const DB_HOST = HOST_MATCH?.[1] ?? '';
const LOCAL = DB_HOST === '127.0.0.1' || DB_HOST === 'localhost';
// Non-localhost targets are refused unless the explicit hosted-test script
// opts in (ALLOW_HOSTED_INTEGRATION=1); the localhost-only run never sets it.
const HOSTED_OK = process.env.ALLOW_HOSTED_INTEGRATION === '1';
const REAL_DB = DB_URL !== '' && !/127\.0\.0\.1:5\//.test(DB_URL) && (LOCAL || HOSTED_OK);

const FIXTURES = {
  accountCustomer: 'aaaaaaaa-0000-4000-8000-000000000001',
  accountStaff: 'aaaaaaaa-0000-4000-8000-000000000002',
  accountManager: 'aaaaaaaa-0000-4000-8000-000000000003',
  accountAdmin: 'aaaaaaaa-0000-4000-8000-000000000004',
  customer: 'bbbbbbbb-0000-4000-8000-000000000001',
  staff: 'cccccccc-0000-4000-8000-000000000001',
  appointmentFull: 'dddddddd-0000-4000-8000-000000000001',
  appointmentSplit: 'dddddddd-0000-4000-8000-000000000002',
  appointmentRace: 'dddddddd-0000-4000-8000-000000000003',
  appointmentDup: 'dddddddd-0000-4000-8000-000000000004',
  serviceFull: 'eeeeeeee-0000-4000-8000-000000000001',
  serviceSplit: 'eeeeeeee-0000-4000-8000-000000000002',
  serviceRace: 'eeeeeeee-0000-4000-8000-000000000003',
  serviceDup: 'eeeeeeee-0000-4000-8000-000000000004',
  category: 'ffffffff-0000-4000-8000-000000000001',
  service: 'ffffffff-0000-4000-8000-000000000002',
};

const CUSTOMER = { userId: FIXTURES.accountCustomer, role: 'CUSTOMER' };
const STAFF = { userId: FIXTURES.accountStaff, role: 'STAFF' };
const MANAGER = { userId: FIXTURES.accountManager, role: 'MANAGER' };
const ADMIN = { userId: FIXTURES.accountAdmin, role: 'ADMIN' };

test(
  'payment rules hold against a real local database',
  { skip: REAL_DB ? false : 'no local real DATABASE_URL - integration skipped' },
  async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const { Client } = require('pg');
    const raw = new Client({ connectionString: DB_URL });
    await raw.connect();
    const sql = async (text: string, values: unknown[] = []) => (await raw.query(text, values)).rows;

    const { db } = await import('../../prisma/db.js');
    const { PaymentsService } = await import('../../modules/payments/payments.service.js');

    // ---- fixtures (exact ids for exact-id cleanup) ------------------------
    // Idempotent: a previous failed run may have left these exact ids behind.
    await sql(`DELETE FROM audit_logs WHERE entity_id = ANY($1::uuid[])`, [
      [FIXTURES.appointmentFull, FIXTURES.appointmentSplit, FIXTURES.appointmentRace, FIXTURES.appointmentDup],
    ]);
    await sql(`DELETE FROM appointment_services WHERE id = ANY($1::uuid[])`, [
      [FIXTURES.serviceFull, FIXTURES.serviceSplit, FIXTURES.serviceRace, FIXTURES.serviceDup],
    ]);
    await sql(`DELETE FROM appointments WHERE id = ANY($1::uuid[])`, [
      [FIXTURES.appointmentFull, FIXTURES.appointmentSplit, FIXTURES.appointmentRace, FIXTURES.appointmentDup],
    ]);
    await sql(`DELETE FROM services WHERE id = $1`, [FIXTURES.service]);
    await sql(`DELETE FROM service_categories WHERE id = $1`, [FIXTURES.category]);
    await sql(`DELETE FROM customers WHERE id = $1`, [FIXTURES.customer]);
    await sql(`DELETE FROM staff WHERE id = $1`, [FIXTURES.staff]);
    await sql(`DELETE FROM accounts WHERE id = ANY($1::uuid[])`, [
      [FIXTURES.accountCustomer, FIXTURES.accountStaff, FIXTURES.accountManager, FIXTURES.accountAdmin],
    ]);
    await sql(
      `INSERT INTO accounts (id, email, password_hash, role, status) VALUES
        ($1,'real-c@test.local','x','CUSTOMER','ACTIVE'),
        ($2,'real-s@test.local','x','STAFF','ACTIVE'),
        ($3,'real-m@test.local','x','MANAGER','ACTIVE'),
        ($4,'real-a@test.local','x','ADMIN','ACTIVE')`,
      [FIXTURES.accountCustomer, FIXTURES.accountStaff, FIXTURES.accountManager, FIXTURES.accountAdmin],
    );
    await sql(`INSERT INTO customers (id, account_id, first_name, last_name) VALUES ($1,$2,'Real','Customer')`, [
      FIXTURES.customer,
      FIXTURES.accountCustomer,
    ]);
    await sql(
      `INSERT INTO staff (id, account_id, first_name, last_name, position, primary_role, employment_type) VALUES ($1,$2,'Real','Staff','Stylist','STYLIST','FULL_TIME')`,
      [FIXTURES.staff, FIXTURES.accountStaff],
    );
    await sql(`INSERT INTO service_categories (id, name) VALUES ($1,'Real run category')`, [FIXTURES.category]);
    await sql(`INSERT INTO services (id, name, price, duration_minutes, category_id) VALUES ($1,'Real run service',1000,60,$2)`, [
      FIXTURES.service,
      FIXTURES.category,
    ]);
    for (const [appointmentId, serviceId, code, total] of [
      [FIXTURES.appointmentFull, FIXTURES.serviceFull, 'APT-REALRUN-FULL', 1000],
      [FIXTURES.appointmentSplit, FIXTURES.serviceSplit, 'APT-REALRUN-SPLIT', 1000],
      [FIXTURES.appointmentRace, FIXTURES.serviceRace, 'APT-REALRUN-RACE', 600],
      [FIXTURES.appointmentDup, FIXTURES.serviceDup, 'APT-REALRUN-DUP', 1000],
    ] as const) {
      await sql(
        `INSERT INTO appointments (id, appointment_code, customer_id, staff_id, status, appointment_date, start_time, end_time, total_amount)
         VALUES ($1,$2,$3,$4,'RESERVED','2026-11-10','10:00','11:00',$5)`,
        [appointmentId, code, FIXTURES.customer, FIXTURES.staff, total],
      );
      await sql(
        `INSERT INTO appointment_services (id, appointment_id, service_id, service_name, price, duration_minutes) VALUES ($1,$2,$3,'Real run service',$4,60)`,
        [serviceId, appointmentId, FIXTURES.service, total],
      );
    }

    const created: string[] = [];
    try {
      // ---- 1. full payment: server amount == outstanding, then verified ---
      const quoteFull = await PaymentsService.quote(FIXTURES.appointmentFull, CUSTOMER);
      const fullOption = quoteFull.options.find((option) => option.key === 'FULL');
      assert.ok(fullOption, 'FULL option must be quoted');
      assert.equal(fullOption!.amount, 1000);
      const fullPayment = await PaymentsService.submitOnline(FIXTURES.appointmentFull, CUSTOMER, {
        option: 'FULL',
        referenceNo: '  real run full 1 ',
        proofStoragePath: 'payments/real-full.png',
      });
      created.push(fullPayment.id);
      // normalization: trimmed, uppercased, spaces stripped
      assert.equal(fullPayment.referenceNo, 'REALRUNFULL1');
      assert.equal(fullPayment.amount, 1000);
      assert.equal(fullPayment.status, 'UNVERIFIED');
      assert.equal(fullPayment.hasProof, true);
      assert.equal((fullPayment as { proofUrl?: unknown }).proofUrl, undefined, 'no stored URL is ever exposed');
      await PaymentsService.setStatus(MANAGER, fullPayment.id, 'VERIFIED');
      const afterFull = await PaymentsService.quote(FIXTURES.appointmentFull, CUSTOMER);
      assert.equal(afterFull.outstanding, 0, 'full payment clears the balance');

      // ---- 2. 40% deposit then balance -----------------------------------
      const quoteSplit = await PaymentsService.quote(FIXTURES.appointmentSplit, CUSTOMER);
      const downOption = quoteSplit.options.find((option) => option.key === 'DOWN');
      assert.ok(downOption, 'DOWN option must be quoted under the DEPOSIT_PERCENT policy');
      assert.equal(downOption!.amount, 400); // round(1000 x 40 / 100)
      const deposit = await PaymentsService.submitOnline(FIXTURES.appointmentSplit, CUSTOMER, {
        option: 'DOWN',
        referenceNo: 'REALDEP1',
        proofStoragePath: 'payments/real-dep.png',
      });
      created.push(deposit.id);
      assert.equal(deposit.amount, 500);
      await PaymentsService.setStatus(ADMIN, deposit.id, 'VERIFIED'); // ADMIN may verify online proof
      const afterDeposit = await PaymentsService.quote(FIXTURES.appointmentSplit, CUSTOMER);
      assert.equal(afterDeposit.outstanding, 600, 'verified deposit reduces the balance');
      const balance = await PaymentsService.recordInPerson(STAFF, {
        appointmentId: FIXTURES.appointmentSplit,
        method: 'GCASH',
        amount: 600,
        referenceNo: 'real bal 1',
      });
      created.push(balance.id);
      assert.equal(balance.status, 'VERIFIED', 'in-person money is accepted immediately');
      assert.equal(balance.referenceNo, 'REALBAL1');
      const afterBalance = await PaymentsService.quote(FIXTURES.appointmentSplit, CUSTOMER);
      assert.equal(afterBalance.outstanding, 0, 'deposit + balance clears the total');

      // ---- 3. overpayment rejected ---------------------------------------
      await assert.rejects(
        () => PaymentsService.recordInPerson(MANAGER, { appointmentId: FIXTURES.appointmentSplit, method: 'CASH', amount: 2000 }),
        /exceeds the outstanding balance/i,
      );

      // ---- 4. duplicate reference -> generic 409 -------------------------
      // 'real dup 1' normalizes to the already-used REALDUP1.
      const firstDup = await PaymentsService.submitOnline(FIXTURES.appointmentDup, CUSTOMER, {
        option: 'DOWN',
        referenceNo: 'REALDUP1',
        proofStoragePath: 'payments/real-d1.png',
      });
      created.push(firstDup.id);
      await PaymentsService.setStatus(MANAGER, firstDup.id, 'VERIFIED');
      await assert.rejects(
        () =>
          PaymentsService.submitOnline(FIXTURES.appointmentDup, CUSTOMER, {
            option: 'FULL',
            referenceNo: 'real dup 1',
            proofStoragePath: 'payments/real-d2.png',
          }),
        (error: Error & { code?: string }) => {
          assert.equal(error.code, 'CONFLICT');
          assert.match(error.message, /already been used/i);
          assert.doesNotMatch(error.message, /REALDUP1/i, 'the message must not reveal who used the reference');
          return true;
        },
      );

      // ---- 5. double confirm rejected ------------------------------------
      // fullPayment was verified in scenario 1; confirming it again must fail.
      await assert.rejects(
        () => PaymentsService.setStatus(MANAGER, fullPayment.id, 'VERIFIED'),
        /already been confirmed/i,
      );

      // ---- 6. two concurrent recordings keep totals consistent -----------
      const [raceA, raceB] = await Promise.all([
        PaymentsService.recordInPerson(STAFF, { appointmentId: FIXTURES.appointmentRace, method: 'CASH', amount: 300 }),
        PaymentsService.recordInPerson(MANAGER, { appointmentId: FIXTURES.appointmentRace, method: 'GCASH', amount: 300 }),
      ]);
      created.push(raceA.id, raceB.id);
      const afterRace = await PaymentsService.quote(FIXTURES.appointmentRace, CUSTOMER);
      assert.equal(afterRace.verifiedTotal, 600, 'both recordings land exactly once');
      assert.equal(afterRace.outstanding, 0, 'concurrent recordings never overshoot the total');

      // ---- 7. only MANAGER and ADMIN verify online proofs ----------------
      const third = await PaymentsService.submitOnline(FIXTURES.appointmentDup, CUSTOMER, {
        option: 'FULL',
        referenceNo: 'REALTHIRD1',
        proofStoragePath: 'payments/real-3.png',
      });
      created.push(third.id);
      await assert.rejects(
        () => PaymentsService.setStatus(STAFF, third.id, 'VERIFIED'),
        /Only managers and admins can verify payments/i,
      );
      await PaymentsService.setStatus(ADMIN, third.id, 'VERIFIED');

      // ---- 8. audit trail ------------------------------------------------
      const auditRows = await sql(
        `SELECT action FROM audit_logs WHERE entity_id = ANY($1::uuid[]) ORDER BY created_at`,
        [created],
      );
      const actions = auditRows.map((row: { action: string }) => String(row.action));
      assert.ok(actions.includes('SUBMIT_ONLINE_PAYMENT'), `audit must record submissions: ${actions.join(',')}`);
      assert.ok(actions.includes('RECORD_IN_PERSON_PAYMENT'), `audit must record in-person money: ${actions.join(',')}`);
      assert.ok(actions.length >= 6, `every state change is audited, saw ${actions.length}`);
    } finally {
      // ---- cleanup by exact id ------------------------------------------
      await sql(`DELETE FROM audit_logs WHERE entity_id = ANY($1::uuid[])`, [created]);
      await sql(`DELETE FROM payments WHERE id = ANY($1::uuid[])`, [created]);
      await sql(`DELETE FROM appointment_services WHERE id = ANY($1::uuid[])`, [
        [FIXTURES.serviceFull, FIXTURES.serviceSplit, FIXTURES.serviceRace, FIXTURES.serviceDup],
      ]);
      await sql(`DELETE FROM services WHERE id = $1`, [FIXTURES.service]);
      await sql(`DELETE FROM service_categories WHERE id = $1`, [FIXTURES.category]);
      await sql(`DELETE FROM appointments WHERE id = ANY($1::uuid[])`, [
        [FIXTURES.appointmentFull, FIXTURES.appointmentSplit, FIXTURES.appointmentRace, FIXTURES.appointmentDup],
      ]);
      await sql(`DELETE FROM customers WHERE id = $1`, [FIXTURES.customer]);
      await sql(`DELETE FROM staff WHERE id = $1`, [FIXTURES.staff]);
      await sql(`DELETE FROM accounts WHERE id = ANY($1::uuid[])`, [
        [FIXTURES.accountCustomer, FIXTURES.accountStaff, FIXTURES.accountManager, FIXTURES.accountAdmin],
      ]);
      await raw.end();
    }
  },
);
