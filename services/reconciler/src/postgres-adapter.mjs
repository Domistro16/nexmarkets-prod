import pg from 'pg';
import { randomUUID } from 'node:crypto';

export class PostgresReconciliationStore {
  constructor({ pool, connectionString = process.env.DATABASE_URL, chainId = 4663 } = {}) { this.pool = pool ?? new pg.Pool({ connectionString, max: 4, application_name: 'nexmarkets-reconciler' }); this.ownsPool = !pool; this.chainId = chainId; }
  async close() { if (this.ownsPool) await this.pool.end(); }
  async startRun(scope) { const id = `rec_${randomUUID()}`; const { rows } = await this.pool.query('INSERT INTO reconciliation_run(id,chain_id,scope,status) VALUES($1,$2,$3,\'RUNNING\') RETURNING id', [id, this.chainId, JSON.stringify(scope)]); return rows[0]; }
  async recordIncident(incident) { await this.pool.query(`INSERT INTO reconciliation_incident(id,run_id,authority,object_key,severity,expected,observed,status,repair_action) VALUES($1,$2,$3,$4,'HIGH',$5::jsonb,$6::jsonb,'OPEN',$7)`, [`inc_${randomUUID()}`, incident.runId, incident.authority ?? 'CHAIN', `${incident.objectKey}:${incident.check}`, JSON.stringify(incident.expected ?? null), JSON.stringify(incident.observed ?? null), incident.repairAction ?? 'REPORT_ONLY']); }
  async finishRun(id, status, result) { await this.pool.query('UPDATE reconciliation_run SET status=$2,checked_count=$3,discrepancy_count=$4,evidence=$5::jsonb,finished_at=now() WHERE id=$1', [id, status, result.checkedCount, result.discrepancies.length, JSON.stringify(result)]); }
  async items(scope = 'ALL') {
    const { rows } = await this.pool.query(`SELECT pt.edition_id,pt.token_id,pt.owner_address,pt.terms_hash,pt.token_bound_account,e.edition_address,e.chain_id,l.order_hash,l.status listing_status,r.builder_address,r.amount_usdg,r.release_at,r.withdrawn
      FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id LEFT JOIN LATERAL (SELECT * FROM listing_projection x WHERE x.edition_id=pt.edition_id AND x.token_id=pt.token_id AND x.orphaned_at IS NULL ORDER BY x.updated_at DESC LIMIT 1) l ON true LEFT JOIN royalty_claim_projection r ON r.edition_id=pt.edition_id AND r.token_id=pt.token_id AND r.orphaned_at IS NULL
      WHERE e.chain_id=$1 AND pt.orphaned_at IS NULL LIMIT 1000`, [this.chainId]);
    return rows.map((row) => ({ key: `${row.edition_address}:${row.token_id}`, identity: { edition: row.edition_address, tokenId: String(row.token_id), orderHash: row.order_hash, registry: scope?.advantageRegistry }, expected: { owner: row.owner_address, tokenTerms: row.terms_hash, tba: row.token_bound_account, ...(row.listing_status ? { listing: row.listing_status } : {}), ...(row.amount_usdg ? { royalty: { amount: String(row.amount_usdg), builder: row.builder_address, releaseAt: Math.floor(new Date(row.release_at).getTime() / 1000), withdrawn: row.withdrawn } } : {}) }, authority: { owner: 'ERC721', tokenTerms: 'NEX_PASS_EDITION', tba: 'NEX_TBA_RESOLVER', listing: 'NEX_LISTING_REGISTRY', royalty: 'NEX_ROYALTY_VAULT' }, repair: { owner: 'REPROJECT_FROM_CHAIN', tokenTerms: 'REPROJECT_FROM_CHAIN', tba: 'REPORT_ONLY', listing: 'REPROJECT_FROM_CHAIN', royalty: 'REPORT_ONLY' } }));
  }
}
