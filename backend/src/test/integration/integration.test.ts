import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from './helpers/server.js';
import { request } from './helpers/http.js';
import { runPreflightChecks } from './helpers/preflight.js';
import { cleanupTestRecords } from './helpers/cleanup.js';
import { db } from '../../prisma/db.js';

test('integration infrastructure preflight', async (t) => {
  // Step 1: Run preflight checks
  const preflight = await runPreflightChecks();
  assert.equal(
    preflight.passed,
    true,
    `Preflight failed: ${preflight.reason}`,
  );

  // Step 2: Start test server
  let server: TestServer | undefined;
  try {
    server = await startTestServer();
    assert.ok(server.baseUrl, 'Server should have a base URL');

    // Step 3: Make a health check request
    const healthResponse = await request<{ status: string; database: string }>(server.baseUrl, '/health');
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.body.status, 'ok');
    assert.equal(healthResponse.body.database, 'connected');

    // Step 4: Verify auth is required for protected routes
    const meResponse = await request(server.baseUrl, '/api/me');
    assert.equal(meResponse.status, 401);

    // Step 5: Run cleanup scoped to this file (no-op: this file creates no records)
    const cleanupResult = await cleanupTestRecords('batch5a');
    assert.equal(cleanupResult.accounts, 0, 'No test accounts should exist');
    assert.equal(cleanupResult.appointments, 0, 'No test appointments should exist');
  } finally {
    // Step 6: Always close the server
    if (server) {
      await server.close();
    }
    // Step 7: Close Prisma connection pool to allow process exit
    await db.close();
  }
});
