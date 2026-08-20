import { AbiCoder, Interface, concat, getAddress, isAddress, keccak256, toUtf8Bytes } from 'ethers';

export const SEAPORT_ITEM = Object.freeze({ ERC20: 1, ERC721: 2 });
export const SECONDARY_PROTOCOL_FEE_BPS = 100n;
export const BPS_DENOMINATOR = 10_000n;
export const LISTING_ZONE_DOMAIN = keccak256(toUtf8Bytes('NEXMARKETS_LISTING_ZONE_V1'));

const coder = AbiCoder.defaultAbiCoder();
const OFFER_ITEM_TYPEHASH = keccak256(toUtf8Bytes('OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)'));
const CONSIDERATION_ITEM_TYPEHASH = keccak256(toUtf8Bytes('ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)'));
const ORDER_COMPONENTS_TYPEHASH = keccak256(toUtf8Bytes('OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)'));
const listingInterface = new Interface(['function createListing((bytes32 orderHash,address edition,uint256 tokenId,bytes32 termsVersionHash,uint256 usdGPrice,uint64 startTime,uint64 expiry) request) returns (bytes32 zoneHash)']);

function address(value, label) {
  if (!isAddress(value)) throw new Error(`${label} must be an EVM address`);
  return getAddress(value);
}

function uint(value, label) {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} must be an unsigned integer`);
  }
}

export function secondaryAmounts(price, royaltyBps) {
  const P = uint(price, 'price');
  const R = uint(royaltyBps, 'royaltyBps');
  if (P === 0n) throw new Error('price must be positive');
  if (R > 500n) throw new Error('royaltyBps exceeds 5%');
  const protocolFee = P * SECONDARY_PROTOCOL_FEE_BPS / BPS_DENOMINATOR;
  if (protocolFee === 0n) throw new Error('price is too small for exact 1% fee');
  const royalty = P * R / BPS_DENOMINATOR;
  return { price: P, protocolFee, royalty, sellerProceeds: P - protocolFee - royalty };
}

export function listingZoneHash(input) {
  return keccak256(coder.encode(
    ['bytes32','address','uint256','address','bytes32','uint256','address','uint96','uint64','uint64'],
    [LISTING_ZONE_DOMAIN, address(input.edition, 'edition'), uint(input.tokenId, 'tokenId'), address(input.seller, 'seller'),
      input.termsVersionHash, uint(input.price, 'price'), address(input.royaltyReceiver, 'royaltyReceiver'),
      uint(input.royaltyBps, 'royaltyBps'), uint(input.startTime, 'startTime'), uint(input.endTime, 'endTime')]
  ));
}

function itemHash(item, consideration) {
  const types = consideration
    ? ['bytes32','uint8','address','uint256','uint256','uint256','address']
    : ['bytes32','uint8','address','uint256','uint256','uint256'];
  const values = consideration
    ? [CONSIDERATION_ITEM_TYPEHASH,item.itemType,item.token,item.identifierOrCriteria,item.startAmount,item.endAmount,item.recipient]
    : [OFFER_ITEM_TYPEHASH,item.itemType,item.token,item.identifierOrCriteria,item.startAmount,item.endAmount];
  return keccak256(coder.encode(types, values));
}

/// @notice Reproduces Seaport 1.6 getOrderHash(OrderComponents), before the EIP-712 domain digest.
export function seaportOrderHash(order, counter) {
  const offerHash = keccak256(concat(order.offer.map((item) => itemHash(item, false))));
  const considerationHash = keccak256(concat(order.consideration.map((item) => itemHash(item, true))));
  return keccak256(coder.encode(
    ['bytes32','address','address','bytes32','bytes32','uint8','uint256','uint256','bytes32','uint256','bytes32','uint256'],
    [ORDER_COMPONENTS_TYPEHASH,order.offerer,order.zone,offerHash,considerationHash,order.orderType,order.startTime,
      order.endTime,order.zoneHash,order.salt,order.conduitKey,uint(counter, 'counter')]
  ));
}

export function buildNexMarketsOrder(input) {
  const seller = address(input.seller, 'seller');
  const edition = address(input.edition, 'edition');
  const usdg = address(input.usdg, 'usdg');
  const protocolFeeRecipient = address(input.protocolFeeRecipient, 'protocolFeeRecipient');
  const royaltyVault = address(input.royaltyVault, 'royaltyVault');
  const zone = address(input.zone, 'zone');
  const tokenId = uint(input.tokenId, 'tokenId');
  if (tokenId === 0n) throw new Error('tokenId must be positive');
  const startTime = uint(input.startTime, 'startTime');
  const endTime = uint(input.endTime, 'endTime');
  if (endTime <= startTime) throw new Error('listing window is invalid');
  const computedZoneHash = input.termsVersionHash && input.royaltyReceiver ? listingZoneHash(input) : null;
  const zoneHash = input.zoneHash ?? computedZoneHash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(zoneHash ?? '')) throw new Error('zoneHash or complete listing Terms are required');
  if (computedZoneHash && computedZoneHash.toLowerCase() !== zoneHash.toLowerCase()) throw new Error('zoneHash does not match exact listing');
  const amounts = secondaryAmounts(input.price, input.royaltyBps);

  const consideration = [
    {
      itemType: SEAPORT_ITEM.ERC20,
      token: usdg,
      identifierOrCriteria: 0n,
      startAmount: amounts.protocolFee,
      endAmount: amounts.protocolFee,
      recipient: protocolFeeRecipient
    }
  ];
  if (amounts.royalty !== 0n) {
    consideration.push({
      itemType: SEAPORT_ITEM.ERC20,
      token: usdg,
      identifierOrCriteria: 0n,
      startAmount: amounts.royalty,
      endAmount: amounts.royalty,
      recipient: royaltyVault
    });
  }
  consideration.push({
    itemType: SEAPORT_ITEM.ERC20,
    token: usdg,
    identifierOrCriteria: 0n,
    startAmount: amounts.sellerProceeds,
    endAmount: amounts.sellerProceeds,
    recipient: seller
  });

  const order = {
    offerer: seller,
    zone,
    offer: [{
      itemType: SEAPORT_ITEM.ERC721,
      token: edition,
      identifierOrCriteria: tokenId,
      startAmount: 1n,
      endAmount: 1n
    }],
    consideration,
    orderType: 2,
    startTime,
    endTime,
    zoneHash: zoneHash.toLowerCase(),
    salt: uint(input.salt ?? keccak256(toUtf8Bytes(`${edition}:${tokenId}:${seller}:${startTime}`)), 'salt'),
    conduitKey: input.conduitKey ?? `0x${'00'.repeat(32)}`,
    totalOriginalConsiderationItems: BigInt(consideration.length)
  };
  validateNexMarketsOrder(order, { ...input, zoneHash, seller, edition, usdg, protocolFeeRecipient, royaltyVault, zone });
  const result = { order, amounts };
  if (input.counter !== undefined) result.orderHash = seaportOrderHash(order, input.counter);
  if (result.orderHash && input.listingRegistry && input.termsVersionHash) {
    result.registryTransaction = {
      to: address(input.listingRegistry, 'listingRegistry'),
      data: listingInterface.encodeFunctionData('createListing', [[result.orderHash, edition, tokenId, input.termsVersionHash, amounts.price, startTime, endTime]])
    };
  }
  return result;
}

export function validateNexMarketsOrder(order, policy) {
  const expected = secondaryAmounts(policy.price, policy.royaltyBps);
  const expectedLength = expected.royalty === 0n ? 2 : 3;
  if (order.offerer !== address(policy.seller, 'seller') || order.zone !== address(policy.zone, 'zone')) throw new Error('seller/zone mismatch');
  if (order.orderType !== 2 || order.zoneHash.toLowerCase() !== policy.zoneHash.toLowerCase()) throw new Error('restricted order/zoneHash mismatch');
  if (order.offer.length !== 1) throw new Error('order must offer exactly one item');
  const offered = order.offer[0];
  if (offered.itemType !== SEAPORT_ITEM.ERC721 || offered.token !== address(policy.edition, 'edition') || offered.identifierOrCriteria !== BigInt(policy.tokenId) || offered.startAmount !== 1n || offered.endAmount !== 1n) throw new Error('exact Pass offer mismatch');
  if (order.consideration.length !== expectedLength) throw new Error('extra or missing consideration');
  const legs = expected.royalty === 0n
    ? [[address(policy.protocolFeeRecipient, 'protocolFeeRecipient'), expected.protocolFee], [address(policy.seller, 'seller'), expected.sellerProceeds]]
    : [[address(policy.protocolFeeRecipient, 'protocolFeeRecipient'), expected.protocolFee], [address(policy.royaltyVault, 'royaltyVault'), expected.royalty], [address(policy.seller, 'seller'), expected.sellerProceeds]];
  let total = 0n;
  for (let i = 0; i < legs.length; i += 1) {
    const item = order.consideration[i];
    const [recipient, amount] = legs[i];
    if (item.itemType !== SEAPORT_ITEM.ERC20 || item.token !== address(policy.usdg, 'usdg') || item.identifierOrCriteria !== 0n || item.startAmount !== amount || item.endAmount !== amount || item.recipient !== recipient) throw new Error(`consideration ${i} mismatch`);
    total += item.startAmount;
  }
  if (total !== expected.price) throw new Error('buyer surcharge or underpayment');
  if (order.endTime <= order.startTime) throw new Error('invalid listing window');
  if (policy.now !== undefined && order.endTime <= BigInt(policy.now)) throw new Error('listing already expired');
  if (policy.currentOwner !== undefined && address(policy.currentOwner, 'currentOwner') !== address(policy.seller, 'seller')) throw new Error('seller no longer owns Pass');
  return true;
}
