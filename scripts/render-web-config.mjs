import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionReadinessFromEnv } from '../packages/config/src/production-readiness.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = resolve(root, 'apps/web/public/config.json');
const productionReadiness = productionReadinessFromEnv(process.env);

async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(resolve(root, path), 'utf8')); } catch { return fallback; }
}
function requireAddress(value, label) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value ?? '')) throw new Error(`WEB_CONFIG_INVALID:${label}`);
  return value;
}
function contractsFromDeployment(deployment) {
  const source = deployment?.contracts ?? deployment?.nexmarketsContracts ?? {};
  const value = (name) => {
    const item = source[name] ?? source[name[0].toLowerCase() + name.slice(1)];
    return typeof item === 'string' ? item : item?.address ?? null;
  };
  return {
    launchRegistry: value('NexLaunchRegistry'),
    mintController: value('NexMintController'),
    passFactory: value('NexPassFactory'),
    advantageRegistry: value('NexAdvantageRegistry'),
    advantageInitializer: value('NexAdvantageInitializer'),
    royaltyVault: value('NexRoyaltyVault'),
    listingRegistry: value('NexListingRegistry'),
    zone: value('NexMarketsZone'),
    passAccount: value('NexPassAccount'),
    tbaResolver: value('NexTBAResolver'),
    rewardDistributor: value('NexRewardDistributor')
  };
}

const deployment = await readJson('deployments/robinhood-testnet.v1-deployment.json');
if (deployment?.network !== 'robinhood-testnet' || deployment.chainId !== 46630 || !deployment.runtimeReady) throw new Error('ROBINHOOD_TESTNET_DEPLOYMENT_REQUIRED');
const rhTestnet = {
  protocolVersion: Number(deployment.protocolVersion ?? 2),
  network: 'robinhood-testnet',
  displayName: 'Robinhood',
  family: 'robinhood',
  name: 'Robinhood Chain Testnet',
  chainId: 46630,
  rpcUrl: 'https://rpc.testnet.chain.robinhood.com',
  explorer: 'https://explorer.testnet.chain.robinhood.com',
  nativeGasToken: 'ETH',
  testnetOnly: true,
  runtimeReady: deployment.runtimeReady === true,
  wethSettlementAllowed: false,
  baseAllowed: false
};
rhTestnet.productionReadiness = productionReadiness;
rhTestnet.productionReady = productionReadiness.productionReady;
if (deployment?.network === 'robinhood-testnet') {
  const subgraph = deployment.subgraph;
  if (!subgraph?.endpoint || !subgraph.name?.startsWith('nexmarkets-v1-robinhood-testnet/')) throw new Error('TESTNET_CONFIG_SUBGRAPH_REQUIRED');
  rhTestnet.contracts = contractsFromDeployment(deployment);
  for (const [role, contract] of Object.entries(rhTestnet.contracts)) requireAddress(contract, `robinhoodTestnet.${role}`);
  rhTestnet.settlementToken = requireAddress(deployment.mockUsdg?.address ?? deployment.mockUsdg, 'robinhoodTestnet.settlementToken');
  rhTestnet.settlementSymbol = 'MockUSDG';
  rhTestnet.settlementDecimals = 6;
  rhTestnet.settlement = { address: rhTestnet.settlementToken, symbol: 'MockUSDG', decimals: 6, mock: true, testnetOnly: true };
  rhTestnet.protocolAdminSafe = requireAddress(deployment.protocolAdminSafe?.address ?? deployment.protocolAdminSafe, 'robinhoodTestnet.protocolAdminSafe');
  rhTestnet.seaport16 = requireAddress(deployment.primitives?.seaport16?.address, 'robinhoodTestnet.seaport16');
  rhTestnet.subgraph = subgraph;
  rhTestnet.certificationEdition = deployment.certificationEdition ? {
    address: requireAddress(deployment.certificationEdition.edition, 'robinhoodTestnet.certificationEdition'),
    tokenId: '1',
    name: deployment.certificationEdition.name || 'Outerfield Test Certification Edition',
    termsHash: deployment.certificationEdition.termsHash
  } : null;
}

const auth = {
  cdp: { enabled: false, projectId: null }
};

const config = {
  defaultNetwork: 'robinhood-testnet',
  availableNetworks: ['robinhood-testnet'],
  auth,
  ...rhTestnet,
  networks: { 'robinhood-testnet': rhTestnet }
};
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', output: 'apps/web/public/config.json', networks: config.availableNetworks, runtimeReady: rhTestnet.runtimeReady }));
