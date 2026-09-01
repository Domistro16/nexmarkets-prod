import { cp, mkdir, readFile, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = new URL('./apps/web/public/', root);
const outputs = [
  new URL('./apps/web/dist/', root),
  new URL('./apps/api/dist/', root),
  new URL('./dist/', root)
];

for (const output of outputs) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(source, output, { recursive: true });
}

const app = await readFile(new URL('./apps/web/public/app.mjs', root), 'utf8');
const v2App = await readFile(new URL('./apps/web/public/v2-app.mjs', root), 'utf8');
const template = await readFile(new URL('./apps/web/public/index.html', root), 'utf8');
const routes = ['/discover','/projects/','/editions/','/market','/create','/dashboard/holder','/dashboard/builder','/passes/','/transactions/','/edition-requests/'];
for (const route of routes) if (!app.includes(route)) throw new Error(`Missing certified route: ${route}`);
for (const forbidden of ['mockProducts','guaranteed appreciation','APY','passive yield','revenue share']) if (app.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`Forbidden production copy: ${forbidden}`);
if (!template.includes('nm-v2-data-bridge') || !template.includes('/v2-app.mjs')) throw new Error('Missing V2 template data bridge');
if (!v2App.includes("/v1/discover") || !v2App.includes('46630') || !v2App.includes('CERTIFICATION_EDITION')) throw new Error('V2 runtime is not testnet data-backed');
console.log(JSON.stringify({ status: 'PASS', app: '@nexmarkets/web', routes: routes.length, output: 'apps/web/dist' }));
