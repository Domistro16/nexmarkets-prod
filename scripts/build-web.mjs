import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const source = new URL('./apps/web/public/', root);
const outputs = [
  new URL('./apps/web/dist/', root),
  new URL('./apps/api/dist/', root),
  new URL('./dist/', root),
  new URL('./public/', root)
];

for (const output of outputs) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(source, output, { recursive: true });
}

// Bundle serverless endpoints using esbuild into standalone ESM files
await build({
  entryPoints: [
    { in: './api/src/healthz.js', out: 'healthz' },
    { in: './api/src/readyz.js', out: 'readyz' },
    { in: './api/src/v1/[...slug].js', out: 'v1/[...slug]' },
    { in: './api/src/v1/[...slug].js', out: 'v1/index' }
  ],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['pg'],
  allowOverwrite: true,
  outdir: './api'
});

const apiSource = new URL('./api/', root);
for (const target of [new URL('./apps/web/api/', root), new URL('./apps/api/api/', root)]) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(apiSource, target, { recursive: true });
}

const app = await readFile(new URL('./apps/web/public/app.mjs', root), 'utf8');
const v2App = await readFile(new URL('./apps/web/public/v2-app.mjs', root), 'utf8');
const template = await readFile(new URL('./apps/web/public/index.html', root), 'utf8');
const routes = ['/discover','/projects/','/editions/','/market','/create','/dashboard/holder','/dashboard/builder','/passes/','/transactions/','/edition-requests/'];
for (const route of routes) if (!app.includes(route)) throw new Error(`Missing certified route: ${route}`);
for (const forbidden of ['mockProducts','guaranteed appreciation','APY','passive yield','revenue share']) if (app.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`Forbidden production copy: ${forbidden}`);
if (!template.includes('nm-v2-data-bridge') || !template.includes('/v2-app.mjs')) throw new Error('Missing V2 template data bridge');
if (!v2App.includes("/v1/discover") || !v2App.includes('46630') || !v2App.includes('CERTIFICATION_EDITION')) throw new Error('V2 runtime is not testnet data-backed');
console.log(JSON.stringify({ status: 'PASS', app: '@nexmarkets/web', routes: routes.length, output: 'public', bundledApi: true }));
