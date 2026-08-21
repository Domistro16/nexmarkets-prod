import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const tableNames = ['goldsky_raw_log', 'goldsky_chain_watermark', 'indexer_event', 'indexer_checkpoint', 'seaport_fulfillment_projection'];
const ignored = new Set(['node_modules', '.git', 'build', 'generated', '.tmp-foundry']);
const refs = new Map(tableNames.map((name) => [name, []]));

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(mjs|js|ts|sql|md|yaml|yml|json)$/.test(entry.name)) {
      const text = await readFile(path, 'utf8');
      for (const name of tableNames) if (text.includes(name)) refs.get(name).push(relative(rootPath, path));
    }
  }
}
await walk(rootPath);

const report = { generatedAt: new Date().toISOString(), subgraphReadPathPass: false, rpcReconciliationPass: false, testnetSubgraphCertificationPass: false, tables: [] };
const connectionString = process.env.DATABASE_URL;
if (connectionString) {
  const pool = new pg.Pool({ connectionString, max: 2, application_name: 'nexmarkets-retention-report' });
  try {
    for (const table of tableNames) {
      const { rows } = await pool.query(`SELECT c.reltuples::bigint AS estimated_rows, pg_total_relation_size(c.oid)::bigint AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1`, [table]);
      report.tables.push({ table, estimatedRows: rows[0] ? String(rows[0].estimated_rows) : null, bytes: rows[0] ? String(rows[0].bytes) : null, runtimeReferences: refs.get(table), safeToRemove: false, recommendedAction: 'RETAIN_UNTIL_SUBGRAPH_AND_RECONCILIATION_GATES' });
    }
  } finally { await pool.end(); }
} else {
  report.status = 'BLOCKED_BY_DATABASE_URL';
  report.tables = tableNames.map((table) => ({ table, estimatedRows: null, bytes: null, runtimeReferences: refs.get(table), safeToRemove: false, recommendedAction: 'RUN_WITH_DATABASE_URL_AFTER_SUBGRAPH_CERTIFICATION' }));
}
await mkdir(new URL('../artifacts/goldsky/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/goldsky/raw-chain-cleanup-report.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status ?? 'REPORT_ONLY', tables: report.tables.length, deleted: false }));
