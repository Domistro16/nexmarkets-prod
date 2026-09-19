import test from 'node:test';
import assert from 'node:assert/strict';
import { DistributionAgentWorker } from '../services/worker/src/distribution-agent-worker.mjs';
import { DynamicServerWalletClient } from '../packages/chain/src/dynamic-server-wallet.mjs';

test('DistributionAgentWorker: processes matured royalty distributions end-to-end', async () => {
  const dynamicClient = new DynamicServerWalletClient({ mockMode: true });
  const serverWallet = await dynamicClient.createOrGetServerWallet({ identifier: 'edition-test-agent' });

  // Mock PostgresStore & Pool
  const mockAgent = {
    id: 'agt_test123',
    edition_address: '0x1111111111111111111111111111111111111111',
    builder_address: '0x2222222222222222222222222222222222222222',
    policy_id: '0x3333333333333333333333333333333333333333333333333333333333333333',
    server_wallet_id: serverWallet.walletId,
    server_wallet_address: serverWallet.address,
    reward_source: 'BUILDER_ROYALTY',
    allocation_bps: 3000,
    cadence_days: 30,
    next_distribution_at: new Date(Date.now() - 1000)
  };

  const recordedLogs = [];
  let updatedSchedule = null;

  const mockStore = {
    listDueDistributionAgents: async () => [mockAgent],
    recordDistributionLog: async (log) => {
      recordedLogs.push(log);
      return log;
    },
    updateDistributionAgentSchedule: async (id, schedule) => {
      updatedSchedule = { id, ...schedule };
      return updatedSchedule;
    },
    _getPool: async () => ({
      query: async (sql, params) => {
        if (sql.includes('royalty_claim_projection')) {
          return {
            rows: [
              {
                order_hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                edition_id: 'ed_123',
                amount_usdg: '10000000', // 10 USDC
                release_at: new Date(Date.now() - 3600_000),
                withdrawn: false
              }
            ]
          };
        }
        if (sql.includes('pass_token_projection')) {
          return { rows: [{ minted: 50 }] };
        }
        return { rows: [] };
      }
    })
  };

  const worker = new DistributionAgentWorker({
    store: mockStore,
    dynamicClient,
    chainId: 84532,
    batchChunkSize: 20
  });

  const summary = await worker.runOnce();

  assert.equal(summary.inspected, 1);
  assert.equal(summary.executed, 1);
  assert.equal(summary.failed, 0);

  const res = summary.results[0];
  assert.equal(res.executed, true);
  assert.equal(res.agentId, 'agt_test123');
  assert.equal(res.eligibleSupply, 50);
  assert.equal(res.totalFunded, '3000000'); // 30% of 10 USDC = 3 USDC
  assert.equal(res.amountPerPass, '60000'); // 3,000,000 / 50 = 60,000 (0.06 USDC)
  assert.match(res.fundTxHash, /^0x[0-9a-f]{64}$/);
  assert.match(res.sweepTxHash, /^0x[0-9a-f]{64}$/);
  assert.equal(res.claimCount, 3); // 50 passes / chunkSize 20 = 3 chunks (20, 20, 10)

  // Verify schedule updated to future
  assert.ok(updatedSchedule);
  assert.equal(updatedSchedule.id, 'agt_test123');
  assert.ok(new Date(updatedSchedule.nextDistributionAt).getTime() > Date.now());

  // Verify log recorded
  assert.equal(recordedLogs.length, 1);
  assert.equal(recordedLogs[0].status, 'COMPLETED');
  assert.equal(recordedLogs[0].totalFunded, 3000000n);
});

test('DistributionAgentWorker: gracefully catches and records failed distribution', async () => {
  const dynamicClient = new DynamicServerWalletClient({ mockMode: true });
  const serverWallet = await dynamicClient.createOrGetServerWallet({ identifier: 'failed-agent' });

  const failingAgent = {
    id: 'agt_failing',
    edition_address: '0x9999999999999999999999999999999999999999',
    builder_address: '0x2222222222222222222222222222222222222222',
    policy_id: '0x4444444444444444444444444444444444444444444444444444444444444444',
    server_wallet_id: serverWallet.walletId,
    server_wallet_address: serverWallet.address,
    reward_source: 'BUILDER_ROYALTY',
    allocation_bps: 3000,
    cadence_days: 30,
    next_distribution_at: new Date(Date.now() - 1000)
  };

  const recordedLogs = [];
  const mockStore = {
    listDueDistributionAgents: async () => [failingAgent],
    recordDistributionLog: async (log) => {
      recordedLogs.push(log);
      return log;
    },
    _getPool: async () => {
      throw new Error('DATABASE_CONNECTION_REFUSED');
    }
  };

  const worker = new DistributionAgentWorker({
    store: mockStore,
    dynamicClient,
    logger: { error: () => {} }
  });

  const summary = await worker.runOnce();
  assert.equal(summary.inspected, 1);
  assert.equal(summary.executed, 0);
  assert.equal(summary.failed, 1);
  assert.equal(recordedLogs.length, 1);
  assert.equal(recordedLogs[0].status, 'FAILED');
  assert.equal(recordedLogs[0].errorMessage, 'DATABASE_CONNECTION_REFUSED');
});
