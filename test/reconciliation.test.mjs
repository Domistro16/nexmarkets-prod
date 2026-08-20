import test from 'node:test';
import assert from 'node:assert/strict';
import { ReconciliationService } from '../services/reconciler/src/reconciler.mjs';

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
