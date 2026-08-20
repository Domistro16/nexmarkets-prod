import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { AbiCoder, concat, dataSlice, getAddress, getCreate2Address, hexlify, isAddress, keccak256, toUtf8Bytes } from 'ethers';
import {
  FROZEN_V1_DEPLOYMENT_SOURCE,
  FROZEN_V1_CREATION_BYTECODE_HASHES,
  assertDeploymentSourceMatches,
  currentGitCommit,
  resolveDeploymentSourceCommit
} from './deployment-source.mjs';

const root = new URL('../', import.meta.url);
const network = process.argv.includes('--mainnet') ? 'robinhood-mainnet' : 'robinhood-testnet';
const sourceArg = process.argv.find((arg) => arg.startsWith('--source-commit='))?.slice('--source-commit='.length);
const unfrozenDevPlan = process.argv.includes('--unfrozen-dev');
if (sourceArg && unfrozenDevPlan) throw new Error('choose either --source-commit or --unfrozen-dev');
let sourceCommit;
let sourceVerification;
if (sourceArg || process.env.NEXMARKETS_DEPLOYMENT_SOURCE_COMMIT) {
  sourceCommit = resolveDeploymentSourceCommit({ explicit: sourceArg, repoRoot: root });
  if (sourceCommit !== FROZEN_V1_DEPLOYMENT_SOURCE) {
    throw new Error(`DEPLOYMENT_SOURCE_COMMIT_NOT_FROZEN_V1 expected ${FROZEN_V1_DEPLOYMENT_SOURCE}`);
  }
  const verification = assertDeploymentSourceMatches(sourceCommit, { repoRoot: root });
  sourceVerification = {
    mode: 'FROZEN_SOURCE_COMMIT',
    sourceCommit,
    comparedAgainst: verification.comparedAgainst,
    deploymentInputsHash: verification.inputHash,
    comparedFiles: verification.files,
    differences: verification.differences
  };
} else if (unfrozenDevPlan) {
  sourceCommit = currentGitCommit(root);
  sourceVerification = {
    mode: 'UNFROZEN_DEV_PLAN',
    sourceCommit,
    comparedAgainst: sourceCommit,
    deploymentInputsHash: null,
    comparedFiles: [],
    differences: []
  };
} else {
  throw new Error('DEPLOYMENT_SOURCE_COMMIT_REQUIRED');
}
if (network === 'robinhood-mainnet' && sourceCommit === FROZEN_V1_DEPLOYMENT_SOURCE) {
  // This is the immutable address set already reviewed for the V1 release.
  // Keep the check in the planner so a bytecode/config drift cannot silently
  // replace the release candidate with a new Safe bundle.
  sourceVerification.mainnetReproductionRequired = true;
}
const inputPath = process.argv.find((arg) => arg.startsWith('--inputs='))?.slice(9) ?? 'deployments/nexmarkets-v1.inputs.example.json';
const inputs = JSON.parse(await readFile(new URL(inputPath, root), 'utf8'));
const bootstrap = JSON.parse(await readFile(new URL(`deployments/${network}.bootstrap.json`, root), 'utf8'));
if (inputs.network !== network) throw new Error('deployment input network mismatch');
if (network === 'robinhood-mainnet' && inputs.mockUsdgAddress) throw new Error('BLOCKED: mainnet planner refuses MockUSDG substitution');
if (network === 'robinhood-mainnet' && bootstrap.primitives.usdg.mock === true) throw new Error('BLOCKED: mainnet bootstrap marks settlement token as mock');
if (network === 'robinhood-testnet' && !inputs.mockUsdgAddress) throw new Error('BLOCKED: testnet MockUSDG address required');
if (!isAddress(inputs.protocolAdminSafe ?? '')) throw new Error('BLOCKED: protocolAdminSafe required');
if (!Array.isArray(inputs.safeOwners) || inputs.safeOwners.length < 2 || new Set(inputs.safeOwners.map((owner) => getAddress(owner))).size < 2) throw new Error('BLOCKED: at least two distinct Safe owners required');
if (!Number.isInteger(inputs.safeThreshold) || inputs.safeThreshold < 1 || inputs.safeThreshold > inputs.safeOwners.length) throw new Error('BLOCKED: Safe threshold must be between 1 and owner count');
if (inputs.governanceTransition !== 'RAISE_THRESHOLD_TO_2_PLUS') throw new Error('governance transition must be recorded');
for (const key of ['primaryFeeRecipient','secondaryFeeRecipient']) if (!isAddress(inputs[key] ?? '')) throw new Error(`BLOCKED: ${key} required`);
const settlementToken = network === 'robinhood-mainnet' ? bootstrap.primitives.usdg.address : inputs.mockUsdgAddress;
if (!isAddress(settlementToken ?? '')) throw new Error('BLOCKED: verified settlement token required');

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
  const creationBytecodeHash = keccak256(bytecode);
  if (sourceCommit === FROZEN_V1_DEPLOYMENT_SOURCE && creationBytecodeHash !== FROZEN_V1_CREATION_BYTECODE_HASHES[name]) {
    throw new Error(`DEPLOYMENT_SOURCE_MISMATCH generated creation bytecode for ${name} is ${creationBytecodeHash}`);
  }
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
    name, address, salt, initCode, initCodeHash: keccak256(initCode), creationBytecodeHash,
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
const frozenMainnetAddresses = {
  NexLaunchRegistry: '0xD3eB84F0B832747C257bDA424160b3DA12256719',
  NexMintController: '0x528fdeE55A903E3297838f3Fb96854b7e9684A13',
  NexPassFactory: '0x49fa1708e07edbE3b31244c3904C7aBC2e0892f1',
  NexAdvantageRegistry: '0xd015717C8c5bd24C5Ef73815f6fa5dddebD76F57',
  NexAdvantageInitializer: '0x6d82Fc757Ad54A3f7Ab071276A7A2F8Bb77Ee22e',
  NexRoyaltyVault: '0xdFe5327223C865E7107F8D21F73c19da3f1300A4',
  NexListingRegistry: '0x2962B12B8Ca459C19dBf0DDE7b5D066CA83A026B',
  NexMarketsZone: '0x477EC9790C6fd6CC06De79fb185b7F0A7dEbe096',
  NexPassAccount: '0x748203173788e3B55a9B81fb32cBa112d0Ac815e',
  NexTBAResolver: '0x08d70E44047bE7ED4ce5F0B578dAeD913fCf5fAA'
};
if (network === 'robinhood-mainnet' && sourceCommit === FROZEN_V1_DEPLOYMENT_SOURCE) {
  const mismatches = Object.entries(frozenMainnetAddresses)
    .filter(([name, expected]) => specs.find((spec) => spec.name === name)?.address.toLowerCase() !== expected.toLowerCase())
    .map(([name, expected]) => ({ name, expected, actual: specs.find((spec) => spec.name === name)?.address ?? null }));
  if (mismatches.length > 0) throw new Error(`MAINNET_PLAN_REPRODUCTION_FAILED ${JSON.stringify(mismatches)}`);
  sourceVerification.reproducedAddresses = frozenMainnetAddresses;
}
const plan = {
  schemaVersion: 1, network, chainId: bootstrap.chainId, sourceCommit,
  status: unfrozenDevPlan ? 'UNFROZEN_DEV_PLAN' : 'DRY_RUN_ONLY', mainnetDeploymentPerformed: false,
  sourceVerification,
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
