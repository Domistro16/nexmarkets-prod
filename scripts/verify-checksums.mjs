import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const manifest = await readFile(new URL('../SHA256SUMS', import.meta.url), 'utf8'); let count = 0;
for (const line of manifest.split(/\r?\n/).filter(Boolean)) {
  const separator = line.indexOf('  '); if (separator < 1) throw new Error(`Malformed checksum line: ${line}`);
  const expected = line.slice(0, separator); const path = line.slice(separator + 2);
  const content = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const actual = createHash('sha256').update(content.replaceAll('\r\n', '\n').replaceAll('\r', '\n')).digest('hex');
  if (actual !== expected) throw new Error(`Checksum mismatch: ${path}`); count += 1;
}
console.log(JSON.stringify({ status: 'PASS', entries: count }));
