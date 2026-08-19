import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  concat,
  getAddress,
  getCreate2Address,
  keccak256,
  solidityPackedKeccak256,
  zeroPadValue,
} from 'ethers';

const CHAIN_ID = 4663n;
const MINIMUM_SAFE_OWNERS = 2;
const DEFAULT_SINGLETON = '0x41675C099F32341bf84BFc5382aF534df5C7461a';
const DEFAULT_PROXY_FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
const DEFAULT_PROXY_FACTORY_CODE_HASH = '0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317';
const DEFAULT_FALLBACK_HANDLER = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99';
const MANIFEST_PATH = resolve('deployments/robinhood-mainnet.bootstrap.json');
const OUTPUT_PATH = resolve('artifacts/safe-deployment/robinhood-mainnet.protocol-admin-safe.json');

const FACTORY_ABI = [
  'function createProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)',
  'function createChainSpecificProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)',
  'function getChainId() view returns (uint256)',
  'function proxyCreationCode() view returns (bytes)',
  'event ProxyCreation(address indexed proxy,address singleton)',
];
const SAFE_ABI = [
  'function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function VERSION() view returns (string)',
];

function fail(message) {
  throw new Error(message);
}

function env(name, { required = true } = {}) {
  const value = process.env[name]?.trim();
  if (required && !value) fail(`Missing ${name}. Configure it in .env or the process environment.`);
  return value || undefined;
}

function parseAddressList(value) {
  const addresses = value
    .split(/[\s,]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => getAddress(item));
  if (addresses.length === 0) fail('SAFE_OWNER_ADDRESSES must contain at least one owner address.');
  const unique = new Set(addresses.map((item) => item.toLowerCase()));
  if (unique.size !== addresses.length) fail('SAFE_OWNER_ADDRESSES contains duplicate addresses.');
  return addresses.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function parseUint(name, fallback) {
  const value = process.env[name]?.trim() || fallback;
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) fail(`${name} must be non-negative.`);
    return parsed;
  } catch {
    fail(`${name} must be an integer.`);
  }
}

function sameAddressList(left, right) {
  return left.length === right.length && left.every((item, index) => item.toLowerCase() === right[index].toLowerCase());
}

function asJson(value) {
  return JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item), 2) + '\n';
}

function canonicalUtf8(bytes) {
  // GitHub's checkout and the frozen SHA256SUMS use LF bytes. Normalize a
  // Windows CRLF working tree before hashing so Safe approval is portable.
  return Buffer.from(bytes.toString('utf8').replace(/\r\n?/gu, '\n'), 'utf8');
}

function loadDotEnv() {
  if (!existsSync('.env') || typeof process.loadEnvFile !== 'function') return;
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    fail(`Unable to load .env: ${error.message}`);
  }
}

async function main() {
  loadDotEnv();

  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    console.log([
      'Safe v1.4.1 deployment planner for Robinhood Chain (4663).',
      '',
      'Default: read-only plan. Broadcast only with --broadcast and',
      'SAFE_DEPLOY_CONFIRM=I_UNDERSTAND_THIS_SUBMITS_A_TRANSACTION.',
      '',
      'Required environment:',
      '  RH_MAINNET_RPC_URL',
      '  SAFE_OWNER_ADDRESSES (comma/space-separated; sorted before setup)',
      '  SAFE_THRESHOLD',
      '',
      'Broadcast-only environment:',
      '  DEPLOYER_PRIVATE_KEY',
      '',
      'Optional:',
      `  SAFE_SINGLETON_ADDRESS (default ${DEFAULT_SINGLETON})`,
      `  SAFE_PROXY_FACTORY_ADDRESS (default ${DEFAULT_PROXY_FACTORY})`,
      `  SAFE_FALLBACK_HANDLER_ADDRESS (default ${DEFAULT_FALLBACK_HANDLER})`,
      '  SAFE_SALT_NONCE (default 0)',
      '  SAFE_CHAIN_SPECIFIC (default 1; use 0 only if cross-chain-compatible addresses are intended)',
    ].join('\n'));
    return;
  }

  const rpcUrl = env('RH_MAINNET_RPC_URL');
  const ownersRaw = env('SAFE_OWNER_ADDRESSES');
  const owners = parseAddressList(ownersRaw);
  if (owners.length < MINIMUM_SAFE_OWNERS) {
    fail(`SAFE_OWNER_ADDRESSES must contain at least ${MINIMUM_SAFE_OWNERS} owners for production governance.`);
  }
  const threshold = parseUint('SAFE_THRESHOLD');
  if (threshold === 0n || threshold > BigInt(owners.length)) {
    fail(`SAFE_THRESHOLD must be between 1 and ${owners.length}.`);
  }
  const governanceProfile =
    threshold === 1n ? 'INITIAL_PRODUCTION_THRESHOLD_1_MINIMUM_2_OWNERS' : 'MULTISIG_THRESHOLD_2_PLUS';

  const singletonAddress = getAddress(process.env.SAFE_SINGLETON_ADDRESS?.trim() || DEFAULT_SINGLETON);
  const factoryAddress = getAddress(process.env.SAFE_PROXY_FACTORY_ADDRESS?.trim() || DEFAULT_PROXY_FACTORY);
  const fallbackHandler = getAddress(process.env.SAFE_FALLBACK_HANDLER_ADDRESS?.trim() || DEFAULT_FALLBACK_HANDLER);
  const saltNonce = parseUint('SAFE_SALT_NONCE', '0');
  const chainSpecific = (process.env.SAFE_CHAIN_SPECIFIC?.trim() || '1') !== '0';

  const manifestBytes = canonicalUtf8(await readFile(MANIFEST_PATH));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
  const expectedSingletonHash = manifest.primitives?.safeSingleton?.expectedRuntimeCodeHash?.toLowerCase();
  if (!expectedSingletonHash) fail('Manifest is missing the pinned Safe singleton runtime hash.');

  const provider = new JsonRpcProvider(rpcUrl, Number(CHAIN_ID), { staticNetwork: true });
  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN_ID) fail(`RPC chain ID ${network.chainId} does not match Robinhood Chain ${CHAIN_ID}.`);

  const [singletonCode, factoryCode, fallbackCode] = await Promise.all([
    provider.getCode(singletonAddress),
    provider.getCode(factoryAddress),
    provider.getCode(fallbackHandler),
  ]);
  if (singletonCode === '0x') fail(`Safe singleton has no runtime code at ${singletonAddress}.`);
  if (factoryCode === '0x') fail(`Safe proxy factory has no runtime code at ${factoryAddress}.`);
  if (fallbackCode === '0x') fail(`Safe fallback handler has no runtime code at ${fallbackHandler}.`);
  const observedSingletonHash = keccak256(singletonCode).toLowerCase();
  if (observedSingletonHash !== expectedSingletonHash) {
    fail(`Safe singleton hash mismatch: expected ${expectedSingletonHash}, observed ${observedSingletonHash}.`);
  }

  const safeInterface = new Interface(SAFE_ABI);
  const initializer = safeInterface.encodeFunctionData('setup', [
    owners,
    threshold,
    '0x0000000000000000000000000000000000000000',
    '0x',
    fallbackHandler,
    '0x0000000000000000000000000000000000000000',
    0n,
    '0x0000000000000000000000000000000000000000',
  ]);
  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
  const [factoryChainId, proxyCreationCode] = await Promise.all([factory.getChainId(), factory.proxyCreationCode()]);
  if (BigInt(factoryChainId) !== CHAIN_ID) fail(`Safe proxy factory reports chain ID ${factoryChainId}, not ${CHAIN_ID}.`);
  const factoryHash = keccak256(factoryCode).toLowerCase();
  if (factoryHash !== DEFAULT_PROXY_FACTORY_CODE_HASH) {
    fail(`Safe proxy factory hash mismatch: expected ${DEFAULT_PROXY_FACTORY_CODE_HASH}, observed ${factoryHash}.`);
  }
  const fallbackHandlerHash = keccak256(fallbackCode).toLowerCase();
  const salt = chainSpecific
    ? solidityPackedKeccak256(['bytes32', 'uint256', 'uint256'], [keccak256(initializer), saltNonce, CHAIN_ID])
    : solidityPackedKeccak256(['bytes32', 'uint256'], [keccak256(initializer), saltNonce]);
  const deploymentData = concat([proxyCreationCode, zeroPadValue(singletonAddress, 32)]);
  const predictedAddress = getAddress(getCreate2Address(factoryAddress, salt, keccak256(deploymentData)));
  const existingCode = await provider.getCode(predictedAddress);
  const baseRecord = {
    schemaVersion: 1,
    network: 'robinhood-mainnet',
    chainId: Number(CHAIN_ID),
    sourceCommit: manifest.sourceCommit ?? null,
    manifestSha256,
    safeVersion: '1.4.1',
    singletonAddress,
    singletonRuntimeCodeHash: observedSingletonHash,
    proxyFactoryAddress: factoryAddress,
    proxyFactoryRuntimeCodeHash: factoryHash,
    fallbackHandler,
    fallbackHandlerRuntimeCodeHash: fallbackHandlerHash,
    owners,
    minimumOwnerCount: MINIMUM_SAFE_OWNERS,
    threshold: threshold.toString(),
    governanceProfile,
    productionDeploymentAuthority:
      threshold === 1n ? 'INITIAL_PRODUCTION_THRESHOLD_1_PERMITTED' : 'CANDIDATE_REQUIRES_RELEASE_APPROVAL',
    plannedGovernanceTransition: threshold === 1n ? 'RAISE_THRESHOLD_TO_2_PLUS' : 'NONE',
    saltNonce: saltNonce.toString(),
    chainSpecific,
    create2Salt: salt,
    predictedAddress,
    deployedAddress: existingCode === '0x' ? null : predictedAddress,
    status: existingCode === '0x' ? 'PLANNED' : 'ALREADY_DEPLOYED',
    deploymentTxHash: null,
  };

  if (!args.has('--broadcast')) {
    console.log(asJson(baseRecord));
    return;
  }
  if (process.env.SAFE_DEPLOY_CONFIRM !== 'I_UNDERSTAND_THIS_SUBMITS_A_TRANSACTION') {
    fail('Broadcast blocked. Set SAFE_DEPLOY_CONFIRM=I_UNDERSTAND_THIS_SUBMITS_A_TRANSACTION after reviewing the plan.');
  }
  if (existingCode !== '0x') {
    const safe = new Contract(predictedAddress, SAFE_ABI, provider);
    const [actualOwners, actualThreshold, version] = await Promise.all([
      safe.getOwners(),
      safe.getThreshold(),
      safe.VERSION(),
    ]);
    if (!sameAddressList(actualOwners, owners) || BigInt(actualThreshold) !== threshold || version !== '1.4.1') {
      fail(`Safe already exists at ${predictedAddress} but its owners, threshold, or version differ from the requested configuration.`);
    }
    console.log(asJson({ ...baseRecord, safeVersion: version, status: 'ALREADY_DEPLOYED_VERIFIED' }));
    return;
  }

  const privateKey = env('DEPLOYER_PRIVATE_KEY');
  const wallet = new Wallet(privateKey, provider);
  const deployer = await wallet.getAddress();
  const balance = await provider.getBalance(deployer);
  if (balance === 0n) fail(`Deployer ${deployer} has zero native balance for gas.`);
  const connectedFactory = factory.connect(wallet);
  const tx = chainSpecific
    ? await connectedFactory.createChainSpecificProxyWithNonce(singletonAddress, initializer, saltNonce)
    : await connectedFactory.createProxyWithNonce(singletonAddress, initializer, saltNonce);
  console.log(asJson({ ...baseRecord, status: 'SUBMITTED', deployer, deploymentTxHash: tx.hash }));
  const receipt = await tx.wait();
  const deployedCode = await provider.getCode(predictedAddress);
  if (deployedCode === '0x') fail(`Transaction ${tx.hash} mined but no Safe code is present at ${predictedAddress}.`);
  const result = {
    ...baseRecord,
    status: receipt.status === 1 ? 'DEPLOYED_VERIFIED' : 'DEPLOYMENT_REVERTED',
    deployedAddress: predictedAddress,
    deployer,
    deploymentTxHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, asJson(result), 'utf8');
  console.log(asJson(result));
}

main().catch((error) => {
  console.error(`Safe deployment blocked: ${error.message}`);
  if (process.env.DEBUG_SAFE_DEPLOY === '1') console.error(error.stack);
  process.exitCode = 1;
});
