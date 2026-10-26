// Google sign-in rules: sub-first lookup, no silent account merging, safe
// failures for non-CUSTOMER/inactive accounts. The verifier is injected, so
// these tests are fully isolated (no network, no real Google).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
process.env.GOOGLE_CLIENT_ID ??= 'test-client-id.apps.googleusercontent.com';

const [{ db }, { GoogleAuthService }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./google.service.js'),
]);

interface Row extends Record<string, unknown> { id?: string }
const world: Record<string, Row[]> = { Account: [], Customer: [], AuditLog: [] };
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
      const row = { ...data, id: `row-${seq++}` } as Row;
      world[name].push(row);
      return row;
    },
    all: async () => world[name],
  };
}
(db as unknown as { orm: unknown }).orm = {
  public: { Account: table('Account'), Customer: table('Customer'), AuditLog: table('AuditLog') },
};

const profile = (over: Record<string, unknown> = {}) => ({
  sub: 'google-sub-1',
  email: 'new.customer@example.com',
  emailVerified: true,
  givenName: 'New',
  familyName: 'Customer',
  ...over,
});
const verifier = (over: Record<string, unknown> = {}) => ({
  verify: async () => profile(over),
});

function seed(accounts: Row[] = [], customers: Row[] = []): void {
  world.Account = accounts;
  world.Customer = customers;
  world.AuditLog = [];
  seq = 1;
}

test('first sign-in creates a CUSTOMER account linked to the Google sub', async () => {
  seed();
  const result = await GoogleAuthService.signIn('token', { verifier: verifier() });
  assert.equal(result.created, true);
  assert.equal(result.role, 'CUSTOMER');
  const account = world.Account[0];
  assert.equal(account.googleId, 'google-sub-1');
  assert.equal(account.passwordHash, null);
  assert.equal(account.role, 'CUSTOMER');
  assert.equal(world.Customer.length, 1);
  assert.equal(world.AuditLog.filter((row) => row.action === 'GOOGLE_SIGN_UP').length, 1);
});

test('a linked account signs in by sub even if the Google email changed', async () => {
  seed(
    [{ id: 'acc-1', email: 'old@example.com', googleId: 'google-sub-1', role: 'CUSTOMER', status: 'ACTIVE', passwordHash: null }],
    [{ id: 'cust-1', accountId: 'acc-1', firstName: 'A', lastName: 'B' }],
  );
  const result = await GoogleAuthService.signIn('token', { verifier: verifier({ email: 'changed@example.com' }) });
  assert.equal(result.created, false);
  assert.equal(result.id, 'acc-1');
});

test('same email but different Google identity is a controlled conflict (no silent merge)', async () => {
  seed([{ id: 'acc-1', email: 'new.customer@example.com', googleId: null, role: 'CUSTOMER', status: 'ACTIVE', passwordHash: 'hash' }]);
  await assert.rejects(
    () => GoogleAuthService.signIn('token', { verifier: verifier({ sub: 'different-sub' }) }),
    /Sign in with your password/,
  );
  assert.equal(world.Account.length, 1, 'no second account created');
  assert.equal(world.Account[0].googleId, null, 'existing account untouched');
});

test('unverified Google email is rejected', async () => {
  seed();
  await assert.rejects(
    () => GoogleAuthService.signIn('token', { verifier: verifier({ emailVerified: false }) }),
    /Google sign-in failed/,
  );
  assert.equal(world.Account.length, 0);
});

test('invalid tokens fail with the generic auth error', async () => {
  seed();
  await assert.rejects(
    () => GoogleAuthService.signIn('token', { verifier: { verify: async () => { throw new Error('bad token') } } }),
    /Google sign-in failed/,
  );
});

test('non-CUSTOMER and inactive linked accounts get the generic auth error', async () => {
  for (const account of [
    { id: 'acc-1', email: 'x@y', googleId: 'google-sub-1', role: 'STAFF', status: 'ACTIVE', passwordHash: null },
    { id: 'acc-1', email: 'x@y', googleId: 'google-sub-1', role: 'CUSTOMER', status: 'DEACTIVATED', passwordHash: null },
    { id: 'acc-1', email: 'x@y', googleId: 'google-sub-1', role: 'ADMIN', status: 'ACTIVE', passwordHash: null },
  ] as Row[]) {
    seed([account]);
    await assert.rejects(
      () => GoogleAuthService.signIn('token', { verifier: verifier() }),
      /Invalid email or password/,
    );
  }
});
