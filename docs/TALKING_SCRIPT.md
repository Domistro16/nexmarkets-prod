# NexMarkets Live Demo — Presenter Talking Script & Action Runbook

**Topic:** Autonomous Pass Vault Distributions via Dynamic Server Wallets on Base Sepolia  
**Target Duration:** ~3 to 4 Minutes  
**Format:** Live Screen Recording / Screen Share Presentation  

---

## 📋 Pre-Flight Checklist (Do this 2 minutes before presenting)

1. **Terminal 1 (Local Web Stack):**
   ```bash
   npm run web:serve:testnet
   ```
   *(Ensure Web UI is running at `http://localhost:4173` and API at `http://localhost:4020`)*.
2. **Browser Tabs (Open these in order):**
   - **Tab 1:** `http://localhost:4173/discover` *(NexMarkets Discover Page)*
   - **Tab 2:** `https://github.com/Domistro16/nexmarkets-prod/actions` *(GitHub Actions tab)*
   - **Tab 3:** `https://sepolia.basescan.org/address/0x2453c5FCef787D076ff21614E54C50344FD1EB91#code` *(Verified NexRewardDistributor on Basescan)*
   - **Tab 4:** `http://localhost:4020/v1/editions/0x2453c5fcef787d076ff21614e54c50344fd1eb91/distribution-logs` *(Audit Ledger API)*
3. **Terminal 2 (Clean terminal for live test command, kept visible):**
   - Kept ready in the project root directory.

---

## 🎬 The Master Talking Script

---

### ACT 1: THE HOOK & THE PROBLEM (0:00 – 0:45)

**[SCREEN: Start on Tab 1: NexMarkets Discover Page `http://localhost:4173/discover`]**  
**[ACTION: Slowly scroll down past the featured Editions to show the active cards, then pause at the top.]**

> **SAY:**  
> "Hi everyone, I’m excited to show you NexMarkets.  
> 
> In traditional Web3 creator passes and membership ecosystems, creators love to make promises: *'Hold this pass and you’ll get 30% of secondary market royalties'* or *'Hold this pass to receive recurring tokenized stock and revenue drops.'*  
> 
> But in practice, almost every project fails to deliver on this. Why? Because manually calculating splits for hundreds or thousands of pass holders every 30 days is a logistical nightmare. It’s expensive, it requires human intervention, and worst of all, traditional bots require storing a hot private key on a server—which is an unacceptable security hazard.  
> 
> Furthermore, if rewards are claimed to a personal wallet, the pass itself loses its accumulated value when sold on secondary markets.  
> 
> With NexMarkets on Base, we solved both problems by combining **ERC-6551 Token Bound Accounts** with **Dynamic Server Wallets**."

---

### ACT 2: PASS VAULTS & THE DISCOVER EXPERIENCE (0:45 – 1:30)

**[ACTION: Click on any active Edition card, e.g., "Baldies" or "Test Certification Edition" to open the detail view.]**  
**[SCREEN: The Edition page showing the Passes, Price (5 USDC), and Advantages.]**

> **SAY:**  
> "Here on the Edition page, you can see our exact-serial Pass model. Every pass is minted on Base Sepolia using canonical USDC.  
> 
> But what makes NexMarkets fundamentally unique is what happens behind the scenes:  
> Every single Pass minted here is not just an NFT—it is an **ERC-6551 Token Bound Account**, or what we call a **Pass Vault**."

**[ACTION: Highlight or hover over the Pass Serial / Vault section.]**

> **SAY:**  
> "This means the Pass itself is a sovereign smart contract wallet. Any token, USDC distribution, or fractional stock drop is deposited directly into the Pass itself.  
> 
> If I sell my pass tomorrow on Seaport 1.6, all accumulated unspent rewards transfer atomically to the new buyer. The value stays with the Pass, not the detached external wallet."

---

### ACT 3: THE AUTONOMOUS AGENT & DYNAMIC SERVER WALLETS (1:30 – 2:30)

**[ACTION: Switch to Tab 2: GitHub Actions tab `https://github.com/Domistro16/nexmarkets-prod/actions`]**  
**[SCREEN: Show the GitHub Actions dashboard highlighting "NexMarkets Distribution Worker".]**

> **SAY:**  
> "Now, how do we make distributions happen every 30 days without human intervention and without keeping dangerous private keys on our server?  
> 
> This is where **Dynamic Server Wallets** come in.  
> 
> When a creator publishes their reward policy—for example, allocating 30% of secondary royalties to pass holders—NexMarkets automatically provisions an autonomous Dynamic Server Wallet scoped deterministically to that Edition.  
> 
> The private key is secured inside Dynamic’s MPC hardware infrastructure. Our backend never touches a private key."

**[ACTION: Click on "NexMarkets Distribution Worker" on the left menu.]**  
**[ACTION: Click the "Run workflow" dropdown on the right $\rightarrow$ branch `main` is selected $\rightarrow$ Click the green "Run workflow" button.]**  
**[ACTION: Refresh the page after 2 seconds to show the queued/running workflow.]**

> **SAY:**  
> "I just triggered our autonomous worker tick—which normally runs on an hourly schedule at zero cost. Let's watch what it does.  
> 
> In a single execution run:  
> 1. It scans our database for due distribution cycles.  
> 2. It inspects our onchain `NexRoyaltyVault` contract on Base Sepolia to withdraw matured secondary sale royalties.  
> 3. It sweeps the creator's retained 70% share straight to their personal wallet.  
> 4. It approves the reward pool in USDC and funds the reward cycle in `NexRewardDistributor`.  
> 5. And finally, using Dynamic’s Server Wallet, it batch-claims and deposits payouts directly into all holders' ERC-6551 Pass Vaults."

**[ACTION: Open your terminal to demonstrate the worker live. You can choose either Option A (Live Real-Time Demo) or Option B (GitHub Actions / Gas Savings).]**

#### OPTION A: Live Real-Time Fast-Forward Execution (Recommended for maximum impact!)
**[ACTION: In Terminal 1, run the one-shot distribution command:]**
```bash
npm run demo:distribute
```
*(Or keep `npm run worker:distribution` running in a dedicated terminal window to show continuous live countdown monitoring).*

**[SCREEN: Terminal lights up with rich execution logs:]**
```text
================================================================================
   >>> AUTONOMOUS DISTRIBUTION CYCLE EXECUTED SUCCESSFULLY! <<<
================================================================================
   Agent ID:         agt_demo_sepolia
   Cycle ID:         0x2c3d4bc1c708a4834398f95924c97179edc9a0de...
   Eligible Passes:  1
   Total Funded:     10.00 USDC
   Amount Per Pass:  10.0000 USDC
   fundCycle Tx:     0x24aa3ccc6115e25f1e94417c248da01e24ec1db...
   Pass Vaults:      1 batch claim transaction(s)
   Next Run:         Rescheduled in 2 minutes (Testnet Fast-Forward)
================================================================================
```

> **SAY:**  
> "In production on Base mainnet, distributions adhere to our 30-day security escrow lockup.  
> 
> But for this live demo on Base Sepolia, we’ve configured a **Fast-Forward Testnet Cadence** of 2 minutes. Watch what our autonomous agent just did in real time:  
> 1. It detected that the distribution schedule arrived.  
> 2. The Dynamic Server Wallet approved our `NexRewardDistributor` contract on Base Sepolia.  
> 3. It called `fundCycle` with 10 USDC, generating this live confirmed transaction hash: `0x24aa...`.  
> 4. And it automatically batch-claimed and credited the rewards directly into the holders' ERC-6551 Pass Vaults!  
> 5. Notice it then immediately rescheduled the next autonomous distribution for 2 minutes from now. Zero manual intervention required."

#### OPTION B: Showing GitHub Actions Workflow & Gas Intelligence
**[ACTION: Click into the completed GitHub Action workflow job and expand "Run Distribution Worker Tick" log.]**  
**[SCREEN: The log shows: `{ inspected: 1, executed: 0, failed: 0 }` and a green checkmark.]**

> **SAY:**  
> "When there are no claims due, notice how our worker behaves: `{ inspected: 1, executed: 0, failed: 0 }` completing in under 45 seconds with zero errors.  
> 
> This demonstrates intelligent gas management on Base: the worker monitors state offchain and never wastes gas on pointless empty onchain transactions when a cycle is not due."

**[ACTION: Switch to Terminal 2 and run our full integration test:]**
```bash
node --test test/distribution-worker.test.mjs
```
**[SCREEN: Terminal displays: `✔ DistributionAgentWorker: processes matured royalty distributions end-to-end`.]**

> **SAY:**  
> "Here in our automated test suite, we simulate a full 10 USDC secondary sale royalty escrow maturing. Watch the agent:  
> 1. It withdraws the matured escrow from `NexRoyaltyVault`.  
> 2. It sweeps 7 USDC—the builder's 70% share—straight to their wallet.  
> 3. And it batch-deposits the remaining 3 USDC evenly across 50 Pass Vaults without losing a single wei of dust."

---

### ACT 4: VERIFIED CONTRACTS & AUDIT PROOF (2:30 – 3:15)

**[ACTION: Switch to Tab 3: Basescan `https://sepolia.basescan.org/address/0x2453c5FCef787D076ff21614E54C50344FD1EB91#code`]**  
**[SCREEN: Basescan showing the green checkmark "Contract Source Code Verified (Exact Match)".]**

> **SAY:**  
> "Everything you've seen is fully deployed and verified on Base Sepolia.  
> 
> Here is our `NexRewardDistributor` on Basescan with full verified Solidity source code and exact-match bytecode. Anyone can inspect the `fundCycle` and `claimMany` functions directly on the block explorer."

**[ACTION: Switch to Tab 4: API Audit Ledger `http://localhost:4020/v1/editions/0x2453c5fcef787d076ff21614e54c50344fd1eb91/distribution-logs`]**  
**[SCREEN: JSON audit output showing `eligible_supply`, `amount_per_pass`, `fund_tx_hash`, and `claim_tx_hashes`.]**

> **SAY:**  
> "Every payout generates an immutable audit record linking back to the Base Sepolia transaction hashes. Creators, holders, and auditors can query this at any time."

---

### ACT 5: THE TECHNICAL DEFENSE & CONCLUSION (3:15 – 3:45)

**[ACTION: Switch to Terminal 2.]**  
**[ACTION: Run the test suite command:]**
```bash
node --test test/*distribution*.test.mjs
```
**[SCREEN: Watch all 13 tests pass in ~1.5 seconds.]**

> **SAY:**  
> "To ensure enterprise-grade stability, we wrote comprehensive domain rules and gas safety guards:  
> - **Gas-Chunking:** In `test/distribution-agent-domain.test.mjs`, you can see we automatically chunk token IDs into batches of 150. Even with thousands of passes, transactions will never revert due to Base block gas limits.  
> - **Dust-Free Math:** Our BigInt division preserves all fractional remainders, preventing token leakage.  
> - **Zero-Cost Infrastructure:** The entire stack—from the Vercel serverless API to the GitHub Actions runner—operates on a free-tier footprint without sacrificing reliability.  
> 
> NexMarkets turns creator promises into autonomous, mathematically verifiable onchain realities on Base.  
> 
> Thank you! I’m happy to answer any questions."

---

## 🎯 Pro Tips for Delivery

1. **Keep Browser Zoom at 110%–125%:** It makes the text on Basescan, GitHub Actions, and the web UI easy to read for viewers on smaller screens or laptop displays.
2. **Don't Rush the Workflow Run:** While waiting 30 seconds for the GitHub Action runner to complete, use that time to explain *why* Dynamic Server Wallets are safer than traditional backend private keys.
3. **If Asked About Production Cost:** Remind them: *"The serverless function executes in under 500ms, staying well within Vercel's free serverless timeout, and the worker ticks run via GitHub Actions or free cron-job pingers. Total operational hosting cost: $0."*
