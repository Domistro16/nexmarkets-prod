import { DistributionAgentWorker } from './distribution-agent-worker.mjs';

const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? process.env.BASE_CHAIN_ID ?? 84532);
const network = {
  8453: { prefix: 'BASE_MAINNET', rpcEnv: 'BASE_MAINNET_RPC_URL', defaultRpc: 'https://mainnet.base.org' },
  84532: { prefix: 'BASE_SEPOLIA', rpcEnv: 'BASE_SEPOLIA_RPC_URL', defaultRpc: 'https://sepolia.base.org' }
}[chainId] ?? { prefix: 'BASE_SEPOLIA', rpcEnv: 'BASE_SEPOLIA_RPC_URL', defaultRpc: 'https://sepolia.base.org' };

const env = (name) => network.prefix ? (process.env[`${network.prefix}_${name}`] ?? process.env[name]) : process.env[name];

const worker = new DistributionAgentWorker({
  chainId,
  rpcUrl: process.env[network.rpcEnv] ?? network.defaultRpc,
  royaltyVaultAddress: env('NEX_ROYALTY_VAULT_ADDRESS'),
  distributorAddress: env('NEX_REWARD_DISTRIBUTOR_ADDRESS'),
  settlementTokenAddress: env('USDC_ADDRESS') ?? env('BASE_SEPOLIA_USDC_ADDRESS'),
  batchChunkSize: Number(process.env.DISTRIBUTION_BATCH_SIZE ?? 150)
});

const interval = Number(process.env.DISTRIBUTION_WORKER_POLL_MS ?? 15000);
let stopping = false;

const stop = async () => {
  stopping = true;
  await worker.close();
  process.exit(0);
};

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

while (!stopping) {
  try {
    const summary = await worker.runOnce();
    if (summary.executed > 0 || summary.failed > 0) {
      console.log(JSON.stringify({ event: 'distribution_worker_batch', ...summary }));
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'distribution_worker_batch_failed', error: error.message }));
  }
  await new Promise((resolve) => setTimeout(resolve, interval));
}
