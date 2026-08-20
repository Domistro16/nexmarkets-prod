import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { ChainLifecycleWorker } from '../services/worker/src/chain-lifecycle.mjs';

test('Postgres chain worker confirms/finalizes and records idempotent evidence', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`; const account = `acct_cw_${suffix}`; const wallet = `wal_cw_${suffix}`; const txId = `tx_cw_${suffix}`; const reorgId = `tx_reorg_${suffix}`; const txHash = `0x${'ab'.repeat(32)}`; const reorgHash = `0x${'ef'.repeat(32)}`; const blockHash = `0x${'cd'.repeat(32)}`; const replacementHash = `0x${'01'.repeat(32)}`;
  try {
    await pool.query('INSERT INTO account(id) VALUES($1)', [account]); await pool.query('INSERT INTO wallet(id,account_id,chain_id,address,verified_at) VALUES($1,$2,46630,$3,now())', [wallet, account, `0x${'12'.repeat(20)}`]);
    await pool.query(`INSERT INTO chain_transaction(id,chain_id,intent_type,intent_id,wallet_address,state,tx_hash,to_address) VALUES($1,46630,'MINT',$1,$2,'SUBMITTED',$3,$4)`, [txId, `0x${'12'.repeat(20)}`, txHash, `0x${'34'.repeat(20)}`]); await pool.query(`INSERT INTO transaction_job(id,transaction_id,job_type) VALUES($1,$2,'CHAIN_LIFECYCLE')`, [`job_${suffix}`, txId]);
    await pool.query(`INSERT INTO chain_transaction(id,chain_id,intent_type,intent_id,wallet_address,state,tx_hash,block_number,block_hash) VALUES($1,46630,'MINT',$1,$2,'CONFIRMED',$3,19,$4)`, [reorgId, `0x${'12'.repeat(20)}`, reorgHash, blockHash]); await pool.query(`INSERT INTO transaction_job(id,transaction_id,job_type) VALUES($1,$2,'CHAIN_LIFECYCLE')`, [`job_reorg_${suffix}`, reorgId]);
    const worker = new ChainLifecycleWorker({ pool, chainId: 46630, finalityDepth: 2, rpc: { async getBlockNumber() { return 20; }, async getTransactionReceipt(hash) { if (hash === reorgHash) return null; return { transactionHash: txHash, from: `0x${'12'.repeat(20)}`, to: `0x${'34'.repeat(20)}`, status: '0x1', blockNumber: '0x12', blockHash }; }, async getTransactionByHash() { return { from: `0x${'12'.repeat(20)}`, to: `0x${'34'.repeat(20)}` }; }, async getBlockByNumber(number) { return { hash: Number(number) === 18 ? blockHash : replacementHash }; } } });
    const result = await worker.runOnce(); assert.equal(result.progressed, 2);
    const state = await pool.query('SELECT state,confirmations FROM chain_transaction WHERE id=$1', [txId]); assert.equal(state.rows[0].state, 'FINALIZED'); assert.equal(Number(state.rows[0].confirmations), 2);
    const events = await pool.query('SELECT count(*)::int count FROM transaction_event WHERE transaction_id=$1', [txId]); assert.equal(events.rows[0].count, 2);
    await worker.runOnce(); const eventsAgain = await pool.query('SELECT count(*)::int count FROM transaction_event WHERE transaction_id=$1', [txId]); assert.equal(eventsAgain.rows[0].count, 2);
    const reorgState = await pool.query('SELECT state FROM chain_transaction WHERE id=$1', [reorgId]); assert.equal(reorgState.rows[0].state, 'REORGED');
  } finally { for (const id of [txId, reorgId]) { await pool.query('DELETE FROM outbox_event WHERE aggregate_id=$1', [id]); await pool.query('DELETE FROM notification WHERE business_key=$1', [id]); await pool.query('DELETE FROM transaction_event WHERE transaction_id=$1', [id]); await pool.query('DELETE FROM transaction_job WHERE transaction_id=$1', [id]); await pool.query('DELETE FROM chain_transaction WHERE id=$1', [id]); } await pool.query('DELETE FROM wallet WHERE id=$1', [wallet]); await pool.query('DELETE FROM account WHERE id=$1', [account]); await pool.end(); }
});
