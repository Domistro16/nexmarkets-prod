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
}
