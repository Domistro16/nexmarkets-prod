import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deploymentPath = resolve(root, 'deployments/robinhood-testnet.v1-deployment.json');
const releasePath = resolve(root, 'deployments/MAINNET_RELEASE_CANDIDATE.json');
const editionPath = resolve(root, 'artifacts/testnet-certification/edition.json');
const outputPath = resolve(root, 'apps/web/public/config.json');

const deployment = JSON.parse(await readFile(deploymentPath, 'utf8'));
const release = JSON.parse(await readFile(releasePath, 'utf8'));
const editionEvidence = JSON.parse(await readFile(editionPath, 'utf8'));
const testnet = release.testnet;
const subgraph = release.goldsky?.testnetSubgraph;

function requireAddress(value, label) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value ?? '')) throw new Error(`TESTNET_CONFIG_INVALID:${label}`);
  return value;
}

if (deployment.network !== 'robinhood-testnet' || deployment.chainId !== 46630) throw new Error('TESTNET_CONFIG_NETWORK_MISMATCH');
if (testnet?.network !== 'robinhood-testnet' || testnet.chainId !== 46630) throw new Error('TESTNET_CONFIG_RELEASE_MANIFEST_MISMATCH');
if (!subgraph?.graphqlEndpoint || subgraph.name !== 'nexmarkets-v1-robinhood-testnet/1.0.1') throw new Error('TESTNET_CONFIG_SUBGRAPH_REQUIRED');

const contracts = {
  launchRegistry: requireAddress(deployment.contracts.NexLaunchRegistry.address, 'launchRegistry'),
  mintController: requireAddress(deployment.contracts.NexMintController.address, 'mintController'),
  passFactory: requireAddress(deployment.contracts.NexPassFactory.address, 'passFactory'),
  advantageRegistry: requireAddress(deployment.contracts.NexAdvantageRegistry.address, 'advantageRegistry'),
  advantageInitializer: requireAddress(deployment.contracts.NexAdvantageInitializer.address, 'advantageInitializer'),
  royaltyVault: requireAddress(deployment.contracts.NexRoyaltyVault.address, 'royaltyVault'),
  listingRegistry: requireAddress(deployment.contracts.NexListingRegistry.address, 'listingRegistry'),
  zone: requireAddress(deployment.contracts.NexMarketsZone.address, 'zone'),
  passAccount: requireAddress(deployment.contracts.NexPassAccount.address, 'passAccount'),
  tbaResolver: requireAddress(deployment.contracts.NexTBAResolver.address, 'tbaResolver')
};

const config = {
  network: 'robinhood-testnet',
  chainId: 46630,
  rpcUrl: 'https://rpc.testnet.chain.robinhood.com',
  explorer: 'https://explorer.testnet.chain.robinhood.com',
  settlementToken: requireAddress(deployment.mockUsdg.address, 'mockUsdg'),
  settlementSymbol: 'USDG',
  settlementDecimals: 6,
  seaport16: requireAddress(deployment.primitives.seaport16.address, 'seaport16'),
  protocolAdminSafe: requireAddress(deployment.protocolAdminSafe.address, 'protocolAdminSafe'),
  contracts,
  subgraph: {
    name: subgraph.name,
    endpoint: subgraph.graphqlEndpoint,
    startBlock: subgraph.startBlock,
    deploymentHash: subgraph.deploymentHash
  },
  certificationEdition: {
    address: requireAddress(deployment.certificationEdition.edition, 'certificationEdition'),
    tokenId: '1',
    name: editionEvidence.certification.name,
    termsHash: deployment.certificationEdition.termsHash
  },
  testnetOnly: true,
  runtimeReady: true,
  productionReady: false
};

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', output: 'apps/web/public/config.json', network: config.network, chainId: config.chainId, subgraph: config.subgraph.name, contractCount: Object.keys(contracts).length }));
