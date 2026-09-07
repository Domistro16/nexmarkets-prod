import { createApiServer, createNetworkConfigs, networkKeyForChainId, RateLimiter } from '@nexmarkets/api';
import { MemoryStore } from '@nexmarkets/api/memory-store';

let requestListener = null;

export async function getApiListener() {
  if (requestListener) return requestListener;

  const networkConfigs = createNetworkConfigs(process.env);
  const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? 46630);
  const defaultNetwork = networkConfigs[networkKeyForChainId(chainId) ?? 'robinhood-testnet'];

  let store = null;
  if (process.env.DATABASE_URL) {
    try {
      const { PostgresStore } = await import('@nexmarkets/data');
      store = new PostgresStore({ connectionString: process.env.DATABASE_URL });
    } catch {
      store = new MemoryStore();
    }
  } else {
    store = new MemoryStore();
  }

  const rateLimiter = new RateLimiter({ limit: 300, windowMs: 60_000 });

  const server = createApiServer({
    store,
    chainId: defaultNetwork.chainId,
    chain: defaultNetwork.chain,
    subgraph: defaultNetwork.subgraph,
    allowedOrigin: process.env.APP_ORIGIN ?? 'https://www.nexmarkets.xyz',
    secureCookies: process.env.NODE_ENV === 'production',
    orderPolicy: defaultNetwork.orderPolicy,
    networkConfigs,
    rateLimiter,
    requireIndexedReadiness: false
  });

  requestListener = server.listeners('request')[0];
  return requestListener;
}

export default async function handler(req, res) {
  const listener = await getApiListener();
  return listener(req, res);
}
