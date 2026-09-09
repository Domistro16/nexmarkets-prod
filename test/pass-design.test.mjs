import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASS_ASSIGNMENT_POOL,
  PASS_COLORWAYS,
  PASS_DESIGN_OPTIONS,
  PASS_RENDERER_VERSION,
  buildPassAssignmentDeck,
  freezePassAssignments,
  resolvePassAssignment
} from '../packages/domain/src/index.mjs';

test('canonical Pass authority exposes 13 options and five approved colourways', () => {
  assert.equal(PASS_DESIGN_OPTIONS.length, 13);
  assert.equal(PASS_COLORWAYS.length, 5);
  assert.equal(PASS_ASSIGNMENT_POOL.length, 65);
  assert.equal(new Set(PASS_ASSIGNMENT_POOL.map((item) => `${item.optionId}:${item.colorwayId}`)).size, 65);
});

test('random assignment deck is deterministic and cycles without rerolling', () => {
  const first = buildPassAssignmentDeck('edition-seed-1');
  const second = buildPassAssignmentDeck('edition-seed-1');
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, buildPassAssignmentDeck('edition-seed-2'));
  const firstAssignment = resolvePassAssignment({ seed: 'edition-seed-1', serial: 1 });
  const repeatedAssignment = resolvePassAssignment({ seed: 'edition-seed-1', serial: 66 });
  assert.deepEqual({ ...firstAssignment, serial: 0 }, { ...repeatedAssignment, serial: 0 });
});

test('frozen assignments retain serial, renderer, palette and artwork mapping', () => {
  const frozen = freezePassAssignments({
    editionId: 'edition-1',
    supply: 65,
    seed: 'immutable-seed',
    artworkBySerial: { 1: { assetId: 'art-1', url: 'https://cdn.example/art-1.png', x: 47, y: 52 } },
    projectName: 'Example',
    editionName: 'Genesis',
    seriesName: 'Series 01'
  });
  assert.equal(frozen.length, 65);
  assert.equal(frozen[0].rendererVersion, PASS_RENDERER_VERSION);
  assert.equal(frozen[0].serial, 1);
  assert.equal(frozen[0].artwork.assetId, 'art-1');
  assert.equal(frozen[0].randomAssignment.frozen, true);
  assert.equal(new Set(frozen.map((item) => `${item.randomAssignment.combinationIndex}`)).size, 65);
  assert.deepEqual(frozen, freezePassAssignments({
    editionId: 'edition-1', supply: 65, seed: 'immutable-seed',
    artworkBySerial: { 1: { assetId: 'art-1', url: 'https://cdn.example/art-1.png', x: 47, y: 52 } },
    projectName: 'Example', editionName: 'Genesis', seriesName: 'Series 01'
  }));
});
