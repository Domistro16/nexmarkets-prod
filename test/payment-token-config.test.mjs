import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNetworkConfigs } from '../apps/api/src/server.mjs';
import { networkByKey } from '../packages/config/src/index.mjs';

test('payment token is chain-scoped and MockUSDG is explicitly testnet-only', async () => {
  const testnet = networkByKey('robinhood-testnet').settlement;
  const mainnet = networkByKey('robinhood-mainnet').settlement;
  assert.equal(testnet.symbol, 'MockUSDG');
  assert.equal(testnet.mock, true);
  assert.equal(testnet.testnetOnly, true);
  assert.equal(testnet.productionForbidden, true);
  assert.equal(mainnet.symbol, 'USDG');
  assert.notEqual(mainnet.mock, true);
  const config = JSON.parse(await readFile(new URL('../apps/web/public/config.json', import.meta.url), 'utf8'));
  assert.equal(config.networks['robinhood-testnet'].settlementSymbol, 'MockUSDG');
  assert.equal(config.networks['robinhood-testnet'].settlement.mock, true);
});

test('API network policies use the configured settlement address for each chain', () => {
  const configs = createNetworkConfigs({});
  assert.equal(configs['robinhood-testnet'].settlement.symbol, 'MockUSDG');
  assert.equal(configs['robinhood-testnet'].settlement.address.toLowerCase(), '0x6a4f8832c23c51ba626eba9d50c8f862647c1679');
  assert.equal(configs['base-sepolia'].settlement.symbol, 'USDC');
  assert.equal(configs['base-sepolia'].settlement.address.toLowerCase(), '0x036cbd53842c5426634e7929541ec2318f3dcf7e');
});
