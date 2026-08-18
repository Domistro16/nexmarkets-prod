import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PRODUCT_AUTHORITY } from '../packages/config/src/networks.mjs';

const candidate = process.argv[2] || '../product-authority/NEXMARKETS_ELITE_RELEASE_CANDIDATE.html';
try {
  const target = candidate.startsWith('/') ? new URL('file://' + candidate) : new URL(candidate, import.meta.url);
  const bytes = await readFile(target);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== PRODUCT_AUTHORITY.sha256) throw new Error(`Product authority mismatch: expected ${PRODUCT_AUTHORITY.sha256}, got ${hash}`);
  console.log(JSON.stringify({status:'PASS',file:PRODUCT_AUTHORITY.file,sha256:hash},null,2));
} catch (err) {
  console.error(JSON.stringify({status:'FAIL',error:err.message},null,2));
  process.exitCode=1;
}
