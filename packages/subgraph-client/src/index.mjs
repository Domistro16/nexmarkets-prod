const DEFAULT_TIMEOUT_MS = 10_000;

function asNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function lower(value) {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

function unix(value) {
  return value == null ? null : Number(value);
}

function advantageRemaining(advantage, now = Math.floor(Date.now() / 1000)) {
  if (!advantage) return '0';
  const kind = String(advantage.kind ?? '').toUpperCase();
  const starts = unix(advantage.startsAt) ?? 0;
  const ends = unix(advantage.endsAt) ?? 0;
  const frozen = asNumber(advantage.frozenSeconds, 0);
  let effective = Math.max(0, now - frozen);
  if (kind === 'TIME_BASED' && advantage.listed && advantage.listedAt != null) {
    const listed = (unix(advantage.listedAt) ?? 0) - frozen;
    if (listed < ends) {
      const freezeAt = Math.max(listed, starts);
      effective = effective < freezeAt ? effective : freezeAt;
    }
  }
  if (effective < starts || effective >= ends) return '0';
  if (kind === 'TIME_BASED') return String(Math.max(0, ends - effective));
  if (kind === 'CONNECTED') return '1';
  return String(advantage.remainingUnits ?? advantage.totalUnits ?? 0);
}

export class SubgraphClient {
  constructor({ endpoint, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, logger = console } = {}) {
    this.endpoint = endpoint?.trim() || null;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  get enabled() { return Boolean(this.endpoint); }

  async query(query, variables = {}) {
    if (!this.endpoint) throw new Error('SUBGRAPH_ENDPOINT_REQUIRED');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`SUBGRAPH_HTTP_${response.status}`);
      if (body.errors?.length) throw new Error(`SUBGRAPH_QUERY_ERROR:${body.errors[0].message}`);
      return body.data ?? {};
    } finally {
      clearTimeout(timer);
    }
  }

  async indexingStatus() {
    const data = await this.query('{ _meta { block { number hash } deployment } }');
    const block = data._meta?.block ?? {};
    return { indexedBlock: asNumber(block.number, 0), blockHash: lower(block.hash ?? null), deployment: data._meta?.deployment ?? null };
  }

  async discover({ first = 100 } = {}) {
    const data = await this.query(`query($first:Int!){ editions(first:$first,orderBy:createdBlock,orderDirection:desc){ id address editionId publisher absoluteSupplyCap totalMinted disabled currentTerms { hash pricePerPass previewStartsAt mintStartsAt mintEndsAt } createdBlock createdTimestamp createdTx } }`, { first });
    return { editions: (data.editions ?? []).map((edition) => ({
      edition_address: lower(edition.address), edition_id: lower(edition.editionId), publisher: lower(edition.publisher),
      absolute_supply_cap: edition.absoluteSupplyCap, total_minted: edition.totalMinted, disabled: edition.disabled,
      active_terms_hash: lower(edition.currentTerms?.hash ?? null), price_usdg: edition.currentTerms?.pricePerPass ?? null,
      preview_starts_at: unix(edition.currentTerms?.previewStartsAt), mint_starts_at: unix(edition.currentTerms?.mintStartsAt),
      mint_ends_at: unix(edition.currentTerms?.mintEndsAt), created_block: edition.createdBlock, created_tx: lower(edition.createdTx)
    })) };
  }

  async editionByAddress(address) {
    const data = await this.query(`query($address:Bytes!){ editions(where:{address:$address}){ id address editionId publisher protocolAdmin mintController absoluteSupplyCap artworkCommitment totalMinted disabled currentTerms { id hash version activeSupply pricePerPass previewStartsAt mintStartsAt mintEndsAt primaryRecipient royaltyReceiver royaltyBps advantagesHash referralTermsHash blockNumber timestamp transactionHash } terms(orderBy:version,orderDirection:desc){ id hash version activeSupply pricePerPass previewStartsAt mintStartsAt mintEndsAt primaryRecipient royaltyReceiver royaltyBps advantagesHash referralTermsHash } } }`, { address: lower(address) });
    const edition = data.editions?.[0];
    if (!edition) return null;
    return { ...edition, address: lower(edition.address), editionId: lower(edition.editionId), publisher: lower(edition.publisher), protocolAdmin: lower(edition.protocolAdmin), mintController: lower(edition.mintController), artworkCommitment: lower(edition.artworkCommitment), currentTerms: edition.currentTerms ? normalizeTerms(edition.currentTerms) : null, termsHistory: (edition.terms ?? []).map(normalizeTerms) };
  }

  async pass(edition, tokenId) {
    const data = await this.query(`query($id:ID!){ pass(id:$id){ id tokenId owner termsHash mintBlock mintTimestamp mintTransactionHash royaltyReceiver royaltyBps listed edition { address editionId publisher } advantages { id advantageId kind startsAt endsAt totalUnits remainingUnits frozenSeconds listed listedAt definitionHash termsHash } tba { account implementation registry } } }`, { id: `${lower(edition)}-${tokenId}` });
    const pass = data.pass;
    if (!pass) return null;
    return { ...pass, owner: lower(pass.owner), termsHash: lower(pass.termsHash), royaltyReceiver: lower(pass.royaltyReceiver), edition: { ...pass.edition, address: lower(pass.edition.address), editionId: lower(pass.edition.editionId), publisher: lower(pass.edition.publisher) }, advantages: (pass.advantages ?? []).map((advantage) => ({ ...advantage, advantageId: lower(advantage.advantageId), termsHash: lower(advantage.termsHash), definitionHash: lower(advantage.definitionHash), remaining: advantageRemaining(advantage), userFacingRemaining: advantageRemaining(advantage), consumesOnchain: ['QUANTITY_BASED', 'REDEMPTION'].includes(String(advantage.kind).toUpperCase()) })), tba: pass.tba ? { ...pass.tba, account: lower(pass.tba.account), implementation: lower(pass.tba.implementation), registry: lower(pass.tba.registry) } : null };
  }

  async listings({ first = 100, status = 'ACTIVE' } = {}) {
    const data = await this.query(`query($first:Int!,$status:String!){ listings(first:$first,where:{status:$status},orderBy:createdBlock,orderDirection:desc){ id orderHash tokenId seller termsHash price royaltyReceiver royaltyBps startTime expiry zoneHash status buyer salePrice protocolFee builderRoyalty sellerProceeds edition { address editionId } } }`, { first, status });
    return (data.listings ?? []).map((listing) => ({ ...listing, order_hash: lower(listing.orderHash), edition_address: lower(listing.edition.address), token_id: listing.tokenId, seller_address: lower(listing.seller), terms_hash: lower(listing.termsHash), price_usdg: listing.price, royalty_receiver: lower(listing.royaltyReceiver), royalty_bps: listing.royaltyBps, starts_at: unix(listing.startTime), expires_at: unix(listing.expiry), zone_hash: lower(listing.zoneHash), buyer: lower(listing.buyer) }));
  }

  async listing(orderHash) {
    const data = await this.query(`query($id:ID!){ listing(id:$id){ id orderHash tokenId seller termsHash price royaltyReceiver royaltyBps startTime expiry zoneHash status buyer salePrice protocolFee builderRoyalty sellerProceeds edition { address editionId } } }`, { id: lower(orderHash) });
    const listing = data.listing;
    if (!listing) return null;
    return { ...listing, order_hash: lower(listing.orderHash), edition_address: lower(listing.edition.address), token_id: listing.tokenId, seller_address: lower(listing.seller), terms_hash: lower(listing.termsHash), price_usdg: listing.price, royalty_receiver: lower(listing.royaltyReceiver), royalty_bps: listing.royaltyBps, starts_at: unix(listing.startTime), expires_at: unix(listing.expiry), zone_hash: lower(listing.zoneHash) };
  }
}

function normalizeTerms(terms) {
  return { ...terms, hash: lower(terms.hash), primaryRecipient: lower(terms.primaryRecipient), royaltyReceiver: lower(terms.royaltyReceiver), advantagesHash: lower(terms.advantagesHash), referralTermsHash: lower(terms.referralTermsHash), previewStartsAt: unix(terms.previewStartsAt), mintStartsAt: unix(terms.mintStartsAt), mintEndsAt: unix(terms.mintEndsAt) };
}

export { advantageRemaining };
