import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DistributionAgentWorker } from './distribution-agent-worker.mjs';

// Auto-load .env from repository root if present
try {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch {}

const isDemo = process.argv.includes('--demo') || process.env.DEMO_MODE === 'true' || Boolean(process.env.DEMO_CADENCE_MINUTES);
if (isDemo && !process.env.DEMO_CADENCE_MINUTES) {
  process.env.DEMO_CADENCE_MINUTES = '2';
}

const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? process.env.BASE_CHAIN_ID ?? 84532);
const network = {
  8453: { name: 'Base Mainnet', prefix: 'BASE_MAINNET', rpcEnv: 'BASE_MAINNET_RPC_URL', defaultRpc: 'https://mainnet.base.org' },
  84532: { name: 'Base Sepolia', prefix: 'BASE_SEPOLIA', rpcEnv: 'BASE_SEPOLIA_RPC_URL', defaultRpc: 'https://sepolia.base.org' }
}[chainId] ?? { name: 'Base Sepolia', prefix: 'BASE_SEPOLIA', rpcEnv: 'BASE_SEPOLIA_RPC_URL', defaultRpc: 'https://sepolia.base.org' };

const env = (name) => network.prefix ? (process.env[`${network.prefix}_${name}`] ?? process.env[name]) : process.env[name];

const distributorAddress = env('NEX_REWARD_DISTRIBUTOR_ADDRESS') || '0x2453c5FCef787D076ff21614E54C50344FD1EB91';
const royaltyVaultAddress = env('NEX_ROYALTY_VAULT_ADDRESS') || '0xCbf82F765c80446baa753a56C563ED0291374614';
const settlementTokenAddress = env('USDC_ADDRESS') ?? env('BASE_SEPOLIA_USDC_ADDRESS') ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const demoCadenceMinutes = process.env.DEMO_CADENCE_MINUTES ? Number(process.env.DEMO_CADENCE_MINUTES) : null;

const worker = new DistributionAgentWorker({
  chainId,
  rpcUrl: process.env[network.rpcEnv] ?? network.defaultRpc,
  royaltyVaultAddress,
  distributorAddress,
  settlementTokenAddress,
  demoCadenceMinutes,
  batchChunkSize: Number(process.env.DISTRIBUTION_BATCH_SIZE ?? 150)
});

const interval = Number(process.env.DISTRIBUTION_WORKER_POLL_MS ?? 15000);
let stopping = false;

const stop = async () => {
  stopping = true;
  console.log('\n[Worker] Gracefully shutting down distribution agent worker...');
  await worker.close();
  process.exit(0);
};

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

function formatCountdown(targetDate) {
  const diffMs = new Date(targetDate).getTime() - Date.now();
  if (diffMs <= 0) return 'DUE NOW';
  const sec = Math.ceil(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

console.log('================================================================================');
console.log('   NEXMARKETS | Dynamic Server Wallet Autonomous Distribution Worker');
console.log(`   Network:         ${network.name} (Chain ID: ${chainId})`);
console.log(`   Distributor:     ${distributorAddress}`);
console.log(`   Cadence Mode:    ${demoCadenceMinutes ? `${demoCadenceMinutes}-minute Fast-Forward Testnet Cadence` : 'Production 30-Day Escrow Cadence'}`);
console.log(`   Poll Interval:   ${interval / 1000}s`);
console.log('================================================================================\n');

while (!stopping) {
  try {
    const now = new Date();
    const summary = await worker.runOnce(now);

    if (summary.executed > 0) {
      for (const res of summary.results.filter(r => r.executed)) {
        console.log(`\n[${timestamp()}] >>> [EXECUTED] Autonomous Distribution Cycle Completed!`);
        console.log(`   Agent ID:         ${res.agentId}`);
        console.log(`   Cycle ID:         ${res.cycleId}`);
        console.log(`   Eligible Passes:  ${res.eligibleSupply}`);
        console.log(`   Total Funded:     ${(Number(res.totalFunded) / 1e6).toFixed(2)} USDC`);
        console.log(`   Amount Per Pass:  ${(Number(res.amountPerPass) / 1e6).toFixed(4)} USDC`);
        console.log(`   fundCycle Tx:     ${res.fundTxHash}`);
        console.log(`   Pass Claim Tx(s): ${res.claimCount} batch tx(s) executed`);
        if (res.sweepTxHash) console.log(`   Builder Sweep Tx: ${res.sweepTxHash}`);
        console.log(`   Next Run:         ${demoCadenceMinutes ? `in ${demoCadenceMinutes} minutes (Fast-Forward Mode)` : 'in 30 days'}`);
        console.log('--------------------------------------------------------------------------------');
      }
    } else if (summary.results && summary.results.some(r => r.executed === false)) {
      for (const skip of summary.results.filter(r => r.executed === false)) {
        console.log(`[${timestamp()}] [INSPECTED] Agent ${skip.agentId} is due, but skipped: ${skip.reason}`);
        if (skip.reason === 'NO_MATURED_ROYALTIES') {
          console.log(`   Note: 30-day royalty escrow is active. Run 'npm run demo:fast-forward' for instant demo.`);
        }
      }
    } else {
      // Query active agents to display live status countdown
      let activeAgents = [];
      try {
        if (worker.store && typeof worker.store.listActiveDistributionAgents === 'function') {
          activeAgents = await worker.store.listActiveDistributionAgents();
        }
      } catch {}

      if (activeAgents.length > 0) {
        const nextAgent = activeAgents[0];
        const countdown = formatCountdown(nextAgent.next_distribution_at);
        console.log(`[${timestamp()}] [STANDBY] Monitored 1 active agent (${nextAgent.id}). Next cycle: ${countdown} (at ${new Date(nextAgent.next_distribution_at).toLocaleTimeString()}).`);
      } else {
        console.log(`[${timestamp()}] [STANDBY] Polled schedule. 0 active agents registered in DB. (Tip: run 'npm run demo:fast-forward')`);
      }
    }

    if (summary.failed > 0) {
      console.error(`[${timestamp()}] [!] ${summary.failed} distribution execution(s) encountered an error.`);
    }
  } catch (error) {
    console.error(`[${timestamp()}] [ERROR] Worker batch error: ${error.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, interval));
}
