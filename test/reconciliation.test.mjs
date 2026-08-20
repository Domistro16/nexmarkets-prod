import test from 'node:test';
import assert from 'node:assert/strict';
import { ReconciliationService } from '../services/reconciler/src/reconciler.mjs';
import { RobinhoodReconciliationChain } from '../services/reconciler/src/rpc-adapter.mjs';
import pg from 'pg';
import { PostgresReconciliationStore } from '../services/reconciler/src/postgres-adapter.mjs';

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

test('Postgres reconciliation adapter reads projection rows and records evidence', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`; const account = `acct_rec_${suffix}`; const project = `prj_rec_${suffix}`; const edition = `ed_rec_${suffix}`; const address = `0x${'44'.repeat(20)}`; const tx = `0x${'55'.repeat(32)}`; const block = `0x${'66'.repeat(32)}`;
  let runId;
  try {
    await pool.query('INSERT INTO account(id) VALUES($1)', [account]); await pool.query('INSERT INTO project(id,builder_account_id,slug,name) VALUES($1,$2,$3,$4)', [project, account, `rec-${suffix}`, 'Recon']); await pool.query(`INSERT INTO edition(id,project_id,chain_id,edition_address,edition_id_hash,factory_address,publisher_address,absolute_supply_cap,artwork_commitment,source_block_number,source_block_hash,source_tx_hash,source_log_index) VALUES($1,$2,46630,$3,$4,$5,$6,5,$7,1,$8,$9,0)`, [edition, project, address, `0x${'77'.repeat(32)}`, address, address, `0x${'88'.repeat(32)}`, block, tx]); await pool.query(`INSERT INTO pass_token_projection(edition_id,token_id,owner_address,terms_hash,minted_block_number,latest_block_number,latest_block_hash,latest_tx_hash,latest_log_index) VALUES($1,1,$2,$3,2,2,$4,$5,0)`, [edition, address, `0x${'99'.repeat(32)}`, block, tx]);
    const evidenceStore = new PostgresReconciliationStore({ pool, chainId: 46630 }); const service = new ReconciliationService({ chain: { async owner() { return '0x' + 'aa'.repeat(20); }, async tokenTerms() { return `0x${'99'.repeat(32)}`; }, async tba() { return address; } }, projections: evidenceStore, evidenceStore }); const result = await service.run({ chainId: 46630, scope: 'PASS' }); runId = result.runId; assert.ok(result.discrepancies.some((item) => item.check === 'owner'));
  } finally { if (runId) await pool.query('DELETE FROM reconciliation_incident WHERE run_id=$1', [runId]); if (runId) await pool.query('DELETE FROM reconciliation_run WHERE id=$1', [runId]); await pool.query('DELETE FROM pass_token_projection WHERE edition_id=$1', [edition]); await pool.query('DELETE FROM edition WHERE id=$1', [edition]); await pool.query('DELETE FROM project WHERE id=$1', [project]); await pool.query('DELETE FROM account WHERE id=$1', [account]); await pool.end(); }
});
