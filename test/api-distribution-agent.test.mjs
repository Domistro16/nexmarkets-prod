import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

async function authenticate(base, wallet) {
  const headers = { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const challengeResponse = await fetch(`${base}/v1/auth/challenge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ address: wallet.address })
  });
  const challenge = await challengeResponse.json();
  const verifiedResponse = await fetch(`${base}/v1/auth/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) })
  });
  const verified = await verifiedResponse.json();
  return {
    cookie: verifiedResponse.headers.get('set-cookie').split(';')[0],
    csrf: verified.csrfToken,
    accountId: verified.accountId
  };
}

test('API: provisions Dynamic Server Wallet distribution agent and serves status/logs', async (t) => {
  const store = new MemoryStore();
  const builderWallet = Wallet.createRandom();
  const editionAddress = '0x1111111111111111111111111111111111111111';
  const policyId = '0x2222222222222222222222222222222222222222222222222222222222222222';

  const server = createApiServer({ store, secureCookies: false, logger: console });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = await authenticate(base, builderWallet);
  const headers = {
    cookie: auth.cookie,
    'x-csrf-token': auth.csrf,
    'content-type': 'application/json',
    origin: 'https://nexmarkets.fun'
  };

  // 1. Initial GET before provisioning returns 404
  const preCheck = await fetch(`${base}/v1/editions/${editionAddress}/distribution-agent`);
  assert.equal(preCheck.status, 404);
  const preCheckErr = await preCheck.json();
  assert.equal(preCheckErr.error.code, 'DISTRIBUTION_AGENT_NOT_FOUND');

  // 2. Provision distribution agent
  const provisionRes = await fetch(`${base}/v1/distribution-agents/provision`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      editionAddress,
      policyId,
      rewardSource: 'BUILDER_ROYALTY',
      allocationBps: 3000,
      cadenceDays: 30
    })
  });

  const provisionBody = await provisionRes.json();
  if (provisionRes.status !== 201) console.error('PROVISION_ERROR:', provisionBody);
  assert.equal(provisionRes.status, 201);
  const provisioned = provisionBody;
  assert.ok(provisioned.data);
  assert.equal(provisioned.data.edition_address, editionAddress.toLowerCase());
  assert.equal(provisioned.data.policy_id, policyId);
  assert.match(provisioned.data.server_wallet_address, /^0x[0-9a-f]{40}$/);
  assert.equal(provisioned.serverWallet.role, 'distribution-agent');

  // 3. Query distribution agent status
  const agentRes = await fetch(`${base}/v1/editions/${editionAddress}/distribution-agent`);
  assert.equal(agentRes.status, 200);
  const agentData = await agentRes.json();
  assert.equal(agentData.data.edition_address, editionAddress.toLowerCase());
  assert.equal(agentData.data.server_wallet_address, provisioned.data.server_wallet_address);
  assert.equal(agentData.data.allocation_bps, 3000);
  assert.equal(agentData.data.status, 'ACTIVE');

  // 4. Query distribution logs (initially empty)
  const logsRes = await fetch(`${base}/v1/editions/${editionAddress}/distribution-logs`);
  assert.equal(logsRes.status, 200);
  const logsData = await logsRes.json();
  assert.deepEqual(logsData.data, []);

  // 5. Record a sample distribution log in store and query logs again
  await store.recordDistributionLog({
    agentId: provisioned.data.id,
    cycleId: 'cycle_001',
    assetAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    eligibleSupply: 100,
    amountPerPass: 100000n,
    totalFunded: 10000000n,
    fundTxHash: `0x${'aa'.repeat(32)}`,
    claimTxHashes: [`0x${'bb'.repeat(32)}`],
    sweepTxHash: `0x${'cc'.repeat(32)}`,
    status: 'COMPLETED'
  });

  const updatedLogsRes = await fetch(`${base}/v1/editions/${editionAddress}/distribution-logs`);
  assert.equal(updatedLogsRes.status, 200);
  const updatedLogs = await updatedLogsRes.json();
  assert.equal(updatedLogs.data.length, 1);
  assert.equal(updatedLogs.data[0].cycle_id, 'cycle_001');
  assert.equal(updatedLogs.data[0].eligible_supply, 100);
  assert.equal(updatedLogs.data[0].amount_per_pass, '100000');
  assert.equal(updatedLogs.data[0].total_funded, '10000000');
  assert.equal(updatedLogs.data[0].status, 'COMPLETED');
});

test('API: /v1/cron/distribution triggers worker execution with secret authentication', async (t) => {
  const store = new MemoryStore();
  const server = createApiServer({ store, secureCookies: false, logger: { info() {}, error() {} } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-super-secret-123';
  t.after(() => {
    if (previousSecret !== undefined) process.env.CRON_SECRET = previousSecret;
    else delete process.env.CRON_SECRET;
  });

  // 1. Unauthorized without token returns 401
  const unauthRes = await fetch(`${base}/v1/cron/distribution`, { method: 'POST' });
  assert.equal(unauthRes.status, 401);
  const unauthBody = await unauthRes.json();
  assert.equal(unauthBody.error.code, 'UNAUTHORIZED_CRON');

  // 2. Unauthorized with wrong bearer token returns 401
  const wrongTokenRes = await fetch(`${base}/v1/cron/distribution`, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong-secret' }
  });
  assert.equal(wrongTokenRes.status, 401);

  // 3. Authorized via Bearer header returns 200 and execution summary
  const authRes = await fetch(`${base}/v1/cron/distribution`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-super-secret-123' }
  });
  assert.equal(authRes.status, 200);
  const authBody = await authRes.json();
  assert.equal(authBody.ok, true);
  assert.ok(authBody.summary);
  assert.equal(typeof authBody.summary.inspected, 'number');
  assert.equal(typeof authBody.summary.executed, 'number');
  assert.equal(typeof authBody.summary.failed, 'number');

  // 4. Authorized via query param ?key= also works (for webhook pingers that only support GET)
  const getRes = await fetch(`${base}/v1/cron/distribution?key=test-super-secret-123`, {
    method: 'GET'
  });
  assert.equal(getRes.status, 200);
  const getBody = await getRes.json();
  assert.equal(getBody.ok, true);
  assert.ok(getBody.summary);
});

