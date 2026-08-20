import { cp, mkdir, readFile, rm } from 'node:fs/promises';
const source = new URL('../apps/web/public/', import.meta.url); const output = new URL('../apps/web/dist/', import.meta.url);
await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true }); await cp(source, output, { recursive: true });
const app = await readFile(new URL('../apps/web/public/app.mjs', import.meta.url), 'utf8');
const routes = ['/discover','/projects/','/editions/','/market','/create','/dashboard/holder','/dashboard/builder','/passes/','/transactions/','/edition-requests/'];
for (const route of routes) if (!app.includes(route)) throw new Error(`Missing certified route: ${route}`);
for (const forbidden of ['mockProducts','guaranteed appreciation','APY','passive yield','revenue share']) if (app.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`Forbidden production copy: ${forbidden}`);
console.log(JSON.stringify({ status: 'PASS', app: '@nexmarkets/web', routes: routes.length, output: 'apps/web/dist' }));
