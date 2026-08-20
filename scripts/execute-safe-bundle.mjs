import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Interface, JsonRpcProvider, Wallet, Contract, getAddress, keccak256, ZeroAddress } from 'ethers';

const root = new URL('../', import.meta.url);
const network = process.argv.find((arg) => arg.startsWith('--network='))?.slice('--network='.length) ?? 'robinhood-testnet';
const phase = process.argv.find((arg) => arg.startsWith('--phase='))?.slice('--phase='.length) ?? 'deploy';
const planShaArg = process.argv.find((arg) => arg.startsWith('--plan-sha256='))?.slice('--plan-sha256='.length)?.toLowerCase();
const broadcast = process.argv.includes('--broadcast');
const confirmation = 'I_UNDERSTAND_THIS_SUBMITS_A_TESTNET_SAFE_TRANSACTION';
if (network !== 'robinhood-testnet') throw new Error('TESTNET_ONLY_SAFE_BUNDLE_EXECUTOR');
if (phase !== 'deploy' && phase !== 'wire') throw new Error('SAFE_BUNDLE_PHASE_INVALID');

const planUrl = new URL(`artifacts/deployment-plan/${network}.json`, root);
const bundleUrl = new URL(`artifacts/deployment-plan/${network}.${phase === 'deploy' ? 'deploy' : 'wire'}.safe.json`, root);
const planBytes = await readFile(planUrl);
const planSha256 = createHash('sha256').update(planBytes.toString('utf8').replace(/\r\n?/gu, '\n')).digest('hex');
const plan = JSON.parse(planBytes.toString('utf8'));
const bundle = JSON.parse(await readFile(bundleUrl, 'utf8'));
if (plan.status !== 'DRY_RUN_ONLY' || plan.mainnetDeploymentPerformed !== false) throw new Error('SAFE_BUNDLE_PLAN_UNSAFE');
if (plan.sourceCommit !== '8790b635ba55512e5d0e295fb1217a3993ecdafb' || plan.sourceVerification?.mode !== 'FROZEN_SOURCE_COMMIT') throw new Error('SAFE_BUNDLE_SOURCE_MISMATCH');
if (planShaArg && planShaArg !== planSha256) throw new Error(`SAFE_BUNDLE_PLAN_SHA_MISMATCH expected ${planShaArg} actual ${planSha256}`);
if (broadcast && !planShaArg) throw new Error('SAFE_BUNDLE_PLAN_SHA_REQUIRED');
if (bundle.meta?.description && !bundle.meta.description.includes(plan.sourceCommit)) throw new Error('SAFE_BUNDLE_SOURCE_METADATA_MISMATCH');
if (!Array.isArray(bundle.transactions) || bundle.transactions.length !== (phase === 'deploy' ? 10 : 6)) throw new Error('SAFE_BUNDLE_TRANSACTION_COUNT_MISMATCH');

const rpcUrl = process.env.RH_TESTNET_RPC_URL?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpcUrl) throw new Error('Missing RH_TESTNET_RPC_URL');
if (broadcast && !privateKey) throw new Error('Missing DEPLOYER_PRIVATE_KEY');
const provider = new JsonRpcProvider(rpcUrl, 46630, { staticNetwork: true });
if ((await provider.getNetwork()).chainId !== 46630n) throw new Error('TESTNET_CHAIN_ID_MISMATCH');
const safeAddress = getAddress(plan.governance.safe);
const safeAbi = [
  'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)',
  'function VERSION() view returns(string)',
  'function nonce() view returns(uint256)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns(bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns(bool)'
];
const safe = new Contract(safeAddress, safeAbi, provider);
const [owners, threshold, version, safeCode] = await Promise.all([
  safe.getOwners(), safe.getThreshold(), safe.VERSION(), provider.getCode(safeAddress)
]);
if (safeCode === '0x' || version !== '1.4.1') throw new Error('SAFE_RUNTIME_UNVERIFIED');
if (owners.length < 2 || BigInt(threshold) < 1n) throw new Error('SAFE_GOVERNANCE_UNVERIFIED');
const signer = broadcast ? new Wallet(privateKey, provider) : null;
if (signer) {
  const signerAddress = (await signer.getAddress()).toLowerCase();
  if (!owners.some((owner) => owner.toLowerCase() === signerAddress)) throw new Error('DEPLOYER_IS_NOT_SAFE_OWNER');
}

const factoryInterface = new Interface(['function safeCreate2(bytes32 salt,bytes initializationCode) payable returns(address)']);
const contractBySalt = new Map(Object.values(plan.contracts).map((contract) => [contract.salt.toLowerCase(), contract]));
const wiringInterfaces = new Map([
  ['setFactory(address)', new Interface(['function setFactory(address)'])],
  ['setInitializer(address)', new Interface(['function setInitializer(address)'])],
  ['setAdvantageInitializer(address)', new Interface(['function setAdvantageInitializer(address)'])],
  ['setListingRegistry(address)', new Interface(['function setListingRegistry(address)'])],
  ['setZone(address)', new Interface(['function setZone(address)'])],
  ['setListingAuthority(address)', new Interface(['function setListingAuthority(address)'])]
]);
const records = [];
for (const [index, transaction] of bundle.transactions.entries()) {
  if (transaction.value !== '0') throw new Error('SAFE_BUNDLE_TARGET_OR_VALUE_MISMATCH');
  let contract = null;
  if (phase === 'deploy') {
    if (transaction.to.toLowerCase() !== plan.primitives.immutableCreate2Factory.toLowerCase()) throw new Error('SAFE_BUNDLE_TARGET_OR_VALUE_MISMATCH');
    const decoded = factoryInterface.decodeFunctionData('safeCreate2', transaction.data);
    const salt = decoded[0].toLowerCase();
    contract = contractBySalt.get(salt);
    if (!contract) throw new Error('SAFE_BUNDLE_SALT_NOT_IN_PLAN');
    if (keccak256(decoded[1]) !== contract.initCodeHash) throw new Error(`SAFE_BUNDLE_INIT_CODE_MISMATCH ${contract.name}`);
    if ((await provider.getCode(contract.address)) !== '0x') throw new Error(`SAFE_BUNDLE_ADDRESS_OCCUPIED ${contract.name}`);
  } else {
    const expected = plan.wiring?.[index];
    if (!expected || transaction.to.toLowerCase() !== expected.target.toLowerCase()) throw new Error('SAFE_WIRING_TARGET_MISMATCH');
    const wiringInterface = wiringInterfaces.get(expected.call);
    if (!wiringInterface) throw new Error(`SAFE_WIRING_CALL_UNSUPPORTED ${expected.call}`);
    const expectedData = wiringInterface.encodeFunctionData(expected.call.slice(0, expected.call.indexOf('(')), expected.args);
    if (transaction.data.toLowerCase() !== expectedData.toLowerCase()) throw new Error(`SAFE_WIRING_DATA_MISMATCH ${expected.call}`);
    if ((await provider.getCode(expected.target)) === '0x') throw new Error(`SAFE_WIRING_TARGET_UNDEPLOYED ${expected.target}`);
  }
  const nonce = BigInt(await safe.nonce());
  const safeTxGas = 0n;
  const baseGas = 0n;
  const gasPrice = 0n;
  const refundReceiver = ZeroAddress;
  const safeTxHash = await safe.getTransactionHash(transaction.to, 0n, transaction.data, 0, safeTxGas, baseGas, gasPrice, ZeroAddress, refundReceiver, nonce);
  const record = { index, phase, safe: safeAddress, nonce: nonce.toString(), safeTxHash, target: transaction.to, data: transaction.data, contract: contract?.name ?? null, status: 'PLANNED', txHash: null, blockNumber: null };
  if (broadcast) {
    if (process.env.SAFE_BUNDLE_DEPLOY_CONFIRM !== confirmation) throw new Error(`Broadcast blocked. Set SAFE_BUNDLE_DEPLOY_CONFIRM=${confirmation}.`);
    const signature = signer.signingKey.sign(safeTxHash).serialized;
    const tx = await safe.connect(signer).execTransaction(transaction.to, 0n, transaction.data, 0, safeTxGas, baseGas, gasPrice, ZeroAddress, refundReceiver, signature);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`SAFE_EXECUTION_REVERTED ${tx.hash}`);
    if (phase === 'deploy' && (await provider.getCode(contract.address)) === '0x') throw new Error(`SAFE_DEPLOYMENT_CODE_MISSING ${contract.name}`);
    record.status = 'EXECUTED_VERIFIED';
    record.txHash = tx.hash;
    record.blockNumber = receipt.blockNumber;
  }
  records.push(record);
}
const output = { schemaVersion: 1, network, phase, planSha256, sourceCommit: plan.sourceCommit, safe: safeAddress, owners, threshold: threshold.toString(), status: broadcast ? 'EXECUTED_VERIFIED' : 'DRY_RUN_ONLY', transactions: records };
if (broadcast) {
  const outputUrl = new URL(`artifacts/deployment-plan/${network}.${phase}.execution.json`, root);
  await mkdir(new URL('artifacts/deployment-plan/', root), { recursive: true });
  await writeFile(outputUrl, `${JSON.stringify(output, null, 2)}\n`);
}
console.log(JSON.stringify(output, null, 2));
