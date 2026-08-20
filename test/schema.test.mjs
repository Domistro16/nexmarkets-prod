import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production schema keeps chain projections provenance-complete', async () => {
  const sql = `${await readFile(new URL('../infra/schema/0001_phase0_authority.sql', import.meta.url), 'utf8')}\n${await readFile(new URL('../infra/schema/0002_nexmarkets_v1.sql', import.meta.url), 'utf8')}`;
  for (const field of ['source_block_number','source_block_hash','source_tx_hash','source_log_index','orphaned_at','finalized']) assert.ok(sql.includes(field));
  assert.match(sql, /PRIMARY KEY\(chain_id,tx_hash,log_index\)/);
  assert.match(sql, /tier_percent IN \(5,10,15,20\)/);
  assert.match(sql, /state IN \('PREPARED','WALLET_PENDING','SUBMITTED','CONFIRMED','FINALIZED','CANCELLED','REVERTED','REORGED'\)/);
});
