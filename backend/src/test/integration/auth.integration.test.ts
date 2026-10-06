import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from './helpers/server.js';
import { request } from './helpers/http.js';
import { runPreflightChecks } from './helpers/preflight.js';
import { login, refreshToken, getMe } from './helpers/auth.js';
import { db } from '../../prisma/db.js';

const SEED_ADMIN_EMAIL = 'admin@seed.royalty.local';
const SEED_CUSTOMER_EMAIL = 'customer@seed.royalty.local';
const SEED_STAFF_EMAIL = 'staff@seed.royalty.local';

const adminPassword = process.env['SEED_ADMIN_PASSWORD'];
const customerPassword = process.env['SEED_CUSTOMER_PASSWORD'];
const staffPassword = process.env['SEED_STAFF_PASSWORD'];

let server: TestServer;

before(async () => {
  const preflight = await runPreflightChecks();
  assert.equal(preflight.passed, true, `Preflight failed: ${preflight.reason}`);

  assert.ok(adminPassword, 'SEED_ADMIN_PASSWORD must be set');
  assert.ok(customerPassword, 'SEED_CUSTOMER_PASSWORD must be set');
  assert.ok(staffPassword, 'SEED_STAFF_PASSWORD must be set');

  server = await startTestServer();
});

after(async () => {
  if (server) {
    await server.close();
  }
  await db.close();
});

test('admin login returns valid tokens and role', async () => {
  const response = await login(server.baseUrl, SEED_ADMIN_EMAIL, adminPassword!);

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(response.body.data.id, 'data.id should exist');
  assert.equal(response.body.data.email, SEED_ADMIN_EMAIL);
  assert.equal(response.body.data.role, 'ADMIN');
  assert.ok(response.body.data.accessToken, 'accessToken should exist');
  assert.ok(response.body.data.refreshToken, 'refreshToken should exist');
});

test('customer login returns valid tokens and role', async () => {
  const response = await login(server.baseUrl, SEED_CUSTOMER_EMAIL, customerPassword!);

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(response.body.data.id, 'data.id should exist');
  assert.equal(response.body.data.email, SEED_CUSTOMER_EMAIL);
  assert.equal(response.body.data.role, 'CUSTOMER');
  assert.ok(response.body.data.accessToken, 'accessToken should exist');
  assert.ok(response.body.data.refreshToken, 'refreshToken should exist');
});

test('staff login returns valid tokens and role', async () => {
  const response = await login(server.baseUrl, SEED_STAFF_EMAIL, staffPassword!);

  assert.equal(response.status, 200);
  assert.ok(response.body.data, 'Response should have data');
  assert.ok(response.body.data.id, 'data.id should exist');
  assert.equal(response.body.data.email, SEED_STAFF_EMAIL);
  assert.equal(response.body.data.role, 'STAFF');
  assert.ok(response.body.data.accessToken, 'accessToken should exist');
  assert.ok(response.body.data.refreshToken, 'refreshToken should exist');
});

test('invalid credentials return 401', async () => {
  const response = await request(server.baseUrl, '/auth/login', {
    method: 'POST',
    body: { email: SEED_ADMIN_EMAIL, password: 'wrong-password' },
  });

  assert.equal(response.status, 401);
  const body = response.body as { error: { code: string; message: string } };
  assert.ok(body.error, 'Response should have error');
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.ok(body.error.message.length > 0, 'Error message should exist');
});

test('missing password returns 400', async () => {
  const response = await request(server.baseUrl, '/auth/login', {
    method: 'POST',
    body: { email: SEED_ADMIN_EMAIL },
  });

  assert.equal(response.status, 400);
  const body = response.body as { error: { code: string; message: string } };
  assert.ok(body.error, 'Response should have error');
  assert.equal(body.error.code, 'BAD_REQUEST');
});

test('access token authenticates protected /api/me', async () => {
  const loginResponse = await login(server.baseUrl, SEED_CUSTOMER_EMAIL, customerPassword!);
  assert.equal(loginResponse.status, 200);

  const meResponse = await getMe(server.baseUrl, loginResponse.body.data.accessToken);

  assert.equal(meResponse.status, 200);
  assert.ok(meResponse.body.user, 'Response should have user');
  assert.equal(meResponse.body.user.email, SEED_CUSTOMER_EMAIL);
  assert.equal(meResponse.body.user.role, 'CUSTOMER');
  assert.ok(meResponse.body.user.userId, 'userId should exist');
});

test('missing access token returns 401', async () => {
  const response = await request(server.baseUrl, '/api/me');

  assert.equal(response.status, 401);
  const body = response.body as { error: { code: string; message: string } };
  assert.ok(body.error, 'Response should have error');
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('invalid access token returns 401', async () => {
  const response = await request(server.baseUrl, '/api/me', {
    token: 'invalid-token',
  });

  assert.equal(response.status, 401);
  const body = response.body as { error: { code: string; message: string } };
  assert.ok(body.error, 'Response should have error');
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('refresh token returns new access token', async () => {
  const loginResponse = await login(server.baseUrl, SEED_CUSTOMER_EMAIL, customerPassword!);
  assert.equal(loginResponse.status, 200);

  const refreshResponse = await refreshToken(server.baseUrl, loginResponse.body.data.refreshToken);

  assert.equal(refreshResponse.status, 200);
  assert.ok(refreshResponse.body.data, 'Response should have data');
  assert.ok(refreshResponse.body.data.accessToken, 'New accessToken should exist');
  assert.ok(refreshResponse.body.data.refreshToken, 'New refreshToken should exist');
});

test('refreshed access token authenticates protected /api/me', async () => {
  const loginResponse = await login(server.baseUrl, SEED_CUSTOMER_EMAIL, customerPassword!);
  assert.equal(loginResponse.status, 200);

  const refreshResponse = await refreshToken(server.baseUrl, loginResponse.body.data.refreshToken);
  assert.equal(refreshResponse.status, 200);

  const meResponse = await getMe(server.baseUrl, refreshResponse.body.data.accessToken);

  assert.equal(meResponse.status, 200);
  assert.ok(meResponse.body.user, 'Response should have user');
  assert.equal(meResponse.body.user.email, SEED_CUSTOMER_EMAIL);
  assert.equal(meResponse.body.user.role, 'CUSTOMER');
  assert.ok(meResponse.body.user.userId, 'userId should exist');
});
