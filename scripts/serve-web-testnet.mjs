import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webRoot = resolve(root, 'apps/web/dist');
const apiPort = Number(process.env.NEXMARKETS_API_PORT ?? 4020);
const webPort = Number(process.env.NEXMARKETS_WEB_PORT ?? 4173);
await access(resolve(webRoot, 'index.html'));

const deployment = JSON.parse(await readFile(resolve(root, 'deployments/robinhood-testnet.v1-deployment.json'), 'utf8'));
const release = JSON.parse(await readFile(resolve(root, 'deployments/MAINNET_RELEASE_CANDIDATE.json'), 'utf8'));
const subgraphEndpoint = process.env.NEXMARKETS_SUBGRAPH_URL || release.goldsky?.testnetSubgraph?.graphqlEndpoint;
if (!subgraphEndpoint) throw new Error('TESTNET_SUBGRAPH_ENDPOINT_REQUIRED');
const contracts = deployment.contracts;
const env = {
  ...process.env,
  NODE_ENV: 'development',
  APP_ORIGIN: `http://localhost:${webPort}`,
  PORT: String(apiPort),
  ROBINHOOD_CHAIN_ID: '46630',
  REQUIRE_INDEXED_READINESS: 'true',
  // Local browser harness: keep production's 120-block default untouched,
  // while allowing the live testnet Subgraph's observed head drift to be
  // surfaced through /readyz instead of blocking the local UI entirely.
  INDEXER_MAX_LAG_BLOCKS: process.env.NEXMARKETS_INDEXER_MAX_LAG_BLOCKS ?? '1000',
  INDEXER_MAX_FINALITY_LAG_BLOCKS: process.env.NEXMARKETS_INDEXER_MAX_FINALITY_LAG_BLOCKS ?? '1000',
  SECURE_COOKIES: 'false',
  LOG_API_ERRORS: 'true',
  NEXMARKETS_SUBGRAPH_URL: subgraphEndpoint,
  USDG_ADDRESS: deployment.mockUsdg.address,
  PROTOCOL_ADMIN_SAFE_ADDRESS: deployment.protocolAdminSafe.address,
  PRIMARY_FEE_RECIPIENT: deployment.protocolAdminSafe.address,
  SECONDARY_FEE_RECIPIENT: deployment.protocolAdminSafe.address,
  SEAPORT_16_ADDRESS: deployment.primitives.seaport16.address,
  NEX_LAUNCH_REGISTRY_ADDRESS: contracts.NexLaunchRegistry.address,
  NEX_MINT_CONTROLLER_ADDRESS: contracts.NexMintController.address,
  NEX_PASS_FACTORY_ADDRESS: contracts.NexPassFactory.address,
  NEX_ADVANTAGE_REGISTRY_ADDRESS: contracts.NexAdvantageRegistry.address,
  NEX_ROYALTY_VAULT_ADDRESS: contracts.NexRoyaltyVault.address,
  NEX_LISTING_REGISTRY_ADDRESS: contracts.NexListingRegistry.address,
  NEX_MARKETS_ZONE_ADDRESS: contracts.NexMarketsZone.address,
  NEX_TBA_RESOLVER_ADDRESS: contracts.NexTBAResolver.address,
  CERTIFICATION_EDITION_ADDRESS: deployment.certificationEdition.edition,
  CERTIFICATION_EDITION_NAME: 'NexMarkets V1 Test Certification Edition'
};

const api = spawn(process.execPath, [resolve(root, 'apps/api/src/server.mjs')], { cwd: root, env, stdio: 'inherit' });
api.on('error', (error) => console.error(JSON.stringify({ event: 'api_spawn_failed', error: error.message })));

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const apiPaths = ['/v1/', '/healthz', '/readyz', '/metrics'];
function proxy(req, res) {
  const upstream = http.request({ hostname: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${apiPort}`, origin: `http://localhost:${webPort}` } }, (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'API_UNAVAILABLE' } })); });
  req.pipe(upstream);
}

async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, `http://localhost:${webPort}`).pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const candidate = resolve(webRoot, `.${normalize(requested)}`);
  if (!candidate.startsWith(webRoot)) return res.writeHead(400).end();
  let file = candidate;
  try { await access(file); } catch { file = resolve(webRoot, 'index.html'); }
  res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (apiPaths.some((prefix) => req.url?.startsWith(prefix))) return proxy(req, res);
  return serveStatic(req, res).catch(() => res.writeHead(500).end());
});
server.listen(webPort, '127.0.0.1', () => {
  console.log(JSON.stringify({ event: 'web_started', url: `http://localhost:${webPort}`, apiPort, chainId: 46630, subgraph: release.goldsky.testnetSubgraph.name }));
});

function shutdown() { server.close(); api.kill('SIGTERM'); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
api.on('exit', (code, signal) => { if (code && code !== 0) console.error(JSON.stringify({ event: 'api_exited', code, signal })); });
