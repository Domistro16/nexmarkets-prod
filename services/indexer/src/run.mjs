import { PostgresProjectionWorker } from './runtime.mjs';

const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663);
const network = {
  4663: { rpcEnv: 'RH_MAINNET_RPC_URL', defaultRpc: 'https://rpc.mainnet.chain.robinhood.com' },
  46630: { rpcEnv: 'RH_TESTNET_RPC_URL', defaultRpc: 'https://rpc.testnet.chain.robinhood.com' },
  8453: { prefix: 'BASE_MAINNET', rpcEnv: 'BASE_MAINNET_RPC_URL', defaultRpc: 'https://mainnet.base.org' },
  84532: { prefix: 'BASE_SEPOLIA', rpcEnv: 'BASE_SEPOLIA_RPC_URL', defaultRpc: 'https://sepolia.base.org' }
}[chainId];
if (!network) throw new Error(`Unsupported indexer chain: ${chainId}`);
const env = (name) => network.prefix ? process.env[`${network.prefix}_${name}`] : process.env[name];
const worker = new PostgresProjectionWorker({
  chainId,
  rpcUrl: process.env[network.rpcEnv] ?? network.defaultRpc,
  finalityDepth: Number(process.env.ROBINHOOD_FINALITY_BLOCKS ?? 12),
  batchSize: Number(process.env.INDEXER_BATCH_SIZE ?? 250),
  factoryAddress: env('NEX_PASS_FACTORY_ADDRESS')
});
const interval = Number(process.env.INDEXER_POLL_MS ?? 5000);
let stopping = false;
const stop = async () => { stopping = true; await worker.close(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
while (!stopping) {
  try { console.log(JSON.stringify({ event: 'indexer_batch', ...(await worker.runOnce()) })); }
  catch (error) { console.error(JSON.stringify({ event: 'indexer_batch_failed', error: error.message })); }
  await new Promise((resolve) => setTimeout(resolve, interval));
}
