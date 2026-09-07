export const PRODUCT_AUTHORITY = Object.freeze({
  file: 'NEXMARKETS_ELITE_RELEASE_CANDIDATE.html',
  sha256: '24daa3e2afc280690db3d213f953334b10cf92309f2698552c5db543b00b90a6'
});

export const PRIMITIVES = Object.freeze({
  seaport16: '0x0000000000000068F116a894984e2DB1123eB395',
  conduitController: '0x00000000F9490004C11Cef243f5400493c00Ad63',
  erc6551Registry: '0x000000006551c19487814612e58FE06813775758',
  safe141Singleton: '0x41675C099F32341bf84BFc5382aF534df5C7461a',
  safe141SingletonCodeHash: '0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4'
});

export const SUPPORTED_CHAIN_IDS = Object.freeze([4663, 46630, 8453, 84532]);

export const NETWORK_FAMILIES = Object.freeze({
  robinhood: Object.freeze({ key: 'robinhood', name: 'Robinhood', networks: Object.freeze(['robinhood-mainnet', 'robinhood-testnet']) }),
  base: Object.freeze({ key: 'base', name: 'Base', networks: Object.freeze(['base-mainnet', 'base-sepolia']) })
});

export const NETWORKS = Object.freeze({
  'robinhood-mainnet': Object.freeze({
    name: 'Robinhood Chain',
    displayName: 'Robinhood',
    family: 'robinhood',
    chainId: 4663,
    rpcEnv: 'RH_MAINNET_RPC_URL',
    defaultRpc: 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    nativeGasToken: 'ETH',
    settlement: Object.freeze({
      symbol: 'USDG',
      address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      allowed: true
    }),
    wethSettlementAllowed: false,
    baseAllowed: false
  }),
  'robinhood-testnet': Object.freeze({
    name: 'Robinhood Chain Testnet',
    displayName: 'Robinhood',
    family: 'robinhood',
    chainId: 46630,
    rpcEnv: 'RH_TESTNET_RPC_URL',
    defaultRpc: 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    nativeGasToken: 'ETH',
    settlement: Object.freeze({
      symbol: 'MockUSDG',
      address: null,
      allowed: true,
      productionForbidden: true,
      note: 'Use a clearly-labelled local/testnet MockUSDG until an official Robinhood testnet USDG is primary-source verified.'
    }),
    wethSettlementAllowed: false,
    baseAllowed: false
  }),
  'base-mainnet': Object.freeze({
    name: 'Base',
    displayName: 'Base',
    family: 'base',
    chainId: 8453,
    rpcEnv: 'BASE_MAINNET_RPC_URL',
    defaultRpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    nativeGasToken: 'ETH',
    settlement: Object.freeze({
      symbol: 'USDC',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      allowed: true,
      canonical: true
    }),
    wethSettlementAllowed: false,
    baseAllowed: true
  }),
  'base-sepolia': Object.freeze({
    name: 'Base Sepolia',
    displayName: 'Base',
    family: 'base',
    chainId: 84532,
    rpcEnv: 'BASE_SEPOLIA_RPC_URL',
    defaultRpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    nativeGasToken: 'ETH',
    settlement: Object.freeze({
      symbol: 'USDC',
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      decimals: 6,
      allowed: true,
      canonical: true,
      testnetOnly: true
    }),
    wethSettlementAllowed: false,
    baseAllowed: true
  })
});

export function networkByKey(key) {
  const network = NETWORKS[key];
  if (!network) throw new Error(`Unknown network: ${key}`);
  return network;
}
