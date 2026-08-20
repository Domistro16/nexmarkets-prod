import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { AbiCoder, concat, dataSlice, getAddress, getCreate2Address, hexlify, isAddress, keccak256, toUtf8Bytes } from 'ethers';

const root = new URL('../', import.meta.url); const network = process.argv.includes('--mainnet') ? 'robinhood-mainnet' : 'robinhood-testnet';
const inputPath = process.argv.find((arg) => arg.startsWith('--inputs='))?.slice(9) ?? 'deployments/nexmarkets-v1.inputs.example.json';
const inputs = JSON.parse(await readFile(new URL(inputPath, root), 'utf8'));
const bootstrap = JSON.parse(await readFile(new URL(`deployments/${network}.bootstrap.json`, root), 'utf8'));
if (inputs.network !== network) throw new Error('deployment input network mismatch');
if (!isAddress(inputs.protocolAdminSafe ?? '')) throw new Error('BLOCKED: protocolAdminSafe required');
if (!Array.isArray(inputs.safeOwners) || inputs.safeOwners.length < 2 || new Set(inputs.safeOwners.map((owner) => getAddress(owner))).size < 2) throw new Error('BLOCKED: at least two distinct Safe owners required');
if (!Number.isInteger(inputs.safeThreshold) || inputs.safeThreshold < 1 || inputs.safeThreshold > inputs.safeOwners.length) throw new Error('BLOCKED: Safe threshold must be between 1 and owner count');
if (inputs.governanceTransition !== 'RAISE_THRESHOLD_TO_2_PLUS') throw new Error('governance transition must be recorded');
for (const key of ['primaryFeeRecipient','secondaryFeeRecipient']) if (!isAddress(inputs[key] ?? '')) throw new Error(`BLOCKED: ${key} required`);
const settlementToken = network === 'robinhood-mainnet' ? bootstrap.primitives.usdg.address : inputs.mockUsdgAddress;
if (!isAddress(settlementToken ?? '')) throw new Error('BLOCKED: verified settlement token required');

let sourceCommit = 'UNCOMMITTED';
try { sourceCommit = execFileSync('git', ['rev-parse','HEAD'], { cwd: new URL('.', root), encoding: 'utf8' }).trim(); } catch {}
const create2Factory = bootstrap.primitives.immutableCreate2Factory.address;
const coder = AbiCoder.defaultAbiCoder();
const specs = [];
async function artifact(file, contract) { return JSON.parse(await readFile(new URL(`packages/contracts/out/${file}.sol/${contract}.json`, root), 'utf8')); }
function normalizeImmutables(bytecode, immutableReferences = {}) {
  const bytes = bytecode.slice(2).split('');
  for (const references of Object.values(immutableReferences)) for (const { start, length } of references) {
    bytes.splice(start * 2, length * 2, ...'0'.repeat(length * 2));
  }
  return `0x${bytes.join('')}`;
}
async function add(name, file, types, args) {
  const compiled = await artifact(file, name); const bytecode = compiled.bytecode.object;
  if (!bytecode || bytecode === '0x') throw new Error(`missing compiled bytecode for ${name}`);
  const initCode = concat([bytecode, coder.encode(types, args)]);
  // ImmutableCreate2Factory.safeCreate2 requires the first 20 salt bytes to
  // equal msg.sender (the Safe) or be zero. Safe-prefixing prevents third-party
  // predeployment while preserving deterministic addresses.
  const saltDigest = keccak256(toUtf8Bytes(`NEXMARKETS_V1:${network}:${name}:${sourceCommit}`));
  const salt = hexlify(concat([safe, dataSlice(saltDigest, 20)]));
  const address = getCreate2Address(create2Factory, salt, keccak256(initCode));
  const immutableReferences = compiled.deployedBytecode.immutableReferences ?? {};
  const hasImmutables = Object.keys(immutableReferences).length !== 0;
  specs.push({
    name, address, salt, initCode, initCodeHash: keccak256(initCode),
    expectedRuntimeCodeHash: hasImmutables ? null : keccak256(compiled.deployedBytecode.object),
    normalizedRuntimeTemplateHash: keccak256(normalizeImmutables(compiled.deployedBytecode.object, immutableReferences)),
    immutableReferences, deployedRuntimeCodeHash: null,
    runtimeVerificationStatus: hasImmutables ? 'VERIFY_NORMALIZED_THEN_FREEZE_OBSERVED_HASH' : 'EXACT_BUILD_HASH_PINNED'
  });
  return address;
}
const safe = getAddress(inputs.protocolAdminSafe);
const launch = await add('NexLaunchRegistry','NexLaunchRegistry',['address','address'],[safe,settlementToken]);
const mint = await add('NexMintController','NexMintController',['address','address','address','address'],[safe,launch,settlementToken,inputs.primaryFeeRecipient]);
const factory = await add('NexPassFactory','NexPassFactory',['address','address','address','address'],[safe,safe,launch,mint]);
const advantage = await add('NexAdvantageRegistry','NexAdvantageRegistry',['address','address'],[safe,launch]);
const initializer = await add('NexAdvantageInitializer','NexAdvantageInitializer',['address','address','address','address'],[safe,launch,advantage,mint]);
const vault = await add('NexRoyaltyVault','NexRoyaltyVault',['address','address'],[safe,settlementToken]);
const listing = await add('NexListingRegistry','NexListingRegistry',['address','address','address','address','address','address'],[safe,launch,advantage,vault,inputs.secondaryFeeRecipient,bootstrap.primitives.seaport16.address]);
const zone = await add('NexMarketsZone','NexMarketsZone',['address','address','address'],[safe,listing,bootstrap.primitives.seaport16.address]);
const account = await add('NexPassAccount','NexPassAccount',[],[]);
const erc6551 = JSON.parse(await readFile(new URL(`deployments/erc6551.${network}.json`, root), 'utf8'));
const resolver = await add('NexTBAResolver','NexTBAResolver',['address','address','address','bytes32','bytes32'],[factory,erc6551.registry.address,account,erc6551.registry.expectedRuntimeCodeHash,erc6551.accountImplementation.expectedBuildRuntimeCodeHash]);
const plan = {
  schemaVersion: 1, network, chainId: bootstrap.chainId, sourceCommit, status: 'DRY_RUN_ONLY', mainnetDeploymentPerformed: false,
  governance: { safe, owners: inputs.safeOwners.map(getAddress), ownerCount: inputs.safeOwners.length, threshold: inputs.safeThreshold, plannedTransition: inputs.governanceTransition },
  primitives: { settlementToken, seaport16: bootstrap.primitives.seaport16.address, conduitController: bootstrap.primitives.conduitController.address, erc6551Registry: erc6551.registry.address, immutableCreate2Factory: create2Factory },
  contractInputs: { primaryFeeRecipient: getAddress(inputs.primaryFeeRecipient), secondaryFeeRecipient: getAddress(inputs.secondaryFeeRecipient) },
  erc6551: { registryRuntimeCodeHash: erc6551.registry.expectedRuntimeCodeHash, accountRuntimeCodeHash: erc6551.accountImplementation.expectedBuildRuntimeCodeHash },
  contracts: Object.fromEntries(specs.map((spec) => [spec.name, spec])),
  wiring: [
    { target: launch, call: 'setFactory(address)', args: [factory] }, { target: advantage, call: 'setInitializer(address)', args: [initializer] },
    { target: mint, call: 'setAdvantageInitializer(address)', args: [initializer] }, { target: vault, call: 'setListingRegistry(address)', args: [listing] },
    { target: listing, call: 'setZone(address)', args: [zone] }, { target: advantage, call: 'setListingAuthority(address)', args: [listing] }
  ],
  abortRule: 'ABORT_BEFORE_ANY_ONE_TIME_WIRING_IF_CODEHASH_OR_IMMUTABLE_CHECK_FAILS', resolver
};
await mkdir(new URL('artifacts/deployment-plan/', root), { recursive: true });
const output = new URL(`artifacts/deployment-plan/${network}.json`, root); await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', mode: 'DRY_RUN_ONLY', network, contracts: specs.length, output: output.pathname }));
