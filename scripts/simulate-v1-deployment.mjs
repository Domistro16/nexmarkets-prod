// Executes a generated deployment plan against a forked node exactly as the
// protocol admin Safe would, then checks every deployed runtime code hash and
// runs the one-time wiring. Proves a plan before it costs gas or consumes the
// one-time wiring slots, which cannot be replayed.
import { readFile } from 'node:fs/promises';
import { JsonRpcProvider, keccak256 } from 'ethers';

const root = new URL('../', import.meta.url);
const network = process.argv.find((arg) => arg.startsWith('--network='))?.slice('--network='.length) ?? 'base-sepolia';
const rpcUrl = process.argv.find((arg) => arg.startsWith('--rpc-url='))?.slice('--rpc-url='.length) ?? 'http://127.0.0.1:8545';

const plan = JSON.parse(await readFile(new URL(`artifacts/deployment-plan/${network}.json`, root), 'utf8'));
const deployBundle = JSON.parse(await readFile(new URL(`artifacts/deployment-plan/${network}.deploy.safe.json`, root), 'utf8'));
const wireBundle = JSON.parse(await readFile(new URL(`artifacts/deployment-plan/${network}.wire.safe.json`, root), 'utf8'));

const provider = new JsonRpcProvider(rpcUrl);
const chainId = Number((await provider.getNetwork()).chainId);
if (chainId !== plan.chainId) throw new Error(`FORK_CHAIN_MISMATCH fork=${chainId} plan=${plan.chainId}`);

const safe = plan.governance.safe;
await provider.send('anvil_impersonateAccount', [safe]);
await provider.send('anvil_setBalance', [safe, '0x21e19e0c9bab2400000']);

function normalizeImmutables(bytecode, immutableReferences = {}) {
  const bytes = bytecode.slice(2).split('');
  for (const references of Object.values(immutableReferences)) {
    for (const { start, length } of references) bytes.splice(start * 2, length * 2, ...'0'.repeat(length * 2));
  }
  return `0x${bytes.join('')}`;
}

async function send(tx, label) {
  const hash = await provider.send('eth_sendTransaction', [{ from: safe, to: tx.to, value: '0x0', data: tx.data, gas: '0x1c9c380' }]);
  const receipt = await provider.waitForTransaction(hash);
  if (receipt.status !== 1) throw new Error(`TX_REVERTED ${label}`);
  return receipt;
}

const results = [];
const names = Object.keys(plan.contracts);
for (const [index, tx] of deployBundle.transactions.entries()) {
  const name = names[index];
  const spec = plan.contracts[name];
  const receipt = await send(tx, `deploy ${name}`);
  const code = await provider.getCode(spec.address);
  if (code === '0x') throw new Error(`NO_CODE_AT_PLANNED_ADDRESS ${name} ${spec.address}`);
  const observed = keccak256(code);
  let check;
  if (spec.expectedRuntimeCodeHash) {
    if (observed !== spec.expectedRuntimeCodeHash) {
      throw new Error(`RUNTIME_HASH_MISMATCH ${name} observed ${observed} expected ${spec.expectedRuntimeCodeHash}`);
    }
    check = 'EXACT_PIN_MATCHED';
  } else {
    const normalized = keccak256(normalizeImmutables(code, spec.immutableReferences));
    if (normalized !== spec.normalizedRuntimeTemplateHash) {
      throw new Error(`NORMALIZED_TEMPLATE_MISMATCH ${name} observed ${normalized} expected ${spec.normalizedRuntimeTemplateHash}`);
    }
    check = 'NORMALIZED_TEMPLATE_MATCHED';
  }
  results.push({ name, address: spec.address, gasUsed: Number(receipt.gasUsed), check });
}

for (const [index, tx] of wireBundle.transactions.entries()) {
  await send(tx, `wire ${plan.wiring[index].call}`);
}

await provider.send('anvil_stopImpersonatingAccount', [safe]);
console.log(JSON.stringify({
  status: 'PASS',
  mode: 'FORK_SIMULATION_ONLY',
  network,
  forkBlock: await provider.getBlockNumber(),
  deployed: results,
  wiringCalls: wireBundle.transactions.length
}, null, 2));
