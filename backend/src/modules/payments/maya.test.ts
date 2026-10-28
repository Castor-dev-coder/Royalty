// Maya money math (integer centavos) and the sandbox-only guard. No network,
// no database: these are the pure rules the payment flow depends on.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://***:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
process.env.MAYA_PUBLIC_KEY = 'pk-test-value';
process.env.MAYA_SECRET_KEY = 'sk-test-value';
process.env.MAYA_BASE_URL = 'https://pg-sandbox.paymaya.com';
process.env.USER_APP_ORIGIN = 'http://localhost:5173';

const [{ toCentavos, fromCentavos, toWireAmount, fromWireAmount, requireSandboxBase, MAYA_SANDBOX_BASE, MayaConfigError }] =
  await Promise.all([import('./maya.js')]);

test('toCentavos parses peso amounts as integer centavos', () => {
  assert.equal(toCentavos('333.33'), 33333);
  assert.equal(toCentavos('1550.00'), 155000);
  assert.equal(toCentavos('450'), 45000);
  assert.equal(toCentavos('0.05'), 5);
  assert.equal(toCentavos(1550), 155000);
  assert.equal(toCentavos('10.5'), 1050);
});

test('toCentavos rejects sub-centavo precision and garbage', () => {
  assert.throws(() => toCentavos('10.005'), /sub-centavo/);
  assert.throws(() => toCentavos('1,550.00'), /Unparseable/);
  assert.throws(() => toCentavos('abc'), /Unparseable/);
});

test('fromCentavos renders exactly two decimals', () => {
  assert.equal(fromCentavos(33333), '333.33');
  assert.equal(fromCentavos(155000), '1550.00');
  assert.equal(fromCentavos(45000), '450.00');
  assert.equal(fromCentavos(5), '0.05');
});

test('round trip never loses a centavo', () => {
  for (const value of ['333.33', '1550.00', '450.00', '0.01', '99999999.99']) {
    assert.equal(fromCentavos(toCentavos(value)), value.includes('.') ? value : `${value}.00`);
  }
});

test('the wire amount is decimal pesos both ways (sandbox convention)', () => {
  assert.equal(toWireAmount(33333), 333.33);
  assert.equal(toWireAmount(155000), 1550);
  assert.equal(fromWireAmount('333.33'), 33333);
  assert.equal(fromWireAmount('750'), 75000);
  assert.equal(fromWireAmount('750.00'), 75000);
});

test('the sandbox guard accepts exactly the Maya sandbox host', () => {
  assert.equal(requireSandboxBase('https://pg-sandbox.paymaya.com'), MAYA_SANDBOX_BASE);
  assert.equal(requireSandboxBase('https://pg-sandbox.paymaya.com/'), MAYA_SANDBOX_BASE);
});

test('the sandbox guard refuses production and unknown Maya hosts', () => {
  for (const bad of [
    'https://pg.paymaya.com',
    'https://www.paymaya.com',
    'https://checkout.paymaya.com',
    'https://sandbox.paymaya.com',
    'https://pg-sandbox.paymaya.com.evil.example',
    'http://pg-sandbox.paymaya.com',
    'https://api.maya.ph',
  ]) {
    assert.throws(() => requireSandboxBase(bad), MayaConfigError, `expected ${bad} to be refused`);
  }
});
