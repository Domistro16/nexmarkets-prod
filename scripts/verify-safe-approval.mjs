import { existsSync } from 'node:fs';
import process from 'node:process';
import { Contract, JsonRpcProvider, getAddress, isHexString } from 'ethers';

const CHAIN_ID = 4663n;
const MAGIC_VALUE = '0x1626ba7e';
const ABI = [
  'function isValidSignature(bytes32 hash,bytes signature) view returns (bytes4)',
  'function isValidSignature(bytes data,bytes signature) view returns (bytes4)',
  'function getThreshold() view returns (uint256)',
  'function getOwners() view returns (address[])',
];

function fail(message) {
  throw new Error(message);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing ${name}.`);
  return value;
}

if (existsSync('.env') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env');

try {
  const rpcUrl = required('RH_MAINNET_RPC_URL');
  const safeAddress = getAddress(required('PROTOCOL_ADMIN_SAFE_ADDRESS'));
  const manifestSha256 = required('PROTOCOL_ADMIN_SAFE_APPROVED_HASH').replace(/^0x/u, '').toLowerCase();
  const signature = required('PROTOCOL_ADMIN_SAFE_SIGNATURE');
  const expectedThreshold = process.env.PROTOCOL_ADMIN_SAFE_EXPECTED_THRESHOLD?.trim() || null;
  if (!/^[0-9a-f]{64}$/u.test(manifestSha256)) fail('PROTOCOL_ADMIN_SAFE_APPROVED_HASH must be a 32-byte SHA-256 digest.');
  if (!isHexString(signature)) fail('PROTOCOL_ADMIN_SAFE_SIGNATURE must be a hex-encoded signature.');
  const digest = `0x${manifestSha256}`;
  const provider = new JsonRpcProvider(rpcUrl, Number(CHAIN_ID), { staticNetwork: true });
  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN_ID) fail(`RPC chain ID ${network.chainId} does not match Robinhood Chain ${CHAIN_ID}.`);
  if ((await provider.getCode(safeAddress)) === '0x') fail(`No contract code at Protocol Admin Safe ${safeAddress}.`);

  const safe = new Contract(safeAddress, ABI, provider);
  const [safeThreshold, safeOwners] = await Promise.all([safe.getThreshold(), safe.getOwners()]);
  const threshold = BigInt(safeThreshold);
  const thresholdValid = expectedThreshold === null || threshold === BigInt(expectedThreshold);
  const checks = [];
  for (const [label, call] of [
    ['bytes32', () => safe['isValidSignature(bytes32,bytes)'](digest, signature)],
    ['bytes', () => safe['isValidSignature(bytes,bytes)'](digest, signature)],
  ]) {
    try {
      const result = String(await call()).toLowerCase();
      checks.push({ method: label, magicValue: result, valid: result === MAGIC_VALUE });
    } catch (error) {
      checks.push({ method: label, valid: false, error: error.shortMessage || error.message });
    }
  }
  checks.push({
    method: 'threshold',
    expected: expectedThreshold === null ? null : Number(expectedThreshold),
    actual: Number(threshold),
    valid: thresholdValid,
  });
  const signatureValid = checks.some((item) => item.method !== 'threshold' && item.valid);
  const valid = signatureValid && thresholdValid;
  console.log(JSON.stringify({
    chainId: Number(CHAIN_ID),
    safeAddress,
    manifestSha256,
    safeOwners,
    safeThreshold: Number(threshold),
    governanceProfile: threshold === 1n ? 'BOOTSTRAP_ONLY_THRESHOLD_1' : 'MULTISIG_THRESHOLD_2_PLUS',
    valid,
    checks,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} catch (error) {
  console.error(`Safe approval verification blocked: ${error.message}`);
  process.exitCode = 1;
}
