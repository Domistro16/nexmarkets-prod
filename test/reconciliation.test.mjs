import test from 'node:test';
import assert from 'node:assert/strict';
import { ReconciliationService } from '../services/reconciler/src/reconciler.mjs';
import { RobinhoodReconciliationChain } from '../services/reconciler/src/rpc-adapter.mjs';
import pg from 'pg';
import { PostgresReconciliationStore } from '../services/reconciler/src/postgres-adapter.mjs';
import { advantageRemaining } from '../services/indexer/src/runtime.mjs';
import { Interface } from 'ethers';

function evidence() {
  const state = { runs: [], incidents: [] };
  return { state, async startRun(scope) { const run = { id: `run_${state.runs.length + 1}`, scope }; state.runs.push(run); return run; }, async recordIncident(row) { state.incidents.push(row); }, async finishRun(id, status, result) { Object.assign(state.runs.find((run) => run.id === id), { status, result }); } };
}

test('reconciliation reports stale owner and listing without overwriting chain truth', async () => {
  const store = evidence();
  const service = new ReconciliationService({
    chain: { async owner() { return '0xchain'; }, async listing() { return 'STALE'; } },
    projections: { async items() { return [{ key: 'pass:1', identity: {}, expected: { owner: '0xdb', listing: 'ACTIVE' }, authority: { owner: 'ERC721', listing: 'NEX_LISTING_REGISTRY' }, repair: { owner: 'REPROJECT_FROM_CHAIN', listing: 'REPROJECT_FROM_CHAIN' } }]; } },
    evidenceStore: store
  });
  const result = await service.run('PASS');
  assert.equal(result.checkedCount, 2); assert.equal(result.discrepancies.length, 2); assert.equal(store.state.runs[0].status, 'PARTIAL');
  assert.equal(result.discrepancies[0].observed, '0xchain');
});

test('missing event is detected by chain comparison with bounded retries', async () => {
  const store = evidence(); let calls = 0;
  const service = new ReconciliationService({
    chain: { async royalty() { calls += 1; if (calls < 3) throw new Error('temporary rpc'); return { amount: '500' }; } },
    projections: { async items() { return [{ key: 'claim:x', identity: {}, expected: { royalty: null }, authority: { royalty: 'NEX_ROYALTY_VAULT' } }]; } },
    evidenceStore: store, attempts: 3
  });
  const result = await service.run('ROYALTY');
  assert.equal(calls, 3); assert.equal(result.checkedCount, 1); assert.equal(result.discrepancies.length, 1);
});

test('reconciliation compares normalized edition, Terms, Advantage, listing, royalty and TBA state', async () => {
  const store = evidence();
  const expected = {
    edition: true, totalMinted: '1', owner: '0xaa', tokenTerms: '0xt', activeTerms: { hash: '0xactive', terms: { activeSupply: '1' } },
    advantage: { remaining: '4', listed: false }, listing: { status: 'ACTIVE', usdGPrice: '101' },
    royalty: { amount: '5', withdrawn: false }, withdrawal: false, tba: '0xtba'
  };
  const chain = Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, async () => value]));
  const projections = { async items() { return [{ key: 'pass:full', identity: { edition: '0xed', tokenId: '1', advantageId: '0xa', orderHash: '0xo' }, expected, authority: Object.fromEntries(Object.keys(expected).map((key) => [key, 'CHAIN'])), repair: {} }]; } };
  let result = await new ReconciliationService({ chain, projections, evidenceStore: store }).run('FULL');
  assert.equal(result.discrepancies.length, 0); assert.equal(result.checkedCount, Object.keys(expected).length);
  const corrupted = { ...expected, listing: { ...expected.listing, status: 'FILLED' } };
  result = await new ReconciliationService({ chain, projections: { async items() { return [{ key: 'pass:full', identity: {}, expected: corrupted, authority: { listing: 'NEX_LISTING_REGISTRY' }, repair: {} }]; } }, evidenceStore: evidence() }).run('LISTING');
  assert.equal(result.discrepancies.length, 1); assert.equal(result.discrepancies[0].check, 'listing');
});

test('RPC reconciliation adapter reads canonical owner and token Terms', async () => {
  const calls = [];
  const chain = new RobinhoodReconciliationChain({ rpc: { async ethCall(to, data) { calls.push({ to, data }); return `0x${'00'.repeat(12)}${'11'.repeat(20)}`; } } });
  const owner = await chain.owner({ edition: '0x2222222222222222222222222222222222222222', tokenId: 1 });
  assert.equal(owner, '0x1111111111111111111111111111111111111111'); assert.equal(calls.length, 1);
});

test('RPC reconciliation adapter normalizes live uint and tuple return shapes', async () => {
  const editionInterface = new Interface(['function totalMinted() view returns (uint256)']);
  const registryInterface = new Interface(['function activeTerms(address) view returns (bytes32,tuple(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash))']);
  const activeHash = `0x${'11'.repeat(32)}`;
  const recipient = `0x${'22'.repeat(20)}`;
  const activeTerms = [3n, 1000000n, 10n, 20n, 30n, recipient, recipient, 300n, `0x${'33'.repeat(32)}`, `0x${'44'.repeat(32)}`];
  const chain = new RobinhoodReconciliationChain({
    rpc: {
      async ethCall(to, data) {
        if (data.startsWith(editionInterface.getFunction('totalMinted').selector)) return editionInterface.encodeFunctionResult('totalMinted', [0n]);
        if (data.startsWith(registryInterface.getFunction('activeTerms').selector)) return registryInterface.encodeFunctionResult('activeTerms', [activeHash, activeTerms]);
        throw new Error(`unexpected call ${to}`);
      }
    },
    addresses: { launchRegistry: `0x${'55'.repeat(20)}` }
  });
  assert.equal(await chain.totalMinted({ edition: `0x${'66'.repeat(20)}` }), '0');
  assert.deepEqual(await chain.activeTerms({ edition: `0x${'66'.repeat(20)}` }), {
    hash: activeHash,
    terms: {
      activeSupply: '3', pricePerPass: '1000000', previewStartsAt: 10, mintStartsAt: 20, mintEndsAt: 30,
      primaryRecipient: recipient, royaltyReceiver: recipient, royaltyBps: '300', advantagesHash: `0x${'33'.repeat(32)}`, referralTermsHash: `0x${'44'.repeat(32)}`
    }
  });
});

test('Advantage projection semantics are kind-aware and freeze only the listed TimeBased utility', () => {
  const time = { kind: 'TIME_BASED', startsAt: 100, endsAt: 200 };
  const connected = { kind: 'CONNECTED', startsAt: 100, endsAt: 200, totalUnits: 0 };
  const quantity = { kind: 'QUANTITY_BASED', startsAt: 100, endsAt: 200, totalUnits: 5 };
  assert.equal(advantageRemaining(time, { frozenSeconds: 0, listed: false }, 150), '50');
  assert.equal(advantageRemaining(time, { frozenSeconds: 0, listed: true, listedAt: 120 }, 180), '80');
  assert.equal(advantageRemaining(connected, { frozenSeconds: 0, listed: true, listedAt: 120 }, 150), '1');
  assert.equal(advantageRemaining(connected, { frozenSeconds: 0, listed: false }, 250), '0');
  assert.equal(advantageRemaining(quantity, { frozenSeconds: 0, listed: false, remainingUnits: 3 }, 150), '3');
});

test('reconciliation keeps two historical royalty claims independent by orderHash', async () => {
  const store = evidence(); const claims = new Map([
    ['0xorder1', { edition: '0xed', tokenId: '1', builder: '0xbuilder', amount: '5', releaseAt: 100, withdrawn: false }],
    ['0xorder2', { edition: '0xed', tokenId: '1', builder: '0xbuilder', amount: '7', releaseAt: 200, withdrawn: false }]
  ]);
  const projections = { async items() { return [...claims].map(([orderHash, royalty]) => ({ key: `royalty:${orderHash}`, identity: { orderHash }, expected: { royalty, withdrawal: false }, authority: { royalty: 'NEX_ROYALTY_VAULT', withdrawal: 'NEX_ROYALTY_VAULT' }, repair: {} })); } };
  const chain = { async royalty({ orderHash }) { return orderHash === '0xorder2' ? { ...claims.get(orderHash), amount: '999' } : claims.get(orderHash); }, async withdrawal() { return false; } };
  const result = await new ReconciliationService({ chain, projections, evidenceStore: store }).run('ROYALTY');
  assert.equal(result.discrepancies.length, 1); assert.equal(result.discrepancies[0].objectKey, 'royalty:0xorder2');
});

test('Postgres reconciliation adapter reads projection rows and records evidence', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`; const account = `acct_rec_${suffix}`; const project = `prj_rec_${suffix}`; const edition = `ed_rec_${suffix}`; const address = `0x${'44'.repeat(20)}`; const tx = `0x${'55'.repeat(32)}`; const block = `0x${'66'.repeat(32)}`;
  let runId;
  try {
    await pool.query('INSERT INTO account(id) VALUES($1)', [account]); await pool.query('INSERT INTO project(id,builder_account_id,slug,name) VALUES($1,$2,$3,$4)', [project, account, `rec-${suffix}`, 'Recon']); await pool.query(`INSERT INTO edition(id,project_id,chain_id,edition_address,edition_id_hash,factory_address,publisher_address,absolute_supply_cap,artwork_commitment,source_block_number,source_block_hash,source_tx_hash,source_log_index) VALUES($1,$2,46630,$3,$4,$5,$6,5,$7,1,$8,$9,0)`, [edition, project, address, `0x${'77'.repeat(32)}`, address, address, `0x${'88'.repeat(32)}`, block, tx]); await pool.query(`INSERT INTO pass_token_projection(edition_id,token_id,owner_address,terms_hash,minted_block_number,latest_block_number,latest_block_hash,latest_tx_hash,latest_log_index) VALUES($1,1,$2,$3,2,2,$4,$5,0)`, [edition, address, `0x${'99'.repeat(32)}`, block, tx]);
    const evidenceStore = new PostgresReconciliationStore({ pool, chainId: 46630 }); const service = new ReconciliationService({ chain: { async owner() { return '0x' + 'aa'.repeat(20); }, async tokenTerms() { return `0x${'99'.repeat(32)}`; }, async tba() { return address; } }, projections: evidenceStore, evidenceStore }); const result = await service.run({ chainId: 46630, scope: 'PASS' }); runId = result.runId; assert.ok(result.discrepancies.some((item) => item.check === 'owner'));
  } finally { if (runId) await pool.query('DELETE FROM reconciliation_incident WHERE run_id=$1', [runId]); if (runId) await pool.query('DELETE FROM reconciliation_run WHERE id=$1', [runId]); await pool.query('DELETE FROM pass_token_projection WHERE edition_id=$1', [edition]); await pool.query('DELETE FROM edition WHERE id=$1', [edition]); await pool.query('DELETE FROM project WHERE id=$1', [project]); await pool.query('DELETE FROM account WHERE id=$1', [account]); await pool.end(); }
});

test('Postgres Advantage projections expose TimeBased, Connected and quantity semantics independently', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const account = `acct_adv_${suffix}`; const project = `prj_adv_${suffix}`; const edition = `ed_adv_${suffix}`; const address = `0x${'45'.repeat(20)}`; const terms = `0x${'46'.repeat(32)}`; const sourceBlock = `0x${'47'.repeat(32)}`; const sourceTx = `0x${'48'.repeat(32)}`; const now = Math.floor(Date.now() / 1000);
  const ids = { time: `0x${'01'.repeat(32)}`, connected: `0x${'02'.repeat(32)}`, inactive: `0x${'03'.repeat(32)}`, quantity: `0x${'04'.repeat(32)}` };
  try {
    await pool.query('INSERT INTO account(id) VALUES($1)', [account]); await pool.query('INSERT INTO project(id,builder_account_id,slug,name) VALUES($1,$2,$3,$4)', [project, account, `adv-${suffix}`, 'Advantages']); await pool.query(`INSERT INTO edition(id,project_id,chain_id,edition_address,edition_id_hash,factory_address,publisher_address,absolute_supply_cap,artwork_commitment,source_block_number,source_block_hash,source_tx_hash,source_log_index) VALUES($1,$2,46630,$3,$4,$5,$6,5,$7,1,$8,$9,0)`, [edition, project, address, `0x${'49'.repeat(32)}`, address, address, `0x${'50'.repeat(32)}`, sourceBlock, sourceTx]); await pool.query(`INSERT INTO pass_token_projection(edition_id,token_id,owner_address,terms_hash,minted_block_number,latest_block_number,latest_block_hash,latest_tx_hash,latest_log_index) VALUES($1,1,$2,$3,2,2,$4,$5,0)`, [edition, address, terms, sourceBlock, sourceTx]);
    const definitions = [[ids.time, 'TIME_BASED', now - 60, now + 100, 0], [ids.connected, 'CONNECTED', now - 60, now + 100, 0], [ids.inactive, 'CONNECTED', now - 200, now - 100, 0], [ids.quantity, 'QUANTITY_BASED', now - 60, now + 100, 5]];
    for (let index = 0; index < definitions.length; index += 1) { const [id, kind, starts, ends, units] = definitions[index]; await pool.query(`INSERT INTO advantage_definition(id,edition_id,terms_hash,advantage_id_hash,kind,starts_at,ends_at,total_units,definition_hash,definition) VALUES($1,$2,$3,$4,$5,to_timestamp($6),to_timestamp($7),$8,$9,'{}')`, [`advdef_${suffix}_${index}`, edition, terms, id, kind, starts, ends, units, `0x${String(index + 10).padStart(2, '0').repeat(32)}`]); await pool.query(`INSERT INTO advantage_state_projection(edition_id,token_id,advantage_id_hash,remaining_units,frozen_seconds,listed,listed_at,source_block_number,source_block_hash,source_tx_hash,source_log_index) VALUES($1,1,$2,$3,$4,$5,CASE WHEN $5 THEN to_timestamp($6) ELSE NULL END,2,$7,$8,$9)`, [edition, id, units, id === ids.time ? 20 : 0, id === ids.time || id === ids.connected, id === ids.time ? now - 30 : now, sourceBlock, `0x${String(60 + index).padStart(2, '0').repeat(32)}`, index]); }
    const store = new PostgresReconciliationStore({ pool, chainId: 46630 }); const items = await store.items('ADVANTAGE'); const byId = new Map(items.map((item) => [item.identity.advantageId, item])); assert.ok(Number(byId.get(ids.time).expected.advantage.remaining) > 0); assert.equal(byId.get(ids.connected).expected.advantage.remaining, '1'); assert.equal(byId.get(ids.inactive).expected.advantage.remaining, '0'); assert.equal(byId.get(ids.quantity).expected.advantage.remaining, '5');
  } finally { await pool.query('DELETE FROM advantage_state_projection WHERE edition_id=$1', [edition]); await pool.query('DELETE FROM advantage_definition WHERE edition_id=$1', [edition]); await pool.query('DELETE FROM pass_token_projection WHERE edition_id=$1', [edition]); await pool.query('DELETE FROM edition WHERE id=$1', [edition]); await pool.query('DELETE FROM project WHERE id=$1', [project]); await pool.query('DELETE FROM account WHERE id=$1', [account]); await pool.end(); }
});
