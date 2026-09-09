// Renderer selection is versioned separately from Pass authoring data. A
// renderer may consume a frozen config, but it may not invent pack, palette,
// artwork, material, or serial values.
export const CANONICAL_PASS_RENDERER_VERSION = 'pass-renderer-v1';
export const HISTORICAL_PASS_RENDERER_VERSION = 'legacy-inline-v0';

const RENDERERS = Object.freeze({
  [CANONICAL_PASS_RENDERER_VERSION]: Object.freeze({ role: 'canonical-current', authoring: 'create-authoring', presentation: 'lightweight-presentation', export: 'frozen-config-export' }),
  [HISTORICAL_PASS_RENDERER_VERSION]: Object.freeze({ role: 'historical-compatibility', authoring: null, presentation: 'historical-v0-presentation', export: 'historical-v0-export' })
});

export function resolvePassRenderer(config = {}) {
  const version = String(config.rendererVersion || CANONICAL_PASS_RENDERER_VERSION);
  const renderer = RENDERERS[version];
  if (!renderer) throw new Error(`UNKNOWN_PASS_RENDERER_VERSION:${version}`);
  return { version, ...renderer };
}

export function assertFrozenPassConfig(config = {}) {
  const required = ['editionId', 'serial', 'optionId', 'colorwayId', 'palette'];
  for (const field of required) if (config[field] == null || config[field] === '') throw new Error(`FROZEN_PASS_CONFIG_${field.toUpperCase()}_REQUIRED`);
  if (!Array.isArray(config.palette) && typeof config.palette !== 'object') throw new Error('FROZEN_PASS_CONFIG_PALETTE_REQUIRED');
  resolvePassRenderer(config);
  return structuredClone(config);
}
