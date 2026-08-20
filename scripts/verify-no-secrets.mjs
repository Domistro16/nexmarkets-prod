import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const files = execFileSync('git', ['ls-files','--cached','--others','--exclude-standard'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(?:DEPLOYER_PRIVATE_KEY|SESSION_SECRET|GOLDSKY_API_KEY|OBJECT_STORAGE_SECRET_ACCESS_KEY)\s*=\s*(?!<|replace-|\$\{)[A-Za-z0-9+/=_-]{24,}/
];
const violations = [];
for (const file of files) {
  if (file === '.env.example' || file.endsWith('.png') || file.endsWith('.zip')) continue;
  let content; try { content = await readFile(file, 'utf8'); } catch { continue; }
  for (const pattern of patterns) if (pattern.test(content)) violations.push(`${file}: ${pattern}`);
}
if (violations.length) throw new Error(`Potential secrets detected:\n${violations.join('\n')}`);
console.log(JSON.stringify({ status: 'PASS', filesScanned: files.length, secretsFound: 0 }));
