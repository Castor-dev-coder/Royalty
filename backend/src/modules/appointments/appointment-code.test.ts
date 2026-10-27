import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createWithUniqueAppointmentCode,
  generateAppointmentCode,
  isUniqueCodeViolation,
  normalizeAppointmentCode,
} from './appointment-code.js';

test('generated codes are APT- plus exactly five numeric digits', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(generateAppointmentCode(), /^APT-\d{5}$/);
  }
});

test('normalize: case, whitespace, and bare digits all resolve to the same code', () => {
  assert.equal(normalizeAppointmentCode('12345'), 'APT-12345');
  assert.equal(normalizeAppointmentCode('apt-12345'), 'APT-12345');
  assert.equal(normalizeAppointmentCode(' Apt 12345 '), 'APT-12345');
  assert.equal(normalizeAppointmentCode('APT-00042'), 'APT-00042');
});

test('normalize: legacy APT-<UUID> codes pass through uppercase and intact', () => {
  const legacy = 'APT-1675AE9E-F66D-4205-814C-0268A10124BC';
  assert.equal(normalizeAppointmentCode(legacy.toLowerCase()), legacy);
});

test('normalize: values that are neither five digits nor a code are left alone', () => {
  assert.equal(normalizeAppointmentCode('123456'), '123456');
  assert.equal(normalizeAppointmentCode('APT-123'), 'APT-123');
  assert.equal(normalizeAppointmentCode(''), '');
});

test('unique-violation detection matches the code-column constraint only', () => {
  assert.equal(isUniqueCodeViolation({ sqlState: '23505' }), true);
  assert.equal(isUniqueCodeViolation({ code: '23505' }), true);
  assert.equal(isUniqueCodeViolation({ constraint: 'appointments_appointment_code_key' }), true);
  assert.equal(isUniqueCodeViolation({ sqlState: '40001' }), false);
  assert.equal(isUniqueCodeViolation(new Error('boom')), false);
  assert.equal(isUniqueCodeViolation(null), false);
});

test('collision retry: a unique violation re-runs the attempt with fresh digits', async () => {
  const seen: string[] = [];
  let failures = 1;
  await createWithUniqueAppointmentCode(async (code) => {
    seen.push(code);
    if (failures > 0) {
      failures--;
      throw { sqlState: '23505', constraint: 'appointments_appointment_code_key' };
    }
  });
  assert.equal(seen.length, 2);
  assert.match(seen[0], /^APT-\d{5}$/);
  assert.match(seen[1], /^APT-\d{5}$/);
});

test('collision retry: non-collision errors rethrow immediately', async () => {
  let runs = 0;
  await assert.rejects(
    createWithUniqueAppointmentCode(async () => {
      runs++;
      throw new Error('connection lost');
    }),
    /connection lost/,
  );
  assert.equal(runs, 1);
});

test('collision retry: persistent collisions exhaust the attempt budget and rethrow', async () => {
  let runs = 0;
  await assert.rejects(
    createWithUniqueAppointmentCode(async () => {
      runs++;
      throw { sqlState: '23505' };
    }),
    (error) => isUniqueCodeViolation(error),
  );
  assert.equal(runs, 5);
});
