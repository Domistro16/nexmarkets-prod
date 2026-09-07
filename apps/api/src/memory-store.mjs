import { createHash, randomUUID } from 'node:crypto';

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

export class MemoryStore {
  constructor() {
    this.challenges = new Map(); this.sessions = new Map(); this.transactions = new Map();
    this.projects = []; this.editions = []; this.passes = []; this.listingRows = []; this.signedOrders = new Map(); this.editionRequests = []; this.termsCommitments = new Map(); this.media = [];
    this.builderProfiles = new Map(); this.builderFollows = []; this.projectWatchlist = []; this.builderMilestones = [];
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
  async editionByAddress(address) { return structuredClone(this.editions.find((edition) => edition.editionAddress === address.toLowerCase()) ?? null); }
  async pass(edition, tokenId) { return structuredClone(this.passes.find((pass) => pass.editionAddress === edition.toLowerCase() && String(pass.tokenId) === String(tokenId)) ?? null); }
  async listings() { return structuredClone(this.listingRows.filter((listing) => listing.status === 'ACTIVE')); }
  async storeSignedOrder(input) { this.signedOrders.set(input.orderHash.toLowerCase(), structuredClone(input)); return structuredClone(input); }
  async signedOrder(orderHash) { const signed = this.signedOrders.get(orderHash.toLowerCase()); if (!signed) return null; const listing = this.listingRows.find((item) => item.order_hash?.toLowerCase() === orderHash.toLowerCase() || item.orderHash?.toLowerCase() === orderHash.toLowerCase()); return structuredClone({ ...signed, status: listing?.status ?? 'ACTIVE', expires_at: listing?.expires_at ?? listing?.expiresAt }); }
  async listing(orderHash) { return structuredClone(this.listingRows.find((item) => item.order_hash?.toLowerCase() === orderHash.toLowerCase() || item.orderHash?.toLowerCase() === orderHash.toLowerCase()) ?? null); }
  async ownedPasses(address) { return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address.toLowerCase())); }
  async advantagesForOwner(address) { return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address.toLowerCase()).flatMap((pass) => pass.advantages ?? [])); }
  async builderDashboard(accountId) { return { projects: structuredClone(this.projects.filter((project) => project.builderAccountId === accountId)), editions: [], royalties: [], referrals: [] }; }
  async createProject({ accountId, body }) {
    const draftId = body.launchDraft?.draftId ?? body.draftId ?? null;
    const existing = this.projects.find((project) =>
      project.builderAccountId === accountId && (
        (draftId && (project.content?.draftId === draftId || project.launchDraft?.draftId === draftId)) ||
        project.slug === body.slug
      )
    );
    if (existing) {
      existing.name = body.name;
      existing.summary = body.summary ?? '';
      existing.content = structuredClone(body.launchDraft ?? {});
      existing.launchDraft = structuredClone(body.launchDraft ?? {});
      existing.updatedAt = new Date().toISOString();
      return structuredClone(existing);
    }
    const slugConflict = this.projects.find((project) => project.slug === body.slug && project.builderAccountId !== accountId);
    if (slugConflict) {
      throw Object.assign(new Error('SLUG_ALREADY_TAKEN'), { status: 409 });
    }
    const id = `prj_${randomUUID()}`;
    const project = {
      id,
      builderAccountId: accountId,
      builder_account_id: accountId,
      slug: body.slug,
      name: body.name,
      summary: body.summary ?? '',
      content: structuredClone(body.launchDraft ?? {}),
      launchDraft: structuredClone(body.launchDraft ?? {}),
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.projects.push(project);
    return structuredClone(project);
  }
  async createEditionRequest({ projectId, builderAccountId, chainId, payload, transactionId = null }) { const project = this.projects.find((item) => item.id === projectId && item.builderAccountId === builderAccountId); if (!project) throw new Error('PROJECT_BUILDER_MISMATCH'); const request = { id: `edreq_${randomUUID()}`, projectId, builderAccountId, chainId, transactionId, editionIdHash: payload.editionId, requestPayload: payload, predictedEditionAddress: payload.predictedEditionAddress ?? null, safeStatus: 'REQUESTED' }; this.editionRequests.push(request); return structuredClone(request); }
  async markEditionRequestSafePending(id, builderAccountId) { const request = this.editionRequests.find((item) => item.id === id && item.builderAccountId === builderAccountId && item.safeStatus !== 'REJECTED'); if (!request) throw new Error('EDITION_REQUEST_STATE_CONFLICT'); if (request.safeStatus === 'REQUESTED') request.safeStatus = 'SAFE_PENDING'; return structuredClone(request); }
  async saveTermsCommitment(input) { this.termsCommitments.set(input.advantagesHash.toLowerCase(), structuredClone(input)); return structuredClone(input); }
  async editionRequestById(id, builderAccountId, chainId = null) { return structuredClone(this.editionRequests.find((request) => request.id === id && request.builderAccountId === builderAccountId && (chainId == null || Number(request.chainId) === Number(chainId))) ?? null); }
  async submitEditionRequest({ id, safeTransactionHash, txHash, evidence = null }) { const existing = this.editionRequests.find((item) => item.id === id); if (existing?.safeStatus === 'SUBMITTED' && existing.txHash === txHash) return structuredClone(existing); const request = existing && ['SAFE_PENDING', 'REQUESTED'].includes(existing.safeStatus) ? existing : null; if (!request) throw new Error('EDITION_REQUEST_STATE_CONFLICT'); Object.assign(request, { safeStatus: 'SUBMITTED', safeTransactionHash, txHash, safeExecutionEvidence: evidence }); return structuredClone(request); }
  async createMedia({ accountId, metadata }) { const row = { id: `med_${randomUUID()}`, ownerAccountId: accountId, ...metadata }; this.media.push(row); return structuredClone(row); }

  // --- Social layer ---

  async getBuilderProfile(identifier) {
    let profile = this.builderProfiles.get(identifier) ?? null;
    if (!profile) {
      const session = [...this.sessions.values()].find((s) => s.walletAddress?.toLowerCase() === identifier.toLowerCase());
      if (session) profile = this.builderProfiles.get(session.accountId) ?? null;
    }
    if (!profile) {
      for (const p of this.builderProfiles.values()) {
        if (p.account_id === identifier || p.id === identifier || p.wallet_address?.toLowerCase() === identifier.toLowerCase()) {
          profile = p;
          break;
        }
      }
    }
    if (!profile) return null;
    const session = [...this.sessions.values()].find((s) => s.accountId === profile.account_id);
    const wallet_address = session?.walletAddress ?? profile.wallet_address ?? '0x0000000000000000000000000000000000000000';
    const joined_at = profile.created_at;
    const projectIds = this.projects.filter((p) => p.builderAccountId === profile.account_id || p.builder_account_id === profile.account_id).map((p) => p.id);
    const editions = this.editions.filter((e) => projectIds.includes(e.projectId ?? e.project_id));
    const passes = this.passes.filter((p) => editions.some((e) => (e.editionAddress ?? e.edition_address)?.toLowerCase() === p.editionAddress?.toLowerCase()));
    const activeHolders = new Set(passes.map((p) => p.ownerAddress?.toLowerCase())).size;
    const stats = {
      editionsCount: editions.length,
      passesIssued: passes.length,
      activeHolders,
      totalVolumeUsdg: '0'
    };
    const followerCount = this.builderFollows.filter((f) => f.builder_account_id === profile.account_id).length;
    return structuredClone({ ...profile, wallet_address, joined_at, stats, followerCount, editions });
  }

  async upsertBuilderProfile(accountId, data) {
    const existing = this.builderProfiles.get(accountId);
    const profile = {
      id: existing?.id ?? `bprf_${randomUUID()}`,
      account_id: accountId,
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
    this.builderProfiles.set(accountId, profile);
    return structuredClone(profile);
  }

  async followBuilder(followerAccountId, builderAccountId) {
    if (followerAccountId === builderAccountId) throw Object.assign(new Error('SELF_FOLLOW_REJECTED'), { status: 400 });
    const exists = this.builderFollows.find((f) => f.follower_account_id === followerAccountId && f.builder_account_id === builderAccountId);
    if (!exists) this.builderFollows.push({ id: `bfl_${randomUUID()}`, follower_account_id: followerAccountId, builder_account_id: builderAccountId, created_at: new Date().toISOString() });
    const followerCount = this.builderFollows.filter((f) => f.builder_account_id === builderAccountId).length;
    return { followed: true, followerCount };
  }

  async unfollowBuilder(followerAccountId, builderAccountId) {
    this.builderFollows = this.builderFollows.filter((f) => !(f.follower_account_id === followerAccountId && f.builder_account_id === builderAccountId));
    const followerCount = this.builderFollows.filter((f) => f.builder_account_id === builderAccountId).length;
    return { unfollowed: true, followerCount };
  }

  async getFollowStatus(followerAccountId, builderAccountId) {
    const isFollowing = this.builderFollows.some((f) => f.follower_account_id === followerAccountId && f.builder_account_id === builderAccountId);
    const followerCount = this.builderFollows.filter((f) => f.builder_account_id === builderAccountId).length;
    const builderProjectIds = this.projects.filter((p) => p.builderAccountId === builderAccountId || p.builder_account_id === builderAccountId).map((p) => p.id);
    const isHolder = this.passes.some((pass) => {
      const ownerSessions = [...this.sessions.values()].filter((s) => s.accountId === followerAccountId);
      const ownerAddresses = ownerSessions.map((s) => s.walletAddress?.toLowerCase());
      return ownerAddresses.includes(pass.ownerAddress?.toLowerCase()) && builderProjectIds.length > 0;
    });
    return { isFollowing, followerCount, isHolder };
  }

  async getFollowedBuilders(accountId) {
    const follows = this.builderFollows.filter((f) => f.follower_account_id === accountId);
    return structuredClone(follows.map((f) => ({ builderAccountId: f.builder_account_id, followedAt: f.created_at, profile: this.builderProfiles.get(f.builder_account_id) ?? null })));
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
    if (!payload.title?.trim()) throw Object.assign(new Error('MILESTONE_TITLE_REQUIRED'), { status: 400 });
    if (!payload.content?.trim()) throw Object.assign(new Error('MILESTONE_CONTENT_REQUIRED'), { status: 400 });
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = this.builderMilestones.find((m) => m.builder_account_id === builderAccountId && (m.project_id ?? null) === (payload.projectId ?? null) && new Date(m.created_at).getTime() > weekAgo);
    if (recent) throw Object.assign(new Error('MILESTONE_CADENCE_EXCEEDED'), { status: 429 });
    const milestone = { id: `bms_${randomUUID()}`, builder_account_id: builderAccountId, project_id: payload.projectId ?? null, title: payload.title.trim(), content: payload.content.trim(), links: payload.links ?? [], created_at: new Date().toISOString() };
    this.builderMilestones.push(milestone);
    return structuredClone(milestone);
  }

  async getMilestonesByBuilder(builderAccountId, { limit = 20 } = {}) {
    return structuredClone(this.builderMilestones.filter((m) => m.builder_account_id === builderAccountId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit));
  }

  async getActivityByBuilder(builderAccountId, { limit = 20 } = {}) {
    const milestones = this.builderMilestones.filter((m) => m.builder_account_id === builderAccountId).map((m) => ({
      id: m.id,
      type: 'MILESTONE',
      title: m.title,
      content: m.content,
      links: m.links,
      created_at: m.created_at
    }));
    const projectIds = this.projects.filter((p) => (p.builderAccountId ?? p.builder_account_id) === builderAccountId).map((p) => p.id);
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
    const followedIds = this.builderFollows.filter((f) => f.follower_account_id === accountId).map((f) => f.builder_account_id);
    const userSessions = [...this.sessions.values()].filter((s) => s.accountId === accountId);
    const userAddresses = userSessions.map((s) => s.walletAddress?.toLowerCase());
    const heldPasses = this.passes.filter((p) => userAddresses.includes(p.ownerAddress?.toLowerCase()));
    const heldEditionAddresses = heldPasses.map((p) => p.editionAddress?.toLowerCase());
    const heldProjects = this.projects.filter((prj) => {
      const prjEditions = this.editions.filter((e) => (e.projectId ?? e.project_id) === prj.id);
      return prjEditions.some((e) => heldEditionAddresses.includes((e.editionAddress ?? e.edition_address)?.toLowerCase()));
    });
    const heldBuilderIds = heldProjects.map((prj) => prj.builderAccountId ?? prj.builder_account_id);
    const relevantBuilderIds = [...new Set([...followedIds, ...heldBuilderIds])];

    const milestones = this.builderMilestones.filter((m) => relevantBuilderIds.includes(m.builder_account_id)).map((m) => ({
      ...m,
      type: 'MILESTONE',
      builderProfile: this.builderProfiles.get(m.builder_account_id) ?? null
    }));

    const debuts = this.editions.filter((e) => {
      const prj = this.projects.find((p) => p.id === (e.projectId ?? e.project_id));
      return prj && relevantBuilderIds.includes(prj.builderAccountId ?? prj.builder_account_id);
    }).map((e) => {
      const prj = this.projects.find((p) => p.id === (e.projectId ?? e.project_id));
      return {
        id: `debut_${e.id}`,
        type: 'NEW_DEBUT',
        builder_account_id: prj?.builderAccountId ?? prj?.builder_account_id,
        title: `New Debut: ${prj?.name ?? 'Edition'}`,
        content: prj?.summary ?? 'New pass edition debuted.',
        created_at: e.createdAt ?? e.created_at ?? new Date().toISOString(),
        builderProfile: this.builderProfiles.get(prj?.builderAccountId ?? prj?.builder_account_id) ?? null
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
    const featured = [...this.builderProfiles.values()].filter((p) => p.featured).slice(0, limit);
    return structuredClone(featured.map((profile) => {
      const project = this.projects.find((p) => p.builderAccountId === profile.account_id || p.builder_account_id === profile.account_id);
      const projectIds = this.projects.filter((p) => p.builderAccountId === profile.account_id || p.builder_account_id === profile.account_id).map((p) => p.id);
      const editions = this.editions.filter((e) => projectIds.includes(e.projectId ?? e.project_id));
      const latestEdition = editions[0];
      const passesIssued = this.passes.filter((p) => projectIds.length > 0).length;
      return {
        ...profile,
        editionsCount: editions.length,
        passesIssued,
        supplyCap: latestEdition?.absoluteSupplyCap ?? latestEdition?.absolute_supply_cap ?? 555,
        priceUsdg: latestEdition?.priceUsdg ?? latestEdition?.price_usdg ?? '50',
        advantageSummary: latestEdition?.advantageSummary ?? 'Priority Access & Builder Advantage',
        projectSlug: project?.slug ?? null
      };
    }));
  }
}

export default MemoryStore;
