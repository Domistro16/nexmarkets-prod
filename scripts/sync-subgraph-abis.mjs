import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const names = [
  'NexPassFactory', 'NexLaunchRegistry', 'NexMintController',
  'NexPassEdition', 'NexAdvantageRegistry', 'NexAdvantageInitializer',
  'NexListingRegistry', 'NexRoyaltyVault', 'NexTBAResolver',
  'ERC6551Registry'
];
const destination = new URL('../subgraph/abis/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of names) {
  const source = new URL(`../packages/contracts/out/${name}.sol/${name}.json`, import.meta.url);
  const artifact = JSON.parse(await readFile(source, 'utf8'));
  await writeFile(new URL(`${name}.json`, destination), `${JSON.stringify(artifact.abi)}\n`);
}
console.log(JSON.stringify({ status: 'PASS', source: 'packages/contracts/out', contracts: names.length }));
