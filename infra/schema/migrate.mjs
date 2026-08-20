import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const schemaDir = path.dirname(fileURLToPath(import.meta.url));

export async function applyMigrations({ connectionString = process.env.DATABASE_URL, pool } = {}) {
  if (!pool && !connectionString) throw new Error('DATABASE_URL is required');
  const ownedPool = pool ?? new pg.Pool({ connectionString, max: 2, application_name: 'nexmarkets-migrate' });
  const client = await ownedPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
      version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(schemaDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const file of files) {
      const sql = await readFile(path.join(schemaDir, file), 'utf8');
      const sha256 = createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex');
      const prior = await client.query('SELECT sha256 FROM schema_migration WHERE version=$1', [file]);
      if (prior.rowCount) {
        if (prior.rows[0].sha256 !== sha256) throw new Error(`Applied migration changed: ${file}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migration(version,sha256) VALUES($1,$2)', [file, sha256]);
    }
    await client.query('COMMIT');
    return files;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    if (!pool) await ownedPool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = await applyMigrations();
  console.log(JSON.stringify({ status: 'PASS', migrations: files }));
}
