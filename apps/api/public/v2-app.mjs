import { NexWallet } from './wallet.mjs';
import { openConnectModal, openAccountModal, openChainModal, onAccountChange, onChainChange } from './rainbow-wallet.mjs';

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
const ZERO = '0x0000000000000000000000000000000000000000';

const state = {
  config: null,
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
  templateData: null
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
function termsOf(edition) {
  const rows = Array.isArray(edition?.termsHistory) ? edition.termsHistory : Array.isArray(edition?.terms) ? edition.terms : [];
  const current = edition?.currentTerms || rows[0] || null;
  return { current, history: rows.length ? rows : current ? [current] : [] };
}
function termHash(term) { return lower(term?.terms_hash || term?.termsHash || term?.hash) || null; }
function editionAddress(value) { return address(value) || CERTIFICATION_EDITION; }
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
  const current = terms.current || {};
  const cap = number(raw?.absolute_supply_cap ?? raw?.absoluteSupplyCap ?? summary?.absolute_supply_cap ?? summary?.absoluteSupplyCap);
  const minted = number(raw?.totalMinted ?? raw?.total_minted ?? summary?.total_minted ?? summary?.totalMinted);
  const name = raw?.name || summary?.name || (addr.toLowerCase() === CERTIFICATION_EDITION.toLowerCase() ? 'NexMarkets V1 Test Certification Edition' : `NexPass Edition ${short(addr)}`);
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
    termsHistory: terms.history,
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
  return {
    ...raw,
    token_id: token,
    tokenId: token,
    owner,
    owner_address: owner,
    edition_address: addr,
    terms_hash: lower(raw.terms_hash || raw.termsHash) || null,
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
    orderHash: lower(raw.order_hash || raw.orderHash)
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
    about: `A permanent NexPass Edition on Robinhood Chain. Ownership, serials and versioned Terms are read from the certified deployment. Edition ${short(edition?.address)} is indexed by Goldsky.`,
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
    desc: `Finite Pass Edition · ${edition?.totalMinted || 0}/${edition?.absoluteSupplyCap || 0} serials issued on Robinhood Chain.`,
    opens: stage === 'preview' ? 'Preview' : 'Live',
    network: 'robinhood',
    editionAddress: edition?.address,
    termsHash: termHash(terms) || lower(summary?.active_terms_hash) || null
  };
  return { project, experience };
}
function ownedModel(raw, pass, edition) {
  const token = String(raw?.token_id ?? raw?.tokenId ?? pass?.token_id ?? '0');
  const advantages = pass?.advantages || raw?.advantages || [];
  const first = advantages[0];
  const title = edition?.name || raw?.project_name || pass?.name || `Edition ${short(raw?.edition_address)}`;
  const rem = advantageText(advantages, pass?.terms_hash);
  return {
    key: `${lower(raw?.edition_address || pass?.edition_address || edition?.address)}-${token}`,
    name: title,
    serial: `${padSerial(token)} / ${edition?.absoluteSupplyCap || raw?.absolute_supply_cap || ''}`.trim(),
    logo: initials(title), color: '#34483a', category: 'Robinhood Edition',
    desc: 'Exact serial ownership recorded on Robinhood Chain.',
    advantage: rem, duration: kindLabel(first?.kind).toUpperCase(), utility: rem.toUpperCase(), state: rem,
    floor: 0, art: 'nx', artSrc: '',
    editionAddress: lower(raw?.edition_address || pass?.edition_address || edition?.address),
    tokenId: token, termsHash: pass?.terms_hash || raw?.terms_hash || null,
    owner: pass?.owner_address || raw?.owner_address || null,
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
  panel.innerHTML = `<h2>${escapeHtml(title || 'Certification Edition')}</h2><div class="nm-v2-grid">${rows.map(([label, value]) => `<div class="nm-v2-cell"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`).join('')}</div>${history.length ? `<h3 style="margin:20px 0 8px">Terms history</h3><div>${history.map((term) => `<div class="nm-v2-cell"><span>Version ${escapeHtml(term.version ?? '—')} · ${escapeHtml(termHash(term) || '—')}</span><strong>Preview ${escapeHtml(iso(term.previewStartsAt ?? term.preview_starts_at) || '—')} · Mint ${escapeHtml(iso(term.mintStartsAt ?? term.mint_starts_at) || '—')} · ${escapeHtml(usd(term.pricePerPass ?? term.price_usdg).toFixed(6))} USDG</strong></div>`).join('')}</div>` : ''}${selected ? `<h3 style="margin:20px 0 8px">Advantages</h3>${advantages.length ? advantages.map((advantage) => `<div class="nm-v2-adv"><small>${escapeHtml(kindLabel(advantage.kind))}</small><b>${escapeHtml(advantageText([advantage]))}</b><span>${consumes(advantage.kind) ? 'Onchain consumption available when not listed.' : 'Entitlement/access state; no view-only transaction.'}</span></div>`).join('') : '<div class="nm-v2-cell">No committed Advantages indexed.</div>'}` : ''}`;
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
  const response = await fetch(`${origin}${path}`, { credentials: 'same-origin', ...options, headers: { accept: 'application/json', ...(options.headers || {}) } });
  let payload = null; try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new Error(payload?.error?.code || `API_${response.status}`);
  return payload?.data ?? payload;
}
async function loadConfig() {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('TESTNET_CONFIG_UNAVAILABLE');
  const config = await response.json();
  if (Number(config.chainId) !== CHAIN_ID) throw new Error('TESTNET_CHAIN_CONFIGURATION_REQUIRED');
  state.config = config;
  setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
  return config;
}
async function loadChainData() {
  const [discoverResult, editionResult, passResult, listingsResult] = await Promise.allSettled([
    read('/v1/discover'),
    read(`/v1/editions/${CERTIFICATION_EDITION}`),
    read(`/v1/passes/${CERTIFICATION_EDITION}/${CERTIFICATION_TOKEN}`),
    read('/v1/market/listings')
  ]);
  const discover = discoverResult.status === 'fulfilled' ? (Array.isArray(discoverResult.value) ? discoverResult.value : discoverResult.value?.editions || []) : [];
  const summary = discover.find((item) => lower(item.edition_address || item.address) === CERTIFICATION_EDITION.toLowerCase()) || discover[0] || null;
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
  if (!state.authenticated) return { owned: [], advantages: [] };
  const results = await Promise.allSettled([read('/v1/me/passes'), read('/v1/me/advantages')]);
  return {
    owned: results[0].status === 'fulfilled' ? (Array.isArray(results[0].value) ? results[0].value : []) : [],
    advantages: results[1].status === 'fulfilled' ? (Array.isArray(results[1].value) ? results[1].value : []) : []
  };
}
async function hydrate() {
  try {
    await loadConfig(); await loadChainData();
    const first = state.discover[0] || state.edition;
    const editions = state.discover.length ? state.discover : (state.edition ? [state.edition] : []);
    const mappedProjects = editions.map((item) => {
      const isCertification = lower(item.address) === CERTIFICATION_EDITION.toLowerCase();
      return projectModel(isCertification ? state.edition : item, item, isCertification ? state.pass : null);
    }).filter((item) => item?.project);
    if (!mappedProjects.length && (state.edition || first)) mappedProjects.push(projectModel(state.edition || first, null, state.pass));
    state.projects = mappedProjects.map((item) => item.project);
    state.projectExperience = Object.fromEntries(mappedProjects.map((item) => [item.project.name, item.experience]));
    const accountData = await loadAuthenticatedData();
    const owned = accountData.owned.map((row) => {
      const p = lower(row.edition_address) === lower(state.edition?.address) ? state.pass : null;
      return ownedModel(row, p, state.edition);
    });
    const collections = state.discover.map((edition) => ({ name: edition.name, key: initials(edition.name).toLowerCase(), color: '#34483a', mechanism: 'Connected', floor: 0, last: 0, listed: state.listings.filter((item) => lower(item.edition_address) === lower(edition.address)).length }));
    const dashboard = emptyDashboard(state.projects);
    dashboard.launches.forEach((launch) => {
      const item = state.projects.find((project) => project.name === launch.project);
      if (item) launch._minted = lower(item.editionAddress) === lower(state.edition?.address) ? state.edition?.totalMinted || 0 : 0;
    });
    publishTemplateData({ projects: state.projects, projectExperience: state.projectExperience, collections, listings: state.listings, ownedPasses: owned, dashboardState: dashboard, createData: neutralCreateData(), selectedProject: state.projects[0]?.name || '' });
    setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
    state.error = null;
  } catch (error) {
    state.error = error;
    state.projects = []; state.projectExperience = {};
    publishTemplateData({ projects: [], projectExperience: {}, collections: [], listings: [], ownedPasses: [], dashboardState: emptyDashboard([]), createData: neutralCreateData() });
    setAccountLabel(state.wallet ? short(state.wallet) : 'Connect wallet');
    showRuntimeBanner(`Live NexMarkets data is unavailable: ${error.message}`, true);
  }
  document.documentElement.classList.remove('nm-v2-loading'); document.documentElement.classList.add('nm-v2-ready');
  injectLiveDataStyle();
  goView(routeInfo());
  if (state.error) return;
}
async function authenticate() {
  try {
    const identity = await wallet.connect(Number(state.config?.chainId || CHAIN_ID));
    state.wallet = identity.address; setAccountLabel(short(identity.address));
    const challenge = await read('/v1/auth/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: identity.address }) });
    const signature = await wallet.signMessage(challenge.message);
    const verified = await read('/v1/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nonce: challenge.nonce, signature }) });
    state.csrfToken = verified.csrfToken; state.authenticated = true; sessionStorage.setItem('nex_csrf', verified.csrfToken);
    await hydrate(); showRuntimeBanner('Wallet verified on Robinhood Chain');
  } catch (error) { showRuntimeBanner(error.message, true); }
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

async function submitCreateDraft() {
  const mount = document.getElementById('projectActionMount');
  try {
    const getter = typeof window.__nmV2CompileCreateLaunch === 'function' ? window.__nmV2CompileCreateLaunch : (typeof window.compileCreateLaunch === 'function' ? window.compileCreateLaunch : null);
    if (!getter) throw new Error('CREATE_WIZARD_UNAVAILABLE');
    const compiled = getter();
    if (!compiled) throw new Error('COMPILED_LAUNCH_UNAVAILABLE');
    const cleanDraft = sanitizeCompiledForApi(compiled);
    cleanDraft.status = 'DRAFT';
    const slug = (window.slugKey ? window.slugKey(compiled.project?.name || '') : compiled.id?.replace(/^launch-/, '')) || 'launch-draft';
    const name = compiled.project?.name || compiled.edition?.name || 'Untitled';
    const summary = compiled.project?.desc || compiled.project?.about?.slice(0, 500) || '';

    if (!state.authenticated || !state.wallet) {
      if (mount) mount.innerHTML = `<div class="project-action-state"><div class="market-tx-spinner"></div><h3>Connecting wallet</h3><p>Connecting your Builder wallet on Robinhood Chain.</p></div>`;
      await authenticate();
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
      network: compiled.network || 'robinhood',
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
          <p><strong>${escapeHtml(name)}</strong> draft has been securely saved to the server. Safe workflow is pending protocol admin execution on Robinhood Chain.</p>
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

function wireWallet() {
  document.querySelectorAll('.account-chip, #dashboard .p10-connected, #dashboard .p10-account, #dashboard .dash-person').forEach((chip) => {
    chip.addEventListener('click', async () => {
      if (!state.wallet) {
        if (typeof window !== 'undefined' && window.ethereum?.request && !window.ethereum?.isWalletConnect) {
          authenticate();
        } else {
          try {
            await openConnectModal();
            await authenticate();
          } catch {
            authenticate();
          }
        }
      } else {
        openAccountModal();
      }
    });
    chip.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!state.wallet) {
          if (typeof window !== 'undefined' && window.ethereum?.request && !window.ethereum?.isWalletConnect) {
            authenticate();
          } else {
            try {
              await openConnectModal();
              await authenticate();
            } catch {
              authenticate();
            }
          }
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
      try { await authenticate(); } catch {}
    } else if (!newAddress && state.wallet) {
      state.wallet = null;
      state.authenticated = false;
      setAccountLabel('Connect wallet');
      hydrate();
    }
  });

  onChainChange(async (newChainId) => {
    const required = Number(state.config?.chainId || CHAIN_ID);
    if (newChainId && newChainId !== required) {
      showRuntimeBanner(`Please switch network to Robinhood Chain (${required})`, true);
    }
  });
}
function guardMutations() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button,form');
    if (!target || target.closest('.account-chip')) return;
    if (target.closest('#create') || target.closest('#projectActionMount') || target.closest('#projectActionModal')) return;
    const text = String(target.textContent || '').trim();
    if (!/(^|\b)(get pass|get the pass|confirm purchase|buy|purchase|list pass|list for sale|redeem|use quantity|withdraw|publish|create edition|prepare safe|mint)(\b|$)/i.test(text)) return;
    if (target.closest('#nm-v2-runtime-banner')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    showRuntimeBanner('This browser view is read-only. No blockchain transaction was submitted.', false);
  }, true);
}

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
    certificationEdition: CERTIFICATION_EDITION,
    certificationToken: CERTIFICATION_TOKEN
  };
}

installHistoryRouting(); wireWallet(); guardMutations(); exposeRuntime();
addEventListener('popstate', () => goView(routeInfo()));
hydrate();
