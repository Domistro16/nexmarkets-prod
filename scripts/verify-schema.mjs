import { readdir, readFile } from 'node:fs/promises';

const required = [
  'account','wallet','app_session','project','edition','terms_version','pass_token_projection',
  'advantage_definition','advantage_state_projection','mint_intent','chain_transaction','transaction_event','transaction_job',
  'listing_projection','listing_event','signed_seaport_order','royalty_claim_projection','referral_account','referral_attribution',
  'referral_settlement','notification','outbox_event','audit_log','indexer_event','indexer_checkpoint',
  'reconciliation_run','reconciliation_incident','media_asset','serial_artwork','goldsky_raw_log'
];
const files = (await readdir(new URL('../infra/schema/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const sql = (await Promise.all(files.map((name) => readFile(new URL(`../infra/schema/${name}`, import.meta.url), 'utf8')))).join('\n');
for (const table of required) {
  if (!new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`, 'i').test(sql)) {
    throw new Error(`Missing required table: ${table}`);
  }
}
for (const provenance of ['block_number','block_hash','tx_hash','log_index','orphaned_at','finalized']) {
  if (!sql.includes(provenance)) throw new Error(`Missing chain provenance field: ${provenance}`);
}
if (!sql.includes("tier_percent IN (5,10,15,20)")) throw new Error('Referral tiers are not locked');
if (!sql.includes("chain_id IN (4663,46630)")) throw new Error('Robinhood-only chain policy missing');
console.log(JSON.stringify({ status: 'PASS', migrations: files.length, requiredTables: required.length }));
