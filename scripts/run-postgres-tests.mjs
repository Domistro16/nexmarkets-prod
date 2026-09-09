import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { applyMigrations } from '../infra/schema/migrate.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const testDir = path.join(root, 'test');
const connectionString = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is required');

const admin = new pg.Pool({ connectionString, max: 2, application_name: 'nexmarkets-postgres-tests-admin' });
const schemaName = `nexmarkets_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
let created = false;

try {
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  created = true;
  const scopedUrl = new URL(connectionString);
  scopedUrl.searchParams.set('options', `-c search_path=${schemaName},public`);
  const scopedConnectionString = scopedUrl.toString();
  await applyMigrations({ connectionString: scopedConnectionString });
  const files = (await readdir(testDir))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => path.join('test', name));
  const child = spawn(process.execPath, ['--test', ...files], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: scopedConnectionString, DIRECT_URL: scopedConnectionString },
    stdio: 'inherit'
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  if (created) await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
  await admin.end();
}
