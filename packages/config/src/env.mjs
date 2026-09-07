export function requiredEnv(name, env = process.env) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function assertNoMainnetMock(manifest) {
  if (manifest.chainId === 4663 && manifest.policy?.settlementAsset !== 'USDG') {
    throw new Error('Mainnet deployment refuses non-USDG settlement asset');
  }
  if (manifest.chainId === 4663 && manifest.primitives?.usdg?.mock === true) {
    throw new Error('Mainnet deployment refuses MockUSDG');
  }
  if (manifest.chainId === 8453 && manifest.policy?.settlementAsset !== 'USDC') {
    throw new Error('Base mainnet deployment refuses non-USDC settlement asset');
  }
  if (manifest.chainId === 8453 && (manifest.primitives?.usdc?.mock === true || manifest.primitives?.usdc?.testnetOnly === true)) {
    throw new Error('Base mainnet deployment refuses testnet/mock USDC');
  }
}
