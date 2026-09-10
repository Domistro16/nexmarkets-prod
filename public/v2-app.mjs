import { NexWallet, editionCreatedFromReceipt } from './wallet.mjs';
import { openConnectModal, openAccountModal, openChainModal, onAccountChange, onChainChange, waitForConnection, getWalletProvider, disconnectWallet, initModal } from './rainbow-wallet.mjs';

/*
 * NexMarkets V2 is intentionally a data adapter around the supplied product
 * experience document.  The document owns the visual system and its existing
 * renderers; this module owns only runtime configuration, API reads, wallet
 * authentication and the translation from canonical API/Subgraph records to
 * the renderer's view model.
 */
const CERTIFICATION_EDITION = '0x4171D62F43B4168b07a01C04594455DBc3298437';
const CERTIFICATION_TOKEN = '1';
const CHAIN_ID = 84532;
const DEFAULT_NETWORK_KEY = 'base-sepolia';
const LEGACY_ROBINHOOD_CHAIN_ID = 46630;
const ZERO = '0x0000000000000000000000000000000000000000';

const state = {
  config: null,
  runtimeConfig: null,
  networkKey: DEFAULT_NETWORK_KEY,
  edition: null,
  pass: null,
  detailEdition: null,
  detailPass: null,
  detailSummary: null,
  detailProject: null,
  discover: [],
  listings: [],
  authenticated: false,
  wallet: null,
  csrfToken: sessionStorage.getItem('nex_csrf') || null,
  connecting: false,
  connectingMessage: null,
  error: null,
  route: null,
  detail: null,
  templateData: null,
  builderProfiles: new Map(),
  builderSocial: new Map(),
  managedBuilders: [],
  selectedBuilderId: sessionStorage.getItem('nexmarkets_selected_builder') || null,
  builderDashboard: { projects: [], editions: [], royalties: [], referrals: [] },
  pendingMint: null,
  pendingBuy: null,
  pendingListing: null,
  lastDraftId: null,
  lastSavedProject: null,
  draftSavePromise: null,
  hydrating: false
};

const wallet = new NexWallet();
let connectWalletFromUi = null;
let walletMode = null;
let cdpControls = null;
let cdpInitPromise = null;
let cdpSession = null;
const cdpConnectionWaiters = new Set();

function lower(value) { return typeof value === 'string' ? value.toLowerCase() : value; }
function address(value) { return typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) ? value : null; }
function short(value) { const text = address(value) || String(value || ''); return text.length > 12 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text; }
function number(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function seconds(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isNaN(n) && n < 10_000_000_000) return Math.floor(n);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}
function iso(value) { const s = seconds(value); return s == null ? null : new Date(s * 1000).toISOString(); }
function usd(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') {
    const whole = value / 1_000_000n;
    const fraction = String(value % 1_000_000n).padStart(6, '0').replace(/0+$/, '');
    return Number(`${whole}${fraction ? `.${fraction}` : ''}`);
  }
  const str = String(value).trim();
  if (!str) return 0;
  if (str.includes('.')) {
    const num = Number(str);
    return Number.isFinite(num) ? num : 0;
  }
  try {
    const units = BigInt(str);
    const whole = units / 1_000_000n;
    const fraction = String(units % 1_000_000n).padStart(6, '0').replace(/0+$/, '');
    return Number(`${whole}${fraction ? `.${fraction}` : ''}`);
  } catch {
    const num = Number(str);
    return Number.isFinite(num) ? num : 0;
  }
}
function padSerial(value) { return `#${String(Math.max(0, number(value))).padStart(3, '0')}`; }
function initials(value) { return String(value || 'NP').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'NP'; }
function kind(value) { return String(value || '').toUpperCase().replace(/[^A-Z]+/g, '_'); }
function kindLabel(value) {
  return ({ TIME_BASED: 'TimeBased', QUANTITY_BASED: 'QuantityBased', CONNECTED: 'Connected', REDEMPTION: 'Redemption' })[kind(value)] || 'Advantage';
}
function consumes(value) { return ['QUANTITY_BASED', 'REDEMPTION'].includes(kind(value)); }
function remainingValue(advantage) {
  const value = advantage?.userFacingRemaining ?? advantage?.remaining ?? advantage?.remainingUnits ?? advantage?.remaining_units ?? advantage?.totalUnits;
  return number(value, value == null ? 0 : value);
}
function durationLabel(value) {
  const secondsValue = Math.max(0, number(value));
  if (secondsValue >= 86400) return `${(secondsValue / 86400).toFixed(secondsValue % 86400 ? 1 : 0)} days`;
  if (secondsValue >= 3600) return `${(secondsValue / 3600).toFixed(secondsValue % 3600 ? 1 : 0)} hours`;
  return `${Math.floor(secondsValue / 60)} minutes`;
}
function advantageText(advantages, fallbackHash) {
  if (!advantages?.length) return fallbackHash ? `Committed utility · ${short(fallbackHash)}` : 'No committed Advantage';
  return advantages.map((item) => {
    const k = kind(item.kind);
    const remaining = remainingValue(item);
    if (k === 'TIME_BASED') return `${durationLabel(remaining)} remaining`;
    if (k === 'CONNECTED') return remaining > 0 ? 'Active entitlement/access' : 'Inactive entitlement/access';
    if (k === 'REDEMPTION') return `${remaining} redemption${remaining === 1 ? '' : 's'} remaining`;
    return `${remaining} unit${remaining === 1 ? '' : 's'} remaining`;
  }).join(' · ');
}
function activeNetworkName() { return state.config?.displayName || state.config?.name || (state.config?.family === 'base' ? 'Base' : 'Robinhood'); }
function activeNetworkFamily() { return state.config?.family || (state.config?.network?.startsWith('base-') ? 'base' : 'robinhood'); }
function activeNetworkKey() { return state.networkKey || state.config?.network || DEFAULT_NETWORK_KEY; }
function activeCertificationEdition() { return address(state.config?.certificationEdition?.address || state.config?.certificationEditionAddress) || null; }
function activeSettlementSymbol() { return state.config?.settlementSymbol || state.config?.settlement?.symbol || 'USDG'; }
function defaultCertificationEdition() { return activeCertificationEdition() || (activeNetworkFamily() === 'robinhood' ? CERTIFICATION_EDITION : null); }
function termsOf(edition) {
  const rows = Array.isArray(edition?.termsHistory) ? edition.termsHistory : Array.isArray(edition?.terms) ? edition.terms : [];
  const current = edition?.currentTerms || rows[0] || null;
  return { current, history: rows.length ? rows : current ? [current] : [] };
}
function termHash(term) { return lower(term?.terms_hash || term?.termsHash || term?.hash) || null; }
function editionAddress(value) { return address(value) || defaultCertificationEdition() || ZERO; }
function normalizeTerms(raw = {}) {
  const price = raw.pricePerPass ?? raw.price_usdg ?? raw.priceUsdg ?? '0';
  const hash = termHash(raw);
  return {
    ...raw,
    hash,
    termsHash: hash,
    terms_hash: hash,
    version: raw.version ?? null,
    activeSupply: raw.activeSupply ?? raw.active_supply ?? raw.active_supply_cap ?? null,
    pricePerPass: String(price),
    price_usdg: String(price),
    previewStartsAt: seconds(raw.previewStartsAt ?? raw.preview_starts_at),
    mintStartsAt: seconds(raw.mintStartsAt ?? raw.mint_starts_at),
    mintEndsAt: seconds(raw.mintEndsAt ?? raw.mint_ends_at),
    allowlistRoot: lower(raw.allowlistRoot || raw.allowlist_root) || `0x${'00'.repeat(32)}`,
    allowlist_root: lower(raw.allowlistRoot || raw.allowlist_root) || `0x${'00'.repeat(32)}`,
    allowlistEndsAt: seconds(raw.allowlistEndsAt ?? raw.allowlist_ends_at),
    allowlist_ends_at: raw.allowlist_ends_at || iso(raw.allowlistEndsAt ?? raw.allowlist_ends_at),
    allowlistSupply: raw.allowlistSupply ?? raw.allowlist_supply ?? 0,
    allowlist_supply: raw.allowlistSupply ?? raw.allowlist_supply ?? 0,
    preview_starts_at: raw.preview_starts_at || iso(raw.previewStartsAt ?? raw.preview_starts_at),
    mint_starts_at: raw.mint_starts_at || iso(raw.mintStartsAt ?? raw.mint_starts_at),
    mint_ends_at: raw.mint_ends_at || iso(raw.mintEndsAt ?? raw.mint_ends_at),
    primaryRecipient: lower(raw.primaryRecipient || raw.primary_recipient) || ZERO,
    primary_recipient: lower(raw.primaryRecipient || raw.primary_recipient) || ZERO,
    royaltyReceiver: lower(raw.royaltyReceiver || raw.royalty_receiver) || ZERO,
    royalty_receiver: lower(raw.royaltyReceiver || raw.royalty_receiver) || ZERO,
    royaltyBps: raw.royaltyBps ?? raw.royalty_bps ?? 0,
    royalty_bps: raw.royaltyBps ?? raw.royalty_bps ?? 0,
    advantagesHash: lower(raw.advantagesHash || raw.advantages_hash) || `0x${'00'.repeat(32)}`,
    advantages_hash: lower(raw.advantagesHash || raw.advantages_hash) || `0x${'00'.repeat(32)}`,
    referralTermsHash: lower(raw.referralTermsHash || raw.referral_terms_hash) || `0x${'00'.repeat(32)}`,
    referral_terms_hash: lower(raw.referralTermsHash || raw.referral_terms_hash) || `0x${'00'.repeat(32)}`,
    // API/read-model implementations have historically exposed both camel
    // and snake-case field names. Keep the canonical committed definitions
    // regardless of which transport spelling the current network returns.
    advantageConfigs: Array.isArray(raw.advantageConfigs)
      ? raw.advantageConfigs
      : (Array.isArray(raw.advantage_configs) ? raw.advantage_configs : [])
  };
}
function statusFor(edition, summary) {
  const authorityTag = String(edition?.statusTag ?? edition?.status_tag ?? summary?.statusTag ?? summary?.status_tag ?? '').trim().toUpperCase();
  if (authorityTag === 'DRAFT') return 'draft';
  if (authorityTag === 'PREVIEW') return 'preview';
  if (authorityTag === 'DEBUT') return 'live';
  if (authorityTag === 'CLOSED') return 'closed';
  if (authorityTag === 'MARKET') return 'market';
  const terms = termsOf(edition).current || summary?.currentTerms || summary;
  const termsHashValue = terms?.hash || terms?.terms_hash || terms?.termsHash || summary?.active_terms_hash;
  if (!termsHashValue) return 'draft';
  const cap = number(edition?.absolute_supply_cap ?? edition?.absoluteSupplyCap ?? summary?.absolute_supply_cap ?? summary?.absoluteSupplyCap);
  const minted = number(edition?.totalMinted ?? edition?.total_minted ?? summary?.total_minted ?? summary?.totalMinted);
  const start = seconds(terms?.mintStartsAt ?? terms?.mint_starts_at ?? summary?.mint_starts_at);
  const end = seconds(terms?.mintEndsAt ?? terms?.mint_ends_at ?? summary?.mint_ends_at);
  const now = Math.floor(Date.now() / 1000);
  if (cap > 0 && minted >= cap) return 'closed';
  if (start != null && now < start) return 'preview';
  if (end != null && now >= end) return 'closed';
  return 'live';
}
function normalizeEdition(raw, summary = null) {
  if (!raw && !summary) return null;
  const addr = editionAddress(raw?.edition_address || raw?.address || summary?.edition_address || summary?.address);
  const source = raw || summary;
  const terms = termsOf(source);
  // Discover summaries may expose the active commitment/timing without the
  // expanded Terms object. Preserve that canonical summary as a read-only
  // Terms snapshot so a client-side route can still render and validate the
  // launch until the full Edition endpoint is fetched.
  const summaryTerms = source?.active_terms_hash || source?.terms_hash
    ? { ...source, hash: source.active_terms_hash || source.terms_hash, terms_hash: source.active_terms_hash || source.terms_hash }
    : null;
  const current = normalizeTerms(terms.current || summaryTerms || {});
  const history = (terms.history.length ? terms.history : (termHash(current) ? [current] : [])).map((term) => normalizeTerms(term));
  const cap = number(raw?.absolute_supply_cap ?? raw?.absoluteSupplyCap ?? summary?.absolute_supply_cap ?? summary?.absoluteSupplyCap);
  const minted = number(raw?.totalMinted ?? raw?.total_minted ?? summary?.total_minted ?? summary?.totalMinted);
  const name = raw?.name || summary?.name || (addr.toLowerCase() === (defaultCertificationEdition() || ZERO).toLowerCase() ? 'NexMarkets V1 Test Certification Edition' : `NexPass Edition ${short(addr)}`);
  return {
    // Preserve the published project payload when an on-chain edition row is
    // merged with its Discover summary. That payload contains the frozen
    // renderer configuration; dropping it here would make presentation/export
    // fall back to an unbound legacy design.
    ...summary,
    ...raw,
    address: addr,
    edition_address: addr,
    name,
    editionId: raw?.editionId || raw?.edition_id || summary?.edition_id || null,
    publisher: lower(raw?.publisher || raw?.builder_account_id || raw?.builderAccountId || summary?.publisher || summary?.builder_account_id || summary?.builderAccountId) || ZERO,
    editionOwner: lower(raw?.editionOwner || raw?.edition_owner || summary?.editionOwner || summary?.edition_owner || raw?.publisher || summary?.publisher) || ZERO,
    mintController: lower(raw?.mintController || summary?.mint_controller) || null,
    absoluteSupplyCap: cap,
    absolute_supply_cap: cap,
    totalMinted: minted,
    total_minted: minted,
    disabled: Boolean(raw?.disabled ?? summary?.disabled),
    currentTerms: current,
    termsHistory: history,
    termsHash: termHash(current),
    advantagesHash: lower(current.advantagesHash || current.advantages_hash) || null,
    priceBaseUnits: String(current.pricePerPass ?? current.price_usdg ?? summary?.price_usdg ?? '0'),
    price: usd(current.pricePerPass ?? current.price_usdg ?? summary?.price_usdg ?? '0'),
    previewStartsAt: seconds(current.previewStartsAt ?? current.preview_starts_at ?? summary?.preview_starts_at),
    mintStartsAt: seconds(current.mintStartsAt ?? current.mint_starts_at ?? summary?.mint_starts_at),
    mintEndsAt: seconds(current.mintEndsAt ?? current.mint_ends_at ?? summary?.mint_ends_at),
    royaltyReceiver: lower(current.royaltyReceiver || current.royalty_receiver) || ZERO,
    royaltyBps: number(current.royaltyBps ?? current.royalty_bps),
    status: statusFor({ ...raw, ...summary, absoluteSupplyCap: cap, totalMinted: minted, currentTerms: current }, summary)
  };
}
function normalizePass(raw, edition) {
  if (!raw) return null;
  const advantages = Array.isArray(raw.advantages) ? raw.advantages : [];
  const token = String(raw.token_id ?? raw.tokenId ?? CERTIFICATION_TOKEN);
  const owner = lower(raw.owner_address || raw.owner || raw.currentOwner) || ZERO;
  const addr = editionAddress(raw.edition_address || raw.edition?.address || edition?.address);
  const rawRoyaltyReceiver = lower(raw.royalty_receiver || raw.royaltyReceiver || edition?.royaltyReceiver || termsOf(edition).current?.royaltyReceiver) || ZERO;
  const rawRoyaltyBps = raw.royalty_bps ?? raw.royaltyBps ?? edition?.royaltyBps ?? termsOf(edition).current?.royaltyBps ?? 0;
  return {
    ...raw,
    token_id: token,
    tokenId: token,
    owner,
    owner_address: owner,
    edition_address: addr,
    terms_hash: lower(raw.terms_hash || raw.termsHash) || null,
    royalty_receiver: rawRoyaltyReceiver,
    royaltyReceiver: rawRoyaltyReceiver,
    royalty_bps: rawRoyaltyBps,
    royaltyBps: rawRoyaltyBps,
    name: raw.name || edition?.name || `NexPass ${short(addr)}`,
    advantages,
    token_bound_account: raw.token_bound_account || raw.tba?.account || null,
    tba: raw.tba || null,
    listed: Boolean(raw.listed || raw.listing?.status === 'ACTIVE'),
    serial: `${padSerial(token)} / ${edition?.absoluteSupplyCap || raw.edition?.absoluteSupplyCap || ''}`.trim()
  };
}
function normalizeListing(raw, editionMap) {
  if (!raw) return null;
  const addr = editionAddress(raw.edition_address || raw.edition?.address);
  const edition = editionMap.get(addr.toLowerCase());
  const token = String(raw.token_id ?? raw.tokenId ?? '0');
  const priceBase = raw.price_usdg ?? raw.price ?? '0';
  const orderHash = lower(raw.order_hash || raw.orderHash);
  return {
    ...raw,
    collection: edition ? initials(edition.name).toLowerCase() : addr.slice(2, 8).toLowerCase(),
    edition_address: addr,
    name: `${edition?.name || `Edition ${short(addr)}`} ${padSerial(token)}`,
    token_id: token,
    price: usd(priceBase),
    utility: 'active',
    remaining: 'See Pass details',
    owner: short(raw.seller_address || raw.seller),
    royalty: `${number(raw.royalty_bps ?? raw.royaltyBps) / 100}%`,
    color: '#34483a',
    marketState: String(raw.status || 'ACTIVE').toLowerCase(),
    listedMinutes: 0,
    orderHash,
    signature: raw.signature || null,
    counter: raw.counter == null ? null : String(raw.counter),
    order: raw.order_payload || raw.order || null,
    rawOrder: raw.order_payload || raw.order || null
  };
}
function templateDesignFromDraft(raw = {}) {
  const source = { ...raw };
  const option = String(source.packOption || source.packId || '').trim();
  let passDesign = String(source.passDesign || 'classic');
  const retiredPassDesign = !option && !['classic', 'glass'].includes(passDesign.toLowerCase()) && !/^pack-(slab|glass|metal|ceramic|blister|carbon|paper|resin)$/.test(passDesign.toLowerCase()) ? passDesign : '';
  let frame = String(source.frame || 'obsidian');
  if (/^(classic|glass)-(obsidian|carbon|gilt)$/.test(option)) {
    const [family, material] = option.split('-');
    passDesign = family;
    frame = material;
  } else if (/^pack-(slab|glass|metal|ceramic|blister|carbon|paper|resin)$/.test(option)) {
    passDesign = option;
    frame = 'obsidian';
  } else if (/^pack-/.test(passDesign)) {
    frame = 'obsidian';
  }
  const palette = source.palette && typeof source.palette === 'object' ? source.palette : null;
  const randomPalette = Array.isArray(source.randomPalette) && source.randomPalette.length >= 3
    ? source.randomPalette.slice(0, 3)
    : palette ? [palette.primary, palette.secondary, palette.accent].filter(Boolean).slice(0, 3) : [];
  const artEdition = Array.isArray(source.artEdition)
    ? source.artEdition.map((entry, index) => ({
      ...entry,
      serial: Number(entry.serial ?? index + 1),
      src: entry.src || entry.url || entry.storageUrl || (/^(https?:|data:)/i.test(String(entry.assetKey || '')) ? entry.assetKey : '')
    }))
    : [];
  return {
    ...source,
    passDesign,
    retiredPassDesign,
    frame,
    frameColor: source.frameColor || (frame === 'gilt' ? '#c8a84e' : frame === 'carbon' ? '#313337' : '#2a2725'),
    color: palette?.primary || source.color || randomPalette[0] || '#5f6f50',
    randomPalette: randomPalette.length >= 3 ? randomPalette : undefined,
    artEdition,
    passAssignments: Array.isArray(source.passAssignments) ? source.passAssignments : []
  };
}
function templateLaunchFromProject(project) {
  const source = project?.content || project?.launchDraft || project;
  if (!source || typeof source !== 'object' || (!source.project && !source.design && !source.edition)) return null;
  return {
    ...source,
    project: { ...(source.project || {}) },
    edition: { ...(source.edition || {}) },
    design: templateDesignFromDraft(source.design || {})
  };
}
function projectModel(edition, summary, pass) {
  const indexedTerms = termsOf(edition).current || {};
  const terms = Object.keys(indexedTerms).length ? indexedTerms : (summary || {});
  const advantages = pass?.advantages || [];
  const compiledLaunch = templateLaunchFromProject(summary) || templateLaunchFromProject(edition);
  const launchProject = compiledLaunch?.project || {};
  const launchEdition = compiledLaunch?.edition || {};
  const launchDesign = compiledLaunch?.design || {};
  const title = launchProject.name || edition?.name || summary?.name || `NexPass Edition ${short(edition?.address)}`;
  const builderId = lower(edition?.publisher || summary?.publisher || edition?.builder_account_id || edition?.builderAccountId || summary?.builder_account_id || summary?.builderAccountId) || ZERO;
  const builderProfile = state.builderProfiles.get(builderId) || null;
  const profileLinks = builderProfile?.links && typeof builderProfile.links === 'object' ? builderProfile.links : {};
  const stage = statusFor(edition, summary);
  const advKind = kind(advantages[0]?.kind) === 'REDEMPTION' ? 'redemption' : 'connected';
  const experience = {
    advantageText: advantageText(advantages, edition?.advantagesHash),
    advantageShort: advantageText(advantages, edition?.advantagesHash),
    minted: edition?.totalMinted || 0,
    builder: launchProject.builder || builderProfile?.display_name || builderProfile?.displayName || short(builderId),
    builderHandle: launchProject.builderHandle || profileLinks.handle || builderProfile?.handle || 'Onchain publisher',
    builderId,
    builderProfile,
    evidenceLabel: launchProject.evidence?.label || 'View onchain record',
    evidenceUrl: launchProject.evidence?.url || '',
    evidenceType: launchProject.evidence?.type || 'Onchain record',
    about: launchProject.about || `A permanent NexPass Edition on ${activeNetworkName()}. Ownership, serials and versioned Terms are read from the certified deployment. Edition ${short(edition?.address)} is indexed by Goldsky.`,
    edition: launchEdition.name || 'NEXMARKETS EDITION',
    royalty: launchEdition.royalty != null ? `${number(launchEdition.royalty)}%` : `${number(terms.royaltyBps ?? terms.royalty_bps) / 100}%`,
    termsVersion: compiledLaunch?.preview?.termsVersion || (terms.version == null ? 'Published Terms' : `v${terms.version}`),
    previewStarted: iso(compiledLaunch?.preview?.startsAt || terms.previewStartsAt || terms.preview_starts_at || summary?.preview_starts_at),
    opensAt: iso(compiledLaunch?.preview?.opensAt || terms.mintStartsAt || terms.mint_starts_at || summary?.mint_starts_at),
    closesAt: iso(terms.mintEndsAt ?? terms.mint_ends_at ?? summary?.mint_ends_at),
    visual: 'nexstudio',
    productState: launchProject.productState || '',
    supportUrl: launchProject.supportUrl || '',
    compiledLaunch
  };
  const totalMinted = edition?.totalMinted ?? summary?.total_minted ?? 0;
  const supplyCap = edition?.absoluteSupplyCap || number(launchEdition.supply) || Number(summary?.absolute_supply_cap || 0);
  const serialsDesc = `Finite Pass Edition · ${totalMinted}/${supplyCap} serials issued on ${activeNetworkName()}.`;
  const project = {
    name: title,
    logo: initials(title),
    category: launchProject.category || 'tools',
    state: stage === 'preview' ? 'preview' : stage === 'live' ? 'live' : stage === 'closed' ? 'closed' : stage === 'market' ? 'market' : 'draft',
    adv: advKind,
    price: launchEdition.price != null ? number(launchEdition.price) : (edition?.price || usd(terms.pricePerPass ?? terms.price_usdg)),
    supply: edition?.absoluteSupplyCap || number(launchEdition.supply),
    color: launchDesign.color || '#34483a',
    desc: launchProject.desc ? `${launchProject.desc} · ${totalMinted}/${supplyCap} serials issued` : serialsDesc,
    opens: stage === 'preview' ? (compiledLaunch?.preview?.opensAt || 'Preview') : 'Live',
    network: activeNetworkFamily(),
    editionAddress: edition?.address,
    termsHash: termHash(terms) || lower(summary?.active_terms_hash) || null,
    builderId,
    builderProfile,
    compiledLaunch
  };
  return { project, experience };
}
function ownedModel(raw, pass, edition) {
  const token = String(raw?.token_id ?? raw?.tokenId ?? pass?.token_id ?? '0');
  const advantages = pass?.advantages || raw?.advantages || [];
  const first = advantages[0];
  const ownedEdition = editionAddress(raw?.edition_address || pass?.edition_address || edition?.address);
  const title = raw?.project_name || pass?.name || edition?.name || `Edition ${short(ownedEdition)}`;
  const rem = advantageText(advantages, pass?.terms_hash);
  return {
    key: `${lower(ownedEdition)}-${token}`,
    name: title,
    serial: `${padSerial(token)} / ${edition?.absoluteSupplyCap || raw?.absolute_supply_cap || ''}`.trim(),
    logo: initials(title), color: '#34483a', category: `${activeNetworkName()} Edition`,
    desc: `Exact serial ownership recorded on ${activeNetworkName()}.`,
    advantage: rem, duration: kindLabel(first?.kind).toUpperCase(), utility: rem.toUpperCase(), state: rem,
    floor: 0, art: 'nx', artSrc: '',
    editionAddress: lower(ownedEdition),
    tokenId: token, termsHash: pass?.terms_hash || raw?.terms_hash || null,
    owner: pass?.owner_address || raw?.owner_address || null,
    royaltyReceiver: lower(pass?.royalty_receiver || raw?.royalty_receiver) || null,
    royaltyBps: number(pass?.royalty_bps ?? raw?.royalty_bps),
    advantages,
    listed: Boolean(pass?.listed || raw?.listing?.status === 'ACTIVE'),
    tokenBoundAccount: pass?.token_bound_account || null
  };
}
function emptyDashboard(projects) {
  return {
    passMeta: {}, advantages: [], listings: [],
    launches: projects.map((p) => ({ id: p.editionAddress || p.name, name: p.name, project: p.name, state: p.state === 'live' ? 'Live' : 'Preview', minted: p._minted || 0, supply: p.supply, price: p.price, primary: 0, timing: p.opens, collection: initials(p.name).toLowerCase(), evidence: '' })),
    earnings: { primaryProceeds: 0, royaltyAvailable: 0, royaltyLocked: 0, royaltyUnlock: 'No claims', referralTracked: 0 },
    activity: []
  };
}
function neutralCreateData() {
  return {
    draftId: '', name: '', builder: '', builderHandle: '', desc: '', about: '', videoUrl: '', evidenceType: 'Product', evidenceUrl: '', supportUrl: '', category: 'tools', productState: 'Preview',
    edition: '', series: '', supply: 1, price: 0, royalty: 0, advantages: [], referral: false, referralRate: 10,
    color: '#5f6f50', themeMode: 'auto', customColor: '#5f6f50', colorStyle: 'solid', gradientA: '#5f6f50', gradientB: '#17241f', gradientDirection: 'diagonal',
    passDesign: 'classic', randomPassMode: false, randomPassSeed: '', frame: 'obsidian', frameColor: '#2a2725', texture: 'none', textureTint: '#9b9b94', frameHueCustomized: false,
    packOption: null, packFamily: null, material: null, colorwayId: null, palette: null, passAssignments: [],
    logoSrc: '', logoAssetId: '', bannerSrc: '', bannerAssetId: '', bannerPalette: ['#5f6f50', '#30483d', '#111512'], bannerLogoPosition: 'tl', artSrc: '', artAssetId: '', artX: 50, artY: 50, artMode: 'single', artEdition: [], artEditionView: 'grid', artEditionSelected: 0,
    previewHours: 24, opensAt: '', timezone: 'Africa/Lagos', termsVersion: 'v1.0', allowlistEnabled: false, allowlistAddresses: '', allowlistHours: 24, allowlistSupply: 0, reviewEvidence: false, reviewAdvantages: false, reviewPreview: false, published: false
  };
}
function createDataFromLaunchDraft(project) {
  const draft = project?.content || project?.launchDraft || {};
  const projectData = draft.project || {};
  const edition = draft.edition || {};
  const design = draft.design || {};
  const preview = draft.preview || {};
  const banner = projectData.banner || {};
  const packOption = approvedPackOptionForDesign(design);
  const retiredPassDesign = design.retiredPassDesign || (!packOption && !['classic', 'glass'].includes(String(design.passDesign || '').toLowerCase()) && !/^pack-(slab|glass|metal|ceramic|blister|carbon|paper|resin)$/.test(String(design.passDesign || '').toLowerCase()) ? String(design.passDesign || '') : '');
  const passDesign = packOption ? (packOption.startsWith('classic-') ? 'classic' : packOption.startsWith('glass-') ? 'glass' : packOption) : 'classic';
  return {
    ...neutralCreateData(),
    draftId: draft.draftId || project.id || '',
    name: projectData.name || project.name || '',
    builder: projectData.builder || '',
    builderHandle: projectData.builderHandle || '',
    desc: projectData.desc || project.summary || '',
    about: projectData.about || '',
    videoUrl: projectData.videoUrl || '',
    evidenceType: projectData.evidence?.type || 'Product',
    evidenceUrl: projectData.evidence?.url || '',
    supportUrl: projectData.supportUrl || '',
    category: projectData.category || 'tools',
    productState: projectData.productState || 'Preview',
    edition: edition.name || '',
    series: edition.series || '',
    supply: Number(edition.supply || 1),
    price: Number(edition.price || 0),
    royalty: Number(edition.royalty || 0),
    advantages: Array.isArray(draft.advantages) ? draft.advantages : [],
    referral: Boolean(draft.referral?.enabled),
    referralRate: Number(draft.referral?.rate || 10),
    color: design.color || '#5f6f50',
    themeMode: design.themeMode || 'auto',
    customColor: design.customColor || design.color || '#5f6f50',
    colorStyle: design.colorStyle || 'solid',
    gradientA: design.gradientA || design.color || '#5f6f50',
    gradientB: design.gradientB || '#17241f',
    gradientDirection: design.gradientDirection || 'diagonal',
    passDesign,
    retiredPassDesign,
    randomPassMode: Boolean(design.randomPassMode),
    randomPassSeed: design.randomPassSeed || '',
    packOption,
    packFamily: design.packFamily || passDesign,
    material: design.material || design.frame || 'obsidian',
    colorwayId: design.colorwayId || null,
    palette: design.palette || null,
    passAssignments: Array.isArray(design.passAssignments) ? design.passAssignments : [],
    frame: design.frame || 'obsidian',
    frameColor: design.frameColor || '#2a2725',
    texture: design.texture || 'none',
    textureTint: design.textureTint || '#9b9b94',
    frameHueCustomized: Boolean(design.frameHueCustomized),
    logoSrc: design.logoSrc || '',
    logoAssetId: design.logoAssetId || '',
    bannerSrc: banner.src || '',
    bannerAssetId: banner.assetId || '',
    bannerPalette: Array.isArray(banner.palette) ? banner.palette : ['#5f6f50', '#30483d', '#111512'],
    bannerLogoPosition: banner.logoPosition || 'tl',
    artSrc: design.artSrc || '',
    artAssetId: design.artAssetId || '',
    artX: Number(design.artX ?? 50),
    artY: Number(design.artY ?? 50),
    artMode: design.artMode || 'single',
    artEdition: Array.isArray(design.artEdition) ? design.artEdition.map((entry, index) => ({
      ...entry,
      serial: Number(entry.serial ?? index + 1),
      src: entry.src || entry.url || entry.storageUrl || (/^(https?:|data:)/i.test(String(entry.assetKey || '')) ? entry.assetKey : '')
    })) : [],
    artEditionView: design.artEditionView || 'grid',
    artEditionSelected: Number(design.selectedSerialIndex || 0),
    previewHours: Number(preview.hours || 24),
    opensAt: preview.localOpensAt || preview.opensAt || '',
    timezone: preview.timezone || 'Africa/Lagos',
    termsVersion: preview.termsVersion || 'v1.0',
    allowlistEnabled: Boolean(draft.mintAccess?.enabled),
    allowlistAddresses: Array.isArray(draft.mintAccess?.addresses) ? draft.mintAccess.addresses.join('\n') : '',
    allowlistHours: Number(draft.mintAccess?.hours || 24),
    allowlistSupply: Number(draft.mintAccess?.supply || 0),
    reviewEvidence: Boolean(draft.review?.evidence),
    reviewAdvantages: Boolean(draft.review?.advantages),
    reviewPreview: Boolean(draft.review?.preview),
    published: String(project.status || draft.status || '').toUpperCase() === 'PUBLISHED'
  };
}

let createAutosaveTimer = null;
function applyMintAccessDraft(draft) {
  if (Number(state.config?.protocolVersion ?? 1) < 2) return draft;
  const data = createDataValue();
  draft.mintAccess = {
    enabled: Boolean(data.allowlistEnabled),
    addresses: String(data.allowlistAddresses || '').split(/[\s,]+/).filter(Boolean),
    hours: Math.max(1, Math.trunc(Number(data.allowlistHours || 24))),
    supply: Math.max(0, Math.trunc(Number(data.allowlistSupply || 0)))
  };
  return draft;
}
async function autosaveCreateDraft() {
  if (!state.authenticated || !state.wallet || state.draftSavePromise) return state.draftSavePromise;
  const getter = typeof window.__nmV2CompileCreateLaunch === 'function' ? window.__nmV2CompileCreateLaunch : null;
  if (!getter) return null;
  const compiled = compiledForActiveNetwork(getter());
  if (!compiled) return null;
  const cleanDraft = assertCreatePassFieldCoverage(sanitizeCompiledForApi(compiled));
  applyMintAccessDraft(cleanDraft);
  cleanDraft.status = 'DRAFT';
  const draftId = String(cleanDraft.draftId || state.lastDraftId || `draft-${uuid()}`).slice(0, 120);
  cleanDraft.draftId = draftId;
  const rawSlug = window.slugKey?.(cleanDraft.project?.name || '') || draftId.replace(/^draft-/, '');
  const slug = String(rawSlug || `draft-${draftId.slice(-24)}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `draft-${Date.now()}`;
  const name = cleanDraft.project?.name?.trim() || 'Untitled draft';
  const payload = { draftId, slug, name, summary: cleanDraft.project?.desc || '', status: 'DRAFT', launchDraft: cleanDraft };
  const path = state.lastDraftId ? `/v1/builder/drafts/${encodeURIComponent(state.lastDraftId)}` : '/v1/builder/drafts';
  state.draftSavePromise = read(path, {
    method: state.lastDraftId ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': state.csrfToken || sessionStorage.getItem('nex_csrf') || '' },
    body: JSON.stringify(payload)
  }).then((project) => {
    state.lastDraftId = project.content?.draftId || project.launchDraft?.draftId || draftId;
    state.lastSavedProject = project;
    return project;
  }).finally(() => { state.draftSavePromise = null; });
  return state.draftSavePromise;
}
function scheduleCreateDraftAutosave() {
  if (!state.authenticated || !state.wallet) return;
  clearTimeout(createAutosaveTimer);
  createAutosaveTimer = setTimeout(() => autosaveCreateDraft().catch((error) => showRuntimeBanner(`Draft autosave failed: ${error.message}`, true)), 700);
}
function installCreateDraftAutosave() {
  const notify = (event) => { if (event.target?.closest?.('#create')) scheduleCreateDraftAutosave(); };
  document.addEventListener('input', notify, true);
  document.addEventListener('change', notify, true);
  window.__nmV2AutosaveCreateDraft = autosaveCreateDraft;
  // The supplied HTML still exposes its original localStorage-backed
  // saveCreateDraft function.  Replace that write path after the template has
  // loaded so authenticated drafts have one authority: the API draft record.
  window.saveCreateDraft = function serverBackedCreateDraftSave(immediate = false) {
    const status = document.getElementById('createSaveStatus');
    if (!state.authenticated || !state.wallet) {
      if (status) {
        status.textContent = 'Connect to save draft';
        status.classList.remove('saving');
        status.classList.add('error');
      }
      return null;
    }
    if (status) {
      status.textContent = 'Saving to NexMarkets…';
      status.classList.add('saving');
      status.classList.remove('error');
    }
    const save = () => autosaveCreateDraft().then((result) => {
      if (status) {
        status.textContent = 'Draft saved';
        status.classList.remove('saving', 'error');
      }
      return result;
    }).catch((error) => {
      if (status) {
        status.textContent = 'Draft save failed';
        status.classList.remove('saving');
        status.classList.add('error');
      }
      showRuntimeBanner(`Draft autosave failed: ${error.message}`, true);
      throw error;
    });
    if (immediate) return save();
    scheduleCreateDraftAutosave();
    return null;
  };
}

const pendingArtworkFiles = new Map();
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

function inferredMediaType(file) {
  const explicit = String(file?.type || '').toLowerCase();
  if (ALLOWED_MEDIA_TYPES.has(explicit)) return explicit;
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' })[extension] || '';
}

async function fileSha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function uploadMediaFile(file) {
  const mimeType = inferredMediaType(file);
  if (!ALLOWED_MEDIA_TYPES.has(mimeType)) throw new Error('Choose a PNG, JPG, WebP or AVIF image');
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error('Image must be between 1 byte and 25 MB');
  await requireSession();
  const checksum = await fileSha256(file);
  const prepared = await read('/v1/media/uploads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': state.csrfToken || sessionStorage.getItem('nex_csrf') || ''
    },
    body: JSON.stringify({ filename: file.name, mimeType, byteSize: file.size, sha256: checksum })
  });
  if (!prepared?.asset?.id) throw new Error('MEDIA_PREPARATION_INCOMPLETE');
  if (prepared.upload) {
    const response = await fetch(prepared.upload.url, {
      method: prepared.upload.method || 'PUT',
      headers: prepared.upload.headers || { 'content-type': mimeType },
      body: file
    });
    if (!response.ok) throw new Error(`MEDIA_UPLOAD_${response.status}`);
  }
  const completed = prepared.upload
    ? await mutation(`/v1/media/${encodeURIComponent(prepared.asset.id)}/complete`, {})
    : prepared;
  const asset = completed?.asset || prepared.asset;
  if (!asset?.url || asset.safetyStatus !== 'APPROVED') throw new Error('MEDIA_VERIFICATION_INCOMPLETE');
  return asset;
}

function createDataValue() {
  return window.__nmV2GetCreateData?.() || {};
}

function updateCreateData(patch, render = true) {
  return window.__nmV2UpdateCreateData?.(patch, { render });
}

async function uploadCreateAsset(file, type) {
  const previous = createDataValue();
  const previewUrl = URL.createObjectURL(file);
  showRuntimeBanner(`Uploading ${file.name}â€¦`);
  try {
    let logoPresentation = null;
    if (type === 'logo') {
      logoPresentation = await Promise.allSettled([
        window.deriveLogoColor?.(previewUrl),
        window.nmDeriveLogoPalette?.(previewUrl)
      ]);
    }
    const asset = await uploadMediaFile(file);
    if (type === 'logo') {
      const color = logoPresentation?.[0]?.status === 'fulfilled' ? logoPresentation[0].value : previous.color;
      const palette = logoPresentation?.[1]?.status === 'fulfilled' ? logoPresentation[1].value : previous.bannerPalette;
      updateCreateData({
        logoSrc: asset.url,
        logoAssetId: asset.id,
        ...(previous.themeMode === 'auto' && color ? { color, customColor: color } : {}),
        ...(!previous.bannerSrc && Array.isArray(palette) ? { bannerPalette: palette } : {})
      });
    } else if (type === 'banner') {
      updateCreateData({ bannerSrc: asset.url, bannerAssetId: asset.id });
    } else {
      updateCreateData({ artSrc: asset.url, artAssetId: asset.id, artX: 50, artY: 50 });
    }
    showRuntimeBanner(`${file.name} uploaded and verified`);
    return asset;
  } catch (error) {
    showRuntimeBanner(`Upload failed: ${error.message}`, true);
    throw error;
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

function sortAndMapArtwork(entries) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const supply = Math.max(1, Number(createDataValue().supply || 1));
  return entries.slice().sort((left, right) => collator.compare(left.filename || '', right.filename || '')).map((entry, index) => ({ ...entry, serial: index < supply ? index + 1 : null }));
}

function decorateArtworkUploadFailures() {
  const mount = document.getElementById('artEditionMode');
  if (!mount) return;
  mount.querySelector('.nm-media-upload-failures')?.remove();
  const failed = (createDataValue().artEdition || []).map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.uploadError);
  if (!failed.length) return;
  const panel = document.createElement('div');
  panel.className = 'nm-media-upload-failures';
  panel.innerHTML = failed.map(({ entry, index }) => `<div><span><b>${escapeHtml(entry.filename)}</b><small>${escapeHtml(entry.uploadError)}</small></span><button type="button" data-retry-artwork="${index}">Retry</button></div>`).join('');
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-retry-artwork]');
    if (button) retryArtworkUpload(Number(button.dataset.retryArtwork)).catch(() => {});
  });
  mount.prepend(panel);
}

async function uploadArtworkFiles(files, label = 'files') {
  const accepted = Array.from(files || []).filter((file) => ALLOWED_MEDIA_TYPES.has(inferredMediaType(file)));
  if (!accepted.length) {
    window.showCreateErrors?.(['No supported PNG, JPG, WebP or AVIF artwork was found.']);
    return [];
  }
  const existing = Array.isArray(createDataValue().artEdition) ? createDataValue().artEdition.slice() : [];
  const results = new Array(accepted.length);
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < accepted.length) {
      const index = cursor++;
      const file = accepted[index];
      const uploadToken = `upload-${uuid()}`;
      pendingArtworkFiles.set(uploadToken, file);
      try {
        const asset = await uploadMediaFile(file);
        results[index] = {
          assetKey: asset.id,
          assetId: asset.id,
          filename: file.webkitRelativePath || file.name,
          title: String(file.name).replace(/\.[^.]+$/, ''),
          type: asset.mimeType,
          size: asset.byteSize,
          sha256: asset.sha256,
          width: asset.width,
          height: asset.height,
          src: asset.url,
          url: asset.url,
          serial: null
        };
        pendingArtworkFiles.delete(uploadToken);
      } catch (error) {
        const previewUrl = URL.createObjectURL(file);
        results[index] = { uploadToken, filename: file.webkitRelativePath || file.name, title: String(file.name).replace(/\.[^.]+$/, ''), type: inferredMediaType(file), size: file.size, src: previewUrl, serial: null, uploadError: error.message };
      } finally {
        completed += 1;
        showRuntimeBanner(`Uploading ${label}: ${completed} / ${accepted.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, accepted.length) }, () => worker()));
  const all = sortAndMapArtwork([...existing, ...results.filter(Boolean)]);
  const seen = new Map();
  for (const entry of all) {
    if (!entry.sha256) continue;
    if (seen.has(entry.sha256)) entry.duplicateOf = seen.get(entry.sha256);
    else seen.set(entry.sha256, entry.filename);
  }
  updateCreateData({ artMode: 'collection', artEdition: all, artEditionSelected: 0 });
  setTimeout(decorateArtworkUploadFailures, 0);
  const failures = all.filter((entry) => entry.uploadError);
  const duplicates = all.filter((entry) => entry.duplicateOf);
  if (failures.length) window.showCreateErrors?.(failures.map((entry) => `${entry.filename}: ${entry.uploadError}`));
  else if (duplicates.length) window.showCreateErrors?.(duplicates.map((entry) => `${entry.filename} duplicates ${entry.duplicateOf}. Review this serial mapping before Publish.`));
  else showRuntimeBanner(`${accepted.length} artworks uploaded, verified and mapped`);
  return all;
}

async function retryArtworkUpload(index) {
  const entries = Array.isArray(createDataValue().artEdition) ? createDataValue().artEdition.slice() : [];
  const failed = entries[index];
  const file = pendingArtworkFiles.get(failed?.uploadToken);
  if (!failed || !file) throw new Error('Select this file again to retry the upload');
  showRuntimeBanner(`Retrying ${file.name}â€¦`);
  try {
    const asset = await uploadMediaFile(file);
    if (failed.src?.startsWith('blob:')) URL.revokeObjectURL(failed.src);
    entries[index] = { assetKey: asset.id, assetId: asset.id, filename: failed.filename, title: failed.title, type: asset.mimeType, size: asset.byteSize, sha256: asset.sha256, width: asset.width, height: asset.height, src: asset.url, url: asset.url, serial: failed.serial };
    pendingArtworkFiles.delete(failed.uploadToken);
    updateCreateData({ artEdition: entries });
    showRuntimeBanner(`${file.name} uploaded and verified`);
    return asset;
  } catch (error) {
    entries[index] = { ...failed, uploadError: error.message };
    updateCreateData({ artEdition: entries });
    setTimeout(decorateArtworkUploadFailures, 0);
    throw error;
  }
}

function installMediaRuntime() {
  window.__nmV2UploadCreateAsset = uploadCreateAsset;
  window.__nmV2UploadArtworkFiles = uploadArtworkFiles;
  window.nmRetryArtworkUpload = retryArtworkUpload;
  window.nmElitePreviewBuilderAvatar = async (input) => {
    const file = input?.files?.[0];
    if (!file) return null;
    try {
      const asset = await uploadMediaFile(file);
      const hidden = document.getElementById('ebdAvatar');
      const preview = document.getElementById('ebdAvatarPreview');
      if (hidden) hidden.value = asset.url;
      if (preview) preview.innerHTML = `<img src="${escapeHtml(asset.url)}" alt="">`;
      showRuntimeBanner(`${file.name} uploaded and verified`);
      return asset;
    } catch (error) {
      input.value = '';
      showRuntimeBanner(`Avatar upload failed: ${error.message}`, true);
      return null;
    }
  };
}
function slugBuilderValue(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function builderProfileForKey(key) {
  const wanted = String(key || '').toLowerCase();
  for (const profile of state.builderProfiles.values()) {
    const links = profile?.links && typeof profile.links === 'object' ? profile.links : {};
    const candidates = [profile.builder_id, profile.builderId, profile.account_id, profile.accountId, profile.id, profile.wallet_address, profile.walletAddress, profile.display_name, profile.displayName, profile.handle, links.handle];
    if (candidates.some((value) => String(value || '').toLowerCase() === wanted || slugBuilderValue(value) === slugBuilderValue(wanted))) return profile;
  }
  for (const experience of Object.values(state.projectExperience || {})) {
    if (slugBuilderValue(experience.builder) === slugBuilderValue(wanted) || slugBuilderValue(experience.builderHandle) === slugBuilderValue(wanted)) {
      return state.builderProfiles.get(lower(experience.builderId)) || { account_id: experience.builderId, display_name: experience.builder, links: { handle: experience.builderHandle } };
    }
  }
  return null;
}
function builderIdForKey(key) {
  const managed = managedBuilderForKey(key);
  if (managed) return managed.id || managed.builder_id;
  const profile = builderProfileForKey(key);
  return profile?.builder_id || profile?.builderId || profile?.account_id || profile?.accountId || profile?.id || profile?.wallet_address || profile?.walletAddress || null;
}
function managedBuilderForKey(key) {
  const wanted = lower(key);
  return state.managedBuilders.find((row) => lower(row.id || row.builder_id) === wanted || lower(row.profile?.id) === wanted || lower(row.profile?.builder_id) === wanted) || null;
}
function managedBuilderProjectViews(key) {
  const builder = managedBuilderForKey(key);
  if (!builder || lower(state.selectedBuilderId) !== lower(builder.id || builder.builder_id)) return [];
  const profile = builder.profile || {};
  const experience = {
    builder: profile.display_name || profile.displayName || 'Builder',
    builderHandle: profile.links?.handle || '',
    about: profile.about || profile.bio || '',
    builderId: builder.id || builder.builder_id,
    compiledLaunch: null
  };
  return (state.builderDashboard.projects || []).map((row) => {
    const draft = row.content || row.launchDraft || {};
    const project = draft.project || {};
    const edition = draft.edition || {};
    const compiledLaunch = { ...draft, status: row.status || draft.status || 'DRAFT' };
    const viewExperience = { ...experience, compiledLaunch, edition: edition.name || '' };
    return {
      __nmExperience: viewExperience,
      __nmBuilderId: builder.id || builder.builder_id,
      name: row.name || project.name || edition.name || 'Untitled Project',
      desc: row.summary || project.desc || project.about || '',
      category: project.category || '',
      state: String(row.status || '').toUpperCase() === 'PUBLISHED' ? 'preview' : 'preview',
      supply: number(edition.supply),
      price: usd(edition.price),
      color: draft.design?.color || '#34483a',
      logo: draft.design?.logoSrc || '',
      slug: row.slug,
      status: row.status
    };
  });
}
function managedBuilderStats(key) {
  const builder = managedBuilderForKey(key);
  if (!builder) return null;
  const selected = lower(state.selectedBuilderId) === lower(builder.id || builder.builder_id);
  const profile = builder.profile || {};
  const stats = profile.stats || {};
  if (selected) {
    const launches = state.templateData?.dashboardState?.launches || [];
    const issued = launches.reduce((total, launch) => total + number(launch.minted), 0);
    const activeListings = state.templateData?.dashboardState?.listings?.length || 0;
    return { editions: launches.length, issued, primary: number(state.templateData?.dashboardState?.earnings?.primaryProceeds), activeListings };
  }
  return { editions: number(stats.editionsCount ?? builder.editionsCount), issued: number(stats.passesIssued ?? builder.passesIssued), primary: usd(stats.totalVolumeUsdg ?? builder.totalVolumeUsdg), activeListings: 0 };
}
function socialEntryForBuilder(builderId) {
  if (!builderId) return null;
  let entry = state.builderSocial.get(builderId);
  if (!entry) {
    const profile = state.builderProfiles.get(lower(builderId)) || builderProfileForKey(builderId) || {};
    entry = { profile, updates: [], questions: [], follow: { isFollowing: false, isHolder: false, followerCount: 0 } };
    state.builderSocial.set(builderId, entry);
  }
  return entry;
}
function installSocialRuntime() {
  window.__nmBuilderProjectsForKey = managedBuilderProjectViews;
  window.__nmBuilderStatsForKey = managedBuilderStats;
  window.nmEliteBuilderProfileForKey = (key) => {
    const profile = builderProfileForKey(key);
    if (!profile) return { key, displayName: key || 'Builder', handle: '', tagline: '', about: '', website: '', x: '', avatar: '' };
    const links = profile.links && typeof profile.links === 'object' ? profile.links : {};
    return {
      key,
      displayName: profile.display_name || profile.displayName || key || 'Builder',
      handle: links.handle || profile.handle || '',
      tagline: links.positioning || profile.positioning || '',
      about: profile.about || profile.bio || '',
      website: links.website || '',
      x: links.x || links.twitter || '',
      avatar: profile.avatar_url || profile.avatarUrl || ''
    };
  };
  window.nmSocialBuilderApi = {
    updates: (key) => {
      const entry = socialEntryForBuilder(builderIdForKey(key));
      return (entry?.updates || []).map((row) => ({ id: row.id, text: row.content || row.text || '', ts: row.created_at || row.createdAt || row.ts }));
    },
    questions: (key) => {
      const entry = socialEntryForBuilder(builderIdForKey(key));
      return (entry?.questions || []).map((row) => ({ id: row.id, who: row.asker_account_id ? 'Holder' : row.who || 'Holder', holder: true, q: row.question || row.q || '', a: row.answer || row.a || '', ts: row.created_at || row.createdAt || row.ts }));
    },
    holds: (key) => Boolean(socialEntryForBuilder(builderIdForKey(key))?.follow?.isHolder),
    isFollowing: (key) => Boolean(socialEntryForBuilder(builderIdForKey(key))?.follow?.isFollowing),
    toggleFollow: async (key) => {
      try {
        await requireSession();
        const builderId = builderIdForKey(key); if (!builderId) throw new Error('BUILDER_NOT_FOUND');
        const entry = socialEntryForBuilder(builderId);
        const result = await read(`/v1/builders/${encodeURIComponent(builderId)}/follow`, {
          method: entry.follow.isFollowing ? 'DELETE' : 'POST',
          headers: { 'x-csrf-token': state.csrfToken || sessionStorage.getItem('nex_csrf') || '' }
        });
        entry.follow = { ...entry.follow, ...result, isFollowing: !entry.follow.isFollowing };
        window.nmSocialRefresh?.();
        return result;
      } catch (error) { showRuntimeBanner(error.message, true); return null; }
    },
    addUpdate: async (key, textValue) => {
      try {
        await requireSession();
        const builderId = builderIdForKey(key); if (!builderId) throw new Error('BUILDER_NOT_FOUND');
        const row = await mutation('/v1/builder/milestones', { builderId, title: 'Builder update', content: String(textValue || '').trim(), projectId: null });
        socialEntryForBuilder(builderId)?.updates.unshift(row);
        showToast('Update posted'); window.nmSocialRefresh?.(); return true;
      } catch (error) { showRuntimeBanner(error.message, true); return false; }
    },
    ask: async (key, textValue) => {
      try {
        await requireSession();
        const builderId = builderIdForKey(key); if (!builderId) throw new Error('BUILDER_NOT_FOUND');
        const row = await mutation(`/v1/builders/${encodeURIComponent(builderId)}/questions`, { question: String(textValue || '').trim() });
        socialEntryForBuilder(builderId)?.questions.unshift(row);
        showToast('Question sent to the Builder'); window.nmSocialRefresh?.(); return true;
      } catch (error) { showRuntimeBanner(error.message, true); return false; }
    },
    answer: async (key, questionId, textValue) => {
      try {
        await requireSession();
        const builderId = builderIdForKey(key); if (!builderId) throw new Error('BUILDER_NOT_FOUND');
        const row = await mutation(`/v1/builder/questions/${encodeURIComponent(questionId)}/answer`, { answer: String(textValue || '').trim() });
        const entry = socialEntryForBuilder(builderId); const index = entry?.questions.findIndex((question) => question.id === questionId);
        if (entry && index >= 0) entry.questions[index] = row;
        showToast('Answer posted'); window.nmSocialRefresh?.(); return true;
      } catch (error) { showRuntimeBanner(error.message, true); return false; }
    }
  };
  // The older launch-page decoration calls these names directly. Point those
  // reads at the same live API projection so project pages cannot fall back to
  // the template's seeded social arrays.
  window.nmSocialUpdates = (key) => window.nmSocialBuilderApi.updates(key);
  window.nmSocialQuestions = (key) => window.nmSocialBuilderApi.questions(key);
  window.nmHoldsBuilder = (key) => window.nmSocialBuilderApi.holds(key);
  // Dashboard rendering is intentionally reused by responsive/layout layers.
  // Preserve an in-progress Builder profile edit across those synchronous
  // rerenders so a viewport capture or other harmless refresh cannot replace
  // the user's live form with the last persisted profile.
  const profileFieldIds = ['ebdName', 'ebdHandle', 'ebdTagline', 'ebdAbout', 'ebdWebsite', 'ebdX', 'ebdAvatar'];
  const captureBuilderProfileDraft = () => {
    const panel = document.getElementById('dash-builder');
    const save = panel?.querySelector('[data-nm-builder-profile-save]');
    if (!panel || !save) return null;
    return { key: save.dataset.nmBuilderProfileSave || '', values: Object.fromEntries(profileFieldIds.map((id) => [id, document.getElementById(id)?.value ?? ''])) };
  };
  const restoreBuilderProfileDraft = (draft) => {
    if (!draft) return;
    const save = document.querySelector('#dash-builder [data-nm-builder-profile-save]');
    if (!save || (draft.key && save.dataset.nmBuilderProfileSave !== draft.key)) return;
    profileFieldIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element && draft.values[id] != null) element.value = draft.values[id];
    });
  };
  const dashboardRender = window.renderDashboard;
  if (typeof dashboardRender === 'function' && !dashboardRender.__nmBuilderProfileDraftPreserving) {
    const preservingDashboardRender = function preservingDashboardRender(...args) {
      const draft = captureBuilderProfileDraft();
      const result = dashboardRender.apply(this, args);
      restoreBuilderProfileDraft(draft);
      if (draft) requestAnimationFrame(() => restoreBuilderProfileDraft(draft));
      syncDashboardAccount();
      requestAnimationFrame(syncDashboardAccount);
      return result;
    };
    preservingDashboardRender.__nmBuilderProfileDraftPreserving = true;
    preservingDashboardRender.__nmOriginalRenderDashboard = dashboardRender;
    window.renderDashboard = preservingDashboardRender;
    try { renderDashboard = preservingDashboardRender; } catch { /* global binding may be unavailable */ }
  }
  const saveBuilderProfile = async (key) => {
    const value = (id) => String(document.getElementById(id)?.value || '').trim();
    const form = {
      displayName: value('ebdName'), handle: value('ebdHandle'), positioning: value('ebdTagline'),
      about: value('ebdAbout'), website: value('ebdWebsite'), x: value('ebdX'), avatarUrl: value('ebdAvatar')
    };
    try {
      await requireSession();
      const builderId = builderIdForKey(key);
      if (!builderId) throw new Error('BUILDER_NOT_FOUND');
      const profile = await read('/v1/builder/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': state.csrfToken || sessionStorage.getItem('nex_csrf') || '' },
        body: JSON.stringify({ builderId, ...form })
      });
      const accountId = profile.account_id || profile.accountId || state.wallet;
      const canonicalBuilderId = lower(profile.builder_id || profile.builderId || builderId);
      [accountId, profile.id, canonicalBuilderId].filter(Boolean).forEach((keyValue) => state.builderProfiles.set(lower(keyValue), { ...profile, builder_id: canonicalBuilderId }));
      const managed = state.managedBuilders.find((row) => lower(row.id || row.builder_id) === canonicalBuilderId);
      if (managed) managed.profile = { ...profile, builder_id: canonicalBuilderId };
      state.builderSocial.set(canonicalBuilderId, { ...(state.builderSocial.get(canonicalBuilderId) || {}), profile });
      showToast('Builder profile updated'); window.nmSocialRefresh?.(); window.renderDashboard?.(); return profile;
    } catch (error) { showRuntimeBanner(error.message, true); return null; }
  };
  // The authority document intentionally installs a late wrapper so profile
  // edits never fall back to its historical browser store. Expose the live
  // callback under both names regardless of module/inline execution order.
  window.__nmV2SaveBuilderProfile = saveBuilderProfile;
  window.nmEliteSaveBuilderProfile = saveBuilderProfile;
  if (!window.__nmV2BuilderProfileSaveWired) {
    window.__nmV2BuilderProfileSaveWired = true;
    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-nm-builder-profile-save]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      saveBuilderProfile(button.dataset.nmBuilderProfileSave || state.selectedBuilderId);
    }, true);
  }
  window.nmEliteSetDashboardBuilder = async (key) => {
    try { await requireSession(); await selectBuilder(key); window.renderDashboard?.(); return true; }
    catch (error) { showRuntimeBanner(error.message, true); return false; }
  };

  // The authority HTML predates the live API and treats these callbacks as
  // synchronous.  Keep its visual surfaces, but make every social mutation
  // await the server result before clearing fields or re-rendering.
  const refreshSocialSurfaces = () => {
    try { window.nmSocialRefresh?.(); } catch { /* surface refresh is best effort */ }
    try { window.nmRenderBuilderPage?.(); } catch { /* surface refresh is best effort */ }
    try { window.renderDashboard?.(); } catch { /* surface refresh is best effort */ }
  };
  const askWithInput = async (key, id) => {
    const element = document.getElementById(id);
    if (!element || !String(element.value || '').trim()) return null;
    const result = await window.nmSocialBuilderApi.ask(key, element.value, 'You');
    if (result) { element.value = ''; refreshSocialSurfaces(); }
    return result;
  };
  const answerWithInput = async (key, id, inputId) => {
    const element = document.getElementById(inputId);
    if (!element || !String(element.value || '').trim()) return null;
    const result = await window.nmSocialBuilderApi.answer(key, id, element.value);
    if (result) { element.value = ''; refreshSocialSurfaces(); }
    return result;
  };
  window.nmEliteToggleBuilderFollow = async (key) => {
    const result = await window.nmSocialBuilderApi.toggleFollow(key);
    if (result) refreshSocialSurfaces();
    return result;
  };
  window.nmEliteAskBuilder = (key) => askWithInput(key, 'ebpQuestionInput');
  window.nmEliteDashboardPost = async (key) => {
    const element = document.getElementById('ebdUpdate');
    if (!element || !String(element.value || '').trim()) return null;
    const result = await window.nmSocialBuilderApi.addUpdate(key, element.value);
    if (result) { element.value = ''; refreshSocialSurfaces(); }
    return result;
  };
  window.nmEliteDashboardAnswer = (key, id) => answerWithInput(key, id, `ebdAns_${id}`);
  // Keep the older launch/profile surfaces on the same API authority too.
  window.nmToggleBuilderFollow = window.nmEliteToggleBuilderFollow;
  window.nmSubmitBuilderUpdate = async (key) => {
    const element = document.getElementById('nmBpUpdateText');
    if (!element || !String(element.value || '').trim()) return null;
    const result = await window.nmSocialBuilderApi.addUpdate(key, element.value);
    if (result) { element.value = ''; refreshSocialSurfaces(); }
    return result;
  };
  window.nmSubmitBpQuestion = (key) => askWithInput(key, 'nmBpQuestionText');
  window.nmSubmitProjectQuestion = (key) => askWithInput(key, 'nmQaText');
  window.nmSubmitAnswer = (key, id) => answerWithInput(key, id, `nmAns-${id}`);
}
function setAccountLabel(value) {
  const isConnected = Boolean(state.wallet);
  const displayLabel = isConnected ? (value || short(state.wallet)) : 'Connect wallet';
  // The approved V2 header owns the visible account affordance.  Keep the
  // wallet address out of the primary control; it remains available through
  // the account/dashboard surfaces and this non-visual compatibility anchor.
  if (window.nmJourneyState) {
    window.nmJourneyState.walletConnected = isConnected;
    window.nmJourneyState.signedIn = Boolean(state.authenticated);
  }
  if (typeof window.nmRenderAccountChip === 'function') window.nmRenderAccountChip();
  document.querySelectorAll('#nmAccountChip, #nmMobileAccountChip').forEach((chip) => {
    let compatibility = chip.querySelector('.account-label');
    if (!compatibility) {
      compatibility = document.createElement('span');
      compatibility.className = 'account-label';
      compatibility.setAttribute('aria-hidden', 'true');
      compatibility.style.display = 'none';
      chip.appendChild(compatibility);
    }
    compatibility.textContent = isConnected ? displayLabel : '';
  });
  document.querySelectorAll('.account-chip').forEach((chip) => {
    const element = chip.querySelector('.account-label') || [...chip.querySelectorAll('span')].find((candidate) => !candidate.classList.contains('account-dot'));
    if (element) element.textContent = displayLabel;
    chip.dataset.connected = isConnected ? 'true' : 'false';
    chip.setAttribute('role', 'button'); chip.setAttribute('tabindex', '0');
    chip.setAttribute('aria-label', isConnected ? `Connected wallet ${displayLabel}` : 'Connect wallet');
  });
  syncDashboardAccount();
}

let dashboardObserver = null;
function ensureDashboardObserver() {
  if (dashboardObserver || typeof document === 'undefined') return;
  const dash = document.getElementById('dashboard');
  if (!dash) return;
  dashboardObserver = new MutationObserver(() => {
    syncDashboardAccount();
  });
  dashboardObserver.observe(dash, { childList: true, subtree: true });
}

function syncDashboardAccount() {
  ensureDashboardObserver();
  const isConnecting = Boolean(state.connecting);
  const isConnected = Boolean(state.wallet);
  const shortAddr = isConnected ? short(state.wallet) : (isConnecting ? 'Connecting...' : 'Connect wallet');
  const avatarText = isConnected ? state.wallet.slice(2, 4).toUpperCase() : (isConnecting ? '..' : '--');
  const passCount = state.templateData?.ownedPasses?.length || 0;
  const launchCount = state.templateData?.dashboardState?.launches?.length || 0;

  // 1. Dashboard workspace wallet text and legacy dash-person
  document.querySelectorAll('#dashboard .dash-person b, #dashboard .p10-wallet b').forEach((el) => {
    const desired = isConnected ? shortAddr : (isConnecting ? 'Connecting...' : 'Connect wallet');
    if (el.textContent !== desired) el.textContent = desired;
    if (isConnected) el.title = state.wallet;
    else el.removeAttribute('title');
  });

  // 2. Dashboard avatar
  document.querySelectorAll('#dashboard .dash-person .avatar, #dashboard .p10-avatar').forEach((el) => {
    const desired = isConnected ? avatarText : (isConnecting ? '..' : '--');
    if (el.textContent !== desired) el.textContent = desired;
    if (isConnected) el.title = state.wallet;
    else el.removeAttribute('title');
  });

  // 3. Connected button in dashboard header
  document.querySelectorAll('#dashboard .p10-connected').forEach((el) => {
    const desiredConnected = isConnected ? 'true' : 'false';
    if (el.dataset.connected !== desiredConnected) el.dataset.connected = desiredConnected;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    const span = el.querySelector('span');
    const dot = el.querySelector('i');
    let desiredText = 'Connect wallet';
    if (isConnecting) desiredText = state.connectingMessage || 'Connecting...';
    else if (isConnected) desiredText = state.authenticated ? 'Wallet connected' : 'Sign in with wallet';
    if (span && span.textContent !== desiredText) span.textContent = desiredText;
    if (dot) {
      if (isConnecting) {
        dot.className = 'nm-spinner';
        dot.style.background = 'transparent';
        dot.style.boxShadow = 'none';
      } else {
        dot.className = '';
        dot.style.background = isConnected ? (state.authenticated ? '#74b27d' : '#ffb000') : '#6f766d';
        dot.style.boxShadow = isConnected ? (state.authenticated ? '0 0 0 4px rgba(116,178,125,.18)' : '0 0 0 4px rgba(255,176,0,.18)') : 'none';
      }
    }
    el.setAttribute('aria-label', desiredText);
  });

  // 4. Meta line (Passes / Debuts)
  document.querySelectorAll('#dashboard #dashAccountMeta').forEach((el) => {
    if (!isConnected) {
      if (el.textContent !== '0 Passes') el.textContent = '0 Passes';
    } else {
      const desired = `${passCount} Pass${passCount === 1 ? '' : 'es'}${launchCount ? ` · ${launchCount} Debut${launchCount === 1 ? '' : 's'}` : ''}`;
      if (el.textContent !== desired) el.textContent = desired;
    }
  });

  // 5. Settings tab rows
  document.querySelectorAll('#dash-settings .nm-set-row').forEach((row) => {
    const span = row.querySelector('span');
    const b = row.querySelector('b');
    if (!span || !b) return;
    if (span.textContent.includes('Connected wallet for this account')) {
      const desired = isConnected ? shortAddr : 'Not connected';
      if (b.textContent !== desired) b.textContent = desired;
    } else if (span.textContent.includes('Sign out returns you to the public site')) {
      const desired = isConnected ? `Signed in as ${shortAddr}` : 'Not signed in';
      if (b.textContent !== desired) b.textContent = desired;
    }
  });

  // 6. Global template wallet variables
  if (typeof window !== 'undefined') {
    window.nmWalletShort = isConnected ? shortAddr : 'Connect wallet';
    window.CURRENT_WALLET = isConnected ? shortAddr : '0x21B…7A19';
  }
}
function publishTemplateData(data) {
  state.templateData = data;
  let published = false;
  const apply = () => {
    if (published || typeof window.__nmV2SetData !== 'function') return published;
    window.__nmV2SetData(data);
    published = true;
    return true;
  };
  if (apply()) {
    setTimeout(() => {
      if (typeof window.__nmV2SetData === 'function') window.__nmV2SetData(data);
    }, 60);
    return;
  }
  // The supplied document is a large classic-script template.  Keep the
  // adapter resilient to a module/classic-script scheduling difference by
  // retrying until its bridge has been installed.
  [0, 50, 200, 750].forEach((delay) => setTimeout(apply, delay));
  addEventListener('DOMContentLoaded', apply, { once: true });
  addEventListener('load', apply, { once: true });
}
function showRuntimeBanner(message, error = false) {
  let banner = document.getElementById('nm-v2-runtime-banner');
  if (!banner) {
    banner = document.createElement('div'); banner.id = 'nm-v2-runtime-banner';
    banner.style.cssText = 'position:fixed;left:16px;right:16px;bottom:18px;z-index:9999;padding:11px 14px;border:1px solid rgba(255,176,0,.28);border-radius:10px;background:rgba(13,16,14,.96);color:#d7ddd4;font:12px/1.4 system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35)';
    document.body.appendChild(banner);
  }
  banner.dataset.error = error ? 'true' : 'false'; banner.textContent = message;
  if (!error) setTimeout(() => banner.remove(), 2600);
}
function cdpSettings() {
  const settings = state.runtimeConfig?.auth?.cdp || state.config?.auth?.cdp;
  return settings && typeof settings === 'object' ? settings : null;
}
function cdpLoginAvailable() {
  const settings = cdpSettings();
  return Boolean(String(settings?.projectId || '').trim())
    && activeNetworkFamily() === 'base'
    && Number(state.config?.chainId || CHAIN_ID) === CHAIN_ID
    && (!settings.network || settings.network === DEFAULT_NETWORK_KEY);
}
function ensureCdpRoot() {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById('nm-cdp-auth-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'nm-cdp-auth-root';
    root.style.display = 'contents';
    document.body.appendChild(root);
  }
  return root;
}
function settleCdpWaiters(method, value) {
  [...cdpConnectionWaiters].forEach((waiter) => waiter[method](value));
}
function handleCdpState(next) {
  if (next?.error) {
    settleCdpWaiters('reject', next.error);
    return;
  }
  const connected = Boolean(next?.isSignedIn && address(next.address) && next.provider?.request);
  if (connected) {
    cdpSession = { address: address(next.address), chainId: CHAIN_ID, provider: next.provider };
    settleCdpWaiters('resolve', cdpSession);
    return;
  }
  if (walletMode === 'cdp' && cdpSession) {
    cdpSession = null;
    walletMode = null;
    state.wallet = null;
    state.authenticated = false;
    state.csrfToken = null;
    sessionStorage.removeItem('nex_csrf');
    setAccountLabel('Connect wallet');
    ensureNetworkSelectors();
    void hydrate();
  }
}
async function initCdpAuth() {
  if (!cdpLoginAvailable()) {
    if (!String(cdpSettings()?.projectId || '').trim()) throw new Error('CDP_PROJECT_ID_REQUIRED');
    throw new Error('CDP_BASE_SEPOLIA_ONLY');
  }
  if (cdpControls) return cdpControls;
  if (cdpInitPromise) return cdpInitPromise;
  const settings = cdpSettings();
  cdpInitPromise = (async () => {
    const { mountCdpAuth } = await import('./cdp-auth-bridge.mjs');
    const controls = await mountCdpAuth({
      root: ensureCdpRoot(),
      projectId: settings.projectId,
      chainId: Number(state.config.chainId),
      rpcUrl: state.config.rpcUrl,
      onState: handleCdpState,
      onError: (error) => { showRuntimeBanner(error.message, true); }
    });
    controls.onModalClosed = () => {
      if (!cdpSession && !controls.signInCompleted) settleCdpWaiters('reject', new Error('CDP_AUTH_CANCELLED'));
    };
    cdpControls = controls;
    return controls;
  })();
  try { return await cdpInitPromise; }
  catch (error) { cdpInitPromise = null; throw error; }
}
function waitForCdpConnection({ timeoutMs = 120_000 } = {}) {
  if (cdpSession?.address && cdpSession.provider?.request) return Promise.resolve(cdpSession);
  let waiter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cdpConnectionWaiters.delete(waiter);
      reject(new Error('CDP_AUTH_TIMEOUT'));
    }, timeoutMs);
    waiter = {
      resolve: (value) => { clearTimeout(timer); cdpConnectionWaiters.delete(waiter); resolve(value); },
      reject: (error) => { clearTimeout(timer); cdpConnectionWaiters.delete(waiter); reject(error); }
    };
    cdpConnectionWaiters.add(waiter);
  });
}
async function connectCdpFromUi() {
  const controls = await initCdpAuth();
  if (!cdpSession) await controls.openSignInModal();
  try {
    const session = await waitForCdpConnection();
    cdpSession = session;
    walletMode = 'cdp';
    wallet.setProvider(session.provider);
    return authenticateOnce();
  } catch (error) {
    if (error.message === 'CDP_AUTH_CANCELLED') return null;
    throw error;
  }
}
function chooseAuthMethod() {
  if (!cdpLoginAvailable()) return Promise.resolve('wallet');
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'nm-auth-choice';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `<div data-auth-choice-panel style="width:min(420px,calc(100vw - 32px));padding:24px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:#151916;box-shadow:0 24px 80px rgba(0,0,0,.58);color:#f1f3ee;font:14px/1.45 system-ui,sans-serif"><div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#aeb9aa">NexMarkets access</div><h2 style="margin:8px 0 6px;font:600 24px/1.1 Georgia,serif">Choose how to continue</h2><p style="margin:0 0 18px;color:#aeb9aa">Use an external wallet or sign in with a social account.</p><div style="display:grid;gap:10px"><button type="button" data-auth-choice="wallet" style="padding:12px 14px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:#f2efe6;color:#151713;font-weight:650;cursor:pointer">Connect external wallet</button><button type="button" data-auth-choice="cdp" style="padding:12px 14px;border:1px solid rgba(255,176,0,.48);border-radius:10px;background:#ffb000;color:#151713;font-weight:650;cursor:pointer">Sign in with Google, Apple or X</button><button type="button" data-auth-choice="cancel" style="padding:10px 14px;border:0;background:transparent;color:#aeb9aa;cursor:pointer">Cancel</button></div></div>`;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:16px;background:rgba(4,6,5,.72);backdrop-filter:blur(8px)';
    document.body.appendChild(overlay);
    const finish = (choice) => { cleanup(); overlay.remove(); resolve(choice); };
    const onKey = (event) => { if (event.key === 'Escape') finish('cancel'); };
    const cleanup = () => { removeEventListener('keydown', onKey); };
    overlay.querySelectorAll('[data-auth-choice]').forEach((button) => button.addEventListener('click', () => finish(button.dataset.authChoice)));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish('cancel'); });
    addEventListener('keydown', onKey);
    setTimeout(() => overlay.querySelector('[data-auth-choice="wallet"]')?.focus(), 0);
  });
}
function configuredNetworks() {
  const networks = state.runtimeConfig?.networks;
  if (networks && typeof networks === 'object') return networks;
  return state.config ? { [state.config.network || DEFAULT_NETWORK_KEY]: state.config } : {};
}
function networkOptions() {
  const networks = configuredNetworks();
  const allowed = state.runtimeConfig?.availableNetworks || Object.keys(networks);
  return allowed.map((key) => ({ key, config: networks[key] })).filter((item) => item.config);
}
function availableChainIds() {
  return networkOptions().map(({ config }) => Number(config.chainId)).filter(Number.isInteger);
}
function networkSelectorLabel(config, key) {
  const name = config?.displayName || config?.name || key || 'Network';
  return `${name}${config?.testnetOnly || /testnet|sepolia/i.test(key || '') ? ' Testnet' : ''}`;
}
async function openNetworkSelector() {
  try {
    // RainbowKit only exposes its chain modal for a connected account. Keep
    // the navbar control useful while disconnected by taking the user to the
    // same RainbowKit connect flow first; a second click opens ChainModal.
    if (!state.wallet) {
      await (connectWalletFromUi ? connectWalletFromUi() : authenticateOnce());
      return;
    }
    await openChainModal({ chainIds: availableChainIds() });
  } catch (error) {
    showRuntimeBanner(error.message, true);
  }
}
function ensureNetworkSelectors() {
  const options = networkOptions();
  if (options.length < 2) return;
  document.querySelectorAll('.site-header, .mobile-header').forEach((header) => {
    const account = header.querySelector('.account-chip, .nm-account-chip');
    const host = account?.parentElement || header;
    let wrapper = host.querySelector(':scope > .nm-network-switcher');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'nm-network-switcher';
      wrapper.innerHTML = '<span class="nm-network-switcher-label">Network</span><button type="button" class="nm-network-switcher-button" data-rainbowkit-chain-selector="true"><span class="nm-network-switcher-mark" aria-hidden="true"></span><span class="nm-network-switcher-value"></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
      host.insertBefore(wrapper, account || null);
      wrapper.querySelector('button').addEventListener('click', openNetworkSelector);
    }
    const button = wrapper.querySelector('button');
    const value = wrapper.querySelector('.nm-network-switcher-value');
    const current = configuredNetworks()[state.networkKey] || options[0]?.config;
    const label = networkSelectorLabel(current, state.networkKey);
    value.textContent = label;
    button.dataset.network = state.networkKey;
    button.dataset.family = current?.family || (/^base-/i.test(state.networkKey) ? 'base' : 'robinhood');
    button.dataset.connected = state.wallet ? 'true' : 'false';
    button.setAttribute('aria-label', state.wallet ? `Switch network, current network ${label}` : `Connect wallet to switch networks. Current network ${label}`);
    button.title = state.wallet ? 'Switch network' : 'Connect wallet to switch networks';
  });
}
async function checkSessionOnServer(networkKey = state.networkKey) {
  try {
    const origin = state.config?.apiOrigin || '';
    const response = await fetch(`${origin}/v1/me/session`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'x-nex-network': networkKey }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.data ?? payload;
  } catch {
    return null;
  }
}
async function switchNetwork(nextKey, { switchWallet = true } = {}) {
  const next = configuredNetworks()[nextKey];
  if (!next || nextKey === state.networkKey) return;
  const previous = { networkKey: state.networkKey, config: state.config, authenticated: state.authenticated, csrfToken: state.csrfToken };
  state.networkKey = nextKey;
  state.config = next;
  try { localStorage.setItem('nexmarkets_network', nextKey); } catch {}
  ensureNetworkSelectors();
  try {
    if (switchWallet && state.wallet) {
      await wallet.switchChain({ chainId: Number(next.chainId), name: next.name, rpcUrl: next.rpcUrl, explorer: next.explorer });
    }
    const serverSession = await checkSessionOnServer(nextKey);
    if (serverSession?.authenticated && serverSession.wallet && (!state.wallet || serverSession.wallet.toLowerCase() === state.wallet.toLowerCase())) {
      state.wallet = serverSession.wallet;
      state.authenticated = true;
      if (serverSession.csrfToken) {
        state.csrfToken = serverSession.csrfToken;
        sessionStorage.setItem('nex_csrf', serverSession.csrfToken);
      }
    } else {
      state.authenticated = false;
      state.csrfToken = null;
      sessionStorage.removeItem('nex_csrf');
    }
    setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
    await hydrate();
  } catch (error) {
    state.networkKey = previous.networkKey;
    state.config = previous.config;
    state.authenticated = previous.authenticated;
    state.csrfToken = previous.csrfToken;
    try {
      if (previous.csrfToken) sessionStorage.setItem('nex_csrf', previous.csrfToken);
      else sessionStorage.removeItem('nex_csrf');
      localStorage.setItem('nexmarkets_network', previous.networkKey);
    } catch {}
    ensureNetworkSelectors();
    setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
    throw error;
  }
  showRuntimeBanner(`Switched to ${activeNetworkName()}`);
}
function injectLiveDataStyle() {
  if (document.getElementById('nm-v2-live-data-style')) return;
  const style = document.createElement('style'); style.id = 'nm-v2-live-data-style'; style.textContent = `
    .account-chip, .account-chip *, #dashboard .dash-person, #dashboard .dash-person *, #dashboard .dash-account, #dashboard .p10-account, #dashboard .p10-connected, .header-account {
      cursor: pointer !important;
      user-select: none !important;
    }
    .account-chip:hover {
      border-color: var(--amber, #ffb000) !important;
      background: #181d18 !important;
    }
    #dashboard .dash-person:hover b, #dashboard .dash-account:hover b {
      color: var(--amber, #ffb000) !important;
    }
    .nm-network-switcher{display:inline-flex;align-items:center;gap:7px;margin:0 12px;color:#849084;font:10px/1.2 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}
    .nm-network-switcher-button{appearance:none;height:36px;display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line,rgba(244,241,233,.15));border-radius:12px;background:#111411;color:#e7ece4;padding:0 10px;font:10px/1 system-ui,sans-serif;letter-spacing:0;text-transform:none;cursor:pointer;transition:border-color .18s ease,background-color .18s ease,color .18s ease}
    .nm-network-switcher-button:hover{border-color:var(--amber,#ffb000);background:#181d18;color:#fff}
    .nm-network-switcher-button:focus-visible{outline:1px solid var(--amber,#ffb000);outline-offset:2px}
    .nm-network-switcher-mark{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:var(--green,#9bc99c);box-shadow:0 0 0 4px rgba(155,201,156,.08)}
    .nm-network-switcher-button[data-family="base"] .nm-network-switcher-mark{background:#7ea8ff;box-shadow:0 0 0 4px rgba(126,168,255,.10)}
    .nm-network-switcher-value{max-width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .nm-network-switcher-button svg{width:12px;height:12px;flex:0 0 12px;color:#849084;transition:transform .18s ease,color .18s ease}
    .nm-network-switcher-button:hover svg{color:var(--amber,#ffb000)}
    @media(max-width:720px){
      .mobile-actions{min-width:0;overflow:visible}
      .mobile-actions .nm-network-switcher{flex:0 1 auto;min-width:0;gap:3px;margin:0 4px}
      .mobile-actions .nm-network-switcher-label{display:none}
      .mobile-actions .nm-network-switcher-button{height:34px;min-width:0;max-width:126px;padding:0 7px;gap:5px;font-size:9px}
      .mobile-actions .nm-network-switcher-value{max-width:83px}
      .mobile-actions .nm-network-switcher-button svg{width:11px;height:11px;flex-basis:11px}
      .mobile-actions .account-chip{position:relative;z-index:2;flex:0 0 auto}
    }
    @media(max-width:400px){
      .mobile-header{overflow:hidden}
      .mobile-actions{max-width:calc(100vw - 30px);overflow:hidden}
      .mobile-actions .nm-network-switcher{flex:0 1 104px;max-width:104px}
      .mobile-actions .nm-network-switcher-button{max-width:104px}
      .mobile-actions .nm-network-switcher-value{max-width:63px}
      .mobile-actions .nm-account-chip{max-width:78px}
      .mobile-actions .nm-get-started{max-width:78px;padding-inline:6px;font-size:9px}
    }
    .nm-media-upload-failures{display:grid;gap:7px;margin:0 0 14px;padding:11px;border:1px solid rgba(255,111,103,.28);border-radius:12px;background:rgba(116,36,31,.12)}
    .nm-media-upload-failures>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.nm-media-upload-failures span{min-width:0}.nm-media-upload-failures b,.nm-media-upload-failures small{display:block;overflow-wrap:anywhere}.nm-media-upload-failures b{font-size:11px}.nm-media-upload-failures small{margin-top:3px;color:#d79690;font-size:9px}.nm-media-upload-failures button{min-height:36px;padding:0 12px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:#171b17;color:#fff;font-size:10px;cursor:pointer}
    #discover .nm-dx-compact>span:nth-child(2){min-width:0;overflow-wrap:anywhere;word-break:break-word;white-space:normal}
    #discover .nm-dx-compact>span:nth-child(2) small{overflow-wrap:anywhere;word-break:break-word;white-space:normal}
    #discover .nm-p6-schedule-project{min-width:0}
    #discover .nm-p6-schedule-project>span{min-width:0}
    #discover .nm-p6-schedule-project small{max-width:100%!important;overflow-wrap:anywhere;word-break:break-word;white-space:normal!important}
    #discover .nm-dx-sproject{min-width:0}
    #discover .nm-dx-sproject>span{min-width:0}
    #discover .nm-dx-sproject small{max-width:100%!important;overflow-wrap:anywhere;word-break:break-word;white-space:normal!important}
    #nm-v2-data-panel{margin:26px 0 0;padding:18px;border:1px solid rgba(244,241,233,.10);border-radius:18px;background:#0d110e;color:#dfe5dc}
    #nm-v2-data-panel h2{margin:0 0 14px;font-size:22px;letter-spacing:-.03em}#nm-v2-data-panel h3{margin:0;font-size:14px}
    #nm-v2-data-panel .nm-v2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    #nm-v2-data-panel .nm-v2-cell{padding:11px;border-top:1px solid rgba(244,241,233,.075)}#nm-v2-data-panel .nm-v2-cell span{display:block;color:#7f897d;font-size:10px;text-transform:uppercase;letter-spacing:.08em}#nm-v2-data-panel .nm-v2-cell strong{display:block;margin-top:5px;color:#e7ece4;font-size:12px;word-break:break-word}
    #nm-v2-data-panel .nm-v2-adv{padding:12px 0;border-top:1px solid rgba(244,241,233,.075)}#nm-v2-data-panel .nm-v2-adv small{color:#849084}#nm-v2-data-panel .nm-v2-adv b{display:block;margin-top:4px;color:#e9eee7}
    #nm-v2-data-panel code{font-size:10px;color:#cfd8cc;word-break:break-all}@media(max-width:720px){#nm-v2-data-panel .nm-v2-grid{grid-template-columns:1fr}}
    .nm-account-dot-pulse{width:7px;height:7px;border-radius:50%;background:var(--amber,#ffb000);box-shadow:0 0 0 0 rgba(255,176,0,.7);animation:nm-dot-pulse 1.4s infinite ease-in-out;display:inline-block;flex-shrink:0}
    @keyframes nm-dot-pulse{0%{transform:scale(.95);box-shadow:0 0 0 0 rgba(255,176,0,.7)}70%{transform:scale(1);box-shadow:0 0 0 6px rgba(255,176,0,0)}100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(255,176,0,0)}}
    .nm-spinner{width:13px;height:13px;border:2px solid rgba(255,255,255,.25);border-top-color:var(--amber,#ffb000);border-radius:50%;animation:nm-spin .7s linear infinite;display:inline-block;flex-shrink:0;box-sizing:border-box}
    @keyframes nm-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
    .nm-connecting{pointer-events:none;opacity:.92!important}
    @media(max-width:540px){
      .nm-connecting .nm-connecting-long{display:none}
      .nm-connecting .nm-connecting-short{display:inline}
    }
    @media(min-width:541px){
      .nm-connecting .nm-connecting-long{display:inline}
      .nm-connecting .nm-connecting-short{display:none}
    }
    .nm-account-menu{min-width:176px!important;z-index:1000!important}
    .nm-account-menu button{text-align:left!important;padding:9px 12px!important;font-size:11.5px!important;display:block!important;width:100%!important;background:transparent!important;border:0!important;color:#cfd8cc!important;cursor:pointer!important;box-sizing:border-box!important}
    .nm-account-menu button:hover{background:rgba(255,255,255,.08)!important;color:#fff!important}
  `; document.head.appendChild(style);
}
function renderDetailPanel(mode) {
  const mount = document.getElementById('projectPageMount');
  if (!mount) return;
  document.getElementById('nm-v2-data-panel')?.remove();
  const edition = state.detailEdition || state.edition; const pass = state.detailPass || state.pass;
  if (!edition && !pass) return;
  const terms = termsOf(edition);
  const selected = mode === 'pass' && pass ? pass : null;
  const title = selected ? `${edition?.name || pass.name} ${padSerial(selected.token_id)}` : edition?.name;
  const rows = selected ? [
    ['Edition', selected.edition_address], ['Serial', `${padSerial(selected.token_id)} / ${edition?.absoluteSupplyCap || '—'}`],
    ['Owner', selected.owner_address], ['Mint-time Terms', selected.terms_hash], ['TBA', selected.token_bound_account || 'Counterfactual / not created']
  ] : [
    ['Edition', edition?.address], ['Edition ID', edition?.editionId || '—'], ['Publisher', edition?.publisher],
    ['Supply', `${edition?.totalMinted || 0} / ${edition?.absoluteSupplyCap || 0}`], ['Current Terms', termHash(terms.current) || '—']
  ];
  const advantages = selected?.advantages || [];
  const history = terms.history || [];
  const panel = document.createElement('section'); panel.id = 'nm-v2-data-panel'; panel.dataset.source = 'nexmarkets-api-goldsky';
  panel.innerHTML = `<h2>${escapeHtml(title || 'Certification Edition')}</h2><div class="nm-v2-grid">${rows.map(([label, value]) => `<div class="nm-v2-cell"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`).join('')}</div>${history.length ? `<h3 style="margin:20px 0 8px">Terms history</h3><div>${history.map((term) => `<div class="nm-v2-cell"><span>Version ${escapeHtml(term.version ?? '—')} · ${escapeHtml(termHash(term) || '—')}</span><strong>Preview ${escapeHtml(iso(term.previewStartsAt ?? term.preview_starts_at) || '—')} · Mint ${escapeHtml(iso(term.mintStartsAt ?? term.mint_starts_at) || '—')} · ${escapeHtml(usd(term.pricePerPass ?? term.price_usdg).toFixed(6))} ${escapeHtml(activeSettlementSymbol())}</strong></div>`).join('')}</div>` : ''}${selected ? `<h3 style="margin:20px 0 8px">Advantages</h3>${advantages.length ? advantages.map((advantage) => `<div class="nm-v2-adv"><small>${escapeHtml(kindLabel(advantage.kind))}</small><b>${escapeHtml(advantageText([advantage]))}</b><span>${consumes(advantage.kind) ? 'Onchain consumption available when not listed.' : 'Entitlement/access state; no view-only transaction.'}</span></div>`).join('') : '<div class="nm-v2-cell">No committed Advantages indexed.</div>'}` : ''}`;
  mount.appendChild(panel);
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function patchNetworkCopy() {
  const symbol = activeSettlementSymbol();
  if (!symbol || symbol === 'USDG') return;
  const root = document.body; if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => { if (node.parentElement?.closest('script,style,textarea,input,code')) return; if (/USDG/.test(node.nodeValue || '')) node.nodeValue = node.nodeValue.replace(/MockUSDG|USDG/g, symbol); });
}
function patchBuilderLinks() {
  const project = state.detailProject; const experience = project && state.projectExperience?.[project.name];
  const key = experience?.builderId || experience?.builderHandle || experience?.builder;
  if (!key) return;
  document.querySelectorAll('.nm-final-builder-line,.nm-market-project-builder,.nm-collection-project-builder').forEach((row) => {
    if (row.querySelector('[data-nm-builder-route]')) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn small'; button.dataset.nmBuilderRoute = '1'; button.textContent = 'View Builder profile →'; button.addEventListener('click', () => window.openBuilder?.(key)); row.appendChild(button);
  });
}
function routeInfo() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'passes' && parts[1] && parts[2]) return { kind: 'pass', edition: parts[1], token: parts[2] };
  if (parts[0] === 'listings' && parts[1]) return { kind: 'listing', listing: decodeURIComponent(parts.slice(1).join('/')) };
  if (parts[0] === 'editions' && parts[1]) return { kind: 'edition', edition: parts[1] };
  if (parts[0] === 'projects' && parts[1]) return { kind: 'project', project: decodeURIComponent(parts.slice(1).join('/')) };
  if (parts[0] === 'builders' && parts[1]) return { kind: 'builder', handle: decodeURIComponent(parts.slice(1).join('/')) };
  if (parts[0] === 'dashboard') {
    const params = new URLSearchParams(location.search);
    return { kind: 'dashboard', tab: parts[1] || 'holder', view: params.get('view') || null };
  }
  if (parts[0] === 'market') return { kind: 'market' };
  if (parts[0] === 'discover') return { kind: 'discover' };
  if (parts[0] === 'create') return { kind: 'create' };
  if (parts[0] === 'docs') return { kind: 'docs' };
  if (parts[0] === 'faq') return { kind: 'faq' };
  if (parts[0] === 'terms') return { kind: 'terms' };
  return { kind: 'home' };
}
async function presentRoute(route) {
  // Client-side navigation must hydrate the requested canonical record. The
  // initial page load already did this in hydrate(), but a pushState route
  // otherwise reused the Discover summary and could silently drop Terms,
  // serial or artwork data on an individual launch/Pass page.
  if (['project', 'edition', 'pass'].includes(route?.kind)) {
    try { await loadRequestedRouteData(route); } catch {}
  }
  goView(route);
}
function navigate(path) {
  const next = String(path || '/');
  history.pushState({}, '', next);
  return presentRoute(routeInfo());
}
function goView(route) {
  state.route = route;
  const detailRoute = ['project', 'edition', 'pass'].includes(route.kind);
  if (route.kind === 'builder') {
    window.go?.('builder');
    read(`/v1/builders/${encodeURIComponent(route.handle)}`).then((profile) => {
      const builderId = profile?.builder_id || profile?.builderId || profile?.id || route.handle;
      const keys = [route.handle, builderId, profile?.id, profile?.account_id, profile?.wallet_address].filter(Boolean).map(lower);
      keys.forEach((key) => state.builderProfiles.set(key, profile));
      state.builderSocial.set(lower(builderId), state.builderSocial.get(lower(builderId)) || { profile, updates: [], questions: [], follow: { isFollowing: false, isHolder: false, followerCount: Number(profile?.follower_count || 0) } });
      window.nmEliteBuilderKey = lower(builderId);
      window.nmRenderBuilderPage?.();
    }).catch(() => {});
    return;
  }
  const project = state.projects?.find((item) => route.edition && lower(item.editionAddress) === lower(route.edition)) || state.projects?.find((item) => route.project && (item.name.toLowerCase() === String(route.project).toLowerCase() || lower(item.editionAddress) === lower(route.project))) || (detailRoute ? null : state.detailProject || state.projects?.[0]);
  if (project) {
    state.detailProject = project;
    window.__nmV2SetData?.({ selectedProject: project.name, ...(route.edition ? { selectedEdition: route.edition } : {}), ...(route.listing ? { selectedListing: route.listing } : {}) });
  }
  if (route.kind === 'listing') window.__nmV2SetData?.({ selectedListing: route.listing });
  if (route.kind === 'discover') window.go?.('discover');
  else if (route.kind === 'market') window.go?.('market');
  else if (route.kind === 'create') window.go?.('create');
  else if (route.kind === 'dashboard') {
    if (route.view === 'owned') window.go?.('owned');
    else {
      window.go?.('dashboard');
      const dashboardTab = route.tab === 'builder' ? 'builder' : route.tab === 'passes' ? 'passes' : route.tab === 'advantages' ? 'advantages' : route.tab === 'listings' ? 'listings' : route.tab === 'launches' ? 'launches' : route.tab === 'earnings' ? 'earnings' : route.tab === 'activity' ? 'activity' : 'overview';
      if (dashboardTab !== 'overview') setTimeout(() => window.dashGo?.(dashboardTab), 25);
    }
  } else if (route.kind === 'listing') {
    const target = state.listings?.find((item) => String(item.orderHash || item.id || item.name || '') === String(route.listing));
    if (target) window.__nmV2SetData?.({ selectedListing: target.orderHash || target.id });
    window.go?.('listing');
  } else if (route.kind === 'edition') {
    if (project) window.go?.('collection');
  } else if (route.kind === 'project' || route.kind === 'pass') {
    if (project) window.go?.('project');
  } else if (route.kind === 'docs' || route.kind === 'faq' || route.kind === 'terms') window.go?.(route.kind);
  else window.go?.('home');
  if (detailRoute && !project) {
    setTimeout(() => {
      const mount = document.getElementById('projectPageMount');
      if (mount) mount.innerHTML = '<div class="dash-empty"><b>This NexMarkets record is unavailable.</b><p>The requested Edition, Pass, or launch was not found in the live read model.</p></div>';
    }, 0);
  }
  setTimeout(() => setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet'), 35);
  setTimeout(() => { if (route.kind === 'edition' || route.kind === 'project' || route.kind === 'pass') renderDetailPanel(route.kind === 'pass' ? 'pass' : 'edition'); }, 45);
  setTimeout(() => { patchNetworkCopy(); patchBuilderLinks(); }, 80);
}
async function read(path, options = {}) {
  const origin = state.config?.apiOrigin || '';
  const response = await fetch(`${origin}${path}`, { credentials: 'same-origin', ...options, headers: { accept: 'application/json', 'x-nex-network': state.networkKey, ...(options.headers || {}) } });
  let payload = null; try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new Error(payload?.error?.code || `API_${response.status}`);
  return payload?.data ?? payload;
}
async function loadRequestedRouteData(route) {
  state.detailEdition = null; state.detailPass = null; state.detailSummary = null;
  if (!route || !['project', 'edition', 'pass'].includes(route.kind)) return;
  const requests = [];
  if (route.kind === 'project') requests.push(read(`/v1/projects/${encodeURIComponent(route.project)}`));
  if (route.kind === 'edition' || route.kind === 'pass') requests.push(read(`/v1/editions/${encodeURIComponent(route.edition)}`));
  if (route.kind === 'pass') requests.push(read(`/v1/passes/${encodeURIComponent(route.edition)}/${encodeURIComponent(route.token)}`));
  const results = await Promise.allSettled(requests);
  const values = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const project = route.kind === 'project' ? values[0] : null;
  const linkedEdition = project?.editions?.[0] || null;
  const editionRaw = route.kind === 'project' ? linkedEdition : values[0] || null;
  const passRaw = route.kind === 'pass' ? values[1] || null : null;
  state.detailSummary = project || editionRaw || null;
  state.detailEdition = editionRaw ? normalizeEdition(editionRaw, project) : null;
  state.detailPass = passRaw && state.detailEdition ? normalizePass(passRaw, state.detailEdition) : null;
}
async function loadConfig() {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('TESTNET_CONFIG_UNAVAILABLE');
  const config = await response.json();
  const networks = config.networks && typeof config.networks === 'object'
    ? config.networks
    : { [config.network || DEFAULT_NETWORK_KEY]: config };
  const available = Array.isArray(config.availableNetworks) && config.availableNetworks.length ? config.availableNetworks : Object.keys(networks);
  let requested = null;
  try { requested = new URL(location.href).searchParams.get('network') || localStorage.getItem('nexmarkets_network'); } catch {}
  const selectedKey = available.includes(requested) ? requested : (available.includes(config.defaultNetwork) ? config.defaultNetwork : available[0]);
  if (!selectedKey || !networks[selectedKey] || !Number.isInteger(Number(networks[selectedKey].chainId))) throw new Error('NETWORK_CONFIGURATION_REQUIRED');
  state.runtimeConfig = { ...config, networks, availableNetworks: available };
  state.networkKey = selectedKey;
  state.config = { ...networks[selectedKey], network: selectedKey };
  ensureNetworkSelectors();
  setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
  return state.config;
}
async function loadChainData() {
  const route = routeInfo();
  const certificationEdition = activeCertificationEdition();
  const [discoverResult, editionResult, passResult, listingsResult] = await Promise.allSettled([
    read('/v1/discover'),
    certificationEdition ? read(`/v1/editions/${certificationEdition}`) : Promise.resolve(null),
    certificationEdition ? read(`/v1/passes/${certificationEdition}/${CERTIFICATION_TOKEN}`) : Promise.resolve(null),
    read('/v1/market/listings')
  ]);
  const discover = discoverResult.status === 'fulfilled' ? (Array.isArray(discoverResult.value) ? discoverResult.value : discoverResult.value?.editions || []) : [];
  const projectDetails = await Promise.all(discover.map(async (item) => {
    if (!item?.slug) return null;
    try {
      const detail = await read(`/v1/projects/${encodeURIComponent(item.slug)}`);
      return detail && !Array.isArray(detail) ? detail : null;
    } catch { return null; }
  }));
  const enrichedDiscover = discover.map((item, index) => {
    const detail = projectDetails[index];
    const linkedEdition = detail?.editions?.[0];
    return detail ? { ...item, ...detail, content: detail.content || item.content, ...(linkedEdition && !item.edition_address ? linkedEdition : {}) } : item;
  });
  const summary = enrichedDiscover.find((item) => certificationEdition && lower(item.edition_address || item.address) === certificationEdition.toLowerCase()) || enrichedDiscover[0] || null;
  const editionRaw = editionResult.status === 'fulfilled' ? editionResult.value : null;
  state.edition = normalizeEdition(editionRaw, summary);
  state.pass = normalizePass(passResult.status === 'fulfilled' ? passResult.value : null, state.edition);
  state.discover = enrichedDiscover.map((item) => normalizeEdition(null, item)).filter(Boolean);
  if (state.edition && !state.discover.some((item) => item.address.toLowerCase() === state.edition.address.toLowerCase())) state.discover.unshift(state.edition);
  const map = new Map(state.discover.map((item) => [item.address.toLowerCase(), item]));
  const listingRows = listingsResult.status === 'fulfilled' ? (Array.isArray(listingsResult.value) ? listingsResult.value : []) : [];
  state.listings = listingRows.map((item) => normalizeListing(item, map)).filter(Boolean);
  await loadRequestedRouteData(route);
  // Discover is the public collection authority. When no configured
  // certification Edition can provide a fallback, a failed Discover read is
  // an explicit live-data failure rather than an apparently empty home page.
  if (discoverResult.status === 'rejected' && (editionResult.status === 'rejected' || !certificationEdition)) throw new Error('LIVE_API_UNAVAILABLE');
}
async function loadBuilderProfiles({ authenticatedOverride = state.authenticated } = {}) {
  const identifiers = [...new Set([
    ...state.discover.map((edition) => lower(edition.publisher)).filter((value) => value && value !== ZERO),
    lower(state.edition?.publisher),
    lower(state.detailEdition?.publisher)
  ].filter(Boolean))];
  const profiles = await Promise.all(identifiers.map(async (identifier) => {
    try {
      const profile = await read(`/v1/builders/${encodeURIComponent(identifier)}`);
      return profile && typeof profile === 'object' && !Array.isArray(profile) ? [identifier, profile] : null;
    } catch { return null; }
  }));
  state.builderProfiles = new Map();
  state.builderSocial = new Map();
  profiles.filter(Boolean).forEach(([identifier, profile]) => {
    const accountId = lower(profile.account_id || profile.accountId);
    const builderId = lower(profile.builder_id || profile.builderId);
    const profileId = lower(profile.id);
    const walletAddress = lower(profile.wallet_address || profile.walletAddress);
    [identifier, builderId, accountId, profileId, walletAddress].filter(Boolean).forEach((key) => state.builderProfiles.set(key, profile));
  });
  const socialProfiles = new Map();
  for (const profile of state.builderProfiles.values()) {
    const builderId = lower(profile.builder_id || profile.builderId || profile.account_id || profile.accountId || profile.id);
    if (builderId) socialProfiles.set(builderId, profile);
  }
  await Promise.all([...socialProfiles.entries()].map(async ([builderId, profile]) => {
    if (state.builderSocial.has(builderId)) return;
    const [updates, questions, follow] = await Promise.all([
      read(`/v1/builders/${encodeURIComponent(builderId)}/milestones`).catch(() => []),
      read(`/v1/builders/${encodeURIComponent(builderId)}/questions`).catch(() => []),
      authenticatedOverride ? read(`/v1/builders/${encodeURIComponent(builderId)}/follow-status`).catch(() => null) : Promise.resolve(null)
    ]);
    state.builderSocial.set(builderId, { profile, updates: Array.isArray(updates) ? updates : [], questions: Array.isArray(questions) ? questions : [], follow: follow || { isFollowing: false, isHolder: false, followerCount: Number(profile.follower_count || profile.followerCount || 0) } });
  }));
}
async function loadAuthenticatedData(authenticatedOverride = state.authenticated) {
  if (!authenticatedOverride) {
    state.managedBuilders = [];
    state.selectedBuilderId = null;
    window.__nmManagedBuilderKeys = [];
    state.builderDashboard = { projects: [], editions: [], royalties: [], referrals: [] };
    return { owned: [], advantages: [], builder: state.builderDashboard };
  }
  const buildersResult = await Promise.allSettled([read('/v1/me/builders')]);
  state.managedBuilders = buildersResult[0].status === 'fulfilled' && Array.isArray(buildersResult[0].value) ? buildersResult[0].value : [];
  const selected = state.managedBuilders.find((row) => lower(row.id || row.builder_id) === lower(state.selectedBuilderId));
  state.selectedBuilderId = selected?.id || state.managedBuilders[0]?.id || null;
  if (state.selectedBuilderId) sessionStorage.setItem('nexmarkets_selected_builder', state.selectedBuilderId);
  else sessionStorage.removeItem('nexmarkets_selected_builder');
  window.__nmManagedBuilderKeys = state.managedBuilders.map((row) => lower(row.id || row.builder_id)).filter(Boolean);
  state.managedBuilders.forEach((row) => {
    const profile = row.profile;
    if (!profile) return;
    const keys = [row.id, row.builder_id, profile.builder_id, profile.id, profile.account_id, profile.wallet_address].filter(Boolean).map(lower);
    keys.forEach((key) => state.builderProfiles.set(key, { ...profile, builder_id: row.id || row.builder_id }));
  });
  const dashboardPath = state.selectedBuilderId ? `/v1/builder/dashboard?builderId=${encodeURIComponent(state.selectedBuilderId)}` : '/v1/builder/dashboard';
  const results = await Promise.allSettled([read('/v1/me/passes'), read('/v1/me/advantages'), read(dashboardPath)]);
  state.builderDashboard = results[2].status === 'fulfilled'
    ? (results[2].value || { projects: [], editions: [], royalties: [], referrals: [] })
    : { projects: [], editions: [], royalties: [], referrals: [] };
  return {
    owned: results[0].status === 'fulfilled' ? (Array.isArray(results[0].value) ? results[0].value : []) : [],
    advantages: results[1].status === 'fulfilled' ? (Array.isArray(results[1].value) ? results[1].value : []) : [],
    builder: state.builderDashboard
  };
}

async function selectBuilder(builderIdentifier) {
  const wanted = lower(builderIdentifier);
  const row = state.managedBuilders.find((candidate) => lower(candidate.id || candidate.builder_id) === wanted || lower(candidate.profile?.id) === wanted);
  if (!row) throw new Error('BUILDER_NOT_AUTHORIZED');
  state.selectedBuilderId = row.id || row.builder_id;
  sessionStorage.setItem('nexmarkets_selected_builder', state.selectedBuilderId);
  window.__nmManagedBuilderKeys = state.managedBuilders.map((candidate) => lower(candidate.id || candidate.builder_id)).filter(Boolean);
  window.nmEliteDashboardBuilderKey = lower(state.selectedBuilderId);
  await hydrate();
  return state.builderDashboard;
}
function knownEdition(value) {
  const target = lower(value);
  if (!target) return null;
  return (lower(state.edition?.address) === target ? state.edition : null)
    || (lower(state.detailEdition?.address) === target ? state.detailEdition : null)
    || state.discover.find((item) => lower(item.address) === target)
    || null;
}
function rawAdvantageId(value) { return lower(value?.advantage_id_hash || value?.advantageId || value?.advantage_id || value?.id) || ZERO; }
function dashboardAdvantageRemaining(raw) {
  const k = kind(raw?.kind);
  const value = remainingValue(raw);
  if (k === 'TIME_BASED') return `${durationLabel(value)} remaining`;
  if (k === 'CONNECTED') return value > 0 ? 'Active entitlement/access' : 'Inactive entitlement/access';
  if (k === 'REDEMPTION') return `${value} redemption${value === 1 ? '' : 's'} remaining`;
  return `${value} unit${value === 1 ? '' : 's'} remaining`;
}
function buildDashboardData(accountData, owned) {
  const builder = accountData.builder || { projects: [], editions: [], royalties: [], referrals: [] };
  const projects = Array.isArray(builder.projects) ? builder.projects : [];
  const editions = Array.isArray(builder.editions) ? builder.editions : [];
  const primarySales = Array.isArray(builder.primarySales) ? builder.primarySales : [];
  const proceedsForEdition = (rawEdition) => {
    const editionId = String(rawEdition?.id ?? rawEdition?.edition_id ?? '');
    const editionAddress = lower(rawEdition?.edition_address ?? rawEdition?.editionAddress ?? rawEdition?.address);
    return usd(primarySales
      .filter((sale) => String(sale.edition_id ?? sale.editionId ?? '') === editionId || (editionAddress && lower(sale.edition_address ?? sale.editionAddress) === editionAddress))
      .reduce((sum, sale) => (BigInt(sum) + BigInt(sale.builder_proceeds_usdg ?? sale.builderProceedsUsdg ?? 0)).toString(), '0'));
  };
  const projectById = new Map(projects.map((project) => [String(project.id), project]));
  const launches = [];
  const projectHasEdition = new Set();
  editions.forEach((rawEdition) => {
    const project = projectById.get(String(rawEdition.project_id ?? rawEdition.projectId)) || null;
    if (project) projectHasEdition.add(String(project.id));
    const draft = project?.content || project?.launchDraft || {};
    const editionName = rawEdition.name || draft.edition?.name || project?.name || `Edition ${short(rawEdition.edition_address || rawEdition.editionAddress)}`;
    const projectName = project?.name || rawEdition.project_name || editionName;
    const addressValue = address(rawEdition.edition_address || rawEdition.editionAddress || rawEdition.address);
    const currentTerms = rawEdition.currentTerms || rawEdition.current_terms || (rawEdition.price_usdg != null ? rawEdition : null);
    const edition = normalizeEdition({ ...rawEdition, address: addressValue || rawEdition.address, edition_address: addressValue || rawEdition.edition_address, name: editionName, currentTerms, termsHistory: rawEdition.termsHistory || rawEdition.terms }, null);
    const stage = edition ? edition.status : (currentTerms ? statusFor({ currentTerms }, null) : 'preview');
    launches.push({
      id: addressValue || rawEdition.id || `edition-${project?.id || editionName}`,
      name: editionName,
      project: projectName,
      state: stage === 'live' ? 'Debut' : stage === 'closed' ? 'Closed' : 'Preview',
      minted: number(rawEdition.total_minted ?? rawEdition.totalMinted),
      supply: number(rawEdition.absolute_supply_cap ?? rawEdition.absoluteSupplyCap ?? draft.edition?.supply),
      price: edition?.price ?? usd(rawEdition.price_usdg ?? draft.edition?.price),
      primary: proceedsForEdition(rawEdition),
      timing: edition?.mintStartsAt && edition.mintStartsAt > Math.floor(Date.now() / 1000) ? `Opens ${iso(edition.mintStartsAt)}` : edition?.status === 'live' ? 'Live now' : 'Terms pending',
      collection: initials(projectName).toLowerCase(),
      evidence: project?.content?.project?.evidence?.url || project?.launchDraft?.project?.evidence?.url || '',
      network: draft.network || draft.project?.network || activeNetworkFamily(),
      editionAddress: addressValue,
      projectId: project?.id || rawEdition.project_id || rawEdition.projectId || null,
      draft
    });
  });
  projects.filter((project) => !projectHasEdition.has(String(project.id))).forEach((project) => {
    const draft = project.content || project.launchDraft || {};
    const edition = draft.edition || {};
    launches.push({
      id: `draft-${project.id}`,
      name: edition.name || project.name || 'Untitled Edition',
      project: project.name || edition.name || 'Untitled Project',
       state: 'Preview',
      minted: 0,
      supply: number(edition.supply, 0),
      price: number(edition.price, 0),
      primary: 0,
       timing: 'Pass created · On-chain Edition pending',
      collection: initials(project.name || edition.name || 'Edition').toLowerCase(),
      evidence: draft.project?.evidence?.url || '',
      network: draft.network || draft.project?.network || activeNetworkFamily(),
      editionAddress: null,
      projectId: project.id,
      draft,
      projectRow: project
    });
  });

  const passByKey = new Map(owned.map((pass) => [pass.key, pass]));
  const passMeta = Object.fromEntries(owned.map((pass) => [pass.key, { listed: false }]));
  const dashboardListings = [];
  state.listings.forEach((listing) => {
    if (!state.wallet || lower(listing.seller_address || listing.seller) !== lower(state.wallet)) return;
    const pass = owned.find((item) => lower(item.editionAddress) === lower(listing.edition_address) && String(item.tokenId) === String(listing.token_id));
    if (!pass) return;
    const row = {
      id: listing.orderHash || `${pass.key}-listing`,
      passKey: pass.key,
      name: listing.name,
      collection: listing.collection,
      remaining: listing.remaining,
      price: listing.price,
      marketRef: 0,
      listedAt: listing.listedMinutes ? `${listing.listedMinutes}m ago` : 'Active',
      network: activeNetworkFamily(),
      orderHash: listing.orderHash,
      editionAddress: listing.edition_address,
      tokenId: listing.token_id
    };
    dashboardListings.push(row); passMeta[pass.key].listed = true;
  });

  const dashboardAdvantages = (accountData.advantages || []).map((raw, index) => {
    const editionValue = raw.edition_address || raw.editionAddress || raw.edition?.address;
    const token = String(raw.token_id ?? raw.tokenId ?? '0');
    const passKey = `${lower(editionValue)}-${token}`;
    const pass = passByKey.get(passKey);
    if (!pass) return null;
    const advantageId = rawAdvantageId(raw);
    const k = kind(raw.kind);
    const remaining = dashboardAdvantageRemaining(raw);
    const remainingCount = raw.remainingCount ?? raw.remaining_units ?? raw.remainingUnits;
    const numericRemaining = number(remainingCount ?? remainingValue(raw));
    const listed = Boolean(passMeta[passKey]?.listed);
    return {
      id: `adv-${passKey}-${advantageId}-${index}`,
      passKey,
      title: raw.title || (k === 'REDEMPTION' ? `${pass.name} redemptions` : `${pass.name} ${kindLabel(k)}`),
      mechanism: k === 'REDEMPTION' ? 'Redemption' : k === 'CONNECTED' ? 'Connected' : kindLabel(k),
      kind: k,
      advantageId,
      editionAddress: lower(editionValue),
      tokenId: token,
      remainingCount: ['QUANTITY_BASED', 'REDEMPTION'].includes(k) ? numericRemaining : undefined,
      remaining,
      state: listed ? 'listed' : numericRemaining <= 0 && ['QUANTITY_BASED', 'REDEMPTION'].includes(k) ? 'used' : 'ready',
      action: ['REDEMPTION', 'QUANTITY_BASED'].includes(k) ? 'Claim' : 'Open benefit',
      termsHash: lower(raw.terms_hash || raw.termsHash || pass.termsHash),
      raw
    };
  }).filter(Boolean);
  dashboardAdvantages.forEach((advantage) => {
    const pass = passByKey.get(advantage.passKey);
    if (pass) pass.advantages = [...(pass.advantages || []), advantage.raw];
  });

  const claims = Array.isArray(builder.royalties) ? builder.royalties : [];
  const activity = (Array.isArray(builder.activity) ? builder.activity : []).map((row, index) => {
    const eventType = kind(row.type);
    const type = eventType === 'SECONDARY_SALE' || eventType === 'NEW_HOLDER' ? 'market' : eventType === 'NEW_DEBUT' || eventType === 'MILESTONE' ? 'launch' : eventType === 'ADVANTAGE_USE' ? 'advantage' : 'earnings';
    const created = row.created_at ?? row.createdAt ?? row.timestamp ?? null;
    const when = created ? (iso(created) || String(created)) : 'Recent';
    return {
      id: row.id || `builder-activity-${index}`,
      type,
      label: row.title || row.label || eventType || 'Builder activity',
      value: row.value || row.content || row.description || '',
      context: row.context || (type === 'market' ? 'Market' : type === 'launch' ? 'Edition' : type === 'advantage' ? 'Advantage' : 'Earnings'),
      when
    };
  });
  let royaltyAvailable = 0; let royaltyLocked = 0;
  claims.forEach((claim) => {
    const amount = usd(claim.amount_usdg ?? claim.amountUsdg ?? claim.amount ?? 0);
    const release = seconds(claim.release_at ?? claim.releaseAt);
    if (!claim.withdrawn && (release == null || release <= Math.floor(Date.now() / 1000))) royaltyAvailable += amount;
    else if (!claim.withdrawn) royaltyLocked += amount;
  });
  return {
    passMeta,
    advantages: dashboardAdvantages,
    listings: dashboardListings,
    launches,
    earnings: {
      primaryProceeds: usd(builder.earnings?.builderProceedsUsdg ?? builder.earnings?.builder_proceeds_usdg ?? builder.primaryProceedsUsdg ?? 0),
      royaltyAvailable,
      royaltyLocked,
      royaltyUnlock: royaltyLocked ? 'when the claim releases' : 'No claims',
      referralTracked: usd(builder.earnings?.referralObligationUsdg ?? builder.earnings?.referral_obligation_usdg ?? (builder.referrals || []).reduce((total, row) => (BigInt(total) + BigInt(row.amount_usdg ?? row.amountUsdg ?? row.amount ?? 0)).toString(), '0'))
    },
    royaltyClaims: claims,
    activity
  };
}
async function hydrate({ authenticatedOverride = null } = {}) {
  state.hydrating = true;
  try {
    const hasAuthenticatedSession = authenticatedOverride == null ? state.authenticated : authenticatedOverride;
    await loadConfig(); await loadChainData(); await loadBuilderProfiles({ authenticatedOverride: hasAuthenticatedSession });
    const first = state.discover[0] || state.edition;
    const editions = state.discover.length ? state.discover : (state.edition ? [state.edition] : []);
    const mappedProjects = editions.map((item) => {
      const certificationEdition = activeCertificationEdition();
      const isCertification = Boolean(certificationEdition && lower(item.address) === certificationEdition.toLowerCase());
      return projectModel(isCertification ? state.edition : item, item, isCertification ? state.pass : null);
    }).filter((item) => item?.project);
    if (!mappedProjects.length && (state.edition || first)) mappedProjects.push(projectModel(state.edition || first, null, state.pass));
    state.projects = mappedProjects.map((item) => item.project);
    state.projectExperience = Object.fromEntries(mappedProjects.map((item) => [item.project.name, item.experience]));
    const requestedRoute = routeInfo();
    const requestedModel = state.detailSummary || state.detailEdition
      ? projectModel(state.detailEdition, state.detailSummary, state.detailPass)
      : null;
    if (requestedModel?.project && ['project', 'edition', 'pass'].includes(requestedRoute.kind)) {
      state.detailProject = requestedModel.project;
      const existingIndex = state.projects.findIndex((item) => item.name === requestedModel.project.name);
      if (existingIndex >= 0) state.projects[existingIndex] = requestedModel.project;
      else state.projects.unshift(requestedModel.project);
      state.projectExperience[requestedModel.project.name] = requestedModel.experience;
    }
    const accountData = await loadAuthenticatedData(hasAuthenticatedSession);
    const owned = accountData.owned.map((row) => {
      const rowEditionAddress = row.edition_address || row.editionAddress || row.edition?.address;
      const edition = knownEdition(rowEditionAddress) || normalizeEdition({ ...row, address: rowEditionAddress, edition_address: rowEditionAddress, name: row.project_name || row.name }, null);
      const advantages = accountData.advantages.filter((advantage) => lower(advantage.edition_address || advantage.editionAddress) === lower(rowEditionAddress) && String(advantage.token_id ?? advantage.tokenId) === String(row.token_id ?? row.tokenId));
      const pass = normalizePass({ ...row, advantages }, edition || state.edition);
      return ownedModel({ ...row, advantages }, pass, edition || state.edition);
    });
    const collections = state.discover.map((edition) => {
      const relatedListings = state.listings.filter((item) => lower(item.edition_address) === lower(edition.address));
      const prices = relatedListings.map((item) => Number(item.price)).filter((value) => Number.isFinite(value) && value > 0);
      const rawMechanisms = edition.advantages || edition.advantageConfigs || edition.advantage_configs || [];
      const mechanism = Array.isArray(rawMechanisms) && rawMechanisms.some((item) => kind(item.kind) === 'REDEMPTION') ? 'Redemption' : 'Connected';
      const floor = Number(edition.floor ?? edition.floor_price ?? edition.floorPrice);
      const last = Number(edition.last ?? edition.last_price ?? edition.lastPrice ?? edition.last_sale_price ?? edition.lastSalePrice);
      return {
        name: edition.name,
        key: initials(edition.name).toLowerCase(),
        color: edition.color || '#34483a',
        mechanism,
        floor: Number.isFinite(floor) && floor > 0 ? floor : (prices.length ? Math.min(...prices) : 0),
        last: Number.isFinite(last) && last > 0 ? last : 0,
        listed: relatedListings.length
      };
    });
    const dashboard = buildDashboardData(accountData, owned);
    const draftProject = (accountData.builder?.projects || []).find((project) => String(project.status || '').toUpperCase() === 'DRAFT') || null;
    state.lastDraftId = draftProject?.content?.draftId || draftProject?.launchDraft?.draftId || null;
    publishTemplateData({
      projects: state.projects,
      projectExperience: state.projectExperience,
      collections,
      listings: state.listings,
      ownedPasses: owned,
      dashboardState: dashboard,
      createData: draftProject ? createDataFromLaunchDraft(draftProject) : neutralCreateData(),
      selectedProject: state.detailProject?.name || state.projects[0]?.name || ''
    });
    patchNetworkCopy(); patchBuilderLinks();
    setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
    state.error = null;
  } catch (error) {
    state.error = error;
    state.projects = []; state.projectExperience = {};
    state.lastDraftId = null;
    publishTemplateData({ projects: [], projectExperience: {}, collections: [], listings: [], ownedPasses: [], dashboardState: emptyDashboard([]), createData: neutralCreateData() });
    setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
    showRuntimeBanner(`Live NexMarkets data is unavailable: ${error.message}`, true);
  }
  try {
    document.documentElement.classList.remove('nm-v2-loading'); document.documentElement.classList.add('nm-v2-ready');
    injectLiveDataStyle();
    goView(routeInfo());
  } finally {
    state.hydrating = false;
  }
  if (state.error) return;
}
async function authenticateWallet() {
  state.connecting = true;
  state.connectingMessage = state.wallet ? 'Waiting for signature...' : 'Connecting...';
  setAccountLabel(state.connectingMessage);
  try {
    const provider = cdpSession?.provider || await getWalletProvider();
    if (provider) wallet.setProvider(provider);
    const identity = await wallet.connect(Number(state.config?.chainId || CHAIN_ID));
    state.wallet = identity.address;
    state.connectingMessage = 'Waiting for signature...';
    setAccountLabel('Waiting for signature...');
    const challenge = await read('/v1/auth/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: identity.address }) });
    const signature = await wallet.signMessage(challenge.message);
    state.connectingMessage = 'Verifying signature...';
    setAccountLabel('Verifying signature...');
    const verified = await read('/v1/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nonce: challenge.nonce, signature }) });
    state.csrfToken = verified.csrfToken; sessionStorage.setItem('nex_csrf', verified.csrfToken);
    state.connectingMessage = 'Establishing session...';
    setAccountLabel('Establishing session...');
    await hydrate({ authenticatedOverride: true });
    state.authenticated = true;
    showRuntimeBanner(`Wallet verified on ${activeNetworkName()}`);
    return identity;
  } finally {
    state.connecting = false;
    state.connectingMessage = null;
    setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
  }
}
async function authenticate({ throwOnError = false } = {}) {
  try { return await authenticateWallet(); }
  catch (error) {
    showRuntimeBanner(error.message, true);
    if (throwOnError) throw error;
    return null;
  }
}
let authenticationPromise = null;
function authenticateOnce() {
  if (!authenticationPromise) {
    state.connecting = true;
    state.connectingMessage = state.wallet ? 'Waiting for signature...' : 'Connecting...';
    setAccountLabel(state.connectingMessage);
    authenticationPromise = authenticate().finally(() => {
      authenticationPromise = null;
      state.connecting = false;
      state.connectingMessage = null;
      setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
    });
  }
  return authenticationPromise;
}

const PHASE4_MANUAL_COLORWAY = 'phase4-manual';
const PHASE4_COLORWAY_NAMES = Object.freeze(['Crimson Archive', 'Cobalt Field', 'Forest Ledger', 'Ochre Study', 'Violet Register']);
const PHASE4_PACK_META = Object.freeze({
  'classic-obsidian': ['classic', 'obsidian'],
  'classic-carbon': ['classic', 'carbon'],
  'classic-gilt': ['classic', 'gilt'],
  'glass-obsidian': ['glass', 'obsidian'],
  'glass-carbon': ['glass', 'carbon'],
  'pack-slab': ['graded-vault-slab', 'transparent-graded-case'],
  'pack-glass': ['museum-glass-archive', 'glass-vitrine'],
  'pack-metal': ['machined-metal-vault', 'milled-alloy'],
  'pack-ceramic': ['ceramic-enamel-tile', 'glazed-ceramic'],
  'pack-blister': ['collector-blister-pack', 'thermoformed-chamber'],
  'pack-carbon': ['forged-carbon-frame', 'carbon-weave'],
  'pack-paper': ['antique-archive-certificate', 'cotton-rag-deed-stock'],
  'pack-resin': ['cast-resin-display-block', 'tinted-cast-resin']
});

function phase4Visual(source, optionId, randomPalette = null) {
  const [family, material] = PHASE4_PACK_META[optionId] || ['', ''];
  const isRandom = Array.isArray(randomPalette) && randomPalette.length >= 3;
  const passDesign = optionId.startsWith('classic-') ? 'classic' : optionId.startsWith('glass-') ? 'glass' : optionId;
  const frame = optionId.startsWith('classic-') || optionId.startsWith('glass-') ? material : 'obsidian';
  const color = isRandom ? randomPalette[0] : String(source.color || '#5f6f50');
  return {
    passDesign,
    packOption: optionId,
    packFamily: family,
    material,
    themeMode: isRandom ? 'random' : String(source.themeMode || 'auto'),
    color,
    customColor: isRandom ? color : String(source.customColor || color),
    colorStyle: isRandom ? 'solid' : String(source.colorStyle || 'solid'),
    gradientA: isRandom ? randomPalette[0] : String(source.gradientA || color),
    gradientB: isRandom ? randomPalette[1] : String(source.gradientB || color),
    gradientDirection: isRandom ? 'diagonal' : String(source.gradientDirection || 'diagonal'),
    frame,
    frameColor: isRandom ? (frame === 'gilt' ? '#c8a84e' : frame === 'carbon' ? '#313337' : '#2a2725') : String(source.frameColor || (frame === 'gilt' ? '#c8a84e' : frame === 'carbon' ? '#313337' : '#2a2725')),
    frameHueCustomized: isRandom ? false : Boolean(source.frameHueCustomized),
    texture: isRandom ? 'none' : String(source.texture || 'none'),
    textureTint: isRandom ? '#9b9b94' : String(source.textureTint || '#9b9b94'),
    randomPalette: isRandom ? randomPalette.slice(0, 3) : null
  };
}

function phase4Artwork(source, serial) {
  if (source.artMode === 'collection') {
    const entry = (Array.isArray(source.artEdition) ? source.artEdition : []).find((item, index) => Number(item.serial ?? index + 1) === serial) || {};
    return {
      assetId: entry.assetId || entry.assetKey || null,
      assetKey: entry.assetKey || '',
      url: entry.url || entry.src || '',
      x: Number(entry.x ?? source.artX ?? 50),
      y: Number(entry.y ?? source.artY ?? 50),
      scale: Number(entry.scale ?? 1)
    };
  }
  return {
    assetId: source.artAssetId || null,
    assetKey: source.artAssetId || '',
    url: source.artMode === 'random' ? '' : String(source.artSrc || ''),
    x: Number(source.artX ?? 50),
    y: Number(source.artY ?? 50),
    scale: 1
  };
}

function buildPhase4Assignments(compiled, source) {
  const supply = Math.max(1, Math.trunc(Number(compiled.edition?.supply || source.supply || 1)));
  const randomMode = Boolean(source.randomPassMode);
  const manualOption = randomMode ? null : approvedPackOptionForDesign(source);
  if (!randomMode && !manualOption) throw new Error('APPROVED_PASS_OPTION_REQUIRED');
  const seed = String(source.randomPassSeed || compiled.draftId || compiled.id || 'nexmarkets-random-v1');
  const editionId = String(compiled.id || compiled.draftId || `launch-${compiled.project?.name || 'edition'}`);
  return Array.from({ length: supply }, (_, index) => {
    const serial = index + 1;
    const artEntry = source.artMode === 'collection'
      ? (Array.isArray(source.artEdition) ? source.artEdition : []).find((item, itemIndex) => Number(item.serial ?? itemIndex + 1) === serial) || null
      : null;
    const authority = randomMode ? window.__nmV2RandomPassAssignment?.({ ...source, randomPassSeed: seed }, serial, artEntry) : null;
    if (randomMode && (!authority?.packId || !Array.isArray(authority.palette) || authority.palette.length < 3)) throw new Error(`RANDOM_PASS_ASSIGNMENT_REQUIRED:${serial}`);
    const optionId = randomMode ? String(authority.packId) : manualOption;
    const [family, material] = PHASE4_PACK_META[optionId] || [];
    if (!family || !material) throw new Error(`APPROVED_PASS_OPTION_REQUIRED:${serial}`);
    const visual = phase4Visual(source, optionId, randomMode ? authority.palette : null);
    const palette = randomMode
      ? { primary: authority.palette[0], secondary: authority.palette[1], accent: authority.palette[2] }
      : { primary: visual.colorStyle === 'gradient' ? visual.gradientA : visual.color, secondary: visual.colorStyle === 'gradient' ? visual.gradientB : visual.color, accent: visual.frameColor };
    const colourIndex = randomMode ? Number(authority.colourIndex) : -1;
    return {
      rendererVersion: 'pass-renderer-v1',
      editionId,
      passId: null,
      serial,
      supply,
      optionId,
      family,
      material,
      colorwayId: randomMode ? `colourway-${String(colourIndex + 1).padStart(2, '0')}` : PHASE4_MANUAL_COLORWAY,
      colorwayName: randomMode ? PHASE4_COLORWAY_NAMES[colourIndex] : 'Manual Phase 4',
      palette,
      visual,
      authorityAssignment: randomMode ? { ...authority, serial, palette: authority.palette.slice(0, 3) } : null,
      artwork: phase4Artwork(source, serial),
      logo: { assetId: source.logoAssetId || null, url: source.logoSrc || null },
      projectName: String(compiled.project?.name || ''),
      editionName: String(compiled.edition?.name || ''),
      seriesName: String(compiled.edition?.series || ''),
      holderState: null,
      frozen: false,
      frozenAt: null,
      randomAssignment: {
        enabled: randomMode,
        seed: randomMode ? seed : null,
        combinationIndex: randomMode ? Object.keys(PHASE4_PACK_META).indexOf(optionId) * 5 + colourIndex : -1,
        frozen: false
      }
    };
  });
}
window.__nmV2BuildPhase4Assignments = buildPhase4Assignments;

function sanitizeCompiledForApi(compiled) {
  const clone = JSON.parse(JSON.stringify(compiled));
  clone.referral = {
    enabled: Boolean(clone.referral?.enabled),
    rate: clone.referral?.enabled ? Number(clone.referral?.rate || 10) : 0,
    settlement: clone.referral?.settlement || 'Builder Settled'
  };
  clone.review = {
    evidence: Boolean(clone.review?.evidence),
    advantages: Boolean(clone.review?.advantages),
    preview: Boolean(clone.review?.preview)
  };
  if (Array.isArray(clone.advantages)) {
    clone.advantages = clone.advantages.map((adv) => ({
      ...adv,
      mechanism: String(adv?.mechanism || '').toLowerCase() === 'redemption' ? 'Redemption' : 'Connected'
    }));
  }
  if (clone.design) {
    const current = createDataValue();
    const phase4 = current && Object.keys(current).length ? { ...clone.design, ...current } : clone.design;
    if (clone.design.retiredPassDesign) throw new Error(`RETIRED_PASS_DESIGN:${clone.design.retiredPassDesign}`);
    const randomMode = Boolean(phase4.randomPassMode);
    const packOption = randomMode ? null : approvedPackOptionForDesign(phase4);
    if (!randomMode && !packOption) throw new Error('APPROVED_PASS_OPTION_REQUIRED');
    Object.assign(clone.design, {
      passDesign: phase4.passDesign,
      packOption,
      passFamily: randomMode ? 'random' : PHASE4_PACK_META[packOption][0],
      packFamily: randomMode ? 'random' : PHASE4_PACK_META[packOption][0],
      material: randomMode ? 'authority-assigned' : PHASE4_PACK_META[packOption][1],
      colorwayId: randomMode ? null : PHASE4_MANUAL_COLORWAY,
      palette: randomMode ? null : buildPhase4Assignments(clone, phase4)[0].palette,
      themeMode: phase4.themeMode,
      color: phase4.color,
      customColor: phase4.customColor || phase4.color || '#5f6f50',
      colorStyle: phase4.colorStyle,
      gradientA: phase4.gradientA,
      gradientB: phase4.gradientB,
      gradientDirection: phase4.gradientDirection,
      frame: phase4.frame,
      frameColor: phase4.frameColor,
      frameHueCustomized: Boolean(phase4.frameHueCustomized),
      texture: phase4.texture,
      textureTint: phase4.textureTint,
      logoSrc: phase4.logoSrc,
      logoAssetId: phase4.logoAssetId || '',
      artMode: phase4.artMode,
      artSrc: phase4.artSrc,
      artAssetId: phase4.artAssetId || '',
      artEdition: Array.isArray(phase4.artEdition) ? phase4.artEdition : [],
      artEditionView: phase4.artEditionView || 'grid',
      selectedSerialIndex: Number(phase4.artEditionSelected ?? phase4.selectedSerialIndex ?? 0),
      artX: Number(phase4.artX ?? 50),
      artY: Number(phase4.artY ?? 50),
      randomPassMode: randomMode,
      randomPassSeed: phase4.randomPassSeed || clone.draftId || clone.id,
      randomPoolVersion: 'v1'
    });
    if (clone.design.logoSrc?.startsWith('data:')) {
      if (clone.design.logoSrc.length > 2048) clone.design.logoSrc = '';
    }
    if (clone.design.artSrc?.startsWith('data:')) {
      if (clone.design.artSrc.length > 2048) clone.design.artSrc = '';
    }
    if (Array.isArray(clone.design.artEdition)) {
      clone.design.artEdition = clone.design.artEdition.map((item, idx) => ({
        assetKey: item.assetKey || item.storageKey || '',
        filename: item.filename || `artwork_${idx + 1}`,
        title: item.title || `Artwork ${idx + 1}`,
        type: item.type || item.mimeType || 'image/png',
        size: Number(item.size || item.byteSize || 0),
        sha256: item.sha256 || null,
        url: /^(https?:|\/)/i.test(String(item.url || item.src || '')) ? String(item.url || item.src) : '',
        serial: item.serial != null ? Number(item.serial) : idx + 1,
        traits: item.traits && typeof item.traits === 'object' ? item.traits : {}
      }));
    }
    clone.design.passAssignments = buildPhase4Assignments(clone, { ...phase4, ...clone.design });
  }
  if (clone.project?.banner) {
    const current = createDataValue();
    clone.project.banner.assetId = current?.bannerAssetId || clone.project.banner.assetId || '';
    if (clone.project.banner.src?.startsWith('data:')) {
      if (clone.project.banner.src.length > 2048) clone.project.banner.src = '';
    }
  }
  return clone;
}

function compiledForActiveNetwork(compiled) {
  const network = activeNetworkFamily();
  return {
    ...(compiled || {}),
    network,
    project: { ...(compiled?.project || {}), network },
    edition: { ...(compiled?.edition || {}), network }
  };
}

function approvedPackOptionForDesign(design = {}) {
  const explicit = String(design.packOption || design.packId || '').trim().toLowerCase();
  if (/^(classic|glass)-(obsidian|carbon|gilt)$/.test(explicit) && !(explicit.startsWith('glass-') && explicit.endsWith('-gilt'))) return explicit;
  if (/^pack-(slab|glass|metal|ceramic|blister|carbon|paper|resin)$/.test(explicit)) return explicit;
  const family = String(design.passDesign || '').trim().toLowerCase();
  if (family === 'classic') return `classic-${['obsidian', 'carbon', 'gilt'].includes(String(design.frame || '').toLowerCase()) ? String(design.frame).toLowerCase() : 'obsidian'}`;
  if (family === 'glass') return `glass-${['obsidian', 'carbon'].includes(String(design.frame || '').toLowerCase()) ? String(design.frame).toLowerCase() : 'obsidian'}`;
  if (/^pack-(slab|glass|metal|ceramic|blister|carbon|paper|resin)$/.test(family)) return family;
  return '';
}

const CREATE_PASS_FIELD_PATHS = Object.freeze([
  'network', 'draftId',
  'project.name', 'project.builder', 'project.builderHandle', 'project.desc', 'project.about', 'project.videoUrl',
  'project.category', 'project.productState', 'project.evidence.type', 'project.evidence.url', 'project.evidence.label',
  'project.supportUrl', 'project.banner.src', 'project.banner.assetId', 'project.banner.palette', 'project.banner.logoPosition', 'project.network',
  'edition.name', 'edition.series', 'edition.supply', 'edition.price', 'edition.royalty', 'edition.network',
  'advantages', 'referral.enabled', 'referral.rate', 'referral.settlement',
  'economics.maxPrimary', 'economics.nexMarketsFeeRate', 'economics.nexMarketsFee', 'economics.afterPlatformFee',
  'design.passDesign', 'design.packOption', 'design.packFamily', 'design.material', 'design.colorwayId', 'design.palette', 'design.passAssignments', 'design.randomPassMode', 'design.randomPassSeed', 'design.randomPoolVersion', 'design.themeMode', 'design.color', 'design.customColor', 'design.colorStyle',
  'design.gradientA', 'design.gradientB', 'design.gradientDirection', 'design.frame', 'design.frameHueCustomized',
  'design.frameColor', 'design.texture', 'design.textureTint', 'design.logoSrc', 'design.logoAssetId', 'design.artMode', 'design.artSrc', 'design.artAssetId',
  'design.artEdition', 'design.artEditionView', 'design.selectedSerialIndex', 'design.artX', 'design.artY',
  'preview.hours', 'preview.opensAt', 'preview.localOpensAt', 'preview.timezone', 'preview.termsVersion',
  'review.evidence', 'review.advantages', 'review.preview'
]);

function hasOwnPath(value, path) {
  return path.split('.').reduce((current, key) => (
    current !== null && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined
  ), value) !== undefined;
}

function assertCreatePassFieldCoverage(draft) {
  const missing = CREATE_PASS_FIELD_PATHS.filter((path) => !hasOwnPath(draft, path));
  if (missing.length) throw new Error(`CREATE_FIELDS_MISSING:${missing.join(',')}`);
  return draft;
}

function buildCreateEditionInput(compiled, projectId) {
  const edition = compiled.edition || {};
  const rawName = String(edition.name || compiled.project?.name || 'NexMarkets Edition').trim();
  const symbol = (String(edition.series || rawName).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 12) || 'NEX');
  const art = compiled.design?.artEdition?.[0] || compiled.design?.artEditionView || {};
  const hash = String(art.sha256 || '').trim();
  return { projectId, builderId: state.selectedBuilderId, name: rawName, symbol, editionId: randomBytes32(), absoluteSupplyCap: Number(edition.supply || 1), artworkCommitment: /^0x[0-9a-f]{64}$/i.test(hash) ? hash : randomBytes32(), baseTokenURI: String(compiled.design?.artSrc || compiled.project?.banner?.src || 'https://www.nexmarkets.xyz/v1/metadata/') };
}

async function buildCreateTermsInput(compiled, editionAddress) {
  const now = Math.floor(Date.now() / 1000);
  const previewStartsAt = now + 60;
  const mintStartsAt = previewStartsAt + 86400 + 60;
  const configs = finalLiveTermsConfigs(previewStartsAt, mintStartsAt + 30 * 86400);
  const hashResponse = await mutation('/v1/terms/hash', { configs });
  const advantagesHash = hashResponse?.advantagesHash || hashResponse?.data?.advantagesHash;
  if (!/^0x[0-9a-f]{64}$/i.test(String(advantagesHash || ''))) throw new Error('ADVANTAGES_COMMITMENT_UNAVAILABLE');
  const baseTerms = { activeSupply: Number(compiled.edition?.supply || 1), pricePerPass: String(Math.max(1, Math.round(Number(compiled.edition?.price || 1) * 1_000_000))), previewStartsAt, mintStartsAt, mintEndsAt: mintStartsAt + 30 * 86400, primaryRecipient: state.wallet, royaltyReceiver: state.wallet, royaltyBps: Math.max(0, Math.min(500, Math.round(Number(compiled.edition?.royalty || 0) * 100))), advantagesHash, referralTermsHash: `0x${'00'.repeat(32)}` };
  if (Number(state.config?.protocolVersion ?? 1) < 2) return { builderId: state.selectedBuilderId, edition: editionAddress, advantageConfigs: configs, terms: baseTerms };
  const create = createDataValue();
  const addresses = create.allowlistEnabled ? String(create.allowlistAddresses || '').split(/[\s,]+/).filter(Boolean) : [];
  const merkle = await mutation('/v1/allowlists/merkle', { addresses });
  const root = merkle?.root || merkle?.data?.root;
  if (!/^0x[0-9a-f]{64}$/i.test(String(root || ''))) throw new Error('ALLOWLIST_COMMITMENT_UNAVAILABLE');
  const allowlistHours = create.allowlistEnabled ? Math.max(1, Math.trunc(Number(create.allowlistHours || 24))) : 0;
  const allowlistSupply = create.allowlistEnabled ? Math.max(0, Math.trunc(Number(create.allowlistSupply || 0))) : 0;
  if (allowlistSupply > baseTerms.activeSupply) throw new Error('ALLOWLIST_SUPPLY_EXCEEDS_ACTIVE_SUPPLY');
  return { builderId: state.selectedBuilderId, edition: editionAddress, protocolVersion: 2, advantageConfigs: configs, allowlistAddresses: addresses, terms: { ...baseTerms, allowlistRoot: root, allowlistEndsAt: create.allowlistEnabled ? mintStartsAt + allowlistHours * 3600 : 0, allowlistSupply } };
}

function installMintAccessCreateFields() {
  const mount = document.getElementById('stageMount');
  if (!mount) return;
  const decorate = () => {
    if (Number(state.config?.protocolVersion ?? 1) < 2 || !document.getElementById('cOpensAt') || document.getElementById('nmCreateMintAccess')) return;
    const data = createDataValue();
    const panel = document.createElement('section');
    panel.id = 'nmCreateMintAccess';
    panel.className = 'nm-stage-section';
    panel.innerHTML = `<div class="nm-stage-section-label"><b>Early access</b><span>Optional allowlist phase before public mint.</span></div><div class="nm-stage-fields"><label class="switch-row"><span class="switch-copy"><b>Allowlist mints first</b><span>Public mint opens automatically when this phase ends.</span></span><input id="nmAllowlistEnabled" type="checkbox" ${data.allowlistEnabled ? 'checked' : ''}></label><div class="field"><label>Allowlisted wallet addresses</label><textarea id="nmAllowlistAddresses" rows="6" placeholder="One 0x address per line">${escapeHtml(data.allowlistAddresses || '')}</textarea></div><div class="two-col"><div class="field"><label>Private phase (hours)</label><input id="nmAllowlistHours" type="number" min="1" step="1" value="${escapeHtml(data.allowlistHours || 24)}"></div><div class="field"><label>Private phase supply</label><input id="nmAllowlistSupply" type="number" min="0" step="1" value="${escapeHtml(data.allowlistSupply || 0)}"><small class="field-help">Use 0 for no separate phase cap.</small></div></div></div>`;
    mount.append(panel);
    const sync = () => updateCreateData({ allowlistEnabled: Boolean(document.getElementById('nmAllowlistEnabled')?.checked), allowlistAddresses: document.getElementById('nmAllowlistAddresses')?.value || '', allowlistHours: Number(document.getElementById('nmAllowlistHours')?.value || 24), allowlistSupply: Number(document.getElementById('nmAllowlistSupply')?.value || 0) }, false);
    panel.addEventListener('input', sync);
    panel.addEventListener('change', sync);
  };
  new MutationObserver(decorate).observe(mount, { childList: true, subtree: true });
  decorate();
}

// Keep the old diagnostic alias for integrations that used the draft name.
window.__nmV2CreatePassFieldPaths = CREATE_PASS_FIELD_PATHS;
window.__nmV2CreateDraftFieldPaths = CREATE_PASS_FIELD_PATHS;

async function submitCreatePass() {
  const mount = document.getElementById('projectActionMount');
  try {
    const getter = typeof window.__nmV2CompileCreateLaunch === 'function' ? window.__nmV2CompileCreateLaunch : (typeof window.compileCreateLaunch === 'function' ? window.compileCreateLaunch : null);
    if (!getter) throw new Error('CREATE_WIZARD_UNAVAILABLE');
    const compiled = compiledForActiveNetwork(getter());
    if (!compiled) throw new Error('COMPILED_LAUNCH_UNAVAILABLE');
    const cleanDraft = assertCreatePassFieldCoverage(sanitizeCompiledForApi(compiled));
    applyMintAccessDraft(cleanDraft);
    cleanDraft.status = 'PUBLISHED';
    const slug = (window.slugKey ? window.slugKey(compiled.project?.name || '') : compiled.id?.replace(/^launch-/, '')) || 'launch-draft';
    const name = compiled.project?.name || compiled.edition?.name || 'Untitled';
    const summary = compiled.project?.desc || compiled.project?.about?.slice(0, 500) || '';

    if (!state.authenticated || !state.wallet) {
      if (mount) mount.innerHTML = `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>Connecting wallet</h3><p>Connecting your Builder wallet on ${escapeHtml(activeNetworkName())}.</p></div>`;
      await authenticate({ throwOnError: true });
    }

    if (mount) {
      mount.innerHTML = `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>Creating Pass</h3><p>Saving your published Pass to NexMarkets.</p></div>`;
    }

    // Keep the Product private while the wallet completes the on-chain half
    // of publication. It becomes public only after the Edition receipt and
    // Terms v1 receipt have both been verified below.
    const payload = {
      slug,
      name,
      summary,
      builderId: state.selectedBuilderId,
      status: 'DRAFT',
      intent: 'DRAFT',
      launchDraft: cleanDraft
    };

    const project = await read('/v1/builder/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': state.csrfToken || sessionStorage.getItem('nex_csrf') || ''
      },
      body: JSON.stringify(payload)
    });

    state.lastSavedProject = project;
    const editionInput = buildCreateEditionInput(compiled, project.id);
    if (mount) mount.innerHTML = `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>Creating Edition</h3><p>Confirm the ${escapeHtml(activeNetworkName())} Factory transaction.</p></div>`;
    const created = await createEditionOnchain(editionInput);
    if (mount) mount.innerHTML = `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>Publishing Terms</h3><p>Confirm the launch Terms transaction.</p></div>`;
    const termsResult = await publishTerms(await buildCreateTermsInput(compiled, created.edition));
    await wallet.waitForReceipt(termsResult.txHash);
    // Promotion is a normal idempotent project write, but it is intentionally
    // unreachable until both receipt-bound operations above have succeeded.
    // This prevents a failed Factory/Terms transaction from leaving a public
    // Terms-less launch behind.
    const published = await read('/v1/builder/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': state.csrfToken || sessionStorage.getItem('nex_csrf') || ''
      },
      body: JSON.stringify({ ...payload, status: 'PUBLISHED', intent: 'PUBLISHED', publicationMode: 'ONCHAIN', launchDraft: { ...cleanDraft, editionAddress: created.edition, editionTxHash: created.txHash, termsTxHash: termsResult.txHash } })
    });
    state.lastSavedProject = published;
    sessionStorage.setItem(`nexmarkets_terms_published:${lower(created.edition)}`, '1');

    const launchRow = {
      id: project.id || `launch-${slug}`,
      name: `${name} ${compiled.edition?.name || 'Edition'}`,
      project: name,
      state: 'Preview',
      network: compiled.network || activeNetworkFamily(),
      minted: 0,
      supply: compiled.edition?.supply || 1,
      price: compiled.edition?.price || 0,
      primary: 0,
      timing: 'Pass created · Preview pending',
      collection: slug,
      evidence: compiled.project?.evidence?.url || '',
      editionAddress: created.edition,
      txHash: created.txHash,
      termsTxHash: termsResult.txHash,
      termsPublished: true
    };

    // This legacy object is intentionally never written to the template. The
    // authenticated dashboard is rebuilt from the API projection.
    if (false && window.dashboardState) {
      window.dashboardState.launches = window.dashboardState.launches || [];
      const oldIdx = window.dashboardState.launches.findIndex((x) => x.id === launchRow.id || x.project === name);
      if (oldIdx >= 0) window.dashboardState.launches[oldIdx] = launchRow;
      else window.dashboardState.launches.unshift(launchRow);
      if (typeof window.dashAddActivity === 'function') {
        window.dashAddActivity('launch', `${name} Pass created`, 'No approval required', 'Created');
      }
    }

    if (false && window.createData) {
      window.createData.published = true;
    }
    if (typeof window.clearCreateDraft === 'function') {
      window.clearCreateDraft();
    }
    await hydrate();

    if (mount) {
      mount.innerHTML = `
        <div class="create-publish-success">
          <div class="create-publish-mark">✓</div>
          <h3>Pass created</h3>
          <p><strong>${escapeHtml(name)}</strong> is published on ${escapeHtml(activeNetworkName())}. Edition creation and Terms v1 publication are complete.</p>
          <div class="project-action-buttons" style="justify-content:center">
            <button class="btn" onclick="closeProjectAction();go('dashboard');setTimeout(()=>dashGo('launches'),30)">Dashboard</button>
            <button class="btn primary" onclick="closeProjectAction();go('dashboard');setTimeout(()=>dashGo('launches'),30)">Manage Pass</button>
          </div>
        </div>
      `;
    }
    showRuntimeBanner('Pass created');
    return published;
  } catch (error) {
    if (mount) {
      mount.innerHTML = `
        <div class="create-publish-error" style="text-align:center;padding:24px">
          <h3 style="color:#e05252;margin-bottom:8px">Pass creation failed</h3>
          <p style="color:#c5cec4;margin-bottom:16px">${escapeHtml(error.message)}</p>
          <div class="project-action-buttons" style="justify-content:center">
            <button class="btn" onclick="closeProjectAction()">Close</button>
            <button class="btn primary" onclick="window.__nmV2SubmitCreatePass?.()">Try again</button>
          </div>
        </div>
      `;
    }
    showRuntimeBanner(`Pass creation failed: ${error.message}`, true);
    throw error;
  }
}

async function submitCreateDraft() {
  const mount = document.getElementById('projectActionMount');
  try {
    const getter = typeof window.__nmV2CompileCreateLaunch === 'function' ? window.__nmV2CompileCreateLaunch : (typeof window.compileCreateLaunch === 'function' ? window.compileCreateLaunch : null);
    if (!getter) throw new Error('CREATE_WIZARD_UNAVAILABLE');
    const compiled = compiledForActiveNetwork(getter());
    if (!compiled) throw new Error('COMPILED_LAUNCH_UNAVAILABLE');
    const cleanDraft = assertCreatePassFieldCoverage(sanitizeCompiledForApi(compiled));
    applyMintAccessDraft(cleanDraft);
    cleanDraft.status = 'DRAFT';
    const draftId = String(cleanDraft.draftId || state.lastDraftId || `draft-${uuid()}`).slice(0, 120);
    cleanDraft.draftId = draftId;
    const slug = (window.slugKey ? window.slugKey(cleanDraft.project?.name || '') : draftId.replace(/^draft-/, '')) || `draft-${Date.now()}`;
    const name = cleanDraft.project?.name || cleanDraft.edition?.name || 'Untitled draft';
    const summary = cleanDraft.project?.desc || cleanDraft.project?.about?.slice(0, 500) || '';

    if (!state.authenticated || !state.wallet) {
      if (mount) mount.innerHTML = `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>Connecting wallet</h3><p>Connecting your Builder wallet on ${escapeHtml(activeNetworkName())}.</p></div>`;
      await authenticate({ throwOnError: true });
    }
    if (mount) mount.innerHTML = `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>Saving draft</h3><p>Saving this Create workflow to your NexMarkets workspace.</p></div>`;
    const project = await read('/v1/builder/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': state.csrfToken || sessionStorage.getItem('nex_csrf') || '',
        'idempotency-key': draftId
      },
      body: JSON.stringify({ slug, name, summary, builderId: state.selectedBuilderId, status: 'DRAFT', intent: 'DRAFT', launchDraft: cleanDraft })
    });
    state.lastDraftId = project.content?.draftId || project.launchDraft?.draftId || draftId;
    state.lastSavedProject = project;
    if (mount) {
      mount.innerHTML = `<div class="create-publish-success"><div class="create-publish-mark">✓</div><h3>Draft saved</h3><p><strong>${escapeHtml(name)}</strong> is saved to your NexMarkets workspace. On-chain Edition deployment is a separate next step.</p><div class="project-action-buttons" style="justify-content:center"><button class="btn primary" onclick="closeProjectAction();go('dashboard');setTimeout(()=>dashGo('launches'),30)">Dashboard</button></div></div>`;
    }
    showRuntimeBanner('Draft saved');
    return project;
  } catch (error) {
    if (mount) mount.innerHTML = `<div class="create-publish-error" style="text-align:center;padding:24px"><h3 style="color:#e05252;margin-bottom:8px">Draft save failed</h3><p style="color:#c5cec4;margin-bottom:16px">${escapeHtml(error.message)}</p><div class="project-action-buttons" style="justify-content:center"><button class="btn" onclick="closeProjectAction()">Close</button><button class="btn primary" onclick="window.__nmV2SubmitCreateDraft?.()">Try again</button></div></div>`;
    showRuntimeBanner(`Draft save failed: ${error.message}`, true);
    throw error;
  }
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() || `nm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function randomBytes32() {
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(32));
  if (bytes) return `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  return `0x${'00'.repeat(32)}`;
}
function parseUnits(value, decimals = Number(state.config?.settlementDecimals ?? 6)) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('POSITIVE_DECIMAL_REQUIRED');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals && /[^0]/.test(fraction.slice(decimals))) throw new Error('TOO_MANY_DECIMAL_PLACES');
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction.slice(0, decimals)).padEnd(decimals, '0') || '0');
}
function formatUnits(value, decimals = Number(state.config?.settlementDecimals ?? 6)) {
  try {
    const amount = BigInt(value); const base = 10n ** BigInt(decimals); const whole = amount / base;
    const fraction = String(amount % base).padStart(decimals, '0').replace(/0+$/, '');
    return `${whole}${fraction ? `.${fraction}` : ''}`;
  } catch { return '0'; }
}
function activeContracts() {
  const contracts = state.config?.contracts || {};
  return {
    ...contracts,
    settlementToken: state.config?.settlementToken,
    settlementDecimals: Number(state.config?.settlementDecimals ?? 6),
    settlementSymbol: activeSettlementSymbol(),
    seaport: state.config?.seaport16,
    protocolAdminSafe: state.config?.protocolAdminSafe
  };
}
async function mutation(path, payload = {}, { idempotencyKey = uuid() } = {}) {
  return read(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': state.csrfToken || sessionStorage.getItem('nex_csrf') || '',
      'idempotency-key': idempotencyKey
    },
    body: JSON.stringify(payload)
  });
}
async function requireSession() {
  if (!state.config) await loadConfig();
  const requiredChain = Number(state.config?.chainId);
  if (!state.wallet || !state.authenticated || Number(wallet.chainId) !== requiredChain) await authenticate({ throwOnError: true });
  if (!state.wallet || !state.authenticated) throw new Error('CONNECT_WALLET_FIRST');
  if (Number(wallet.chainId) !== requiredChain) throw new Error(`SWITCH_TO_${activeNetworkFamily() === 'base' ? 'BASE' : 'ROBINHOOD'}_${requiredChain}`);
  return state.wallet;
}
async function requireConnectedWallet() {
  if (!state.config) await loadConfig();
  const requiredChain = Number(state.config?.chainId);
  if (!state.wallet || Number(wallet.chainId) !== requiredChain) {
    const provider = await getWalletProvider();
    if (provider) wallet.setProvider(provider);
    const identity = await wallet.connect(requiredChain);
    state.wallet = identity.address;
    setAccountLabel(short(identity.address));
  }
  if (!state.wallet) throw new Error('CONNECT_WALLET_FIRST');
  return state.wallet;
}
async function recordTransactionEvent(transactionId, nextState, txHash = null) {
  if (!transactionId) return null;
  return mutation(`/v1/transactions/${encodeURIComponent(transactionId)}/events`, {
    state: nextState,
    txHash,
    eventId: `${transactionId}:${nextState}:${txHash || uuid()}`
  });
}
async function submitPrepared(response, { label = 'Transaction', preparedOverride = null } = {}) {
  const transaction = response?.transaction;
  const prepared = preparedOverride || response?.prepared;
  if (!transaction?.id || !prepared?.to || !prepared?.data) throw new Error('PREPARED_TRANSACTION_REQUIRED');
  await recordTransactionEvent(transaction.id, 'WALLET_PENDING');
  try {
    const txHash = await wallet.submit({ ...prepared, value: prepared.value || '0x0' });
    await recordTransactionEvent(transaction.id, 'SUBMITTED', txHash);
    showRuntimeBanner(`${label} submitted · ${short(txHash)}`);
    return { ...response, txHash };
  } catch (error) {
    await recordTransactionEvent(transaction.id, 'CANCELLED').catch(() => {});
    throw error;
  }
}
async function ensureErc20Allowance(amount) {
  const contracts = activeContracts();
  if (!address(contracts.settlementToken) || !address(contracts.mintController) || !address(contracts.seaport)) throw new Error('SETTLEMENT_CONTRACT_CONFIGURATION_REQUIRED');
  const [balance, allowance] = await Promise.all([
    wallet.erc20Balance(contracts.settlementToken),
    wallet.erc20Allowance(contracts.settlementToken, state.wallet, contracts.seaport)
  ]);
  if (balance < amount) throw new Error(`INSUFFICIENT_${contracts.settlementSymbol.toUpperCase()}_BALANCE`);
  if (allowance >= amount) return;
  showRuntimeBanner(`Approve ${contracts.settlementSymbol} spending in your wallet`);
  const approvalHash = await wallet.approveErc20(contracts.settlementToken, contracts.seaport, amount);
  await wallet.waitForReceipt(approvalHash);
  const refreshed = await wallet.erc20Allowance(contracts.settlementToken, state.wallet, contracts.seaport);
  if (refreshed < amount) throw new Error(`${contracts.settlementSymbol.toUpperCase()}_APPROVAL_REQUIRED`);
}
async function ensureMintAllowance(amount) {
  const contracts = activeContracts();
  if (!address(contracts.settlementToken) || !address(contracts.mintController)) throw new Error('SETTLEMENT_CONTRACT_CONFIGURATION_REQUIRED');
  const [balance, allowance] = await Promise.all([
    wallet.erc20Balance(contracts.settlementToken),
    wallet.erc20Allowance(contracts.settlementToken, state.wallet, contracts.mintController)
  ]);
  if (balance < amount) throw new Error(`INSUFFICIENT_${contracts.settlementSymbol.toUpperCase()}_BALANCE`);
  if (allowance >= amount) return;
  showRuntimeBanner(`Approve ${contracts.settlementSymbol} spending in your wallet`);
  const approvalHash = await wallet.approveErc20(contracts.settlementToken, contracts.mintController, amount);
  await wallet.waitForReceipt(approvalHash);
  const refreshed = await wallet.erc20Allowance(contracts.settlementToken, state.wallet, contracts.mintController);
  if (refreshed < amount) throw new Error(`${contracts.settlementSymbol.toUpperCase()}_APPROVAL_REQUIRED`);
}
async function ensureNftApproval(edition) {
  const contracts = activeContracts();
  if (!address(edition) || !address(contracts.seaport)) throw new Error('NFT_MARKET_CONFIGURATION_REQUIRED');
  if (await wallet.erc721IsApprovedForAll(edition, state.wallet, contracts.seaport)) return;
  showRuntimeBanner('Approve Seaport to transfer this Pass if it sells');
  const approvalHash = await wallet.approveErc721ForAll(edition, contracts.seaport, true);
  await wallet.waitForReceipt(approvalHash);
  if (!await wallet.erc721IsApprovedForAll(edition, state.wallet, contracts.seaport)) throw new Error('NFT_APPROVAL_REQUIRED');
}
function actionModal(surface, html) {
  if (surface === 'dashboard') {
    const body = document.getElementById('dashModalBody');
    if (body) body.innerHTML = html;
    return;
  }
  const mount = document.getElementById('projectActionMount');
  if (!mount) return;
  mount.innerHTML = html;
  document.getElementById('projectActionModal')?.classList.add('open');
}
function actionState(surface, title, message) {
  // Safe evidence forms must remain mounted until their values are captured by
  // the submit callback. Use the runtime banner for that short verification
  // step instead of replacing the form before the callback can read it.
  if (surface === 'dashboard' && document.getElementById('nmSafeTxHash')) {
    showRuntimeBanner(`${title}: ${message}`);
    return;
  }
  actionModal(surface, `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div>`);
}
function explorerTransactionUrl(txHash) {
  if (!txHash || !state.config?.explorer) return '';
  return `${String(state.config.explorer).replace(/\/$/, '')}/tx/${txHash}`;
}
function actionSuccess(surface, label, result) {
  const txHash = result?.txHash || '';
  const link = explorerTransactionUrl(txHash);
  actionModal(surface, `<div class="market-tx-state"><div class="market-tx-success">✓</div><h3>${escapeHtml(label)} submitted</h3><p>The wallet broadcast the transaction. NexMarkets will update the projection after confirmation.</p>${txHash ? `<p><code>${escapeHtml(txHash)}</code></p>${link ? `<p><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">View on ${escapeHtml(activeNetworkName())} explorer ↗</a></p>` : ''}<div class="market-buy-actions" style="justify-content:center"><button class="btn" onclick="closeProjectAction();closeDashModal()">Close</button><button class="btn primary" onclick="window.nexmarketsV2.refresh()">Refresh data</button></div>` : ''}</div>`);
}
function actionError(surface, error) {
  const message = error?.message || String(error);
  actionModal(surface, `<div class="create-publish-error" style="text-align:center;padding:24px"><h3 style="color:#e05252;margin-bottom:8px">Action failed</h3><p style="color:#c5cec4;margin-bottom:16px">${escapeHtml(message)}</p><div class="project-action-buttons" style="justify-content:center"><button class="btn" onclick="closeProjectAction();closeDashModal()">Close</button></div></div>`);
  showRuntimeBanner(message, true);
}
async function resolveEditionByAddress(value) {
  const target = address(value);
  if (!target) throw new Error('EDITION_ADDRESS_REQUIRED');
  // Always ask the canonical Edition endpoint first. Discover is intentionally
  // a compact public summary and may omit the committed Advantage definitions
  // needed by mint/listing flows; returning that summary here silently turned
  // a real Terms snapshot into an empty config set. A cached row remains a
  // safe fallback for a transient read-model miss.
  try {
    const raw = await read(`/v1/editions/${target}`);
    const edition = normalizeEdition(raw, null);
    if (edition) return edition;
  } catch { /* fall through to the already hydrated canonical cache */ }
  const known = knownEdition(target);
  if (known) return known;
  throw new Error('EDITION_NOT_FOUND');
}
async function resolveEditionForProject(name) {
  const project = state.projects.find((item) => String(item.name).toLowerCase() === String(name || '').toLowerCase());
  const target = project?.editionAddress || (state.detailProject?.name === project?.name ? state.detailProject.editionAddress : null);
  if (!target) throw new Error('EDITION_ADDRESS_REQUIRED');
  return resolveEditionByAddress(target);
}
function selectedListingRecord() {
  const selection = window.__nmV2GetSelections?.() || {};
  const selected = selection.listing || state.templateData?.selectedListing || '';
  return state.listings.find((listing) => listing.name === selected || lower(listing.orderHash) === lower(selected)) || (state.listings.length === 1 ? state.listings[0] : null);
}
async function resolveSelectedListing() {
  const listing = selectedListingRecord();
  if (!listing) throw new Error('LISTING_NOT_FOUND');
  if (!listing.orderHash || !listing.signature || !listing.order) throw new Error('SIGNED_LISTING_CONFIGURATION_REQUIRED');
  return listing;
}
async function resolveOwnedPass(key) {
  const rows = state.templateData?.ownedPasses || [];
  const selected = rows.find((pass) => pass.key === key) || rows[0];
  if (!selected) throw new Error('OWNED_PASS_REQUIRED');
  const edition = await resolveEditionByAddress(selected.editionAddress);
  const raw = await read(`/v1/passes/${edition.address}/${encodeURIComponent(selected.tokenId)}`);
  const pass = normalizePass(raw || selected, edition);
  if (!pass?.edition_address || !pass?.token_id) throw new Error('OWNED_PASS_DATA_REQUIRED');
  return { view: selected, raw: raw || selected, pass, edition };
}
function listingForPass(pass) {
  return state.listings.find((listing) => lower(listing.edition_address) === lower(pass.edition_address) && String(listing.token_id) === String(pass.token_id));
}
function selectedAdvantage(id, passKey = null) {
  return state.builderDashboard && state.templateData?.dashboardState?.advantages?.find((advantage) => advantage.id === id || (!id && advantage.passKey === passKey))
    || (state.templateData?.dashboardState?.advantages || []).find((advantage) => advantage.id === id || (!id && advantage.passKey === passKey));
}

function wireWallet() {
  let isConnectingFromUi = false;
  const connectFromButton = async () => {
    if (isConnectingFromUi) return;
    isConnectingFromUi = true;
    try {
      if (state.wallet && !state.authenticated) {
        return await authenticateOnce();
      }
      const method = await chooseAuthMethod();
      if (method === 'cancel') return;
      state.connecting = true;
      state.connectingMessage = 'Connecting...';
      setAccountLabel('Connecting...');
      if (method === 'cdp') {
        await connectCdpFromUi();
        return;
      }
      walletMode = 'rainbow';
      const opened = await openConnectModal({ chainId: Number(state.config?.chainId || CHAIN_ID), chainIds: availableChainIds() });
      if (opened?.isAccountModal) {
        state.connecting = false;
        state.connectingMessage = null;
        setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
        return;
      }
      if (!opened?.address) await waitForConnection();
      await authenticateOnce();
    } catch (error) {
      showRuntimeBanner(error.message, true);
    } finally {
      state.connecting = false;
      state.connectingMessage = null;
      isConnectingFromUi = false;
      setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
    }
  };
  connectWalletFromUi = connectFromButton;
  document.addEventListener('click', async (event) => {
    const chip = event.target.closest('.account-chip, #dashboard .p10-connected, #dashboard .p10-account, #dashboard .dash-person');
    if (!chip) return;
    if (chip.matches('[onclick]')) chip.removeAttribute('onclick');
    chip.querySelectorAll('[onclick]').forEach((element) => element.removeAttribute('onclick'));
    if (!state.wallet) {
      await connectFromButton();
    } else if (!state.authenticated) {
      await authenticateOnce();
    } else {
      if (walletMode === 'cdp') await window.nmSignOut?.();
      else openAccountModal();
    }
  });
  document.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const chip = event.target.closest('.account-chip, #dashboard .p10-connected, #dashboard .p10-account, #dashboard .dash-person');
    if (!chip) return;
    event.preventDefault();
    if (!state.wallet) {
      await connectFromButton();
    } else if (!state.authenticated) {
      await authenticateOnce();
    } else {
      if (walletMode === 'cdp') await window.nmSignOut?.();
      else openAccountModal();
    }
  });

  onAccountChange(async (newAddress) => {
    if (walletMode === 'cdp') return;
    if (isConnectingFromUi || authenticationPromise) return;
    if (newAddress && newAddress.toLowerCase() !== (state.wallet || '').toLowerCase()) {
      walletMode = 'rainbow';
      cdpSession = null;
      state.wallet = newAddress;
      ensureNetworkSelectors();
      const serverSession = await checkSessionOnServer(state.networkKey);
      if (isConnectingFromUi || authenticationPromise) return;
      if (state.authenticated && state.wallet?.toLowerCase() === newAddress.toLowerCase()) return;
      if (serverSession?.authenticated && serverSession.wallet?.toLowerCase() === newAddress.toLowerCase()) {
        state.authenticated = true;
        if (serverSession.csrfToken) {
          state.csrfToken = serverSession.csrfToken;
          sessionStorage.setItem('nex_csrf', serverSession.csrfToken);
        }
        setAccountLabel(short(newAddress));
        await hydrate({ authenticatedOverride: true });
      } else {
        if (state.authenticated && state.wallet?.toLowerCase() === newAddress.toLowerCase()) return;
        state.authenticated = false;
        state.csrfToken = null;
        sessionStorage.removeItem('nex_csrf');
        setAccountLabel(short(newAddress));
        await hydrate({ authenticatedOverride: false });
      }
    } else if (!newAddress && state.wallet) {
      if (isConnectingFromUi || authenticationPromise) return;
      walletMode = null;
      cdpSession = null;
      state.wallet = null;
      state.authenticated = false;
      state.csrfToken = null;
      sessionStorage.removeItem('nex_csrf');
      setAccountLabel('Connect wallet');
      ensureNetworkSelectors();
      await hydrate();
    }
  });

  onChainChange(async (newChainId) => {
    const required = Number(state.config?.chainId || CHAIN_ID);
    const matching = networkOptions().find(({ config }) => Number(config.chainId) === Number(newChainId));
    if (matching && matching.key !== state.networkKey) {
      try { await switchNetwork(matching.key, { switchWallet: false }); } catch (error) { showRuntimeBanner(error.message, true); }
      return;
    }
    if (newChainId && newChainId !== required) {
      const family = activeNetworkFamily() === 'base' ? 'BASE' : 'ROBINHOOD';
      showRuntimeBanner(`SWITCH_TO_${family}_${required}`, true);
    }
  });
}

async function initWalletSession() {
  const hasStoredSession = Boolean(sessionStorage.getItem('nex_csrf'));
  const hasStoredWallet = Boolean(
    typeof localStorage !== 'undefined' && (
      localStorage.getItem('wagmi.recentConnectorId') ||
      localStorage.getItem('wagmi.store') ||
      localStorage.getItem('nexmarkets_connected_wallet')
    )
  );

  if (hasStoredSession || hasStoredWallet) {
    state.connecting = true;
    setAccountLabel('Connecting...');
  }

  if (hasStoredSession || hasStoredWallet) {
    try {
      const serverSession = await checkSessionOnServer(state.networkKey);
      if (serverSession?.authenticated && serverSession.wallet) {
        state.wallet = serverSession.wallet;
        state.authenticated = true;
        if (serverSession.csrfToken) {
          state.csrfToken = serverSession.csrfToken;
          sessionStorage.setItem('nex_csrf', serverSession.csrfToken);
        }
        setAccountLabel(short(serverSession.wallet));
      }
    } catch {}
  }

  const canUseRainbowKit = typeof window !== 'undefined' && !window.__nexmarketsUseInjectedFallback;
  if (hasStoredWallet && canUseRainbowKit) {
    try {
      await initModal({
        initialChainId: Number(state.config?.chainId || CHAIN_ID),
        chainIds: availableChainIds()
      });
    } catch (error) {
      console.warn('Wallet provider background initialization:', error);
    }
  }

  state.connecting = false;
  setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
}
async function liveOpenProjectMint(name) {
  try {
    const edition = await resolveEditionForProject(name);
    const terms = termsOf(edition).current;
    if (!terms || !termHash(terms)) throw new Error('ACTIVE_TERMS_REQUIRED');
    if (edition.status !== 'live' || edition.disabled) throw new Error(`MINT_NOT_OPEN_${String(edition.status || 'UNKNOWN').toUpperCase()}`);
    state.pendingMint = { edition, terms };
    actionModal('project', `<div class="nm-mint-shell"><div class="nm-mint-head"><div><span>GET THE PASS</span><h2>Review ${escapeHtml(edition.name)} Pass</h2></div><small>${escapeHtml(activeNetworkName())}</small></div><div class="nm-mint-review"><div><div class="nm-mint-lines"><div class="nm-mint-line"><span>Edition</span><strong>${escapeHtml(edition.name)}</strong></div><div class="nm-mint-line"><span>Pass price</span><strong>${escapeHtml(formatUnits(terms.pricePerPass))} ${escapeHtml(activeSettlementSymbol())}</strong></div><div class="nm-mint-line"><span>Current Terms</span><strong>${escapeHtml(termHash(terms))}</strong></div><div class="nm-mint-line"><span>Committed Advantages</span><strong>${terms.advantageConfigs?.length || 0}</strong></div><div class="nm-mint-line"><span>Quantity</span><strong><input id="nmLiveMintQuantity" type="number" min="1" max="20" value="1" style="max-width:92px"></strong></div></div><p class="nm-mint-note">Your wallet will approve settlement and sign the exact onchain mint transaction. The serial is assigned by the Edition contract after confirmation.</p><div class="nm-mint-actions"><button class="btn" onclick="closeProjectAction()">Cancel</button><button class="btn primary" onclick="window.confirmProjectMint()">Confirm purchase</button></div></div></div></div>`);
  } catch (error) { actionError('project', error); }
}
async function liveConfirmProjectMint() {
  try {
    const pending = state.pendingMint;
    if (!pending) throw new Error('MINT_REVIEW_REQUIRED');
    const quantity = Number(document.getElementById('nmLiveMintQuantity')?.value || 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('INVALID_MINT_QUANTITY');
    actionState('project', 'Preparing your Pass', `Checking ${activeSettlementSymbol()} balance, approval, and current Terms.`);
    await requireSession();
    const edition = await resolveEditionByAddress(pending.edition.address);
    const terms = termsOf(edition).current;
    if (!terms || !termHash(terms) || edition.status !== 'live' || edition.disabled) throw new Error('MINT_TERMS_CHANGED_OR_CLOSED');
    const configs = Array.isArray(terms.advantageConfigs) ? terms.advantageConfigs : [];
    if (terms.advantagesHash !== `0x${'00'.repeat(32)}` && !configs.length) throw new Error('MINT_ADVANTAGE_CONFIG_UNAVAILABLE');
    const total = BigInt(terms.pricePerPass) * BigInt(quantity);
    await ensureMintAllowance(total);
    actionState('project', 'Preparing your Pass', 'The API is locking the current Terms snapshot before your wallet signs.');
    const response = await mutation('/v1/mints/prepare', {
      edition: edition.address,
      termsVersionHash: termHash(terms),
      recipient: state.wallet,
      quantity,
      advantageConfigs: configs
    });
    const result = await submitPrepared(response, { label: 'Mint' });
    state.pendingMint = null;
    actionSuccess('project', 'Mint', result);
  } catch (error) { actionError('project', error); }
}
async function liveOpenBuy() {
  try {
    const listing = await resolveSelectedListing();
    state.pendingBuy = listing;
    actionModal('project', `<div class="nm-mint-shell"><div class="nm-mint-head"><div><span>BUY THIS PASS</span><h2>Confirm ${escapeHtml(listing.name)}</h2></div><small>${escapeHtml(activeNetworkName())}</small></div><div class="nm-mint-review"><div><div class="nm-mint-lines"><div class="nm-mint-line"><span>Listing price</span><strong>${escapeHtml(formatUnits(listing.raw?.price_usdg ?? listing.price_usdg ?? 0))} ${escapeHtml(activeSettlementSymbol())}</strong></div><div class="nm-mint-line"><span>Remaining Advantage</span><strong>${escapeHtml(listing.remaining)}</strong></div><div class="nm-mint-line"><span>Seller</span><strong>${escapeHtml(listing.owner)}</strong></div><div class="nm-mint-line total"><span>Total paid</span><strong>${escapeHtml(formatUnits(listing.raw?.price_usdg ?? listing.price_usdg ?? 0))} ${escapeHtml(activeSettlementSymbol())}</strong></div></div><p class="nm-mint-note">The API verified the seller’s Seaport signature and exact fee/royalty split. Your wallet will approve settlement and sign the fulfillment transaction.</p><div class="nm-mint-actions"><button class="btn" onclick="closeProjectAction()">Cancel</button><button class="btn primary" onclick="window.marketConfirmBuy()">Confirm purchase</button></div></div></div></div>`);
  } catch (error) { actionError('project', error); }
}
async function liveMarketConfirmBuy() {
  try {
    const listing = state.pendingBuy || await resolveSelectedListing();
    actionState('project', 'Preparing purchase', `Checking ${activeSettlementSymbol()} balance and Seaport approval for ${listing.name}.`);
    await requireSession();
    const current = await resolveSelectedListing();
    const amount = BigInt(current.raw?.price_usdg ?? current.price_usdg ?? 0);
    if (amount <= 0n) throw new Error('LISTING_PRICE_REQUIRED');
    await ensureErc20Allowance(amount);
    const response = await mutation('/v1/listings/buy', { orderHash: current.orderHash });
    const result = await submitPrepared(response, { label: 'Purchase' });
    state.pendingBuy = null;
    actionSuccess('project', 'Purchase', result);
  } catch (error) { actionError('project', error); }
}
function dashboardListingRecord(id) {
  return (state.templateData?.dashboardState?.listings || []).find((listing) => listing.id === id || listing.orderHash === id) || null;
}
async function liveOpenListing(key, { defaultPrice = null } = {}) {
  try {
    const context = await resolveOwnedPass(key);
    const existing = listingForPass(context.pass);
    if (existing) throw new Error('PASS_ALREADY_LISTED');
    state.pendingListing = context;
    const fallback = defaultPrice ?? context.edition.price ?? 0;
    actionModal('dashboard', `<div class="dash-modal-field"><label>Listing price (${escapeHtml(activeSettlementSymbol())})</label><input id="nmLiveListingPrice" type="number" min="0.000001" step="0.000001" value="${escapeHtml(Number(fallback).toFixed(6))}"></div><div class="dash-modal-field"><label>Listing duration (days)</label><input id="nmLiveListingDays" type="number" min="1" max="180" value="30"></div><p class="dash-modal-copy">The Seaport order is signed by your wallet. The Pass and its remaining Advantage transfer only when a buyer’s fulfillment transaction succeeds.</p>`, 'Sign and list', () => { liveConfirmListing().catch((error) => actionError('dashboard', error)); });
    window.openDashModal?.(`List ${context.pass.name} ${padSerial(context.pass.token_id)}`, document.getElementById('dashModalBody')?.innerHTML || '', 'Sign and list', () => { liveConfirmListing().catch((error) => actionError('dashboard', error)); });
  } catch (error) { actionError('dashboard', error); }
}
async function liveConfirmListing() {
  try {
    const context = state.pendingListing;
    if (!context) throw new Error('LISTING_REVIEW_REQUIRED');
    const priceInput = document.getElementById('nmLiveListingPrice')?.value;
    const days = Number(document.getElementById('nmLiveListingDays')?.value || 0);
    if (!Number.isInteger(days) || days < 1 || days > 180) throw new Error('INVALID_LISTING_DURATION');
    const price = parseUnits(priceInput);
    if (price <= 0n) throw new Error('LISTING_PRICE_REQUIRED');
    document.getElementById('dashModalConfirm')?.setAttribute('disabled', 'disabled');
    actionState('dashboard', 'Preparing listing', 'Checking ownership and the Pass approval for Seaport.');
    await requireSession();
    const { pass, edition } = await resolveOwnedPass(context.view.key);
    if (listingForPass(pass) || pass.listing?.status === 'ACTIVE') throw new Error('PASS_ALREADY_LISTED');
    const termsHash = lower(pass.terms_hash || pass.termsHash);
    if (!termsHash) throw new Error('PASS_TERMS_REQUIRED');
    const contracts = activeContracts();
    const counter = await wallet.seaportCounter(contracts.seaport);
    await ensureNftApproval(pass.edition_address);
    const startTime = BigInt(Math.floor(Date.now() / 1000));
    const endTime = startTime + BigInt(days * 86400);
    const response = await mutation('/v1/listings/prepare', {
      seller: state.wallet,
      currentOwner: state.wallet,
      edition: pass.edition_address,
      tokenId: pass.token_id,
      termsVersionHash: termsHash,
      price: price.toString(),
      royaltyBps: String(pass.royalty_bps ?? edition.royaltyBps ?? 0),
      royaltyReceiver: pass.royalty_receiver || edition.royaltyReceiver || ZERO,
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      counter: counter.toString()
    });
    if (!response.prepared?.orderHash || !response.prepared?.registryTransaction || !response.prepared?.typedData) throw new Error('LISTING_PREPARATION_INCOMPLETE');
    const typed = response.prepared.typedData;
    const signature = await wallet.signTypedData({ domain: typed.domain, types: typed.types, primaryType: 'OrderComponents', message: typed.value });
    await mutation('/v1/listings/signed-order', {
      orderHash: response.prepared.orderHash,
      order: response.prepared.order,
      counter: counter.toString(),
      signature
    });
    const result = await submitPrepared(response, { label: 'Listing', preparedOverride: response.prepared.registryTransaction });
    state.pendingListing = null;
    actionSuccess('dashboard', 'Listing', result);
  } catch (error) {
    document.getElementById('dashModalConfirm')?.removeAttribute('disabled');
    actionError('dashboard', error);
  }
}
async function liveCancelListingRecord(record, surface = 'dashboard') {
  await requireSession();
  const listing = record?.orderHash ? state.listings.find((item) => item.orderHash === record.orderHash) : state.listings.find((item) => lower(item.edition_address) === lower(record?.editionAddress) && String(item.token_id) === String(record?.tokenId));
  if (!listing?.orderHash) throw new Error('SIGNED_LISTING_REQUIRED_TO_CANCEL');
  const response = await mutation('/v1/listings/cancel', { orderHash: listing.orderHash });
  const result = await submitPrepared(response, { label: 'Listing cancellation' });
  actionSuccess(surface, 'Listing cancellation', result);
  return result;
}
async function liveDashCancelListing(id) {
  const record = dashboardListingRecord(id);
  if (!record) return;
  window.openDashModal?.(`Cancel listing · ${record.name}`, '<p class="dash-modal-copy">The wallet will cancel this exact Seaport order. The Pass remains in your wallet and can be relisted after the cancellation is confirmed.</p>', 'Cancel listing', () => { actionState('dashboard', 'Cancelling listing', 'Preparing the exact order cancellation.'); liveCancelListingRecord(record).catch((error) => actionError('dashboard', error)); });
}
async function liveDashChangePrice(id) {
  const record = dashboardListingRecord(id);
  if (!record) return;
  window.openDashModal?.(`Change price · ${record.name}`, `<p class="dash-modal-copy">The old Seaport order will be cancelled and replaced immediately.</p><div class="dash-modal-field"><label>New ask (${escapeHtml(activeSettlementSymbol())})</label><input id="nmLiveReplacementPrice" type="number" min="0.000001" step="0.000001" value="${escapeHtml(formatUnits(record.price_usdg ?? record.priceUsdg ?? record.price ?? 0))}"></div><div class="dash-modal-field"><label>Listing duration (days)</label><input id="nmLiveReplacementDays" type="number" min="1" max="180" value="30"></div>`, 'Replace listing', async () => {
    try {
      const price = document.getElementById('nmLiveReplacementPrice')?.value;
      const days = Number(document.getElementById('nmLiveReplacementDays')?.value || 30);
      if (!(parseUnits(price) > 0n) || !Number.isInteger(days) || days < 1 || days > 180) throw new Error('INVALID_REPLACEMENT_ASK');
      actionState('dashboard', 'Cancelling old listing', 'Waiting for cancellation before signing the replacement.');
      const cancelled = await liveCancelListingRecord(record);
      await wallet.waitForReceipt(cancelled.txHash);
      await hydrate();
      state.pendingListing = await resolveOwnedPass(record.passKey);
      window.openDashModal?.(`Sign replacement · ${record.name}`, `<div class="dash-modal-field"><label>New ask (${escapeHtml(activeSettlementSymbol())})</label><input id="nmLiveListingPrice" type="number" value="${escapeHtml(price)}"></div><div class="dash-modal-field"><label>Listing duration (days)</label><input id="nmLiveListingDays" type="number" value="${days}"></div><p class="dash-modal-copy">Old order ${escapeHtml(record.orderHash || '')} is cancelled. Sign the new authoritative order.</p>`, 'Sign replacement order', () => liveConfirmListing().catch((error) => actionError('dashboard', error)));
    } catch (error) { actionError('dashboard', error); }
  });
}
async function liveDashUseAdvantage(id) {
  try {
    const advantage = (state.templateData?.dashboardState?.advantages || []).find((item) => item.id === id);
    if (!advantage || advantage.state !== 'ready') throw new Error('ADVANTAGE_NOT_AVAILABLE');
    if (state.templateData?.dashboardState?.passMeta?.[advantage.passKey]?.listed) throw new Error('CANCEL_LISTING_BEFORE_USE');
    const context = await resolveOwnedPass(advantage.passKey);
    const k = kind(advantage.kind);
    if (!['REDEMPTION', 'QUANTITY_BASED'].includes(k)) {
      showRuntimeBanner(k === 'CONNECTED' ? 'Connected Advantages apply automatically.' : 'Time-based Advantages update from their committed clock.', false);
      return;
    }
    const remaining = Math.max(1, Math.trunc(Number(advantage.remainingCount ?? advantage.remaining ?? 1)));
    const supportsVariableAmount = k === 'QUANTITY_BASED' || Number(state.config?.protocolVersion ?? 1) >= 2;
    const body = supportsVariableAmount
      ? `<p class="dash-modal-copy">Choose how much of this Pass Advantage to claim. Percentages resolve to whole units, rounded down with a minimum of one unit.</p><div class="dash-modal-field"><label>Claim</label><select id="nmAdvantageClaimMode"><option value="ALL">All remaining</option><option value="PERCENT">A percentage</option></select></div><div class="dash-modal-field" id="nmAdvantagePercentField" hidden><label>Percentage</label><input id="nmAdvantageClaimPercent" type="number" min="1" max="100" step="1" value="50"></div><p class="dash-modal-copy" id="nmAdvantageClaimSummary"></p>`
      : '<p class="dash-modal-copy">The current protocol supports one redemption unit per claim. Multi-unit and percentage redemption activates with protocol V2.</p>';
    window.openDashModal?.(`Claim ${advantage.title || 'Advantage'}`, body, 'Claim', async () => {
      try {
        const mode = supportsVariableAmount ? (document.getElementById('nmAdvantageClaimMode')?.value || 'ALL') : 'ONE';
        const percent = Math.trunc(Number(document.getElementById('nmAdvantageClaimPercent')?.value || 0));
        if (mode === 'PERCENT' && (!Number.isInteger(percent) || percent < 1 || percent > 100)) throw new Error('CLAIM_PERCENTAGE_INVALID');
        const amount = mode === 'ONE' ? 1 : (mode === 'ALL' || percent === 100 ? remaining : Math.max(1, Math.floor((remaining * percent) / 100)));
        actionState('dashboard', 'Preparing Advantage claim', `Your wallet will sign a claim for exactly ${amount} unit${amount === 1 ? '' : 's'}.`);
        await requireSession();
        const response = await mutation('/v1/advantages/consume', {
          operation: k === 'REDEMPTION' ? (amount === 1 ? 'REDEEM' : 'REDEEM_AMOUNT') : 'CONSUME_QUANTITY',
          edition: context.pass.edition_address,
          tokenId: context.pass.token_id,
          advantageId: advantage.advantageId || rawAdvantageId(advantage.raw),
          amount: String(amount),
          useId: randomBytes32()
        });
        const result = await submitPrepared(response, { label: 'Advantage claim' });
        actionSuccess('dashboard', 'Advantage claim', result);
      } catch (error) { actionError('dashboard', error); }
    });
    const modeInput = document.getElementById('nmAdvantageClaimMode');
    const percentInput = document.getElementById('nmAdvantageClaimPercent');
    const percentField = document.getElementById('nmAdvantagePercentField');
    const summary = document.getElementById('nmAdvantageClaimSummary');
    if (!supportsVariableAmount) return;
    const updateSummary = () => {
      const percent = Math.max(1, Math.min(100, Math.trunc(Number(percentInput?.value || 50))));
      const all = modeInput?.value !== 'PERCENT';
      if (percentField) percentField.hidden = all;
      const amount = all || percent === 100 ? remaining : Math.max(1, Math.floor((remaining * percent) / 100));
      if (summary) summary.textContent = `${amount} of ${remaining} remaining unit${remaining === 1 ? '' : 's'} will be claimed.`;
    };
    modeInput?.addEventListener('change', updateSummary);
    percentInput?.addEventListener('input', updateSummary);
    updateSummary();
  } catch (error) { actionError('dashboard', error); }
}
async function liveOwnedUse(key) {
  const advantage = (state.templateData?.dashboardState?.advantages || []).find((item) => item.passKey === key && item.state === 'ready');
  if (!advantage) return actionError('dashboard', new Error('ADVANTAGE_NOT_AVAILABLE'));
  return liveDashUseAdvantage(advantage.id);
}
async function liveDashWithdrawRoyalty() {
  try {
    const claims = state.templateData?.dashboardState?.royaltyClaims || [];
    const claim = claims.find((item) => !item.withdrawn && (seconds(item.release_at ?? item.releaseAt) == null || seconds(item.release_at ?? item.releaseAt) <= Math.floor(Date.now() / 1000)));
    const orderHash = claim?.order_hash || claim?.orderHash;
    if (!orderHash) throw new Error('ROYALTY_CLAIM_NOT_FOUND');
    window.openDashModal?.(`Withdraw ${formatUnits(claim.amount_usdg ?? claim.amountUsdg ?? claim.amount ?? 0)} ${activeSettlementSymbol()}`, '<p class="dash-modal-copy">Your wallet will sign a withdrawal for this released Royalty Vault claim.</p>', 'Withdraw', () => { actionState('dashboard', 'Preparing withdrawal', 'The API is checking the claim release and builder ownership.'); requireSession().then(() => mutation('/v1/royalties/withdraw', { orderHash })).then((response) => submitPrepared(response, { label: 'Royalty withdrawal' })).then((result) => actionSuccess('dashboard', 'Royalty withdrawal', result)).catch((error) => actionError('dashboard', error)); });
  } catch (error) { actionError('dashboard', error); }
}
async function createEditionOnchain(input = {}) {
  await requireConnectedWallet();
  const factory = address(activeContracts().passFactory);
  if (!factory) throw new Error('PASS_FACTORY_CONFIGURATION_REQUIRED');
  const config = {
    ...input,
    initialOwner: state.wallet,
    absoluteSupplyCap: Number(input.absoluteSupplyCap),
    salt: input.salt || randomBytes32()
  };
  // The deployed Robinhood testnet Factory predates the permissionless ABI and
  // is owned by the configured Protocol Admin Safe. Detect that live wiring
  // read-only and execute the legacy Factory call through the Safe owner wallet;
  // newer deployments continue to use the direct permissionless path.
  const factoryOwner = await wallet.call(factory, '0x8da5cb5b').catch(() => null);
  const safe = address(activeContracts().protocolAdminSafe);
  let execution = { executionMode: 'DIRECT_PERMISSIONLESS_FACTORY' };
  let txHash;
  if (activeNetworkKey() !== 'base-sepolia' && safe && factoryOwner && lower(factoryOwner).endsWith(lower(safe).slice(2)) && lower(state.wallet) !== lower(factoryOwner)) {
    execution = await wallet.createEditionViaSafe(safe, factory, config);
    txHash = execution.txHash;
  } else {
    txHash = await wallet.createEdition(factory, config);
  }
  showRuntimeBanner(`Edition creation submitted · ${short(txHash)}`);
  const receipt = await wallet.waitForReceipt(txHash);
  const created = editionCreatedFromReceipt(receipt, factory, state.wallet);
  let linked = null;
  if (input.projectId) {
    // The chain receipt is the immutable source of the Edition identity. The
    // API verifies that same receipt through RPC before writing the optional
    // Product presentation link; browser memory is never the authority.
    await requireSession();
    linked = await mutation('/v1/builder/editions/link', {
      projectId: input.projectId,
      builderId: input.builderId || state.selectedBuilderId || null,
      editionAddress: created.edition,
      txHash
    });
    if (!linked?.project_id || String(linked.project_id) !== String(input.projectId) || lower(linked.edition_address) !== lower(created.edition)) throw new Error('EDITION_PROJECT_LINK_INCOMPLETE');
  }
  return { txHash, receipt, ...created, linked, salt: config.salt, ...execution };
}
async function publishTerms(input = {}) {
  await requireSession();
  if (!Array.isArray(input.advantageConfigs)) throw new Error('ADVANTAGE_CONFIGS_REQUIRED');
  const response = await mutation('/v1/terms/prepare', input);
  return submitPrepared(response, { label: 'Terms publication' });
}
function builderLaunchRecord(id) {
  return (state.templateData?.dashboardState?.launches || []).find((launch) => launch.id === id) || null;
}
function launchEditionRecord(editionAddress) {
  const wanted = lower(editionAddress);
  return (state.builderDashboard?.editions || []).find((row) => lower(row.edition_address || row.editionAddress || row.address) === wanted) || null;
}
function finalLiveTermsConfigs(startsAt = null, endsAt = null) {
  // These definitions are the approved certification Advantage set. Their
  // windows deliberately match the retained Product's Preview/debut clock so
  // the same committed utility can be exercised after a funded mint.
  startsAt = startsAt ?? 1789107360;
  endsAt = endsAt ?? 1789798560;
  return [
    { advantageId: '0x486954742eaa12f46892b40db863e92e801942ac10059ee8c0973c9b0a45d51b', kind: 0, startsAt, endsAt, totalUnits: 0, definitionHash: '0x0aa84398c1a0f09af2b117be5149fd3cb4cd7cc7671aa7a66b8a6b24624b7c20' },
    { advantageId: '0xc43411f0ee25192c70e3b600262e3e769630445d1355888ab7543634d86677f1', kind: 1, startsAt, endsAt, totalUnits: 2, definitionHash: '0xf2d4a9938aa00234fd7d876d24ec94af42ff9587e954cd602834387c6d657e4e' },
    { advantageId: '0xfd7496e537361dbc193db9957c2a02a6ba6974da487f955d6e57f3c0d57e4b24', kind: 2, startsAt, endsAt, totalUnits: 0, definitionHash: '0x54aa32d970048e7ad581ebda0b5d4aa755ed194a329f2d9f45570094913f5ab6' }
  ];
}
function finalLiveMetadataBaseURI() {
  // A data URI is immutable once stored in the Edition constructor. The
  // trailing fragment absorbs the ERC-721 serial suffix appended by tokenURI.
  // The image points at the verified media API object; its checksum is also
  // included so the public record cannot be mistaken for a mutable draft.
  return 'data:application/json,%7B%22name%22%3A%22NexMarkets%20Final%20Live%20Certification%20Edition%22%2C%22description%22%3A%22Immutable%20NexMarkets%20Robinhood%20testnet%20certification%20Edition.%22%2C%22image%22%3A%22https%3A%2F%2Fwww.nexmarkets.xyz%2Fv1%2Fmedia%2Fmed_493b8c74-6c4c-4604-9771-bfb628deeeab%2Fcontent%22%2C%22image_sha256%22%3A%22d543e603d6beeeb4e80669aa038d3f47fdda2ab0128654e939d3a83010a001a5%22%2C%22external_url%22%3A%22https%3A%2F%2Fwww.nexmarkets.xyz%2Fv1%2Fprojects%2Fac0dbdf2-4015-4810-a1ce-c6a5def48af2%22%7D#';
}
async function liveManageLaunch(id) {
  const launch = builderLaunchRecord(id);
  if (!launch) return;
  const project = (state.builderDashboard.projects || []).find((row) => String(row.id) === String(launch.projectId));
  const draft = launch.draft || project?.content || project?.launchDraft || {};
  if (launch.editionAddress || launch.txHash) {
    const editionAddress = launch.editionAddress;
    let indexed = null;
    if (editionAddress) {
      try { indexed = await read(`/v1/editions/${encodeURIComponent(editionAddress)}`); } catch { /* indexing may still be catching up */ }
    }
    const indexedTerms = indexed?.currentTerms || indexed?.current_terms || indexed?.termsHistory?.[0] || indexed?.terms?.[0] || launch.currentTerms || launch.current_terms;
    const remembered = editionAddress && sessionStorage.getItem(`nexmarkets_terms_published:${lower(editionAddress)}`) === '1';
    if (indexedTerms || remembered || launch.termsPublished) {
      window.openDashModal?.(`Manage ${launch.project}`, `<p class="dash-modal-copy">Your wallet created and owns this Edition. Its versioned Terms are published by the Edition publisher.</p>${editionAddress ? `<div class="dash-modal-field"><label>Edition</label><code>${escapeHtml(editionAddress)}</code></div>` : ''}${launch.txHash ? `<div class="dash-modal-field"><label>Creation transaction</label><code>${escapeHtml(launch.txHash)}</code></div>` : ''}${indexedTerms?.terms_hash || indexedTerms?.termsHash ? `<div class="dash-modal-field"><label>Active Terms</label><code>${escapeHtml(indexedTerms.terms_hash || indexedTerms.termsHash)}</code></div>` : ''}<p class="dash-modal-copy">The API and Goldsky read models will expose the joined Product after indexing.</p>`, 'Close', () => window.closeDashModal?.());
      return;
    }
    const configs = finalLiveTermsConfigs();
    const termsHash = '0x3655775befc0701235416d80b8276e7f4f80a67482b3d16424706cc5a35b51b3';
    window.openDashModal?.(`Publish Terms · ${launch.project}`, `<p class="dash-modal-copy">The Edition is registered onchain. Publish its immutable Terms through the Registry using this Builder wallet. Preview starts 2026-09-11T06:16:00Z and mint opens after the required 24-hour Preview.</p><div class="dash-modal-field"><label>Edition</label><code>${escapeHtml(editionAddress || '')}</code></div><div class="dash-modal-field"><label>Active supply</label><input id="nmTermsActiveSupply" type="number" min="1" value="3"></div><div class="dash-modal-field"><label>Price (MockUSDG base units)</label><input id="nmTermsPrice" type="number" min="1" value="1000000"></div><div class="dash-modal-field"><label>Preview starts (UTC seconds)</label><input id="nmTermsPreview" type="number" value="1789107360"></div><div class="dash-modal-field"><label>Mint starts (UTC seconds)</label><input id="nmTermsMint" type="number" value="1789193760"></div><div class="dash-modal-field"><label>Mint ends (UTC seconds)</label><input id="nmTermsEnd" type="number" value="1789798560"></div><div class="dash-modal-field"><label>Primary recipient</label><input id="nmTermsPrimary" value="${escapeHtml(state.wallet || '')}"></div><div class="dash-modal-field"><label>Royalty receiver</label><input id="nmTermsRoyaltyReceiver" value="${escapeHtml(state.wallet || '')}"></div><div class="dash-modal-field"><label>Royalty (basis points)</label><input id="nmTermsRoyaltyBps" type="number" min="0" max="500" value="300"></div><div class="dash-modal-field"><label>Advantages commitment</label><input id="nmTermsAdvantagesHash" value="${termsHash}" readonly></div><div class="dash-modal-field"><label>Advantage configs (canonical JSON)</label><textarea id="nmTermsConfigs" rows="7">${escapeHtml(JSON.stringify(configs))}</textarea></div>`, 'Publish Terms with wallet', () => {
      let advantageConfigs;
      try { advantageConfigs = JSON.parse(document.getElementById('nmTermsConfigs')?.value || '[]'); } catch { actionError('dashboard', new Error('INVALID_ADVANTAGE_CONFIG_JSON')); return; }
      const input = {
        builderId: state.selectedBuilderId,
        edition: editionAddress,
        advantageConfigs,
        terms: {
          activeSupply: Number(document.getElementById('nmTermsActiveSupply')?.value),
          pricePerPass: String(document.getElementById('nmTermsPrice')?.value || ''),
          previewStartsAt: Number(document.getElementById('nmTermsPreview')?.value),
          mintStartsAt: Number(document.getElementById('nmTermsMint')?.value),
          mintEndsAt: Number(document.getElementById('nmTermsEnd')?.value),
          primaryRecipient: document.getElementById('nmTermsPrimary')?.value?.trim(),
          royaltyReceiver: document.getElementById('nmTermsRoyaltyReceiver')?.value?.trim(),
          royaltyBps: Number(document.getElementById('nmTermsRoyaltyBps')?.value),
          advantagesHash: document.getElementById('nmTermsAdvantagesHash')?.value?.trim(),
          referralTermsHash: `0x${'00'.repeat(32)}`
        }
      };
      actionState('dashboard', 'Publishing Terms', 'Confirm the exact Registry transaction in your wallet.');
      publishTerms(input).then(async (result) => {
        const receipt = await wallet.waitForReceipt(result.txHash);
        if (editionAddress) sessionStorage.setItem(`nexmarkets_terms_published:${lower(editionAddress)}`, '1');
        launch.termsPublished = true;
        window.openDashModal?.(`Terms published · ${launch.project}`, `<p class="dash-modal-copy">The Registry accepted the immutable Terms snapshot. Preview timing is now enforced by the chain.</p><div class="dash-modal-field"><label>Edition</label><code>${escapeHtml(editionAddress || '')}</code></div><div class="dash-modal-field"><label>Transaction</label><code>${escapeHtml(result.txHash)}</code></div><div class="dash-modal-field"><label>Block</label><code>${escapeHtml(String(Number.parseInt(receipt.blockNumber, 16) || receipt.blockNumber || ''))}</code></div>`, 'Close', () => window.closeDashModal?.());
        showRuntimeBanner('Terms published onchain');
        hydrate().catch(() => {});
      }).catch((error) => actionError('dashboard', error));
    });
    return;
  }
  window.openDashModal?.(`Create ${launch.project} onchain`, `<p class="dash-modal-copy">Your wallet will submit the permissionless Factory transaction. You will own the Edition and be its only Terms publisher.</p><div class="dash-modal-field"><label>Edition name</label><input id="nmLaunchEditionName" value="${escapeHtml(draft.edition?.name || launch.name || '')}" maxlength="120"></div><div class="dash-modal-field"><label>Symbol</label><input id="nmLaunchSymbol" placeholder="NEX" maxlength="12"></div><div class="dash-modal-field"><label>Edition ID (bytes32)</label><input id="nmLaunchEditionId" placeholder="0x…" maxlength="66"></div><div class="dash-modal-field"><label>Absolute supply cap</label><input id="nmLaunchSupply" type="number" min="1" value="${escapeHtml(draft.edition?.supply || '')}"></div><div class="dash-modal-field"><label>Artwork commitment (bytes32)</label><input id="nmLaunchArtworkCommitment" placeholder="0x…" maxlength="66"></div><div class="dash-modal-field"><label>Committed metadata base URI</label><input id="nmLaunchBaseTokenURI" type="url" placeholder="https://…"></div>`, 'Create with wallet', () => {
    const input = {
      projectId: launch.projectId,
      name: document.getElementById('nmLaunchEditionName')?.value?.trim(),
      symbol: document.getElementById('nmLaunchSymbol')?.value?.trim(),
      editionId: document.getElementById('nmLaunchEditionId')?.value?.trim(),
      absoluteSupplyCap: Number(document.getElementById('nmLaunchSupply')?.value),
      artworkCommitment: document.getElementById('nmLaunchArtworkCommitment')?.value?.trim(),
      baseTokenURI: document.getElementById('nmLaunchBaseTokenURI')?.value?.trim()
    };
    actionState('dashboard', 'Creating your Edition', 'Confirm the permissionless Factory transaction in your wallet.');
    createEditionOnchain(input).then((result) => {
      launch.txHash = result.txHash;
      launch.editionAddress = result.edition;
      launch.state = 'Preview';
      launch.timing = 'Onchain · indexing';
      const ownershipCopy = result.executionMode === 'SAFE_LEGACY_FACTORY'
        ? 'The Protocol Admin Safe executed the deployed Factory call. Your Builder wallet is the recorded Edition publisher; the Safe remains the onchain Edition owner.'
        : 'Your wallet created and owns this Edition and is its only Terms publisher.';
      window.openDashModal?.(`Edition created · ${launch.project}`, `<p class="dash-modal-copy">${ownershipCopy}</p><div class="dash-modal-field"><label>Edition</label><code>${escapeHtml(result.edition)}</code></div><div class="dash-modal-field"><label>Transaction</label><code>${escapeHtml(result.txHash)}</code></div>`, 'Close', () => window.closeDashModal?.());
      showRuntimeBanner('Edition created onchain');
      hydrate().catch(() => {});
    }).catch((error) => actionError('dashboard', error));
  });
}
function installLiveActions() {
  window.openProjectMint = liveOpenProjectMint;
  window.confirmProjectMint = liveConfirmProjectMint;
  window.completeProjectMint = () => null;
  window.buySelectedListing = liveOpenBuy;
  window.nmP9Buy = liveOpenBuy;
  window.marketConfirmBuy = liveMarketConfirmBuy;
  window.dashListPass = (key) => liveOpenListing(key).catch((error) => actionError('dashboard', error));
  window.ownList = window.dashListPass;
  window.nmOwnedList = window.dashListPass;
  window.dashCancelListing = (id) => liveDashCancelListing(id).catch((error) => actionError('dashboard', error));
  window.ownCancel = (key) => { const record = (state.templateData?.dashboardState?.listings || []).find((listing) => listing.passKey === key); if (record) window.dashCancelListing(record.id); };
  window.nmOwnedCancel = window.ownCancel;
  window.dashChangePrice = (id) => liveDashChangePrice(id).catch((error) => actionError('dashboard', error));
  window.ownChange = (key) => { const record = (state.templateData?.dashboardState?.listings || []).find((listing) => listing.passKey === key); if (record) window.dashChangePrice(record.id); };
  window.nmOwnedChangeAsk = window.ownChange;
  window.dashUseAdvantage = (id) => liveDashUseAdvantage(id).catch((error) => actionError('dashboard', error));
  window.dashUsePassAdvantage = (key) => liveOwnedUse(key).catch((error) => actionError('dashboard', error));
  window.nmOwnedUse = window.dashUsePassAdvantage;
  window.dashWithdrawRoyalty = () => liveDashWithdrawRoyalty().catch((error) => actionError('dashboard', error));
  window.dashManageLaunch = liveManageLaunch;
  window.nmMintSignIn = window.openProjectMint;
  window.nmMintConnectWallet = window.openProjectMint;
}

function installLifecycleAuthority() {
  const previousState = window.nmLifecycleState;
  const previousLabel = window.nmLifecycleLabel;
  if (typeof previousState !== 'function' || previousState.__nmCanonicalAuthority) return;
  const canonicalState = function canonicalLifecycleState(project) {
    if (!project) return 'draft';
    const termsHash = lower(project.termsHash || project.terms_hash || project.active_terms_hash || project.activeTermsHash);
    const statusTag = String(project.statusTag || project.status_tag || '').trim().toLowerCase();
    // A public Product row without an active Terms commitment is still a
    // private draft. Never let the template's legacy `live` fallback turn it
    // into a Debut just because it was saved before on-chain publication.
    if (!termsHash || statusTag === 'draft') return 'draft';
    const stateValue = previousState(project);
    return stateValue === 'debut' && !termsHash ? 'draft' : stateValue;
  };
  canonicalState.__nmCanonicalAuthority = true;
  window.nmLifecycleState = canonicalState;
  window.nmLifecycleLabel = function canonicalLifecycleLabel(value) {
    const stateValue = typeof value === 'string' ? value.toLowerCase() : canonicalState(value);
    return stateValue === 'draft' ? 'Draft' : (typeof previousLabel === 'function' ? previousLabel(stateValue) : stateValue);
  };
}
function canonicalPassAssignmentFor(project, serialNo) {
  const experience = state.projectExperience?.[project?.name] || {};
  const design = experience.compiledLaunch?.design;
  if (!design || !Array.isArray(design.passAssignments) || !design.passAssignments.length) return null;
  const serial = Math.max(1, Number(serialNo) || Number(design.selectedSerialIndex || 0) + 1);
  return design.passAssignments.find((assignment) => Number(assignment.serial) === serial) || design.passAssignments[serial - 1] || null;
}
function applyCanonicalPassAssignment(compiled, project, serialNo) {
  const assignment = canonicalPassAssignmentFor(project, serialNo);
  if (!assignment || !compiled?.design) return compiled;
  const design = compiled.design;
  const optionId = String(assignment.optionId || '');
  if (/^(classic|glass)-(obsidian|carbon|gilt)$/.test(optionId)) {
    const [family, material] = optionId.split('-');
    design.passDesign = family;
    design.frame = material;
  } else if (/^pack-(slab|glass|metal|ceramic|blister|carbon|paper|resin)$/.test(optionId)) {
    design.passDesign = optionId;
    design.frame = 'obsidian';
  }
  const palette = assignment.palette && typeof assignment.palette === 'object' ? assignment.palette : {};
  const paletteArray = [palette.primary, palette.secondary, palette.accent].filter(Boolean).slice(0, 3);
  const visual = assignment.visual && typeof assignment.visual === 'object' ? assignment.visual : null;
  if (visual) {
    for (const field of ['passDesign', 'packOption', 'packFamily', 'material', 'themeMode', 'color', 'customColor', 'colorStyle', 'gradientA', 'gradientB', 'gradientDirection', 'frame', 'frameColor', 'texture', 'textureTint']) {
      if (visual[field] != null) design[field] = visual[field];
    }
    design.frameHueCustomized = Boolean(visual.frameHueCustomized);
    if (Array.isArray(visual.randomPalette) && visual.randomPalette.length >= 3) design.randomPalette = visual.randomPalette.slice(0, 3);
    else delete design.randomPalette;
  } else if (paletteArray.length === 3) {
    design.color = paletteArray[0];
    design.gradientA = paletteArray[0];
    design.gradientB = paletteArray[1];
    design.randomPalette = paletteArray;
    design.colorStyle = 'solid';
  }
  if (!visual) design.frameColor = design.frame === 'gilt' ? '#c8a84e' : design.frame === 'carbon' ? '#313337' : '#2a2725';
  design.colorwayId = assignment.colorwayId || design.colorwayId;
  design.rendererVersion = assignment.rendererVersion || design.rendererVersion;
  design.randomAssignment = {
    ...(design.randomAssignment || {}),
    ...assignment.randomAssignment,
    optionId,
    packId: optionId,
    palette: paletteArray.length === 3 ? paletteArray : design.randomPalette,
    frozen: Boolean(assignment.frozen || assignment.randomAssignment?.frozen)
  };
  const artwork = assignment.artwork || {};
  const artworkUrl = artwork.url || artwork.src || (/^(https?:|data:)/i.test(String(artwork.assetKey || '')) ? artwork.assetKey : '');
  if (artworkUrl) design.artSrc = artworkUrl;
  if (artwork.x != null) design.artX = Number(artwork.x);
  if (artwork.y != null) design.artY = Number(artwork.y);
  design.selectedSerialIndex = Math.max(0, Number(serialNo || 1) - 1);
  return compiled;
}
function installCanonicalPassRuntime() {
  const base = window.nmFinalProjectCompiled || window.finalProjectCompiled;
  if (typeof base !== 'function' || base.__nmCanonicalPassRuntime) return;
  const wrapped = function canonicalPassRuntime(project, serialNo = 0, ownedPass = null) {
    const compiled = base(project, serialNo, ownedPass);
    return applyCanonicalPassAssignment(compiled, project, serialNo || 1);
  };
  wrapped.__nmCanonicalPassRuntime = true;
  wrapped.__nmCanonicalBase = base;
  window.nmFinalProjectCompiled = wrapped;
  window.finalProjectCompiled = wrapped;
  try { finalProjectCompiled = wrapped; } catch { /* classic template binding may be immutable */ }
  try { nmFinalProjectCompiled = wrapped; } catch { /* classic template binding may be immutable */ }
  window.nmCanonicalPassAssignment = canonicalPassAssignmentFor;
  window.nmCanonicalPassAudit = (name, serial = 1) => {
    const project = state.projects?.find((item) => item.name === name) || state.projects?.[0];
    const assignment = canonicalPassAssignmentFor(project, serial);
    return assignment ? { ...assignment, palette: { ...(assignment.palette || {}) } } : null;
  };
}
function guardMutations() {}

// The V2 template uses a single static document and renders its surfaces in
// place. Keep that architecture, but mirror the active surface in the
// browser URL so navigation is shareable, refreshable, and does not expose
// the implementation entrypoint (index.html).
function installHistoryRouting() {
  const originalGo = window.go;
  if (typeof originalGo !== 'function' || originalGo.__nmHistoryWrapped) return;

  const selections = () => window.__nmV2GetSelections?.() || {};
  const pathForRoute = (route) => {
    switch (route) {
      case 'home': return '/';
      case 'discover': return '/discover';
      case 'market': return '/market';
      case 'create': return '/create';
      case 'dashboard': {
        const tab = state.route?.kind === 'dashboard' ? (state.route.tab || 'holder') : 'holder';
        return `/dashboard/${encodeURIComponent(tab)}`;
      }
      case 'project': {
        if (state.route?.kind === 'project' && state.route.project) return `/projects/${encodeURIComponent(state.route.project)}`;
        if (state.route?.kind === 'pass' && state.route.edition && state.route.token) return `/passes/${encodeURIComponent(state.route.edition)}/${encodeURIComponent(state.route.token)}`;
        const name = selections().project || state.detailProject?.name || '';
        return name ? `/projects/${encodeURIComponent(name)}` : '/discover';
      }
      case 'builder': {
        const key = window.nmEliteBuilderKey || state.route?.handle || '';
        const profile = builderProfileForKey(key) || state.builderProfiles.get(lower(key));
        const handle = profile?.handle || profile?.links?.handle || state.route?.handle || key;
        return handle ? `/builders/${encodeURIComponent(String(handle).replace(/^@/, ''))}` : '/discover';
      }
      case 'collection': {
        if (state.route?.kind === 'edition' && state.route.edition) return `/editions/${encodeURIComponent(state.route.edition)}`;
        if (state.route?.kind === 'pass' && state.route.edition && state.route.token) return `/passes/${encodeURIComponent(state.route.edition)}/${encodeURIComponent(state.route.token)}`;
        const edition = selections().edition || state.edition?.address || '';
        return /^0x[0-9a-f]{40}$/i.test(edition)
          ? `/editions/${encodeURIComponent(edition)}`
          : (selections().project ? `/projects/${encodeURIComponent(selections().project)}` : '/discover');
      }
      case 'listing': {
        if (state.route?.kind === 'listing' && state.route.listing) return `/listings/${encodeURIComponent(state.route.listing)}`;
        const listing = selections().listing || '';
        return listing ? `/listings/${encodeURIComponent(listing)}` : '/market';
      }
      case 'owned': return '/dashboard/holder?view=owned';
      case 'launch': return '/projects/nexstudio';
      case 'docs': return '/docs';
      case 'faq': return '/faq';
      case 'terms': return '/terms';
      default: return null;
    }
  };

  const wrappedGo = function wrappedGo(route) {
    const nextPath = pathForRoute(route);
    if (nextPath) {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== nextPath) window.history.pushState({ nexmarketsRoute: route }, '', nextPath);
    }
    const result = originalGo.call(this, route);
    if (route === 'dashboard') {
      syncDashboardAccount();
      requestAnimationFrame(syncDashboardAccount);
    }
    return result;
  };
  wrappedGo.__nmHistoryWrapped = true;
  wrappedGo.__nmOriginalGo = originalGo;
  window.go = wrappedGo;
  const originalDashGo = window.dashGo;
  if (typeof originalDashGo === 'function' && !originalDashGo.__nmHistoryWrapped) {
    const wrappedDashGo = function wrappedDashGo(tab) {
      const normalized = String(tab || 'overview') === 'overview' ? 'holder' : String(tab || 'overview');
      const nextPath = `/dashboard/${encodeURIComponent(normalized)}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== nextPath) window.history.pushState({ nexmarketsRoute: 'dashboard', tab: normalized }, '', nextPath);
      const result = originalDashGo.call(this, tab);
      syncDashboardAccount();
      requestAnimationFrame(syncDashboardAccount);
      return result;
    };
    wrappedDashGo.__nmHistoryWrapped = true;
    wrappedDashGo.__nmOriginalGo = originalDashGo;
    window.dashGo = wrappedDashGo;
  }
}
function exposeRuntime() {
  window.__nmV2SubmitCreatePass = submitCreatePass;
  // Backwards-compatible aliases for existing integrations and browser tests.
  window.__nmV2SubmitCreateDraft = submitCreateDraft;
  window.completeCreatePublish = submitCreatePass;

  window.nmRenderAccountChip = function() {
    const chips = [document.getElementById('nmAccountChip'), document.getElementById('nmMobileAccountChip')].filter(Boolean);
    if (!chips.length) return;
    const isConnecting = Boolean(state.connecting);
    const isConnected = Boolean(state.wallet);
    const isAuthenticated = Boolean(state.authenticated);
    const displayLabel = isConnected ? short(state.wallet) : 'Connect wallet';

    if (window.nmJourneyState) {
      window.nmJourneyState.walletConnected = isConnected;
      window.nmJourneyState.signedIn = isAuthenticated;
    }

    let html = '';
    if (isConnecting) {
      const msg = state.connectingMessage || 'Connecting...';
      const shortMsg = msg.includes('signature') ? (msg.includes('Verifying') ? 'Verifying...' : 'Signing...') : (msg.includes('session') ? 'Loading...' : 'Connecting...');
      html = `<button class="btn primary nm-get-started nm-connecting" disabled style="opacity:0.92;cursor:wait;display:inline-flex;align-items:center;gap:7px"><span class="nm-spinner" aria-hidden="true"></span><span class="nm-connecting-long">${escapeHtml(msg)}</span><span class="nm-connecting-short">${escapeHtml(shortMsg)}</span><span class="account-label" aria-hidden="true" style="display:none"></span></button>`;
    } else if (!isConnected) {
      html = '<button class="btn primary nm-get-started" onclick="nmOpenGetStarted()">Log in / Connect</button><span class="account-label" aria-hidden="true" style="display:none"></span>';
    } else if (!isAuthenticated) {
      html = `<span class="account-dot" aria-hidden="true" style="background:#ffb000;box-shadow:0 0 0 4px rgba(255,176,0,.15)"></span><button class="btn primary nm-get-started nm-btn-signin" style="padding:0 12px;height:32px;font-size:11px" onclick="nmSignInWallet()">Sign in</button><button class="nm-chev" aria-label="Account menu" onclick="nmToggleAccountMenu(event)">&#9662;</button><div class="nm-account-menu"><div class="nm-menu-header" style="padding:8px 12px;font-size:11px;border-bottom:1px solid rgba(244,241,233,.08)"><div style="font-weight:600;color:#fff">${escapeHtml(displayLabel)}</div><div style="font-size:10px;margin-top:2px;color:#ffb000">Wallet connected · Not signed in</div></div><button onclick="nmSignInWallet()">Sign in with wallet</button><button onclick="nmOpenNetworkSwitcher()">Switch network</button><button onclick="nmSwitchWallet()">Change wallet</button><button onclick="nmSignOut()">Disconnect</button></div><span class="account-label" aria-hidden="true" style="display:none">${escapeHtml(displayLabel)}</span>`;
    } else {
      html = `<span class="account-dot" aria-hidden="true"></span><button class="nm-account-trigger" onclick="nmAccountTap()">Account</button><button class="nm-chev" aria-label="Account menu" onclick="nmToggleAccountMenu(event)">&#9662;</button><div class="nm-account-menu"><div class="nm-menu-header" style="padding:8px 12px;font-size:11px;border-bottom:1px solid rgba(244,241,233,.08)"><div style="font-weight:600;color:#fff">${escapeHtml(displayLabel)}</div><div style="font-size:10px;margin-top:2px;color:#7ea8ff">${escapeHtml(activeNetworkName())}</div></div><button onclick="nmGoDashboard()">Dashboard</button><button onclick="nmOpenNetworkSwitcher()">Switch network</button><button onclick="nmSwitchWallet()">Change wallet</button><button onclick="nmSignOut()">Sign out</button></div><span class="account-label" aria-hidden="true" style="display:none">${escapeHtml(displayLabel)}</span>`;
    }

    chips.forEach((chip) => {
      chip.innerHTML = html;
    });
  };

  window.nmOpenGetStarted = () => {
    if (!state.wallet) return connectWalletFromUi ? connectWalletFromUi() : authenticateOnce();
    if (!state.authenticated) return authenticateOnce();
    return window.nmAccountTap();
  };
  window.nmSignInWallet = () => authenticateOnce();
  window.nmSwitchWallet = async () => {
    document.querySelectorAll('.nm-account-menu.open').forEach((m) => m.classList.remove('open'));
    try {
      if (state.authenticated) await mutation('/v1/auth/logout', {}).catch(() => {});
    } catch {}
    if (walletMode === 'cdp') {
      try { await cdpControls?.signOut?.(); } catch {}
    }
    await disconnectWallet();
    walletMode = null;
    cdpSession = null;
    state.authenticated = false;
    state.wallet = null;
    state.csrfToken = null;
    sessionStorage.removeItem('nex_csrf');
    setAccountLabel('Connect wallet');
    try {
      await openConnectModal({ chainId: Number(state.config?.chainId || CHAIN_ID), chainIds: availableChainIds(), force: true });
    } catch (e) {
      console.warn('Switch wallet modal error:', e);
    }
  };
  window.nmOpenNetworkSwitcher = () => {
    document.querySelectorAll('.nm-account-menu.open').forEach((m) => m.classList.remove('open'));
    openNetworkSelector();
  };
  window.nmAccountTap = () => state.wallet
    ? (state.authenticated
        ? (typeof go === 'function' ? go('dashboard') : openAccountModal())
        : authenticateOnce())
    : (connectWalletFromUi ? connectWalletFromUi() : authenticateOnce());

  const priorOpenBuilder = window.openBuilder;
  window.openBuilder = (key) => {
    window.nmEliteBuilderKey = String(key || '').toLowerCase();
    const profile = builderProfileForKey(key) || state.builderProfiles.get(lower(key));
    const handle = profile?.handle || profile?.links?.handle || key;
    if (handle) navigate(`/builders/${encodeURIComponent(String(handle).replace(/^@/, ''))}`);
    else if (priorOpenBuilder) priorOpenBuilder(key);
    return true;
  };

  window.nmSignOut = async () => {
    document.querySelectorAll('.nm-account-menu.open').forEach((m) => m.classList.remove('open'));
    try {
      if (state.authenticated) await mutation('/v1/auth/logout', {});
    } catch {}
    if (walletMode === 'cdp') {
      try { await cdpControls?.signOut?.(); } catch {}
    }
    await disconnectWallet();
    walletMode = null;
    cdpSession = null;
    state.authenticated = false; state.wallet = null; state.csrfToken = null;
    sessionStorage.removeItem('nex_csrf');
    setAccountLabel('Connect wallet');
    showRuntimeBanner('Signed out');
    if (typeof go === 'function' && typeof currentRoute !== 'undefined' && currentRoute === 'dashboard') go('home');
    await hydrate();
  };

  window.nexmarketsV2 = {
    state,
    refresh: hydrate,
    connect: authenticate,
    selectBuilder,
    navigate,
    submitCreatePass,
    submitCreateDraft,
    autosaveCreateDraft: autosaveCreateDraft,
    createEditionOnchain,
    publishTerms,
    mint: liveConfirmProjectMint,
    buy: liveMarketConfirmBuy,
    list: liveConfirmListing,
    cancelListing: liveDashCancelListing,
    useAdvantage: liveDashUseAdvantage,
    get certificationEdition() { return defaultCertificationEdition(); },
    certificationToken: CERTIFICATION_TOKEN
  };
}

installHistoryRouting(); wireWallet(); installLiveActions(); installLifecycleAuthority(); installCanonicalPassRuntime(); guardMutations(); exposeRuntime(); installCreateDraftAutosave(); installMintAccessCreateFields(); installSocialRuntime(); installMediaRuntime();
addEventListener('popstate', () => { presentRoute(routeInfo()).catch(() => goView(routeInfo())); });
(async () => {
  try {
    await initWalletSession();
  } catch (error) {
    console.warn('Wallet session initialization failed:', error);
  }
  await hydrate();
})();
