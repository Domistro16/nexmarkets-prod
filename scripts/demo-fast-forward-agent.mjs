import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { DynamicServerWalletClient } from '../packages/chain/src/dynamic-server-wallet.mjs';
import { DistributionAgentWorker } from '../services/worker/src/distribution-agent-worker.mjs';

// 1. Auto-load .env from repository root if present
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

process.env.DEMO_MODE = 'true';
if (!process.env.DEMO_CADENCE_MINUTES) {
  process.env.DEMO_CADENCE_MINUTES = '2';
}

const shouldRun = process.argv.includes('--run');
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[Error] DATABASE_URL is not set in .env or environment.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 2 });

async function main() {
  console.log('================================================================================');
  console.log('   NEXMARKETS | Demo Fast-Forward & Agent Provisioning Tool');
  console.log('   Network: Base Sepolia (84532) | Mode: TESTNET FAST-FORWARD');
  console.log('================================================================================\n');

  try {
    // Check for existing distribution agents
    const { rows: existingAgents } = await pool.query(
      `SELECT * FROM distribution_agent WHERE status = 'ACTIVE' ORDER BY created_at DESC`
    );

    let agent = null;

    if (existingAgents.length > 0) {
      console.log(`[Found] Found ${existingAgents.length} active distribution agent(s) in database.`);
      const { rows: updated } = await pool.query(
        `UPDATE distribution_agent 
         SET next_distribution_at = NOW() - interval '5 seconds', updated_at = NOW()
         WHERE status = 'ACTIVE'
         RETURNING *`
      );
      agent = updated[0];
      console.log(`[Fast-Forward] Successfully fast-forwarded Agent "${agent.id}" to DUE NOW!`);
      console.log(`   - Edition:        ${agent.edition_address}`);
      console.log(`   - Server Wallet:  ${agent.server_wallet_address}`);
      console.log(`   - Reward Source:  ${agent.reward_source}`);
    } else {
      console.log('[Setup] No distribution agent found. Provisioning active demo agent...');

      // Find an edition or use default certification edition
      const { rows: editions } = await pool.query(
        `SELECT edition_address, publisher_address FROM edition WHERE chain_id = '84532' LIMIT 1`
      );
      const editionAddress = editions[0]?.edition_address || '0x2854c071ecbc74b3487fad3a83a3d87bb9e55b68';
      const builderAddress = editions[0]?.publisher_address || '0xd83defba240568040b39bb2c8b4db7db02d40593';

      // Provision Dynamic Server Wallet
      const dynamic = new DynamicServerWalletClient();
      const serverWallet = await dynamic.createOrGetServerWallet({
        identifier: 'edition-demo-sepolia-agent',
        chainId: 84532
      });

      const policyId = '0x' + '7'.repeat(64);
      const agentId = 'agt_demo_sepolia';

      const { rows: inserted } = await pool.query(
        `INSERT INTO distribution_agent(
          id, edition_address, builder_address, policy_id, server_wallet_id,
          server_wallet_address, reward_source, allocation_bps, cadence_days,
          next_distribution_at, status
        ) VALUES(
          $1, $2, $3, $4, $5, $6, 'BUILDER_FUNDED', 3000, 30, NOW() - interval '5 seconds', 'ACTIVE'
        )
        ON CONFLICT (edition_address, policy_id) DO UPDATE
        SET next_distribution_at = NOW() - interval '5 seconds', status = 'ACTIVE'
        RETURNING *`,
        [agentId, editionAddress.toLowerCase(), builderAddress.toLowerCase(), policyId, serverWallet.walletId, serverWallet.address.toLowerCase()]
      );

      agent = inserted[0];
      console.log(`[Created] Demo agent "${agent.id}" provisioned successfully!`);
      console.log(`   - Edition:        ${agent.edition_address}`);
      console.log(`   - Server Wallet:  ${agent.server_wallet_address}`);
      console.log(`   - Reward Source:  BUILDER_FUNDED`);
      console.log(`   - Schedule:       DUE NOW`);
    }

    if (shouldRun) {
      console.log('\n[Executing] Triggering distribution cycle immediately via Dynamic Server Wallet...');
      const worker = new DistributionAgentWorker({
        pool,
        chainId: 84532,
        demoCadenceMinutes: 2
      });

      const summary = await worker.runOnce(new Date());

      if (summary.executed > 0) {
        const res = summary.results.find(r => r.executed);
        console.log('\n================================================================================');
        console.log('   >>> AUTONOMOUS DISTRIBUTION CYCLE EXECUTED SUCCESSFULLY! <<<');
        console.log('================================================================================');
        console.log(`   Agent ID:         ${res.agentId}`);
        console.log(`   Cycle ID:         ${res.cycleId}`);
        console.log(`   Eligible Passes:  ${res.eligibleSupply}`);
        console.log(`   Total Funded:     ${(Number(res.totalFunded) / 1e6).toFixed(2)} USDC`);
        console.log(`   Amount Per Pass:  ${(Number(res.amountPerPass) / 1e6).toFixed(4)} USDC`);
        console.log(`   fundCycle Tx:     ${res.fundTxHash}`);
        console.log(`   Pass Vaults:      ${res.claimCount} batch claim transaction(s)`);
        console.log(`   Next Run:         Rescheduled in 2 minutes (Testnet Fast-Forward)`);
        console.log('================================================================================\n');
      } else {
        console.log('\n[Result] Worker run completed:', summary);
      }
    } else {
      console.log('\n================================================================================');
      console.log('   Agent is primed and ready to fire!');
      console.log('   To watch it execute in real time in your demo recording:');
      console.log('     npm run worker:distribution');
      console.log('   Or run it directly in one shot:');
      console.log('     npm run demo:fast-forward -- --run');
      console.log('================================================================================\n');
    }
  } catch (err) {
    console.error('[Error] Demo fast-forward failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
