import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const manifest = parse(readFileSync(new URL('../subgraph/subgraph.yaml', import.meta.url), 'utf8'));

test('Robinhood testnet Subgraph starts at the first NexMarkets deployment block', () => {
  assert.equal(manifest.dataSources[0].network, 'robinhood-testnet');
  assert.equal(manifest.dataSources[0].source.startBlock, 104607055);
  assert.notEqual(manifest.dataSources[0].source.startBlock, 0);
});

test('Factory is static and Edition indexing is dynamic', () => {
  assert.equal(manifest.dataSources[0].source.address.toLowerCase(), '0x957de0de07d33c9a89c791b876074657a7ffeeb6');
  assert.equal(manifest.templates.length, 1);
  assert.equal(manifest.templates[0].name, 'NexPassEdition');
  assert.ok(manifest.dataSources[0].mapping.eventHandlers.some((handler) => handler.handler === 'handleEditionCreated'));
});

test('manifest has no fabricated mainnet start block or Turbo sink', () => {
  const source = readFileSync(new URL('../subgraph/subgraph.yaml', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /robinhood-mainnet/);
  assert.doesNotMatch(source, /goldsky_raw_log|goldsky_chain_watermark/);
});
