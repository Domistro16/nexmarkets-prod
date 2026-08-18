const HEX_32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function assert(condition, message) { if (!condition) throw new Error(message); }

export function validateDeploymentManifest(m, { strict = false } = {}) {
  assert(m && typeof m === 'object', 'manifest must be an object');
  assert(Number.isInteger(m.chainId), 'manifest.chainId must be an integer');
  assert(typeof m.network === 'string' && m.network.length > 0, 'manifest.network required');
  assert(m.productAuthority?.sha256 === '24daa3e2afc280690db3d213f953334b10cf92309f2698552c5db543b00b90a6', 'wrong certified product authority hash');
  assert(m.policy?.settlementAsset === 'USDG' || m.policy?.settlementAsset === 'MockUSDG', 'V1 settlement must be USDG/MockUSDG');
  assert(m.policy?.wethSettlementAllowed === false, 'WETH settlement must be disabled in V1');
  assert(m.policy?.baseAllowed === false, 'Base must be disabled in V1');
  if (m.chainId === 4663) {
    assert(m.policy.settlementAsset === 'USDG', 'mainnet must use USDG');
    assert(ADDRESS.test(m.primitives?.usdg?.address || ''), 'mainnet USDG address required');
    assert(m.primitives.usdg.address.toLowerCase() === '0x5fc5360d0400a0fd4f2af552add042d716f1d168', 'wrong canonical Robinhood USDG address');
  }
  for (const key of ['seaport16','conduitController','immutableCreate2Factory','erc6551Registry','safeSingleton']) {
    const p = m.primitives?.[key];
    assert(p && ADDRESS.test(p.address || ''), `${key}.address invalid`);
    if (strict) assert(HEX_32.test(p.expectedRuntimeCodeHash || ''), `${key}.expectedRuntimeCodeHash must be pinned for strict release`);
  }
  if (strict && m.chainId === 4663) {
    assert(Number.isInteger(m.primitives.usdg.expectedDecimals), 'USDG expectedDecimals must be pinned for strict release');
    assert(HEX_32.test(m.primitives.usdg.expectedRuntimeCodeHash || ''), 'USDG proxy/runtime code hash must be pinned');
    assert(ADDRESS.test(m.primitives.usdg.expectedImplementationAddress || ''), 'USDG implementation address must be pinned');
    assert(HEX_32.test(m.primitives.usdg.expectedImplementationCodeHash || ''), 'USDG implementation/facet authority code hash must be pinned');
    for (const key of ['supplyControl','adminTimelock','oftWrapper']) {
      const p=m.primitives.usdg[key];
      assert(p && ADDRESS.test(p.address || ''), `USDG ${key} address must be pinned`);
      assert(HEX_32.test(p.expectedRuntimeCodeHash || ''), `USDG ${key} runtime hash must be pinned`);
    }
    for (const key of ['supplyControl','oftWrapper']) {
      const p=m.primitives.usdg[key];
      assert(ADDRESS.test(p.expectedImplementationAddress || ''), `USDG ${key} implementation address must be pinned`);
      assert(HEX_32.test(p.expectedImplementationCodeHash || ''), `USDG ${key} implementation hash must be pinned`);
    }
    assert(ADDRESS.test(m.primitives.usdg.operationalAuthority?.address || ''), 'USDG operational authority must be pinned');
  }
  return true;
}
