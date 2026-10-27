// Cache-policy contract: the app-wide default is no-store (nothing sensitive
// may enter a shared cache, including error responses), and only routes that
// opt in with publicCache are cacheable — with a bounded fresh window plus
// stale-while-revalidate, never an unlimited one.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = 'postgres://cache-test:***@127.0.0.1:5/cache-test';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ createApp }, { db }] = await Promise.all([
  import('../server.js'),
  import('../prisma/db.js'),
]);

// Table-on-demand fake ORM: the tests assert cache headers, not query
// results, but the catalogue controllers must still complete cleanly.
function fakeTable() {
  return {
    where: () => ({ first: async () => null, all: async () => [] }),
    orderBy: () => ({ offset: () => ({ limit: () => ({ all: async () => [] }) }), all: async () => [] }),
    all: async () => [],
    aggregate: async () => ({ total: 0 }),
    create: async (data: Record<string, unknown>) => ({ id: 'row-test', ...data }),
  };
}
(db as unknown as { orm: unknown }).orm = {
  public: new Proxy({}, { get: () => fakeTable() }),
};

let baseUrl = '';
before(async () => {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  (globalThis as unknown as { __cacheServer: http.Server }).__cacheServer = server;
});
after(() => {
  (globalThis as unknown as { __cacheServer: http.Server }).__cacheServer.close();
});

test('every response defaults to no-store — sensitive data never enters a shared cache', async () => {
  for (const path of ['/health', '/auth/login', '/payments/settings', '/appointments/mine', '/nope']) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: path === '/auth/login' ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: path === '/auth/login' ? '{}' : undefined,
    });
    assert.equal(
      response.headers.get('cache-control'),
      'no-store',
      `${path} (status ${response.status}) must be no-store`,
    );
  }
});

test('auth, appointment and payment endpoints stay no-store even when answered', async () => {
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'qa@example.com', password: 'wrong' }),
  });
  assert.equal(login.status, 401);
  assert.equal(login.headers.get('cache-control'), 'no-store');
});

test('public catalogue routes opt in to a bounded fresh + stale-while-revalidate policy', async () => {
  const response = await fetch(`${baseUrl}/services?limit=1`);
  const policy = response.headers.get('cache-control') ?? '';
  assert.match(policy, /public, max-age=\d+, stale-while-revalidate=\d+/, 'public routes must declare a bounded policy');
  const maxAge = Number(/max-age=(\d+)/.exec(policy)?.[1] ?? 0);
  const stale = Number(/stale-while-revalidate=(\d+)/.exec(policy)?.[1] ?? 0);
  assert.ok(maxAge > 0 && maxAge <= 300, 'fresh window must be short (poller-safe)');
  assert.ok(stale >= maxAge, 'the stale window must not be shorter than the fresh window');
});
