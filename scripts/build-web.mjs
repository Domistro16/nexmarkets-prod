import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const source = new URL('./apps/web/public/', root);
const outputs = [
  new URL('./apps/web/dist/', root),
  new URL('./apps/api/dist/', root),
  new URL('./apps/api/public/', root),
  new URL('./dist/', root),
  new URL('./public/', root)
];
const authoritySource = new URL('./NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html', root);
const authorityBodyClose = '</body>';
const authorityHtmlSource = await readFile(authoritySource, 'utf8');
const fixtureMode = process.env.NEXMARKETS_FIXTURE_MODE === 'true';
const authorityWithMode = authorityHtmlSource.replace(
  /(<body\b[^>]*>)/i,
  `$1<script id="nm-fixture-mode">globalThis.__NEXMARKETS_FIXTURE_MODE__=${fixtureMode ? 'true' : 'false'};</script>`
);
const authorityWithVerification = authorityWithMode.replace(
  /(<head\b[^>]*>)/i,
  `$1\n<meta name="base:app_id" content="6aa1dbf93ee3d6b47f7f0528" />`
);
const authorityCloseIndex = authorityWithVerification.lastIndexOf(authorityBodyClose);
if (authorityCloseIndex < 0) throw new Error('Approved V2 authority is missing a closing body tag');
const authorityHtml = `${authorityWithVerification.slice(0, authorityCloseIndex)}\n<link rel="stylesheet" href="/rainbowkit-bridge.css">\n<link rel="stylesheet" href="/cdp-auth-bridge.css">\n<style id="nm-v2-hydration-style">html.nm-v2-loading body{visibility:hidden}html.nm-v2-ready body{visibility:visible}</style>\n<script>document.documentElement.classList.add('nm-v2-loading');</script>\n<script id="nm-v2-data-bridge" src="/nm-v2-data-bridge.js"></script>\n<script type="module" src="/v2-app.mjs"></script>\n${authorityWithVerification.slice(authorityCloseIndex)}`;

// Keep the checked-in web entrypoint identical to the authority used for
// generated deployments. This prevents local/source serving from drifting
// back to the retired shell while dist/ is on the approved experience.
await writeFile(new URL('index.html', source), authorityHtml, 'utf8');

for (const output of outputs) {
  try {
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    await cp(source, output, { recursive: true });
    await writeFile(new URL('index.html', output), authorityHtml, 'utf8');
  } catch {}
}

// CDP's project identifier is public client configuration, but it must come
// from the deployment environment rather than being invented or copied from
// a secret. A missing value deliberately leaves social auth disabled while
// preserving the external-wallet flow.
const cdpProjectId = String(process.env.CDP_PROJECT_ID || '').trim();
const cdpAuthConfig = {
  projectId: cdpProjectId || null,
  authMethods: ['oauth:google', 'oauth:apple', 'oauth:x'],
  network: 'base-sepolia',
  ethereum: { createOnLogin: 'eoa' }
};
for (const output of outputs) {
  const configPath = join(fileURLToPath(output), 'config.json');
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const existing = config.auth?.cdp || {};
    config.auth = { ...(config.auth || {}), cdp: { ...existing, ...cdpAuthConfig, projectId: cdpProjectId || existing.projectId || null } };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  } catch {}
}

const apiDir = new URL('./api/', root);
await rm(apiDir, { recursive: true, force: true });
await mkdir(apiDir, { recursive: true });

try {
  const { build } = await import('esbuild');
  await build({
    entryPoints: [
      { in: join(rootPath, 'api-src', 'healthz.js'), out: 'healthz' },
      { in: join(rootPath, 'api-src', 'readyz.js'), out: 'readyz' },
      { in: join(rootPath, 'api-src', 'v1.js'), out: 'v1' }
    ],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['pg'],
    allowOverwrite: true,
    outdir: join(rootPath, 'api')
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

  // Mirror api directory to workspaces
  for (const target of [new URL('./apps/web/api/', root), new URL('./apps/api/api/', root)]) {
    try {
      await rm(target, { recursive: true, force: true });
      await mkdir(target, { recursive: true });
      await cp(apiDir, target, { recursive: true });
    } catch {}
  }

  // RainbowKit is part of a local, on-demand browser bundle so wallet
  // selection does not depend on a runtime CDN request or slow every page
  // load. The lightweight adapter dynamically imports this bridge on click.
  const rainbowEntry = join(rootPath, 'apps/web/public/rainbowkit-bridge.mjs');
  for (const output of outputs) {
    await build({
      entryPoints: [rainbowEntry],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2020',
      minify: true,
      legalComments: 'none',
      outfile: join(fileURLToPath(output), 'rainbowkit-bridge.mjs'),
      allowOverwrite: true
    });
  }

  const cdpEntry = join(rootPath, 'apps/web/public/cdp-auth-bridge.mjs');
  for (const output of outputs) {
    await build({
      entryPoints: [cdpEntry],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2020',
      minify: true,
      legalComments: 'none',
      outfile: join(fileURLToPath(output), 'cdp-auth-bridge.mjs'),
      allowOverwrite: true
    });
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', stage: 'api-build', error: error.message }));
  process.exitCode = 1;
}

const app = await readFile(new URL('./apps/web/public/app.mjs', root), 'utf8');
const v2App = await readFile(new URL('./apps/web/public/v2-app.mjs', root), 'utf8');
const template = authorityHtml;
const routes = ['/discover','/projects/','/editions/','/market','/create','/dashboard/holder','/dashboard/builder','/passes/','/transactions/'];
for (const route of routes) if (!app.includes(route)) throw new Error(`Missing certified route: ${route}`);
for (const forbidden of ['mockProducts','guaranteed appreciation','APY','passive yield','revenue share']) if (app.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`Forbidden production copy: ${forbidden}`);
if (!template.includes('nm-v2-data-bridge') || !template.includes('/v2-app.mjs')) throw new Error('Missing V2 template data bridge');
if (!v2App.includes("/v1/discover") || !v2App.includes('46630') || !v2App.includes('CERTIFICATION_EDITION')) throw new Error('V2 runtime is not testnet data-backed');
console.log(JSON.stringify({ status: 'PASS', app: '@nexmarkets/web', routes: routes.length, output: 'public', bundledApi: true }));
