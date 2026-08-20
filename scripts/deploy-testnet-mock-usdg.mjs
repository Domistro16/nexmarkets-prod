import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress, isAddress, keccak256 } from 'ethers';

const NETWORK = 'robinhood-testnet';
const CHAIN_ID = 46630n;
const CONFIRM = 'I_UNDERSTAND_THIS_SUBMITS_A_TESTNET_TRANSACTION';
const artifactUrl = new URL('../packages/contracts/out/MockUSDG.sol/MockUSDG.json', import.meta.url);
const outputUrl = new URL('../artifacts/deployment-plan/robinhood-testnet.mock-usdg.json', import.meta.url);

function fail(message) {
  throw new Error(message);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing ${name}.`);
  return value;
}

if (process.argv.includes('--mainnet') || process.argv.includes('--network=robinhood-mainnet')) {
  fail('MockUSDG is testnet-only; mainnet deployment is refused.');
}

const rpcUrl = required('RH_TESTNET_RPC_URL');
const ownerRaw = process.env.TESTNET_MOCK_USDG_OWNER?.trim();
if (!isAddress(ownerRaw ?? '')) fail('TESTNET_MOCK_USDG_OWNER must be the Protocol Admin Safe address.');
const owner = getAddress(ownerRaw);
let artifact;
try {
  artifact = JSON.parse(await readFile(artifactUrl, 'utf8'));
} catch {
  fail('BLOCKED: build packages/contracts first so the MockUSDG artifact exists.');
}
const bytecode = artifact.bytecode?.object;
if (!bytecode || bytecode === '0x') fail('MockUSDG creation bytecode is missing.');

const provider = new JsonRpcProvider(rpcUrl, Number(CHAIN_ID), { staticNetwork: true });
const observedNetwork = await provider.getNetwork();
if (observedNetwork.chainId !== CHAIN_ID) fail(`RPC chain ID ${observedNetwork.chainId} does not match ${CHAIN_ID}.`);
const factory = new ContractFactory(artifact.abi, bytecode, provider);
const unsigned = await factory.getDeployTransaction(owner);
const initCode = unsigned.data;
const base = {
  schemaVersion: 1,
  network: NETWORK,
  chainId: Number(CHAIN_ID),
  testnetOnly: true,
  owner,
  initCodeHash: keccak256(initCode),
  creationBytecodeSha256: createHash('sha256').update(Buffer.from(bytecode.slice(2), 'hex')).digest('hex'),
  status: 'DRY_RUN_ONLY',
  deploymentTxHash: null,
  deployedAddress: null,
};

if (!process.argv.includes('--broadcast')) {
  await mkdir(new URL('../artifacts/deployment-plan/', import.meta.url), { recursive: true });
  await writeFile(outputUrl, `${JSON.stringify(base, null, 2)}\n`);
  console.log(JSON.stringify(base));
} else {
  if (process.env.MOCK_USDG_DEPLOY_CONFIRM !== CONFIRM) fail(`Broadcast blocked. Set MOCK_USDG_DEPLOY_CONFIRM=${CONFIRM}.`);
  const privateKey = required('DEPLOYER_PRIVATE_KEY');
  const wallet = new Wallet(privateKey, provider);
  const deployer = await wallet.getAddress();
  if ((await provider.getBalance(deployer)) === 0n) fail(`Deployer ${deployer} has no testnet ETH for gas.`);
  const deployed = await new ContractFactory(artifact.abi, bytecode, wallet).deploy(owner);
  const receipt = await deployed.deploymentTransaction().wait();
  const address = await deployed.getAddress();
  const code = await provider.getCode(address);
  if (code === '0x') fail(`MockUSDG transaction ${receipt.hash} mined without runtime code.`);
  const token = new Contract(address, artifact.abi, provider);
  const [symbol, decimals, actualOwner] = await Promise.all([token.symbol(), token.decimals(), token.owner()]);
  if (symbol !== 'USDG' || Number(decimals) !== 6 || getAddress(actualOwner) !== owner) fail('MockUSDG runtime verification failed.');
  const record = { ...base, status: receipt.status === 1 ? 'DEPLOYED_VERIFIED' : 'DEPLOYMENT_REVERTED', deployedAddress: address, deploymentTxHash: receipt.hash, blockNumber: receipt.blockNumber, deployer, runtimeCodeHash: keccak256(code) };
  await mkdir(new URL('../artifacts/deployment-plan/', import.meta.url), { recursive: true });
  await writeFile(outputUrl, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record));
}
