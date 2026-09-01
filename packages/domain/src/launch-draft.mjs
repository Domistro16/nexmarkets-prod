import { createHash } from 'node:crypto';

export const ALLOWED_CATEGORIES = Object.freeze([
  'tools', 'ai', 'media', 'finance', 'community', 'gaming', 'physical', 'infrastructure'
]);

export const ALLOWED_PRODUCT_STATES = Object.freeze([
  'Live', 'MVP', 'Beta', 'Development', 'Concept', 'Preview'
]);

export const ALLOWED_ADVANTAGE_MECHANISMS = Object.freeze([
  'TimeBased', 'QuantityBased', 'Connected', 'Redemption'
]);

export const ALLOWED_REFERRAL_RATES = Object.freeze([5, 10, 15, 20]);

export const ALLOWED_PASS_DESIGNS = Object.freeze([
  'classic', 'modern', 'glass', 'metal', 'chroma'
]);

export const ALLOWED_THEME_MODES = Object.freeze([
  'auto', 'custom', 'amber', 'steel', 'onyx'
]);

export const ALLOWED_COLOR_STYLES = Object.freeze([
  'solid', 'gradient'
]);

export const ALLOWED_GRADIENT_DIRECTIONS = Object.freeze([
  'diagonal', 'vertical', 'horizontal', 'radial'
]);

export const ALLOWED_FRAMES = Object.freeze([
  'obsidian', 'gilt', 'prism', 'carbon', 'ivory', 'verdigris', 'lacquer',
  'denim', 'sakura', 'titanium', 'cobalt', 'onyx', 'forge', 'aurora'
]);

export const ALLOWED_TEXTURES = Object.freeze([
  'none', 'grain', 'dots', 'lines', 'mesh', 'grid', 'carbon'
]);

export const ALLOWED_ART_MODES = Object.freeze([
  'single', 'collection'
]);

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const SLUG_REGEX = /^[a-z0-9-]{3,80}$/;
const USDG_PRICE_REGEX = /^\d+(\.\d{1,6})?$/;

function isValidUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isValidVideoUrl(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!isValidUrl(trimmed)) return false;
  return /(?:youtube\.com|youtu\.be|vimeo\.com|loom\.com)/i.test(trimmed) || /^https?:\/\//i.test(trimmed);
}

function sanitizeMediaUrl(src, maxChars = 2048) {
  if (!src || typeof src !== 'string') return '';
  const trimmed = src.trim();
  if (trimmed.startsWith('blob:')) return '';
  if (trimmed.startsWith('data:')) {
    return trimmed.length > maxChars ? '' : trimmed;
  }
  return trimmed.slice(0, maxChars);
}

export function validateAndNormalizeProjectPayload(input = {}) {
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('INVALID_PROJECT'), { status: 400 });
  }

  const rawSlug = String(input.slug ?? input.launchDraft?.id?.replace(/^launch-/, '') ?? '').trim().toLowerCase();
  if (!SLUG_REGEX.test(rawSlug)) {
    throw Object.assign(new Error('INVALID_PROJECT_SLUG'), { status: 400 });
  }

  const rawName = String(input.name ?? input.launchDraft?.project?.name ?? '').trim();
  if (rawName.length < 2 || rawName.length > 120) {
    throw Object.assign(new Error('INVALID_PROJECT_NAME'), { status: 400 });
  }

  const summary = String(
    input.summary ??
    input.launchDraft?.project?.desc ??
    input.launchDraft?.project?.about ??
    ''
  ).trim().slice(0, 500);

  const launchDraft = normalizeLaunchDraft(input.launchDraft ?? {}, {
    slug: rawSlug,
    name: rawName,
    summary,
    topSupply: input.supply,
    topPrice: input.price
  });

  return {
    slug: rawSlug,
    name: rawName,
    summary,
    launchDraft
  };
}

export function normalizeLaunchDraft(draft = {}, defaults = {}) {
  const isFullDraft = draft && (draft.project || draft.edition || draft.advantages || draft.design || draft.preview);
  const name = String(draft.project?.name ?? defaults.name ?? '').trim();
  if (name.length < 2 || name.length > 120) {
    throw Object.assign(new Error('INVALID_PROJECT_NAME'), { status: 400 });
  }

  const slug = String(defaults.slug ?? draft.id?.replace(/^launch-/, '') ?? '').trim().toLowerCase();
  if (!SLUG_REGEX.test(slug)) {
    throw Object.assign(new Error('INVALID_PROJECT_SLUG'), { status: 400 });
  }

  const draftId = String(draft.draftId ?? defaults.draftId ?? `draft-${Date.now()}`).slice(0, 120);

  // Project section
  const projectInput = draft.project ?? {};
  const builder = String(projectInput.builder ?? name).trim();
  if (builder.length < 2 || builder.length > 120) {
    throw Object.assign(new Error('INVALID_BUILDER_NAME'), { status: 400 });
  }

  const builderHandle = String(projectInput.builderHandle ?? `@${slug}`).trim().slice(0, 80);
  const desc = String(projectInput.desc ?? defaults.summary ?? '').trim().slice(0, 500);
  const about = String(projectInput.about ?? defaults.summary ?? '').trim().slice(0, 4000);

  if (isFullDraft && desc.length < 10) {
    throw Object.assign(new Error('INVALID_PROJECT_DESCRIPTION'), { status: 400 });
  }
  if (isFullDraft && about.length < 20) {
    throw Object.assign(new Error('INVALID_PROJECT_ABOUT'), { status: 400 });
  }

  const videoUrl = String(projectInput.videoUrl ?? '').trim();
  if (videoUrl && !isValidVideoUrl(videoUrl)) {
    throw Object.assign(new Error('INVALID_VIDEO_URL'), { status: 400 });
  }

  const evidence = projectInput.evidence ?? {};
  const evidenceType = String(evidence.type ?? projectInput.evidenceType ?? 'Product').trim();
  const rawEvidenceUrl = String(evidence.url ?? projectInput.evidenceUrl ?? '').trim();
  if (isFullDraft && (!rawEvidenceUrl || !isValidUrl(rawEvidenceUrl))) {
    throw Object.assign(new Error('INVALID_EVIDENCE_URL'), { status: 400 });
  }

  const supportUrl = String(projectInput.supportUrl ?? '').trim();
  if (supportUrl && !isValidUrl(supportUrl)) {
    throw Object.assign(new Error('INVALID_SUPPORT_URL'), { status: 400 });
  }

  const category = String(projectInput.category ?? 'tools').toLowerCase();
  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw Object.assign(new Error('INVALID_CATEGORY'), { status: 400 });
  }

  const productState = String(projectInput.productState ?? 'Live');
  if (!ALLOWED_PRODUCT_STATES.includes(productState)) {
    throw Object.assign(new Error('INVALID_PRODUCT_STATE'), { status: 400 });
  }

  const bannerInput = projectInput.banner ?? {};
  const bannerPalette = Array.isArray(bannerInput.palette) && bannerInput.palette.length >= 3
    ? bannerInput.palette.slice(0, 3).map((c) => HEX_COLOR_REGEX.test(c) ? c : '#5f6f50')
    : ['#5f6f50', '#30483d', '#111512'];
  const bannerLogoPosition = bannerInput.logoPosition === 'tr' ? 'tr' : 'tl';
  const bannerSrc = sanitizeMediaUrl(bannerInput.src);

  // Edition section
  const editionInput = draft.edition ?? {};
  const editionName = String(editionInput.name ?? 'FOUNDING EDITION').trim().slice(0, 120);
  const series = String(editionInput.series ?? 'SERIES 01').trim().slice(0, 80);

  const rawSupply = editionInput.supply ?? defaults.topSupply ?? 1;
  const supply = Number(rawSupply);
  if (!Number.isInteger(supply) || supply < 1) {
    throw Object.assign(new Error('INVALID_SUPPLY'), { status: 400 });
  }

  const rawPrice = editionInput.price ?? defaults.topPrice ?? 0;
  const priceString = String(rawPrice);
  if (!USDG_PRICE_REGEX.test(priceString) || Number(rawPrice) < 0) {
    throw Object.assign(new Error('INVALID_USDG_PRICE'), { status: 400 });
  }
  const price = Number(rawPrice);

  const rawRoyalty = editionInput.royalty ?? 0;
  const royalty = Number(rawRoyalty);
  if (Number.isNaN(royalty) || royalty < 0 || royalty > 5) {
    throw Object.assign(new Error('INVALID_ROYALTY'), { status: 400 });
  }

  // Advantages section
  const rawAdvantages = Array.isArray(draft.advantages) ? draft.advantages : [];
  const advantages = rawAdvantages.map((item, index) => {
    const mechKey = ALLOWED_ADVANTAGE_MECHANISMS.find(
      (m) => m.toLowerCase() === String(item.mechanism ?? '').toLowerCase()
    );
    if (!mechKey) {
      throw Object.assign(new Error('INVALID_ADVANTAGE_MECHANISM'), { status: 400 });
    }
    const covered = String(item.covered ?? '').trim().slice(0, 120);
    const benefit = String(item.benefit ?? '').trim().slice(0, 120);
    const duration = String(item.duration ?? '').trim().slice(0, 120);
    if (isFullDraft && (!covered || !benefit || !duration)) {
      throw Object.assign(new Error('INVALID_ADVANTAGE_DEFINITION'), { status: 400 });
    }
    return {
      id: String(item.id ?? `adv-${index + 1}`).slice(0, 64),
      mechanism: mechKey,
      covered,
      benefit,
      duration,
      summary: String(item.summary ?? `${benefit} · ${covered}`).trim().slice(0, 240)
    };
  });

  if (isFullDraft && advantages.length === 0) {
    throw Object.assign(new Error('ADVANTAGES_REQUIRED'), { status: 400 });
  }

  // Referral section
  const refInput = draft.referral ?? {};
  const refEnabled = Boolean(refInput.enabled);
  const rawRefRate = Number(refInput.rate ?? 10);
  if (refEnabled && !ALLOWED_REFERRAL_RATES.includes(rawRefRate)) {
    throw Object.assign(new Error('INVALID_REFERRAL_RATE'), { status: 400 });
  }
  const referral = refEnabled
    ? { enabled: true, rate: rawRefRate, settlement: 'Builder Settled' }
    : { enabled: false, rate: 0, settlement: 'Builder Settled' };

  // Economics section
  const maxPrimary = Number((supply * price).toFixed(6));
  const nexMarketsFee = Number((maxPrimary * 0.05).toFixed(6));
  const afterPlatformFee = Number((maxPrimary - nexMarketsFee).toFixed(6));
  const economics = {
    maxPrimary,
    nexMarketsFeeRate: 0.05,
    nexMarketsFee,
    afterPlatformFee
  };

  // Design section
  const designInput = draft.design ?? {};
  const passDesign = String(designInput.passDesign ?? 'classic').toLowerCase();
  if (!ALLOWED_PASS_DESIGNS.includes(passDesign)) {
    throw Object.assign(new Error('INVALID_PASS_DESIGN'), { status: 400 });
  }

  const themeMode = String(designInput.themeMode ?? 'auto').toLowerCase();
  if (!ALLOWED_THEME_MODES.includes(themeMode)) {
    throw Object.assign(new Error('INVALID_THEME_MODE'), { status: 400 });
  }

  const color = HEX_COLOR_REGEX.test(designInput.color) ? designInput.color : '#5f6f50';
  const colorStyle = ALLOWED_COLOR_STYLES.includes(designInput.colorStyle) ? designInput.colorStyle : 'solid';
  const gradientA = HEX_COLOR_REGEX.test(designInput.gradientA) ? designInput.gradientA : color;
  const gradientB = HEX_COLOR_REGEX.test(designInput.gradientB) ? designInput.gradientB : '#17241f';
  const gradientDirection = ALLOWED_GRADIENT_DIRECTIONS.includes(designInput.gradientDirection) ? designInput.gradientDirection : 'diagonal';

  const frame = ALLOWED_FRAMES.includes(designInput.frame) ? designInput.frame : 'gilt';
  const frameColor = HEX_COLOR_REGEX.test(designInput.frameColor) ? designInput.frameColor : '#c8a84e';
  const texture = ALLOWED_TEXTURES.includes(designInput.texture) ? designInput.texture : 'none';
  const textureTint = HEX_COLOR_REGEX.test(designInput.textureTint) ? designInput.textureTint : '#9b9b94';

  const artMode = ALLOWED_ART_MODES.includes(designInput.artMode) ? designInput.artMode : 'single';
  const artX = Math.max(0, Math.min(100, Number(designInput.artX ?? 50)));
  const artY = Math.max(0, Math.min(100, Number(designInput.artY ?? 50)));

  const rawArtEdition = Array.isArray(designInput.artEdition) ? designInput.artEdition : [];
  const artEdition = rawArtEdition.map((entry, idx) => {
    const serial = entry.serial != null ? Number(entry.serial) : idx + 1;
    return {
      assetKey: String(entry.assetKey ?? entry.storageKey ?? '').slice(0, 160),
      filename: String(entry.filename ?? `artwork_${serial}`).slice(0, 160),
      title: String(entry.title ?? `Artwork ${serial}`).slice(0, 160),
      type: String(entry.type ?? entry.mimeType ?? 'image/png').slice(0, 60),
      size: Number(entry.size ?? entry.byteSize ?? 0),
      sha256: typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(entry.sha256) ? entry.sha256.toLowerCase() : null,
      serial,
      traits: entry.traits && typeof entry.traits === 'object' ? { ...entry.traits } : {}
    };
  });

  if (artMode === 'collection' && artEdition.length > 0 && artEdition.length !== supply) {
    throw Object.assign(new Error('COLLECTION_ARTWORK_SUPPLY_MISMATCH'), { status: 400 });
  }

  const design = {
    passDesign,
    themeMode,
    color,
    colorStyle,
    gradientA,
    gradientB,
    gradientDirection,
    frame,
    frameColor,
    texture,
    textureTint,
    logoSrc: sanitizeMediaUrl(designInput.logoSrc),
    artMode,
    artSrc: sanitizeMediaUrl(designInput.artSrc),
    artEdition,
    selectedSerialIndex: Math.max(0, Number(designInput.selectedSerialIndex ?? 0)),
    artX,
    artY
  };

  // Preview section
  const previewInput = draft.preview ?? {};
  const rawHours = Number(previewInput.hours ?? 24);
  if (!Number.isInteger(rawHours) || rawHours < 24) {
    throw Object.assign(new Error('INVALID_PREVIEW_HOURS'), { status: 400 });
  }

  const rawOpensAt = previewInput.opensAt ?? new Date(Date.now() + rawHours * 3600 * 1000).toISOString();
  const openDate = new Date(rawOpensAt);
  if (Number.isNaN(openDate.getTime())) {
    throw Object.assign(new Error('INVALID_OPENING_TIME'), { status: 400 });
  }

  const timezone = String(previewInput.timezone ?? 'UTC').trim().slice(0, 80);
  const termsVersion = String(previewInput.termsVersion ?? 'v1.0').trim().slice(0, 32);

  const preview = {
    hours: rawHours,
    opensAt: openDate.toISOString(),
    localOpensAt: String(previewInput.localOpensAt ?? rawOpensAt),
    timezone,
    termsVersion
  };

  // Review section
  const reviewInput = draft.review ?? {};
  const review = {
    evidence: Boolean(reviewInput.evidence ?? draft.reviewEvidence),
    advantages: Boolean(reviewInput.advantages ?? draft.reviewAdvantages),
    preview: Boolean(reviewInput.preview ?? draft.reviewPreview)
  };

  // Network
  const network = 'robinhood';

  return {
    id: `launch-${slug}`,
    draftId,
    network,
    project: {
      name,
      builder,
      builderHandle,
      desc,
      about,
      videoUrl,
      category,
      productState,
      evidence: {
        type: evidenceType,
        url: rawEvidenceUrl,
        label: String(evidence.label ?? evidenceType)
      },
      supportUrl,
      banner: {
        src: bannerSrc,
        palette: bannerPalette,
        logoPosition: bannerLogoPosition
      },
      network
    },
    edition: {
      name: editionName,
      series,
      supply,
      price,
      royalty,
      network
    },
    advantages,
    referral,
    economics,
    design,
    preview,
    review,
    status: 'DRAFT'
  };
}
