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
