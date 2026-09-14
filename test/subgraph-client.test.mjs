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

test('edition reads attach exact committed Advantage configs to each Terms version', async () => {
  const editionAddress = '0x1111111111111111111111111111111111111111';
  const currentHash = `0x${'aa'.repeat(32)}`;
  const previousHash = `0x${'bb'.repeat(32)}`;
  let request = null;
  const client = new SubgraphClient({ endpoint: 'https://example.invalid/graphql', fetchImpl: async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, async json() { return { data: {
      editions: [{
        address: editionAddress,
        editionId: `0x${'01'.repeat(32)}`,
        publisher: '0x2222222222222222222222222222222222222222',
        currentTerms: { hash: currentHash, version: '2', pricePerPass: '1000000' },
        terms: [{ hash: previousHash, version: '1', pricePerPass: '900000' }]
      }],
      advantageDefinitions: [
        { termsHash: currentHash, advantageId: `0x${'10'.repeat(32)}`, kind: 'QUANTITY_BASED', startsAt: '10', endsAt: '100', totalUnits: '5', definitionHash: `0x${'20'.repeat(32)}` },
        { termsHash: previousHash, advantageId: `0x${'11'.repeat(32)}`, kind: 'CONNECTED', startsAt: '10', endsAt: '100', totalUnits: '0', definitionHash: `0x${'21'.repeat(32)}` }
      ]
    } }; } };
  } });
  const result = await client.editionByAddress(editionAddress);
  assert.equal(request.variables.address, editionAddress);
  assert.equal(request.variables.editionId, editionAddress);
  assert.match(request.query, /advantageDefinitions/);
  assert.equal(result.currentTerms.advantageConfigs[0].kind, 1);
  assert.equal(result.currentTerms.advantageConfigs[0].totalUnits, '5');
  assert.equal(result.termsHistory[0].advantageConfigs[0].kind, 2);
  assert.equal(result.termsHistory[0].advantageConfigs[0].advantageId, `0x${'11'.repeat(32)}`);
});

test('reward policies distinguish published rules from funded cycles', async () => {
  const edition = '0x1111111111111111111111111111111111111111';
  const client = new SubgraphClient({ endpoint: 'https://example.invalid/graphql', fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.match(body.query, /rewardPolicies/);
    return { ok: true, async json() { return { data: { rewardPolicies: [{
      id: `0x${'aa'.repeat(32)}`,
      policyId: `0x${'aa'.repeat(32)}`,
      publisher: '0x2222222222222222222222222222222222222222',
      source: 'BUILDER_FUNDED',
      sourceCode: 3,
      allocationBps: 0,
      rewardAsset: '0x0000000000000000000000000000000000000000',
      ongoing: true,
      endsAt: '0',
      status: 'ACTIVE',
      publishedTimestamp: '1700000000',
      cycles: [{
        id: `0x${'bb'.repeat(32)}`,
        cycleId: `0x${'bb'.repeat(32)}`,
        asset: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
        amountPerPass: '20500000',
        eligibleSupply: '3',
        fundedAmount: '61500000',
        claimedAmount: '0',
        claimedCount: '0',
        snapshotBlock: '10',
        fundedAt: '1700000100'
      }]
    }] } }; } };
  } });
  const policies = await client.rewardPolicies(edition);
  assert.equal(policies[0].source, 'BUILDER_FUNDED');
  assert.equal(policies[0].cycles[0].status, 'FUNDED');
  assert.equal(policies[0].cycles[0].amountPerPass, '20500000');
});
