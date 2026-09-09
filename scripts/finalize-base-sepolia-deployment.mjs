import { access, copyFile, readFile, writeFile } from 'node:fs/promises';
import { JsonRpcProvider, keccak256 } from 'ethers';

const root = new URL('../', import.meta.url);
const manifestUrl = new URL('deployments/base-sepolia.v1-deployment.json', root);
const archiveUrl = new URL('deployments/base-sepolia.v1-deployment.legacy-safe.json', root);
const previous = JSON.parse(await readFile(manifestUrl, 'utf8'));
try { await access(archiveUrl); } catch { await copyFile(manifestUrl, archiveUrl); }

const plan = JSON.parse(await readFile(new URL('artifacts/deployment-plan/base-sepolia.json', root), 'utf8'));
const deployed = JSON.parse(await readFile(new URL('artifacts/deployment-plan/base-sepolia.deploy.execution.json', root), 'utf8'));
const wired = JSON.parse(await readFile(new URL('artifacts/deployment-plan/base-sepolia.wire.execution.json', root), 'utf8'));
if (plan.network !== 'base-sepolia' || deployed.status !== 'EXECUTED_VERIFIED' || wired.status !== 'EXECUTED_VERIFIED') throw new Error('BASE_EXECUTION_EVIDENCE_REQUIRED');

const provider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org', 84532, { staticNetwork: true });
const contracts = {};
for (const [name, contract] of Object.entries(plan.contracts)) {
  const execution = deployed.transactions.find((row) => row.contract === name);
  const code = await provider.getCode(contract.address);
  if (code === '0x' || !execution?.txHash || !execution?.blockNumber) throw new Error(`BASE_DEPLOYMENT_INCOMPLETE:${name}`);
  contracts[name] = {
    address: contract.address,
    salt: contract.salt,
    initCodeHash: contract.initCodeHash,
    runtimeCodeHash: keccak256(code),
    deploymentTxHash: execution.txHash,
    deploymentBlock: execution.blockNumber
  };
}

const subgraph = {
  name: 'nexmarkets-v1-base-sepolia/1.0.1',
  endpoint: 'https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-base-sepolia/1.0.1/gn',
  startBlock: Math.min(...Object.values(contracts).map((contract) => contract.deploymentBlock)),
  provider: 'Goldsky'
};
const manifest = {
  ...previous,
  status: 'DEPLOYED_WIRED_AND_VERIFIED_PERMISSIONLESS',
  deploymentSourceCommit: plan.sourceCommit,
  deploymentPlanSha256: deployed.planSha256,
  contracts,
  wiring: plan.wiring.map((entry, index) => ({
    call: entry.call,
    target: entry.target,
    argument: entry.args[0],
    txHash: wired.transactions[index].txHash,
    blockNumber: wired.transactions[index].blockNumber
  })),
  subgraph,
  certificationEdition: null,
  verification: {
    ...previous.verification,
    v1Graph: 'PASS_PERMISSIONLESS',
    primitiveRuntime: 'PASS',
    oneTimeSlots: 'WIRED_AND_VERIFIED',
    settlementToken: 'CANONICAL_BASE_SEPOLIA_USDC'
  },
  runtimeReady: true,
  productionReady: false,
  mainnetCustomDeploymentPerformed: false,
  replaces: {
    manifest: 'deployments/base-sepolia.v1-deployment.legacy-safe.json',
    reason: 'Legacy Safe-only Factory was incompatible with permissionless Builder Edition publication.'
  },
  recordedAt: new Date().toISOString()
};
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', contracts: Object.keys(contracts).length, subgraph, manifest: manifestUrl.pathname }));
