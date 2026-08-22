import test from 'node:test';
import assert from 'node:assert/strict';
import { SubgraphClient, advantageRemaining } from '../packages/subgraph-client/src/index.mjs';

test('subgraph client queries Goldsky and reports indexed block', async () => {
  const requests = [];
  const client = new SubgraphClient({ endpoint: 'https://example.invalid/graphql', fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, async json() { return { data: { _meta: { block: { number: '104700000', hash: '0xabc' }, deployment: 'Qmtest' } } }; } };
  } });
  const status = await client.indexingStatus();
  assert.equal(status.indexedBlock, 104700000);
  assert.equal(status.blockHash, '0xabc');
  assert.match(requests[0].query, /_meta/);
});

test('advantage remaining preserves kind-aware semantics', () => {
  assert.equal(advantageRemaining({ kind: 'CONNECTED', startsAt: '10', endsAt: '100', remainingUnits: '0', listed: false }, 50), '1');
  assert.equal(advantageRemaining({ kind: 'QUANTITY_BASED', startsAt: '10', endsAt: '100', remainingUnits: '3', listed: false }, 50), '3');
  assert.equal(advantageRemaining({ kind: 'TIME_BASED', startsAt: '10', endsAt: '100', frozenSeconds: '0', listed: false }, 50), '50');
  assert.equal(advantageRemaining({ kind: 'TIME_BASED', startsAt: '10', endsAt: '100', frozenSeconds: '0', listed: true, listedAt: '40' }, 80), '60');
});

test('subgraph client fails closed without an endpoint', async () => {
  const client = new SubgraphClient();
  await assert.rejects(() => client.indexingStatus(), /SUBGRAPH_ENDPOINT_REQUIRED/);
});
