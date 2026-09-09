import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

const confirmation = 'I_UNDERSTAND_THIS_UPDATES_THE_LOCAL_DATABASE_URL_SECRET';
if (process.env.POOLER_CREDENTIAL_REPAIR_CONFIRM !== confirmation) throw new Error(`POOLER_CREDENTIAL_REPAIR_CONFIRM must equal ${confirmation}`);

const envUrl = new URL('../.env', import.meta.url);
const source = await readFile(envUrl, 'utf8');
const values = Object.fromEntries(source.split(/\r?\n/u).flatMap((line) => {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
  return match ? [[match[1], match[2]]] : [];
}));
if (!values.DATABASE_URL || !values.DIRECT_URL) throw new Error('DATABASE_URL_AND_DIRECT_URL_REQUIRED');

function unquote(value) {
  const text = String(value).trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}

const poolerWasQuoted = /^["']/u.test(String(values.DATABASE_URL).trim());
const pooler = new URL(unquote(values.DATABASE_URL));
const direct = new URL(unquote(values.DIRECT_URL));
if (pooler.hostname !== direct.hostname || pooler.username !== direct.username) throw new Error('DATABASE_ENDPOINT_IDENTITY_MISMATCH');
pooler.password = direct.password;

const candidate = pooler.toString();
const client = new pg.Pool({ connectionString: candidate, max: 1, connectionTimeoutMillis: 10_000, application_name: 'nexmarkets-pooler-repair' });
try {
  await client.query('SELECT 1');
} finally {
  await client.end();
}

const serializedCandidate = poolerWasQuoted ? JSON.stringify(candidate) : candidate;
const next = source.replace(/^DATABASE_URL=.*$/mu, `DATABASE_URL=${serializedCandidate}`);
if (next === source) throw new Error('DATABASE_URL_LINE_NOT_FOUND');
await writeFile(envUrl, next, 'utf8');
console.log(JSON.stringify({ status: 'PASS', host: pooler.hostname, port: pooler.port || '5432', user: decodeURIComponent(pooler.username), credentialSource: 'DIRECT_URL', secretPrinted: false }));
