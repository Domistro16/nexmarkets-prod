import pg from 'pg';
import { randomUUID } from 'node:crypto';

export class PostgresReconciliationStore {
  constructor({ pool, connectionString = process.env.DATABASE_URL, chainId = 4663 } = {}) { this.pool = pool ?? new pg.Pool({ connectionString, max: 4, application_name: 'nexmarkets-reconciler' }); this.ownsPool = !pool; this.chainId = chainId; }
  async close() { if (this.ownsPool) await this.pool.end(); }
  async startRun(scope) { const id = `rec_${randomUUID()}`; const { rows } = await this.pool.query('INSERT INTO reconciliation_run(id,chain_id,scope,status) VALUES($1,$2,$3,\'RUNNING\') RETURNING id', [id, this.chainId, JSON.stringify(scope)]); return rows[0]; }
  async recordIncident(incident) { await this.pool.query(`INSERT INTO reconciliation_incident(id,run_id,authority,object_key,severity,expected,observed,status,repair_action) VALUES($1,$2,$3,$4,'HIGH',$5::jsonb,$6::jsonb,'OPEN',$7)`, [`inc_${randomUUID()}`, incident.runId, incident.authority ?? 'CHAIN', `${incident.objectKey}:${incident.check}`, JSON.stringify(incident.expected ?? null), JSON.stringify(incident.observed ?? null), incident.repairAction ?? 'REPORT_ONLY']); }
  async finishRun(id, status, result) { await this.pool.query('UPDATE reconciliation_run SET status=$2,checked_count=$3,discrepancy_count=$4,evidence=$5::jsonb,finished_at=now() WHERE id=$1', [id, status, result.checkedCount, result.discrepancies.length, JSON.stringify(result)]); }
  async items(scope = 'ALL') {
    const termsSeconds = (value) => value == null ? null : String(Math.floor(new Date(value).getTime() / 1000));
    const { rows: editions } = await this.pool.query(
      `SELECT e.*,t.terms_hash active_terms_hash,t.active_supply,t.price_usdg,t.preview_starts_at,t.mint_starts_at,t.mint_ends_at,t.primary_recipient,t.royalty_receiver,t.royalty_bps,t.advantages_hash,t.referral_terms_hash
       FROM edition e LEFT JOIN LATERAL (SELECT * FROM terms_version x WHERE x.edition_id=e.id AND x.orphaned_at IS NULL ORDER BY x.version DESC LIMIT 1) t ON true
       WHERE e.chain_id=$1 AND e.orphaned_at IS NULL LIMIT 1000`, [this.chainId]
    );
    const { rows } = await this.pool.query(
      `SELECT pt.edition_id,pt.token_id,pt.owner_address,pt.terms_hash,pt.token_bound_account,e.edition_address,e.chain_id,
              a.advantage_id_hash,a.remaining_units,a.listed advantage_listed,
              l.order_hash,l.status listing_status,l.edition_id listing_edition_id,l.token_id listing_token_id,l.seller_address,l.terms_hash listing_terms_hash,l.price_usdg listing_price,l.royalty_usdg,l.starts_at,l.expires_at,l.zone_hash,
              lt.royalty_receiver listing_royalty_receiver,lt.royalty_bps listing_royalty_bps,
              r.builder_address,r.amount_usdg,r.release_at,r.withdrawn
       FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id
       LEFT JOIN advantage_state_projection a ON a.edition_id=pt.edition_id AND a.token_id=pt.token_id AND a.orphaned_at IS NULL
       LEFT JOIN LATERAL (SELECT * FROM listing_projection x WHERE x.edition_id=pt.edition_id AND x.token_id=pt.token_id AND x.orphaned_at IS NULL ORDER BY x.updated_at DESC LIMIT 1) l ON true
       LEFT JOIN terms_version lt ON lt.edition_id=l.edition_id AND lt.terms_hash=l.terms_hash AND lt.orphaned_at IS NULL
       LEFT JOIN royalty_claim_projection r ON r.edition_id=pt.edition_id AND r.token_id=pt.token_id AND r.orphaned_at IS NULL
       WHERE e.chain_id=$1 AND pt.orphaned_at IS NULL LIMIT 5000`, [this.chainId]
    );
    const editionItems = editions.map((row) => ({
      key: `edition:${row.edition_address}`,
      identity: { edition: row.edition_address },
      expected: {
        edition: true,
        totalMinted: String(new Set(rows.filter((pass) => pass.edition_id === row.id).map((pass) => String(pass.token_id))).size),
        ...(row.active_terms_hash ? { activeTerms: { hash: row.active_terms_hash, terms: { activeSupply: String(row.active_supply), pricePerPass: String(row.price_usdg), previewStartsAt: termsSeconds(row.preview_starts_at), mintStartsAt: termsSeconds(row.mint_starts_at), mintEndsAt: termsSeconds(row.mint_ends_at), primaryRecipient: row.primary_recipient, royaltyReceiver: row.royalty_receiver, royaltyBps: String(row.royalty_bps), advantagesHash: row.advantages_hash, referralTermsHash: row.referral_terms_hash } } } : {})
      },
      authority: { edition: 'NEX_PASS_FACTORY', totalMinted: 'NEX_PASS_EDITION', activeTerms: 'NEX_LAUNCH_REGISTRY' },
      repair: { edition: 'REPORT_ONLY', totalMinted: 'REPROJECT_FROM_CHAIN', activeTerms: 'REPROJECT_FROM_CHAIN' }
    }));
    const passItems = rows.map((row) => ({
      key: `pass:${row.edition_address}:${row.token_id}:${row.advantage_id_hash ?? 'none'}`,
      identity: { edition: row.edition_address, tokenId: String(row.token_id), advantageId: row.advantage_id_hash, orderHash: row.order_hash, listingRegistry: scope?.listingRegistry },
      expected: {
        owner: row.owner_address, tokenTerms: row.terms_hash, tba: row.token_bound_account,
        ...(row.advantage_id_hash ? { advantage: { remaining: String(row.remaining_units), listed: Boolean(row.advantage_listed) } } : {}),
        ...(row.order_hash ? { listing: { edition: row.edition_address, tokenId: String(row.listing_token_id), seller: row.seller_address, termsVersionHash: row.listing_terms_hash, usdGPrice: String(row.listing_price), royaltyReceiver: row.listing_royalty_receiver, royaltyBps: String(row.listing_royalty_bps), startTime: termsSeconds(row.starts_at), expiry: termsSeconds(row.expires_at), zoneHash: row.zone_hash, status: row.listing_status } } : {}),
        ...(row.amount_usdg != null ? { royalty: { edition: row.edition_address, tokenId: String(row.token_id), builder: row.builder_address, amount: String(row.amount_usdg), releaseAt: Math.floor(new Date(row.release_at).getTime() / 1000), withdrawn: Boolean(row.withdrawn) }, withdrawal: Boolean(row.withdrawn) } : {})
      },
      authority: { owner: 'ERC721', tokenTerms: 'NEX_PASS_EDITION', tba: 'NEX_TBA_RESOLVER', advantage: 'NEX_ADVANTAGE_REGISTRY', listing: 'NEX_LISTING_REGISTRY', royalty: 'NEX_ROYALTY_VAULT', withdrawal: 'NEX_ROYALTY_VAULT' },
      repair: { owner: 'REPROJECT_FROM_CHAIN', tokenTerms: 'REPROJECT_FROM_CHAIN', tba: 'REPORT_ONLY', advantage: 'REPORT_ONLY', listing: 'REPROJECT_FROM_CHAIN', royalty: 'REPORT_ONLY', withdrawal: 'REPORT_ONLY' }
    }));
    return [...editionItems, ...passItems];
  }
}
