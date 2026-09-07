import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = resolve(root, 'apps/web/public/config.json');

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
    tbaResolver: value('NexTBAResolver')
  };
}

const deployment = await readJson('deployments/robinhood-testnet.v1-deployment.json');
const release = await readJson('deployments/MAINNET_RELEASE_CANDIDATE.json', {});
const editionEvidence = await readJson('artifacts/testnet-certification/edition.json', {});
const current = await readJson('apps/web/public/config.json', {});
const { networks: _oldNetworks, defaultNetwork: _oldDefaultNetwork, availableNetworks: _oldAvailableNetworks, ...currentFlat } = current;
const rhTestnet = {
  ...currentFlat,
  network: 'robinhood-testnet',
  displayName: 'Robinhood',
  family: 'robinhood',
  chainId: 46630,
  rpcUrl: current.rpcUrl || 'https://rpc.testnet.chain.robinhood.com',
  explorer: current.explorer || 'https://explorer.testnet.chain.robinhood.com'
};
if (deployment?.network === 'robinhood-testnet') {
  const subgraph = release.goldsky?.testnetSubgraph;
  if (!subgraph?.graphqlEndpoint) throw new Error('TESTNET_CONFIG_SUBGRAPH_REQUIRED');
  rhTestnet.contracts = contractsFromDeployment(deployment);
  rhTestnet.settlementToken = requireAddress(deployment.mockUsdg?.address ?? deployment.mockUsdg, 'robinhoodTestnet.settlementToken');
  rhTestnet.settlementSymbol = 'USDG';
  rhTestnet.settlementDecimals = 6;
  rhTestnet.protocolAdminSafe = requireAddress(deployment.protocolAdminSafe?.address ?? deployment.protocolAdminSafe, 'robinhoodTestnet.protocolAdminSafe');
  rhTestnet.seaport16 = requireAddress(deployment.primitives?.seaport16?.address, 'robinhoodTestnet.seaport16');
  rhTestnet.subgraph = { name: subgraph.name, endpoint: subgraph.graphqlEndpoint, startBlock: subgraph.startBlock, deploymentHash: subgraph.deploymentHash };
  rhTestnet.certificationEdition = {
    address: requireAddress(deployment.certificationEdition?.edition, 'robinhoodTestnet.certificationEdition'),
    tokenId: '1',
    name: editionEvidence.certification?.name || 'NexMarkets V1 Test Certification Edition',
    termsHash: deployment.certificationEdition.termsHash
  };
}

const baseManifest = await readJson('deployments/base-sepolia.bootstrap.json');
const baseDeployment = await readJson('deployments/base-sepolia.v1-deployment.json');
const baseContracts = contractsFromDeployment(baseDeployment);
const base = {
  network: 'base-sepolia',
  displayName: 'Base',
  family: 'base',
  name: 'Base Sepolia',
  chainId: 84532,
  rpcUrl: 'https://sepolia.base.org',
  explorer: 'https://sepolia.basescan.org',
  settlementToken: baseManifest.primitives.usdc.address,
  settlementSymbol: 'USDC',
  settlementDecimals: 6,
  seaport16: baseManifest.primitives.seaport16.address,
  protocolAdminSafe: baseDeployment?.protocolAdminSafe?.address ?? baseDeployment?.protocolAdminSafe ?? null,
  contracts: baseContracts,
  subgraph: baseDeployment?.subgraph ?? null,
  certificationEdition: baseDeployment?.certificationEdition ?? null,
  testnetOnly: true,
  runtimeReady: Boolean(baseDeployment?.runtimeReady),
  productionReady: false
};

const config = {
  defaultNetwork: 'robinhood-testnet',
  availableNetworks: ['robinhood-testnet', 'base-sepolia'],
  ...rhTestnet,
  networks: { 'robinhood-testnet': rhTestnet, 'base-sepolia': base }
};
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', output: 'apps/web/public/config.json', networks: config.availableNetworks, baseRuntimeReady: base.runtimeReady }));
