import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Interface } from 'ethers';

const root = new URL('../', import.meta.url);
const network = process.argv.includes('--mainnet') ? 'robinhood-mainnet' : 'robinhood-testnet';
const plan = JSON.parse(await readFile(new URL(`artifacts/deployment-plan/${network}.json`, root), 'utf8'));
if (plan.status !== 'DRY_RUN_ONLY' || plan.mainnetDeploymentPerformed !== false) throw new Error('unsafe or malformed deployment plan');
if (plan.sourceVerification?.mode !== 'FROZEN_SOURCE_COMMIT' || !/^[0-9a-f]{40}$/i.test(plan.sourceCommit ?? '')) {
  throw new Error('SAFE_BUNDLE_SOURCE_COMMIT_REQUIRED');
}

const factory = new Interface(['function safeCreate2(bytes32 salt,bytes initializationCode) payable returns (address)']);
const setters = {
  'setFactory(address)': new Interface(['function setFactory(address)']),
  'setInitializer(address)': new Interface(['function setInitializer(address)']),
  'setAdvantageInitializer(address)': new Interface(['function setAdvantageInitializer(address)']),
  'setListingRegistry(address)': new Interface(['function setListingRegistry(address)']),
  'setZone(address)': new Interface(['function setZone(address)']),
  'setListingAuthority(address)': new Interface(['function setListingAuthority(address)'])
};

function bundle(name, transactions, status) {
  return {
    version: '1.0', chainId: String(plan.chainId),
    createdAt: Date.now(),
    meta: { name, description: `${status}; source ${plan.sourceCommit}`, txBuilderVersion: '1.18.0', createdFromSafeAddress: plan.governance.safe },
    transactions
  };
}
const deployments = Object.values(plan.contracts).map((contract) => ({
  to: plan.primitives.immutableCreate2Factory, value: '0', data: factory.encodeFunctionData('safeCreate2', [contract.salt, contract.initCode])
}));
const wiring = plan.wiring.map((call) => ({
  to: call.target, value: '0', data: setters[call.call].encodeFunctionData(call.call.slice(0, call.call.indexOf('(')), call.args)
}));

await mkdir(new URL('artifacts/deployment-plan/', root), { recursive: true });
await writeFile(new URL(`artifacts/deployment-plan/${network}.deploy.safe.json`, root), `${JSON.stringify(bundle('NexMarkets V1 deploy', deployments, 'DEPLOYMENT_PHASE'), null, 2)}\n`);
await writeFile(new URL(`artifacts/deployment-plan/${network}.wire.safe.json`, root), `${JSON.stringify(bundle('NexMarkets V1 one-time wiring', wiring, 'BLOCKED_UNTIL_RUNTIME_AND_IMMUTABLE_VERIFICATION_PASS'), null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', mode: 'SAFE_BUNDLES_ONLY', network, deploymentTransactions: deployments.length, wiringTransactions: wiring.length }));
