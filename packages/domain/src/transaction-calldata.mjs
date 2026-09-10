import { Interface, ZeroAddress, keccak256, toUtf8Bytes } from 'ethers';

const MINT_REQUEST = '(address edition,bytes32 termsVersionHash,address recipient,uint256 quantity,bytes32 intentId,address referralHint,(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[] advantageConfigs)';
const interfaces = {
  MINT: new Interface([`function mint(${MINT_REQUEST} request) returns (uint256)`, `function mintAllowlisted(${MINT_REQUEST} request,bytes32[] proof) returns (uint256)`]),
  EDITION_CREATE: new Interface(['function createEdition((string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI) config,bytes32 salt) returns (address)']),
  TERMS_PUBLISH_V1: new Interface(['function publishTerms(address edition,(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash) terms) returns (bytes32)']),
  TERMS_PUBLISH: new Interface(['function publishTerms(address edition,(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,bytes32 allowlistRoot,uint64 allowlistEndsAt,uint256 allowlistSupply,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash) terms) returns (bytes32)']),
  LISTING_CANCEL: new Interface(['function cancelListing(bytes32 orderHash)']),
  ADVANTAGE_USE: new Interface(['function consumeQuantity(address edition,uint256 tokenId,bytes32 advantageId,uint256 amount,bytes32 useId)','function redeem(address edition,uint256 tokenId,bytes32 advantageId,bytes32 redemptionId)','function redeemAmount(address edition,uint256 tokenId,bytes32 advantageId,uint256 amount,bytes32 redemptionId)','function useAmount(address edition,uint256 tokenId,bytes32 advantageId,bytes32 useId) returns (uint256)']),
  ROYALTY_WITHDRAW: new Interface(['function withdraw(bytes32 orderHash)'])
};

export function buildProtocolCalldata(intentType, input, { walletAddress, idempotencyKey }) {
  const abi = interfaces[intentType];
  if (!abi) throw new Error('UNSUPPORTED_PROTOCOL_INTENT');
  if (intentType === 'MINT') {
    const intentId = keccak256(toUtf8Bytes(`NEXMARKETS_MINT_INTENT:${walletAddress.toLowerCase()}:${idempotencyKey}`));
    const request = [input.edition, input.termsVersionHash, input.recipient ?? walletAddress, input.quantity, intentId, input.referralHint ?? ZeroAddress, input.advantageConfigs ?? []];
    return Array.isArray(input.allowlistProof)
      ? abi.encodeFunctionData('mintAllowlisted', [request, input.allowlistProof])
      : abi.encodeFunctionData('mint', [request]);
  }
  if (intentType === 'EDITION_CREATE') return abi.encodeFunctionData('createEdition', [[input.name, input.symbol, input.initialOwner, input.editionId, input.absoluteSupplyCap, input.artworkCommitment, input.baseTokenURI], input.salt]);
  if (intentType === 'TERMS_PUBLISH') {
    const versionedAbi = input.protocolVersion === 1 || !Object.hasOwn(input.terms ?? {}, 'allowlistRoot')
      ? interfaces.TERMS_PUBLISH_V1
      : abi;
    return versionedAbi.encodeFunctionData('publishTerms', [input.edition, input.terms]);
  }
  if (intentType === 'LISTING_CANCEL') return abi.encodeFunctionData('cancelListing', [input.orderHash]);
  if (intentType === 'ROYALTY_WITHDRAW') return abi.encodeFunctionData('withdraw', [input.orderHash]);
  if (intentType === 'ADVANTAGE_USE' && input.operation === 'REDEEM') return abi.encodeFunctionData('redeem', [input.edition, input.tokenId, input.advantageId, input.useId]);
  if (intentType === 'ADVANTAGE_USE' && input.operation === 'REDEEM_AMOUNT') return abi.encodeFunctionData('redeemAmount', [input.edition, input.tokenId, input.advantageId, input.amount, input.useId]);
  if (intentType === 'ADVANTAGE_USE' && input.operation === 'CONSUME_QUANTITY') return abi.encodeFunctionData('consumeQuantity', [input.edition, input.tokenId, input.advantageId, input.amount, input.useId]);
  if (intentType === 'ADVANTAGE_USE' && input.operation === 'USE_AMOUNT') return abi.encodeFunctionData('useAmount', [input.edition, input.tokenId, input.advantageId, input.useId]);
  throw new Error('ADVANTAGE_OPERATION_REQUIRED');
}
