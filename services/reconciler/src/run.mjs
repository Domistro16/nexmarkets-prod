import { ReconciliationService } from './reconciler.mjs';
import { RobinhoodReconciliationChain } from './rpc-adapter.mjs';
import { PostgresReconciliationStore } from './postgres-adapter.mjs';

const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663);
const evidence = new PostgresReconciliationStore({ chainId });
const chain = new RobinhoodReconciliationChain({ rpcUrl: chainId === 46630 ? process.env.RH_TESTNET_RPC_URL : process.env.RH_MAINNET_RPC_URL, addresses: { launchRegistry: process.env.NEX_LAUNCH_REGISTRY_ADDRESS, advantageRegistry: process.env.NEX_ADVANTAGE_REGISTRY_ADDRESS, listingRegistry: process.env.NEX_LISTING_REGISTRY_ADDRESS, royaltyVault: process.env.NEX_ROYALTY_VAULT_ADDRESS, tbaResolver: process.env.NEX_TBA_RESOLVER_ADDRESS } });
const projections = evidence;
const service = new ReconciliationService({ chain, projections, evidenceStore: evidence, attempts: Number(process.env.RECONCILIATION_ATTEMPTS ?? 3) });
const run = async () => { try { console.log(JSON.stringify({ event: 'reconciliation_run', result: await service.run({ chainId, scope: process.env.RECONCILIATION_SCOPE ?? 'ALL', advantageRegistry: process.env.NEX_ADVANTAGE_REGISTRY_ADDRESS, listingRegistry: process.env.NEX_LISTING_REGISTRY_ADDRESS }) })); } finally { await evidence.close(); } };
await run();
