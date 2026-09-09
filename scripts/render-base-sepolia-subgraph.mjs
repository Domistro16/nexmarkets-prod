import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceDir = resolve(root, 'subgraph');
const outputDir = resolve(root, 'artifacts/subgraph/base-sepolia');
const deployment = JSON.parse(await readFile(resolve(root, 'deployments/base-sepolia.v1-deployment.json'), 'utf8'));

const sources = {
  NexPassFactory: ['NexPassFactory', deployment.contracts.NexPassFactory.deploymentBlock],
  NexLaunchRegistry: ['NexLaunchRegistry', deployment.contracts.NexLaunchRegistry.deploymentBlock],
  NexMintController: ['NexMintController', deployment.contracts.NexMintController.deploymentBlock],
  NexAdvantageRegistry: ['NexAdvantageRegistry', deployment.contracts.NexAdvantageRegistry.deploymentBlock],
  NexAdvantageInitializer: ['NexAdvantageInitializer', deployment.contracts.NexAdvantageInitializer.deploymentBlock],
  NexListingRegistry: ['NexListingRegistry', deployment.contracts.NexListingRegistry.deploymentBlock],
  NexRoyaltyVault: ['NexRoyaltyVault', deployment.contracts.NexRoyaltyVault.deploymentBlock],
  NexTBAResolver: ['NexTBAResolver', deployment.contracts.NexTBAResolver.deploymentBlock],
  ERC6551Registry: [null, deployment.contracts.NexPassFactory.deploymentBlock],
  Seaport16: [null, deployment.contracts.NexListingRegistry.deploymentBlock]
};

let manifest = await readFile(resolve(sourceDir, 'subgraph.yaml'), 'utf8');
manifest = manifest
  .replace('NexMarkets V1 Robinhood testnet indexed read model', 'NexMarkets V1 Base Sepolia indexed read model')
  .replaceAll('network: robinhood-testnet', 'network: base-sepolia');

for (const [dataSource, [contractName, startBlock]] of Object.entries(sources)) {
  const nextMarker = '\\n  - kind: ethereum';
  const start = manifest.indexOf(`    name: ${dataSource}`);
  if (start < 0) throw new Error(`SUBGRAPH_DATASOURCE_MISSING:${dataSource}`);
  const endCandidate = manifest.indexOf(nextMarker, start);
  const templates = manifest.indexOf('\ntemplates:', start);
  const end = endCandidate >= 0 ? endCandidate : templates >= 0 ? templates : manifest.length;
  let section = manifest.slice(start, end);
  const address = contractName
    ? deployment.contracts[contractName].address
    : dataSource === 'ERC6551Registry'
      ? deployment.primitives.erc6551Registry.address
      : deployment.primitives.seaport16.address;
  section = section
    .replace(/address: "0x[0-9a-fA-F]{40}"/, `address: "${address}"`)
    .replace(/startBlock: \d+/, `startBlock: ${startBlock}`);
  manifest = `${manifest.slice(0, start)}${section}${manifest.slice(end)}`;
}

await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true, force: true, filter: (source) => !source.includes('node_modules') && !source.includes('\\build') && !source.includes('\\generated') });
await writeFile(resolve(outputDir, 'subgraph.yaml'), manifest);
await writeFile(resolve(sourceDir, 'subgraph.base-sepolia.yaml'), manifest);
await writeFile(resolve(outputDir, 'network.json'), `${JSON.stringify({
  network: 'base-sepolia',
  chainId: 84532,
  renderedAt: new Date().toISOString(),
  dataSources: Object.fromEntries(Object.entries(sources).map(([name, [contractName, startBlock]]) => [name, {
    address: contractName ? deployment.contracts[contractName].address : name === 'ERC6551Registry' ? deployment.primitives.erc6551Registry.address : deployment.primitives.seaport16.address,
    startBlock
  }]))
}, null, 2)}\n`);

console.log(JSON.stringify({ status: 'PASS', outputDir, network: 'base-sepolia', chainId: 84532, dataSources: Object.keys(sources).length }));
