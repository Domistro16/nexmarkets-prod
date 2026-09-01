export const robinhoodTestnet = Object.freeze({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  network: 'robinhood-testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com'] },
    public: { http: ['https://rpc.testnet.chain.robinhood.com'] }
  },
  blockExplorers: {
    default: { name: 'Robinhood Explorer', url: 'https://explorer.testnet.chain.robinhood.com' }
  },
  testnet: true
});

export const robinhoodMainnet = Object.freeze({
  id: 4663,
  name: 'Robinhood Chain',
  network: 'robinhood-mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
    public: { http: ['https://rpc.mainnet.chain.robinhood.com'] }
  },
  blockExplorers: {
    default: { name: 'Robinhood Explorer', url: 'https://explorer.mainnet.chain.robinhood.com' }
  },
  testnet: false
});

export const chains = [robinhoodTestnet, robinhoodMainnet];
