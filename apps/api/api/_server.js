import { PostgresStore } from '../packages/data/src/postgres-store.mjs';
import { JsonRpcClient } from '../packages/chain/src/rpc.mjs';
import { SubgraphClient } from '../packages/subgraph-client/src/index.mjs';
import { createApiServer, productionOrderPolicy, RateLimiter } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

let requestListener = null;

export async function getApiListener() {
  if (requestListener) return requestListener;

  const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? 46630);
  const rpcUrl = chainId === 46630
    ? (process.env.RH_TESTNET_RPC_URL ?? 'https://rpc.testnet.chain.robinhood.com')
    : (process.env.RH_MAINNET_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com');
  const rpc = new JsonRpcClient(rpcUrl);

  const subgraph = new SubgraphClient({
    endpoint: process.env.NEXMARKETS_SUBGRAPH_URL ?? 'https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/1.0.1/gn',
    certificationEditionAddress: process.env.CERTIFICATION_EDITION_ADDRESS ?? '0x4171D62F43B4168b07a01C04594455DBc3298437',
    certificationEditionName: process.env.CERTIFICATION_EDITION_NAME ?? 'NexMarkets V1 Test Certification Edition'
  });

  let store = null;
  if (process.env.DATABASE_URL) {
    try {
      store = new PostgresStore(process.env.DATABASE_URL);
    } catch {
      store = new MemoryStore();
    }
  } else {
    store = new MemoryStore();
  }

  const orderPolicy = productionOrderPolicy(process.env);
  const rateLimiter = new RateLimiter({ limit: 300, windowMs: 60_000 });

  const server = createApiServer({
    store,
    chainId,
    chain: rpc,
    subgraph,
    allowedOrigin: process.env.APP_ORIGIN ?? 'https://nexmarkets.fun',
    secureCookies: process.env.NODE_ENV === 'production',
    orderPolicy,
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
