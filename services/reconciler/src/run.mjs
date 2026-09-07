import { ReconciliationService } from './reconciler.mjs';
import { RobinhoodReconciliationChain } from './rpc-adapter.mjs';
import { PostgresReconciliationStore } from './postgres-adapter.mjs';
import { SubgraphReconciliationStore } from './subgraph-adapter.mjs';

const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663);
const network = {
  4663: { rpcEnv: 'RH_MAINNET_RPC_URL' },
  46630: { rpcEnv: 'RH_TESTNET_RPC_URL' },
  8453: { prefix: 'BASE_MAINNET', rpcEnv: 'BASE_MAINNET_RPC_URL', defaultRpc: 'https://mainnet.base.org' },
  84532: { prefix: 'BASE_SEPOLIA', rpcEnv: 'BASE_SEPOLIA_RPC_URL', defaultRpc: 'https://sepolia.base.org' }
}[chainId];
if (!network) throw new Error(`Unsupported reconciler chain: ${chainId}`);
const env = (name) => network.prefix ? process.env[`${network.prefix}_${name}`] : process.env[name];
const rpcUrl = process.env[network.rpcEnv] ?? network.defaultRpc;
const evidence = new PostgresReconciliationStore({ chainId });
const chain = new RobinhoodReconciliationChain({ rpcUrl, addresses: { launchRegistry: env('NEX_LAUNCH_REGISTRY_ADDRESS'), advantageRegistry: env('NEX_ADVANTAGE_REGISTRY_ADDRESS'), listingRegistry: env('NEX_LISTING_REGISTRY_ADDRESS'), royaltyVault: env('NEX_ROYALTY_VAULT_ADDRESS'), tbaResolver: env('NEX_TBA_RESOLVER_ADDRESS') } });
const subgraphUrl = network.prefix ? process.env[`${network.prefix}_SUBGRAPH_URL`] ?? process.env[`${network.prefix}_NEXMARKETS_SUBGRAPH_URL`] : process.env.NEXMARKETS_SUBGRAPH_URL;
const projections = subgraphUrl ? new SubgraphReconciliationStore({ endpoint: subgraphUrl, chainId }) : evidence;
const service = new ReconciliationService({ chain, projections, evidenceStore: evidence, attempts: Number(process.env.RECONCILIATION_ATTEMPTS ?? 3) });
const run = async () => { try { console.log(JSON.stringify({ event: 'reconciliation_run', result: await service.run({ chainId, scope: process.env.RECONCILIATION_SCOPE ?? 'ALL', advantageRegistry: env('NEX_ADVANTAGE_REGISTRY_ADDRESS'), listingRegistry: env('NEX_LISTING_REGISTRY_ADDRESS') }) })); } finally { await evidence.close(); } };
await run();
