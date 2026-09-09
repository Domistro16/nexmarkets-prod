import { createHash, randomUUID } from 'node:crypto';
import { aggregatePrimarySales, calculatePrimarySale, primarySaleEventKey } from '@nexmarkets/domain';

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function builderError(code, status = 403) { return Object.assign(new Error(code), { status }); }

export class MemoryStore {
  constructor() {
    this.challenges = new Map(); this.sessions = new Map(); this.transactions = new Map();
    this.projects = []; this.editions = []; this.passes = []; this.listingRows = []; this.signedOrders = new Map(); this.termsCommitments = new Map(); this.media = [];
    this.builders = new Map(); this.builderMemberships = []; this.builderProfiles = new Map();
    this.primarySales = new Map();
    this.builderFollows = []; this.projectWatchlist = []; this.builderMilestones = []; this.builderQuestions = [];
  }
  async ready() { return true; }
  async indexerHealth() { return { latest_block_number: 1, latest_event_block_number: 1, landed_block_number: 1, finalized_block_number: 1, finalized_watermark_block_number: 1 }; }
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
  async transaction(id, accountId, chainId = null) { const tx = this.transactions.get(id); return tx?.accountId === accountId && (chainId == null || Number(tx.chainId) === Number(chainId)) ? structuredClone(tx) : null; }
  async discover() { return structuredClone(this.projects.filter((project) => project.status === 'PUBLISHED')); }
  async projectBySlug(slug) { return structuredClone(this.projects.find((project) => project.slug === slug) ?? null); }
  async projectByEditionAddress(address) {
    const target = String(address || '').toLowerCase();
    const edition = this.editions.find((item) => String(item.editionAddress ?? item.edition_address ?? '').toLowerCase() === target);
    if (!edition) return null;
    const project = this.projects.find((item) => item.id === (edition.projectId ?? edition.project_id) && item.status === 'PUBLISHED');
    if (!project) return null;
    return structuredClone({ ...project, editions: this.editions.filter((item) => (item.projectId ?? item.project_id) === project.id) });
  }
  async editionByAddress(address) { return structuredClone(this.editions.find((edition) => edition.editionAddress === address.toLowerCase()) ?? null); }
  async pass(edition, tokenId) { return structuredClone(this.passes.find((pass) => pass.editionAddress === edition.toLowerCase() && String(pass.tokenId) === String(tokenId)) ?? null); }
  async listings() { return structuredClone(this.listingRows.filter((listing) => listing.status === 'ACTIVE')); }
  async storeSignedOrder(input) { this.signedOrders.set(input.orderHash.toLowerCase(), structuredClone(input)); return structuredClone(input); }
  async signedOrder(orderHash) { const signed = this.signedOrders.get(orderHash.toLowerCase()); if (!signed) return null; const listing = this.listingRows.find((item) => item.order_hash?.toLowerCase() === orderHash.toLowerCase() || item.orderHash?.toLowerCase() === orderHash.toLowerCase()); return structuredClone({ ...signed, status: listing?.status ?? 'ACTIVE', expires_at: listing?.expires_at ?? listing?.expiresAt }); }
  async listing(orderHash) { return structuredClone(this.listingRows.find((item) => item.order_hash?.toLowerCase() === orderHash.toLowerCase() || item.orderHash?.toLowerCase() === orderHash.toLowerCase()) ?? null); }
  async ownedPasses(address) { return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address.toLowerCase())); }
  async advantagesForOwner(address) { return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address.toLowerCase()).flatMap((pass) => pass.advantages ?? [])); }
  _uniqueProfiles() {
    return [...new Map([...this.builderProfiles.values()].filter(Boolean).map((profile) => [profile.id, profile])).values()];
  }

  _membership(accountId, builderId) {
    return this.builderMemberships.find((membership) => membership.account_id === accountId && membership.builder_id === builderId) ?? null;
  }

  _builderForIdentifier(identifier) {
    const key = String(identifier ?? '');
    if (this.builders.has(key)) return this.builders.get(key);
    const directProfile = this.builderProfiles.get(key);
    if (directProfile?.builder_id && this.builders.has(directProfile.builder_id)) return this.builders.get(directProfile.builder_id);
    const profile = this._uniqueProfiles().find((candidate) => candidate.builder_id === key || candidate.id === key || candidate.account_id === key || candidate.wallet_address?.toLowerCase() === key.toLowerCase());
    if (profile?.builder_id && this.builders.has(profile.builder_id)) return this.builders.get(profile.builder_id);
    return [...this.builders.values()].find((builder) => builder.owner_account_id === key) ?? null;
  }

  _ensureBuilder(accountId, requestedBuilderId = null, { create = true } = {}) {
    const requested = requestedBuilderId == null ? '' : String(requestedBuilderId);
    if (requested) {
      const builder = this._builderForIdentifier(requested);
      if (!builder || !this._membership(accountId, builder.id)) throw builderError('BUILDER_NOT_AUTHORIZED');
      return builder;
    }
    const existingMembership = this.builderMemberships.find((membership) => membership.account_id === accountId);
    if (existingMembership && this.builders.has(existingMembership.builder_id)) return this.builders.get(existingMembership.builder_id);
    const legacyProfile = this.builderProfiles.get(accountId);
    if (!create && !legacyProfile) return null;
    const id = legacyProfile?.builder_id ?? `bld_${hash(accountId).slice(0, 24)}`;
    let builder = this.builders.get(id);
    if (!builder) {
      builder = { id, owner_account_id: accountId, created_at: legacyProfile?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
      this.builders.set(id, builder);
    }
    if (!this._membership(accountId, id)) this.builderMemberships.push({ builder_id: id, account_id: accountId, role: 'OWNER', created_at: new Date().toISOString() });
    return builder;
  }

  async listBuildersForAccount(accountId) {
    const memberships = this.builderMemberships.filter((membership) => membership.account_id === accountId);
    return structuredClone(memberships.map((membership) => {
      const builder = this.builders.get(membership.builder_id);
      const profile = this.builderProfiles.get(membership.builder_id) ?? this.builderProfiles.get(accountId) ?? null;
      return { id: builder?.id ?? membership.builder_id, builder_id: builder?.id ?? membership.builder_id, owner_account_id: builder?.owner_account_id ?? accountId, role: membership.role, profile };
    }));
  }

  async createBuilderIdentity(accountId, data = {}) {
    const id = `bld_${randomUUID()}`;
    const now = new Date().toISOString();
    const builder = { id, owner_account_id: accountId, created_at: now, updated_at: now };
    this.builders.set(id, builder);
    this.builderMemberships.push({ builder_id: id, account_id: accountId, role: 'OWNER', created_at: now });
    if (data.displayName || data.display_name || data.bio || data.about || data.links) await this.upsertBuilderProfile(accountId, data, { builderId: id });
    return structuredClone({ ...builder, profile: this.builderProfiles.get(id) ?? null });
  }

  async recordPrimarySale(input) {
    let sale = calculatePrimarySale(input);
    if (!sale.builderId && sale.builderAccountId) {
      const builder = this._builderForIdentifier(sale.builderAccountId);
      if (builder) sale = { ...sale, builderId: builder.id };
    }
    const key = primarySaleEventKey(sale);
    const existing = this.primarySales.get(key);
    if (existing) {
      if (existing.grossAmountUsdg !== sale.grossAmountUsdg || existing.quantity !== sale.quantity || String(existing.editionId ?? '') !== String(sale.editionId ?? '')) throw new Error('PRIMARY_SALE_EVENT_CONFLICT');
      return structuredClone(existing);
    }
    this.primarySales.set(key, { id: `psa_${hash(key).slice(0, 24)}`, ...sale });
    return structuredClone(this.primarySales.get(key));
  }

  async primarySalesForBuilder(builderIdentifier) {
    const builder = this._builderForIdentifier(builderIdentifier);
    const builderId = builder?.id ?? String(builderIdentifier);
    return structuredClone([...this.primarySales.values()].filter((sale) => sale.builderId === builderId || sale.builder_id === builderId));
  }

  async builderDashboard(accountId, { builderId = null } = {}) {
    const builder = this._ensureBuilder(accountId, builderId, { create: false });
    const canonicalBuilderId = builder?.id ?? null;
    const matches = (project) => canonicalBuilderId
      ? (project.builderId ?? project.builder_id ?? project.builderAccountId ?? project.builder_account_id) === canonicalBuilderId
        || (!(project.builderId ?? project.builder_id) && (project.builderAccountId ?? project.builder_account_id) === accountId)
      : (project.builderAccountId ?? project.builder_account_id) === accountId;
    const sales = canonicalBuilderId ? await this.primarySalesForBuilder(canonicalBuilderId) : [];
    const earnings = aggregatePrimarySales(sales);
    return {
      builder: builder ? structuredClone({ ...builder, profile: this.builderProfiles.get(builder.id) ?? this.builderProfiles.get(accountId) ?? null }) : null,
      projects: structuredClone(this.projects.filter(matches)),
      editions: [],
      royalties: [],
      referrals: [],
      primarySales: sales,
      earnings,
      activity: await this.getActivityByBuilder(canonicalBuilderId ?? accountId, { limit: 50 })
    };
  }
  async createProject({ accountId, builderId = null, body }) {
    const builder = this._ensureBuilder(accountId, builderId);
    const canonicalBuilderId = builder.id;
    const draftId = body.launchDraft?.draftId ?? body.draftId ?? null;
    const status = body.status ?? body.launchDraft?.status ?? 'DRAFT';
    const existing = this.projects.find((project) =>
      (project.builderId ?? project.builder_id ?? project.builderAccountId ?? project.builder_account_id) === canonicalBuilderId && (
        (draftId && (project.content?.draftId === draftId || project.launchDraft?.draftId === draftId)) ||
        project.slug === body.slug
      )
    );
    if (existing) {
      existing.name = body.name;
      existing.summary = body.summary ?? '';
      existing.content = structuredClone(body.launchDraft ?? {});
      existing.launchDraft = structuredClone(body.launchDraft ?? {});
      existing.status = status;
      existing.builderId = canonicalBuilderId;
      existing.builder_id = canonicalBuilderId;
      existing.builderAccountId = accountId;
      existing.builder_account_id = accountId;
      if (status === 'PUBLISHED') existing.publishedAt ??= new Date().toISOString();
      existing.updatedAt = new Date().toISOString();
      return structuredClone(existing);
    }
    const slugConflict = this.projects.find((project) => project.slug === body.slug && (project.builderId ?? project.builder_id ?? project.builderAccountId ?? project.builder_account_id) !== canonicalBuilderId);
    if (slugConflict) {
      throw Object.assign(new Error('SLUG_ALREADY_TAKEN'), { status: 409 });
    }
    const id = `prj_${randomUUID()}`;
    const project = {
      id,
      builderId: canonicalBuilderId,
      builder_id: canonicalBuilderId,
      builderAccountId: accountId,
      builder_account_id: accountId,
      slug: body.slug,
      name: body.name,
      summary: body.summary ?? '',
      content: structuredClone(body.launchDraft ?? {}),
      launchDraft: structuredClone(body.launchDraft ?? {}),
      status,
      publishedAt: status === 'PUBLISHED' ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.projects.push(project);
    return structuredClone(project);
  }
  async linkEditionToProject({ accountId, builderId = null, projectId, edition }) {
    const builder = this._ensureBuilder(accountId, builderId, { create: false });
    if (!builder) throw builderError('BUILDER_NOT_AUTHORIZED');
    const project = this.projects.find((row) => row.id === projectId && (row.builderId ?? row.builder_id ?? row.builderAccountId ?? row.builder_account_id) === builder.id);
    if (!project) throw builderError('PROJECT_BUILDER_MISMATCH');
    if (!['DRAFT', 'PUBLISHED'].includes(String(project.status).toUpperCase())) throw Object.assign(new Error('PROJECT_NOT_PUBLISHABLE'), { status: 409 });
    const address = String(edition?.edition ?? edition?.editionAddress ?? '').toLowerCase();
    const existing = this.editions.find((row) => String(row.editionAddress ?? row.edition_address ?? '').toLowerCase() === address);
    if (existing?.projectId && existing.projectId !== project.id) throw Object.assign(new Error('EDITION_ALREADY_LINKED'), { status: 409 });
    const row = existing ?? { id: `ed_${hash(`${Number(edition.chainId)}:${address}`).slice(0, 24)}` };
    Object.assign(row, { projectId: project.id, project_id: project.id, chainId: Number(edition.chainId), chain_id: Number(edition.chainId), editionAddress: address, edition_address: address, editionIdHash: String(edition.editionId).toLowerCase(), edition_id_hash: String(edition.editionId).toLowerCase(), factoryAddress: String(edition.factoryAddress).toLowerCase(), factory_address: String(edition.factoryAddress).toLowerCase(), publisherAddress: String(edition.publisher ?? edition.publisherAddress).toLowerCase(), publisher_address: String(edition.publisher ?? edition.publisherAddress).toLowerCase(), absoluteSupplyCap: Number(edition.absoluteSupplyCap), absolute_supply_cap: Number(edition.absoluteSupplyCap), artworkCommitment: String(edition.artworkCommitment).toLowerCase(), artwork_commitment: String(edition.artworkCommitment).toLowerCase(), sourceBlockNumber: Number(edition.blockNumber), source_block_number: Number(edition.blockNumber), sourceBlockHash: String(edition.blockHash).toLowerCase(), source_block_hash: String(edition.blockHash).toLowerCase(), sourceTxHash: String(edition.txHash).toLowerCase(), source_tx_hash: String(edition.txHash).toLowerCase(), sourceLogIndex: Number(edition.logIndex), source_log_index: Number(edition.logIndex), finalized: false });
    if (!existing) this.editions.push(row);
    return structuredClone(row);
  }
  async saveTermsCommitment(input) {
    const builder = this._ensureBuilder(input.builderAccountId, input.builderId ?? null);
    const value = { ...input, builderId: builder.id, builder_id: builder.id };
    this.termsCommitments.set(input.advantagesHash.toLowerCase(), structuredClone(value));
    return structuredClone(value);
  }
  async createMedia({ accountId, metadata }) {
    const existing = this.media.find((row) => row.ownerAccountId === accountId && row.sha256 === metadata.sha256 && !row.deletedAt);
    if (existing) return structuredClone(existing);
    const row = { id: `med_${randomUUID()}`, ownerAccountId: accountId, ...metadata, uploadStatus: 'PREPARED', uploadedAt: null, verifiedAt: null, width: null, height: null, publicUrl: null, createdAt: new Date().toISOString(), deletedAt: null };
    this.media.push(row);
    return structuredClone(row);
  }
  async mediaById(id) { return structuredClone(this.media.find((row) => row.id === id && !row.deletedAt) ?? null); }
  async mediaByIds(ids) { const wanted = new Set(ids); return structuredClone(this.media.filter((row) => wanted.has(row.id) && !row.deletedAt)); }
  async approveMedia({ id, accountId, publicUrl, width, height, mimeType, byteSize, sha256 }) {
    const row = this.media.find((item) => item.id === id && item.ownerAccountId === accountId && !item.deletedAt);
    if (!row) return null;
    Object.assign(row, { publicUrl, width, height, mimeType, byteSize, sha256, safetyStatus: 'APPROVED', uploadStatus: 'UPLOADED', uploadedAt: new Date().toISOString(), verifiedAt: new Date().toISOString() });
    return structuredClone(row);
  }

  // --- Social layer ---

  async getBuilderProfile(identifier) {
    let profile = this.builderProfiles.get(identifier) ?? null;
    const session = [...this.sessions.values()].find((s) => s.walletAddress?.toLowerCase() === String(identifier ?? '').toLowerCase());
    const builder = this._builderForIdentifier(identifier) ?? (session ? this._builderForIdentifier(session.accountId) : null);
    if (!profile && builder) profile = this.builderProfiles.get(builder.id) ?? this.builderProfiles.get(builder.owner_account_id) ?? null;
    if (!profile) profile = this._uniqueProfiles().find((p) => p.account_id === identifier || p.id === identifier || p.builder_id === identifier || p.wallet_address?.toLowerCase() === String(identifier ?? '').toLowerCase()) ?? null;
    if (!profile) return null;
    const ownerSession = [...this.sessions.values()].find((s) => s.accountId === profile.account_id);
    const wallet_address = ownerSession?.walletAddress ?? profile.wallet_address ?? '0x0000000000000000000000000000000000000000';
    const joined_at = profile.created_at;
    const canonicalBuilderId = profile.builder_id ?? builder?.id ?? profile.account_id;
    const projectIds = this.projects.filter((p) => (p.builderId ?? p.builder_id) === canonicalBuilderId || (!(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === profile.account_id)).map((p) => p.id);
    const editions = this.editions.filter((e) => projectIds.includes(e.projectId ?? e.project_id));
    const passes = this.passes.filter((p) => editions.some((e) => (e.editionAddress ?? e.edition_address)?.toLowerCase() === p.editionAddress?.toLowerCase()));
    const sales = [...this.primarySales.values()].filter((sale) => sale.builderId === canonicalBuilderId || sale.builder_id === canonicalBuilderId);
    const earnings = aggregatePrimarySales(sales);
    const activeHolders = new Set(passes.map((p) => p.ownerAddress?.toLowerCase())).size;
    const stats = {
      editionsCount: editions.length,
      passesIssued: passes.length,
      activeHolders,
      totalVolumeUsdg: earnings.grossAmountUsdg
    };
    const followerCount = this.builderFollows.filter((f) => f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId).length;
    return structuredClone({ ...profile, builder_id: canonicalBuilderId, wallet_address, joined_at, stats, followerCount, editions });
  }

  async upsertBuilderProfile(accountId, data, { builderId = null } = {}) {
    const builder = this._ensureBuilder(accountId, builderId);
    const existing = this.builderProfiles.get(builder.id) ?? (builderId ? null : this.builderProfiles.get(accountId));
    const profile = {
      id: existing?.id ?? `bprf_${randomUUID()}`,
      account_id: accountId,
      builder_id: builder.id,
      display_name: data.displayName ?? existing?.display_name ?? '',
      bio: data.bio ?? existing?.bio ?? '',
      about: data.about ?? existing?.about ?? '',
      avatar_url: data.avatarUrl ?? existing?.avatar_url ?? '',
      category: data.category ?? existing?.category ?? '',
      links: data.links ?? existing?.links ?? {},
      featured: existing?.featured ?? false,
      created_at: existing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.builderProfiles.set(builder.id, profile);
    if (!builderId && !this.builderProfiles.has(accountId)) this.builderProfiles.set(accountId, profile);
    return structuredClone(profile);
  }

  async followBuilder(followerAccountId, builderAccountId) {
    const builder = this._ensureBuilder(builderAccountId, null, { create: true });
    if (builder.owner_account_id === followerAccountId) throw Object.assign(new Error('SELF_FOLLOW_REJECTED'), { status: 400 });
    const canonicalBuilderId = builder.id;
    const exists = this.builderFollows.find((f) => f.follower_account_id === followerAccountId && f.builder_account_id === canonicalBuilderId);
    if (!exists) this.builderFollows.push({ id: `bfl_${randomUUID()}`, follower_account_id: followerAccountId, builder_account_id: builder.owner_account_id, builder_id: canonicalBuilderId, created_at: new Date().toISOString() });
    const followerCount = this.builderFollows.filter((f) => f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId).length;
    return { followed: true, followerCount };
  }

  async unfollowBuilder(followerAccountId, builderAccountId) {
    const builder = this._builderForIdentifier(builderAccountId);
    const canonicalBuilderId = builder?.id ?? builderAccountId;
    this.builderFollows = this.builderFollows.filter((f) => !(f.follower_account_id === followerAccountId && (f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId)));
    const followerCount = this.builderFollows.filter((f) => f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId).length;
    return { unfollowed: true, followerCount };
  }

  async getFollowStatus(followerAccountId, builderAccountId) {
    const builder = this._builderForIdentifier(builderAccountId);
    const canonicalBuilderId = builder?.id ?? builderAccountId;
    const isFollowing = this.builderFollows.some((f) => f.follower_account_id === followerAccountId && (f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId));
    const followerCount = this.builderFollows.filter((f) => f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId).length;
    const builderProjectIds = this.projects.filter((p) => (p.builderId ?? p.builder_id) === canonicalBuilderId || (!(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === builderAccountId)).map((p) => p.id);
    const isHolder = this.passes.some((pass) => {
      const ownerSessions = [...this.sessions.values()].filter((s) => s.accountId === followerAccountId);
      const ownerAddresses = ownerSessions.map((s) => s.walletAddress?.toLowerCase());
      return ownerAddresses.includes(pass.ownerAddress?.toLowerCase()) && builderProjectIds.length > 0;
    });
    return { isFollowing, followerCount, isHolder };
  }

  async getFollowedBuilders(accountId) {
    const follows = this.builderFollows.filter((f) => f.follower_account_id === accountId);
    return structuredClone(follows.map((f) => ({ builderAccountId: f.builder_account_id, builderId: f.builder_id ?? f.builder_account_id, followedAt: f.created_at, profile: this.builderProfiles.get(f.builder_id ?? f.builder_account_id) ?? null })));
  }

  async watchProject(accountId, slug) {
    const project = this.projects.find((p) => p.slug === slug);
    if (!project) throw Object.assign(new Error('PROJECT_NOT_FOUND'), { status: 404 });
    const exists = this.projectWatchlist.find((w) => w.account_id === accountId && w.project_id === project.id);
    if (!exists) this.projectWatchlist.push({ id: `pwl_${randomUUID()}`, account_id: accountId, project_id: project.id, created_at: new Date().toISOString() });
    const watcherCount = this.projectWatchlist.filter((w) => w.project_id === project.id).length;
    return { watching: true, watcherCount };
  }

  async unwatchProject(accountId, slug) {
    const project = this.projects.find((p) => p.slug === slug);
    if (!project) throw Object.assign(new Error('PROJECT_NOT_FOUND'), { status: 404 });
    this.projectWatchlist = this.projectWatchlist.filter((w) => !(w.account_id === accountId && w.project_id === project.id));
    const watcherCount = this.projectWatchlist.filter((w) => w.project_id === project.id).length;
    return { unwatched: true, watcherCount };
  }

  async getWatchlist(accountId) {
    const entries = this.projectWatchlist.filter((w) => w.account_id === accountId);
    return structuredClone(entries.map((w) => {
      const project = this.projects.find((p) => p.id === w.project_id);
      const watcherCount = this.projectWatchlist.filter((x) => x.project_id === w.project_id).length;
      return { ...w, slug: project?.slug, name: project?.name, summary: project?.summary, watcherCount };
    }));
  }

  async createMilestone(builderAccountId, payload) {
    const builder = this._ensureBuilder(builderAccountId);
    const canonicalBuilderId = builder.id;
    if (!payload.title?.trim()) throw Object.assign(new Error('MILESTONE_TITLE_REQUIRED'), { status: 400 });
    if (!payload.content?.trim()) throw Object.assign(new Error('MILESTONE_CONTENT_REQUIRED'), { status: 400 });
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = this.builderMilestones.find((m) => (m.builder_id ?? m.builder_account_id) === canonicalBuilderId && (m.project_id ?? null) === (payload.projectId ?? null) && new Date(m.created_at).getTime() > weekAgo);
    if (recent) throw Object.assign(new Error('MILESTONE_CADENCE_EXCEEDED'), { status: 429 });
    const milestone = { id: `bms_${randomUUID()}`, builder_account_id: builder.owner_account_id, builder_id: canonicalBuilderId, project_id: payload.projectId ?? null, title: payload.title.trim(), content: payload.content.trim(), links: payload.links ?? [], created_at: new Date().toISOString() };
    this.builderMilestones.push(milestone);
    return structuredClone(milestone);
  }

  async getMilestonesByBuilder(builderAccountId, { limit = 20 } = {}) {
    const builder = this._builderForIdentifier(builderAccountId);
    const canonicalBuilderId = builder?.id ?? builderAccountId;
    return structuredClone(this.builderMilestones.filter((m) => (m.builder_id ?? m.builder_account_id) === canonicalBuilderId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit));
  }

  async createQuestion(askerAccountId, builderAccountId, payload) {
    const builder = this._builderForIdentifier(builderAccountId);
    const canonicalBuilderId = builder?.id ?? builderAccountId;
    const question = String(payload.question ?? payload.content ?? '').trim().slice(0, 800);
    if (question.length < 3) throw Object.assign(new Error('QUESTION_REQUIRED'), { status: 400 });
    const row = { id: `bq_${randomUUID()}`, builder_account_id: builder?.owner_account_id ?? builderAccountId, builder_id: canonicalBuilderId, asker_account_id: askerAccountId, question, answer: '', answered_at: null, created_at: new Date().toISOString() };
    this.builderQuestions.push(row);
    return structuredClone(row);
  }

  async answerQuestion(builderAccountId, questionId, payload) {
    const builder = this._builderForIdentifier(builderAccountId);
    const canonicalBuilderId = builder?.id ?? builderAccountId;
    if (!builder || builder.owner_account_id !== builderAccountId) throw Object.assign(new Error('QUESTION_NOT_FOUND'), { status: 404 });
    const row = this.builderQuestions.find((question) => question.id === questionId && (question.builder_id ?? question.builder_account_id) === canonicalBuilderId);
    if (!row) throw Object.assign(new Error('QUESTION_NOT_FOUND'), { status: 404 });
    const answer = String(payload.answer ?? payload.content ?? '').trim().slice(0, 1200);
    if (answer.length < 1) throw Object.assign(new Error('ANSWER_REQUIRED'), { status: 400 });
    row.answer = answer; row.answered_at = new Date().toISOString();
    return structuredClone(row);
  }

  async getQuestionsByBuilder(builderAccountId, { limit = 50 } = {}) {
    const builder = this._builderForIdentifier(builderAccountId);
    const canonicalBuilderId = builder?.id ?? builderAccountId;
    return structuredClone(this.builderQuestions.filter((question) => (question.builder_id ?? question.builder_account_id) === canonicalBuilderId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit));
  }

  async getActivityByBuilder(builderAccountId, { limit = 20 } = {}) {
    const builder = this._builderForIdentifier(builderAccountId);
    const canonicalBuilderId = builder?.id ?? builderAccountId;
    const milestones = this.builderMilestones.filter((m) => (m.builder_id ?? m.builder_account_id) === canonicalBuilderId).map((m) => ({
      id: m.id,
      type: 'MILESTONE',
      title: m.title,
      content: m.content,
      links: m.links,
      created_at: m.created_at
    }));
    const projectIds = this.projects.filter((p) => (p.builderId ?? p.builder_id) === canonicalBuilderId || (!(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === (builder?.owner_account_id ?? builderAccountId))).map((p) => p.id);
    const editions = this.editions.filter((e) => projectIds.includes(e.projectId ?? e.project_id));
    const debuts = editions.map((e) => {
      const prj = this.projects.find((p) => p.id === (e.projectId ?? e.project_id));
      return {
        id: `act_${e.id}`,
        type: 'NEW_DEBUT',
        title: `New Debut: ${prj?.name ?? 'Edition'}`,
        content: `Launched edition with supply cap of ${e.absoluteSupplyCap ?? e.absolute_supply_cap ?? 555}.`,
        created_at: e.createdAt ?? e.created_at ?? new Date().toISOString()
      };
    });
    const sales = this.listingRows.filter((l) => l.status === 'FILLED' && editions.some((e) => (e.editionAddress ?? e.edition_address)?.toLowerCase() === (l.editionAddress ?? l.edition_address)?.toLowerCase())).map((l) => ({
      id: `sale_${l.orderHash ?? l.order_hash}`,
      type: 'SECONDARY_SALE',
      title: `Pass #${l.tokenId ?? l.token_id} Sold`,
      content: `Sold for ${l.priceUsdg ?? l.price_usdg ?? 0} USDG on secondary market.`,
      created_at: l.updatedAt ?? l.updated_at ?? new Date().toISOString()
    }));
    const holders = this.passes.filter((p) => editions.some((e) => (e.editionAddress ?? e.edition_address)?.toLowerCase() === p.editionAddress?.toLowerCase())).map((p) => ({
      id: `holder_${p.editionAddress}_${p.tokenId}`,
      type: 'NEW_HOLDER',
      title: `New Holder for #${p.tokenId}`,
      content: `Pass acquired by ${p.ownerAddress?.slice(0, 6)}...${p.ownerAddress?.slice(-4)}`,
      created_at: p.updatedAt ?? p.mintedAt ?? new Date().toISOString()
    }));
    const all = [...milestones, ...debuts, ...sales, ...holders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
    return structuredClone(all);
  }

  async getFeed(accountId, { limit = 50 } = {}) {
    const followedIds = this.builderFollows.filter((f) => f.follower_account_id === accountId).map((f) => f.builder_id ?? f.builder_account_id);
    const userSessions = [...this.sessions.values()].filter((s) => s.accountId === accountId);
    const userAddresses = userSessions.map((s) => s.walletAddress?.toLowerCase());
    const heldPasses = this.passes.filter((p) => userAddresses.includes(p.ownerAddress?.toLowerCase()));
    const heldEditionAddresses = heldPasses.map((p) => p.editionAddress?.toLowerCase());
    const heldProjects = this.projects.filter((prj) => {
      const prjEditions = this.editions.filter((e) => (e.projectId ?? e.project_id) === prj.id);
      return prjEditions.some((e) => heldEditionAddresses.includes((e.editionAddress ?? e.edition_address)?.toLowerCase()));
    });
    const heldBuilderIds = heldProjects.map((prj) => prj.builderId ?? prj.builder_id ?? prj.builderAccountId ?? prj.builder_account_id);
    const relevantBuilderIds = [...new Set([...followedIds, ...heldBuilderIds])];

    const milestones = this.builderMilestones.filter((m) => relevantBuilderIds.includes(m.builder_id ?? m.builder_account_id)).map((m) => ({
      ...m,
      type: 'MILESTONE',
      builderProfile: this.builderProfiles.get(m.builder_id ?? m.builder_account_id) ?? null
    }));

    const debuts = this.editions.filter((e) => {
      const prj = this.projects.find((p) => p.id === (e.projectId ?? e.project_id));
      return prj && relevantBuilderIds.includes(prj.builderId ?? prj.builder_id ?? prj.builderAccountId ?? prj.builder_account_id);
    }).map((e) => {
      const prj = this.projects.find((p) => p.id === (e.projectId ?? e.project_id));
      return {
        id: `debut_${e.id}`,
        type: 'NEW_DEBUT',
        builder_account_id: prj?.builderAccountId ?? prj?.builder_account_id,
        builder_id: prj?.builderId ?? prj?.builder_id,
        title: `New Debut: ${prj?.name ?? 'Edition'}`,
        content: prj?.summary ?? 'New pass edition debuted.',
        created_at: e.createdAt ?? e.created_at ?? new Date().toISOString(),
        builderProfile: this.builderProfiles.get(prj?.builderId ?? prj?.builder_id) ?? this.builderProfiles.get(prj?.builderAccountId ?? prj?.builder_account_id) ?? null
      };
    });

    const feed = [...milestones, ...debuts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
    return structuredClone(feed);
  }

  async getHolders(editionAddress, { limit = 100 } = {}) {
    const passes = this.passes.filter((p) => p.editionAddress?.toLowerCase() === editionAddress.toLowerCase());
    return structuredClone(passes.sort((a, b) => Number(a.tokenId) - Number(b.tokenId)).slice(0, limit).map((p) => ({
      owner_address: p.ownerAddress, token_id: p.tokenId, held_since: p.updatedAt ?? p.mintedAt ?? new Date().toISOString(), minted_block_number: p.mintedBlockNumber ?? 0
    })));
  }

  async getPlatformStats() {
    const passesIssued = this.passes.length;
    const activeHolders = new Set(this.passes.map((p) => p.ownerAddress?.toLowerCase())).size;
    const filled = this.listingRows.filter((l) => l.status === 'FILLED');
    const totalVolumeUsdg = filled.reduce((sum, l) => sum + Number(l.price_usdg ?? l.priceUsdg ?? 0), 0).toString();
    return { passesIssued, activeHolders, totalVolumeUsdg };
  }

  async getWatchlistCount(projectIdOrSlug) {
    const project = this.projects.find((p) => p.id === projectIdOrSlug || p.slug === projectIdOrSlug);
    const id = project ? project.id : projectIdOrSlug;
    return this.projectWatchlist.filter((w) => w.project_id === id).length;
  }

  async getFeaturedBuilders({ limit = 4 } = {}) {
    const featured = this._uniqueProfiles().filter((p) => p.featured).slice(0, limit);
    return structuredClone(featured.map((profile) => {
      const builderId = profile.builder_id ?? profile.account_id;
      const project = this.projects.find((p) => (p.builderId ?? p.builder_id) === builderId || (!(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === profile.account_id));
      const projectIds = this.projects.filter((p) => (p.builderId ?? p.builder_id) === builderId || (!(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === profile.account_id)).map((p) => p.id);
      const editions = this.editions.filter((e) => projectIds.includes(e.projectId ?? e.project_id));
      const latestEdition = editions[0];
      const editionAddresses = new Set(editions.map((e) => String(e.editionAddress ?? e.edition_address ?? '').toLowerCase()).filter(Boolean));
      const passesIssued = editionAddresses.size
        ? this.passes.filter((p) => editionAddresses.has(String(p.editionAddress ?? p.edition_address ?? '').toLowerCase())).length
        : (projectIds.length ? this.passes.length : 0);
      const earnings = aggregatePrimarySales([...this.primarySales.values()].filter((sale) => sale.builderId === builderId));
      return {
        ...profile,
        builder_id: builderId,
        editionsCount: editions.length,
        passesIssued,
        supplyCap: latestEdition?.absoluteSupplyCap ?? latestEdition?.absolute_supply_cap ?? null,
        priceUsdg: latestEdition?.priceUsdg ?? latestEdition?.price_usdg ?? null,
        totalVolumeUsdg: earnings.grossAmountUsdg,
        advantageSummary: latestEdition?.advantageSummary ?? null,
        projectSlug: project?.slug ?? null
      };
    }));
  }
}

export default MemoryStore;
