import pg from 'pg';
import { randomUUID } from 'node:crypto';

const lower = (value) => typeof value === 'string' ? value.toLowerCase() : value;
const epoch = (value) => value == null ? null : Math.floor(new Date(value).getTime() / 1000);

function projectedRemaining(row, now = Math.floor(Date.now() / 1000)) {
  const kind = String(row.kind ?? '').toUpperCase();
  const starts = epoch(row.starts_at) ?? 0;
  const ends = epoch(row.ends_at) ?? 0;
  let effective = Math.max(0, now - Number(row.frozen_seconds ?? 0));
  if (kind === 'TIME_BASED' && row.listed && row.listed_at) {
    const listedTimestamp = (epoch(row.listed_at) ?? 0) - Number(row.frozen_seconds ?? 0);
    if (listedTimestamp < ends) effective = effective < Math.max(listedTimestamp, starts) ? effective : Math.max(listedTimestamp, starts);
  }
  if (effective < starts || effective >= ends) return '0';
  if (kind === 'TIME_BASED') return String(ends - effective);
  if (kind === 'CONNECTED') return '1';
  return String(row.remaining_units ?? 0);
}

export class PostgresReconciliationStore {
  constructor({ pool, connectionString = process.env.DATABASE_URL, chainId = 4663 } = {}) { this.pool = pool ?? new pg.Pool({ connectionString, max: 4, application_name: 'nexmarkets-reconciler' }); this.ownsPool = !pool; this.chainId = Number(chainId); }
  async close() { if (this.ownsPool) await this.pool.end(); }
  async startRun(scope) { const id = `rec_${randomUUID()}`; const { rows } = await this.pool.query('INSERT INTO reconciliation_run(id,chain_id,scope,status) VALUES($1,$2,$3,\'RUNNING\') RETURNING id', [id, this.chainId, JSON.stringify(scope)]); return rows[0]; }
  async recordIncident(incident) { await this.pool.query(`INSERT INTO reconciliation_incident(id,run_id,authority,object_key,severity,expected,observed,status,repair_action) VALUES($1,$2,$3,$4,'HIGH',$5::jsonb,$6::jsonb,'OPEN',$7)`, [`inc_${randomUUID()}`, incident.runId, incident.authority ?? 'CHAIN', `${incident.objectKey}:${incident.check}`, JSON.stringify(incident.expected ?? null), JSON.stringify(incident.observed ?? null), incident.repairAction ?? 'REPORT_ONLY']); }
  async finishRun(id, status, result) { await this.pool.query('UPDATE reconciliation_run SET status=$2,checked_count=$3,discrepancy_count=$4,evidence=$5::jsonb,finished_at=now() WHERE id=$1', [id, status, result.checkedCount, result.discrepancies.length, JSON.stringify(result)]); }

  async items(scope = 'ALL') {
    const requested = String(typeof scope === 'string' ? scope : scope?.scope ?? 'ALL').toUpperCase();
    const include = (name) => requested === 'ALL' || requested === name || (requested === 'PASS' && ['PASS', 'ADVANTAGE', 'TBA'].includes(name));
    const { rows: editions } = await this.pool.query(
      `SELECT e.*,t.terms_hash active_terms_hash,t.active_supply,t.price_usdg,t.preview_starts_at,t.mint_starts_at,t.mint_ends_at,t.primary_recipient,t.royalty_receiver,t.royalty_bps,t.advantages_hash,t.referral_terms_hash
       FROM edition e LEFT JOIN LATERAL (SELECT * FROM terms_version x WHERE x.edition_id=e.id AND x.orphaned_at IS NULL ORDER BY x.version DESC LIMIT 1) t ON true
       WHERE e.chain_id=$1 AND e.orphaned_at IS NULL ORDER BY e.edition_address`, [this.chainId]
    );
    const { rows: passRows } = await this.pool.query(
      `SELECT pt.*,e.edition_address,e.chain_id FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id
       WHERE e.chain_id=$1 AND pt.orphaned_at IS NULL ORDER BY e.edition_address,pt.token_id`, [this.chainId]
    );
    const { rows: advantageRows } = await this.pool.query(
      `SELECT a.*,d.kind,d.starts_at,d.ends_at,d.total_units,d.definition_hash,e.edition_address,pt.terms_hash
       FROM advantage_state_projection a JOIN edition e ON e.id=a.edition_id JOIN pass_token_projection pt ON pt.edition_id=a.edition_id AND pt.token_id=a.token_id
       LEFT JOIN advantage_definition d ON d.edition_id=a.edition_id AND d.advantage_id_hash=a.advantage_id_hash AND d.terms_hash=pt.terms_hash
       WHERE e.chain_id=$1 AND a.orphaned_at IS NULL AND pt.orphaned_at IS NULL ORDER BY e.edition_address,a.token_id,a.advantage_id_hash`, [this.chainId]
    );
    const { rows: listingRows } = await this.pool.query(
      `SELECT l.*,e.edition_address,lt.royalty_receiver listing_royalty_receiver,lt.royalty_bps listing_royalty_bps
       FROM listing_projection l JOIN edition e ON e.id=l.edition_id
       LEFT JOIN terms_version lt ON lt.edition_id=l.edition_id AND lt.terms_hash=l.terms_hash AND lt.orphaned_at IS NULL
       WHERE e.chain_id=$1 AND l.orphaned_at IS NULL ORDER BY l.order_hash`, [this.chainId]
    );
    const { rows: royaltyRows } = await this.pool.query(
      `SELECT r.*,e.edition_address FROM royalty_claim_projection r JOIN edition e ON e.id=r.edition_id
       WHERE e.chain_id=$1 AND r.orphaned_at IS NULL ORDER BY r.order_hash`, [this.chainId]
    );
    const passByEdition = new Map();
    for (const row of passRows) passByEdition.set(row.edition_id, (passByEdition.get(row.edition_id) ?? 0) + 1);
    const items = [];
    if (include('EDITION')) for (const row of editions) items.push({
      key: `edition:${row.edition_address}`,
      identity: { edition: lower(row.edition_address) },
      expected: {
        edition: true,
        totalMinted: String(passByEdition.get(row.id) ?? 0),
        ...(row.active_terms_hash ? { activeTerms: { hash: lower(row.active_terms_hash), terms: { activeSupply: String(row.active_supply), pricePerPass: String(row.price_usdg), previewStartsAt: epoch(row.preview_starts_at), mintStartsAt: epoch(row.mint_starts_at), mintEndsAt: epoch(row.mint_ends_at), primaryRecipient: lower(row.primary_recipient), royaltyReceiver: lower(row.royalty_receiver), royaltyBps: String(row.royalty_bps), advantagesHash: lower(row.advantages_hash), referralTermsHash: lower(row.referral_terms_hash) } } } : {})
      },
      authority: { edition: 'NEX_PASS_FACTORY', totalMinted: 'NEX_PASS_EDITION', activeTerms: 'NEX_LAUNCH_REGISTRY' },
      repair: { edition: 'REPORT_ONLY', totalMinted: 'REPROJECT_FROM_CHAIN', activeTerms: 'REPROJECT_FROM_CHAIN' }
    });
    if (include('PASS')) for (const row of passRows) items.push({
      key: `pass:${row.edition_address}:${row.token_id}`,
      identity: { edition: lower(row.edition_address), tokenId: String(row.token_id) },
      expected: { owner: lower(row.owner_address), tokenTerms: lower(row.terms_hash) },
      authority: { owner: 'ERC721', tokenTerms: 'NEX_PASS_EDITION' },
      repair: { owner: 'REPROJECT_FROM_CHAIN', tokenTerms: 'REPROJECT_FROM_CHAIN' }
    });
    if (include('ADVANTAGE')) for (const row of advantageRows) items.push({
      key: `advantage:${row.edition_address}:${row.token_id}:${row.advantage_id_hash}`,
      identity: { edition: lower(row.edition_address), tokenId: String(row.token_id), advantageId: lower(row.advantage_id_hash) },
      expected: { advantage: { remaining: projectedRemaining(row), listed: Boolean(row.listed) } },
      authority: { advantage: 'NEX_ADVANTAGE_REGISTRY' },
      repair: { advantage: 'REPORT_ONLY' }
    });
    if (include('LISTING')) for (const row of listingRows) items.push({
      key: `listing:${row.order_hash}`,
      identity: { orderHash: lower(row.order_hash) },
      expected: { listing: { edition: lower(row.edition_address), tokenId: String(row.token_id), seller: lower(row.seller_address), termsVersionHash: lower(row.terms_hash), usdGPrice: String(row.price_usdg), royaltyReceiver: lower(row.listing_royalty_receiver), royaltyBps: String(row.listing_royalty_bps), startTime: epoch(row.starts_at), expiry: epoch(row.expires_at), zoneHash: lower(row.zone_hash), status: row.status } },
      authority: { listing: 'NEX_LISTING_REGISTRY' },
      repair: { listing: 'REPROJECT_FROM_CHAIN' }
    });
    if (include('ROYALTY')) for (const row of royaltyRows) items.push({
      key: `royalty:${row.order_hash}`,
      identity: { orderHash: lower(row.order_hash) },
      expected: { royalty: { edition: lower(row.edition_address), tokenId: String(row.token_id), builder: lower(row.builder_address), amount: String(row.amount_usdg), releaseAt: epoch(row.release_at), withdrawn: Boolean(row.withdrawn) }, withdrawal: Boolean(row.withdrawn) },
      authority: { royalty: 'NEX_ROYALTY_VAULT', withdrawal: 'NEX_ROYALTY_VAULT' },
      repair: { royalty: 'REPORT_ONLY', withdrawal: 'REPORT_ONLY' }
    });
    if (include('TBA')) for (const row of passRows.filter((item) => item.token_bound_account)) items.push({
      key: `tba:${row.edition_address}:${row.token_id}`,
      identity: { edition: lower(row.edition_address), tokenId: String(row.token_id) },
      expected: { tba: lower(row.token_bound_account) },
      authority: { tba: 'NEX_TBA_RESOLVER' },
      repair: { tba: 'REPORT_ONLY' }
    });
    return items;
  }
}
