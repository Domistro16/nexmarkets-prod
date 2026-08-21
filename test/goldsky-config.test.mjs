import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const render = (args = []) => {
  execFileSync(process.execPath, ['scripts/render-goldsky-config.mjs', ...args], { cwd: root, stdio: 'pipe' });
  const name = args.includes('--mainnet') ? 'robinhood-mainnet' : 'robinhood-testnet';
  return readFileSync(new URL(`artifacts/goldsky/nexmarkets-robinhood-${name}.turbo.yaml`, root), 'utf8');
};

test('testnet Goldsky uses NexMarkets fast-scan and live watermark sources', () => {
  const yaml = render();
  assert.match(yaml, /robinhood_logs_nexmarkets:\s+[\s\S]*?start_at: earliest\s+filter: "block_number >= 104607055"/);
  assert.match(yaml, /robinhood_blocks_live:\s+[\s\S]*?start_at: latest/);
  assert.match(yaml, /FROM robinhood_logs_nexmarkets/);
  assert.match(yaml, /FROM robinhood_blocks_live/);
  assert.match(yaml, /goldsky_raw_log/);
  assert.match(yaml, /goldsky_chain_watermark/);
});

test('mainnet Goldsky rendering does not inherit the testnet deployment block', () => {
  const yaml = render(['--mainnet']);
  assert.doesNotMatch(yaml, /104607055/);
  assert.match(yaml, /filter: "TRUE"/);
  assert.match(yaml, /robinhood_logs_nexmarkets/);
  assert.match(yaml, /robinhood_blocks_live/);
});
