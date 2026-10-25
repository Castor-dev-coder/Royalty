import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { after, before, test } from 'node:test';
import { allowedOrigins, corsMiddleware } from '../middleware/cors.js';

let server: http.Server;
let baseUrl = '';

before(async () => {
  const app = express();
  app.use(corsMiddleware);
  app.get('/ping', (_req, res) => {
    res.json({ ok: true });
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

test('an allowed origin receives CORS headers', async () => {
  const origin = allowedOrigins()[0];
  const response = await fetch(`${baseUrl}/ping`, { headers: { origin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type, Authorization, X-Auth-Mode, X-Requested-With, If-None-Match');
  assert.equal(response.headers.get('access-control-expose-headers'), 'ETag', 'clients can read the ETag for conditional requests');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true', 'credentials are enabled for allowlisted origins');
});

test('an unlisted origin receives no CORS headers', async () => {
  const response = await fetch(`${baseUrl}/ping`, { headers: { origin: 'https://evil.example' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('preflight from an allowed origin is answered with 204 and credentials for the allowlist only', async () => {
  const origin = allowedOrigins()[0];
  const response = await fetch(`${baseUrl}/ping`, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.match(String(response.headers.get('access-control-allow-methods')), /POST/);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('the allowlist is environment-driven and never a wildcard', () => {
  const previous = process.env['CORS_ORIGINS'];
  try {
    process.env['CORS_ORIGINS'] = 'https://app.example, https://admin.example';
    assert.deepEqual(allowedOrigins(), ['https://app.example', 'https://admin.example']);
    delete process.env['CORS_ORIGINS'];
    assert.ok(allowedOrigins().every((origin) => origin !== '*'));
  } finally {
    if (previous === undefined) delete process.env['CORS_ORIGINS'];
    else process.env['CORS_ORIGINS'] = previous;
  }
});
