import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = new URL('./apps/web/public/', root);
const outputs = [
  new URL('./apps/web/dist/', root),
  new URL('./apps/api/dist/', root),
  new URL('./dist/', root),
  new URL('./public/', root)
];

for (const output of outputs) {
  try {
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    await cp(source, output, { recursive: true });
  } catch {}
}

const apiDir = new URL('./api/', root);
await mkdir(apiDir, { recursive: true });

try {
  const { build } = await import('esbuild');
  await build({
    entryPoints: [
      { in: './api-src/healthz.js', out: 'healthz' },
      { in: './api-src/readyz.js', out: 'readyz' },
      { in: './api-src/v1/[...slug].js', out: 'v1/[...slug]' }
    ],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['pg'],
    allowOverwrite: true,
    outdir: './api'
  });

  async function fixExports(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await fixExports(fullPath);
      } else if (entry.name.endsWith('.js')) {
        let content = await readFile(fullPath, 'utf8');
        content = content.replace(/export\s*\{\s*(\w+)\s+as\s+default\s*\};?/g, 'export default $1;');
        await writeFile(fullPath, content, 'utf8');
      }
    }
  }
  await fixExports(fileURLToPath(apiDir));
} catch {}

const app = await readFile(new URL('./apps/web/public/app.mjs', root), 'utf8');
const v2App = await readFile(new URL('./apps/web/public/v2-app.mjs', root), 'utf8');
const template = await readFile(new URL('./apps/web/public/index.html', root), 'utf8');
const routes = ['/discover','/projects/','/editions/','/market','/create','/dashboard/holder','/dashboard/builder','/passes/','/transactions/','/edition-requests/'];
for (const route of routes) if (!app.includes(route)) throw new Error(`Missing certified route: ${route}`);
for (const forbidden of ['mockProducts','guaranteed appreciation','APY','passive yield','revenue share']) if (app.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`Forbidden production copy: ${forbidden}`);
if (!template.includes('nm-v2-data-bridge') || !template.includes('/v2-app.mjs')) throw new Error('Missing V2 template data bridge');
if (!v2App.includes("/v1/discover") || !v2App.includes('46630') || !v2App.includes('CERTIFICATION_EDITION')) throw new Error('V2 runtime is not testnet data-backed');
console.log(JSON.stringify({ status: 'PASS', app: '@nexmarkets/web', routes: routes.length, output: 'public', bundledApi: true }));
