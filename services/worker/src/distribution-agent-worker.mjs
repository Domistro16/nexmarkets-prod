import pg from 'pg';
import { Interface, keccak256, AbiCoder, getAddress } from 'ethers';
import { PostgresStore } from '../../../packages/data/src/postgres-store.mjs';
import { DynamicServerWalletClient } from '../../../packages/chain/src/dynamic-server-wallet.mjs';
import { JsonRpcClient } from '../../../packages/chain/src/rpc.mjs';
import {
  calculateRewardSplit,
  chunkTokenIds,
  calculateBuilderSweep,
  isDistributionDue
} from '../../../packages/domain/src/distribution-agent.mjs';

const ROYALTY_VAULT_ABI = [
  'function withdraw(bytes32 orderHash) external',
  'function claimInfo(bytes32 orderHash) external view returns (tuple(address edition, uint256 tokenId, address builder, uint256 amount, uint64 releaseAt, bool withdrawn))',
  'function isWithdrawable(bytes32 orderHash) external view returns (bool)'
];

const REWARD_DISTRIBUTOR_ABI = [
  'function fundCycle(bytes32 policyId, address asset, uint256 amountPerPass) external returns (bytes32 cycleId)',
  'function claimMany(bytes32 cycleId, uint256[] calldata tokenIds) external returns (uint256 total)',
  'function policyInfo(bytes32 policyId) external view returns (tuple(address edition, uint8 source, uint16 allocationBps, address rewardAsset, bool ongoing, uint64 endsAt, uint8 status, uint64 publishedAt, uint32 cycleCount))'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)'
];

const royaltyInterface = new Interface(ROYALTY_VAULT_ABI);
const distributorInterface = new Interface(REWARD_DISTRIBUTOR_ABI);
const erc20Interface = new Interface(ERC20_ABI);

const CYCLE_DOMAIN = keccak256(Buffer.from('NEXMARKETS_REWARD_CYCLE_V1', 'utf8'));

/**
 * Autonomous Distribution Agent Worker
 * Monitors 30-day royalty escrow releases and recurring distribution cycles,
 * calculates token splits across ERC-6551 Pass Vaults, sweeps builder shares,
 * and signs onchain execution via Dynamic Server Wallets.
 */
export class DistributionAgentWorker {
  constructor({
    pool,
    connectionString = process.env.DATABASE_URL,
    store,
    dynamicClient,
    rpc,
    rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId = 84532,
    royaltyVaultAddress = process.env.BASE_SEPOLIA_NEX_ROYALTY_VAULT_ADDRESS || '0xCbf82F765c80446baa753a56C563ED0291374614',
    distributorAddress = process.env.BASE_SEPOLIA_NEX_REWARD_DISTRIBUTOR_ADDRESS || '0x2453c5FCef787D076ff21614E54C50344FD1EB91',
    settlementTokenAddress = process.env.BASE_SEPOLIA_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    batchChunkSize = 150,
    logger = console
  } = {}) {
    this.pool = pool ?? (store?.pool ?? new pg.Pool({ connectionString, max: 4, application_name: 'nexmarkets-distribution-worker' }));
    this.ownsPool = !pool && !store?.pool;
    this.store = store ?? new PostgresStore({ pool: this.pool });
    this.dynamic = dynamicClient ?? new DynamicServerWalletClient({ rpcUrl });
    this.rpc = rpc ?? new JsonRpcClient(rpcUrl);
    this.chainId = Number(chainId);
    this.royaltyVaultAddress = getAddress(royaltyVaultAddress).toLowerCase();
    this.distributorAddress = getAddress(distributorAddress).toLowerCase();
    this.settlementTokenAddress = getAddress(settlementTokenAddress).toLowerCase();
    this.batchChunkSize = Number(batchChunkSize) || 150;
    this.logger = logger;
  }

  async close() {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async runOnce(now = new Date()) {
    const dueAgents = await this.store.listDueDistributionAgents(now);
    let executed = 0;
    let failed = 0;
    const results = [];

    for (const agent of dueAgents) {
      try {
        const result = await this.processAgentDistribution(agent, now);
        if (result.executed) {
          executed += 1;
          results.push(result);
        }
      } catch (error) {
        failed += 1;
        this.logger.error?.({
          event: 'distribution_agent_failed',
          agentId: agent.id,
          edition: agent.edition_address,
          error: error.message
        });
        await this.store.recordDistributionLog({
          agentId: agent.id,
          cycleId: `failed_${Date.now()}`,
          assetAddress: this.settlementTokenAddress,
          eligibleSupply: 1,
          amountPerPass: 0n,
          totalFunded: 0n,
          fundTxHash: '0x0',
          status: 'FAILED',
          errorMessage: error.message
        }).catch(() => {});
      }
    }

    return {
      inspected: dueAgents.length,
      executed,
      failed,
      results
    };
  }

  async processAgentDistribution(agent, now) {
    if (agent.reward_source === 'BUILDER_ROYALTY') {
      return this._processRoyaltyDistribution(agent, now);
    }
    return this._processDirectBalanceDistribution(agent, now);
  }

  async _processRoyaltyDistribution(agent, now) {
    // 1. Query matured and unwithdrawn royalties from projection
    const pool = await this.store._getPool();
    const claimsQuery = await pool.query(
      `SELECT rc.* FROM royalty_claim_projection rc
       JOIN edition e ON e.id = rc.edition_id
       WHERE e.edition_address = $1 AND rc.release_at <= $2 AND rc.withdrawn = false
       ORDER BY rc.release_at ASC`,
      [agent.edition_address.toLowerCase(), now]
    );

    const maturedClaims = claimsQuery.rows;
    if (maturedClaims.length === 0) {
      return { executed: false, reason: 'NO_MATURED_ROYALTIES' };
    }

    let totalRoyalty = 0n;
    for (const claim of maturedClaims) {
      totalRoyalty += BigInt(claim.amount_usdg);
    }

    if (totalRoyalty <= 0n) {
      return { executed: false, reason: 'ZERO_ROYALTY_AMOUNT' };
    }

    // 2. Call NexRoyaltyVault.withdraw(orderHash) for each matured claim
    for (const claim of maturedClaims) {
      const withdrawCalldata = royaltyInterface.encodeFunctionData('withdraw', [claim.order_hash]);
      await this.dynamic.sendTransaction({
        walletId: agent.server_wallet_id,
        to: this.royaltyVaultAddress,
        data: withdrawCalldata,
        chainId: this.chainId
      });
    }

    // 3. Calculate builder retained sweep vs pass holder reward pool
    const sweep = calculateBuilderSweep({
      totalRoyalty,
      allocationBps: agent.allocation_bps
    });

    let sweepTxHash = null;
    // Auto-sweep builder's retained share to builder address
    if (sweep.builderRetained > 0n) {
      const transferCalldata = erc20Interface.encodeFunctionData('transfer', [
        agent.builder_address,
        sweep.builderRetained
      ]);
      const sweepTx = await this.dynamic.sendTransaction({
        walletId: agent.server_wallet_id,
        to: this.settlementTokenAddress,
        data: transferCalldata,
        chainId: this.chainId
      });
      sweepTxHash = sweepTx.txHash;
    }

    // 4. Distribute reward pool to Pass Vaults
    if (sweep.rewardPool <= 0n) {
      await this.store.updateDistributionAgentSchedule(agent.id, {
        lastDistributionAt: now,
        nextDistributionAt: new Date(now.getTime() + agent.cadence_days * 86400000)
      });
      return { executed: true, sweepOnly: true, sweptAmount: sweep.builderRetained.toString() };
    }

    return this._fundAndClaimCycle({
      agent,
      rewardAmount: sweep.rewardPool,
      now,
      sweepTxHash
    });
  }

  async _processDirectBalanceDistribution(agent, now) {
    // Read available token balance in agent's server wallet
    const balanceInfo = await this.dynamic.getBalance({
      address: agent.server_wallet_address,
      tokenAddress: this.settlementTokenAddress
    });

    if (balanceInfo.raw <= 0n) {
      return { executed: false, reason: 'NO_BALANCE_AVAILABLE' };
    }

    return this._fundAndClaimCycle({
      agent,
      rewardAmount: balanceInfo.raw,
      now,
      sweepTxHash: null
    });
  }

  async _fundAndClaimCycle({ agent, rewardAmount, now, sweepTxHash }) {
    // 1. Fetch eligible minted supply from edition
    const pool = await this.store._getPool();
    const supplyQuery = await pool.query(
      `SELECT count(*)::int as minted
       FROM pass_token_projection pt
       JOIN edition e ON e.id = pt.edition_id
       WHERE e.edition_address = $1 AND pt.orphaned_at IS NULL`,
      [agent.edition_address.toLowerCase()]
    );
    const eligibleSupply = supplyQuery.rows[0]?.minted || 1;

    // 2. Calculate reward split
    const split = calculateRewardSplit({
      totalAmount: rewardAmount,
      eligibleSupply
    });

    // 3. Approve NexRewardDistributor to spend reward tokens
    const approveCalldata = erc20Interface.encodeFunctionData('approve', [
      this.distributorAddress,
      split.fundedAmount
    ]);
    await this.dynamic.sendTransaction({
      walletId: agent.server_wallet_id,
      to: this.settlementTokenAddress,
      data: approveCalldata,
      chainId: this.chainId
    });

    // 4. Call NexRewardDistributor.fundCycle(policyId, asset, amountPerPass)
    const fundCycleCalldata = distributorInterface.encodeFunctionData('fundCycle', [
      agent.policy_id,
      this.settlementTokenAddress,
      split.amountPerPass
    ]);
    const fundTx = await this.dynamic.sendTransaction({
      walletId: agent.server_wallet_id,
      to: this.distributorAddress,
      data: fundCycleCalldata,
      chainId: this.chainId
    });

    // 5. Deterministic cycle ID derivation: keccak256(abi.encode(CYCLE_DOMAIN, chainId, policyId, cycleIndex))
    // We estimate cycleIndex or derive cycleId
    const coder = AbiCoder.defaultAbiCoder();
    const cycleId = keccak256(coder.encode(
      ['bytes32', 'uint256', 'bytes32', 'uint32'],
      [CYCLE_DOMAIN, this.chainId, agent.policy_id, 1]
    ));

    // 6. Batch claimMany in 150–200 chunks
    const chunks = chunkTokenIds({
      eligibleSupply,
      chunkSize: this.batchChunkSize
    });

    const claimTxHashes = [];
    for (const chunk of chunks) {
      const claimManyCalldata = distributorInterface.encodeFunctionData('claimMany', [
        cycleId,
        chunk
      ]);
      const claimTx = await this.dynamic.sendTransaction({
        walletId: agent.server_wallet_id,
        to: this.distributorAddress,
        data: claimManyCalldata,
        chainId: this.chainId
      });
      claimTxHashes.push(claimTx.txHash);
    }

    // 7. Record distribution log and update agent schedule
    await this.store.recordDistributionLog({
      agentId: agent.id,
      cycleId,
      assetAddress: this.settlementTokenAddress,
      eligibleSupply,
      amountPerPass: split.amountPerPass,
      totalFunded: split.fundedAmount,
      fundTxHash: fundTx.txHash,
      claimTxHashes,
      sweepTxHash,
      status: 'COMPLETED'
    });

    await this.store.updateDistributionAgentSchedule(agent.id, {
      lastDistributionAt: now,
      nextDistributionAt: new Date(now.getTime() + agent.cadence_days * 86400000)
    });

    return {
      executed: true,
      agentId: agent.id,
      cycleId,
      eligibleSupply,
      amountPerPass: split.amountPerPass.toString(),
      totalFunded: split.fundedAmount.toString(),
      fundTxHash: fundTx.txHash,
      claimCount: claimTxHashes.length,
      sweepTxHash
    };
  }
}
