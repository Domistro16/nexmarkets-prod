import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Interface, id } from 'ethers';
import { PostgresProjectionWorker, decodeGoldskyLog } from '../services/indexer/src/runtime.mjs';

const EVENT = new Interface(['event TermsPublished(address indexed edition,bytes32 indexed termsVersionHash,uint64 indexed version,uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash)']);
const addr = (n) => `0x${String(n).padStart(40, '0')}`;
const hash = (n) => `0x${String(n).repeat(64).slice(0, 64)}`;

test('Goldsky decoder reconstructs complete immutable Terms event fields', () => {
  const edition = addr(1); const terms = hash('a'); const advantages = hash('b');
  const encoded = EVENT.encodeEventLog(EVENT.getEvent('TermsPublished'), [edition, terms, 2, 9, 1000, 10, 20, 40, addr(2), addr(3), 500, advantages, hash('c')]);
  const decoded = decodeGoldskyLog({ topic0: encoded.topics[0], topics: encoded.topics, data: encoded.data });
  assert.equal(decoded.eventName, 'TermsPublished');
  assert.equal(decoded.args.edition, edition.toLowerCase());
  assert.equal(decoded.args.activeSupply, '9');
  assert.equal(decoded.args.advantagesHash, advantages);
});

test('Postgres Goldsky raw log projects Edition and advances checkpoint', { skip: !process.env.DATABASE_URL }, async (t) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const chainId = 46630; const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`; const accountId = `acct_it_${suffix}`; const projectId = `prj_it_${suffix}`; const requestId = `edreq_it_${suffix}`;
  const edition = addr(11); const editionId = hash('d'); const tx = hash('e'); const blockHash = hash('f');
  try {
    await pool.query('INSERT INTO account(id) VALUES($1)', [accountId]);
    await pool.query('INSERT INTO project(id,builder_account_id,slug,name) VALUES($1,$2,$3,$4)', [projectId, accountId, `integration-${suffix}`, 'Integration']);
    await pool.query(`INSERT INTO edition_request(id,project_id,builder_account_id,chain_id,edition_id_hash,request_payload,safe_status) VALUES($1,$2,$3,$4,$5,$6::jsonb,'SAFE_PENDING')`, [requestId, projectId, accountId, chainId, editionId, JSON.stringify({ editionId })]);
    const factory = new Interface(['event EditionCreated(address indexed edition,bytes32 indexed editionId,address indexed publisher,bytes32 salt,address protocolAdmin,address mintController,uint32 absoluteSupplyCap,bytes32 artworkCommitment)']);
    const encoded = factory.encodeEventLog(factory.getEvent('EditionCreated'), [edition, editionId, addr(2), hash('1'), addr(3), addr(4), 10, hash('2')]);
    await pool.query(`INSERT INTO goldsky_raw_log(chain_id,block_number,block_hash,transaction_hash,log_index,contract_address,topic0,topics,data,block_timestamp) VALUES($1,10,$2,$3,0,$4,$5,$6::jsonb,$7,now())`, [chainId, blockHash, tx, addr(5), encoded.topics[0], JSON.stringify(encoded.topics), encoded.data]);
    const worker = new PostgresProjectionWorker({ pool, chainId, rpc: { async getBlockNumber() { return 20; }, async getBlockByNumber() { return { hash: blockHash }; } }, finalityDepth: 2 });
    const result = await worker.runOnce(); assert.equal(result.processed, 1);
    const editionRow = await pool.query('SELECT project_id,edition_address,absolute_supply_cap FROM edition WHERE chain_id=$1 AND edition_address=$2', [chainId, edition]);
    assert.equal(editionRow.rows[0].project_id, projectId); assert.equal(editionRow.rows[0].absolute_supply_cap, 10);
    const checkpoint = await pool.query('SELECT latest_block_number,finalized_block_number FROM indexer_checkpoint WHERE chain_id=$1', [chainId]);
    assert.equal(Number(checkpoint.rows[0].latest_block_number), 10); assert.equal(Number(checkpoint.rows[0].finalized_block_number), 10);
    t.after(async () => {});
  } finally {
    await pool.query('DELETE FROM edition WHERE chain_id=$1 AND edition_address=$2', [chainId, edition]);
    await pool.query('DELETE FROM goldsky_raw_log WHERE chain_id=$1 AND transaction_hash=$2', [chainId, tx]);
    await pool.query('DELETE FROM indexer_event WHERE chain_id=$1 AND tx_hash=$2', [chainId, tx]);
    await pool.query('DELETE FROM outbox_event WHERE business_key=$1', [`${chainId}:${tx}:0`]); await pool.query('DELETE FROM notification WHERE business_key=$1', [`${chainId}:${tx}:0`]); await pool.query('DELETE FROM indexer_checkpoint WHERE chain_id=$1 AND pipeline=$2', [chainId, 'goldsky-turbo']); await pool.query('DELETE FROM edition_request WHERE id=$1', [requestId]); await pool.query('DELETE FROM project WHERE id=$1', [projectId]); await pool.query('DELETE FROM account WHERE id=$1', [accountId]);
    await pool.end();
  }
});
