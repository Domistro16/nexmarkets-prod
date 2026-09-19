# NexMarkets — Product Demo & Presentation Guide

**Autonomous Pass Vault Distributions via Dynamic Server Wallets on Base**

---

## 1. Executive Summary & Value Proposition

### The Problem
In traditional creator pass, gaming, and membership NFT ecosystems:
1. **Broken Payout Promises:** Creators frequently promise secondary royalty distributions or recurring reward drops (e.g., tokenized stock rewards, revenue shares, platform perks), but executing them manually to hundreds or thousands of wallets every 30 days is complex, error-prone, and gas-intensive.
2. **Private Key Vulnerability:** Automated bots or backend cron jobs usually require storing a hot private key on servers, creating an unacceptable custody and security liability.
3. **No True Asset Ownership by Passes:** Typical reward claims require the holder to manually connect a wallet and claim before a deadline; if a pass is sold, unclaimed value is either trapped or stolen.

### The NexMarkets Solution
NexMarkets combines **ERC-6551 Token Bound Accounts (Pass Vaults)** with **Dynamic Server Wallets**:
- **ERC-6551 Pass Vaults:** Every Pass minted on Base is its own sovereign smart contract wallet. Rewards drop directly into the *Pass itself*, so the accumulated value transfers atomically with the Pass upon secondary sale on Seaport 1.6.
- **Dynamic Server Wallets:** NexMarkets lazily provisions an autonomous Dynamic Server Wallet deterministically scoped to each creator Edition. The server wallet holds operational gas, signs onchain contract calls, and executes recurring payouts without user private keys or server key custody.
- **Autonomous Distribution Agent:** A lightweight, serverless worker daemon monitors 30-day royalty escrow releases in `NexRoyaltyVault`, sweeps the creator's share, funds the reward cycle in `NexRewardDistributor`, and batch-deposits payouts into all Pass Vaults.

---

## 2. Architecture & Transaction Flow

```mermaid
sequenceDiagram
    autonumber
    actor Creator as Creator / Builder
    participant UI as NexMarkets Web UI
    participant API as NexMarkets API (/v1)
    participant Dynamic as Dynamic Server Wallet SDK
    participant Worker as Autonomous Distribution Worker
    participant Vault as NexRoyaltyVault (30-Day Escrow)
    participant Dist as NexRewardDistributor
    participant TBA as ERC-6551 Pass Vaults

    Note over Creator,UI: 1. Launch & Policy Publishing
    Creator->>UI: Publishes Edition with 30% Royalty Split
    UI->>API: POST /v1/distribution-agents/provision
    API->>Dynamic: Provision Server Wallet (agent:edition:policyId)
    Dynamic-->>API: Return Server Wallet Address (0x...)
    API-->>UI: Agent Activated (ACTIVE, 30-Day Cadence)

    Note over Worker,TBA: 2. Autonomous Execution (Every 30 Days / Hourly Tick)
    Worker->>API: Inspect Due Distribution Agents
    Worker->>Vault: Check isWithdrawable(orderHash)
    Worker->>Dynamic: Request Execution Signatures
    Dynamic->>Vault: withdraw(orderHash) [Secondary Royalties]
    Dynamic->>Creator: Sweep Builder's Retained Share (70%)
    Dynamic->>Dist: fundCycle(policyId, USDC, amountPerPass)
    loop In Chunks of 150 Serials
        Dynamic->>Dist: claimMany(cycleId, [tokenId_1 ... tokenId_150])
        Dist->>TBA: Deposit USDC into ERC-6551 Pass Vaults
    end
    Worker->>API: Record Distribution Log & Tx Hashes
```

---

## 3. Demo Tracks

### Track A: The Full Interactive Browser Demo (Web UI + Explorer)

**Goal:** Show the end-to-end user experience for both Creators and Pass Holders.

#### Step 1: Launch the Local Testnet Stack
Run the certified local environment (connected to Base Sepolia and the live PostgreSQL database):
```bash
npm run web:serve:testnet
```
- **Web App:** `http://localhost:4173`
- **API Server:** `http://localhost:4020`

#### Step 2: Discover Page & Pass Architecture
1. Navigate to `http://localhost:4173/discover`.
2. Select an active Edition (e.g. *Baldies* or *Test Certification Edition*).
3. **What to highlight:**
   - **Fixed Supply & Clear Pricing:** Exact Pass serials denominated in canonical USDC on Base Sepolia (`0x036CbD53...`).
   - **Pass Vaults (ERC-6551):** Click on any Pass serial to highlight its dedicated Token Bound Account. Point out that the Pass itself owns assets, rewards, and advantages.

#### Step 3: Creator Policy & Agent Status
1. Query the live API endpoint for the Edition's autonomous distribution agent:
   ```bash
   curl http://localhost:4020/v1/editions/0x2453c5fcef787d076ff21614e54c50344fd1eb91/distribution-agent
   ```
2. **Key Data Points to Show:**
   - `server_wallet_address`: The dedicated Dynamic Server Wallet.
   - `allocation_bps`: `3000` (representing 30% of secondary sale royalties distributed to holders).
   - `cadence_days`: `30` (30-day recurring automated cycles).
   - `status`: `ACTIVE`.

---

### Track B: The "Magic" Autonomous Execution Demo

**Goal:** Demonstrate that distribution executes without requiring human interaction or hot-key custody.

#### Method 1: 1-Click Execution from GitHub Actions
1. Open your repository in a browser: `https://github.com/Domistro16/nexmarkets-prod/actions`.
2. Select **NexMarkets Distribution Worker** from the left sidebar.
3. Click the **"Run workflow"** button $\rightarrow$ branch `main` $\rightarrow$ click **Run workflow**.
4. Click into the newly queued run (completes in ~45 seconds).
5. Open the **"Run Distribution Worker Tick"** step:
   - Point out that it runs on Node 22 in an isolated GitHub runner.
   - Show the worker log:
     ```json
     { "inspected": 1, "executed": 0, "failed": 0, "results": [] }
     ```
   - Explain: *"The worker automatically inspects the database, verifies Base Sepolia chain state, executes any matured claims via Dynamic Server Wallets, and advances the schedule."*

#### Method 2: Live Serverless Cron Trigger (HTTP Webhook)
Execute a worker tick directly against the API:
```bash
curl -X POST http://localhost:4020/v1/cron/distribution \
  -H "Authorization: Bearer test-super-secret-123"
```
*(Or on your production Vercel deployment with your configured `CRON_SECRET`)*.

Response:
```json
{
  "ok": true,
  "summary": { "inspected": 1, "executed": 0, "failed": 0, "results": [] },
  "timestamp": "2026-09-19T14:30:00.000Z"
}
```

#### Method 3: Live Real-Time Fast-Forward Execution (Fast-Forward Testnet Cadence)
To demonstrate the autonomous agent executing live on camera without waiting 30 days:
```bash
# 1-Shot execution: fast-forwards schedule, triggers agent, and prints live Base Sepolia tx hashes
npm run demo:distribute

# Or start continuous monitoring in a live terminal banner:
npm run worker:distribution
```
Output:
```text
================================================================================
   >>> AUTONOMOUS DISTRIBUTION CYCLE EXECUTED SUCCESSFULLY! <<<
================================================================================
   Agent ID:         agt_demo_sepolia
   Cycle ID:         0x2c3d4bc1c708a4834398f95924c97179edc9a0de6577a34a48f8a37fbcdf4da4
   Eligible Passes:  1
   Total Funded:     10.00 USDC
   Amount Per Pass:  10.0000 USDC
   fundCycle Tx:     0x24aa3ccc6115e25f1e94417c248da01e24ec1db9d0d4ff6573b2f8428dd46c06
   Pass Vaults:      1 batch claim transaction(s)
   Next Run:         Rescheduled in 2 minutes (Testnet Fast-Forward)
================================================================================
```

#### Step 4: Show the Immutable Audit Ledger
Query the audit history:
```bash
curl http://localhost:4020/v1/editions/0x2453c5fcef787d076ff21614e54c50344fd1eb91/distribution-logs
```
Highlight that every funded cycle records:
- `eligible_supply`: Total minted Passes included in the split.
- `amount_per_pass`: Equal USDC dividend per Pass serial.
- `fund_tx_hash`: Onchain hash of `NexRewardDistributor.fundCycle`.
- `claim_tx_hashes`: Batch execution hashes depositing funds into Pass Vaults.
- `sweep_tx_hash`: Direct payout hash to the creator.

---

### Track C: The Technical Deep Dive (Terminal & Test Suite)

**Goal:** Prove mathematical precision, gas optimization, and protocol security to technical evaluators.

Run the specialized distribution test suite:
```bash
node --test test/*distribution*.test.mjs
```

#### What this proves:
| Test Case | Verified Property |
|---|---|
| `calculateRewardSplit` | Zero dust loss; handles uneven divisions and large supplies (e.g. 2,222 Passes) with exact remainder preservation. |
| `chunkTokenIds` | Gas-limit defense: Slices large supplies into chunks of 150 serials per batch, ensuring Base block gas limits are never exceeded. |
| `calculateBuilderSweep` | Exact percentage splits for builder retained earnings vs. holder pool. |
| `DistributionAgentWorker` | End-to-end simulation of escrow withdrawal, builder sweep, reward cycle funding, and multi-vault deposits. |
| `/v1/cron/distribution` | Authentication enforcement: 401 on missing/invalid secret, 200 and execution summary on valid authorization. |

**Result:** `13/13 passing in < 1.7 seconds`.

---

## 4. Deployed Smart Contract Matrix (Base Sepolia)

All contracts are deployed, verified, and active on Base Sepolia (`chainId: 84532`):

| Contract Name | Address | Role |
|---|---|---|
| **NexRewardDistributor** | [`0x2453c5FCef787D076ff21614E54C50344FD1EB91`](https://sepolia.basescan.org/address/0x2453c5FCef787D076ff21614E54C50344FD1EB91) | Manages reward cycles and batch claims into Pass Vaults |
| **NexRoyaltyVault** | [`0xCbf82F765c80446baa753a56C563ED0291374614`](https://sepolia.basescan.org/address/0xCbf82F765c80446baa753a56C563ED0291374614) | 30-day escrow vault for secondary market royalties |
| **Canonical USDC** | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) | Settlement and reward payout currency |
| **ERC-6551 Registry** | [`0x000000006551c19487814612e58FE06813775758`](https://sepolia.basescan.org/address/0x000000006551c19487814612e58FE06813775758) | Canonical registry creating deterministic Pass Vault accounts |
| **Seaport 1.6** | [`0x0000000000000068F116a894984e2DB1123eB395`](https://sepolia.basescan.org/address/0x0000000000000068F116a894984e2DB1123eB395) | Secondary marketplace protocol |

---

## 5. Presentation Talking Points & FAQ

### Q: Why not use a standard EOA with a private key on the backend?
> *"Storing private keys on a backend server is the #1 vector for crypto protocol hacks. If the server is compromised, all funds and authority are stolen. With Dynamic Server Wallets, keys are managed inside secure MPC hardware security modules; our backend only requests scoped transaction execution, with zero hot-key custody."*

### Q: What happens if an Edition has thousands of holders? Won't gas run out?
> *"Yes, iterating over thousands of token IDs in a single Ethereum/Base transaction causes out-of-gas reverts. Our `chunkTokenIds` domain service automatically chunks token IDs into batches of 150. The worker broadcasts multiple parallel or sequenced `claimMany` transactions, easily fitting within Base's block limits."*

### Q: Does this cost money to keep running?
> *"No. The entire worker pipeline runs for $0:
> 1. The API and Web UI run on Vercel's Free/Hobby Tier.
> 2. The worker execution runs via GitHub Actions or free cron pingers (like cron-job.org) hitting `/v1/cron/distribution`.
> 3. Each execution tick takes under 500ms, staying well within serverless timeouts."*
