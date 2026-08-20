import { readFile } from 'node:fs/promises';
import { Contract, JsonRpcProvider, getAddress, keccak256 } from 'ethers';

function normalizeImmutables(bytecode, immutableReferences = {}) {
  const bytes = bytecode.slice(2).split('');
  for (const references of Object.values(immutableReferences)) for (const { start, length } of references) {
    bytes.splice(start * 2, length * 2, ...'0'.repeat(length * 2));
  }
  return `0x${bytes.join('')}`;
}

const network = process.argv.includes('--mainnet') ? 'robinhood-mainnet' : 'robinhood-testnet';
const postWire = process.argv.includes('--post-wire');
const planPath = new URL(`../artifacts/deployment-plan/${network}.json`, import.meta.url);
let plan;
try { plan = JSON.parse(await readFile(planPath, 'utf8')); } catch { throw new Error('BLOCKED: run plan-v1-deployment.mjs with complete Safe inputs first'); }
const rpc = process.env[network === 'robinhood-mainnet' ? 'RH_MAINNET_RPC_URL' : 'RH_TESTNET_RPC_URL'];
if (!rpc) throw new Error(`BLOCKED: ${network} RPC credential/environment missing`);
const provider = new JsonRpcProvider(rpc, plan.chainId, { staticNetwork: true });
for (const [name, contract] of Object.entries(plan.contracts)) {
  const code = await provider.getCode(contract.address);
  if (code === '0x') throw new Error(`BLOCKED_NOT_DEPLOYED: ${name} ${contract.address}`);
  const observed = keccak256(code);
  if (contract.deployedRuntimeCodeHash && observed !== contract.deployedRuntimeCodeHash) throw new Error(`FROZEN_CODEHASH_MISMATCH: ${name}`);
  if (contract.expectedRuntimeCodeHash && observed !== contract.expectedRuntimeCodeHash) throw new Error(`CODEHASH_MISMATCH: ${name}`);
  const normalized = keccak256(normalizeImmutables(code, contract.immutableReferences));
  if (normalized !== contract.normalizedRuntimeTemplateHash) throw new Error(`RUNTIME_TEMPLATE_MISMATCH: ${name}`);
}
const c = Object.fromEntries(Object.entries(plan.contracts).map(([name, value]) => [name, value.address]));
const ZERO = '0x0000000000000000000000000000000000000000';
const same = (observed, expected, label) => {
  if (getAddress(observed) !== getAddress(expected)) throw new Error(`IMMUTABLE_WIRING_MISMATCH: ${label}`);
};
const ownableAbi = ['function owner() view returns (address)'];
async function verifyOwner(name) {
  same(await new Contract(c[name], ownableAbi, provider).owner(), plan.governance.safe, `${name}.owner`);
}
for (const name of ['NexLaunchRegistry','NexMintController','NexPassFactory','NexAdvantageRegistry','NexAdvantageInitializer','NexRoyaltyVault','NexListingRegistry','NexMarketsZone']) await verifyOwner(name);

const safe = new Contract(plan.governance.safe, ['function getOwners() view returns (address[])','function getThreshold() view returns (uint256)'], provider);
const owners = (await safe.getOwners()).map(getAddress);
if (owners.length < 2 || owners.length !== plan.governance.ownerCount || plan.governance.owners.some((expected) => !owners.includes(getAddress(expected)))) throw new Error('SAFE_OWNER_POLICY_MISMATCH');
if (Number(await safe.getThreshold()) !== plan.governance.threshold || plan.governance.threshold < 1) throw new Error('SAFE_THRESHOLD_POLICY_MISMATCH');

const launch = new Contract(c.NexLaunchRegistry, ['function settlementToken() view returns(address)','function factory() view returns(address)'], provider);
same(await launch.settlementToken(), plan.primitives.settlementToken, 'LaunchRegistry.settlementToken'); same(await launch.factory(), postWire ? c.NexPassFactory : ZERO, 'LaunchRegistry.factory');
const mint = new Contract(c.NexMintController, ['function launchRegistry() view returns(address)','function usdg() view returns(address)','function protocolFeeRecipient() view returns(address)','function advantageInitializer() view returns(address)'], provider);
same(await mint.launchRegistry(), c.NexLaunchRegistry, 'MintController.launchRegistry'); same(await mint.usdg(), plan.primitives.settlementToken, 'MintController.usdg');
same(await mint.protocolFeeRecipient(), plan.contractInputs.primaryFeeRecipient, 'MintController.protocolFeeRecipient'); same(await mint.advantageInitializer(), postWire ? c.NexAdvantageInitializer : ZERO, 'MintController.advantageInitializer');
const factory = new Contract(c.NexPassFactory, ['function launchRegistry() view returns(address)','function mintController() view returns(address)','function protocolAdmin() view returns(address)'], provider);
same(await factory.launchRegistry(), c.NexLaunchRegistry, 'PassFactory.launchRegistry'); same(await factory.mintController(), c.NexMintController, 'PassFactory.mintController'); same(await factory.protocolAdmin(), plan.governance.safe, 'PassFactory.protocolAdmin');
const advantage = new Contract(c.NexAdvantageRegistry, ['function launchRegistry() view returns(address)','function initializer() view returns(address)','function listingAuthority() view returns(address)'], provider);
same(await advantage.launchRegistry(), c.NexLaunchRegistry, 'AdvantageRegistry.launchRegistry'); same(await advantage.initializer(), postWire ? c.NexAdvantageInitializer : ZERO, 'AdvantageRegistry.initializer'); same(await advantage.listingAuthority(), postWire ? c.NexListingRegistry : ZERO, 'AdvantageRegistry.listingAuthority');
const initializer = new Contract(c.NexAdvantageInitializer, ['function launchRegistry() view returns(address)','function advantageRegistry() view returns(address)','function mintController() view returns(address)'], provider);
same(await initializer.launchRegistry(), c.NexLaunchRegistry, 'AdvantageInitializer.launchRegistry'); same(await initializer.advantageRegistry(), c.NexAdvantageRegistry, 'AdvantageInitializer.advantageRegistry'); same(await initializer.mintController(), c.NexMintController, 'AdvantageInitializer.mintController');
const vault = new Contract(c.NexRoyaltyVault, ['function settlementToken() view returns(address)','function listingRegistry() view returns(address)'], provider);
same(await vault.settlementToken(), plan.primitives.settlementToken, 'RoyaltyVault.settlementToken'); same(await vault.listingRegistry(), postWire ? c.NexListingRegistry : ZERO, 'RoyaltyVault.listingRegistry');
const listing = new Contract(c.NexListingRegistry, ['function launchRegistry() view returns(address)','function advantageRegistry() view returns(address)','function royaltyVault() view returns(address)','function protocolFeeRecipient() view returns(address)','function seaport() view returns(address)','function zone() view returns(address)'], provider);
same(await listing.launchRegistry(), c.NexLaunchRegistry, 'ListingRegistry.launchRegistry'); same(await listing.advantageRegistry(), c.NexAdvantageRegistry, 'ListingRegistry.advantageRegistry'); same(await listing.royaltyVault(), c.NexRoyaltyVault, 'ListingRegistry.royaltyVault'); same(await listing.protocolFeeRecipient(), plan.contractInputs.secondaryFeeRecipient, 'ListingRegistry.protocolFeeRecipient'); same(await listing.seaport(), plan.primitives.seaport16, 'ListingRegistry.seaport'); same(await listing.zone(), postWire ? c.NexMarketsZone : ZERO, 'ListingRegistry.zone');
const zone = new Contract(c.NexMarketsZone, ['function listingRegistry() view returns(address)','function seaport() view returns(address)'], provider);
same(await zone.listingRegistry(), c.NexListingRegistry, 'Zone.listingRegistry'); same(await zone.seaport(), plan.primitives.seaport16, 'Zone.seaport');
const resolver = new Contract(c.NexTBAResolver, ['function passFactory() view returns(address)','function registry() view returns(address)','function accountImplementation() view returns(address)','function registryRuntimeCodeHash() view returns(bytes32)','function implementationRuntimeCodeHash() view returns(bytes32)'], provider);
same(await resolver.passFactory(), c.NexPassFactory, 'TBAResolver.passFactory'); same(await resolver.registry(), plan.primitives.erc6551Registry, 'TBAResolver.registry'); same(await resolver.accountImplementation(), c.NexPassAccount, 'TBAResolver.accountImplementation');
if (await resolver.registryRuntimeCodeHash() !== plan.erc6551.registryRuntimeCodeHash || await resolver.implementationRuntimeCodeHash() !== plan.erc6551.accountRuntimeCodeHash) throw new Error('TBA_RESOLVER_HASH_WIRING_MISMATCH');

console.log(JSON.stringify({ status: 'PASS', network, verifiedRuntimeBuilds: Object.keys(plan.contracts).length, immutableRelationships: 'PASS', oneTimeSlots: postWire ? 'WIRED_AND_VERIFIED' : 'EMPTY_AND_READY' }));
