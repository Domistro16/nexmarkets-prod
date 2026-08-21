import { SubgraphClient, advantageRemaining } from '../../../packages/subgraph-client/src/index.mjs';

const lower = (value) => typeof value === 'string' ? value.toLowerCase() : value;
const epoch = (value) => value == null ? null : Number(value);

/**
 * Subgraph read model adapter. It deliberately emits independent reconciliation
 * items rather than a SQL-style Pass x Advantage x Listing x Royalty product.
 * RPC remains the authority for every observed value.
 */
export class SubgraphReconciliationStore {
  constructor({ endpoint = process.env.NEXMARKETS_SUBGRAPH_URL, chainId = 4663, client } = {}) {
    this.client = client ?? new SubgraphClient({ endpoint });
    this.chainId = Number(chainId);
  }

  async items(scope = 'ALL') {
    const requested = String(typeof scope === 'string' ? scope : scope?.scope ?? 'ALL').toUpperCase();
    const include = (name) => requested === 'ALL' || requested === name || (requested === 'PASS' && ['PASS', 'ADVANTAGE', 'TBA'].includes(name));
    const data = await this.client.query(`query {
      editions { id address totalMinted currentTerms { hash activeSupply pricePerPass previewStartsAt mintStartsAt mintEndsAt primaryRecipient royaltyReceiver royaltyBps advantagesHash referralTermsHash } }
      passes { id tokenId owner termsHash edition { address } tba { account } }
      advantageStates { id tokenId advantageId kind startsAt endsAt totalUnits remainingUnits frozenSeconds listed listedAt definitionHash edition { address } }
      listings { id orderHash tokenId seller termsHash price royaltyReceiver royaltyBps startTime expiry zoneHash status buyer edition { address } }
      royaltyClaims { id orderHash tokenId builder amount releaseAt withdrawn edition { address } }
    }`);
    const items = [];
    if (include('EDITION')) for (const edition of data.editions ?? []) items.push({
      key: `edition:${lower(edition.address)}`,
      identity: { edition: lower(edition.address) },
      expected: {
        edition: true,
        totalMinted: String(edition.totalMinted ?? 0),
        ...(edition.currentTerms ? { activeTerms: { hash: lower(edition.currentTerms.hash), terms: { activeSupply: String(edition.currentTerms.activeSupply), pricePerPass: String(edition.currentTerms.pricePerPass), previewStartsAt: epoch(edition.currentTerms.previewStartsAt), mintStartsAt: epoch(edition.currentTerms.mintStartsAt), mintEndsAt: epoch(edition.currentTerms.mintEndsAt), primaryRecipient: lower(edition.currentTerms.primaryRecipient), royaltyReceiver: lower(edition.currentTerms.royaltyReceiver), royaltyBps: String(edition.currentTerms.royaltyBps), advantagesHash: lower(edition.currentTerms.advantagesHash), referralTermsHash: lower(edition.currentTerms.referralTermsHash) } } } : {})
      },
      authority: { edition: 'NEX_PASS_FACTORY', totalMinted: 'NEX_PASS_EDITION', activeTerms: 'NEX_LAUNCH_REGISTRY' },
      repair: { edition: 'REPORT_ONLY', totalMinted: 'REPORT_ONLY', activeTerms: 'REPORT_ONLY' }
    });
    if (include('PASS')) for (const pass of data.passes ?? []) items.push({
      key: `pass:${lower(pass.edition.address)}:${pass.tokenId}`,
      identity: { edition: lower(pass.edition.address), tokenId: String(pass.tokenId) },
      expected: { owner: lower(pass.owner), tokenTerms: lower(pass.termsHash) },
      authority: { owner: 'ERC721', tokenTerms: 'NEX_PASS_EDITION' },
      repair: { owner: 'REPORT_ONLY', tokenTerms: 'REPORT_ONLY' }
    });
    if (include('ADVANTAGE')) for (const advantage of data.advantageStates ?? []) items.push({
      key: `advantage:${lower(advantage.edition.address)}:${advantage.tokenId}:${lower(advantage.advantageId)}`,
      identity: { edition: lower(advantage.edition.address), tokenId: String(advantage.tokenId), advantageId: lower(advantage.advantageId) },
      expected: { advantage: { remaining: advantageRemaining(advantage), listed: Boolean(advantage.listed) } },
      authority: { advantage: 'NEX_ADVANTAGE_REGISTRY' },
      repair: { advantage: 'REPORT_ONLY' }
    });
    if (include('LISTING')) for (const listing of data.listings ?? []) items.push({
      key: `listing:${lower(listing.orderHash)}`,
      identity: { orderHash: lower(listing.orderHash) },
      expected: { listing: { edition: lower(listing.edition.address), tokenId: String(listing.tokenId), seller: lower(listing.seller), termsVersionHash: lower(listing.termsHash), usdGPrice: String(listing.price), royaltyReceiver: lower(listing.royaltyReceiver), royaltyBps: String(listing.royaltyBps), startTime: epoch(listing.startTime), expiry: epoch(listing.expiry), zoneHash: lower(listing.zoneHash), status: listing.status } },
      authority: { listing: 'NEX_LISTING_REGISTRY' },
      repair: { listing: 'REPORT_ONLY' }
    });
    if (include('ROYALTY')) for (const claim of data.royaltyClaims ?? []) items.push({
      key: `royalty:${lower(claim.orderHash)}`,
      identity: { orderHash: lower(claim.orderHash) },
      expected: { royalty: { edition: lower(claim.edition.address), tokenId: String(claim.tokenId), builder: lower(claim.builder), amount: String(claim.amount), releaseAt: epoch(claim.releaseAt), withdrawn: Boolean(claim.withdrawn) }, withdrawal: Boolean(claim.withdrawn) },
      authority: { royalty: 'NEX_ROYALTY_VAULT', withdrawal: 'NEX_ROYALTY_VAULT' },
      repair: { royalty: 'REPORT_ONLY', withdrawal: 'REPORT_ONLY' }
    });
    if (include('TBA')) for (const pass of data.passes ?? []) if (pass.tba?.account) items.push({
      key: `tba:${lower(pass.edition.address)}:${pass.tokenId}`,
      identity: { edition: lower(pass.edition.address), tokenId: String(pass.tokenId) },
      expected: { tba: lower(pass.tba.account) },
      authority: { tba: 'NEX_TBA_RESOLVER' },
      repair: { tba: 'REPORT_ONLY' }
    });
    return items;
  }
}
