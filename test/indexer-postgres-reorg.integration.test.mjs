import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Interface } from 'ethers';
import { PostgresProjectionWorker } from '../services/indexer/src/runtime.mjs';

const addr = (n) => `0x${String(n).padStart(40, '0')}`;
const FIXTURE_LOCK_KEY = 466300001;
const fixtureNonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
const hash = (n) => {
  const seed = [...`${n}:${fixtureNonce}`].map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('') || '00';
  return `0x${seed.repeat(Math.ceil(64 / seed.length)).slice(0, 64)}`;
};
const EVENTS = new Interface([
  'event TermsPublished(address indexed edition,bytes32 indexed termsVersionHash,uint64 indexed version,uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash)',
  'event EditionMinted(address indexed to,uint256 indexed firstTokenId,uint256 quantity,bytes32 indexed termsVersionHash,uint256 termsSupply,address royaltyReceiver,uint96 royaltyBps)',
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)',
  'event PassAdvantagesInitialized(address indexed edition,uint256 indexed tokenId,bytes32 indexed termsVersionHash,bytes32 advantagesHash,uint256 advantageCount)',
  'event AdvantageConsumed(address indexed edition,uint256 indexed tokenId,bytes32 indexed advantageId,address owner,bytes32 useId,uint256 amount,uint256 remainingUnits)',
  'event ListingCreated(bytes32 indexed orderHash,address indexed edition,uint256 indexed tokenId,address seller,bytes32 termsVersionHash,uint256 usdGPrice,address royaltyReceiver,uint96 royaltyBps,uint64 startTime,uint64 expiry,bytes32 zoneHash)',
  'event ListingFilled(bytes32 indexed orderHash,address indexed buyer)',
  'event RoyaltyRecorded(bytes32 indexed orderHash,address indexed edition,uint256 indexed tokenId,address builder,uint256 amount,uint64 releaseAt)',
  'event RoyaltyWithdrawn(bytes32 indexed orderHash,address indexed builder,uint256 amount)',
  'event ERC6551AccountCreated(address indexed account,address indexed implementation,bytes32 salt,uint256 chainId,address indexed tokenContract,uint256 indexed tokenId)',
  'event OrderFulfilled(bytes32 indexed orderHash,address indexed offerer,address indexed zone,address recipient,(uint8 itemType,address token,uint256 identifier,uint256 amount)[] offer,(uint8 itemType,address token,uint256 identifier,uint256 amount,address recipient)[] consideration)'
]);

test('Postgres projector routes context-free events and restores canonical state after reorgs', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); const lockClient = await pool.connect(); const chainId = 46630; const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const account = `acct_reorg_${suffix}`; const project = `prj_reorg_${suffix}`; const editionId = `ed_reorg_${suffix}`; const edition = addr(101); const factory = addr(102); const genesisTx = hash('0');
  const advantageId = hash('a'); const termsHash = hash('b'); const termsHash2 = hash('b2'); const advantagesHash = hash('c'); const advantagesHash2 = hash('c2'); const referralHash = hash('d'); const referralHash2 = hash('d2'); const orderHash = hash('e'); const orderHash2 = hash('q'); const orderHash3 = hash('r');
  const configs = [{ advantageId, kind: 1, startsAt: 1, endsAt: 9999999999, totalUnits: 5, definitionHash: hash('f') }];
  const pipeline = `goldsky-reorg-${suffix}`;
  const raw = [];
  const add = (name, args, contract, block, tx, logIndex = 0, removed = false, blockHash = hash(String(block))) => {
    const encoded = EVENTS.encodeEventLog(EVENTS.getEvent(name), args); raw.push({ chainId, block, blockHash, tx, logIndex, contract, topic0: encoded.topics[0], topics: encoded.topics, data: encoded.data, removed });
  };
  add('TermsPublished', [edition, termsHash, 1, 10, 101, 1, 2, 999999, addr(2), addr(3), 500, advantagesHash, referralHash], edition, 2, hash('1'));
  add('TermsPublished', [edition, termsHash2, 2, 10, 202, 1, 2, 999999, addr(2), addr(3), 300, advantagesHash2, referralHash2], edition, 2, hash('terms2'), 1);
  add('EditionMinted', [addr(11), 1, 1, termsHash, 10, addr(3), 500], edition, 3, hash('mint1'));
  add('EditionMinted', [addr(11), 2, 1, termsHash2, 10, addr(3), 300], edition, 3, hash('mint2'), 1);
  add('Transfer', [addr(0), addr(11), 1], edition, 3, hash('2'));
  add('Transfer', [addr(11), addr(12), 1], edition, 4, hash('3'));
  add('Transfer', [addr(12), addr(13), 1], edition, 5, hash('4'));
  add('PassAdvantagesInitialized', [edition, 1, termsHash, advantagesHash, 1], edition, 6, hash('5'));
  add('AdvantageConsumed', [edition, 1, advantageId, addr(13), hash('6'), 2, 3], edition, 7, hash('6'));
  add('ListingCreated', [orderHash, edition, 1, addr(13), termsHash, 101, addr(3), 500, 10, 1000, hash('7')], addr(104), 8, hash('7'));
  add('ListingCreated', [orderHash2, edition, 2, addr(13), termsHash, 199, addr(3), 333, 10, 1000, hash('q')], addr(104), 8, hash('q'), 1);
  add('ListingCreated', [orderHash3, edition, 3, addr(13), termsHash, 10001, addr(3), 333, 10, 1000, hash('r')], addr(104), 8, hash('r'), 2);
  add('ListingFilled', [orderHash, addr(14)], addr(104), 9, hash('8'));
  add('RoyaltyRecorded', [orderHash, edition, 1, addr(3), 5, 1000], addr(105), 10, hash('9'));
  add('RoyaltyWithdrawn', [orderHash, addr(3), 5], addr(105), 11, hash('g'));
  add('ERC6551AccountCreated', [addr(106), addr(107), hash('h'), chainId, edition, 1], addr(108), 12, hash('i'));
  add('OrderFulfilled', [orderHash, addr(13), addr(109), addr(14), [{ itemType: 2, token: edition, identifier: 1, amount: 1 }], [{ itemType: 1, token: addr(110), identifier: 0, amount: 101, recipient: addr(14) }]], addr(109), 13, hash('j'));
  try {
    await lockClient.query('SELECT pg_advisory_lock($1::bigint)', [FIXTURE_LOCK_KEY]);
    await pool.query('INSERT INTO account(id) VALUES($1)', [account]);
    await pool.query('INSERT INTO project(id,builder_account_id,slug,name) VALUES($1,$2,$3,$4)', [project, account, `reorg-${suffix}`, 'Reorg']);
    await pool.query(`INSERT INTO edition(id,project_id,chain_id,edition_address,edition_id_hash,factory_address,publisher_address,absolute_supply_cap,artwork_commitment,source_block_number,source_block_hash,source_tx_hash,source_log_index) VALUES($1,$2,$3,$4,$5,$6,$7,10,$8,1,$9,$10,0)`, [editionId, project, chainId, edition, hash('k'), factory, addr(2), hash('l'), hash('m'), genesisTx]);
    await pool.query('INSERT INTO terms_advantage_commitment(advantages_hash,builder_account_id,edition_address,terms_payload,configs) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)', [advantagesHash, account, edition, '{}', JSON.stringify(configs)]);
    await pool.query('INSERT INTO terms_advantage_commitment(advantages_hash,builder_account_id,edition_address,terms_payload,configs) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)', [advantagesHash2, account, edition, '{}', '[]']);
    for (const item of raw) await pool.query(`INSERT INTO goldsky_raw_log(chain_id,block_number,block_hash,transaction_hash,log_index,contract_address,topic0,topics,data,block_timestamp,removed) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,now(),$10)`, [item.chainId, item.block, item.blockHash, item.tx, item.logIndex, item.contract, item.topic0, JSON.stringify(item.topics), item.data, item.removed]);
    const worker = new PostgresProjectionWorker({ pool, chainId, pipeline, rpc: { async getBlockNumber() { return 100; }, async getBlockByNumber(number) { return { hash: hash(String(number)) }; } }, finalityDepth: 2, batchSize: 100 });
    await worker.runOnce();
    assert.equal((await pool.query('SELECT owner_address FROM pass_token_projection WHERE edition_id=$1 AND token_id=1', [editionId])).rows[0].owner_address, addr(13));
    assert.equal((await pool.query('SELECT terms_hash FROM pass_token_projection WHERE edition_id=$1 AND token_id=1', [editionId])).rows[0].terms_hash, termsHash);
    assert.equal((await pool.query('SELECT terms_hash FROM pass_token_projection WHERE edition_id=$1 AND token_id=2', [editionId])).rows[0].terms_hash, termsHash2);
    const settlement = (await pool.query('SELECT status,protocol_fee_usdg,royalty_usdg,seller_proceeds_usdg FROM listing_projection WHERE order_hash=$1', [orderHash])).rows[0]; assert.equal(settlement.status, 'FILLED'); assert.equal(String(settlement.protocol_fee_usdg), '1'); assert.equal(String(settlement.royalty_usdg), '5'); assert.equal(String(settlement.seller_proceeds_usdg), '95');
    const settlement2 = (await pool.query('SELECT protocol_fee_usdg,royalty_usdg,seller_proceeds_usdg FROM listing_projection WHERE order_hash=$1', [orderHash2])).rows[0]; assert.equal(String(settlement2.protocol_fee_usdg), '1'); assert.equal(String(settlement2.royalty_usdg), '6'); assert.equal(String(settlement2.seller_proceeds_usdg), '192');
    const settlement3 = (await pool.query('SELECT protocol_fee_usdg,royalty_usdg,seller_proceeds_usdg FROM listing_projection WHERE order_hash=$1', [orderHash3])).rows[0]; assert.equal(String(settlement3.protocol_fee_usdg), '100'); assert.equal(String(settlement3.royalty_usdg), '333'); assert.equal(String(settlement3.seller_proceeds_usdg), '9568');
    assert.equal((await pool.query('SELECT withdrawn FROM royalty_claim_projection WHERE order_hash=$1', [orderHash])).rows[0].withdrawn, true);
    assert.equal((await pool.query('SELECT token_bound_account FROM pass_token_projection WHERE edition_id=$1 AND token_id=1', [editionId])).rows[0].token_bound_account, addr(106));
    assert.ok((await pool.query('SELECT 1 FROM seaport_fulfillment_projection WHERE order_hash=$1 AND orphaned_at IS NULL', [orderHash])).rows[0]);
    assert.equal(String((await pool.query('SELECT remaining_units FROM advantage_state_projection WHERE edition_id=$1 AND token_id=1 AND advantage_id_hash=$2', [editionId, advantageId])).rows[0].remaining_units), '3');
    await pool.query('UPDATE goldsky_raw_log SET removed=true WHERE chain_id=$1 AND transaction_hash IN ($2,$3,$4,$5,$6,$7)', [chainId, hash('4'), hash('6'), hash('8'), hash('g'), hash('i'), hash('j')]);
    await worker.runOnce();
    assert.equal((await pool.query('SELECT owner_address FROM pass_token_projection WHERE edition_id=$1 AND token_id=1', [editionId])).rows[0].owner_address, addr(12));
    assert.equal((await pool.query('SELECT terms_hash FROM pass_token_projection WHERE edition_id=$1 AND token_id=1', [editionId])).rows[0].terms_hash, termsHash);
    assert.equal((await pool.query('SELECT terms_hash FROM pass_token_projection WHERE edition_id=$1 AND token_id=2', [editionId])).rows[0].terms_hash, termsHash2);
    assert.equal((await pool.query('SELECT status FROM listing_projection WHERE order_hash=$1', [orderHash])).rows[0].status, 'ACTIVE');
    assert.equal((await pool.query('SELECT withdrawn FROM royalty_claim_projection WHERE order_hash=$1', [orderHash])).rows[0].withdrawn, false);
    assert.equal((await pool.query('SELECT token_bound_account FROM pass_token_projection WHERE edition_id=$1 AND token_id=1', [editionId])).rows[0].token_bound_account, null);
    assert.equal(String((await pool.query('SELECT remaining_units FROM advantage_state_projection WHERE edition_id=$1 AND token_id=1 AND advantage_id_hash=$2', [editionId, advantageId])).rows[0].remaining_units), '5');
    assert.equal((await pool.query('SELECT status FROM project WHERE id=$1', [project])).rows[0].status, 'PUBLISHED');
    assert.equal((await pool.query('SELECT 1 FROM seaport_fulfillment_projection WHERE order_hash=$1 AND orphaned_at IS NULL', [orderHash])).rowCount, 0);
    await pool.query('UPDATE goldsky_raw_log SET removed=false,block_hash=$3 WHERE chain_id=$1 AND transaction_hash=$2', [chainId, hash('4'), hash('z')]);
    await worker.runOnce();
    assert.equal((await pool.query('SELECT owner_address FROM pass_token_projection WHERE edition_id=$1 AND token_id=1', [editionId])).rows[0].owner_address, addr(13));
    await pool.query('UPDATE goldsky_raw_log SET removed=true WHERE chain_id=$1 AND transaction_hash IN ($2,$3)', [chainId, hash('1'), hash('terms2')]);
    await worker.runOnce();
    assert.equal((await pool.query('SELECT status FROM project WHERE id=$1', [project])).rows[0].status, 'DRAFT');
    assert.equal((await pool.query('SELECT orphaned_at FROM terms_version WHERE edition_id=$1', [editionId])).rows[0].orphaned_at !== null, true);
  } finally {
    const txHashes = [...new Set(raw.map((item) => item.tx))];
    const orderHashes = [orderHash, orderHash2, orderHash3];
    const eventKeys = raw.map((item) => `${chainId}:${item.tx}:${item.logIndex}`);
    await pool.query('DELETE FROM seaport_fulfillment_projection WHERE order_hash=ANY($1::text[])', [orderHashes]);
    await pool.query('DELETE FROM listing_event WHERE order_hash=ANY($1::text[])', [orderHashes]);
    await pool.query('DELETE FROM royalty_claim_projection WHERE edition_id=$1', [editionId]); await pool.query('DELETE FROM listing_projection WHERE edition_id=$1', [editionId]); await pool.query('DELETE FROM advantage_state_projection WHERE edition_id=$1', [editionId]); await pool.query('DELETE FROM advantage_definition WHERE edition_id=$1', [editionId]); await pool.query('DELETE FROM pass_token_projection WHERE edition_id=$1', [editionId]); await pool.query('DELETE FROM terms_version WHERE edition_id=$1', [editionId]);
    await pool.query('DELETE FROM notification WHERE business_key=ANY($1::text[])', [eventKeys]); await pool.query('DELETE FROM outbox_event WHERE business_key=ANY($1::text[])', [eventKeys]); await pool.query('DELETE FROM edition WHERE id=$1', [editionId]); await pool.query('DELETE FROM indexer_event WHERE chain_id=$1 AND tx_hash=ANY($2::text[])', [chainId, txHashes]); await pool.query('DELETE FROM goldsky_raw_log WHERE chain_id=$1 AND transaction_hash=ANY($2::text[])', [chainId, txHashes]); await pool.query('DELETE FROM indexer_checkpoint WHERE chain_id=$1 AND pipeline=$2', [chainId, pipeline]); await pool.query('DELETE FROM terms_advantage_commitment WHERE advantages_hash=ANY($1::text[])', [[advantagesHash, advantagesHash2]]); await pool.query('DELETE FROM project WHERE id=$1', [project]); await pool.query('DELETE FROM account WHERE id=$1', [account]); await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [FIXTURE_LOCK_KEY]); lockClient.release(); await pool.end();
  }
});
