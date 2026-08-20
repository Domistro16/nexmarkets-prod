export function fixture(overrides = {}) {
  return {
    chainId: 4663,
    blockNumber: 100,
    blockHash: `0x${'11'.repeat(32)}`,
    txHash: `0x${'22'.repeat(32)}`,
    logIndex: 0,
    contractAddress: '0x1111111111111111111111111111111111111111',
    eventName: 'EditionCreated',
    blockTimestamp: '2026-08-20T00:00:00Z',
    args: { edition: '0x2222222222222222222222222222222222222222', editionId: `0x${'33'.repeat(32)}` },
    ...overrides
  };
}
