import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createApiServer, createRuntimeNetworkContext } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

test('active app uses the current Robinhood deployment and Goldsky index exclusively', () => {
  const config = JSON.parse(readFileSync(new URL('../apps/web/public/config.json', import.meta.url), 'utf8'));
  const deployment = JSON.parse(readFileSync(new URL('../deployments/robinhood-testnet.v1-deployment.json', import.meta.url), 'utf8'));
  assert.equal(config.defaultNetwork, 'robinhood-testnet');
  assert.deepEqual(config.availableNetworks, ['robinhood-testnet']);
  assert.deepEqual(Object.keys(config.networks), ['robinhood-testnet']);
  assert.equal(config.chainId, 46630);
  assert.equal(config.protocolVersion, 2);
  assert.equal(config.settlementSymbol, 'MockUSDG');
  assert.equal(config.settlementToken, deployment.mockUsdg.address);
  assert.equal(config.contracts.passFactory, deployment.contracts.NexPassFactory.address);
  assert.equal(config.contracts.rewardDistributor, deployment.contracts.NexRewardDistributor.address);
  assert.deepEqual(config.subgraph, deployment.subgraph);
  assert.equal(config.certificationEdition, null);
  assert.equal(config.productionReady, false);
  assert.equal(config.auth.cdp.enabled, false);
});

test('API runtime ignores a retired Base default and exposes only Robinhood contexts', () => {
  for (const env of [{}, { NEXMARKETS_DEFAULT_NETWORK: 'base-sepolia' }, { NEXMARKETS_DEFAULT_NETWORK: 'base-mainnet' }]) {
    const { configured, networkConfigs } = createRuntimeNetworkContext(env);
    assert.equal(configured.chainId, 46630);
    assert.deepEqual(Object.keys(networkConfigs), ['robinhood-mainnet', 'robinhood-testnet']);
    assert.equal(configured.settlement.symbol, 'MockUSDG');
  }
  assert.throws(() => createRuntimeNetworkContext({ NEXMARKETS_DEFAULT_NETWORK: 'unknown' }), /ROBINHOOD_NETWORK_REQUIRED/);
});

test('deployed API rejects a Base network header instead of serving its data', async (t) => {
  const { configured, networkConfigs } = createRuntimeNetworkContext({});
  const server = createApiServer({ store: new MemoryStore(), chainId: configured.chainId, networkConfigs, secureCookies: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/healthz`)).status, 200);
  for (const key of ['base-sepolia', 'base-mainnet']) {
    const response = await fetch(`${origin}/healthz`, { headers: { 'x-nex-network': key } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'NETWORK_UNSUPPORTED');
  }
});
