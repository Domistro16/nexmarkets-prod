import { Interface, getAddress } from 'ethers';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { JsonRpcClient } from '../../../packages/chain/src/rpc.mjs';

const ZERO = `0x${'00'.repeat(32)}`;
const KIND = ['TIME_BASED', 'QUANTITY_BASED', 'CONNECTED', 'REDEMPTION'];
const EVENT_FRAGMENTS = [
  'event EditionCreated(address indexed edition,bytes32 indexed editionId,address indexed publisher,bytes32 salt,address protocolAdmin,address mintController,uint32 absoluteSupplyCap,bytes32 artworkCommitment)',
  'event EditionRegistered(address indexed edition,bytes32 indexed editionId,address indexed publisher,uint32 absoluteSupplyCap)',
  'event EditionPublisherSet(address indexed edition,address indexed publisher)',
  'event EditionDisabledSet(address indexed edition,bool disabled)',
  'event TermsPublished(address indexed edition,bytes32 indexed termsVersionHash,uint64 indexed version,uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash)',
  'event PrimaryMintSettled(address indexed payer,address indexed recipient,address indexed edition,bytes32 termsVersionHash,bytes32 intentId,uint256 firstTokenId,uint256 quantity,uint256 totalPaid,uint256 protocolFee)',
  'event ReferralHintSubmitted(bytes32 indexed intentId,address indexed payer,address indexed edition,address referralHint)',
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)',
  'event EditionMinted(address indexed to,uint256 indexed firstTokenId,uint256 quantity,bytes32 indexed termsVersionHash,uint256 termsSupply,address royaltyReceiver,uint96 royaltyBps)',
  'event PassAdvantagesInitialized(address indexed edition,uint256 indexed tokenId,bytes32 indexed termsVersionHash,bytes32 advantagesHash,uint256 advantageCount)',
  'event PassListingStateSet(address indexed edition,uint256 indexed tokenId,bool listed)',
  'event AdvantageConsumed(address indexed edition,uint256 indexed tokenId,bytes32 indexed advantageId,address owner,bytes32 useId,uint256 amount,uint256 remainingUnits)',
  'event ListingCreated(bytes32 indexed orderHash,address indexed edition,uint256 indexed tokenId,address seller,bytes32 termsVersionHash,uint256 usdGPrice,address royaltyReceiver,uint96 royaltyBps,uint64 startTime,uint64 expiry,bytes32 zoneHash)',
  'event ListingCancelled(bytes32 indexed orderHash,address indexed caller)',
  'event ListingFilled(bytes32 indexed orderHash,address indexed buyer)',
  'event SecondarySaleSettled(bytes32 indexed orderHash,address indexed buyer,uint256 salePrice,uint256 protocolFee,uint256 builderRoyalty,uint256 sellerProceeds)',
  'event ListingExpired(bytes32 indexed orderHash)',
  'event ListingStale(bytes32 indexed orderHash,address indexed currentOwner)',
  'event RoyaltyRecorded(bytes32 indexed orderHash,address indexed edition,uint256 indexed tokenId,address builder,uint256 amount,uint64 releaseAt)',
  'event RoyaltyWithdrawn(bytes32 indexed orderHash,address indexed builder,uint256 amount)',
  'event ERC6551AccountCreated(address indexed account,address indexed implementation,bytes32 salt,uint256 chainId,address indexed tokenContract,uint256 indexed tokenId)',
  'event PassAccountCreated(address indexed edition,uint256 indexed tokenId,address indexed account)',
  'event OrderFulfilled(bytes32 indexed orderHash,address indexed offerer,address indexed zone,address recipient,(uint8 itemType,address token,uint256 identifier,uint256 amount)[] offer,(uint8 itemType,address token,uint256 identifier,uint256 amount,address recipient)[] consideration)'
];
const ABI = new Interface(EVENT_FRAGMENTS);
const TOPICS = new Map(EVENT_FRAGMENTS.map((fragment) => {
  const parsed = fragment.slice(6, fragment.indexOf('(')).trim();
  const event = ABI.getEvent(parsed);
  return [event.topicHash.toLowerCase(), event];
}));

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function idFor(prefix, value) { return `${prefix}_${sha256(value).slice(0, 24)}`; }
function lower(value) { return typeof value === 'string' && value.startsWith('0x') ? value.toLowerCase() : value; }
function plain(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => Number.isNaN(Number(key))).map(([key, item]) => [key, plain(item)]));
  return lower(value);
}
function argsFrom(parsed) { return Object.fromEntries(parsed.fragment.inputs.map((input, index) => [input.name, plain(parsed.args[index])])); }
function rowTopics(row) {
  if (Array.isArray(row.topics)) return row.topics;
  if (typeof row.topics === 'string') {
    try { return JSON.parse(row.topics); } catch { return []; }
  }
  return Object.values(row.topics ?? {});
}
function rawIdentity(row) { return `${row.chain_id}:${String(row.transaction_hash).toLowerCase()}:${row.log_index}`; }
function eventAddress(args, row) { return lower(args.edition ?? row.contract_address); }
function asDate(value) { return value instanceof Date ? value : new Date(value); }

export function decodeGoldskyLog(row) {
  const topic0 = String(row.topic0).toLowerCase();
  const event = TOPICS.get(topic0);
  if (!event) return { eventName: 'Unknown', eventSignature: topic0, args: {} };
  const parsed = ABI.parseLog({ topics: rowTopics(row), data: row.data });
  if (!parsed) return { eventName: 'Unknown', eventSignature: topic0, args: {} };
  return { eventName: parsed.name, eventSignature: topic0, args: argsFrom(parsed) };
}

export class PostgresProjectionWorker {
  constructor({ pool, connectionString = process.env.DATABASE_URL, rpc, rpcUrl = process.env.RH_MAINNET_RPC_URL, chainId = 4663, pipeline = 'goldsky-turbo', factoryAddress = process.env.NEX_PASS_FACTORY_ADDRESS, finalityDepth = 12, batchSize = 250, logger = console } = {}) {
    this.pool = pool ?? new pg.Pool({ connectionString, max: 4, application_name: 'nexmarkets-indexer' });
    this.ownsPool = !pool;
    this.rpc = rpc ?? new JsonRpcClient(rpcUrl);
    this.chainId = Number(chainId); this.pipeline = pipeline; this.factoryAddress = lower(factoryAddress); this.finalityDepth = finalityDepth; this.batchSize = batchSize; this.logger = logger;
  }

  async close() { if (this.ownsPool) await this.pool.end(); }

  async runOnce() {
    const head = await this.rpc.getBlockNumber();
    const finalityBlock = Math.max(0, head - this.finalityDepth);
    const headBlock = await this.rpc.getBlockByNumber(head);
    const { rows } = await this.pool.query(
      `SELECT r.* FROM goldsky_raw_log r
       LEFT JOIN indexer_event i ON i.chain_id=r.chain_id AND i.tx_hash=r.transaction_hash AND i.log_index=r.log_index
       WHERE r.chain_id=$1 AND (i.tx_hash IS NULL OR (r.removed=true AND i.orphaned_at IS NULL))
       ORDER BY r.block_number,r.log_index LIMIT $2`, [this.chainId, this.batchSize]
    );
    let processed = 0; let removed = 0;
    for (const row of rows) { await this.processRaw(row, finalityBlock); processed += 1; if (row.removed) removed += 1; }
    await this.finalize(finalityBlock);
    const latest = await this.pool.query('SELECT COALESCE(MAX(block_number),0) latest FROM indexer_event WHERE chain_id=$1 AND orphaned_at IS NULL', [this.chainId]);
    const latestBlock = Number(latest.rows[0].latest);
    await this.pool.query(
      `INSERT INTO indexer_checkpoint(pipeline,chain_id,latest_block_number,latest_block_hash,finalized_block_number,chain_head_block_number,chain_head_block_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(pipeline,chain_id) DO UPDATE SET latest_block_number=excluded.latest_block_number,latest_block_hash=excluded.latest_block_hash,finalized_block_number=excluded.finalized_block_number,chain_head_block_number=excluded.chain_head_block_number,chain_head_block_hash=excluded.chain_head_block_hash,updated_at=now()`,
      [this.pipeline, this.chainId, latestBlock, headBlock?.hash ?? ZERO, Math.min(latestBlock, finalityBlock), head, headBlock?.hash ?? ZERO]
    );
    return { head, finalityBlock, latestBlock, processed, removed };
  }

  async processRaw(row, finalityBlock) {
    const decoded = decodeGoldskyLog(row); const identity = rawIdentity(row); const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT block_hash FROM indexer_event WHERE chain_id=$1 AND tx_hash=$2 AND log_index=$3 FOR UPDATE', [row.chain_id, row.transaction_hash.toLowerCase(), row.log_index]);
      if (existing.rows[0] && existing.rows[0].block_hash !== row.block_hash) throw new Error(`EVENT_IDENTITY_COLLISION:${identity}`);
      if (row.removed) {
        await client.query('UPDATE indexer_event SET orphaned_at=COALESCE(orphaned_at,now()),finalized=false WHERE chain_id=$1 AND tx_hash=$2 AND log_index=$3', [row.chain_id, row.transaction_hash.toLowerCase(), row.log_index]);
        await this.orphanProjection(client, row);
      } else if (!existing.rows[0]) {
        await client.query(
          `INSERT INTO indexer_event(chain_id,block_number,block_hash,tx_hash,log_index,contract_address,event_signature,event_name,payload,block_timestamp,finalized)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
          [row.chain_id, row.block_number, row.block_hash, row.transaction_hash.toLowerCase(), row.log_index, row.contract_address.toLowerCase(), decoded.eventSignature, decoded.eventName, JSON.stringify(decoded.args), asDate(row.block_timestamp), Number(row.block_number) <= finalityBlock]
        );
        await this.applyProjection(client, row, decoded);
        await this.enqueueProjectionNotification(client, row, decoded);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async orphanProjection(client, row) {
    const params = [row.chain_id, row.transaction_hash.toLowerCase(), row.log_index];
    for (const table of ['edition','terms_version','pass_token_projection','advantage_state_projection','listing_projection','listing_event','royalty_claim_projection']) {
      const txColumn = table === 'listing_event' ? 'tx_hash' : 'source_tx_hash';
      const logColumn = table === 'listing_event' ? 'log_index' : table === 'pass_token_projection' ? 'latest_log_index' : 'source_log_index';
      await client.query(`UPDATE ${table} SET orphaned_at=COALESCE(orphaned_at,now()),finalized=false WHERE ${table === 'pass_token_projection' ? 'latest_tx_hash' : txColumn}=$2 AND ${logColumn}=$3`, params);
    }
  }

  async applyProjection(client, row, decoded) {
    const a = decoded.args; const source = [row.block_number, row.block_hash, row.transaction_hash.toLowerCase(), row.log_index];
    if (decoded.eventName === 'EditionCreated') {
      const request = await client.query('SELECT * FROM edition_request WHERE chain_id=$1 AND edition_id_hash=$2', [row.chain_id, lower(a.editionId)]);
      if (!request.rows[0]) return;
      const editionId = idFor('ed', `${row.chain_id}:${lower(a.edition)}`);
      await client.query(
        `INSERT INTO edition(id,project_id,chain_id,edition_address,edition_id_hash,factory_address,publisher_address,absolute_supply_cap,artwork_commitment,source_block_number,source_block_hash,source_tx_hash,source_log_index,finalized)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false)
         ON CONFLICT(chain_id,edition_address) DO UPDATE SET publisher_address=excluded.publisher_address,absolute_supply_cap=excluded.absolute_supply_cap,artwork_commitment=excluded.artwork_commitment,orphaned_at=NULL`,
        [editionId, request.rows[0].project_id, row.chain_id, lower(a.edition), lower(a.editionId), lower(this.factoryAddress ?? row.contract_address), lower(a.publisher), a.absoluteSupplyCap, lower(a.artworkCommitment), ...source]
      );
      await client.query(`UPDATE edition_request SET predicted_edition_address=$1,safe_status=CASE WHEN safe_status IN ('CONFIRMED','FINALIZED') THEN safe_status ELSE 'SUBMITTED' END,tx_hash=$2,source_block_number=$3,source_block_hash=$4,source_log_index=$5,updated_at=now() WHERE id=$6`, [lower(a.edition), row.transaction_hash.toLowerCase(), ...source.slice(0, 2), source[3], request.rows[0].id]);
      return;
    }
    const editionAddress = eventAddress(a, row); const edition = await client.query('SELECT id,project_id FROM edition WHERE chain_id=$1 AND edition_address=$2 AND orphaned_at IS NULL', [row.chain_id, editionAddress]);
    if (!edition.rows[0] && decoded.eventName !== 'EditionRegistered') return;
    const editionId = edition.rows[0]?.id;
    switch (decoded.eventName) {
      case 'EditionRegistered':
      case 'EditionPublisherSet':
      case 'EditionDisabledSet':
        if (editionId) await client.query('UPDATE edition SET publisher_address=COALESCE($1,publisher_address),disabled=COALESCE($2,disabled),source_block_number=$3,source_block_hash=$4,source_tx_hash=$5,source_log_index=$6 WHERE id=$7', [a.publisher ? lower(a.publisher) : null, a.disabled ?? null, ...source, editionId]);
        break;
      case 'TermsPublished': {
        const termId = idFor('terms', `${row.chain_id}:${editionAddress}:${lower(a.termsVersionHash)}`);
        await client.query(
          `INSERT INTO terms_version(id,edition_id,version,terms_hash,active_supply,price_usdg,preview_starts_at,mint_starts_at,mint_ends_at,primary_recipient,royalty_receiver,royalty_bps,advantages_hash,referral_terms_hash,source_block_number,source_block_hash,source_tx_hash,source_log_index,finalized)
           VALUES($1,$2,$3,$4,$5,$6,to_timestamp($7),to_timestamp($8),to_timestamp($9),$10,$11,$12,$13,$14,$15,$16,$17,$18,false)
           ON CONFLICT(edition_id,terms_hash) DO UPDATE SET version=excluded.version,active_supply=excluded.active_supply,price_usdg=excluded.price_usdg,orphaned_at=NULL`,
          [termId, editionId, a.version, lower(a.termsVersionHash), a.activeSupply, a.pricePerPass, a.previewStartsAt, a.mintStartsAt, a.mintEndsAt, lower(a.primaryRecipient), lower(a.royaltyReceiver), a.royaltyBps, lower(a.advantagesHash), lower(a.referralTermsHash), ...source]
        );
        const commitment = await client.query('SELECT * FROM terms_advantage_commitment WHERE advantages_hash=$1', [lower(a.advantagesHash)]);
        if (commitment.rows[0]) {
          const configs = commitment.rows[0].configs ?? [];
          for (const config of configs) await client.query(
            `INSERT INTO advantage_definition(id,edition_id,terms_hash,advantage_id_hash,kind,starts_at,ends_at,total_units,definition_hash,definition)
             VALUES($1,$2,$3,$4,$5,to_timestamp($6),to_timestamp($7),$8,$9,$10::jsonb) ON CONFLICT(edition_id,terms_hash,advantage_id_hash) DO NOTHING`,
            [idFor('adv', `${editionId}:${lower(a.termsVersionHash)}:${lower(config.advantageId)}`), editionId, lower(a.termsVersionHash), lower(config.advantageId), KIND[Number(config.kind)] ?? config.kind, config.startsAt, config.endsAt, config.totalUnits ?? 0, lower(config.definitionHash), JSON.stringify(config)]
          );
        }
        await client.query('UPDATE terms_advantage_commitment SET status=\'PUBLISHED\',terms_hash=$1,updated_at=now() WHERE advantages_hash=$2', [lower(a.termsVersionHash), lower(a.advantagesHash)]);
        await client.query('UPDATE project SET status=\'PUBLISHED\',published_at=COALESCE(published_at,now()),updated_at=now() WHERE id=$1', [edition.rows[0].project_id]);
        break;
      }
      case 'Transfer': {
        const tokenId = String(a.tokenId); const existing = await client.query('SELECT terms_hash FROM pass_token_projection WHERE edition_id=$1 AND token_id=$2', [editionId, tokenId]);
        await client.query(
          `INSERT INTO pass_token_projection(edition_id,token_id,owner_address,terms_hash,minted_block_number,latest_block_number,latest_block_hash,latest_tx_hash,latest_log_index,finalized)
           VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,false) ON CONFLICT(edition_id,token_id) DO UPDATE SET owner_address=excluded.owner_address,latest_block_number=excluded.latest_block_number,latest_block_hash=excluded.latest_block_hash,latest_tx_hash=excluded.latest_tx_hash,latest_log_index=excluded.latest_log_index,orphaned_at=NULL`,
          [editionId, tokenId, lower(a.to), existing.rows[0]?.terms_hash ?? ZERO, ...source]
        );
        break;
      }
      case 'EditionMinted': {
        const quantity = BigInt(a.quantity); const first = BigInt(a.firstTokenId);
        for (let offset = 0n; offset < quantity; offset += 1n) await client.query('UPDATE pass_token_projection SET terms_hash=$1,owner_address=$2,latest_block_number=$3,latest_block_hash=$4,latest_tx_hash=$5,latest_log_index=$6 WHERE edition_id=$7 AND token_id=$8', [lower(a.termsVersionHash), lower(a.to), ...source, editionId, String(first + offset)]);
        break;
      }
      case 'PassAdvantagesInitialized': {
        const commitment = await client.query('SELECT configs FROM terms_advantage_commitment WHERE advantages_hash=$1', [lower(a.advantagesHash)]);
        for (const config of commitment.rows[0]?.configs ?? []) await client.query(
          `INSERT INTO advantage_state_projection(edition_id,token_id,advantage_id_hash,remaining_units,source_block_number,source_block_hash,source_tx_hash,source_log_index,finalized)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,false) ON CONFLICT(edition_id,token_id,advantage_id_hash) DO UPDATE SET remaining_units=excluded.remaining_units,orphaned_at=NULL`,
          [editionId, String(a.tokenId), lower(config.advantageId), config.totalUnits ?? 0, ...source]
        );
        break;
      }
      case 'AdvantageConsumed':
        await client.query('UPDATE advantage_state_projection SET remaining_units=$1,source_block_number=$2,source_block_hash=$3,source_tx_hash=$4,source_log_index=$5,orphaned_at=NULL WHERE edition_id=$6 AND token_id=$7 AND advantage_id_hash=$8', [a.remainingUnits, ...source, editionId, String(a.tokenId), lower(a.advantageId)]);
        break;
      case 'PassListingStateSet':
        await client.query('UPDATE advantage_state_projection SET listed=$1,source_block_number=$2,source_block_hash=$3,source_tx_hash=$4,source_log_index=$5,orphaned_at=NULL WHERE edition_id=$6 AND token_id=$7', [a.listed, ...source, editionId, String(a.tokenId)]);
        break;
      case 'ListingCreated':
        await client.query(
          `INSERT INTO listing_projection(order_hash,edition_id,token_id,seller_address,terms_hash,price_usdg,protocol_fee_usdg,royalty_usdg,seller_proceeds_usdg,zone_hash,starts_at,expires_at,status,source_block_number,source_block_hash,source_tx_hash,source_log_index,finalized)
           VALUES($1,$2,$3,$4,$5,$6,$6/100,$6*$7/10000,$6-$6/100-($6*$7/10000),$8,to_timestamp($9),to_timestamp($10),'ACTIVE',$11,$12,$13,$14,false)
           ON CONFLICT(order_hash) DO UPDATE SET status='ACTIVE',orphaned_at=NULL`,
          [lower(a.orderHash), editionId, String(a.tokenId), lower(a.seller), lower(a.termsVersionHash), a.usdGPrice, Number(a.royaltyBps), lower(a.zoneHash), a.startTime, a.expiry, ...source]
        );
        await client.query(
          `INSERT INTO listing_event(id,order_hash,event_type,payload,chain_id,block_number,block_hash,tx_hash,log_index,finalized)
           VALUES($1,$2,'CREATED',$3::jsonb,$4,$5,$6,$7,$8,false) ON CONFLICT(chain_id,tx_hash,log_index) DO NOTHING`,
          [idFor('le', `${row.chain_id}:${row.transaction_hash}:${row.log_index}`), lower(a.orderHash), JSON.stringify(a), row.chain_id, ...source]
        );
        break;
      case 'ListingCancelled': case 'ListingFilled': case 'ListingExpired': case 'ListingStale':
        await client.query('UPDATE listing_projection SET status=$1,source_block_number=$2,source_block_hash=$3,source_tx_hash=$4,source_log_index=$5,orphaned_at=NULL WHERE order_hash=$6', [decoded.eventName.replace('Listing', '').toUpperCase(), ...source, lower(a.orderHash)]);
        await client.query(
          `INSERT INTO listing_event(id,order_hash,event_type,payload,chain_id,block_number,block_hash,tx_hash,log_index,finalized)
           VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,false) ON CONFLICT(chain_id,tx_hash,log_index) DO NOTHING`,
          [idFor('le', `${row.chain_id}:${row.transaction_hash}:${row.log_index}`), lower(a.orderHash), decoded.eventName.replace('Listing', '').toUpperCase(), JSON.stringify(a), row.chain_id, ...source]
        );
        break;
      case 'RoyaltyRecorded':
        await client.query(
          `INSERT INTO royalty_claim_projection(order_hash,edition_id,token_id,builder_address,amount_usdg,release_at,source_block_number,source_block_hash,source_tx_hash,source_log_index,finalized)
           VALUES($1,$2,$3,$4,$5,to_timestamp($6),$7,$8,$9,$10,false) ON CONFLICT(order_hash) DO UPDATE SET amount_usdg=excluded.amount_usdg,release_at=excluded.release_at,orphaned_at=NULL`,
          [lower(a.orderHash), editionId, String(a.tokenId), lower(a.builder), a.amount, a.releaseAt, ...source]
        );
        break;
      case 'RoyaltyWithdrawn':
        await client.query('UPDATE royalty_claim_projection SET withdrawn=true,withdrawn_tx_hash=$1,source_block_number=$2,source_block_hash=$3,source_tx_hash=$4,source_log_index=$5,orphaned_at=NULL WHERE order_hash=$6', [row.transaction_hash.toLowerCase(), ...source, lower(a.orderHash)]);
        break;
      case 'ERC6551AccountCreated':
      case 'PassAccountCreated':
        if (editionId) await client.query('UPDATE pass_token_projection SET token_bound_account=$1,latest_block_number=$2,latest_block_hash=$3,latest_tx_hash=$4,latest_log_index=$5 WHERE edition_id=$6 AND token_id=$7', [lower(a.account), ...source, editionId, String(a.tokenId)]);
        break;
      case 'ReferralHintSubmitted':
        break;
      default: break;
    }
  }

  async enqueueProjectionNotification(client, row, decoded) {
    const eventType = decoded.eventName === 'TermsPublished' ? 'PREVIEW_SCHEDULED'
      : decoded.eventName === 'EditionMinted' || decoded.eventName === 'PrimaryMintSettled' ? 'MINT_CONFIRMED'
        : decoded.eventName === 'AdvantageConsumed' ? 'ADVANTAGE_USED'
          : decoded.eventName === 'RoyaltyRecorded' ? 'ROYALTY_LOCKED'
            : decoded.eventName === 'RoyaltyWithdrawn' ? 'ROYALTY_WITHDRAWN'
              : ['ListingCancelled', 'ListingExpired', 'ListingStale', 'ListingFilled'].includes(decoded.eventName) ? 'LISTING_STATUS_CHANGED' : null;
    if (!eventType) return;
    const businessKey = `${this.chainId}:${row.transaction_hash.toLowerCase()}:${row.log_index}`;
    const notificationId = idFor('not', `${eventType}:${businessKey}`); const outboxId = idFor('out', `${eventType}:${businessKey}`);
    const payload = { chainId: this.chainId, blockNumber: row.block_number, txHash: row.transaction_hash.toLowerCase(), logIndex: row.log_index, eventName: decoded.eventName, args: decoded.args };
    await client.query(`INSERT INTO notification(id,account_id,type,business_key,payload) VALUES($1,NULL,$2,$3,$4::jsonb) ON CONFLICT(type,business_key,account_id) DO NOTHING`, [notificationId, eventType, businessKey, JSON.stringify(payload)]);
    await client.query(`INSERT INTO outbox_event(id,aggregate_type,aggregate_id,event_type,business_key,payload) VALUES($1,'CHAIN_EVENT',$2,$3,$4,$5::jsonb) ON CONFLICT(event_type,business_key) DO NOTHING`, [outboxId, businessKey, eventType, businessKey, JSON.stringify(payload)]);
  }

  async finalize(finalityBlock) {
    await this.pool.query('UPDATE indexer_event SET finalized=true WHERE chain_id=$1 AND block_number<=$2 AND orphaned_at IS NULL', [this.chainId, finalityBlock]);
    for (const table of ['edition','terms_version','pass_token_projection','advantage_state_projection','listing_projection','royalty_claim_projection']) {
      const blockColumn = table === 'pass_token_projection' ? 'latest_block_number' : 'source_block_number';
      await this.pool.query(`UPDATE ${table} SET finalized=true WHERE ${blockColumn}<=$1 AND orphaned_at IS NULL`, [finalityBlock]);
    }
    await this.pool.query('UPDATE listing_event SET finalized=true WHERE block_number<=$1 AND orphaned_at IS NULL', [finalityBlock]);
  }
}

export async function runIndexerOnce(options = {}) {
  const worker = new PostgresProjectionWorker(options);
  try { return await worker.runOnce(); } finally { await worker.close(); }
}
