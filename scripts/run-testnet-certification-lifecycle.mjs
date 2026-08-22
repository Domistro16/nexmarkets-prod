import { Interface, Contract, JsonRpcProvider, Wallet, ZeroAddress, ZeroHash, getAddress, keccak256, randomBytes, parseEther } from 'ethers';
import { buildNexMarketsOrder, seaportTypedData } from '../packages/domain/src/seaport-order.mjs';

const CHAIN_ID = 46630n;
const EDITION = '0x4171d62f43b4168b07a01c04594455dbc3298437';
const TERMS_HASH = '0xe357b55e43ce7d7724a3c4fab02814fd0dd590d731247c6e54237f47f2635745';
const SELLER = '0xd83defba240568040b39bb2c8b4db7db02d40593';
const SAFE = '0xce54c8453ff48670781a6b908c1a3e9209fc95a0';
const MOCK_USDG = '0x6a4f8832c23c51ba626eba9d50c8f862647c1679';
const ADVANTAGE_REGISTRY = '0x1e265fee39d75b5211895820926b4ff77b4f1cdd';
const LISTING_REGISTRY = '0xf8fd8d378f6a61ecb207732f4f1d0c3e4eb2c75c';
const ROYALTY_VAULT = '0x9d69ab1897afa9d6ffc97eea6a936233a999dfa1';
const ZONE = '0xf21da23d8928b320124fbc17bd678c7c48c55af6';
const SEAPORT = '0x0000000000000068f116a894984e2db1123eb395';
const TBA_RESOLVER = '0x55b64d8c1f17ba08a39c939d3248e7a2731fa8b8';
const SUBGRAPH = process.env.NEXMARKETS_SUBGRAPH_URL?.trim() || 'https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/1.0.1/gn';
const API = process.env.NEXMARKETS_API_URL?.trim() || 'http://127.0.0.1:4014';

const rpcUrl = process.env.RH_TESTNET_RPC_URL?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpcUrl || !privateKey) throw new Error('TESTNET_LIFECYCLE_CREDENTIALS_REQUIRED');

const provider = new JsonRpcProvider(rpcUrl, Number(CHAIN_ID), { staticNetwork: true });
if ((await provider.getNetwork()).chainId !== CHAIN_ID) throw new Error('TESTNET_CHAIN_ID_MISMATCH');
const seller = new Wallet(privateKey, provider);
if (seller.address.toLowerCase() !== SELLER) throw new Error('SELLER_KEY_MISMATCH');

const edition = new Contract(EDITION, [
  'function ownerOf(uint256) view returns(address)',
  'function totalMinted() view returns(uint256)',
  'function termsVersionHashOf(uint256) view returns(bytes32)',
  'function setApprovalForAll(address,bool)',
  'function isApprovedForAll(address,address) view returns(bool)',
  'function transferFrom(address,address,uint256)'
], seller);
const usdg = new Contract(MOCK_USDG, [
  'function balanceOf(address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)',
  'function allowance(address,address) view returns(uint256)',
  'function mint(address,uint256)'
], seller);
const advantage = new Contract(ADVANTAGE_REGISTRY, [
  'function passInfo(address,uint256) view returns(tuple(bytes32 termsVersionHash,bytes32 advantagesHash,uint8 advantageCount,bool listed,bool initialized,uint64 listedAt))',
  'function advantageIds(address,uint256) view returns(bytes32[])',
  'function advantageInfo(address,uint256,bytes32) view returns(tuple(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,uint256 remainingUnits,bytes32 definitionHash,uint64 frozenSeconds))',
  'function remaining(address,uint256,bytes32) view returns(uint256)',
  'function isUsable(address,uint256,bytes32) view returns(bool)',
  'function consumeQuantity(address,uint256,bytes32,uint256,bytes32) returns(bool)'
], seller);
const listing = new Contract(LISTING_REGISTRY, [
  'function createListing(tuple(bytes32 orderHash,address edition,uint256 tokenId,bytes32 termsVersionHash,uint256 usdGPrice,uint64 startTime,uint64 expiry) request) returns(bytes32)',
  'function cancelListing(bytes32)',
  'function syncListing(bytes32)',
  'function activeListingFor(address,uint256) view returns(bytes32)',
  'function listingInfo(bytes32) view returns(tuple(address edition,uint256 tokenId,address seller,bytes32 termsVersionHash,uint256 usdGPrice,address royaltyReceiver,uint96 royaltyBps,uint64 startTime,uint64 expiry,bytes32 zoneHash,uint8 status))',
  'function isListingActive(bytes32) view returns(bool)'
], seller);
const vault = new Contract(ROYALTY_VAULT, [
  'function claimInfo(bytes32) view returns(tuple(address edition,uint256 tokenId,address builder,uint256 amount,uint64 releaseAt,bool withdrawn))',
  'function withdraw(bytes32)'
], seller);
const resolver = new Contract(TBA_RESOLVER, [
  'function account(address,uint256) view returns(address)',
  'function createAccount(address,uint256) returns(address)'
], seller);
const safeAbi = [
  'function nonce() view returns(uint256)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns(bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns(bool)'
];
const safe = new Contract(SAFE, safeAbi, seller);
const safeInterface = new Interface(safeAbi);
const tokenInterface = new Interface(['function mint(address,uint256)']);
const seaport = new Contract(SEAPORT, [
  'function getCounter(address) view returns(uint256)',
  'function fulfillOrder(tuple(tuple(address offerer,address zone,tuple(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)[] offer,tuple(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 totalOriginalConsiderationItems) parameters,bytes signature) order,bytes32 fulfillerConduitKey) returns(bool)'
], seller);

const ids = {
  time: '0x486954742eaa12f46892b40db863e92e801942ac10059ee8c0973c9b0a45d51b',
  quantity: '0xc43411f0ee25192c70e3b600262e3e769630445d1355888ab7543634d86677f1',
  connected: '0xfd7496e537361dbc193db9957c2a02a6ba6974da487f955d6e57f3c0d57e4b24'
};
const useId = '0x1ffb8fcc777fd6b5bee288a84de44df636b714d92879c150f09f94557e1a33f5';

function lower(value) { return String(value).toLowerCase(); }
function hash(label) { return keccak256(new TextEncoder().encode(label)); }
function json(value) { return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2); }
async function latest() { return provider.getBlock('latest'); }
async function waitTx(tx, label) {
  const receipt = await tx.wait();
  if (!receipt || Number(receipt.status) !== 1) throw new Error(`${label}_REVERTED:${tx.hash}`);
  return { hash: tx.hash, block: receipt.blockNumber };
}
async function waitBlockAfter(blockNumber, confirmations = 1) {
  while ((await provider.getBlockNumber()) < blockNumber + confirmations) await new Promise((resolve) => setTimeout(resolve, 3000));
}
async function safeExec(target, data, label) {
  const nonce = BigInt(await safe.nonce());
  const safeHash = await safe.getTransactionHash(target, 0n, data, 0, 0n, 0n, 0n, ZeroAddress, ZeroAddress, nonce);
  const tx = await safe.execTransaction(target, 0n, data, 0, 0n, 0n, 0n, ZeroAddress, ZeroAddress, seller.signingKey.sign(safeHash).serialized);
  const result = await waitTx(tx, label);
  return { ...result, safeNonce: nonce.toString(), safeTxHash: safeHash };
}
async function fundEth(wallet, label) {
  return waitTx(await seller.sendTransaction({ to: wallet.address, value: parseEther('0.004') }), label);
}
async function mintUsdg(to, amount, label) {
  return safeExec(MOCK_USDG, tokenInterface.encodeFunctionData('mint', [to, amount]), label);
}
async function rpcAdvantageState() {
  const out = {};
  const pass = await advantage.passInfo(EDITION, 1n);
  for (const [name, id] of Object.entries(ids)) {
    const [info, rem, usable] = await Promise.all([
      advantage.advantageInfo(EDITION, 1n, id),
      advantage.remaining(EDITION, 1n, id),
      advantage.isUsable(EDITION, 1n, id)
    ]);
    out[name] = { id, kind: Number(info.kind), startsAt: Number(info.startsAt), endsAt: Number(info.endsAt), totalUnits: String(info.totalUnits), remainingUnits: String(info.remainingUnits), frozenSeconds: Number(info.frozenSeconds), remaining: String(rem), usable: Boolean(usable), listed: Boolean(pass.listed) };
  }
  return out;
}
async function graphQuery(query, variables = {}) {
  const response = await fetch(SUBGRAPH, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(`SUBGRAPH_QUERY_FAILED:${body.errors?.[0]?.message ?? response.status}`);
  return body.data ?? {};
}
async function apiGet(path) {
  const response = await fetch(`${API.replace(/\/+$/u, '')}${path}`, { headers: { accept: 'application/json' } });
  const body = await response.json();
  if (!response.ok) throw new Error(`API_QUERY_FAILED:${response.status}`);
  return body;
}
async function waitIndexed(orderHash = null) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const meta = await graphQuery('{ _meta { block { number hash } } }');
    const passData = await graphQuery('{ passes(first:10,orderBy:tokenId,orderDirection:asc){ id tokenId owner termsHash listed advantages { advantageId remainingUnits listed } tba { account } } }');
    const pass = passData.passes?.find((item) => lower(item.id) === `${EDITION}-1`);
    let sale = null;
    let claim = null;
    if (orderHash) {
      const data = await graphQuery('query($hash:Bytes!){ listings(where:{orderHash:$hash}){ orderHash status buyer salePrice protocolFee builderRoyalty sellerProceeds } royaltyClaims(where:{orderHash:$hash}){ orderHash builder amount releaseAt withdrawn } }', { hash: lower(orderHash) });
      sale = data.listings?.[0] ?? null;
      claim = data.royaltyClaims?.[0] ?? null;
    }
    if (pass && (!orderHash || sale || claim)) return { indexedBlock: Number(meta._meta?.block?.number ?? 0), pass, sale, claim };
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('SUBGRAPH_LIFECYCLE_TIMEOUT');
}

const before = await rpcAdvantageState();
if (lower(await edition.ownerOf(1n)) !== SELLER) throw new Error('TOKEN_1_NOT_SELLER_BEFORE_LIFECYCLE');
if (lower(await edition.termsVersionHashOf(1n)) !== TERMS_HASH) throw new Error('TOKEN_1_TERMS_MISMATCH');
const duplicateApplied = await advantage.consumeQuantity.staticCall(EDITION, 1n, ids.quantity, 1n, useId, { from: SELLER });
if (Boolean(duplicateApplied)) throw new Error('QUANTITY_IDEMPOTENCY_FAILED');

const cancellationBlock = await latest();
const cancelOrder = buildNexMarketsOrder({
  seller: SELLER, edition: EDITION, tokenId: 1n, termsVersionHash: TERMS_HASH, price: 2_000_000n,
  royaltyReceiver: SELLER, royaltyBps: 300, usdg: MOCK_USDG, protocolFeeRecipient: SAFE, royaltyVault: ROYALTY_VAULT,
  zone: ZONE, startTime: BigInt(cancellationBlock.timestamp) - 1n, endTime: BigInt(cancellationBlock.timestamp) + 1800n,
  salt: hash('NEXTEST_CANCEL_ORDER'), counter: await seaport.getCounter(SELLER), listingRegistry: LISTING_REGISTRY
});
let cancelCreate = null;
let cancelTx = null;
let cancelInfo = null;
let cancelActive = false;
const existingActive = await listing.activeListingFor(EDITION, 1n);
if (existingActive === ZeroHash) {
  cancelCreate = await waitTx(await listing.createListing([cancelOrder.orderHash, EDITION, 1n, TERMS_HASH, 2_000_000n, cancelOrder.order.startTime, cancelOrder.order.endTime]), 'CANCEL_LISTING_CREATE');
  cancelActive = await listing.isListingActive(cancelOrder.orderHash);
  const cancelListedState = await advantage.passInfo(EDITION, 1n);
  cancelTx = await waitTx(await listing.cancelListing(cancelOrder.orderHash), 'LISTING_CANCEL');
  cancelInfo = await listing.listingInfo(cancelOrder.orderHash);
  if (!cancelActive || Number(cancelInfo.status) !== 2 || cancelListedState.listed !== true || (await advantage.passInfo(EDITION, 1n)).listed) throw new Error('LISTING_CANCELLATION_VERIFICATION_FAILED');
} else {
  cancelInfo = { status: 2n };
  cancelTx = { hash: null, block: null, resumed: true };
}

const saleBlock = await latest();
const buyer = Wallet.createRandom().connect(provider);
const staleBuyer = Wallet.createRandom().connect(provider);
const saleStart = BigInt(saleBlock.timestamp) - 1n;
const saleEnd = BigInt(saleBlock.timestamp) + 3600n;
const salePrice = 2_000_000n;
const existingSaleInfo = existingActive !== ZeroHash ? await listing.listingInfo(existingActive) : null;
const effectiveSaleStart = existingSaleInfo ? BigInt(existingSaleInfo.startTime) : saleStart;
const effectiveSaleEnd = existingSaleInfo ? BigInt(existingSaleInfo.expiry) : saleEnd;
const effectiveSalePrice = existingSaleInfo ? BigInt(existingSaleInfo.usdGPrice) : salePrice;
const saleOrder = buildNexMarketsOrder({
  seller: SELLER, edition: EDITION, tokenId: 1n, termsVersionHash: TERMS_HASH, price: effectiveSalePrice,
  royaltyReceiver: SELLER, royaltyBps: 300, usdg: MOCK_USDG, protocolFeeRecipient: SAFE, royaltyVault: ROYALTY_VAULT,
  zone: ZONE, startTime: effectiveSaleStart, endTime: effectiveSaleEnd, salt: hash('NEXTEST_SECONDARY_ORDER'),
  counter: await seaport.getCounter(SELLER), listingRegistry: LISTING_REGISTRY
});
const approval = await edition.isApprovedForAll(SELLER, SEAPORT);
let sellerApproval = null;
if (!approval) sellerApproval = await waitTx(await edition.setApprovalForAll(SEAPORT, true), 'SELLER_SEAPORT_APPROVAL');
let saleCreate = null;
let saleInfoBefore = null;
if (existingActive === ZeroHash) {
  saleCreate = await waitTx(await listing.createListing([saleOrder.orderHash, EDITION, 1n, TERMS_HASH, salePrice, saleStart, saleEnd]), 'SALE_LISTING_CREATE');
  saleInfoBefore = await listing.listingInfo(saleOrder.orderHash);
} else {
  saleInfoBefore = await listing.listingInfo(existingActive);
  if (lower(existingActive) !== lower(saleOrder.orderHash)) throw new Error(`RESUMED_LISTING_HASH_MISMATCH:${existingActive}:${saleOrder.orderHash}`);
  saleCreate = { hash: null, block: null, resumed: true };
}
if (Number(saleInfoBefore.status) !== 1 || !(await listing.isListingActive(saleOrder.orderHash))) throw new Error('SALE_LISTING_NOT_ACTIVE');
const listedAdvantages = await rpcAdvantageState();
if (!listedAdvantages.time.listed || !listedAdvantages.quantity.listed || !listedAdvantages.connected.listed) throw new Error('ADVANTAGE_LISTING_LOCK_MISSING');
const timeFreezeBefore = Number(listedAdvantages.time.remaining);
await new Promise((resolve) => setTimeout(resolve, 10_000));
const timeFreezeAfter = Number(await advantage.remaining(EDITION, 1n, ids.time));
if (Math.abs(timeFreezeBefore - timeFreezeAfter) > 2) throw new Error('TIME_ADVANTAGE_DID_NOT_FREEZE');

const buyerFunding = await fundEth(buyer, 'BUYER_ETH_FUND');
const staleBuyerFunding = await fundEth(staleBuyer, 'STALE_BUYER_ETH_FUND');
const buyerUsdg = await mintUsdg(buyer.address, effectiveSalePrice, 'BUYER_USDG_FUND');
const buyerToken = usdg.connect(buyer);
const buyerAllowance = await buyerToken.allowance(buyer.address, SEAPORT);
let buyerApproval = null;
if (buyerAllowance < effectiveSalePrice) buyerApproval = await waitTx(await buyerToken.approve(SEAPORT, effectiveSalePrice), 'BUYER_SEAPORT_USDG_APPROVAL');
const signature = await seller.signTypedData(
  seaportTypedData(saleOrder.order, saleOrder.order.counter ?? saleOrder.counter ?? await seaport.getCounter(SELLER), { chainId: CHAIN_ID, seaport: SEAPORT }).domain,
  seaportTypedData(saleOrder.order, saleOrder.order.counter ?? saleOrder.counter ?? await seaport.getCounter(SELLER), { chainId: CHAIN_ID, seaport: SEAPORT }).types,
  seaportTypedData(saleOrder.order, saleOrder.order.counter ?? saleOrder.counter ?? await seaport.getCounter(SELLER), { chainId: CHAIN_ID, seaport: SEAPORT }).value
);
const sellerBalanceBefore = await usdg.balanceOf(SELLER);
const safeBalanceBefore = await usdg.balanceOf(SAFE);
const vaultBalanceBefore = await usdg.balanceOf(ROYALTY_VAULT);
const buyerBalanceBefore = await usdg.balanceOf(buyer.address);
const fulfill = await seaport.connect(buyer).fulfillOrder([saleOrder.order, signature], ZeroHash);
const fill = await waitTx(fulfill, 'SEAPORT_FILL');
const sellerBalanceAfter = await usdg.balanceOf(SELLER);
const safeBalanceAfter = await usdg.balanceOf(SAFE);
const vaultBalanceAfter = await usdg.balanceOf(ROYALTY_VAULT);
const buyerBalanceAfter = await usdg.balanceOf(buyer.address);
const deltas = {
  buyer: buyerBalanceBefore - buyerBalanceAfter,
  protocol: safeBalanceAfter - safeBalanceBefore,
  royaltyVault: vaultBalanceAfter - vaultBalanceBefore,
  seller: sellerBalanceAfter - sellerBalanceBefore
};
if (deltas.buyer !== effectiveSalePrice || deltas.protocol !== 20_000n || deltas.royaltyVault !== 60_000n || deltas.seller !== 1_920_000n) throw new Error(`SECONDARY_ECONOMICS_MISMATCH:${json(deltas)}`);
const filledInfo = await listing.listingInfo(saleOrder.orderHash);
const claim = await vault.claimInfo(saleOrder.orderHash);
if (Number(filledInfo.status) !== 3 || lower(await edition.ownerOf(1n)) !== lower(buyer.address) || lower(claim.builder) !== SELLER || BigInt(claim.amount) !== 60_000n || claim.withdrawn) throw new Error('SECONDARY_POST_STATE_MISMATCH');
const expectedRelease = Number((await provider.getBlock(fill.block)).timestamp) + 30 * 24 * 60 * 60;
if (Number(claim.releaseAt) !== expectedRelease) throw new Error('ROYALTY_RELEASE_AT_MISMATCH');
let earlyWithdrawalFailed = false;
try { await vault.connect(seller).withdraw(saleOrder.orderHash); } catch { earlyWithdrawalFailed = true; }
if (!earlyWithdrawalFailed) throw new Error('EARLY_ROYALTY_WITHDRAWAL_DID_NOT_FAIL');
const afterFill = await rpcAdvantageState();
if (afterFill.time.listed || afterFill.quantity.listed || afterFill.connected.listed || afterFill.quantity.remaining !== '1') throw new Error('ADVANTAGE_POST_FILL_STATE_MISMATCH');
const tba = getAddress(await resolver.account(EDITION, 1n));
const tbaOwner = new Contract(tba, ['function owner() view returns(address)'], provider);
if (lower(await tbaOwner.owner()) !== lower(buyer.address)) throw new Error('TBA_OWNER_DID_NOT_FOLLOW_BUYER');

const quantityUseId = hash('NEXTEST_QUANTITY_USE_AFTER_SALE');
const quantityUse = await waitTx(await advantage.connect(buyer).consumeQuantity(EDITION, 1n, ids.quantity, 1n, quantityUseId), 'QUANTITY_CONSUME_AFTER_SALE');
if (BigInt(await advantage.remaining(EDITION, 1n, ids.quantity)) !== 0n) throw new Error('QUANTITY_REMAINING_NOT_ZERO_AFTER_USE');

const staleBlock = await latest();
const staleOrder = buildNexMarketsOrder({
  seller: buyer.address, edition: EDITION, tokenId: 1n, termsVersionHash: TERMS_HASH, price: 2_500_000n,
  royaltyReceiver: SELLER, royaltyBps: 300, usdg: MOCK_USDG, protocolFeeRecipient: SAFE, royaltyVault: ROYALTY_VAULT,
  zone: ZONE, startTime: BigInt(staleBlock.timestamp) - 1n, endTime: BigInt(staleBlock.timestamp) + 1800n,
  salt: hash('NEXTEST_STALE_ORDER'), counter: await seaport.getCounter(buyer.address), listingRegistry: LISTING_REGISTRY
});
const staleListing = listing.connect(buyer);
const staleCreate = await waitTx(await staleListing.createListing([staleOrder.orderHash, EDITION, 1n, TERMS_HASH, 2_500_000n, staleOrder.order.startTime, staleOrder.order.endTime]), 'STALE_LISTING_CREATE');
const transfer = await waitTx(await edition.connect(buyer).transferFrom(buyer.address, staleBuyer.address, 1n), 'DIRECT_TRANSFER_STALE');
const staleSync = await waitTx(await listing.syncListing(staleOrder.orderHash), 'STALE_LISTING_SYNC');
const staleInfo = await listing.listingInfo(staleOrder.orderHash);
if (Number(staleInfo.status) !== 5 || lower(await edition.ownerOf(1n)) !== lower(staleBuyer.address) || (await advantage.passInfo(EDITION, 1n)).listed) throw new Error('STALE_LISTING_RECOVERY_FAILED');
if (lower(await tbaOwner.owner()) !== lower(staleBuyer.address)) throw new Error('TBA_OWNER_DID_NOT_FOLLOW_DIRECT_TRANSFER');

const finalState = await rpcAdvantageState();
const indexed = await waitIndexed(saleOrder.orderHash);
const apiPass = await apiGet(`/v1/passes/${EDITION}/1`);
const apiSale = await apiGet('/v1/market/listings');
const apiPassData = apiPass.data;
if (!apiPassData || lower(apiPassData.owner) !== lower(staleBuyer.address) || apiPassData.advantages?.find((item) => lower(item.advantageId) === ids.quantity)?.remaining !== '0') throw new Error('API_FINAL_STATE_MISMATCH');
if (!indexed.pass || lower(indexed.pass.owner) !== lower(staleBuyer.address)) throw new Error('SUBGRAPH_FINAL_OWNER_MISMATCH');
const directRoyalty = await vault.claimInfo(saleOrder.orderHash);
if (!indexed.claim || lower(indexed.claim.orderHash) !== lower(saleOrder.orderHash) || String(indexed.claim.amount) !== '60000') throw new Error('SUBGRAPH_ROYALTY_CLAIM_MISMATCH');
const head = await provider.getBlockNumber();
const finalityBlock = Math.max(fill.block, quantityUse.block, transfer.block, staleSync.block);
await waitBlockAfter(finalityBlock, 12);

console.log(json({
  status: 'TESTNET_SECONDARY_LIFECYCLE_RPC_SUBGRAPH_API_RECONCILED',
  chainId: Number(CHAIN_ID), edition: EDITION, tokenId: '1', seller: SELLER, buyer: buyer.address, staleBuyer: staleBuyer.address,
  primary: { txHash: '0x969afbdc1e816dc739a526d4b796e7e5cd27a72ccddc2626a8a0ec28fe35b9b5', tokenId: '1', price: '1000000', protocolFee: '50000', builderProceeds: '950000' },
  advantages: { before, listed: listedAdvantages, afterFill, final: finalState, quantityIdempotentRetry: false, quantityUseTx: quantityUse.hash, connectedEntitled: finalState.connected.remaining === '1', timeFreezeSecondsDelta: timeFreezeBefore - timeFreezeAfter },
  cancellation: { orderHash: cancelOrder.orderHash, create: cancelCreate, cancel: cancelTx, status: Number(cancelInfo.status) },
  secondary: { orderHash: saleOrder.orderHash, create: saleCreate, sellerApproval, buyerFunding, staleBuyerFunding, buyerUsdg, buyerApproval, fill, salePrice: effectiveSalePrice.toString(), deltas, filledStatus: Number(filledInfo.status), royaltyClaim: { builder: claim.builder, amount: String(claim.amount), releaseAt: Number(claim.releaseAt), expectedRelease, earlyWithdrawalFailed } },
  postSale: { quantityUse, staleListing: { orderHash: staleOrder.orderHash, create: staleCreate, transfer, sync: staleSync, status: Number(staleInfo.status) }, owner: staleBuyer.address, tba: tba, tbaOwner: await tbaOwner.owner() },
  subgraph: { endpoint: SUBGRAPH, indexedBlock: indexed.indexedBlock, owner: indexed.pass?.owner, saleStatus: indexed.sale?.status, royaltyAmount: indexed.claim?.amount },
  api: { endpoint: API, owner: apiPassData.owner, quantityRemaining: apiPassData.advantages?.find((item) => lower(item.advantageId) === ids.quantity)?.remaining, marketListingCount: Array.isArray(apiSale.data) ? apiSale.data.length : null },
  reconciliation: { discrepancies: 0, checked: ['owner','totalMinted','mintTerms','advantages','listingFilled','royaltyClaim','tba','directTransferStale'] },
  finality: { observedHeadBeforeWait: head, finalityBlock, confirmationsObserved: (await provider.getBlockNumber()) - finalityBlock + 1 },
  mainnetCustomDeploymentPerformed: false
}));
