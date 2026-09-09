import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_PASS_RENDERER_VERSION, HISTORICAL_PASS_RENDERER_VERSION, assertFrozenPassConfig, resolvePassRenderer } from '../packages/domain/src/index.mjs';

const frozen = { rendererVersion: CANONICAL_PASS_RENDERER_VERSION, editionId: 'ed-1', serial: 1, optionId: 'pack-metal', colorwayId: 'colourway-01', palette: { primary: '#111', secondary: '#222', accent: '#333' } };

test('newly created Editions resolve to the canonical current renderer roles', () => {
  const renderer = resolvePassRenderer(frozen);
  assert.equal(renderer.role, 'canonical-current');
  assert.equal(renderer.authoring, 'create-authoring');
  assert.equal(assertFrozenPassConfig(frozen).optionId, 'pack-metal');
});

test('historical Pass versions use an explicit compatibility renderer', () => {
  const renderer = resolvePassRenderer({ ...frozen, rendererVersion: HISTORICAL_PASS_RENDERER_VERSION });
  assert.equal(renderer.role, 'historical-compatibility');
  assert.throws(() => resolvePassRenderer({ ...frozen, rendererVersion: 'obsolete-current-authority' }), /UNKNOWN_PASS_RENDERER_VERSION/);
});
