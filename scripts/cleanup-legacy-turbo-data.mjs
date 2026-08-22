import pg from 'pg';

const confirm = process.env.CLEANUP_LEGACY_TURBO_CONFIRM;
if (confirm !== 'I_UNDERSTAND_SUBGRAPH_CERTIFICATION_PASSED') throw new Error('LEGACY_TURBO_CLEANUP_CONFIRMATION_REQUIRED');
if (process.env.SUBGRAPH_READ_PATH_PASS !== 'true' || process.env.RPC_RECONCILIATION_PASS !== 'true' || process.env.TESTNET_SUBGRAPH_CERTIFICATION_PASS !== 'true') {
  throw new Error('LEGACY_TURBO_CLEANUP_GATES_REQUIRED');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

const tables = ['goldsky_raw_log', 'goldsky_chain_watermark', 'indexer_event', 'indexer_checkpoint', 'seaport_fulfillment_projection'];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, application_name: 'nexmarkets-subgraph-cleanup' });
try {
  await pool.query('BEGIN');
  await pool.query(`TRUNCATE TABLE ${tables.map((table) => `public.${table}`).join(', ')}`);
  await pool.query('COMMIT');
  for (const table of tables) await pool.query(`VACUUM (FULL, ANALYZE) public.${table}`);
  const result = {};
  for (const table of tables) {
    const { rows } = await pool.query(`SELECT count(*)::bigint AS rows, pg_total_relation_size($1::regclass)::bigint AS bytes`, [`public.${table}`]);
    result[table] = { rows: String(rows[0].rows), bytes: String(rows[0].bytes) };
  }
  console.log(JSON.stringify({ status: 'LEGACY_TURBO_DATA_REMOVED', tables: result, applicationDataUntouched: true }, null, 2));
} catch (error) {
  try { await pool.query('ROLLBACK'); } catch { /* preserve original failure */ }
  throw error;
} finally {
  await pool.end();
}
