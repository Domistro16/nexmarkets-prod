import { ChainLifecycleWorker } from './chain-lifecycle.mjs';

const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663);
const worker = new ChainLifecycleWorker({ chainId, rpcUrl: chainId === 46630 ? process.env.RH_TESTNET_RPC_URL : process.env.RH_MAINNET_RPC_URL, finalityDepth: Number(process.env.ROBINHOOD_FINALITY_BLOCKS ?? 12), protocolAdminSafe: process.env.PROTOCOL_ADMIN_SAFE_ADDRESS, factoryAddress: process.env.NEX_PASS_FACTORY_ADDRESS, mintController: process.env.NEX_MINT_CONTROLLER_ADDRESS });
const interval = Number(process.env.CHAIN_WORKER_POLL_MS ?? 5000); let stopping = false;
const stop = async () => { stopping = true; await worker.close(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
while (!stopping) { try { console.log(JSON.stringify({ event: 'chain_lifecycle_batch', ...(await worker.runOnce()) })); } catch (error) { console.error(JSON.stringify({ event: 'chain_lifecycle_batch_failed', error: error.message })); } await new Promise((resolve) => setTimeout(resolve, interval)); }
