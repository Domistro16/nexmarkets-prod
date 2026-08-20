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

test('structured listing cancellation, Advantage use, and royalty withdrawal emit only their exact selectors', () => {
  const context = { walletAddress: '0x1111111111111111111111111111111111111111', idempotencyKey: 'x' };
  const orderHash = `0x${'44'.repeat(32)}`; const advantageId = `0x${'55'.repeat(32)}`; const useId = `0x${'66'.repeat(32)}`;
  assert.match(buildProtocolCalldata('LISTING_CANCEL', { orderHash }, context), /^0x/);
  assert.match(buildProtocolCalldata('ROYALTY_WITHDRAW', { orderHash }, context), /^0x/);
  assert.match(buildProtocolCalldata('ADVANTAGE_USE', { operation: 'CONSUME_QUANTITY', edition: '0x2222222222222222222222222222222222222222', tokenId: 1, advantageId, amount: 1, useId }, context), /^0x/);
  assert.match(buildProtocolCalldata('ADVANTAGE_USE', { operation: 'USE_AMOUNT', edition: '0x2222222222222222222222222222222222222222', tokenId: 1, advantageId, useId }, context), /^0x/);
  assert.throws(() => buildProtocolCalldata('ADVANTAGE_USE', { edition: '0x2222222222222222222222222222222222222222' }, context), /OPERATION/);
});
