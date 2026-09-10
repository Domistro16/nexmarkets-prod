// This is the single server-side authority for issued Pass appearance.  The
// browser prototype has the same option and palette IDs, but an issued Pass
// must never be regenerated from prototype defaults after publication.
export const PASS_RENDERER_VERSION = 'pass-renderer-v1';

export const PASS_DESIGN_OPTIONS = Object.freeze([
  { id: 'classic-obsidian', family: 'classic', material: 'obsidian', label: 'Classic · Obsidian', name: 'Classic', description: 'Classic frame in Obsidian.' },
  { id: 'classic-carbon', family: 'classic', material: 'carbon', label: 'Classic · Carbon', name: 'Classic', description: 'Classic frame in Carbon.' },
  { id: 'classic-gilt', family: 'classic', material: 'gilt', label: 'Classic · Gilt', name: 'Classic', description: 'Classic frame in Gilt.' },
  { id: 'glass-obsidian', family: 'glass', material: 'obsidian', label: 'Glass · Obsidian', name: 'Glass', description: 'Glass frame in Obsidian.' },
  { id: 'glass-carbon', family: 'glass', material: 'carbon', label: 'Glass · Carbon', name: 'Glass', description: 'Glass frame in Carbon.' },
  { id: 'pack-slab', family: 'graded-vault-slab', material: 'transparent-graded-case', label: 'Graded Vault Slab', name: 'Graded Vault Slab', description: 'Transparent graded case + archival insert.' },
  { id: 'pack-glass', family: 'museum-glass-archive', material: 'glass-vitrine', label: 'Museum Glass Archive', name: 'Museum Glass Archive', description: 'Glass vitrine + brass plaque + dark archive mat.' },
  { id: 'pack-metal', family: 'machined-metal-vault', material: 'milled-alloy', label: 'Machined Metal Vault', name: 'Machined Metal Vault', description: 'Milled alloy shell + bolts + recessed plates.' },
  { id: 'pack-ceramic', family: 'ceramic-enamel-tile', material: 'glazed-ceramic', label: 'Ceramic Enamel Tile', name: 'Ceramic Enamel Tile', description: 'Glazed ceramic + enamel inset.' },
  { id: 'pack-blister', family: 'collector-blister-pack', material: 'thermoformed-chamber', label: 'Collector Blister Pack', name: 'Collector Blister Pack', description: 'Die-cut backer + thermoformed chamber + foil seal.' },
  { id: 'pack-carbon', family: 'forged-carbon-frame', material: 'carbon-weave', label: 'Forged Carbon Frame', name: 'Forged Carbon Frame', description: 'Carbon weave + anodised accent.' },
  { id: 'pack-paper', family: 'antique-archive-certificate', material: 'cotton-rag-deed-stock', label: 'Antique Archive Certificate', name: 'Antique Archive Certificate', description: 'Cotton-rag deed stock + engraved ink + wax seal.' },
  { id: 'pack-resin', family: 'cast-resin-display-block', material: 'tinted-cast-resin', label: 'Cast Resin Display Block', name: 'Cast Resin Display Block', description: 'Tinted cast resin + suspended insert + embedded metal tag.' }
]);

export const PASS_COLORWAYS = Object.freeze([
  { id: 'colourway-01', name: 'Crimson Archive' },
  { id: 'colourway-02', name: 'Cobalt Field' },
  { id: 'colourway-03', name: 'Forest Ledger' },
  { id: 'colourway-04', name: 'Ochre Study' },
  { id: 'colourway-05', name: 'Violet Register' }
]);

const PALETTES = Object.freeze({
  classic: [['#b31d2b', '#f2f0e9', '#17181b'], ['#244e9c', '#edf3ff', '#10141e'], ['#121417', '#e8d8b0', '#1a1410'], ['#2d5d49', '#f4ebd1', '#161916'], ['#5a5869', '#dbe0eb', '#17181c']],
  glass: [['#6d1822', '#d7d0bb', '#20252b'], ['#355f8d', '#dfe8ef', '#1b2127'], ['#2d5647', '#e2ddc7', '#1e2220'], ['#73553c', '#e7dccc', '#241d18'], ['#554679', '#e4dcf0', '#221d2b']],
  'pack-slab': [['#b31d2b', '#f2f0e9', '#17181b'], ['#244e9c', '#edf3ff', '#10141e'], ['#121417', '#e8d8b0', '#1a1410'], ['#2d5d49', '#f4ebd1', '#161916'], ['#5a5869', '#dbe0eb', '#17181c']],
  'pack-glass': [['#6d1822', '#d7d0bb', '#20252b'], ['#355f8d', '#dfe8ef', '#1b2127'], ['#2d5647', '#e2ddc7', '#1e2220'], ['#73553c', '#e7dccc', '#241d18'], ['#554679', '#e4dcf0', '#221d2b']],
  'pack-metal': [['#6b7077', '#d5d8dc', '#13161a'], ['#24292f', '#e2b860', '#0d0f12'], ['#5b2c2f', '#c98b73', '#191416'], ['#284d5b', '#8fc2ca', '#11191c'], ['#5a4c3f', '#d7c4a1', '#171410']],
  'pack-ceramic': [['#1b5f75', '#f2e7d5', '#d4ad58'], ['#862e2e', '#f2d8c6', '#261714'], ['#2f6c54', '#e9e0c5', '#bb8d43'], ['#2f3f85', '#d9e0f1', '#ece7d3'], ['#6a3a73', '#e8d5e9', '#d3b16a']],
  'pack-blister': [['#d34a35', '#fff0d8', '#1b1b1b'], ['#1763a8', '#f4e33e', '#f7f8fa'], ['#7a3aa4', '#ff9b42', '#f7efe7'], ['#238a64', '#f4cf4c', '#153028'], ['#23262b', '#ed5c3f', '#f0f2f5']],
  'pack-carbon': [['#17191c', '#e45f35', '#d9dde1'], ['#13171a', '#3c82e6', '#d7e3f5'], ['#171714', '#d6ad45', '#ece3c4'], ['#15191a', '#3fbf8d', '#d5efe5'], ['#19151c', '#a06de6', '#e5dbf5']],
  'pack-paper': [['#c8ad78', '#6b4020', '#7f261f'], ['#d7c59a', '#334c3d', '#8e3d2e'], ['#c8b79a', '#313a56', '#7d602d'], ['#b99970', '#4a2d25', '#245060'], ['#d5c18d', '#5c4d27', '#5f2e5f']],
  'pack-resin': [['#2d6e88', '#dbeef3', '#77c5dc'], ['#4b3d68', '#eee4f5', '#b69ad1'], ['#365a4a', '#e2eee5', '#89baa0'], ['#6f5038', '#f0e5d4', '#cfaa80'], ['#313b49', '#e4e9ef', '#93a9c2']]
});

export const PASS_ASSIGNMENT_POOL = Object.freeze(PASS_DESIGN_OPTIONS.flatMap((option) => PASS_COLORWAYS.map((colorway, index) => ({
  optionId: option.id,
  family: option.family,
  material: option.material,
  label: option.label,
  colorwayId: colorway.id,
  colorwayName: colorway.name,
  palette: Object.freeze({ primary: PALETTES[option.family === 'classic' ? 'classic' : option.family === 'glass' ? 'glass' : option.id][index][0], secondary: PALETTES[option.family === 'classic' ? 'classic' : option.family === 'glass' ? 'glass' : option.id][index][1], accent: PALETTES[option.family === 'classic' ? 'classic' : option.family === 'glass' ? 'glass' : option.id][index][2] })
}))));

const OPTION_MAP = new Map(PASS_DESIGN_OPTIONS.map((option) => [option.id, option]));

// Keep this byte-for-byte algorithmically equivalent to nmStableRandomHash /
// nmSeededPermutation in the immutable V2 authority. The server validates and
// freezes the choices produced in Phase 4; it must not reroll them with a
// separate implementation.
export function authorityRandomHash(value) {
  let hash = 2166136261;
  const input = String(value ?? '');
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function authoritySeededPermutation(length, seed) {
  const values = Array.from({ length }, (_, index) => index);
  let hash = authorityRandomHash(seed) || 1;
  for (let index = values.length - 1; index > 0; index -= 1) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    const swapIndex = (hash >>> 0) % (index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

export function buildPassAssignmentDeck(seed) {
  return Array.from({ length: PASS_ASSIGNMENT_POOL.length }, (_, index) => {
    const { serial: _serial, rendererVersion: _rendererVersion, artworkId: _artworkId, frozen: _frozen, ...assignment } = resolvePassAssignment({ seed, serial: index + 1 });
    return assignment;
  });
}

export function resolvePassAssignment({ seed, serial, artworkId = null } = {}) {
  const serialNumber = Math.max(1, Math.floor(Number(serial) || 1));
  const stableSeed = String(seed || 'nexmarkets-pass-seed');
  const slot = serialNumber - 1;
  const packOrder = authoritySeededPermutation(PASS_DESIGN_OPTIONS.length, `${stableSeed}|packs-v1`);
  const option = PASS_DESIGN_OPTIONS[packOrder[slot % PASS_DESIGN_OPTIONS.length]] || PASS_DESIGN_OPTIONS[0];
  const colourOrder = authoritySeededPermutation(PASS_COLORWAYS.length, `${stableSeed}|colours-v1|${option.id}`);
  const colourIndex = colourOrder[(slot + Math.floor(slot / PASS_DESIGN_OPTIONS.length)) % PASS_COLORWAYS.length];
  const selected = PASS_ASSIGNMENT_POOL.find((entry) => entry.optionId === option.id && entry.colorwayId === PASS_COLORWAYS[colourIndex].id);
  return {
    rendererVersion: PASS_RENDERER_VERSION,
    serial: serialNumber,
    optionId: selected.optionId,
    family: selected.family,
    material: selected.material,
    colorwayId: selected.colorwayId,
    colorwayName: selected.colorwayName,
    palette: { ...selected.palette },
    artworkId: artworkId ?? null,
    authorityAssignment: {
      poolVersion: 'v1',
      serial: serialNumber,
      packId: selected.optionId,
      passDesign: selected.optionId.startsWith('classic-') ? 'classic' : selected.optionId.startsWith('glass-') ? 'glass' : selected.optionId,
      frame: selected.optionId.startsWith('classic-') || selected.optionId.startsWith('glass-') ? selected.material : 'obsidian',
      label: selected.label,
      colourIndex,
      palette: [selected.palette.primary, selected.palette.secondary, selected.palette.accent],
      artKey: artworkId ?? ''
    },
    frozen: false
  };
}

export function createPassRenderConfig({ editionId, passId = null, serial, supply, projectName, editionName, seriesName = '', assignment, artwork = {}, logo = {}, holderState = null } = {}) {
  const selected = assignment?.optionId ? assignment : resolvePassAssignment({ seed: editionId, serial, artworkId: artwork.assetId });
  if (!OPTION_MAP.has(selected.optionId)) throw new Error('INVALID_PASS_OPTION');
  return {
    rendererVersion: selected.rendererVersion || PASS_RENDERER_VERSION,
    editionId: String(editionId),
    passId: passId == null ? null : String(passId),
    serial: Math.max(1, Math.floor(Number(serial) || 1)),
    supply: Math.max(1, Math.floor(Number(supply) || 1)),
    optionId: selected.optionId,
    family: selected.family,
    material: selected.material,
    colorwayId: selected.colorwayId,
    colorwayName: selected.colorwayName || PASS_COLORWAYS.find((item) => item.id === selected.colorwayId)?.name || selected.colorwayId,
    palette: { ...selected.palette },
    visual: selected.visual ? structuredClone(selected.visual) : null,
    authorityAssignment: selected.authorityAssignment ? structuredClone(selected.authorityAssignment) : null,
    artwork: { assetId: artwork.assetId ?? artwork.assetKey ?? artwork.id ?? selected.artworkId ?? null, url: artwork.url ?? artwork.src ?? null, x: Number(artwork.x ?? 50), y: Number(artwork.y ?? 50), scale: Number(artwork.scale ?? 1) },
    logo: { assetId: logo.assetId ?? null, url: logo.url ?? null },
    projectName: String(projectName ?? ''),
    editionName: String(editionName ?? ''),
    seriesName: String(seriesName ?? ''),
    holderState: holderState ? { ...holderState } : null,
    frozen: Boolean(selected.frozen),
    frozenAt: selected.frozenAt ?? null,
    randomAssignment: { enabled: selected.randomAssignment?.enabled ?? true, seed: selected.seed ?? null, combinationIndex: PASS_ASSIGNMENT_POOL.findIndex((item) => item.optionId === selected.optionId && item.colorwayId === selected.colorwayId), frozen: Boolean(selected.frozen) }
  };
}

export function freezePassAssignments({ editionId, supply, seed, artworkBySerial = {}, projectName = '', editionName = '', seriesName = '', logo = {}, rendererVersion = PASS_RENDERER_VERSION, frozenAt = new Date().toISOString() } = {}) {
  const count = Math.max(1, Math.floor(Number(supply) || 1));
  return Array.from({ length: count }, (_, index) => {
    const serial = index + 1;
    const artworkForSerial = artworkBySerial[serial] || {};
    const artworkId = artworkForSerial.assetId ?? artworkForSerial.assetKey ?? artworkForSerial.id ?? null;
    const assignment = resolvePassAssignment({ seed: seed || editionId, serial, artworkId });
    assignment.rendererVersion = rendererVersion;
    assignment.frozen = true;
    assignment.frozenAt = frozenAt;
    assignment.seed = String(seed || editionId);
    assignment.artwork = artworkBySerial[serial] ? { ...artworkBySerial[serial], assetId: artworkId } : null;
    return createPassRenderConfig({ editionId, serial, supply: count, projectName, editionName, seriesName, assignment, artwork: assignment.artwork || {}, logo });
  });
}

export function isApprovedPassOption(value) { return OPTION_MAP.has(String(value)); }
export function isApprovedColorway(value) { return PASS_COLORWAYS.some((item) => item.id === String(value)); }
