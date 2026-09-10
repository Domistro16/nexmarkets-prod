import { AbiCoder, ZeroHash, concat, getAddress, keccak256 } from 'ethers';

const coder = AbiCoder.defaultAbiCoder();

export function allowlistLeaf(account) {
  const normalized = getAddress(account);
  return keccak256(concat([keccak256(coder.encode(['address'], [normalized]))]));
}

function hashPair(left, right) {
  const [first, second] = left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left];
  return keccak256(concat([first, second]));
}

export function buildAllowlist(addresses = []) {
  const accounts = [...new Set(addresses.map((account) => getAddress(String(account)).toLowerCase()))]
    .sort()
    .map(getAddress);
  if (accounts.length === 0) return Object.freeze({ root: ZeroHash, entries: Object.freeze([]) });

  const leaves = accounts.map(allowlistLeaf);
  const layers = [leaves];
  while (layers.at(-1).length > 1) {
    const current = layers.at(-1);
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(index + 1 < current.length ? hashPair(current[index], current[index + 1]) : current[index]);
    }
    layers.push(next);
  }

  const entries = accounts.map((account, leafIndex) => {
    const proof = [];
    let index = leafIndex;
    for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
      const layer = layers[layerIndex];
      const sibling = index % 2 === 0 ? index + 1 : index - 1;
      if (sibling < layer.length) proof.push(layer[sibling]);
      index = Math.floor(index / 2);
    }
    return Object.freeze({ account, leaf: leaves[leafIndex], proof: Object.freeze(proof) });
  });
  return Object.freeze({ root: layers.at(-1)[0], entries: Object.freeze(entries) });
}
