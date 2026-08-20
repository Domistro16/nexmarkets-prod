import { PostgresProjectionWorker } from './runtime.mjs';

const worker = new PostgresProjectionWorker({
  chainId: Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663),
  rpcUrl: Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663) === 46630 ? process.env.RH_TESTNET_RPC_URL : process.env.RH_MAINNET_RPC_URL,
  finalityDepth: Number(process.env.ROBINHOOD_FINALITY_BLOCKS ?? 12),
  batchSize: Number(process.env.INDEXER_BATCH_SIZE ?? 250)
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
