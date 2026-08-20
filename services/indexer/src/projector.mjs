function eventKey(event) {
  return `${event.chainId}:${event.txHash.toLowerCase()}:${event.logIndex}`;
}

function position(event) {
  return BigInt(event.blockNumber) * 1_000_000n + BigInt(event.logIndex);
}

function assertEvent(event) {
  for (const field of ['chainId','blockNumber','blockHash','txHash','logIndex','contractAddress','eventName','blockTimestamp']) {
    if (event[field] === undefined || event[field] === null || event[field] === '') throw new Error(`indexer event missing ${field}`);
  }
  if (![4663, 46630].includes(Number(event.chainId))) throw new Error('non-Robinhood event');
}

export class ProjectionEngine {
  constructor() {
    this.journal = new Map();
    this.reset();
  }

  reset() {
    this.state = {
      editions: new Map(),
      terms: new Map(),
      tokens: new Map(),
      advantages: new Map(),
      listings: new Map(),
      royalties: new Map(),
      tbas: new Map(),
      referralHints: []
    };
  }

  ingest(event) {
    assertEvent(event);
    const key = eventKey(event);
    const prior = this.journal.get(key);
    if (prior) {
      if (prior.blockHash !== event.blockHash) throw new Error('EVENT_IDENTITY_COLLISION');
      return false;
    }
    this.journal.set(key, structuredClone(event));
    this.rebuild();
    return true;
  }

  orphanBlock(chainId, blockHash) {
    let changed = false;
    for (const [key, event] of this.journal) {
      if (Number(event.chainId) === Number(chainId) && event.blockHash === blockHash) {
        this.journal.delete(key);
        changed = true;
      }
    }
    if (changed) this.rebuild();
    return changed;
  }

  rebuild() {
    this.reset();
    const events = [...this.journal.values()].sort((a, b) => position(a) < position(b) ? -1 : position(a) > position(b) ? 1 : 0);
    for (const event of events) this.apply(event);
  }

  apply(event) {
    const args = event.args ?? {};
    const tokenKey = args.edition && args.tokenId !== undefined ? `${args.edition.toLowerCase()}:${args.tokenId}` : null;
    const registeredEdition = (address) => address && this.state.editions.has(address.toLowerCase());
    switch (event.eventName) {
      case 'EditionCreated':
        this.state.editions.set(args.edition.toLowerCase(), { ...args, provenance: event });
        break;
      case 'TermsPublished':
        if (!registeredEdition(args.edition)) break;
        this.state.terms.set(args.edition.toLowerCase(), { ...args, provenance: event });
        break;
      case 'Transfer':
        if (!registeredEdition(event.contractAddress)) break;
        this.state.tokens.set(`${event.contractAddress.toLowerCase()}:${args.tokenId}`, { owner: args.to.toLowerCase(), provenance: event });
        break;
      case 'EditionMinted': {
        if (!registeredEdition(event.contractAddress)) break;
        const first = BigInt(args.firstTokenId ?? args.tokenId); const quantity = BigInt(args.quantity ?? 1);
        for (let offset = 0n; offset < quantity; offset += 1n) {
          const key = `${event.contractAddress.toLowerCase()}:${first + offset}`;
          this.state.tokens.set(key, { ...(this.state.tokens.get(key) ?? {}), termsHash: args.termsVersionHash, provenance: event });
        }
        break;
      }
      case 'PassAdvantagesInitialized':
        if (!registeredEdition(args.edition)) break;
        this.state.advantages.set(tokenKey, { ...args, initialized: true, provenance: event });
        break;
      case 'AdvantageConsumed':
        if (!registeredEdition(args.edition)) break;
        this.state.advantages.set(`${tokenKey}:${args.advantageId}`, { ...args, provenance: event });
        break;
      case 'PassListingStateSet':
        if (!registeredEdition(args.edition)) break;
        this.state.advantages.set(`${tokenKey}:listing`, { listed: args.listed, provenance: event });
        break;
      case 'ListingCreated':
        if (!registeredEdition(args.edition)) break;
        this.state.listings.set(args.orderHash, { ...args, status: 'ACTIVE', provenance: event });
        break;
      case 'ListingCancelled':
      case 'ListingFilled':
      case 'ListingExpired':
      case 'ListingStale': {
        const listing = this.state.listings.get(args.orderHash) ?? { orderHash: args.orderHash };
        listing.status = event.eventName.replace('Listing', '').toUpperCase();
        listing.provenance = event;
        this.state.listings.set(args.orderHash, listing);
        break;
      }
      case 'RoyaltyRecorded':
        if (!registeredEdition(args.edition)) break;
        this.state.royalties.set(args.orderHash, { ...args, withdrawn: false, provenance: event });
        break;
      case 'RoyaltyWithdrawn': {
        const claim = this.state.royalties.get(args.orderHash) ?? { orderHash: args.orderHash };
        claim.withdrawn = true;
        claim.provenance = event;
        this.state.royalties.set(args.orderHash, claim);
        break;
      }
      case 'ERC6551AccountCreated':
        if (!registeredEdition(args.tokenContract)) break;
        this.state.tbas.set(`${args.tokenContract.toLowerCase()}:${args.tokenId}`, { ...args, provenance: event });
        break;
      case 'ReferralHintSubmitted':
        if (!registeredEdition(args.edition)) break;
        this.state.referralHints.push({ ...args, canonical: false, provenance: event });
        break;
      default:
        break;
    }
  }
}

export { eventKey };
