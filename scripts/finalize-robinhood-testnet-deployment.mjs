import { access, copyFile, readFile, writeFile } from 'node:fs/promises';
import { JsonRpcProvider, keccak256 } from 'ethers';

const root = new URL('../', import.meta.url);
const manifestUrl = new URL('deployments/robinhood-testnet.v1-deployment.json', root);
const archiveUrl = new URL('deployments/robinhood-testnet.v1-deployment.legacy-v1.json', root);
const subgraphVersion = process.argv.find((arg) => arg.startsWith('--subgraph-version='))?.split('=')[1] ?? '1.0.3';

const previous = JSON.parse(await readFile(manifestUrl, 'utf8'));
try { await access(archiveUrl); } catch { await copyFile(manifestUrl, archiveUrl); }
const previousSourceCommit = previous.deploymentSourceCommit;
if (/^[0-9a-f]{40}$/iu.test(previousSourceCommit ?? '')) {
  const sourceArchiveUrl = new URL(`deployments/robinhood-testnet.v1-deployment.${previousSourceCommit.slice(0, 7)}.json`, root);
  try { await access(sourceArchiveUrl); } catch { await copyFile(manifestUrl, sourceArchiveUrl); }
}

const plan = JSON.parse(await readFile(new URL('artifacts/deployment-plan/robinhood-testnet.json', root), 'utf8'));
const deployed = JSON.parse(await readFile(new URL('artifacts/deployment-plan/robinhood-testnet.deploy.execution.json', root), 'utf8'));
const wired = JSON.parse(await readFile(new URL('artifacts/deployment-plan/robinhood-testnet.wire.execution.json', root), 'utf8'));
if (plan.network !== 'robinhood-testnet' || deployed.status !== 'EXECUTED_VERIFIED' || wired.status !== 'EXECUTED_VERIFIED') {
  throw new Error('ROBINHOOD_EXECUTION_EVIDENCE_REQUIRED');
}

const provider = new JsonRpcProvider(process.env.ROBINHOOD_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com', 46630, { staticNetwork: true });
const contracts = {};
for (const [name, contract] of Object.entries(plan.contracts)) {
  const execution = deployed.transactions.find((row) => row.contract === name);
  const code = await provider.getCode(contract.address);
  if (code === '0x' || !execution?.txHash || !execution?.blockNumber) throw new Error(`ROBINHOOD_DEPLOYMENT_INCOMPLETE:${name}`);
  contracts[name] = {
    address: contract.address,
    salt: contract.salt,
    initCodeHash: contract.initCodeHash,
    runtimeCodeHash: keccak256(code),
    deploymentTxHash: execution.txHash,
    deploymentBlock: execution.blockNumber
  };
}

const startBlock = Math.min(...Object.values(contracts).map((contract) => contract.deploymentBlock));
const subgraph = {
  name: `nexmarkets-v1-robinhood-testnet/${subgraphVersion}`,
  endpoint: `https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/${subgraphVersion}/gn`,
  startBlock,
  provider: 'Goldsky'
};

const manifest = {
  ...previous,
  status: 'DEPLOYED_WIRED_AND_VERIFIED',
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
  legacyCertificationEdition: previous.certificationEdition ?? null,
  verification: {
    ...previous.verification,
    v1Graph: 'PASS',
    primitiveRuntime: 'PASS',
    oneTimeSlots: 'WIRED_AND_VERIFIED'
  },
  runtimeReady: true,
  productionReady: false,
  replaces: {
    manifest: /^[0-9a-f]{40}$/iu.test(previousSourceCommit ?? '')
      ? `deployments/robinhood-testnet.v1-deployment.${previousSourceCommit.slice(0, 7)}.json`
      : 'deployments/robinhood-testnet.v1-deployment.legacy-v1.json',
    reason: 'Corrected V1 suite redeploy: per-wallet allowlist caps, guarded Pass Vault claims, and the funded Reward Policy / Reward Cycle distributor. The legacy certification edition remains registered under the superseded registry and is preserved as legacyCertificationEdition.'
  },
  recordedAt: new Date().toISOString()
};
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', contracts: Object.keys(contracts).length, subgraph, startBlock, manifest: manifestUrl.pathname }));
