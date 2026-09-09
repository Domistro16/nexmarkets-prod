import { Contract, JsonRpcProvider, Wallet, formatEther, formatUnits, getAddress } from 'ethers';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const root = new URL('../', import.meta.url);
const deployment = JSON.parse(await readFile(new URL('deployments/robinhood-testnet.v1-deployment.json', root), 'utf8'));
const rpcUrl = process.env.RH_TESTNET_RPC_URL?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpcUrl || !privateKey) throw new Error('FINAL_LIVE_CERTIFICATION_CREDENTIALS_REQUIRED');

const provider = new JsonRpcProvider(rpcUrl, 46630, { staticNetwork: true });
const wallet = new Wallet(privateKey, provider);
const mockUsdgAddress = getAddress(deployment.mockUsdg.address);
const safeAddress = getAddress(deployment.protocolAdminSafe.address);
const factoryAddress = getAddress(deployment.contracts.NexPassFactory.address);
const listingAddress = getAddress(deployment.contracts.NexListingRegistry.address);
const oldEditionAddress = getAddress(deployment.certificationEdition.edition);
const token = new Contract(mockUsdgAddress, ['function balanceOf(address) view returns(uint256)'], provider);
const safe = new Contract(safeAddress, ['function getOwners() view returns(address[])', 'function getThreshold() view returns(uint256)'], provider);
const edition = new Contract(oldEditionAddress, ['function ownerOf(uint256) view returns(address)'], provider);
const listing = new Contract(listingAddress, ['function activeListingFor(address,uint256) view returns(bytes32)'], provider);
const apiUrl = process.env.NEXMARKETS_API_URL?.trim() || 'http://127.0.0.1:4020';
const subgraphUrl = process.env.NEXMARKETS_SUBGRAPH_URL?.trim()
  || 'https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/1.0.1/gn';

const [network, head, gasBalance, settlementBalance, owners, threshold, factoryCode, oldOwner, oldListing] = await Promise.all([
  provider.getNetwork(),
  provider.getBlockNumber(),
  provider.getBalance(wallet.address),
  token.balanceOf(wallet.address),
  safe.getOwners(),
  safe.getThreshold(),
  provider.getCode(factoryAddress),
  edition.ownerOf(1n),
  listing.activeListingFor(oldEditionAddress, 1n)
]);

let api = { status: 'UNAVAILABLE', endpoint: apiUrl };
try {
  const response = await fetch(`${apiUrl.replace(/\/+$/u, '')}/readyz`, { headers: { accept: 'application/json' } });
  const body = await response.json();
  api = { status: response.ok ? 'PASS' : 'FAIL', endpoint: apiUrl, httpStatus: response.status, database: body.database ?? null, indexer: body.indexer ?? null };
} catch (error) {
  api.error = error.message;
}

let rpcModules = { status: 'UNAVAILABLE' };
try {
  rpcModules = { status: 'PASS', modules: await provider.send('rpc_modules', []) };
} catch (error) {
  rpcModules = { status: 'UNAVAILABLE', message: String(error.shortMessage ?? error.message) };
}

let signerOwnedPasses = { status: 'UNAVAILABLE', endpoint: subgraphUrl, passes: [], publishedEditions: [] };
try {
  const response = await fetch(subgraphUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      query: 'query($owner:Bytes!){ passes(first:100,where:{owner:$owner}){ id tokenId owner termsHash listed edition { address currentTerms { hash pricePerPass royaltyReceiver royaltyBps } } } editions(first:100,where:{publisher:$owner}){ address publisher totalMinted currentTerms { hash pricePerPass previewStartsAt mintStartsAt mintEndsAt advantagesHash royaltyReceiver royaltyBps } } }',
      variables: { owner: wallet.address.toLowerCase() }
    })
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.[0]?.message ?? `HTTP_${response.status}`);
  signerOwnedPasses = { status: 'PASS', endpoint: subgraphUrl, passes: body.data?.passes ?? [], publishedEditions: body.data?.editions ?? [] };
} catch (error) {
  signerOwnedPasses = { ...signerOwnedPasses, message: String(error.message) };
}

const storageFields = ['OBJECT_STORAGE_BUCKET', 'OBJECT_STORAGE_REGION', 'OBJECT_STORAGE_ACCESS_KEY_ID', 'OBJECT_STORAGE_SECRET_ACCESS_KEY'];
const storageConfigured = storageFields.filter((name) => Boolean(process.env[name]?.trim()));
const pooledDatabaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const directDatabaseUrl = process.env.DIRECT_URL ? new URL(process.env.DIRECT_URL) : null;
async function connectionStatus(connectionString) {
  if (!connectionString) return { status: 'MISSING' };
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000, application_name: 'nexmarkets-live-preflight' });
  try {
    const response = await pool.query('SELECT current_database() AS database,current_user AS user');
    return { status: 'PASS', database: response.rows[0].database, user: response.rows[0].user };
  } catch (error) {
    return { status: 'FAIL', code: error.code ?? null, message: error.code === '28P01' ? 'PASSWORD_AUTHENTICATION_FAILED' : String(error.message || error.code) };
  } finally {
    await pool.end().catch(() => {});
  }
}
const repairedPoolerUrl = pooledDatabaseUrl && directDatabaseUrl ? new URL(pooledDatabaseUrl) : null;
if (repairedPoolerUrl && directDatabaseUrl) repairedPoolerUrl.password = directDatabaseUrl.password;
const [configuredPoolerStatus, repairedPoolerStatus, directStatus] = await Promise.all([
  connectionStatus(pooledDatabaseUrl?.toString()),
  connectionStatus(repairedPoolerUrl?.toString()),
  connectionStatus(directDatabaseUrl?.toString())
]);
const result = {
  status: Number(network.chainId) === 46630 && factoryCode !== '0x' && gasBalance > 0n ? 'PASS' : 'BLOCKED',
  chainId: Number(network.chainId),
  head,
  signer: wallet.address,
  signerGasBalance: formatEther(gasBalance),
  signerMockUsdgBalance: formatUnits(settlementBalance, 6),
  safe: { address: safeAddress, owners, threshold: Number(threshold), signerIsOwner: owners.some((owner) => owner.toLowerCase() === wallet.address.toLowerCase()) },
  contracts: { factory: factoryAddress, factoryCode: factoryCode !== '0x', listingRegistry: listingAddress, mockUsdg: mockUsdgAddress },
  historicalPass: { edition: oldEditionAddress, tokenId: '1', owner: oldOwner, activeListing: oldListing },
  api,
  rpcModules,
  signerOwnedPasses,
  objectStorage: { configuredFields: storageConfigured, complete: storageConfigured.length === storageFields.length },
  databaseEndpoints: {
    pooler: pooledDatabaseUrl ? { host: pooledDatabaseUrl.hostname, port: pooledDatabaseUrl.port || '5432', user: decodeURIComponent(pooledDatabaseUrl.username) } : null,
    direct: directDatabaseUrl ? { host: directDatabaseUrl.hostname, port: directDatabaseUrl.port || '5432', user: decodeURIComponent(directDatabaseUrl.username) } : null,
    credentialsMatch: Boolean(pooledDatabaseUrl && directDatabaseUrl && pooledDatabaseUrl.username === directDatabaseUrl.username && pooledDatabaseUrl.password === directDatabaseUrl.password),
    configuredPoolerStatus,
    repairedPoolerStatus,
    directStatus
  }
};
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'PASS') process.exitCode = 2;
