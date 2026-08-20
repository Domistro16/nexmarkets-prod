import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectionEngine } from '../services/indexer/src/projector.mjs';
import { fixture } from '../services/indexer/src/fixtures.mjs';

test('Goldsky projection is idempotent for duplicate events', () => {
  const engine = new ProjectionEngine(); const event = fixture();
  assert.equal(engine.ingest(event), true); assert.equal(engine.ingest(event), false);
  assert.equal(engine.state.editions.size, 1);
});

test('projection reorders events deterministically', () => {
  const engine = new ProjectionEngine(); const edition = '0x2222222222222222222222222222222222222222';
  engine.ingest(fixture({ blockNumber: 100, txHash: `0x${'33'.repeat(32)}`, eventName: 'EditionCreated', args: { edition } }));
  const later = fixture({ blockNumber: 102, txHash: `0x${'44'.repeat(32)}`, eventName: 'Transfer', contractAddress: edition, args: { tokenId: '1', from: '0x0000000000000000000000000000000000000000', to: '0x5555555555555555555555555555555555555555' } });
  const earlier = fixture({ blockNumber: 101, txHash: `0x${'55'.repeat(32)}`, eventName: 'EditionMinted', contractAddress: edition, args: { tokenId: '1', termsVersionHash: `0x${'66'.repeat(32)}` } });
  engine.ingest(later); engine.ingest(earlier);
  const token = engine.state.tokens.get(`${edition}:1`);
  assert.equal(token.owner, '0x5555555555555555555555555555555555555555');
});

test('dynamic Edition discovery rejects candidate ERC-721 events until Factory registration', () => {
  const engine = new ProjectionEngine(); const edition = '0x2222222222222222222222222222222222222222';
  engine.ingest(fixture({ eventName: 'Transfer', contractAddress: edition, args: { tokenId: '1', to: '0x1111111111111111111111111111111111111111' } }));
  assert.equal(engine.state.tokens.size, 0);
  engine.ingest(fixture({ blockNumber: 101, txHash: `0x${'33'.repeat(32)}`, eventName: 'EditionCreated', args: { edition } }));
  engine.ingest(fixture({ blockNumber: 102, txHash: `0x${'44'.repeat(32)}`, eventName: 'Transfer', contractAddress: edition, args: { tokenId: '1', to: '0x1111111111111111111111111111111111111111' } }));
  assert.equal(engine.state.tokens.size, 1);
});

test('simulated reorg removes orphaned projection and rebuilds prior state', () => {
  const engine = new ProjectionEngine(); const edition = '0x2222222222222222222222222222222222222222';
  engine.ingest(fixture({ blockNumber: 99, txHash: `0x${'22'.repeat(32)}`, eventName: 'EditionCreated', args: { edition } }));
  const first = fixture({ blockNumber: 100, txHash: `0x${'33'.repeat(32)}`, eventName: 'Transfer', contractAddress: edition, args: { tokenId: '1', to: '0x1111111111111111111111111111111111111111' } });
  const second = fixture({ blockNumber: 101, blockHash: `0x${'aa'.repeat(32)}`, txHash: `0x${'bb'.repeat(32)}`, eventName: 'Transfer', contractAddress: edition, args: { tokenId: '1', to: '0x9999999999999999999999999999999999999999' } });
  engine.ingest(first); engine.ingest(second);
  engine.orphanBlock(4663, second.blockHash);
  assert.equal(engine.state.tokens.get(`${edition}:1`).owner, '0x1111111111111111111111111111111111111111');
});

test('event identity collision with a different block hash fails closed', () => {
  const engine = new ProjectionEngine(); const event = fixture(); engine.ingest(event);
  assert.throws(() => engine.ingest({ ...event, blockHash: `0x${'ff'.repeat(32)}` }), /COLLISION/);
});
