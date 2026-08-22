import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = await readFile(new URL('../subgraph.yaml', import.meta.url), 'utf8');
const schema = await readFile(new URL('../schema.graphql', import.meta.url), 'utf8');

test('Goldsky testnet manifest is frozen at the NexMarkets deployment block', () => {
  assert.match(manifest, /network: robinhood-testnet/);
  assert.match(manifest, /startBlock: 104607055/);
  assert.match(manifest, /name: NexPassFactory/);
  assert.match(manifest, /name: NexPassEdition/);
  assert.match(manifest, /handler: handleEditionCreated/);
});

test('Subgraph schema exposes normalized NexMarkets read entities', () => {
  for (const entity of ['Edition', 'TermsVersion', 'Pass', 'AdvantageState', 'Listing', 'RoyaltyClaim', 'TokenBoundAccount']) {
    assert.match(schema, new RegExp(`type ${entity} `));
  }
});
