import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { buildProtocolCalldata } from '../packages/domain/src/index.mjs';

test('structured mint preparation deterministically scopes the onchain intent to wallet and idempotency key', () => {
  const walletAddress = '0x1111111111111111111111111111111111111111';
  const input = { edition: '0x2222222222222222222222222222222222222222', termsVersionHash: `0x${'33'.repeat(32)}`, quantity: 2, advantageConfigs: [] };
  const first = buildProtocolCalldata('MINT', input, { walletAddress, idempotencyKey: 'mint-1' });
  const second = buildProtocolCalldata('MINT', input, { walletAddress, idempotencyKey: 'mint-1' });
  assert.equal(first, second);
  const abi = new Interface(['function mint((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]))']);
  const [request] = abi.decodeFunctionData('mint', first); assert.equal(request[2], walletAddress); assert.equal(request[3], 2n);
});

test('allowlisted mint includes the caller proof without changing the scoped mint request', () => {
  const walletAddress = '0x1111111111111111111111111111111111111111';
  const proof = [`0x${'77'.repeat(32)}`];
  const input = { edition: '0x2222222222222222222222222222222222222222', termsVersionHash: `0x${'33'.repeat(32)}`, quantity: 2, advantageConfigs: [], allowlistProof: proof };
  const calldata = buildProtocolCalldata('MINT', input, { walletAddress, idempotencyKey: 'allowlist-mint-1' });
  const abi = new Interface(['function mintAllowlisted((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]),bytes32[])']);
  const [request, decodedProof] = abi.decodeFunctionData('mintAllowlisted', calldata);
  assert.equal(request[2], walletAddress);
  assert.equal(request[3], 2n);
  assert.deepEqual([...decodedProof], proof);
});

test('V2 Terms calldata commits the allowlist window and optional phase supply', () => {
  const walletAddress = '0x1111111111111111111111111111111111111111';
  const terms = {
    activeSupply: 2000, pricePerPass: '1000000', previewStartsAt: 10, mintStartsAt: 20, mintEndsAt: 100,
    allowlistRoot: `0x${'88'.repeat(32)}`, allowlistEndsAt: 44, allowlistSupply: 500,
    primaryRecipient: walletAddress, royaltyReceiver: walletAddress, royaltyBps: 300,
    advantagesHash: `0x${'00'.repeat(32)}`, referralTermsHash: `0x${'00'.repeat(32)}`
  };
  const calldata = buildProtocolCalldata('TERMS_PUBLISH', { edition: '0x2222222222222222222222222222222222222222', terms }, { walletAddress, idempotencyKey: 'terms-v2' });
  const abi = new Interface(['function publishTerms(address,(uint256,uint256,uint64,uint64,uint64,bytes32,uint64,uint256,address,address,uint96,bytes32,bytes32))']);
  const [, decoded] = abi.decodeFunctionData('publishTerms', calldata);
  assert.equal(decoded[0], 2000n);
  assert.equal(decoded[5], terms.allowlistRoot);
  assert.equal(decoded[6], 44n);
  assert.equal(decoded[7], 500n);
});

test('structured listing cancellation, Advantage use, and royalty withdrawal emit only their exact selectors', () => {
  const context = { walletAddress: '0x1111111111111111111111111111111111111111', idempotencyKey: 'x' };
  const orderHash = `0x${'44'.repeat(32)}`; const advantageId = `0x${'55'.repeat(32)}`; const useId = `0x${'66'.repeat(32)}`;
  assert.match(buildProtocolCalldata('LISTING_CANCEL', { orderHash }, context), /^0x/);
  assert.match(buildProtocolCalldata('ROYALTY_WITHDRAW', { orderHash }, context), /^0x/);
  assert.match(buildProtocolCalldata('ADVANTAGE_USE', { operation: 'CONSUME_QUANTITY', edition: '0x2222222222222222222222222222222222222222', tokenId: 1, advantageId, amount: 1, useId }, context), /^0x/);
  assert.match(buildProtocolCalldata('ADVANTAGE_USE', { operation: 'REDEEM_AMOUNT', edition: '0x2222222222222222222222222222222222222222', tokenId: 1, advantageId, amount: 2, useId }, context), /^0x/);
  assert.match(buildProtocolCalldata('ADVANTAGE_USE', { operation: 'USE_AMOUNT', edition: '0x2222222222222222222222222222222222222222', tokenId: 1, advantageId, useId }, context), /^0x/);
  assert.throws(() => buildProtocolCalldata('ADVANTAGE_USE', { edition: '0x2222222222222222222222222222222222222222' }, context), /OPERATION/);
});
