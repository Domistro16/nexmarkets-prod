import test from 'node:test';
import assert from 'node:assert/strict';
import { AbiCoder, concat, keccak256 } from 'ethers';
import { allowlistLeaf, buildAllowlist } from '@nexmarkets/domain';

function verify(proof, root, leaf) {
  return proof.reduce((computed, sibling) => {
    const pair = computed.toLowerCase() < sibling.toLowerCase() ? [computed, sibling] : [sibling, computed];
    return keccak256(concat(pair));
  }, leaf) === root;
}

test('allowlist tree is deterministic, deduplicated, and produces OpenZeppelin-compatible proofs', () => {
  const alice = '0x1111111111111111111111111111111111111111';
  const bob = '0x2222222222222222222222222222222222222222';
  const carol = '0x3333333333333333333333333333333333333333';
  const first = buildAllowlist([carol, alice, bob, alice]);
  const second = buildAllowlist([bob, carol, alice]);
  assert.equal(first.root, second.root);
  assert.equal(first.entries.length, 3);
  for (const entry of first.entries) assert.equal(verify(entry.proof, first.root, entry.leaf), true);
});

test('allowlist leaf exactly matches the controller double-hash encoding', () => {
  const account = '0x1111111111111111111111111111111111111111';
  const expected = keccak256(concat([keccak256(AbiCoder.defaultAbiCoder().encode(['address'], [account]))]));
  assert.equal(allowlistLeaf(account), expected);
  const single = buildAllowlist([account]);
  assert.equal(single.root, expected);
  assert.deepEqual(single.entries[0].proof, []);
});
