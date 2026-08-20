import { readFile } from 'node:fs/promises';

const template = JSON.parse(await readFile(new URL('../deployments/nexmarkets-v1.template.json', import.meta.url), 'utf8'));
if (template.mainnetDeploymentPerformed !== false || template.deploymentStatus !== 'NOT_DEPLOYED') throw new Error('mainnet deployment guard missing');
const policy = template.governancePolicy;
if (policy.minimumOwners !== 2 || policy.minimumInitialThreshold !== 1 || policy.initialThresholdOnePermitted !== true || policy.plannedTransition !== 'RAISE_THRESHOLD_TO_2_PLUS') throw new Error('Safe governance policy mismatch');
for (const network of ['robinhood-mainnet','robinhood-testnet']) {
  const tba = JSON.parse(await readFile(new URL(`../deployments/erc6551.${network}.json`, import.meta.url), 'utf8'));
  if (tba.registry.address.toLowerCase() !== '0x000000006551c19487814612e58fe06813775758') throw new Error('wrong canonical ERC-6551 registry');
  if (!/^0x[0-9a-f]{64}$/.test(tba.accountImplementation.expectedBuildRuntimeCodeHash)) throw new Error('unpinned TBA implementation build');
  if (tba.mainnetDeploymentPerformed !== false) throw new Error('deployment evidence fabricated');
}
console.log(JSON.stringify({ status: 'PASS', deployment: 'NOT_PERFORMED', governance: policy.plannedTransition }));
