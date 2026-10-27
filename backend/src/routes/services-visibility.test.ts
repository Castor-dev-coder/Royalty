// Regression guard for the admin service-visibility gap: the public catalogue
// routes sit before `authenticate`, so without an optional-auth step every
// caller silently fell back to 'CUSTOMER' and deactivated services were
// invisible to admins (they could never be reactivated). Anonymous visitors
// must still see only active services, while an admin token must see all of
// them and can fetch a deactivated service by id.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { after, before, test } from 'node:test';

process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
// Placeholder so env validation passes at import time; the ORM is faked below
// and this connection is never used.
process.env.DATABASE_URL ??= 'postgres://route-test:***@127.0.0.1:5/route-test';

const [{ db }, { servicesRouter }, { errorHandler, notFoundHandler }, { createAccessToken }] =
  await Promise.all([
    import('../prisma/db.js'),
    import('./services.js'),
    import('../middleware/error.js'),
    import('../lib/jwt.js'),
  ]);

const CATEGORY = { id: 'cat-1', name: 'Hair', isActive: true };
const SERVICES = [
  { id: 'svc-active', categoryId: 'cat-1', name: 'Active Cut', description: '', price: '100', durationMinutes: 30, isActive: true, imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
  { id: 'svc-gone', categoryId: 'cat-1', name: 'Suspended Cut', description: '', price: '100', durationMinutes: 30, isActive: false, imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
];

function fakeWhere(table: 'Service' | 'ServiceCategory') {
  return (args: Record<string, unknown> = {}) => ({
    first: async () => {
      if (table === 'ServiceCategory') return CATEGORY;
      const rows = SERVICES.filter((s) =>
        Object.entries(args).every(([key, value]) => (s as Record<string, unknown>)[key] === value),
      );
      return rows[0] ?? null;
    },
    all: () => SERVICES.filter((s) =>
      Object.entries(args).every(([key, value]) => (s as Record<string, unknown>)[key] === value),
    ),
    orderBy: () => ({
      all: () => SERVICES.filter((s) =>
        Object.entries(args).every(([key, value]) => (s as Record<string, unknown>)[key] === value),
      ),
    }),
    aggregate: async () => ({ total: 0 }),
    update: async () => ({}),
  });
}

let baseUrl = '';
before(async () => {
  (db as unknown as { orm: unknown }).orm = {
    public: new Proxy({}, {
      get: (_target, prop: string) =>
        prop === 'Service' ? { where: fakeWhere('Service'), orderBy: () => ({ all: () => SERVICES }) }
          : prop === 'ServiceCategory' ? { where: fakeWhere('ServiceCategory') }
            : fakeWhere('Service'),
    }),
  };
  const app = express();
  app.use('/services', servicesRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  (globalThis as unknown as { __visServer: http.Server }).__visServer = server;
});
after(() => {
  (globalThis as unknown as { __visServer: http.Server }).__visServer.close();
});

test('anonymous catalogue lists only active services', async () => {
  const res = await fetch(`${baseUrl}/services`);
  assert.equal(res.status, 200);
  const names = ((await res.json()) as { data: { services: Array<{ name: string }> } }).data.services.map((s) => s.name);
  assert.deepEqual(names, ['Active Cut']);
});

test('an admin token sees deactivated services in the list', async () => {
  const token = createAccessToken({ sub: 'adm-1', email: 'admin@example.com', role: 'ADMIN' });
  const res = await fetch(`${baseUrl}/services`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const names = ((await res.json()) as { data: { services: Array<{ name: string }> } }).data.services.map((s) => s.name).sort();
  assert.deepEqual(names, ['Active Cut', 'Suspended Cut']);
});

test('a deactivated service 404s anonymously but is fetchable by an admin', async () => {
  const anon = await fetch(`${baseUrl}/services/svc-gone`);
  assert.equal(anon.status, 404);
  const token = createAccessToken({ sub: 'adm-1', email: 'admin@example.com', role: 'ADMIN' });
  const admin = await fetch(`${baseUrl}/services/svc-gone`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(admin.status, 200);
  const body = (await admin.json()) as { data: { service: { name: string; isActive: boolean } } };
  assert.equal(body.data.service.name, 'Suspended Cut');
  assert.equal(body.data.service.isActive, false);
});

test('role-varying catalogue responses carry Vary: Authorization', async () => {
  const res = await fetch(`${baseUrl}/services`);
  assert.match(res.headers.get('vary') ?? '', /authorization/i);
});
