import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createApiServer, createRuntimeNetworkContext } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

test('production targets Robinhood mainnet with USDG and waits for deployed contracts', () => {
  const config = JSON.parse(readFileSync(new URL('../apps/web/public/config.json', import.meta.url), 'utf8'));
  assert.equal(config.defaultNetwork, 'robinhood-mainnet');
  assert.deepEqual(config.availableNetworks, ['robinhood-mainnet']);
  assert.deepEqual(Object.keys(config.networks), ['robinhood-mainnet']);
  assert.equal(config.chainId, 4663);
  assert.equal(config.protocolVersion, 2);
  assert.equal(config.settlementSymbol, 'USDG');
  assert.equal(config.settlement.mock, false);
  assert.equal(config.settlementToken.toLowerCase(), '0x5fc5360d0400a0fd4f2af552add042d716f1d168');
  assert.ok(Object.values(config.contracts).every((value) => value === null));
  assert.equal(config.runtimeReady, false);
  assert.equal(config.subgraph, null);
  assert.equal(config.certificationEdition, null);
  assert.equal(config.productionReady, false);
  assert.equal(config.auth.cdp.enabled, false);
});

test('API runtime ignores a retired Base default and exposes only Robinhood contexts', () => {
  for (const env of [{}, { NEXMARKETS_DEFAULT_NETWORK: 'base-sepolia' }, { NEXMARKETS_DEFAULT_NETWORK: 'base-mainnet' }]) {
    const { configured, networkConfigs } = createRuntimeNetworkContext(env);
    assert.equal(configured.chainId, 4663);
    assert.deepEqual(Object.keys(networkConfigs), ['robinhood-mainnet', 'robinhood-testnet']);
    assert.equal(configured.settlement.symbol, 'USDG');
  }
  assert.throws(() => createRuntimeNetworkContext({ NEXMARKETS_DEFAULT_NETWORK: 'unknown' }), /ROBINHOOD_NETWORK_REQUIRED/);
  const { configured } = createRuntimeNetworkContext({ USDG_ADDRESS: '0x1111111111111111111111111111111111111111', NEX_PASS_FACTORY_ADDRESS: '0x2222222222222222222222222222222222222222' });
  assert.equal(configured.settlement.address.toLowerCase(), '0x5fc5360d0400a0fd4f2af552add042d716f1d168');
  assert.equal(configured.orderPolicy.transactionTargets.EDITION_CREATE, undefined);
  assert.equal(createRuntimeNetworkContext({ NEXMARKETS_DEFAULT_NETWORK: 'robinhood-testnet' }).configured.chainId, 46630);
});

test('deployed API rejects a Base network header instead of serving its data', async (t) => {
  const { configured, networkConfigs } = createRuntimeNetworkContext({});
  const server = createApiServer({ store: new MemoryStore(), chainId: configured.chainId, networkConfigs, secureCookies: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/healthz`)).status, 200);
  for (const path of ['/v1/mints/prepare', '/v1/listings/buy', '/v1/listings/signed-order', '/v1/vault/claims/prepare', '/v1/builder/editions/link', '/v1/distribution-agents/provision']) {
    const response = await fetch(`${origin}${path}`, { method: 'POST' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'MAINNET_DEPLOYMENT_PENDING');
  }
  for (const key of ['base-sepolia', 'base-mainnet']) {
    const response = await fetch(`${origin}/healthz`, { headers: { 'x-nex-network': key } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'NETWORK_UNSUPPORTED');
  }
});
