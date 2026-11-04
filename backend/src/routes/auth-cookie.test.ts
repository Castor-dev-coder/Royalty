import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { after, before, test } from 'node:test';

// Deterministic, DB-free environment (the ORM is replaced with a fake below).
process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { authRouter }, { errorHandler, notFoundHandler }] = await Promise.all([
  import('../prisma/db.js'),
  import('./auth.js'),
  import('../middleware/error.js'),
]);

const bcrypt = (await import('bcryptjs')).default;

const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const EMAIL = 'customer@example.com';
const PASSWORD = 'CorrectHorse123!';

interface AccountRow {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
}

const accounts = new Map<string, AccountRow>();

// Writable ORM seam used by AuthService (login/refresh read Account rows).
(db as unknown as { orm: unknown }).orm = {
  public: {
    Account: {
      where(query: { email?: string; id?: string }) {
        return {
          async first(): Promise<AccountRow | null> {
            if (query.email !== undefined) return accounts.get(String(query.email)) ?? null;
            if (query.id !== undefined) {
              for (const account of accounts.values()) if (account.id === query.id) return account;
            }
            return null;
          },
        };
      },
    },
  },
};

let server: http.Server;
let baseUrl = '';

before(async () => {
  accounts.set(EMAIL, {
    id: ACCOUNT_ID,
    email: EMAIL,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role: 'CUSTOMER',
    status: 'ACTIVE',
  });

  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

const CSRF = { 'X-Requested-With': 'XMLHttpRequest', Origin: 'http://localhost:5174' };

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function cookieOf(response: Response): string {
  const cookies = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const single = cookies.length > 0 ? cookies.join('; ') : response.headers.get('set-cookie') ?? '';
  return single;
}

async function cookieLogin(rememberMe: boolean): Promise<{ token: string; setCookie: string; body: Record<string, unknown> }> {
  const response = await post('/auth/login', { email: EMAIL, password: PASSWORD, rememberMe }, { 'X-Auth-Mode': 'cookie' });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Record<string, unknown> };
  return { token: String(body.data.accessToken), setCookie: cookieOf(response), body: body.data };
}

test('cookie mode login (rememberMe): httpOnly cookie, persistent, no refreshToken in body', async () => {
  const { setCookie, body } = await cookieLogin(true);
  assert.match(setCookie, /royalty_rt=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /SameSite=Lax/i); // localhost dev is same-site
  assert.ok(/Expires=|Max-Age=/i.test(setCookie), 'rememberMe cookie must be persistent');
  assert.ok(!/Secure/i.test(setCookie), 'localhost dev must not require Secure');
  assert.ok(!('refreshToken' in body), 'cookie mode must omit refreshToken from the body');
  assert.ok('accessToken' in body);
  assert.equal(body.role, 'CUSTOMER');
});

test('cookie mode login without rememberMe: session cookie (no Expires/Max-Age)', async () => {
  const { setCookie } = await cookieLogin(false);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.ok(!/Expires=/i.test(setCookie) && !/Max-Age=/i.test(setCookie), 'session cookie must not persist');
});

test('bearer mode (admin) is unchanged: both tokens in the body, no cookie', async () => {
  const response = await post('/auth/login', { email: EMAIL, password: PASSWORD });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Record<string, unknown> };
  assert.ok('accessToken' in body.data);
  assert.ok('refreshToken' in body.data);
  assert.equal(cookieOf(response), '');
});

test('cookie refresh succeeds and rotates the cookie', async () => {
  const login = await cookieLogin(true);
  const firstToken = /royalty_rt=([^;]+)/.exec(login.setCookie)?.[1] ?? '';
  assert.ok(firstToken !== '');
  const response = await post('/auth/refresh', undefined, {
    ...CSRF,
    Cookie: `royalty_rt=${firstToken}`,
    'X-Auth-Mode': 'cookie',
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Record<string, unknown> };
  assert.ok('accessToken' in body.data);
  assert.ok(!('refreshToken' in body.data), 'cookie refresh must not return the refresh token');
  const rotated = /royalty_rt=([^;]+)/.exec(cookieOf(response))?.[1] ?? '';
  assert.ok(rotated !== '' && rotated !== firstToken, 'the cookie must be rotated');
  assert.match(cookieOf(response), /HttpOnly/i);
  assert.ok(/Expires=|Max-Age=/i.test(cookieOf(response)), 'rotation keeps the persistent policy');
});

test('session-cookie refresh rotates as a session cookie', async () => {
  const login = await cookieLogin(false);
  const firstToken = /royalty_rt=([^;]+)/.exec(login.setCookie)?.[1] ?? '';
  const response = await post('/auth/refresh', undefined, {
    ...CSRF,
    Cookie: `royalty_rt=${firstToken}`,
    'X-Auth-Mode': 'cookie',
  });
  assert.equal(response.status, 200);
  const setCookie = cookieOf(response);
  assert.ok(!/Expires=/i.test(setCookie) && !/Max-Age=/i.test(setCookie), 'session policy must survive rotation');
});

test('cookie refresh without the cookie returns 401', async () => {
  const response = await post('/auth/refresh', undefined, { ...CSRF, 'X-Auth-Mode': 'cookie' });
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.equal(body.error.message, 'Missing refresh token');
});

test('refresh with a bad Origin is rejected (403)', async () => {
  const login = await cookieLogin(true);
  const token = /royalty_rt=([^;]+)/.exec(login.setCookie)?.[1] ?? '';
  const response = await post('/auth/refresh', undefined, {
    'X-Requested-With': 'XMLHttpRequest',
    Origin: 'https://evil.example',
    Cookie: `royalty_rt=${token}`,
    'X-Auth-Mode': 'cookie',
  });
  assert.equal(response.status, 403);
});

test('refresh without X-Requested-With is rejected (403)', async () => {
  const login = await cookieLogin(true);
  const token = /royalty_rt=([^;]+)/.exec(login.setCookie)?.[1] ?? '';
  const response = await post('/auth/refresh', undefined, {
    Origin: 'http://localhost:5174',
    Cookie: `royalty_rt=${token}`,
    'X-Auth-Mode': 'cookie',
  });
  assert.equal(response.status, 403);
});

test('logout clears the cookie (Max-Age=0) and is CSRF-guarded', async () => {
  const login = await cookieLogin(true);
  const token = /royalty_rt=([^;]+)/.exec(login.setCookie)?.[1] ?? '';
  const guarded = await post('/auth/logout', undefined, {
    Origin: 'http://localhost:5174',
    Cookie: `royalty_rt=${token}`,
    'X-Auth-Mode': 'cookie',
  });
  assert.equal(guarded.status, 403, 'logout without X-Requested-With must fail');

  const response = await post('/auth/logout', undefined, {
    ...CSRF,
    Cookie: `royalty_rt=${token}`,
    'X-Auth-Mode': 'cookie',
  });
  assert.equal(response.status, 204);
  const setCookie = cookieOf(response);
  assert.match(setCookie, /royalty_rt=;/);
  assert.ok(/Max-Age=0/i.test(setCookie) || /Expires=Thu, 01 Jan 1970/i.test(setCookie), 'logout must expire the cookie');
});

test('bearer-mode refresh with a body token still works (admin path)', async () => {
  const login = await post('/auth/login', { email: EMAIL, password: PASSWORD });
  const body = (await login.json()) as { data: { refreshToken: string } };
  const response = await post('/auth/refresh', { refreshToken: body.data.refreshToken });
  assert.equal(response.status, 200);
  const refreshed = (await response.json()) as { data: { accessToken: string; refreshToken: string } };
  assert.ok(refreshed.data.accessToken);
  assert.ok(refreshed.data.refreshToken);
  assert.equal(cookieOf(response), '');
});
