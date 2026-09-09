import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';
import { evaluateProductionReadiness, productionReadinessFromEnv } from '../packages/config/src/index.mjs';

test('productionReady is derived from every required readiness gate', () => {
  const blocked = evaluateProductionReadiness({ criticalTestsPassed: true });
  assert.equal(blocked.productionReady, false);
  assert.ok(blocked.blockers.includes('databaseMigrationVerified'));
  const passed = evaluateProductionReadiness({ criticalTestsPassed: true, ...Object.fromEntries(blocked.blockers.map((key) => [key, true])) });
  assert.equal(passed.productionReady, true);
  assert.deepEqual(productionReadinessFromEnv({ NEXMARKETS_DATABASE_MIGRATION_VERIFIED: 'true', NEXMARKETS_CONTRACT_CONFIG_VERIFIED: 'true', NEXMARKETS_PAYMENT_TOKEN_VERIFIED: 'true', NEXMARKETS_TESTNET_E2E_PASSED: 'true', NEXMARKETS_SECURITY_GATE_PASSED: 'true', NEXMARKETS_CRITICAL_TESTS_PASSED: 'true' }).blockers, []);
});

test('production readiness gate blocks the production health contract until evidence is supplied', async (t) => {
  const server = createApiServer({ store: new MemoryStore(), productionReadiness: evaluateProductionReadiness(), requireProductionReadiness: true, secureCookies: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/readyz`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error.code, /PRODUCTION_READINESS_BLOCKED/);
});
