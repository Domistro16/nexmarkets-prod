import { createHash, randomUUID } from 'node:crypto';

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

export class MemoryStore {
  constructor() {
    this.challenges = new Map(); this.sessions = new Map(); this.transactions = new Map();
    this.projects = []; this.editions = []; this.passes = []; this.listingRows = []; this.media = [];
  }
  async ready() { return true; }
  async indexerHealth() { return { latest_block_number: 1, finalized_block_number: 1 }; }
  async close() {}
  async saveChallenge(challenge) { this.challenges.set(challenge.nonce, structuredClone(challenge)); }
  async challenge(nonce) { return structuredClone(this.challenges.get(nonce) ?? null); }
  async consumeChallengeAndCreateSession({ challenge, session, signature }) {
    const stored = this.challenges.get(challenge.nonce);
    if (!stored || stored.consumedAt) throw new Error('CHALLENGE_ALREADY_USED_OR_EXPIRED');
    stored.consumedAt = Date.now(); stored.signature = signature;
    const accountId = `acct_${hash(challenge.address).slice(0, 24)}`;
    const walletId = `wal_${hash(`${challenge.chainId}:${challenge.address}`).slice(0, 24)}`;
    this.sessions.set(session.tokenHash, { ...session, accountId, walletId, walletAddress: challenge.address, chainId: challenge.chainId });
    return { accountId, walletId };
  }
  async sessionByToken(token) { return structuredClone(this.sessions.get(hash(token)) ?? null); }
  async revokeSession(id) { for (const session of this.sessions.values()) if (session.id === id) session.revokedAt = Date.now(); }
  async recordAudit() {}
  async prepareTransaction(input) {
    const existing = [...this.transactions.values()].find((tx) => tx.accountId === input.accountId && tx.intentType === input.intentType && tx.idempotencyKey === input.idempotencyKey);
    if (existing) return structuredClone(existing);
    const tx = { id: `txj_${randomUUID()}`, state: 'PREPARED', createdAt: new Date().toISOString(), ...input };
    this.transactions.set(tx.id, tx); return structuredClone(tx);
  }
  async updateTransaction({ id, accountId, eventId, fromState, toState, evidence = {} }) {
    const tx = this.transactions.get(id);
    if (!tx || tx.accountId !== accountId || tx.state !== fromState) throw new Error('TRANSACTION_STATE_CONFLICT');
    tx.appliedEvents ??= new Map();
    if (tx.appliedEvents.has(eventId)) return structuredClone(tx);
    if (fromState === toState) throw new Error('TRANSACTION_DUPLICATE_STATE');
    tx.state = toState; Object.assign(tx, evidence); tx.appliedEvents.set(eventId, true);
    const result = { ...tx }; delete result.appliedEvents; return structuredClone(result);
  }
  async transaction(id, accountId) { const tx = this.transactions.get(id); return tx?.accountId === accountId ? structuredClone(tx) : null; }
  async discover() { return structuredClone(this.projects.filter((project) => project.status === 'PUBLISHED')); }
  async projectBySlug(slug) { return structuredClone(this.projects.find((project) => project.slug === slug) ?? null); }
  async editionByAddress(address) { return structuredClone(this.editions.find((edition) => edition.editionAddress === address.toLowerCase()) ?? null); }
  async pass(edition, tokenId) { return structuredClone(this.passes.find((pass) => pass.editionAddress === edition.toLowerCase() && String(pass.tokenId) === String(tokenId)) ?? null); }
  async listings() { return structuredClone(this.listingRows.filter((listing) => listing.status === 'ACTIVE')); }
  async ownedPasses(address) { return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address.toLowerCase())); }
  async advantagesForOwner(address) { return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address.toLowerCase()).flatMap((pass) => pass.advantages ?? [])); }
  async builderDashboard(accountId) { return { projects: structuredClone(this.projects.filter((project) => project.builderAccountId === accountId)), editions: [], royalties: [], referrals: [] }; }
  async createProject({ accountId, body }) { const project = { id: `prj_${randomUUID()}`, builderAccountId: accountId, status: 'DRAFT', ...body }; this.projects.push(project); return structuredClone(project); }
  async createMedia({ accountId, metadata }) { const row = { id: `med_${randomUUID()}`, ownerAccountId: accountId, ...metadata }; this.media.push(row); return structuredClone(row); }
}
