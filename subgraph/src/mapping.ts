import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { NexPassEdition as NexPassEditionTemplate } from "../generated/templates";
import { NexAdvantageRegistry as AdvantageRegistryContract } from "../generated/NexAdvantageRegistry/NexAdvantageRegistry";
import { EditionCreated } from "../generated/NexPassFactory/NexPassFactory";
import {
  EditionRegistered,
  EditionPublisherSet,
  EditionDisabledSet,
  TermsPublished
} from "../generated/NexLaunchRegistry/NexLaunchRegistry";
import {
  PrimaryMintSettled,
  ReferralHintSubmitted
} from "../generated/NexMintController/NexMintController";
import {
  PassAdvantagesInitialized,
  PassListingStateSet,
  AdvantageConsumed
} from "../generated/NexAdvantageRegistry/NexAdvantageRegistry";
import { MintAdvantagesInitialized } from "../generated/NexAdvantageInitializer/NexAdvantageInitializer";
import {
  ListingCreated,
  ListingCancelled,
  ListingFilled,
  SecondarySaleSettled,
  ListingExpired,
  ListingStale
} from "../generated/NexListingRegistry/NexListingRegistry";
import { RoyaltyRecorded, RoyaltyWithdrawn } from "../generated/NexRoyaltyVault/NexRoyaltyVault";
import { PassAccountCreated } from "../generated/NexTBAResolver/NexTBAResolver";
import { ERC6551AccountCreated } from "../generated/ERC6551Registry/ERC6551Registry";
import { OrderFulfilled } from "../generated/Seaport16/Seaport16";
import {
  Transfer,
  EditionMinted,
  EditionConfigured,
  MintControllerSet
} from "../generated/templates/NexPassEdition/NexPassEdition";
import {
  ProtocolDeployment,
  Edition,
  TermsVersion,
  Pass,
  PassTransfer,
  PrimaryMint,
  AdvantageDefinition,
  AdvantageState,
  AdvantageConsumption,
  Listing,
  SecondarySale,
  RoyaltyClaim,
  TokenBoundAccount,
  SettlementEvidence
} from "../generated/schema";

const CHAIN_ID = BigInt.fromI32(46630);
const START_BLOCK = BigInt.fromI32(104607055);
const ADVANTAGE_REGISTRY = Address.fromString("0x1e265Fee39d75b5211895820926B4ff77B4f1cDd");
const ERC6551_REGISTRY = Address.fromString("0x000000006551c19487814612e58FE06813775758");
const SEAPORT = Address.fromString("0x0000000000000068F116a894984e2DB1123eB395");
const ZERO_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000000");
const ZERO_BYTES32 = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000");

function addressId(value: Address): string { return value.toHexString().toLowerCase(); }
function bytesId(value: Bytes): string { return value.toHexString().toLowerCase(); }
function passId(edition: Address, tokenId: BigInt): string { return `${addressId(edition)}-${tokenId.toString()}`; }
function transferId(event: ethereum.Event, tokenId: BigInt): string { return `${event.transaction.hash.toHexString()}-${event.logIndex.toString()}-${tokenId.toString()}`; }
function eventBlock(event: ethereum.Event): BigInt { return event.block.number; }
function eventTimestamp(event: ethereum.Event): BigInt { return event.block.timestamp; }
function eventTx(event: ethereum.Event): Bytes { return event.transaction.hash; }

function loadEdition(address: Address): Edition | null { return Edition.load(addressId(address)); }

function ensureProtocolDeployment(event: ethereum.Event, factory: Address, controller: Address, admin: Address): void {
  let deployment = ProtocolDeployment.load(CHAIN_ID.toString());
  if (deployment == null) deployment = new ProtocolDeployment(CHAIN_ID.toString());
  deployment.chainId = CHAIN_ID;
  deployment.factory = factory;
  deployment.launchRegistry = Address.fromString("0xeE3C8F330C0B2738201fDb2F1720D06c0D27620d");
  deployment.mintController = controller;
  deployment.advantageRegistry = ADVANTAGE_REGISTRY;
  deployment.advantageInitializer = Address.fromString("0x4024bB2A5134c2066E2FDE6fC3a1311e2234499A");
  deployment.royaltyVault = Address.fromString("0x9D69ab1897aFA9d6ffc97EEa6A936233a999DFa1");
  deployment.listingRegistry = Address.fromString("0xF8fD8D378F6a61Ecb207732F4f1d0c3E4Eb2c75c");
  deployment.marketsZone = Address.fromString("0xF21dA23d8928b320124fBc17bd678c7C48c55af6");
  deployment.tbaResolver = Address.fromString("0x55b64D8c1f17ba08a39c939D3248E7A2731Fa8b8");
  deployment.erc6551Registry = ERC6551_REGISTRY;
  deployment.seaport = SEAPORT;
  deployment.startBlock = START_BLOCK;
  deployment.save();
}

function ensurePass(editionAddress: Address, tokenId: BigInt, owner: Address): Pass | null {
  let edition = loadEdition(editionAddress);
  if (edition == null) return null;
  let id = passId(editionAddress, tokenId);
  let pass = Pass.load(id);
  if (pass == null) {
    pass = new Pass(id);
    pass.edition = edition.id;
    pass.tokenId = tokenId;
    pass.listed = false;
    pass.owner = owner;
  } else if (owner.toHexString() != ZERO_ADDRESS.toHexString()) {
    // Context-only events such as PassAdvantagesInitialized do not carry an
    // owner. Preserve the latest canonical ERC-721 Transfer owner instead of
    // replacing it with the zero-address placeholder.
    pass.owner = owner;
  }
  pass.save();
  return pass;
}

function termsFor(editionAddress: Address, hash: Bytes): TermsVersion | null {
  return TermsVersion.load(`${addressId(editionAddress)}-${bytesId(hash)}`);
}

function kindName(kind: i32): string {
  if (kind == 0) return "TIME_BASED";
  if (kind == 1) return "QUANTITY_BASED";
  if (kind == 2) return "CONNECTED";
  if (kind == 3) return "REDEMPTION";
  return "UNKNOWN";
}

function hydrateAdvantages(event: ethereum.Event, editionAddress: Address, tokenId: BigInt, termsHash: Bytes): void {
  let pass = ensurePass(editionAddress, tokenId, ZERO_ADDRESS);
  if (pass == null) return;
  let registry = AdvantageRegistryContract.bind(ADVANTAGE_REGISTRY);
  let ids = registry.advantageIds(editionAddress, tokenId);
  for (let i = 0; i < ids.length; i++) {
    let value = registry.advantageInfo(editionAddress, tokenId, ids[i]);
    let advantageId = ids[i];
    let definitionId = `${addressId(editionAddress)}-${bytesId(termsHash)}-${bytesId(advantageId)}`;
    let definition = AdvantageDefinition.load(definitionId);
    if (definition == null) definition = new AdvantageDefinition(definitionId);
    definition.edition = addressId(editionAddress);
    definition.termsHash = termsHash;
    definition.advantageId = advantageId;
    definition.kind = kindName(value.kind);
    definition.startsAt = value.startsAt;
    definition.endsAt = value.endsAt;
    definition.totalUnits = value.totalUnits;
    definition.definitionHash = value.definitionHash;
    definition.save();

    let stateId = `${pass.id}-${bytesId(advantageId)}`;
    let state = AdvantageState.load(stateId);
    if (state == null) state = new AdvantageState(stateId);
    state.pass = pass.id;
    state.edition = addressId(editionAddress);
    state.tokenId = tokenId;
    state.advantageId = advantageId;
    state.termsHash = termsHash;
    state.kind = kindName(value.kind);
    state.startsAt = value.startsAt;
    state.endsAt = value.endsAt;
    state.totalUnits = value.totalUnits;
    state.remainingUnits = value.remainingUnits;
    state.frozenSeconds = value.frozenSeconds;
    state.listed = pass.listed;
    state.definitionHash = value.definitionHash;
    state.initializedBlock = eventBlock(event);
    state.lastUpdatedBlock = eventBlock(event);
    state.save();
  }
}

export function handleEditionCreated(event: EditionCreated): void {
  let id = addressId(event.params.edition);
  let edition = new Edition(id);
  edition.address = event.params.edition;
  edition.editionId = event.params.editionId;
  edition.publisher = event.params.publisher;
  edition.protocolAdmin = event.params.protocolAdmin;
  edition.mintController = event.params.mintController;
  edition.absoluteSupplyCap = event.params.absoluteSupplyCap;
  edition.artworkCommitment = event.params.artworkCommitment;
  edition.totalMinted = BigInt.zero();
  edition.disabled = false;
  edition.createdBlock = eventBlock(event);
  edition.createdTimestamp = eventTimestamp(event);
  edition.createdTx = eventTx(event);
  edition.save();
  ensureProtocolDeployment(event, event.address, event.params.mintController, event.params.protocolAdmin);
  NexPassEditionTemplate.create(event.params.edition);
}

export function handleEditionRegistered(event: EditionRegistered): void {
  let edition = loadEdition(event.params.edition);
  if (edition == null) return;
  edition.editionId = event.params.editionId;
  edition.publisher = event.params.publisher;
  edition.absoluteSupplyCap = event.params.absoluteSupplyCap;
  edition.save();
}

export function handleEditionPublisherSet(event: EditionPublisherSet): void {
  let edition = loadEdition(event.params.edition);
  if (edition == null) return;
  edition.publisher = event.params.publisher;
  edition.save();
}

export function handleEditionDisabledSet(event: EditionDisabledSet): void {
  let edition = loadEdition(event.params.edition);
  if (edition == null) return;
  edition.disabled = event.params.disabled;
  edition.save();
}

export function handleTermsPublished(event: TermsPublished): void {
  let edition = loadEdition(event.params.edition);
  if (edition == null) return;
  let id = `${addressId(event.params.edition)}-${bytesId(event.params.termsVersionHash)}`;
  let terms = new TermsVersion(id);
  terms.edition = edition.id;
  terms.hash = event.params.termsVersionHash;
  terms.version = event.params.version;
  terms.activeSupply = event.params.activeSupply;
  terms.pricePerPass = event.params.pricePerPass;
  terms.previewStartsAt = event.params.previewStartsAt;
  terms.mintStartsAt = event.params.mintStartsAt;
  terms.mintEndsAt = event.params.mintEndsAt;
  terms.primaryRecipient = event.params.primaryRecipient;
  terms.royaltyReceiver = event.params.royaltyReceiver;
  terms.royaltyBps = event.params.royaltyBps;
  terms.advantagesHash = event.params.advantagesHash;
  terms.referralTermsHash = event.params.referralTermsHash;
  terms.blockNumber = eventBlock(event);
  terms.timestamp = eventTimestamp(event);
  terms.transactionHash = eventTx(event);
  terms.save();
  edition.currentTerms = terms.id;
  edition.save();
}

export function handlePrimaryMintSettled(event: PrimaryMintSettled): void {
  let edition = loadEdition(event.params.edition);
  if (edition == null) return;
  let mint = new PrimaryMint(`${event.transaction.hash.toHexString()}-${event.logIndex.toString()}`);
  mint.edition = edition.id;
  mint.payer = event.params.payer;
  mint.recipient = event.params.recipient;
  mint.termsHash = event.params.termsVersionHash;
  mint.intentId = event.params.intentId;
  mint.firstTokenId = event.params.firstTokenId;
  mint.quantity = event.params.quantity;
  mint.totalPaid = event.params.totalPaid;
  mint.protocolFee = event.params.protocolFee;
  mint.blockNumber = eventBlock(event);
  mint.timestamp = eventTimestamp(event);
  mint.transactionHash = eventTx(event);
  mint.save();
}

export function handleReferralHintSubmitted(_event: ReferralHintSubmitted): void {
  // ReferralHintSubmitted is deliberately noncanonical. It is not persisted as
  // a payable referral and is consumed by the off-chain qualification ledger.
}

export function handleEditionConfigured(event: EditionConfigured): void {
  let edition = loadEdition(event.address);
  if (edition == null) return;
  edition.editionId = event.params.editionId;
  edition.artworkCommitment = event.params.artworkCommitment;
  edition.absoluteSupplyCap = event.params.absoluteSupplyCap;
  edition.save();
}

export function handleEditionMintControllerSet(event: MintControllerSet): void {
  let edition = loadEdition(event.address);
  if (edition == null) return;
  edition.mintController = event.params.controller;
  edition.save();
}

export function handleEditionMinted(event: EditionMinted): void {
  let edition = loadEdition(event.address);
  if (edition == null) return;
  let first = event.params.firstTokenId;
  let quantity = event.params.quantity;
  for (let i = BigInt.zero(); i.lt(quantity); i = i.plus(BigInt.fromI32(1))) {
    let tokenId = first.plus(i);
    let pass = ensurePass(event.address, tokenId, event.params.to);
    if (pass == null) continue;
    pass.termsHash = event.params.termsVersionHash;
    let historicalTerms = termsFor(event.address, event.params.termsVersionHash);
    if (historicalTerms != null) pass.terms = historicalTerms.id;
    pass.mintBlock = eventBlock(event);
    pass.mintTimestamp = eventTimestamp(event);
    pass.mintTransactionHash = eventTx(event);
    pass.royaltyReceiver = event.params.royaltyReceiver;
    pass.royaltyBps = event.params.royaltyBps;
    pass.save();
  }
  edition.totalMinted = edition.totalMinted.plus(quantity);
  edition.save();
}

export function handleEditionTransfer(event: Transfer): void {
  let pass = ensurePass(event.address, event.params.tokenId, event.params.to);
  if (pass == null) return;
  pass.owner = event.params.to;
  pass.save();
  let transfer = new PassTransfer(transferId(event, event.params.tokenId));
  transfer.pass = pass.id;
  transfer.from = event.params.from;
  transfer.to = event.params.to;
  transfer.blockNumber = eventBlock(event);
  transfer.timestamp = eventTimestamp(event);
  transfer.transactionHash = eventTx(event);
  transfer.save();
}

export function handlePassAdvantagesInitialized(event: PassAdvantagesInitialized): void {
  let pass = ensurePass(event.params.edition, event.params.tokenId, ZERO_ADDRESS);
  if (pass == null) return;
  pass.termsHash = event.params.termsVersionHash;
  pass.save();
  hydrateAdvantages(event, event.params.edition, event.params.tokenId, event.params.termsVersionHash);
}

export function handleMintAdvantagesInitialized(event: MintAdvantagesInitialized): void {
  // The per-token PassAdvantagesInitialized events carry the exact state. This
  // batch event remains available in the history without duplicating entities.
}

export function handlePassListingStateSet(event: PassListingStateSet): void {
  let pass = ensurePass(event.params.edition, event.params.tokenId, ZERO_ADDRESS);
  if (pass == null) return;
  pass.listed = event.params.listed;
  pass.save();
  // The contract applies listing state to every Advantage on the exact Pass.
  // Re-read each state at this event block so TimeBased frozenSeconds remains
  // per-Advantage rather than being approximated at Pass level.
  let registry = AdvantageRegistryContract.bind(ADVANTAGE_REGISTRY);
  let ids = registry.advantageIds(event.params.edition, event.params.tokenId);
  for (let i = 0; i < ids.length; i++) {
    let state = AdvantageState.load(`${pass.id}-${bytesId(ids[i])}`);
    if (state == null) continue;
    let value = registry.advantageInfo(event.params.edition, event.params.tokenId, ids[i]);
    state.listed = event.params.listed;
    state.listedAt = event.params.listed ? eventTimestamp(event) : null;
    state.frozenSeconds = value.frozenSeconds;
    state.remainingUnits = value.remainingUnits;
    state.lastUpdatedBlock = eventBlock(event);
    state.save();
  }
}

export function handleAdvantageConsumed(event: AdvantageConsumed): void {
  let pass = ensurePass(event.params.edition, event.params.tokenId, event.params.owner);
  if (pass == null) return;
  let stateId = `${pass.id}-${bytesId(event.params.advantageId)}`;
  let state = AdvantageState.load(stateId);
  if (state == null) return;
  state.remainingUnits = event.params.remainingUnits;
  state.lastUseId = event.params.useId;
  state.lastUpdatedBlock = eventBlock(event);
  state.save();
  let consumption = new AdvantageConsumption(`${event.transaction.hash.toHexString()}-${event.logIndex.toString()}`);
  consumption.pass = pass.id;
  consumption.advantage = state.id;
  consumption.owner = event.params.owner;
  consumption.useId = event.params.useId;
  consumption.amount = event.params.amount;
  consumption.remainingUnits = event.params.remainingUnits;
  consumption.blockNumber = eventBlock(event);
  consumption.timestamp = eventTimestamp(event);
  consumption.transactionHash = eventTx(event);
  consumption.save();
}

function listingFor(orderHash: Bytes): Listing | null { return Listing.load(bytesId(orderHash)); }

export function handleListingCreated(event: ListingCreated): void {
  let edition = loadEdition(event.params.edition);
  if (edition == null) return;
  let listing = new Listing(bytesId(event.params.orderHash));
  listing.orderHash = event.params.orderHash;
  listing.edition = edition.id;
  listing.tokenId = event.params.tokenId;
  listing.seller = event.params.seller;
  listing.termsHash = event.params.termsVersionHash;
  listing.price = event.params.usdGPrice;
  listing.royaltyReceiver = event.params.royaltyReceiver;
  listing.royaltyBps = event.params.royaltyBps;
  listing.startTime = event.params.startTime;
  listing.expiry = event.params.expiry;
  listing.zoneHash = event.params.zoneHash;
  listing.status = "ACTIVE";
  listing.createdBlock = eventBlock(event);
  listing.createdTimestamp = eventTimestamp(event);
  listing.createdTransactionHash = eventTx(event);
  listing.updatedBlock = eventBlock(event);
  listing.updatedTimestamp = eventTimestamp(event);
  listing.updatedTransactionHash = eventTx(event);
  listing.save();
}

function updateListing(event: ethereum.Event, orderHash: Bytes, status: string): Listing | null {
  let listing = listingFor(orderHash);
  if (listing == null) return null;
  listing.status = status;
  listing.updatedBlock = eventBlock(event);
  listing.updatedTimestamp = eventTimestamp(event);
  listing.updatedTransactionHash = eventTx(event);
  listing.save();
  return listing;
}

export function handleListingCancelled(event: ListingCancelled): void { updateListing(event, event.params.orderHash, "CANCELLED"); }
export function handleListingExpired(event: ListingExpired): void { updateListing(event, event.params.orderHash, "EXPIRED"); }
export function handleListingStale(event: ListingStale): void { updateListing(event, event.params.orderHash, "STALE"); }

export function handleListingFilled(event: ListingFilled): void {
  let listing = updateListing(event, event.params.orderHash, "FILLED");
  if (listing == null) return;
  listing.buyer = event.params.buyer;
  listing.save();
}

export function handleSecondarySaleSettled(event: SecondarySaleSettled): void {
  let listing = listingFor(event.params.orderHash);
  if (listing == null) return;
  listing.salePrice = event.params.salePrice;
  listing.protocolFee = event.params.protocolFee;
  listing.builderRoyalty = event.params.builderRoyalty;
  listing.sellerProceeds = event.params.sellerProceeds;
  listing.save();
  let sale = new SecondarySale(`${event.transaction.hash.toHexString()}-${event.logIndex.toString()}`);
  sale.listing = listing.id;
  sale.orderHash = event.params.orderHash;
  sale.buyer = event.params.buyer;
  sale.salePrice = event.params.salePrice;
  sale.protocolFee = event.params.protocolFee;
  sale.builderRoyalty = event.params.builderRoyalty;
  sale.sellerProceeds = event.params.sellerProceeds;
  sale.blockNumber = eventBlock(event);
  sale.timestamp = eventTimestamp(event);
  sale.transactionHash = eventTx(event);
  sale.save();
}

export function handleRoyaltyRecorded(event: RoyaltyRecorded): void {
  let edition = loadEdition(event.params.edition);
  if (edition == null) return;
  let claim = new RoyaltyClaim(bytesId(event.params.orderHash));
  claim.orderHash = event.params.orderHash;
  claim.edition = edition.id;
  claim.tokenId = event.params.tokenId;
  claim.builder = event.params.builder;
  claim.amount = event.params.amount;
  claim.releaseAt = event.params.releaseAt;
  claim.withdrawn = false;
  claim.recordedBlock = eventBlock(event);
  claim.recordedTimestamp = eventTimestamp(event);
  claim.recordedTransactionHash = eventTx(event);
  claim.save();
}

export function handleRoyaltyWithdrawn(event: RoyaltyWithdrawn): void {
  let claim = RoyaltyClaim.load(bytesId(event.params.orderHash));
  if (claim == null) return;
  claim.withdrawn = true;
  claim.withdrawnBlock = eventBlock(event);
  claim.withdrawnTimestamp = eventTimestamp(event);
  claim.withdrawnTransactionHash = eventTx(event);
  claim.save();
}

function saveTba(event: ethereum.Event, editionAddress: Address, tokenId: BigInt, account: Address, implementation: Address): void {
  let edition = loadEdition(editionAddress);
  if (edition == null) return;
  let id = passId(editionAddress, tokenId);
  let tba = TokenBoundAccount.load(id);
  if (tba == null) tba = new TokenBoundAccount(id);
  tba.account = account;
  tba.edition = edition.id;
  tba.tokenId = tokenId;
  tba.implementation = implementation;
  tba.registry = event.address;
  tba.createdBlock = eventBlock(event);
  tba.createdTimestamp = eventTimestamp(event);
  tba.createdTransactionHash = eventTx(event);
  tba.save();
  let pass = Pass.load(id);
  if (pass != null) { pass.tba = tba.id; pass.save(); }
}

export function handlePassAccountCreated(event: PassAccountCreated): void { saveTba(event, event.params.edition, event.params.tokenId, event.params.account, ZERO_ADDRESS); }
export function handleERC6551AccountCreated(event: ERC6551AccountCreated): void { saveTba(event, event.params.tokenContract, event.params.tokenId, event.params.account, event.params.implementation); }

export function handleOrderFulfilled(event: OrderFulfilled): void {
  let evidence = new SettlementEvidence(`${event.transaction.hash.toHexString()}-${event.logIndex.toString()}`);
  evidence.orderHash = event.params.orderHash;
  evidence.offerer = event.params.offerer;
  evidence.zone = event.params.zone;
  evidence.recipient = event.params.recipient;
  let listing = listingFor(event.params.orderHash);
  if (listing != null) evidence.edition = listing.edition;
  evidence.blockNumber = eventBlock(event);
  evidence.timestamp = eventTimestamp(event);
  evidence.transactionHash = eventTx(event);
  evidence.save();
}
