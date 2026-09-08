import { NexWallet } from './wallet.mjs';
import { openConnectModal, openAccountModal, openChainModal, onAccountChange, onChainChange, waitForConnection, getWalletProvider } from './rainbow-wallet.mjs';

/*
 * NexMarkets V2 is intentionally a data adapter around the supplied product
 * experience document.  The document owns the visual system and its existing
 * renderers; this module owns only runtime configuration, API reads, wallet
 * authentication and the translation from canonical API/Subgraph records to
 * the renderer's view model.
 */
const CERTIFICATION_EDITION = '0x4171D62F43B4168b07a01C04594455DBc3298437';
const CERTIFICATION_TOKEN = '1';
const CHAIN_ID = 46630;
const DEFAULT_NETWORK_KEY = 'robinhood-testnet';
const ZERO = '0x0000000000000000000000000000000000000000';

const state = {
  config: null,
  runtimeConfig: null,
  networkKey: DEFAULT_NETWORK_KEY,
  edition: null,
  pass: null,
  discover: [],
  listings: [],
  authenticated: false,
  wallet: null,
  csrfToken: sessionStorage.getItem('nex_csrf') || null,
  error: null,
  route: null,
  detail: null,
  templateData: null,
  builderDashboard: { projects: [], editions: [], royalties: [], referrals: [] },
  pendingMint: null,
  pendingBuy: null,
  pendingListing: null,
  hydrating: false
};

const wallet = new NexWallet();

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
    advantageConfigs: Array.isArray(raw.advantageConfigs) ? raw.advantageConfigs : []
  };
}
function statusFor(edition, summary) {
  const terms = termsOf(edition).current || summary?.currentTerms || summary;
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
  const terms = termsOf(raw || summary);
  const current = normalizeTerms(terms.current || {});
  const history = terms.history.map((term) => normalizeTerms(term));
  const cap = number(raw?.absolute_supply_cap ?? raw?.absoluteSupplyCap ?? summary?.absolute_supply_cap ?? summary?.absoluteSupplyCap);
  const minted = number(raw?.totalMinted ?? raw?.total_minted ?? summary?.total_minted ?? summary?.totalMinted);
  const name = raw?.name || summary?.name || (addr.toLowerCase() === (defaultCertificationEdition() || ZERO).toLowerCase() ? 'NexMarkets V1 Test Certification Edition' : `NexPass Edition ${short(addr)}`);
  return {
    ...raw,
    address: addr,
    edition_address: addr,
    name,
    editionId: raw?.editionId || raw?.edition_id || summary?.edition_id || null,
    publisher: lower(raw?.publisher || summary?.publisher) || ZERO,
    protocolAdmin: lower(raw?.protocolAdmin || summary?.protocol_admin) || null,
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
function projectModel(edition, summary, pass) {
  const indexedTerms = termsOf(edition).current || {};
  const terms = Object.keys(indexedTerms).length ? indexedTerms : (summary || {});
  const advantages = pass?.advantages || [];
  const title = edition?.name || summary?.name || `NexPass Edition ${short(edition?.address)}`;
  const stage = statusFor(edition, summary);
  const advKind = kind(advantages[0]?.kind) === 'REDEMPTION' ? 'redemption' : 'connected';
  const experience = {
    advantageText: advantageText(advantages, edition?.advantagesHash),
    advantageShort: advantageText(advantages, edition?.advantagesHash),
    minted: edition?.totalMinted || 0,
    builder: short(edition?.publisher),
    builderHandle: 'Onchain publisher',
    evidenceLabel: 'View onchain record',
    evidenceUrl: '',
    evidenceType: 'Onchain record',
    about: `A permanent NexPass Edition on ${activeNetworkName()}. Ownership, serials and versioned Terms are read from the certified deployment. Edition ${short(edition?.address)} is indexed by Goldsky.`,
    edition: 'NEXMARKETS EDITION',
    royalty: `${number(terms.royaltyBps ?? terms.royalty_bps) / 100}%`,
    termsVersion: terms.version == null ? 'Published Terms' : `v${terms.version}`,
    previewStarted: iso(terms.previewStartsAt ?? terms.preview_starts_at ?? summary?.preview_starts_at),
    opensAt: iso(terms.mintStartsAt ?? terms.mint_starts_at ?? summary?.mint_starts_at),
    closesAt: iso(terms.mintEndsAt ?? terms.mint_ends_at ?? summary?.mint_ends_at),
    visual: 'nexstudio'
  };
  const project = {
    name: title,
    logo: initials(title),
    category: 'tools',
    state: stage === 'preview' ? 'preview' : 'live',
    adv: advKind,
    price: edition?.price || usd(terms.pricePerPass ?? terms.price_usdg),
    supply: edition?.absoluteSupplyCap || 0,
    color: '#34483a',
    desc: `Finite Pass Edition · ${edition?.totalMinted || 0}/${edition?.absoluteSupplyCap || 0} serials issued on ${activeNetworkName()}.`,
    opens: stage === 'preview' ? 'Preview' : 'Live',
    network: activeNetworkFamily(),
    editionAddress: edition?.address,
    termsHash: termHash(terms) || lower(summary?.active_terms_hash) || null
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
  return { name: '', builder: '', builderHandle: '', desc: '', about: '', supply: 1, price: 0, royalty: 0, advantages: [], published: false, productState: 'Preview', opensAt: '', timezone: 'Africa/Lagos' };
}
function setAccountLabel(value) {
  const isConnected = Boolean(state.wallet);
  const displayLabel = isConnected ? (value || short(state.wallet)) : 'Connect wallet';
  document.querySelectorAll('.account-chip').forEach((chip) => {
    const element = chip.querySelector('.account-label') || [...chip.querySelectorAll('span')].find((candidate) => !candidate.classList.contains('account-dot'));
    if (element) element.textContent = displayLabel;
    chip.dataset.connected = isConnected ? 'true' : 'false';
    chip.setAttribute('role', 'button'); chip.setAttribute('tabindex', '0');
    chip.setAttribute('aria-label', isConnected ? `Connected wallet ${displayLabel}` : 'Connect wallet');
  });
  document.querySelectorAll('#dashboard .dash-person b, #dashboard .p10-wallet b').forEach((element) => { element.textContent = displayLabel; });
  document.querySelectorAll('#dashboard .dash-person .avatar, #dashboard .p10-avatar').forEach((element) => {
    element.textContent = isConnected ? state.wallet.slice(2, 4).toUpperCase() : '--';
  });
  document.querySelectorAll('#dashboard .p10-connected span').forEach((element) => { element.textContent = isConnected ? 'Wallet connected' : 'Connect wallet'; });
  document.querySelectorAll('#dashboard .p10-connected').forEach((element) => { element.dataset.connected = isConnected ? 'true' : 'false'; });
  document.querySelectorAll('#dashboard #dashAccountMeta').forEach((element) => {
    if (!isConnected) element.textContent = `${state.templateData?.ownedPasses?.length || 0} Passes`;
  });
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
function ensureNetworkSelectors() {
  const options = networkOptions();
  if (options.length < 2) return;
  document.querySelectorAll('.site-header, .mobile-header').forEach((header) => {
    const account = header.querySelector('.account-chip');
    const host = account?.parentElement || header;
    let wrapper = host.querySelector(':scope > .nm-network-switcher');
    if (!wrapper) {
      wrapper = document.createElement('label');
      wrapper.className = 'nm-network-switcher';
      wrapper.innerHTML = '<span>Network</span><select aria-label="Select network"></select>';
      host.insertBefore(wrapper, account || null);
      wrapper.querySelector('select').addEventListener('change', (event) => switchNetwork(event.target.value).catch((error) => showRuntimeBanner(error.message, true)));
    }
    const select = wrapper.querySelector('select');
    select.replaceChildren(...options.map(({ key, config }) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = `${config.displayName || config.name || key}${config.testnetOnly || /testnet|sepolia/i.test(key) ? ' Testnet' : ''}`;
      return option;
    }));
    select.value = state.networkKey;
  });
}
async function switchNetwork(nextKey, { switchWallet = true } = {}) {
  const next = configuredNetworks()[nextKey];
  if (!next || nextKey === state.networkKey) return;
  const previous = { networkKey: state.networkKey, config: state.config, authenticated: state.authenticated, csrfToken: state.csrfToken };
  state.networkKey = nextKey;
  state.config = next;
  state.authenticated = false;
  state.csrfToken = null;
  sessionStorage.removeItem('nex_csrf');
  try { localStorage.setItem('nexmarkets_network', nextKey); } catch {}
  ensureNetworkSelectors();
  try {
    if (switchWallet && state.wallet) {
      await wallet.switchChain({ chainId: Number(next.chainId), name: next.name, rpcUrl: next.rpcUrl, explorer: next.explorer });
    }
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
    .nm-network-switcher select{appearance:none;border:1px solid rgba(244,241,233,.15);border-radius:7px;background:#111711;color:#e7ece4;padding:7px 23px 7px 9px;font:11px system-ui,sans-serif;cursor:pointer}
    .nm-network-switcher select:focus{outline:1px solid var(--amber,#ffb000);outline-offset:1px}
    @media(max-width:720px){
      .mobile-actions{min-width:0;overflow:visible}
      .mobile-actions .nm-network-switcher{flex:0 1 auto;min-width:0;gap:3px;margin:0 4px}
      .mobile-actions .nm-network-switcher span{display:none}
      .mobile-actions .nm-network-switcher select{min-width:0;max-width:118px;padding:6px 17px 6px 6px;font-size:9px}
      .mobile-actions .account-chip{position:relative;z-index:2;flex:0 0 auto}
    }
    #nm-v2-data-panel{margin:26px 0 0;padding:18px;border:1px solid rgba(244,241,233,.10);border-radius:18px;background:#0d110e;color:#dfe5dc}
    #nm-v2-data-panel h2{margin:0 0 14px;font-size:22px;letter-spacing:-.03em}#nm-v2-data-panel h3{margin:0;font-size:14px}
    #nm-v2-data-panel .nm-v2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    #nm-v2-data-panel .nm-v2-cell{padding:11px;border-top:1px solid rgba(244,241,233,.075)}#nm-v2-data-panel .nm-v2-cell span{display:block;color:#7f897d;font-size:10px;text-transform:uppercase;letter-spacing:.08em}#nm-v2-data-panel .nm-v2-cell strong{display:block;margin-top:5px;color:#e7ece4;font-size:12px;word-break:break-word}
    #nm-v2-data-panel .nm-v2-adv{padding:12px 0;border-top:1px solid rgba(244,241,233,.075)}#nm-v2-data-panel .nm-v2-adv small{color:#849084}#nm-v2-data-panel .nm-v2-adv b{display:block;margin-top:4px;color:#e9eee7}
    #nm-v2-data-panel code{font-size:10px;color:#cfd8cc;word-break:break-all}@media(max-width:720px){#nm-v2-data-panel .nm-v2-grid{grid-template-columns:1fr}}
  `; document.head.appendChild(style);
}
function renderDetailPanel(mode) {
  const mount = document.getElementById('projectPageMount');
  if (!mount) return;
  document.getElementById('nm-v2-data-panel')?.remove();
  const edition = state.edition; const pass = state.pass;
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
function routeInfo() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'passes' && parts[1] && parts[2]) return { kind: 'pass', edition: parts[1], token: parts[2] };
  if (parts[0] === 'editions' && parts[1]) return { kind: 'edition', edition: parts[1] };
  if (parts[0] === 'projects' && parts[1]) return { kind: 'project', project: decodeURIComponent(parts.slice(1).join('/')) };
  if (parts[0] === 'dashboard') return { kind: 'dashboard', tab: parts[1] || 'holder' };
  if (parts[0] === 'market') return { kind: 'market' };
  if (parts[0] === 'discover') return { kind: 'discover' };
  if (parts[0] === 'create') return { kind: 'create' };
  return { kind: 'home' };
}
function navigate(path) {
  const next = String(path || '/');
  history.pushState({}, '', next);
  goView(routeInfo());
}
function goView(route) {
  state.route = route;
  const project = state.projects?.find((item) => route.edition && lower(item.editionAddress) === lower(route.edition)) || state.projects?.find((item) => route.project && (item.name.toLowerCase() === String(route.project).toLowerCase() || lower(item.editionAddress) === lower(route.project))) || state.projects?.[0];
  if (project) {
    state.detailProject = project;
    window.__nmV2SetData?.({ selectedProject: project.name });
  }
  if (route.kind === 'discover') window.go?.('discover');
  else if (route.kind === 'market') window.go?.('market');
  else if (route.kind === 'create') window.go?.('create');
  else if (route.kind === 'dashboard') window.go?.('dashboard');
  else if (route.kind === 'project' || route.kind === 'edition' || route.kind === 'pass') {
    if (project) window.go?.('project');
  } else window.go?.('home');
  setTimeout(() => setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet'), 35);
  setTimeout(() => { if (route.kind === 'edition' || route.kind === 'project' || route.kind === 'pass') renderDetailPanel(route.kind === 'pass' ? 'pass' : 'edition'); }, 45);
}
async function read(path, options = {}) {
  const origin = state.config?.apiOrigin || '';
  const response = await fetch(`${origin}${path}`, { credentials: 'same-origin', ...options, headers: { accept: 'application/json', 'x-nex-network': state.networkKey, ...(options.headers || {}) } });
  let payload = null; try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new Error(payload?.error?.code || `API_${response.status}`);
  return payload?.data ?? payload;
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
  const certificationEdition = activeCertificationEdition();
  const [discoverResult, editionResult, passResult, listingsResult] = await Promise.allSettled([
    read('/v1/discover'),
    certificationEdition ? read(`/v1/editions/${certificationEdition}`) : Promise.resolve(null),
    certificationEdition ? read(`/v1/passes/${certificationEdition}/${CERTIFICATION_TOKEN}`) : Promise.resolve(null),
    read('/v1/market/listings')
  ]);
  const discover = discoverResult.status === 'fulfilled' ? (Array.isArray(discoverResult.value) ? discoverResult.value : discoverResult.value?.editions || []) : [];
  const summary = discover.find((item) => certificationEdition && lower(item.edition_address || item.address) === certificationEdition.toLowerCase()) || discover[0] || null;
  const editionRaw = editionResult.status === 'fulfilled' ? editionResult.value : null;
  state.edition = normalizeEdition(editionRaw, summary);
  state.pass = normalizePass(passResult.status === 'fulfilled' ? passResult.value : null, state.edition);
  state.discover = discover.map((item) => normalizeEdition(null, item)).filter(Boolean);
  if (state.edition && !state.discover.some((item) => item.address.toLowerCase() === state.edition.address.toLowerCase())) state.discover.unshift(state.edition);
  const map = new Map(state.discover.map((item) => [item.address.toLowerCase(), item]));
  const listingRows = listingsResult.status === 'fulfilled' ? (Array.isArray(listingsResult.value) ? listingsResult.value : []) : [];
  state.listings = listingRows.map((item) => normalizeListing(item, map)).filter(Boolean);
  if (discoverResult.status === 'rejected' && editionResult.status === 'rejected') throw new Error('LIVE_API_UNAVAILABLE');
}
async function loadAuthenticatedData() {
  if (!state.authenticated) {
    state.builderDashboard = { projects: [], editions: [], royalties: [], referrals: [] };
    return { owned: [], advantages: [], builder: state.builderDashboard };
  }
  const results = await Promise.allSettled([read('/v1/me/passes'), read('/v1/me/advantages'), read('/v1/builder/dashboard')]);
  state.builderDashboard = results[2].status === 'fulfilled'
    ? (results[2].value || { projects: [], editions: [], royalties: [], referrals: [] })
    : { projects: [], editions: [], royalties: [], referrals: [] };
  return {
    owned: results[0].status === 'fulfilled' ? (Array.isArray(results[0].value) ? results[0].value : []) : [],
    advantages: results[1].status === 'fulfilled' ? (Array.isArray(results[1].value) ? results[1].value : []) : [],
    builder: state.builderDashboard
  };
}
function knownEdition(value) {
  const target = lower(value);
  if (!target) return null;
  return (lower(state.edition?.address) === target ? state.edition : null)
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
      primary: 0,
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
      state: 'Draft',
      minted: 0,
      supply: number(edition.supply, 0),
      price: number(edition.price, 0),
      primary: 0,
      timing: 'Draft saved',
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
      action: k === 'REDEMPTION' ? 'Redeem 1' : k === 'QUANTITY_BASED' ? 'Use 1' : 'Open benefit',
      termsHash: lower(raw.terms_hash || raw.termsHash || pass.termsHash),
      raw
    };
  }).filter(Boolean);
  dashboardAdvantages.forEach((advantage) => {
    const pass = passByKey.get(advantage.passKey);
    if (pass) pass.advantages = [...(pass.advantages || []), advantage.raw];
  });

  const claims = Array.isArray(builder.royalties) ? builder.royalties : [];
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
      primaryProceeds: 0,
      royaltyAvailable,
      royaltyLocked,
      royaltyUnlock: royaltyLocked ? 'when the claim releases' : 'No claims',
      referralTracked: (builder.referrals || []).reduce((total, row) => total + usd(row.amount_usdg ?? row.amountUsdg ?? row.amount ?? 0), 0)
    },
    royaltyClaims: claims,
    activity: []
  };
}
async function hydrate() {
  state.hydrating = true;
  try {
    await loadConfig(); await loadChainData();
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
    const accountData = await loadAuthenticatedData();
    const owned = accountData.owned.map((row) => {
      const rowEditionAddress = row.edition_address || row.editionAddress || row.edition?.address;
      const edition = knownEdition(rowEditionAddress) || normalizeEdition({ ...row, address: rowEditionAddress, edition_address: rowEditionAddress, name: row.project_name || row.name }, null);
      const advantages = accountData.advantages.filter((advantage) => lower(advantage.edition_address || advantage.editionAddress) === lower(rowEditionAddress) && String(advantage.token_id ?? advantage.tokenId) === String(row.token_id ?? row.tokenId));
      const pass = normalizePass({ ...row, advantages }, edition || state.edition);
      return ownedModel({ ...row, advantages }, pass, edition || state.edition);
    });
    const collections = state.discover.map((edition) => ({ name: edition.name, key: initials(edition.name).toLowerCase(), color: '#34483a', mechanism: 'Connected', floor: 0, last: 0, listed: state.listings.filter((item) => lower(item.edition_address) === lower(edition.address)).length }));
    const dashboard = buildDashboardData(accountData, owned);
    publishTemplateData({ projects: state.projects, projectExperience: state.projectExperience, collections, listings: state.listings, ownedPasses: owned, dashboardState: dashboard, selectedProject: state.projects[0]?.name || '' });
    setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
    state.error = null;
  } catch (error) {
    state.error = error;
    state.projects = []; state.projectExperience = {};
    publishTemplateData({ projects: [], projectExperience: {}, collections: [], listings: [], ownedPasses: [], dashboardState: emptyDashboard([]) });
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
  const provider = await getWalletProvider();
  if (provider) wallet.setProvider(provider);
  const identity = await wallet.connect(Number(state.config?.chainId || CHAIN_ID));
  state.wallet = identity.address; setAccountLabel(short(identity.address));
  const challenge = await read('/v1/auth/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: identity.address }) });
  const signature = await wallet.signMessage(challenge.message);
  const verified = await read('/v1/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nonce: challenge.nonce, signature }) });
  state.csrfToken = verified.csrfToken; state.authenticated = true; sessionStorage.setItem('nex_csrf', verified.csrfToken);
  await hydrate(); showRuntimeBanner(`Wallet verified on ${activeNetworkName()}`);
  return identity;
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
  if (!authenticationPromise) authenticationPromise = authenticate().finally(() => { authenticationPromise = null; });
  return authenticationPromise;
}
function sanitizeCompiledForApi(compiled) {
  const clone = JSON.parse(JSON.stringify(compiled));
  if (clone.design) {
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
        serial: item.serial != null ? Number(item.serial) : idx + 1,
        traits: item.traits && typeof item.traits === 'object' ? item.traits : {}
      }));
    }
  }
  if (clone.project?.banner?.src?.startsWith('data:')) {
    if (clone.project.banner.src.length > 2048) clone.project.banner.src = '';
  }
  return clone;
}

const CREATE_DRAFT_FIELD_PATHS = Object.freeze([
  'network', 'draftId',
  'project.name', 'project.builder', 'project.builderHandle', 'project.desc', 'project.about', 'project.videoUrl',
  'project.category', 'project.productState', 'project.evidence.type', 'project.evidence.url', 'project.evidence.label',
  'project.supportUrl', 'project.banner.src', 'project.banner.palette', 'project.banner.logoPosition', 'project.network',
  'edition.name', 'edition.series', 'edition.supply', 'edition.price', 'edition.royalty', 'edition.network',
  'advantages', 'referral.enabled', 'referral.rate', 'referral.settlement',
  'economics.maxPrimary', 'economics.nexMarketsFeeRate', 'economics.nexMarketsFee', 'economics.afterPlatformFee',
  'design.passDesign', 'design.themeMode', 'design.color', 'design.customColor', 'design.colorStyle',
  'design.gradientA', 'design.gradientB', 'design.gradientDirection', 'design.frame', 'design.frameHueCustomized',
  'design.frameColor', 'design.texture', 'design.textureTint', 'design.logoSrc', 'design.artMode', 'design.artSrc',
  'design.artEdition', 'design.artEditionView', 'design.selectedSerialIndex', 'design.artX', 'design.artY',
  'preview.hours', 'preview.opensAt', 'preview.localOpensAt', 'preview.timezone', 'preview.termsVersion',
  'review.evidence', 'review.advantages', 'review.preview'
]);

function hasOwnPath(value, path) {
  return path.split('.').reduce((current, key) => (
    current !== null && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined
  ), value) !== undefined;
}

function assertCreateDraftFieldCoverage(draft) {
  const missing = CREATE_DRAFT_FIELD_PATHS.filter((path) => !hasOwnPath(draft, path));
  if (missing.length) throw new Error(`CREATE_FIELDS_MISSING:${missing.join(',')}`);
  return draft;
}

window.__nmV2CreateDraftFieldPaths = CREATE_DRAFT_FIELD_PATHS;

async function submitCreateDraft() {
  const mount = document.getElementById('projectActionMount');
  try {
    const getter = typeof window.__nmV2CompileCreateLaunch === 'function' ? window.__nmV2CompileCreateLaunch : (typeof window.compileCreateLaunch === 'function' ? window.compileCreateLaunch : null);
    if (!getter) throw new Error('CREATE_WIZARD_UNAVAILABLE');
    const compiled = getter();
    if (!compiled) throw new Error('COMPILED_LAUNCH_UNAVAILABLE');
    const cleanDraft = assertCreateDraftFieldCoverage(sanitizeCompiledForApi(compiled));
    cleanDraft.status = 'DRAFT';
    const slug = (window.slugKey ? window.slugKey(compiled.project?.name || '') : compiled.id?.replace(/^launch-/, '')) || 'launch-draft';
    const name = compiled.project?.name || compiled.edition?.name || 'Untitled';
    const summary = compiled.project?.desc || compiled.project?.about?.slice(0, 500) || '';

    if (!state.authenticated || !state.wallet) {
      if (mount) mount.innerHTML = `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>Connecting wallet</h3><p>Connecting your Builder wallet on ${escapeHtml(activeNetworkName())}.</p></div>`;
      await authenticate({ throwOnError: true });
    }

    if (mount) {
      mount.innerHTML = `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>Saving draft</h3><p>Saving launch draft to NexMarkets server.</p></div>`;
    }

    const payload = {
      slug,
      name,
      summary,
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

    const launchRow = {
      id: project.id || `launch-${slug}`,
      name: `${name} ${compiled.edition?.name || 'Edition'}`,
      project: name,
      state: 'Draft',
      network: compiled.network || activeNetworkFamily(),
      minted: 0,
      supply: compiled.edition?.supply || 1,
      price: compiled.edition?.price || 0,
      primary: 0,
      timing: 'Draft saved',
      collection: slug,
      evidence: compiled.project?.evidence?.url || ''
    };

    if (window.dashboardState) {
      window.dashboardState.launches = window.dashboardState.launches || [];
      const oldIdx = window.dashboardState.launches.findIndex((x) => x.id === launchRow.id || x.project === name);
      if (oldIdx >= 0) window.dashboardState.launches[oldIdx] = launchRow;
      else window.dashboardState.launches.unshift(launchRow);
      if (typeof window.dashAddActivity === 'function') {
        window.dashAddActivity('launch', `${name} draft saved`, 'Safe workflow pending', 'Draft');
      }
    }

    if (window.createData) {
      window.createData.published = false;
    }
    if (typeof window.clearCreateDraft === 'function') {
      window.clearCreateDraft();
    }
    if (typeof window.renderDashboard === 'function') {
      window.renderDashboard();
    }

    if (mount) {
      mount.innerHTML = `
        <div class="create-publish-success">
          <div class="create-publish-mark">✓</div>
          <h3>Draft saved</h3>
          <p><strong>${escapeHtml(name)}</strong> draft has been securely saved to the server. Safe workflow is pending protocol admin execution on ${escapeHtml(activeNetworkName())}.</p>
          <div class="project-action-buttons" style="justify-content:center">
            <button class="btn" onclick="closeProjectAction();go('dashboard');setTimeout(()=>dashGo('launches'),30)">Dashboard</button>
            <button class="btn primary" onclick="closeProjectAction();go('create')">Edit draft</button>
          </div>
        </div>
      `;
    }
    showRuntimeBanner('Draft saved · Safe workflow pending');
    return project;
  } catch (error) {
    if (mount) {
      mount.innerHTML = `
        <div class="create-publish-error" style="text-align:center;padding:24px">
          <h3 style="color:#e05252;margin-bottom:8px">Draft save failed</h3>
          <p style="color:#c5cec4;margin-bottom:16px">${escapeHtml(error.message)}</p>
          <div class="project-action-buttons" style="justify-content:center">
            <button class="btn" onclick="closeProjectAction()">Close</button>
            <button class="btn primary" onclick="window.__nmV2SubmitCreateDraft?.()">Try again</button>
          </div>
        </div>
      `;
    }
    showRuntimeBanner(`Failed to save draft: ${error.message}`, true);
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
  const known = knownEdition(target);
  if (known) return known;
  const raw = await read(`/v1/editions/${target}`);
  const edition = normalizeEdition(raw, null);
  if (!edition) throw new Error('EDITION_NOT_FOUND');
  return edition;
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
  const connectFromButton = async () => {
    try {
      const opened = await openConnectModal();
      if (!opened?.address) await waitForConnection();
      await authenticateOnce();
    } catch (error) {
      showRuntimeBanner(error.message, true);
    }
  };
  document.querySelectorAll('.account-chip, #dashboard .p10-connected, #dashboard .p10-account, #dashboard .dash-person').forEach((chip) => {
    chip.addEventListener('click', async () => {
      if (!state.wallet) {
        await connectFromButton();
      } else {
        openAccountModal();
      }
    });
    chip.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!state.wallet) {
          await connectFromButton();
        } else {
          openAccountModal();
        }
      }
    });
  });

  onAccountChange(async (newAddress) => {
    if (newAddress && newAddress.toLowerCase() !== (state.wallet || '').toLowerCase()) {
      state.wallet = newAddress;
      setAccountLabel(short(newAddress));
      try { await authenticateOnce(); } catch {}
    } else if (!newAddress && state.wallet) {
      state.wallet = null;
      state.authenticated = false;
      setAccountLabel('Connect wallet');
      hydrate();
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
      showRuntimeBanner(`Please switch network to ${activeNetworkName()} (${required})`, true);
    }
  });
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
  window.openDashModal?.(`Change price · ${record.name}`, '<p class="dash-modal-copy">Seaport order prices are immutable. Changing the ask requires cancelling this order and signing a new order after the cancellation confirms.</p>', 'Cancel and relist later', () => { actionState('dashboard', 'Cancelling old listing', 'The old order must be cancelled before a new price can be signed.'); liveCancelListingRecord(record).catch((error) => actionError('dashboard', error)); });
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
    actionState('dashboard', 'Preparing Advantage use', 'Your wallet will sign the exact committed use operation.');
    await requireSession();
    const response = await mutation('/v1/advantages/consume', {
      operation: k === 'REDEMPTION' ? 'REDEEM' : 'CONSUME_QUANTITY',
      edition: context.pass.edition_address,
      tokenId: context.pass.token_id,
      advantageId: advantage.advantageId || rawAdvantageId(advantage.raw),
      ...(k === 'QUANTITY_BASED' ? { amount: '1' } : {}),
      useId: randomBytes32()
    });
    const result = await submitPrepared(response, { label: 'Advantage use' });
    actionSuccess('dashboard', 'Advantage use', result);
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
async function prepareEdition(input = {}) {
  await requireSession();
  const contracts = activeContracts();
  if (!address(contracts.protocolAdminSafe)) throw new Error('PROTOCOL_ADMIN_SAFE_CONFIGURATION_REQUIRED');
  return mutation('/v1/editions/prepare', {
    ...input,
    publisher: state.wallet,
    initialOwner: contracts.protocolAdminSafe,
    absoluteSupplyCap: Number(input.absoluteSupplyCap),
    salt: input.salt || randomBytes32()
  });
}
async function submitSafeEvidence(requestId, input = {}) {
  await requireSession();
  if (!requestId) throw new Error('EDITION_REQUEST_REQUIRED');
  return mutation(`/v1/edition-requests/${encodeURIComponent(requestId)}/safe-submit`, input);
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
function safeProposalText(proposal) {
  return proposal ? `<div class="dash-modal-field"><label>Safe target</label><code>${escapeHtml(proposal.to || '')}</code></div><div class="dash-modal-field"><label>Safe calldata</label><code>${escapeHtml(proposal.data || '')}</code></div>${proposal.predictedEditionAddress ? `<div class="dash-modal-field"><label>Predicted Edition</label><code>${escapeHtml(proposal.predictedEditionAddress)}</code></div>` : ''}` : '';
}
function liveManageLaunch(id) {
  const launch = builderLaunchRecord(id);
  if (!launch) return;
  const project = (state.builderDashboard.projects || []).find((row) => String(row.id) === String(launch.projectId));
  const draft = launch.draft || project?.content || project?.launchDraft || {};
  if (launch.requestId || launch.safeStatus) {
    const requestId = launch.requestId;
    const status = launch.safeStatus || 'SAFE_PENDING';
    window.openDashModal?.(`Manage ${launch.project}`, `<p class="dash-modal-copy">Factory deployment is controlled by the Protocol Admin Safe. This Builder wallet never signs the Factory transaction.</p><div class="dash-modal-field"><label>Safe request</label><strong>${escapeHtml(requestId || 'Indexed edition')}</strong></div><div class="dash-modal-field"><label>Status</label><strong>${escapeHtml(status)}</strong></div>${launch.predictedEditionAddress ? `<div class="dash-modal-field"><label>Predicted Edition</label><code>${escapeHtml(launch.predictedEditionAddress)}</code></div>` : ''}${requestId && status !== 'SUBMITTED' ? '<div class="dash-modal-field"><label>Safe execution tx hash</label><input id="nmSafeTxHash" placeholder="0x…" maxlength="66"></div><div class="dash-modal-field"><label>Safe transaction hash</label><input id="nmSafeTransactionHash" placeholder="0x…" maxlength="66"></div><p class="dash-modal-copy">Submit evidence only after the Safe execution is confirmed on the active network.</p>' : '<p class="dash-modal-copy">After the Edition is indexed, publish Builder-signed Terms with <code>window.nexmarketsV2.publishTerms(...)</code> using the exact committed Advantage config.</p>'}`, status !== 'SUBMITTED' && requestId ? 'Submit Safe evidence' : 'Close', status !== 'SUBMITTED' && requestId ? () => { actionState('dashboard', 'Verifying Safe execution', 'The server will verify the Safe receipt, factory event, Edition ID, and predicted address.'); submitSafeEvidence(requestId, { txHash: document.getElementById('nmSafeTxHash')?.value, safeTransactionHash: document.getElementById('nmSafeTransactionHash')?.value }).then(() => { showRuntimeBanner('Safe deployment evidence submitted'); hydrate(); }).catch((error) => actionError('dashboard', error)); } : () => window.closeDashModal?.());
    return;
  }
  window.openDashModal?.(`Launch ${launch.project}`, `<p class="dash-modal-copy">Prepare the deterministic Factory call for the Protocol Admin Safe. Review every value in Safe before execution.</p><div class="dash-modal-field"><label>Edition name</label><input id="nmLaunchEditionName" value="${escapeHtml(draft.edition?.name || launch.name || '')}" maxlength="120"></div><div class="dash-modal-field"><label>Symbol</label><input id="nmLaunchSymbol" placeholder="NEX" maxlength="12"></div><div class="dash-modal-field"><label>Edition ID (bytes32)</label><input id="nmLaunchEditionId" placeholder="0x…" maxlength="66"></div><div class="dash-modal-field"><label>Absolute supply cap</label><input id="nmLaunchSupply" type="number" min="1" value="${escapeHtml(draft.edition?.supply || '')}"></div><div class="dash-modal-field"><label>Artwork commitment (bytes32)</label><input id="nmLaunchArtworkCommitment" placeholder="0x…" maxlength="66"></div><div class="dash-modal-field"><label>Committed metadata base URI</label><input id="nmLaunchBaseTokenURI" type="url" placeholder="https://…"></div>`, 'Prepare Safe proposal', () => {
    const input = {
      projectId: launch.projectId,
      name: document.getElementById('nmLaunchEditionName')?.value?.trim(),
      symbol: document.getElementById('nmLaunchSymbol')?.value?.trim(),
      editionId: document.getElementById('nmLaunchEditionId')?.value?.trim(),
      absoluteSupplyCap: Number(document.getElementById('nmLaunchSupply')?.value),
      artworkCommitment: document.getElementById('nmLaunchArtworkCommitment')?.value?.trim(),
      baseTokenURI: document.getElementById('nmLaunchBaseTokenURI')?.value?.trim()
    };
    actionState('dashboard', 'Preparing Safe proposal', 'The API is validating the Builder project and predicting the CREATE2 Edition address.');
    prepareEdition(input).then((result) => {
      launch.requestId = result.request?.id || null;
      launch.safeStatus = result.request?.safeStatus || result.request?.safe_status || 'SAFE_PENDING';
      launch.predictedEditionAddress = result.safeProposal?.predictedEditionAddress || result.request?.predictedEditionAddress || null;
      window.openDashModal?.(`Safe proposal · ${launch.project}`, `<p class="dash-modal-copy">Review and execute this proposal from the Protocol Admin Safe.</p>${safeProposalText(result.safeProposal)}<div class="dash-modal-field"><label>Request</label><code>${escapeHtml(launch.requestId || '')}</code></div><p class="dash-modal-copy">After Safe execution, return here with both hashes so the server can verify the factory event.</p>`, 'Close', () => window.closeDashModal?.());
      showRuntimeBanner('Safe proposal prepared');
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
      case 'dashboard': return '/dashboard/holder';
      case 'project': {
        const name = selections().project || state.detailProject?.name || '';
        return name ? `/projects/${encodeURIComponent(name)}` : '/discover';
      }
      case 'collection': {
        const edition = selections().edition || state.edition?.address || '';
        return /^0x[0-9a-f]{40}$/i.test(edition)
          ? `/editions/${encodeURIComponent(edition)}`
          : (selections().project ? `/projects/${encodeURIComponent(selections().project)}` : '/discover');
      }
      case 'listing': {
        return '/market';
      }
      case 'owned': return '/dashboard/holder?view=owned';
      case 'launch': return '/projects/nexstudio';
      default: return null;
    }
  };

  const wrappedGo = function wrappedGo(route) {
    const nextPath = pathForRoute(route);
    if (nextPath) {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== nextPath) window.history.pushState({ nexmarketsRoute: route }, '', nextPath);
    }
    return originalGo.call(this, route);
  };
  wrappedGo.__nmHistoryWrapped = true;
  wrappedGo.__nmOriginalGo = originalGo;
  window.go = wrappedGo;
}
function exposeRuntime() {
  window.__nmV2SubmitCreateDraft = submitCreateDraft;
  window.completeCreatePublish = submitCreateDraft;
  window.nexmarketsV2 = {
    state,
    refresh: hydrate,
    connect: authenticate,
    navigate,
    submitCreateDraft,
    prepareEdition,
    submitSafeEvidence,
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

installHistoryRouting(); wireWallet(); installLiveActions(); guardMutations(); exposeRuntime();
addEventListener('popstate', () => goView(routeInfo()));
hydrate();
