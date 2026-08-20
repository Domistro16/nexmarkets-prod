import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const files = execFileSync('git', ['ls-files','--cached','--others','--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/).filter((file) => file && file !== 'SHA256SUMS').sort();
const lines = [];
for (const file of files) {
  const content = await readFile(new URL(file, root), 'utf8');
  const normalized = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  lines.push(`${createHash('sha256').update(normalized).digest('hex')}  ./${file}`);
}
await writeFile(new URL('SHA256SUMS', root), `${lines.join('\n')}\n`);
console.log(JSON.stringify({ status: 'PASS', entries: lines.length }));
