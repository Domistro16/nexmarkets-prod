import { Interface } from 'ethers';
import { JsonRpcClient } from '../../../packages/chain/src/rpc.mjs';

const ABI = new Interface([
  'function listingInfo(bytes32) view returns (tuple(address edition,uint256 tokenId,address seller,bytes32 termsVersionHash,uint256 usdGPrice,address royaltyReceiver,uint96 royaltyBps,uint64 startTime,uint64 expiry,bytes32 zoneHash,uint8 status))',
  'function totalMinted() view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function termsVersionHashOf(uint256) view returns (bytes32)',
  'function activeTerms(address) view returns (bytes32,tuple(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash))',
  'function remaining(address,uint256,bytes32) view returns (uint256)',
  'function isListed(address,uint256) view returns (bool)',
  'function claimInfo(bytes32) view returns (tuple(address edition,uint256 tokenId,address builder,uint256 amount,uint64 releaseAt,bool withdrawn))',
  'function account(address,uint256) view returns (address)'
]);

const LISTING_STATUS = ['NONE', 'ACTIVE', 'CANCELLED', 'FILLED', 'EXPIRED', 'STALE'];
const tupleObject = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => Number.isNaN(Number(key))).map(([key, item]) => [key, typeof item === 'bigint' ? item.toString() : typeof item === 'string' && item.startsWith('0x') ? item.toLowerCase() : item]));

export class RobinhoodReconciliationChain {
  constructor({ rpc, rpcUrl = process.env.RH_MAINNET_RPC_URL, addresses = {} } = {}) { this.rpc = rpc ?? new JsonRpcClient(rpcUrl); this.addresses = addresses; }
  async call(address, fragment, args, block = 'latest') { const data = ABI.encodeFunctionData(fragment, args); const result = await this.rpc.ethCall(address, data, block); return ABI.decodeFunctionResult(fragment, result); }
  async edition({ edition }) { const code = await this.rpc.getCode(edition); return Boolean(code && code !== '0x'); }
  async totalMinted({ edition }) { return String(await this.call(edition, 'totalMinted', [])[0]); }
  async owner({ edition, tokenId }) { return (await this.call(edition, 'ownerOf', [tokenId]))[0].toLowerCase(); }
  async tokenTerms({ edition, tokenId }) { return (await this.call(edition, 'termsVersionHashOf', [tokenId]))[0].toLowerCase(); }
  async activeTerms({ edition }) { const [hash, terms] = await this.call(this.addresses.launchRegistry, 'activeTerms', [edition]); return { hash: hash.toLowerCase(), terms: tupleObject(terms) }; }
  async advantage({ registry = this.addresses.advantageRegistry, edition, tokenId, advantageId }) {
    const [remaining] = await this.call(registry, 'remaining', [edition, tokenId, advantageId]);
    const [listed] = await this.call(registry, 'isListed', [edition, tokenId]);
    return { remaining: String(remaining), listed: Boolean(listed) };
  }
  async listing({ registry = this.addresses.listingRegistry, orderHash }) {
    const [listing] = await this.call(registry, 'listingInfo', [orderHash]);
    const value = tupleObject(listing);
    return {
      edition: value.edition.toLowerCase(), tokenId: String(value.tokenId), seller: value.seller.toLowerCase(),
      termsVersionHash: value.termsVersionHash.toLowerCase(), usdGPrice: String(value.usdGPrice),
      royaltyReceiver: value.royaltyReceiver.toLowerCase(), royaltyBps: String(value.royaltyBps),
      startTime: String(value.startTime), expiry: String(value.expiry), zoneHash: value.zoneHash.toLowerCase(),
      status: LISTING_STATUS[Number(value.status)] ?? 'UNKNOWN'
    };
  }
  async royalty({ vault = this.addresses.royaltyVault, orderHash }) { const claim = (await this.call(vault, 'claimInfo', [orderHash]))[0]; return { edition: claim.edition.toLowerCase(), tokenId: String(claim.tokenId), builder: claim.builder.toLowerCase(), amount: String(claim.amount), releaseAt: Number(claim.releaseAt), withdrawn: claim.withdrawn }; }
  async withdrawal(input) { return (await this.royalty(input)).withdrawn; }
  async tba({ resolver = this.addresses.tbaResolver, edition, tokenId }) { return (await this.call(resolver, 'account', [edition, tokenId]))[0].toLowerCase(); }
}
