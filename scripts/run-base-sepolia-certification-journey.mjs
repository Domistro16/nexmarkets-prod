import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  Contract,
  ContractFactory,
  Interface,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  ZeroHash,
  concat,
  getAddress,
  keccak256,
  parseEther
} from 'ethers';
import { buildNexMarketsOrder, seaportTypedData } from '../packages/domain/src/seaport-order.mjs';

/// NexMarkets Base Sepolia certification journey.
///
/// Resumable, phase-gated runner for the Alice/Bob/Charlie scenario. It is safe
/// to invoke repeatedly: each run executes every phase the chain clock allows,
/// then exits telling you when to run it again. State (generated wallets,
/// edition, terms hash, evidence) persists in
///   scratch/base-sepolia-journey/state.json   (gitignored)
/// and the finished evidence lands in
///   scratch/base-sepolia-journey/evidence.json
///
/// Phases:
///   init      generate 3 actors, fund ETH + real USDC, deploy mock vault assets
///   publish   Alice creates "Baldies" + publishes terms (Preview starts)
///   early     +24h: Early Access — Charlie reverts, Bob mints 2, 3rd reverts
///   public    +48h: Public opens automatically — Charlie mints
///   advantage Bob consumes 3 of 10 credits -> 7 remain
///   vault     TBA created + funded with 5 distinct assets
///   claim     Bob claims 100% mUSDC + 25% NVDAc
///   reward    Alice publishes policy + funds cycle -> Bob's claim credits TBA
///   list      real Seaport order + listing registry — vault/advantage lock
///   sale      Charlie fulfills the signed order — economics + ownership
///   post      new owner claims, old owner locked out
///   done      evidence.json written
///
/// Env required (read from .env if unset):
///   BASE_SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY

const CHAIN_ID = 84532n;
const ROOT = new URL('../', import.meta.url);
const STATE_DIR = new URL('../scratch/base-sepolia-journey/', import.meta.url);
const STATE_FILE = new URL('state.json', STATE_DIR);
const EVIDENCE_FILE = new URL('evidence.json', STATE_DIR);
const MANIFEST = JSON.parse(await readFile(new URL('../deployments/base-sepolia.v1-deployment.json', import.meta.url), 'utf8'));

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const ERC6551_REGISTRY = '0x000000006551c19487814612e58FE06813775758';
const SEAPORT = '0x0000000000000068F116a894984e2DB1123eB395';
const SAFE = MANIFEST.protocolAdminSafe.address;
const C = Object.fromEntries(Object.entries(MANIFEST.contracts).map(([k, v]) => [k, v.address ?? v]));

const PRICE = 5_000_000n; // 5 USDC
const SUPPLY = 2000n;
const EARLY_ALLOCATION = 500n;
const PER_WALLET = 2n;
const CREDITS = 10n;
const LIST_PRICE = 8_000_000n; // 8 USDC
const ROYALTY_BPS = 500n;

const ADVANTAGE_ID = keccak256(new TextEncoder().encode('baldies:credits'));
const ADVANTAGE_DEFINITION = keccak256(new TextEncoder().encode('baldies:10-credits'));
const VAULT_USDC = 400_000_000n; // 400 mock USDC (6dp)
const VAULT_NVDAC = 20n * 10n ** 18n;
const VAULT_NEX = 800n * 10n ** 18n;
const VAULT_OP = 50n * 10n ** 18n;
const COLLECTIBLE_ID = 7n;
const REWARD_PER_PASS = 5n * 10n ** 18n; // 5 NVDAc per Pass

if (process.argv.includes('--reset')) {
  const { rm } = await import('node:fs/promises');
  await rm(STATE_DIR, { recursive: true, force: true });
  console.log('journey state reset');
  process.exit(0);
}

async function loadEnv() {
  if (process.env.BASE_SEPOLIA_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY) return;
  try {
    const raw = await readFile(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const key = line.slice(0, line.indexOf('='));
      const value = line.slice(line.indexOf('=') + 1).replace(/^"|"$/g, '');
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {}
}
await loadEnv();
const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim() || 'https://sepolia.base.org';
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!deployerKey) throw new Error('DEPLOYER_PRIVATE_KEY required');

const provider = new JsonRpcProvider(rpcUrl, Number(CHAIN_ID), { staticNetwork: true });
if ((await provider.getNetwork()).chainId !== CHAIN_ID) throw new Error('NOT_BASE_SEPOLIA');
const deployer = new Wallet(deployerKey, provider);

const lower = (v) => String(v).toLowerCase();
const json = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2);
const enc = (v) => keccak256(new TextEncoder().encode(v));
const label = (s) => `[${new Date().toISOString()}] ${s}`;
async function waitTx(tx, tag, state) {
  const receipt = await tx.wait();
  if (!receipt || Number(receipt.status) !== 1) throw new Error(`${tag}_REVERTED:${tx.hash}`);
  if (state) state.evidence.push({ phase: state.phase, action: tag, txHash: tx.hash, block: receipt.blockNumber });
  console.log(label(`${tag} -> ${tx.hash}`));
  return { hash: tx.hash, block: receipt.blockNumber };
}
const errorIface = new Interface([
  'error NotAllowlisted()',
  'error MintClosed()',
  'error WalletAllowanceExceeded()',
  'error InvalidSigner()',
  'error PassVaultLockedWhileListed()'
]);
async function expectRevert(promiseFactory, errorName, tag) {
  try {
    await promiseFactory();
  } catch (error) {
    const data = error.data ?? error.info?.error?.data ?? error.error?.data;
    let decoded = null;
    if (typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
      try { decoded = errorIface.parseError(data)?.name; } catch {}
    }
    if (decoded && decoded !== errorName) throw new Error(`${tag}_WRONG_REVERT:${decoded}_EXPECTED_${errorName}`);
    if (!decoded) console.log(label(`warn: ${tag} reverted but error data undecodable; expected ${errorName}`));
    else console.log(label(`${tag} reverted as expected: ${decoded}`));
    return data;
  }
  throw new Error(`${tag}_SHOULD_HAVE_REVERTED:${errorName}`);
}

async function artifact(name, file) {
  const raw = JSON.parse(await readFile(new URL(`../packages/contracts/out/${file}/${name}.json`, import.meta.url), 'utf8'));
  return { abi: raw.abi, bytecode: raw.bytecode?.object ?? raw.bytecode };
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return { phase: 'init', wallets: {}, deployments: {}, evidence: [] };
  }
}
async function saveState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, json(state) + '\n');
}

const abis = {
  factory: ['function createEdition(tuple(string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI) config,bytes32 salt) returns(address)', 'function isFactoryEdition(address) view returns(bool)', 'function editionForId(bytes32) view returns(address)'],
  launchRegistry: [
    'function publishTerms(address edition,tuple(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,bytes32 allowlistRoot,uint64 allowlistEndsAt,uint256 allowlistSupply,uint256 walletAllowance,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash) terms) returns(bytes32)',
    'function activeTerms(address) view returns(bytes32 termsHash,tuple(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,bytes32 allowlistRoot,uint64 allowlistEndsAt,uint256 allowlistSupply,uint256 walletAllowance,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash) terms)',
    'function isPreviewOpen(address,bytes32) view returns(bool)',
    'function isAllowlistMintOpen(address,bytes32) view returns(bool)',
    'function isPublicMintOpen(address,bytes32) view returns(bool)',
    'function isMintOpen(address,bytes32) view returns(bool)'
  ],
  mintController: [
    'function mint(tuple(address edition,bytes32 termsVersionHash,address recipient,uint256 quantity,bytes32 intentId,address referralHint,tuple(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[] advantageConfigs) request) returns(uint256)',
    'function mintAllowlisted(tuple(address edition,bytes32 termsVersionHash,address recipient,uint256 quantity,bytes32 intentId,address referralHint,tuple(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[] advantageConfigs) request,uint256 allowance,bytes32[] proof) returns(uint256)',
    'function allowlistLeaf(address edition,address account,uint256 allowance) view returns(bytes32)',
    'function allowlistWalletMinted(address edition,bytes32 termsHash,address account) view returns(uint256)',
    'function allowlistMinted(address edition,bytes32 termsHash) view returns(uint256)',
    'function allowlistRemaining(address edition,bytes32 termsHash,address account,uint256 allowance) view returns(uint256)'
  ],
  edition: [
    'function ownerOf(uint256) view returns(address)',
    'function totalMinted() view returns(uint256)',
    'function termsVersionHashOf(uint256) view returns(bytes32)',
    'function setApprovalForAll(address,bool)',
    'function isApprovedForAll(address,address) view returns(bool)',
    'function transferFrom(address,address,uint256)',
    'function owner() view returns(address)'
  ],
  advantageRegistry: [
    'function hashAdvantages(tuple(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[]) view returns(bytes32)',
    'function remaining(address,uint256,bytes32) view returns(uint256)',
    'function isUsable(address,uint256,bytes32) view returns(bool)',
    'function isListed(address,uint256) view returns(bool)',
    'function consumeQuantity(address,uint256,bytes32,uint256,bytes32) returns(bool)'
  ],
  listingRegistry: [
    'function createListing(tuple(bytes32 orderHash,address edition,uint256 tokenId,bytes32 termsVersionHash,uint256 usdGPrice,uint64 startTime,uint64 expiry) request) returns(bytes32)',
    'function cancelListing(bytes32)',
    'function listingInfo(bytes32) view returns(tuple(address edition,uint256 tokenId,address seller,bytes32 termsVersionHash,uint256 usdGPrice,address royaltyReceiver,uint96 royaltyBps,uint64 startTime,uint64 expiry,bytes32 zoneHash,uint8 status))',
    'function activeListingFor(address,uint256) view returns(bytes32)',
    'function isListingActive(bytes32) view returns(bool)'
  ],
  resolver: ['function account(address,uint256) view returns(address)', 'function createAccount(address,uint256) returns(address)'],
  tba: [
    'function execute(address to,uint256 value,bytes data,uint8 operation) payable returns(bytes)',
    'function isVaultLocked() view returns(bool)',
    'function owner() view returns(address)'
  ],
  distributor: [
    'function publishPolicy(address edition,tuple(uint8 source,uint16 allocationBps,address rewardAsset,bool ongoing,uint64 endsAt) input) returns(bytes32)',
    'function fundCycle(bytes32 policyId,address asset,uint256 amountPerPass) returns(bytes32)',
    'function claim(bytes32 cycleId,uint256 tokenId) returns(uint256)',
    'function claimMany(bytes32 cycleId,uint256[] tokenIds) returns(uint256)',
    'function policyCount(address edition) view returns(uint32)',
    'function policyIdAt(address edition,uint32 index) view returns(bytes32)',
    'function cycleIdAt(bytes32 policyId,uint32 index) view returns(bytes32)',
    'function isClaimed(bytes32 cycleId,uint256 tokenId) view returns(bool)',
    'function passVaultFor(address edition,uint256 tokenId) view returns(address)'
  ],
  erc20: [
    'function balanceOf(address) view returns(uint256)',
    'function approve(address,uint256) returns(bool)',
    'function allowance(address,address) view returns(uint256)',
    'function transfer(address,uint256) returns(bool)',
    'function mint(address,uint256)',
    'function decimals() view returns(uint8)'
  ],
  erc721: ['function ownerOf(uint256) view returns(address)', 'function mint(address,uint256)', 'function balanceOf(address) view returns(uint256)'],
  seaport: [
    'function getCounter(address) view returns(uint256)',
    'function fulfillOrder(tuple(tuple(address offerer,address zone,tuple(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)[] offer,tuple(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 totalOriginalConsiderationItems) parameters,bytes signature) order,bytes32 fulfillerConduitKey) returns(bool)'
  ]
};

const state = await loadState();
const walletFor = (name) => new Wallet(state.wallets[name].privateKey, provider);
const usdc = new Contract(USDC, abis.erc20, provider);
const seaport = new Contract(SEAPORT, abis.seaport, provider);
const launchRegistry = new Contract(C.NexLaunchRegistry, abis.launchRegistry, provider);
const mintController = new Contract(C.NexMintController, abis.mintController, provider);
const advantageRegistry = new Contract(C.NexAdvantageRegistry, abis.advantageRegistry, provider);
const listingRegistry = new Contract(C.NexListingRegistry, abis.listingRegistry, provider);
const resolver = new Contract(C.NexTBAResolver, abis.resolver, provider);
const distributor = new Contract(C.NexRewardDistributor, abis.distributor, provider);
const erc20Iface = new Interface(['function transfer(address,uint256)']);
const erc721Iface = new Interface(['function transferFrom(address,address,uint256)']);

const latest = async () => Number((await provider.getBlock('latest')).timestamp);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function gate(unix, next) {
  console.log(label(`phase '${state.phase}' gated: next action at ${new Date(unix * 1000).toISOString()} (${next})`));
}

const order = ['init', 'publish', 'early', 'public', 'advantage', 'vault', 'claim', 'reward', 'list', 'sale', 'post', 'done'];
const at = (p) => order.indexOf(state.phase) >= order.indexOf(p);

// ---------------------------------------------------------------------------
// PHASE: init
// ---------------------------------------------------------------------------
if (!at('publish')) {
  for (const name of ['alice', 'bob', 'charlie', 'dora']) {
    if (!state.wallets[name]) {
      const w = Wallet.createRandom();
      state.wallets[name] = { address: w.address, privateKey: w.privateKey };
    }
  }
  const alice = walletFor('alice');
  const bob = walletFor('bob');
  const charlie = walletFor('charlie');

  // Gas for actors.
  for (const [name, w] of [['alice', alice], ['bob', bob], ['charlie', charlie]]) {
    if ((await provider.getBalance(w.address)) === 0n) {
      await waitTx(await deployer.sendTransaction({ to: w.address, value: parseEther('0.005') }), `FUND_ETH_${name.toUpperCase()}`, state);
    }
  }

  // Real USDC for mints and the secondary buy. Deployer holds the only real
  // USDC, so it is split; vault *deposit* assets use mocks (see below).
  const usdcNeeds = { bob: 10_000_000n, charlie: 15_000_000n }; // bob 2x5 mint, charlie 5 mint + 8 buy
  for (const [name, amount] of Object.entries(usdcNeeds)) {
    const w = walletFor(name);
    if ((await usdc.balanceOf(w.address)) < amount) {
      await waitTx(await usdc.connect(deployer).transfer(w.address, amount), `FUND_USDC_${name.toUpperCase()}`, state);
    }
    const needed = name === 'charlie' ? 5_000_000n : 10_000_000n;
    if ((await usdc.connect(w).allowance(w.address, C.NexMintController)) < needed) {
      await waitTx(await usdc.connect(w).approve(C.NexMintController, 1_000_000_000n), `APPROVE_USDC_${name.toUpperCase()}`, state);
    }
  }

  // Mock assets for the Vault contents and rewards (canonical USDC settlement
  // is immutable, so only the Vault inventory uses these).
  if (!state.deployments.mockUsdc) {
    const art = await artifact('MockUSDG', 'MockUSDG.sol');
    const deployed = await new ContractFactory(art.abi, art.bytecode, deployer).deploy(deployer.address);
    await waitTx(deployed.deploymentTransaction(), 'DEPLOY_MOCK_USDC', state);
    state.deployments.mockUsdc = await deployed.getAddress();
  }
  const tok = await artifact('RewardToken', 'BaseSepoliaCertificationJourney.t.sol');
  const col = await artifact('Collectible', 'BaseSepoliaCertificationJourney.t.sol');
  for (const [key, name, symbol] of [
    ['nvdac', 'Tokenized NVIDIA', 'NVDAc'],
    ['nex', 'NexMarkets Token', 'NEX'],
    ['op', 'Optimism', 'OP']
  ]) {
    if (!state.deployments[key]) {
      const deployed = await new ContractFactory(tok.abi, tok.bytecode, deployer).deploy(name, symbol, 18);
      await waitTx(deployed.deploymentTransaction(), `DEPLOY_${symbol}`, state);
      state.deployments[key] = await deployed.getAddress();
    }
  }
  if (!state.deployments.collectible) {
    const deployed = await new ContractFactory(col.abi, col.bytecode, deployer).deploy();
    await waitTx(deployed.deploymentTransaction(), 'DEPLOY_COLLECTIBLE', state);
    state.deployments.collectible = await deployed.getAddress();
  }

  // Reward asset for Alice's funded cycle.
  const nvdac = new Contract(state.deployments.nvdac, abis.erc20, provider);
  if ((await nvdac.balanceOf(alice.address)) < 50n * 10n ** 18n) {
    await waitTx(await nvdac.connect(deployer).mint(alice.address, 50n * 10n ** 18n), 'MINT_NVDAC_ALICE', state);
  }

  state.phase = 'publish';
  await saveState(state);
  console.log(label('init complete: 3 actors funded, mock assets deployed'));
}

// ---------------------------------------------------------------------------
// PHASE: publish  (Day 0)
// ---------------------------------------------------------------------------
if (state.phase === 'publish') {
  const alice = walletFor('alice');
  const bob = walletFor('bob');
  const dora = walletFor('dora');
  const factory = new Contract(C.NexPassFactory, abis.factory, alice);

  const editionId = enc('baldies:edition:01');
  if (!state.edition) {
    // Idempotent recovery: if a previous run created the edition but died
    // before saving state, adopt the on-chain record instead of reverting.
    const existing = await factory.editionForId(editionId);
    if (existing !== ZeroAddress) {
      state.edition = existing;
      console.log(label(`EDITION_RECOVERED -> ${state.edition}`));
    } else {
      const cfg = {
        name: 'Baldies',
        symbol: 'BALDIES',
        initialOwner: alice.address,
        editionId,
        absoluteSupplyCap: SUPPLY,
        artworkCommitment: enc('baldies:artwork'),
        baseTokenURI: 'ipfs://baldies/'
      };
      const tx = await factory.createEdition(cfg, enc(`baldies:salt:${Date.now()}`));
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('EDITION_CREATE_REVERTED');
      const factoryIface = new Interface(['event EditionCreated(address indexed edition,bytes32 indexed editionId,address indexed publisher,bytes32 salt,address editionOwner,address mintController,uint32 absoluteSupplyCap,bytes32 artworkCommitment)']);
      const log = receipt.logs.map((l) => { try { return factoryIface.parseLog(l); } catch { return null; } }).find(Boolean);
      state.edition = log?.args?.edition;
      if (!state.edition) throw new Error('EDITION_ADDRESS_NOT_FOUND_IN_RECEIPT');
      state.evidence.push({ phase: 'publish', action: 'EDITION_CREATE', txHash: tx.hash, block: receipt.blockNumber, edition: state.edition });
      console.log(label(`EDITION_CREATE -> ${state.edition}`));
      await saveState(state);
    }
  }

  // Adopt the on-chain Terms if already published (crash recovery), else
  // compute and publish a fresh set anchored to now.
  let [activeHash, activeTerms] = await launchRegistry.activeTerms(state.edition);
  const mc = mintController.connect(provider);
  const bobLeaf = await mc.allowlistLeaf(state.edition, bob.address, PER_WALLET);
  const doraLeaf = await mc.allowlistLeaf(state.edition, dora.address, PER_WALLET);
  const root = BigInt(bobLeaf) < BigInt(doraLeaf)
    ? keccak256(concat([bobLeaf, doraLeaf]))
    : keccak256(concat([doraLeaf, bobLeaf]));

  let previewStartsAt;
  if (activeHash === ZeroHash) {
    const now = await latest();
    previewStartsAt = BigInt(now + 180);
    const mintStartsAt = previewStartsAt + 86_400n; // MIN_PREVIEW_DURATION = 1 day
    const allowlistEndsAt = mintStartsAt + 86_400n; // 24h Early Access
    const mintEndsAt = mintStartsAt + 2_592_000n; // 30 days
    const advantageConfigs = [{
      advantageId: ADVANTAGE_ID,
      kind: 1, // QuantityBased
      startsAt: previewStartsAt,
      endsAt: previewStartsAt + 31_536_000n,
      totalUnits: CREDITS,
      definitionHash: ADVANTAGE_DEFINITION
    }];
    const advantagesHash = await advantageRegistry.hashAdvantages(advantageConfigs);
    const terms = {
      activeSupply: SUPPLY,
      pricePerPass: PRICE,
      previewStartsAt,
      mintStartsAt,
      mintEndsAt,
      allowlistRoot: root,
      allowlistEndsAt,
      allowlistSupply: EARLY_ALLOCATION,
      walletAllowance: PER_WALLET,
      primaryRecipient: alice.address,
      royaltyReceiver: alice.address,
      royaltyBps: ROYALTY_BPS,
      advantagesHash,
      referralTermsHash: ZeroHash
    };
    const tx = await launchRegistry.connect(alice).publishTerms(state.edition, terms);
    await waitTx(tx, 'PUBLISH_TERMS', state);
    [activeHash, activeTerms] = await launchRegistry.activeTerms(state.edition);
    await saveState(state);
  }

  state.termsHash = activeHash;
  previewStartsAt = BigInt(activeTerms.previewStartsAt);
  state.advantageConfigs = [{
    advantageId: ADVANTAGE_ID,
    kind: 1,
    startsAt: previewStartsAt,
    endsAt: previewStartsAt + 31_536_000n,
    totalUnits: CREDITS,
    definitionHash: ADVANTAGE_DEFINITION
  }];
  state.allowlist = { bobLeaf, doraLeaf, root };
  state.window = {
    previewStartsAt: Number(activeTerms.previewStartsAt),
    mintStartsAt: Number(activeTerms.mintStartsAt),
    allowlistEndsAt: Number(activeTerms.allowlistEndsAt),
    mintEndsAt: Number(activeTerms.mintEndsAt)
  };
  const committed = await advantageRegistry.hashAdvantages(state.advantageConfigs);
  if (lower(committed) !== lower(activeTerms.advantagesHash)) throw new Error('ADVANTAGE_CONFIG_MISMATCH_VS_TERMS');
  state.phase = 'early';
  await saveState(state);

  // Preview opens at previewStartsAt — assert only once the clock says it must.
  if ((await latest()) >= state.window.previewStartsAt
      && !(await launchRegistry.isPreviewOpen(state.edition, activeHash))) throw new Error('PREVIEW_NOT_OPEN');
  gate(state.window.mintStartsAt, 'early');
  console.log(label(`published. Preview until ${new Date(state.window.mintStartsAt * 1000).toISOString()}`));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// PHASE: early  (Day 1 — Early Access window)
// ---------------------------------------------------------------------------
if (state.phase === 'early') {
  if ((await latest()) < state.window.mintStartsAt) {
    gate(state.window.mintStartsAt, 'early');
    process.exit(0);
  }
  const bob = walletFor('bob');
  const charlie = walletFor('charlie');
  const edition = new Contract(state.edition, abis.edition, provider);
  if (!(await launchRegistry.isAllowlistMintOpen(state.edition, state.termsHash))) throw new Error('EARLY_ACCESS_NOT_OPEN');
  if (await launchRegistry.isPublicMintOpen(state.edition, state.termsHash)) throw new Error('PUBLIC_SHOULD_NOT_BE_OPEN_YET');

  const cfg = state.advantageConfigs;
  const req = (recipient, qty, tag) => ({
    edition: state.edition,
    termsVersionHash: state.termsHash,
    recipient,
    quantity: BigInt(qty),
    intentId: enc(`intent:${tag}`),
    referralHint: ZeroAddress,
    advantageConfigs: cfg
  });
  const proof = [state.allowlist.doraLeaf];

  // Charlie is not on the allowlist — the contract is the final authority.
  await expectRevert(
    () => mintController.connect(charlie).mintAllowlisted.staticCall(req(charlie.address, 1, 'charlie:ea'), PER_WALLET, proof),
    'NotAllowlisted',
    'CHARLIE_ALLOWLIST_MINT'
  );
  await expectRevert(
    () => mintController.connect(charlie).mint.staticCall(req(charlie.address, 1, 'charlie:ea-pub')),
    'MintClosed',
    'CHARLIE_PUBLIC_MINT_DURING_EA'
  );

  // Bob mints #1 and #2.
  const aliceBefore = await usdc.balanceOf(walletFor('alice').address);
  const feeBefore = await usdc.balanceOf(SAFE);
  await waitTx(await mintController.connect(bob).mintAllowlisted(req(bob.address, 1, 'bob:ea-1'), PER_WALLET, proof), 'BOB_EARLY_MINT_1', state);
  await waitTx(await mintController.connect(bob).mintAllowlisted(req(bob.address, 1, 'bob:ea-2'), PER_WALLET, proof), 'BOB_EARLY_MINT_2', state);
  if (lower(await edition.ownerOf(1n)) !== lower(bob.address) || lower(await edition.ownerOf(2n)) !== lower(bob.address)) throw new Error('EARLY_SERIALS_MISMATCH');

  // Mint #3 must revert — the per-wallet cap is now enforced.
  await expectRevert(
    () => mintController.connect(bob).mintAllowlisted.staticCall(req(bob.address, 1, 'bob:ea-3'), PER_WALLET, proof),
    'WalletAllowanceExceeded',
    'BOB_EARLY_MINT_3'
  );
  if ((await mintController.allowlistWalletMinted(state.edition, state.termsHash, bob.address)) !== 2n) throw new Error('WALLET_COUNTER_MISMATCH');
  if ((await mintController.allowlistMinted(state.edition, state.termsHash)) !== 2n) throw new Error('PHASE_COUNTER_MISMATCH');

  // Exact primary settlement: 5% protocol fee, rest to Alice.
  const paid = 2n * PRICE;
  const fee = (paid * 500n) / 10_000n;
  if ((await usdc.balanceOf(SAFE)) - feeBefore !== fee) throw new Error('PRIMARY_FEE_MISMATCH');
  if ((await usdc.balanceOf(walletFor('alice').address)) - aliceBefore !== paid - fee) throw new Error('PRIMARY_PROCEEDS_MISMATCH');

  state.phase = 'public';
  await saveState(state);
  gate(state.window.allowlistEndsAt, 'public');
  console.log(label('early access certified: Bob 2/2, Charlie rejected, third mint reverted'));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// PHASE: public  (Day 2 — Public Mint opens automatically)
// ---------------------------------------------------------------------------
if (state.phase === 'public') {
  if ((await latest()) < state.window.allowlistEndsAt) {
    gate(state.window.allowlistEndsAt, 'public');
    process.exit(0);
  }
  const charlie = walletFor('charlie');
  const edition = new Contract(state.edition, abis.edition, provider);
  if (!(await launchRegistry.isPublicMintOpen(state.edition, state.termsHash))) throw new Error('PUBLIC_MINT_NOT_OPEN');
  if (await launchRegistry.isAllowlistMintOpen(state.edition, state.termsHash)) throw new Error('EA_SHOULD_BE_CLOSED');

  // Unused Early Access allocation rolled into public supply: 2000 - 2 minted.
  if (SUPPLY - (await edition.totalMinted()) !== SUPPLY - 2n) throw new Error('ROLLOVER_SUPPLY_MISMATCH');

  const cfg = state.advantageConfigs;
  await waitTx(
    await mintController.connect(charlie).mint({
      edition: state.edition,
      termsVersionHash: state.termsHash,
      recipient: charlie.address,
      quantity: 1n,
      intentId: enc('intent:charlie:public'),
      referralHint: ZeroAddress,
      advantageConfigs: cfg
    }),
    'CHARLIE_PUBLIC_MINT',
    state
  );
  if (lower(await edition.ownerOf(3n)) !== lower(charlie.address)) throw new Error('PUBLIC_SERIAL_MISMATCH');
  state.phase = 'advantage';
  await saveState(state);
  console.log(label('public mint certified: auto-opened, Charlie holds serial 3'));
}

// ---------------------------------------------------------------------------
// PHASE: advantage
// ---------------------------------------------------------------------------
if (state.phase === 'advantage') {
  const bob = walletFor('bob');
  if ((await advantageRegistry.remaining(state.edition, 1n, ADVANTAGE_ID)) !== CREDITS) throw new Error('ADVANTAGE_START_MISMATCH');
  await waitTx(
    await advantageRegistry.connect(bob).consumeQuantity(state.edition, 1n, ADVANTAGE_ID, 3n, enc('use:credits:1')),
    'ADVANTAGE_CONSUME_3',
    state
  );
  if ((await advantageRegistry.remaining(state.edition, 1n, ADVANTAGE_ID)) !== CREDITS - 3n) throw new Error('ADVANTAGE_REMAINING_MISMATCH');
  // Idempotent replay must not double-spend.
  await advantageRegistry.connect(bob).consumeQuantity(state.edition, 1n, ADVANTAGE_ID, 3n, enc('use:credits:1'));
  if ((await advantageRegistry.remaining(state.edition, 1n, ADVANTAGE_ID)) !== CREDITS - 3n) throw new Error('ADVANTAGE_REPLAY_DOUBLE_SPENT');
  state.phase = 'vault';
  await saveState(state);
  console.log(label('advantage certified: 10 -> consume 3 -> 7 remain, replay rejected'));
}

// ---------------------------------------------------------------------------
// PHASE: vault  (TBA + 5 distinct assets)
// ---------------------------------------------------------------------------
if (state.phase === 'vault') {
  const bob = walletFor('bob');
  const existing = await resolver.account(state.edition, 1n);
  const code = await provider.getCode(existing);
  if (code === '0x') {
    await waitTx(await resolver.connect(bob).createAccount(state.edition, 1n), 'TBA_CREATE', state);
  }
  state.passVault = await resolver.account(state.edition, 1n);
  const tba = new Contract(state.passVault, abis.tba, provider);
  if (lower(await tba.owner()) !== lower(bob.address)) throw new Error('TBA_OWNER_MISMATCH');

  const mockUsdc = new Contract(state.deployments.mockUsdc, abis.erc20, deployer);
  const nvdac = new Contract(state.deployments.nvdac, abis.erc20, deployer);
  const nex = new Contract(state.deployments.nex, abis.erc20, deployer);
  const op = new Contract(state.deployments.op, abis.erc20, deployer);
  const collectible = new Contract(state.deployments.collectible, abis.erc721, deployer);
  if ((await mockUsdc.balanceOf(state.passVault)) < VAULT_USDC) await waitTx(await mockUsdc.mint(state.passVault, VAULT_USDC), 'VAULT_DEPOSIT_MUSDC', state);
  if ((await nvdac.balanceOf(state.passVault)) < VAULT_NVDAC) await waitTx(await nvdac.mint(state.passVault, VAULT_NVDAC), 'VAULT_DEPOSIT_NVDAC', state);
  if ((await nex.balanceOf(state.passVault)) < VAULT_NEX) await waitTx(await nex.mint(state.passVault, VAULT_NEX), 'VAULT_DEPOSIT_NEX', state);
  if ((await op.balanceOf(state.passVault)) < VAULT_OP) await waitTx(await op.mint(state.passVault, VAULT_OP), 'VAULT_DEPOSIT_OP', state);
  if (lower(await collectible.ownerOf(COLLECTIBLE_ID).catch(() => ZeroAddress)) !== lower(state.passVault)) {
    await waitTx(await collectible.mint(state.passVault, COLLECTIBLE_ID), 'VAULT_DEPOSIT_NFT', state);
  }
  state.phase = 'claim';
  await saveState(state);
  console.log(label(`vault certified: TBA ${state.passVault} holds 5 distinct assets`));
}

// ---------------------------------------------------------------------------
// PHASE: claim  (partial, multi-asset, base-unit math)
// ---------------------------------------------------------------------------
if (state.phase === 'claim') {
  const bob = walletFor('bob');
  const tba = new Contract(state.passVault, abis.tba, bob);
  const mockUsdc = new Contract(state.deployments.mockUsdc, abis.erc20, provider);
  const nvdac = new Contract(state.deployments.nvdac, abis.erc20, provider);
  const nex = new Contract(state.deployments.nex, abis.erc20, provider);
  const op = new Contract(state.deployments.op, abis.erc20, provider);
  const collectible = new Contract(state.deployments.collectible, abis.erc721, provider);

  const usdcClaim = (await mockUsdc.balanceOf(state.passVault) * 100n) / 100n;
  const nvdacClaim = (await nvdac.balanceOf(state.passVault) * 25n) / 100n;
  const bobUsdcBefore = await mockUsdc.balanceOf(bob.address);
  const bobNvdacBefore = await nvdac.balanceOf(bob.address);

  await waitTx(await tba.execute(state.deployments.mockUsdc, 0n, erc20Iface.encodeFunctionData('transfer', [bob.address, usdcClaim]), 0), 'CLAIM_MUSDC_100', state);
  await waitTx(await tba.execute(state.deployments.nvdac, 0n, erc20Iface.encodeFunctionData('transfer', [bob.address, nvdacClaim]), 0), 'CLAIM_NVDAC_25', state);

  if ((await mockUsdc.balanceOf(bob.address)) - bobUsdcBefore !== 400_000_000n) throw new Error('CLAIM_USDC_DELTA_MISMATCH');
  if ((await nvdac.balanceOf(bob.address)) - bobNvdacBefore !== 5n * 10n ** 18n) throw new Error('CLAIM_NVDAC_DELTA_MISMATCH');
  if ((await mockUsdc.balanceOf(state.passVault)) !== 0n) throw new Error('VAULT_USDC_NOT_EMPTY');
  if ((await nvdac.balanceOf(state.passVault)) !== 15n * 10n ** 18n) throw new Error('VAULT_NVDAC_REMAINDER_MISMATCH');
  if ((await nex.balanceOf(state.passVault)) !== VAULT_NEX) throw new Error('VAULT_NEX_TOUCHED');
  if ((await op.balanceOf(state.passVault)) !== VAULT_OP) throw new Error('VAULT_OP_TOUCHED');
  if (lower(await collectible.ownerOf(COLLECTIBLE_ID)) !== lower(state.passVault)) throw new Error('VAULT_NFT_TOUCHED');
  state.phase = 'reward';
  await saveState(state);
  console.log(label('claim certified: +400 mUSDC, +5 NVDAc; vault retains 15 NVDAc + 800 NEX + 50 OP + NFT'));
}

// ---------------------------------------------------------------------------
// PHASE: reward  (policy + funded cycle -> claim credits the Pass Vault)
// ---------------------------------------------------------------------------
if (state.phase === 'reward') {
  const alice = walletFor('alice');
  const bob = walletFor('bob');
  const nvdac = new Contract(state.deployments.nvdac, abis.erc20, provider);

  if (!state.rewardPolicyId) {
    const count = await distributor.policyCount(state.edition);
    await waitTx(
      await distributor.connect(alice).publishPolicy(state.edition, {
        source: 0, // BUILDER_ROYALTY
        allocationBps: 3000, // 30% of Builder Royalty, ongoing
        rewardAsset: state.deployments.nvdac,
        ongoing: true,
        endsAt: 0
      }),
      'REWARD_POLICY_PUBLISH',
      state
    );
    state.rewardPolicyId = await distributor.policyIdAt(state.edition, count);
  }
  if (!state.rewardCycleId) {
    if ((await nvdac.allowance(alice.address, C.NexRewardDistributor)) < 20n * 10n ** 18n) {
      await waitTx(await nvdac.connect(alice).approve(C.NexRewardDistributor, 10n ** 24n), 'REWARD_ASSET_APPROVE', state);
    }
    state.rewardCycleId = await distributor.connect(alice).fundCycle.staticCall(state.rewardPolicyId, state.deployments.nvdac, REWARD_PER_PASS);
    await waitTx(
      await distributor.connect(alice).fundCycle(state.rewardPolicyId, state.deployments.nvdac, REWARD_PER_PASS),
      'REWARD_CYCLE_FUND',
      state
    );
  }
  if (!(await distributor.isClaimed(state.rewardCycleId, 1n))) {
    const before = await nvdac.balanceOf(state.passVault);
    await waitTx(await distributor.connect(bob).claim(state.rewardCycleId, 1n), 'REWARD_CLAIM_PASS1', state);
    const after = await nvdac.balanceOf(state.passVault);
    if (after - before !== REWARD_PER_PASS) throw new Error('REWARD_CLAIM_DELTA_MISMATCH');
    // Claim credits the Pass Vault, not the caller's wallet.
  }
  state.phase = 'list';
  await saveState(state);
  console.log(label('reward certified: policy published, cycle funded, claim credited the Pass Vault'));
}

// ---------------------------------------------------------------------------
// PHASE: list  (real Seaport order + listing registry -> locks engaged)
// ---------------------------------------------------------------------------
if (state.phase === 'list') {
  const bob = walletFor('bob');
  const alice = walletFor('alice');
  const edition = new Contract(state.edition, abis.edition, bob);
  const tba = new Contract(state.passVault, abis.tba, provider);
  const passTerms = await edition.termsVersionHashOf(1n);

  if (!(await edition.isApprovedForAll(bob.address, SEAPORT))) {
    await waitTx(await edition.setApprovalForAll(SEAPORT, true), 'SELLER_SEAPORT_APPROVAL', state);
  }
  const block = await provider.getBlock('latest');
  const start = BigInt(block.timestamp) - 1n;
  const end = BigInt(block.timestamp) + 604_800n; // 7 days
  const saleOrder = buildNexMarketsOrder({
    seller: bob.address,
    edition: state.edition,
    tokenId: 1n,
    termsVersionHash: passTerms,
    price: LIST_PRICE,
    royaltyReceiver: alice.address,
    royaltyBps: ROYALTY_BPS,
    usdg: USDC,
    protocolFeeRecipient: SAFE,
    royaltyVault: C.NexRoyaltyVault,
    zone: C.NexMarketsZone,
    startTime: start,
    endTime: end,
    salt: enc('baldies:listing:1'),
    counter: await seaport.getCounter(bob.address),
    listingRegistry: C.NexListingRegistry
  });
  state.orderHash = saleOrder.orderHash;
  const td = seaportTypedData(saleOrder.order, await seaport.getCounter(bob.address), { chainId: CHAIN_ID, seaport: SEAPORT });
  state.orderSignature = await bob.signTypedData(td.domain, td.types, td.value);
  state.order = saleOrder.order;

  await waitTx(await listingRegistry.connect(bob).createListing([state.orderHash, state.edition, 1n, passTerms, LIST_PRICE, start, end]), 'LISTING_CREATE', state);
  if (!(await listingRegistry.isListingActive(state.orderHash))) throw new Error('LISTING_NOT_ACTIVE');

  // Listing lock: vault execute must revert, advantage must freeze.
  if (!(await tba.isVaultLocked())) throw new Error('VAULT_NOT_LOCKED_WHILE_LISTED');
  await expectRevert(
    () => tba.connect(bob).execute.staticCall(state.deployments.nex, 0n, erc20Iface.encodeFunctionData('transfer', [bob.address, 1n]), 0),
    'PassVaultLockedWhileListed',
    'VAULT_DRAIN_WHILE_LISTED'
  );
  if (!(await advantageRegistry.isListed(state.edition, 1n))) throw new Error('ADVANTAGE_LISTING_FLAG_MISSING');
  if (await advantageRegistry.isUsable(state.edition, 1n, ADVANTAGE_ID)) throw new Error('ADVANTAGE_USABLE_WHILE_LISTED');
  state.phase = 'sale';
  await saveState(state);
  console.log(label('list certified: Seaport order registered, vault + advantage locked'));
}

// ---------------------------------------------------------------------------
// PHASE: sale  (Charlie fulfils the signed Seaport order)
// ---------------------------------------------------------------------------
if (state.phase === 'sale') {
  const charlie = walletFor('charlie');
  const bob = walletFor('bob');
  const alice = walletFor('alice');
  const edition = new Contract(state.edition, abis.edition, provider);
  const nex = new Contract(state.deployments.nex, abis.erc20, provider);

  if ((await usdc.allowance(charlie.address, SEAPORT)) < LIST_PRICE) {
    await waitTx(await usdc.connect(charlie).approve(SEAPORT, LIST_PRICE), 'BUYER_SEAPORT_USDC_APPROVAL', state);
  }
  const [buyerBefore, safeBefore, vaultBefore, sellerBefore] = await Promise.all([
    usdc.balanceOf(charlie.address), usdc.balanceOf(SAFE), usdc.balanceOf(C.NexRoyaltyVault), usdc.balanceOf(bob.address)
  ]);
  await waitTx(await seaport.connect(charlie).fulfillOrder([state.order, state.orderSignature], ZeroHash), 'SEAPORT_FULFILL', state);
  const [buyerAfter, safeAfter, vaultAfter, sellerAfter] = await Promise.all([
    usdc.balanceOf(charlie.address), usdc.balanceOf(SAFE), usdc.balanceOf(C.NexRoyaltyVault), usdc.balanceOf(bob.address)
  ]);
  const d = { buyer: buyerBefore - buyerAfter, protocol: safeAfter - safeBefore, royalty: vaultAfter - vaultBefore, seller: sellerAfter - sellerBefore };
  const exp = { buyer: LIST_PRICE, protocol: 80_000n, royalty: 400_000n, seller: 7_520_000n };
  if (d.buyer !== exp.buyer || d.protocol !== exp.protocol || d.royalty !== exp.royalty || d.seller !== exp.seller) {
    throw new Error(`SECONDARY_ECONOMICS_MISMATCH:${json(d)}`);
  }
  if (lower(await edition.ownerOf(1n)) !== lower(charlie.address)) throw new Error('SALE_OWNERSHIP_MISMATCH');
  const info = await listingRegistry.listingInfo(state.orderHash);
  if (Number(info.status) !== 3) throw new Error('LISTING_NOT_FILLED');

  // Vault + Advantage followed the Pass.
  if (lower(await resolver.account(state.edition, 1n)) !== lower(state.passVault)) throw new Error('VAULT_ADDRESS_CHANGED');
  if ((await nex.balanceOf(state.passVault)) !== VAULT_NEX) throw new Error('VAULT_NEX_LOST_IN_SALE');
  if ((await advantageRegistry.remaining(state.edition, 1n, ADVANTAGE_ID)) !== CREDITS - 3n) throw new Error('ADVANTAGE_LOST_IN_SALE');
  state.phase = 'post';
  await saveState(state);
  console.log(label(`sale certified: ${json(d)} — vault and 7 credits followed the Pass`));
}

// ---------------------------------------------------------------------------
// PHASE: post  (new owner controls the Vault; seller is locked out)
// ---------------------------------------------------------------------------
if (state.phase === 'post') {
  const charlie = walletFor('charlie');
  const bob = walletFor('bob');
  const tba = new Contract(state.passVault, abis.tba, provider);
  if (lower(await tba.owner()) !== lower(charlie.address)) throw new Error('TBA_NEW_OWNER_MISMATCH');

  await expectRevert(
    () => tba.connect(bob).execute.staticCall(state.deployments.nex, 0n, erc20Iface.encodeFunctionData('transfer', [bob.address, 1n]), 0),
    'InvalidSigner',
    'SELLER_VAULT_EXEC_AFTER_SALE'
  );
  const charlieNexBefore = await (new Contract(state.deployments.nex, abis.erc20, provider)).balanceOf(charlie.address);
  await waitTx(
    await tba.connect(charlie).execute(state.deployments.nex, 0n, erc20Iface.encodeFunctionData('transfer', [charlie.address, VAULT_NEX]), 0),
    'BUYER_VAULT_CLAIM_NEX',
    state
  );
  const nex = new Contract(state.deployments.nex, abis.erc20, provider);
  if ((await nex.balanceOf(charlie.address)) - charlieNexBefore !== VAULT_NEX) throw new Error('BUYER_CLAIM_DELTA_MISMATCH');

  state.phase = 'done';
  state.completedAt = new Date().toISOString();
  await saveState(state);
  await writeFile(EVIDENCE_FILE, json({
    network: 'base-sepolia',
    chainId: 84532,
    contracts: C,
    wallets: Object.fromEntries(Object.entries(state.wallets).map(([k, w]) => [k, w.address])),
    edition: state.edition,
    termsHash: state.termsHash,
    passVault: state.passVault,
    orderHash: state.orderHash,
    rewardPolicyId: state.rewardPolicyId,
    rewardCycleId: state.rewardCycleId,
    window: state.window,
    evidence: state.evidence
  }) + '\n');
  console.log(label(`JOURNEY COMPLETE — evidence written to scratch/base-sepolia-journey/evidence.json`));
  console.log(label(`edition=${state.edition} termsHash=${state.termsHash} vault=${state.passVault}`));
}
