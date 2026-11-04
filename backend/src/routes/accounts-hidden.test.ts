import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
process.env.SUPABASE_URL ??= 'https://route-test.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'route-test-key';

const [{ db }, { accountsRouter }, { authRouter }, { errorHandler, notFoundHandler }, { createAccessToken }] =
  await Promise.all([
    import('../prisma/db.js'),
    import('./accounts.js'),
    import('./auth.js'),
    import('../middleware/error.js'),
    import('../lib/jwt.js'),
  ]);

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SYSTEM_ID = '22222222-2222-4222-8222-222222222222';

const adminToken = createAccessToken({ sub: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN' });
const systemToken = createAccessToken({ sub: SYSTEM_ID, email: 'system@example.com', role: 'ADMIN' });

const systemPassword = 'system-login-pass-1';
const rows: Array<Record<string, unknown>> = [
  { id: ADMIN_ID, email: 'admin@example.com', passwordHash: bcrypt.hashSync('admin-login-pass', 8), role: 'ADMIN', status: 'ACTIVE', isSystem: false, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
  { id: SYSTEM_ID, email: 'system@example.com', passwordHash: bcrypt.hashSync(systemPassword, 8), role: 'ADMIN', status: 'ACTIVE', isSystem: true, createdAt: new Date('2026-01-02'), updatedAt: new Date('2026-01-02') },
];

function matches(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function fakeWhere(filter: Record<string, unknown>) {
  const chain = {
    first: async () => rows.find((row) => matches(row, filter)) ?? null,
    all: () => rows.filter((row) => matches(row, filter)),
    aggregate: async (fn: (a: { count: () => number }) => { total: number }) => fn({ count: () => rows.filter((row) => matches(row, filter)).length }),
    update: async (patch: Record<string, unknown>) => {
      const row = rows.find((candidate) => matches(candidate, filter));
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
    orderBy: () => chain,
    offset: () => chain,
    limit: () => chain,
  };
  return chain;
}

let server: http.Server;
let base: string;

before(async () => {
  (db as unknown as { orm: unknown }).orm = {
    public: {
      Account: { where: fakeWhere },
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/accounts', accountsRouter);
  app.use('/auth', authRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function authed(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

test('GET /accounts/:id on the flagged account returns 404 for another admin', async () => {
  const response = await fetch(`${base}/accounts/${SYSTEM_ID}`, { headers: authed(adminToken) });
  assert.equal(response.status, 404);
});

test('PATCH /accounts/:id/status on the flagged account returns 404', async () => {
  const response = await fetch(`${base}/accounts/${SYSTEM_ID}/status`, {
    method: 'PATCH',
    headers: authed(adminToken),
    body: JSON.stringify({ status: 'DEACTIVATED' }),
  });
  assert.equal(response.status, 404);
});

test('POST /accounts/:id/password on the flagged account returns 404', async () => {
  const response = await fetch(`${base}/accounts/${SYSTEM_ID}/password`, {
    method: 'POST',
    headers: authed(adminToken),
    body: JSON.stringify({ currentPassword: 'not-checked-for-admin-reset', newPassword: 'Whatever-12345!' }),
  });
  assert.equal(response.status, 404);
});

test('list and count exclude the flagged account', async () => {
  const response = await fetch(`${base}/accounts?page=1&limit=100`, { headers: authed(adminToken) });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data?: { accounts?: Array<{ id: string }>; total?: number } };
  const data = payload.data ?? (payload as unknown as { accounts: Array<{ id: string }>; total: number });
  const listed = data.accounts ?? [];
  assert.equal(listed.some((account) => account.id === SYSTEM_ID), false);
  assert.equal(data.total, 1);
});

test('the flagged account can still sign in', async () => {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'system@example.com', password: systemPassword }),
  });
  assert.equal(response.status, 200);
});

test('the flagged account can still change its own password via /accounts/me', async () => {
  const response = await fetch(`${base}/accounts/me/password`, {
    method: 'POST',
    headers: authed(systemToken),
    body: JSON.stringify({ currentPassword: systemPassword, newPassword: 'rotated-system-pass-2' }),
  });
  assert.equal(response.status, 200);
});

test('lockout guard counts only visible admins (the hidden one cannot satisfy it)', async () => {
  // The only VISIBLE admin tries to deactivate itself: must refuse even though
  // a second (hidden) ADMIN exists.
  const response = await fetch(`${base}/accounts/${ADMIN_ID}/status`, {
    method: 'PATCH',
    headers: authed(adminToken),
    body: JSON.stringify({ status: 'DEACTIVATED' }),
  });
  assert.equal(response.status, 400);
});
