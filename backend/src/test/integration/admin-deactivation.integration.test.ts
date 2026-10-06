import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from './helpers/server.js';
import { request } from './helpers/http.js';
import { login } from './helpers/auth.js';
import { cleanupTestRecords, countScopedRecords, type ScopeMarker } from './helpers/cleanup.js';
import {
  buildScopeMarker,
  generateRunId,
  runSafetyGate,
  formatSafetyReport,
  SEED_IDS,
} from './helpers/safety.js';
import { db } from '../../prisma/db.js';

const SEED_ADMIN_EMAIL = 'admin@seed.royalty.local';

const SCOPE: ScopeMarker = buildScopeMarker('5g', 'admin-deactivation', generateRunId());

let server: TestServer;
let adminToken: string;

before(async () => {
  const gate = await runSafetyGate(SCOPE);
  console.log(formatSafetyReport(gate));
  assert.equal(gate.passed, true, `Safety gate failed: ${gate.failures.join(', ')}`);

  server = await startTestServer();

  const adminPassword = process.env['SEED_ADMIN_PASSWORD'];
  assert.ok(adminPassword, 'SEED_ADMIN_PASSWORD must be set');

  const adminLogin = await login(server.baseUrl, SEED_ADMIN_EMAIL, adminPassword);
  assert.equal(adminLogin.status, 200, 'Admin login must succeed');
  adminToken = adminLogin.body.data.accessToken;
});

after(async () => {
  if (server) {
    try {
      const cleaned = await cleanupTestRecords(SCOPE);
      console.log(`[${SCOPE.marker}] cleanup:`, JSON.stringify(cleaned));
      const remaining = await countScopedRecords(SCOPE);
      console.log(`[${SCOPE.marker}] remaining:`, JSON.stringify(remaining));
      const totalRemaining = Object.values(remaining).reduce((sum, n) => sum + n, 0);
      assert.equal(totalRemaining, 0, `Scoped cleanup left ${totalRemaining} records behind`);
    } finally {
      await server.close();
    }
  }
  await db.close();
});

test('admin cannot deactivate themselves when they are the only active admin', async () => {
  const response = await request<{ error?: { code: string; message: string } }>(
    server.baseUrl,
    `/accounts/${SEED_IDS.adminAccount}/status`,
    {
      method: 'PATCH',
      body: { status: 'DEACTIVATED' },
      token: adminToken,
    },
  );

  assert.equal(response.status, 400, 'Should reject deactivation of the only active admin');
  assert.equal(response.body.error?.code, 'BAD_REQUEST');
});

test('admin remains active after rejected self-deactivation', async () => {
  const response = await request<{ data: { id: string; status: string } }>(
    server.baseUrl,
    `/accounts/${SEED_IDS.adminAccount}`,
    { token: adminToken },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.id, SEED_IDS.adminAccount);
  assert.equal(response.body.data.status, 'ACTIVE', 'Admin must remain ACTIVE after rejected deactivation');
});
