# NexMarkets — Handover of this chat (through 2026-09-14, ~22:38 UTC+1)

Read this before touching anything. It covers the original Base Sepolia audit handover, everything done in this conversation, every decision Admiano made, and the question that was just put to him and has **not been answered**.

**Who:** Admiano, software engineer. Prefers working directly in code.
**Repo:** `C:\Users\USER\NEXMARKETS\nexmarkets-production`
**Remote:** `https://github.com/Domistro16/nexmarkets-prod.git` (`origin/main`)
**Network:** Base Sepolia, chain `84532`
**Shell:** PowerShell. Foundry is at `C:\Users\USER\.foundry\bin` and is **not** on PATH. Use `$env:PATH += ";C:\Users\USER\.foundry\bin"`. The bash `export PATH=…` recipe will not work here.

At the moment this was written, `git` itself was failing with `OutOfMemoryException` / paging-file-too-small. Re-run `git status` and `git log --oneline -8` before trusting branch state. The facts below were verified earlier in this session.

---

## 0. The question currently in front of Admiano (UNANSWERED)

After the reward model was finished, he asked “Are you done?” and was told yes, with three options:

1. **Commit** the uncommitted reward work.
2. **Deploy** `NexRewardDistributor` to Base Sepolia (planner already includes it; `--unfrozen-dev` + `--allow-unfrozen-testnet`; no `FROZEN_V1_*` edit).
3. **Build the multi-asset Vault claim path** (S2-02) — largest remaining item that needs no product decision.

He has not chosen. His next message was this handover request. **Ask again. Do not pick for him.** Do not commit, push, or deploy unless he says so.

---

## 1. How this conversation started

A prior session left `NEXMARKETS_BASE_TESTNET_HANDOVER.md` and five sibling audit docs. This chat opened on that handover.

The original A/B/C question in that document:

| Option | Outcome in this chat |
|---|---|
| **A.** V2 re-freeze + Sepolia redeploy | Done. Needed neither a re-freeze nor a TBA migration. See §4. |
| **B.** Seaport fulfilment fork test | Done. 5/5 tests. Commit `f7beb70`. |
| **C.** Reward model | Done as a working protocol, not a design doc. **Uncommitted and undeployed.** |

Admiano’s explicit choices, in order:

| When | Choice |
|---|---|
| Start | Proceed; grant shell |
| Provenance vs broadcast | **Commit contract fixes first**, then deploy and finish |
| After deploy | “So what is left” → picked **Seaport** |
| After Seaport | “What else is next based on the handover” → **push the three commits and reconcile the audit docs**; **keep Terms republishable** after mint (intended product rule, do not add `totalMinted() == 0`) |
| After docs | “Okay now do the reward model” |
| Three reward questions (assets / expiry / allocation %) | Interrupted; then “continue” |
| Recommendations used in lieu of answers | ERC-20 only; never reclaimable; `allocationBps` is a published commitment, not enforcement |
| After reward build | “Are you done?” → told yes, asked commit / deploy / Vault claim → **unanswered** → this handover |

Do not relitigate any of the resolved rows.

---

## 2. Environment gotchas (they will waste a session if ignored)

- Foundry 1.8.1 is installed but not on PATH. `foundryup` is broken. Put `C:\Users\USER\.foundry\bin` on PATH in PowerShell.
- This shell is **PowerShell**, not bash. `$env:FOO = "bar"` not `export FOO=bar`.
- `dist/` is gitignored. Address updates must hit `public/config.json`, `apps/api/public/config.json`, `apps/web/public/config.json`, `.env`, subgraph yaml, and the various bundled `api/v1.js` / `readyz.js` copies.
- The Windows home directory is itself a git repo. Do not run git commands from `C:\Users\USER`.
- `cast logs` over a wide range hits `eth_getLogs` 10,000-block limit. Chunk scans.
- Do not load the whole `.env` into a command (secrets). Goldsky deploy previously needed a smart-mode approval even when only `GOLDSKY_API_KEY` was selected.
- Goldsky project was at subgraph limit; `nexmarkets-v1-base-sepolia/1.0.1` was deleted and the same tag redeployed.
- Auto-review blocks `git push origin main` until the user approves the card. Pushing to `main` is allowed only when he asked.
- `scripts/plan-v1-deployment.mjs` can print `PASS` while emitting a plan that reverts on chain. Always run `scripts/simulate-v1-deployment.mjs` on a fork first. The two defects that would have reverted are fixed (see §4).
- The CREATE2 salt embeds `HEAD`, not the working tree. Commit before planning, or the on-chain record cites a commit that lacks the changes.
- `MIN_PREVIEW_DURATION` is a hardcoded `1 days`. A public mint→list→sell journey needs ≥48h wall clock. Fork tests do not produce explorer hashes.

---

## 3. What the live system is (post this chat)

A real 10-contract V1 on Base Sepolia, non-upgradeable, one-time wiring consumed, canonical Seaport 1.6 / ERC-6551 / USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6dp). Protocol admin Safe `0xE6D0846e6C0b51C61FdDb593A1914b85181E5783`, **threshold 1 of 2**. Owner `0xD83deFbA…` is also `DEPLOYER_PRIVATE_KEY` in local `.env`. **Do not describe this as decentralised.** Manifest still has `RAISE_THRESHOLD_TO_2_PLUS` outstanding.

Redeployed 2026-09-14, blocks **46,818,316–46,818,334** (deploys) and **46,818,356–46,818,364** (wiring). Cost ~0.00011 ETH. All `EXECUTED_VERIFIED`.

| Contract | Live address |
|---|---|
| NexLaunchRegistry | `0x76D3B6F0b14CC1075717cE0BeE71daA91DDE1764` |
| NexMintController | `0xdbca332e01aa90E4576b5A3CBB5E12e479BE3a6D` |
| NexPassFactory | `0x6596aAb23E2085E63c1211D7d66cE22051Ab81dB` |
| NexAdvantageRegistry | `0x385B81a3539724FACA5c93639e50800D0FE97f23` |
| NexAdvantageInitializer | `0x181c489F1f1A4aE2b78EACD1682a76E2aE59fBb8` |
| NexRoyaltyVault | `0x91bCDfE16D54a697755ceb6e218D1cC799de31Ef` |
| NexListingRegistry | `0x3a1894d0aB2089445814afb7b6ebE98da541Db39` |
| NexMarketsZone | `0xeAD4f17D5f65bE9D0a2F6367F9E258b04300982a` |
| NexPassAccount | `0xE96a2D7CBf0a6315D678B7E32000799d6d113b6a` |
| NexTBAResolver | `0x8f49eC4c6ccE15dEa202b5bD1d1978737f6CD1E5` |

`NexRewardDistributor` is **not in this table**. It exists only in source.

Subgraph: Goldsky `nexmarkets-v1-base-sepolia/1.0.1`, start block **46,818,316**, same tag as before (URL unchanged). `MintAccessPublished` is the 6-parameter form (`walletAllowance`). Indexing was clean when last queried.

Settlement and primitives: Seaport 1.6 `0x0000000000000068F116a894984e2DB1123eB395`, ERC-6551 registry `0x000000006551c19487814612e58FE06813775758`, ImmutableCreate2Factory `0x0000000000ffe8b47b3e2130213b802212439497`.

Pre-fix addresses are in `NEXMARKETS_BASE_TESTNET_DEPLOYMENTS.md` under “Superseded” and in `deployments/base-sepolia.v1-deployment.legacy-safe.json`. Do not put them back into `config.json`.

---

## 4. What this chat actually changed, and what turned out to be wrong

### Three original audit findings were wrong, not merely stale

1. **Frozen bytecode did not block testnet.** `FROZEN_V1_*` is a **mainnet** control. `--unfrozen-dev` and `--allow-unfrozen-testnet` are sanctioned for `base-sepolia` / `robinhood-testnet`. The previous live deployment was already unfrozen (`deploymentSourceCommit` `7bb4d1f7…`). **`FROZEN_V1_*` was never edited. Do not edit it.**
2. **Pass Vault migration was unnecessary.** Full log scan: 2 Editions, both `totalMinted() == 0`, zero TBA events, no balance on the old implementation. Checked, not assumed.
3. **API rate limiting exists.** `RateLimiter` in `apps/api/src/server.mjs`, 300 req / 60s, passing test. The S3-05 “MISSING” finding was withdrawn.

### What actually blocked the redeploy (not in the original handover)

`plan-v1-deployment.mjs` reported `PASS` while emitting a reverting plan:

1. `NexPassAccount` now takes immutable `listingRegistry`, but the planner still encoded no constructor args (`initCodeHash == creationBytecodeHash`). Would have reverted `ListingRegistryRequired`.
2. That immutable makes the account runtime codehash **network-specific**. `deployments/erc6551.base-sepolia.json` was stale; `NexTBAResolver` would have reverted `InvalidCodeHash`. Planner now materializes the immutable and **fails closed** on pin mismatch.

`scripts/simulate-v1-deployment.mjs` was added to execute a plan against a fork as the Safe before it costs gas or consumes one-time wiring slots.

S1-01 (Vault drain while listed) and S1-02 (per-wallet Early Access) are **FIXED AND DEPLOYED**. S1-03 (Merkle leaf binds wallet only) was already fixed in the same commit.

### Seaport

`packages/contracts/test/SeaportFulfillmentFork.t.sol` — 5 tests against forked Base Sepolia + canonical Seaport 1.6 + canonical USDC. A 250 USDC sale splits exactly 2.5 / 12.5 / 235. Zone rejects a signed, registered order that underpays by 1 base unit (`ConsiderationMismatch`). Negative tests assert specific selectors. Not covered: conduits, partial/advanced orders, `matchOrders`, buyer offers.

Advantage hashes in that test are fixed at `setUp` (`advStartsAt` / `advEndsAt`). Do not compute them from `block.timestamp` or `vm.warp` desyncs the terms hash (`AdvantagesRequired()`).

### Terms republishable after mint

Admiano confirmed this is the **intended rule**. New version → new hash → forced 1-day Preview; minted Passes snapshot their own terms. Recorded in `GAPS.md` S3-04. **Do not add `totalMinted() == 0`.**

### Docs

The six `NEXMARKETS_BASE_TESTNET_*.md` files were rewritten against live reads at block ~46,820,895 so they would stop listing superseded addresses and claiming the chain hosted pre-fix bytecode. Verdict is still **NOT CERTIFIED**, now for product completeness rather than contract safety.

### Reward model (this session’s last build — UNCOMMITTED)

See §6. The original handover treated this as “blocked on a blank-page product decision.” Enough was already determined by the UI and by sequential token IDs that the remaining three questions had recommended defaults. Those defaults were used after the question card was interrupted.

---

## 5. Git: what is on origin vs what is only on this machine

Pushed to `origin/main` (verified when the machine was healthy):

| Commit | Message |
|---|---|
| `e53f5d9` | `fix(contracts): enforce Pass Vault listing lock and per-wallet Early Access allowance` |
| `1b8774b` | `chore(base-sepolia): point app, API and subgraph at the redeployed V1 address set` |
| `f7beb70` | `test(contracts): fulfil a real Seaport 1.6 order against forked Base Sepolia` |
| `f7fd49e` | `docs(audit): reconcile the Base Sepolia audit set with the deployed reality` |

At `f7fd49e` the tree was clean and `origin/main` matched HEAD (`0 0` ahead/behind).

**Everything in §6 is after `f7fd49e` and has not been committed.** If the working tree looks dirty, that is expected. If git is OOM, the files are still on disk.

A stray file named `0` (`RPC set: 24`, redirected shell output) was deleted during the docs pass. The old handover still mentioned it; that line was later removed.

---

## 6. Reward model — complete technical brief

### Decisions in force (treat as product law unless Admiano redlines)

1. **ERC-20 only.** Tokenized stocks, stablecoins, future-token airdrop. ERC-721 collectibles are out of scope (cannot be split equally).
2. **Never reclaimable.** No Builder sweep, no claim expiry. Pause never blocks claims.
3. **`allocationBps` is a published commitment, not an enforced mechanism.** “30% of Builder royalty” is stored and indexed. Royalties still settle into `NexRoyaltyVault` and are withdrawn manually. Enforcing the percentage would mean redeploying royalty + listing. **Do not render it as a protocol guarantee.**

These are written into the NatSpec on `NexRewardDistributor` so they cannot be quietly reversed.

### Why this shape (do not “improve” it into a Merkle distributor)

- `NexPassEdition` mints sequential IDs from 1, never reused. Eligible set of a Cycle is `1..totalMinted()` at funding. Equal split is division. The brief’s own example is “20.5 NVDAc per holder.”
- Keying entitlement to `tokenId` dissolves “holder sold after snapshot.” The UI already says assets delivered into an exact Pass stay with that Pass.
- `NexPassAccount.isVaultLocked()` gates `execute` / `isValidSigner` / `isValidSignature` only — never receipt. Crediting a listed Vault raises what the buyer receives; the existing lock still stops the seller draining it.
- Claims are therefore permissionless. Value can only land in that Pass’s Vault.

### Contract

`packages/contracts/src/NexRewardDistributor.sol`

- Constructor: `(initialOwner, launchRegistry, tbaResolver)`. Requires `launchRegistry.owner() == initialOwner`.
- Publisher authority is read live from `launchRegistry.editionInfo` — no second copy, so a disabled Edition loses reward authority with everything else.
- `publishPolicy` — no funds. `BUILDER_FUNDED` requires `allocationBps == 0`; other sources require `1..10000`. Ongoing ⇒ `endsAt == 0`; otherwise `endsAt > now`.
- `retirePolicy` — no new Cycles; existing Cycles stay claimable.
- `fundCycle(policyId, asset, amountPerPass)` — escrows exactly `amountPerPass * eligibleSupply`. Measures `balanceOf` before/after `transferFrom`. Mismatch ⇒ `UnsupportedTokenBehaviour` (fee-on-transfer / rebasing).
- `claim` / `claimMany` — destination is `tbaResolver.account(edition, tokenId)` (counterfactual TBA is fine; ERC-20 can sit there until `createAccount`). Not `whenNotPaused`.
- Policy/cycle IDs: `keccak256(abi.encode(DOMAIN, chainid, edition|policyId, index))`.

Enums: `BUILDER_ROYALTY=0`, `PRIMARY_SALES=1`, `OTHER_BUILDER_REVENUE=2`, `BUILDER_FUNDED=3`. UI maps `royalty/primary/other/manual` onto those in `packages/domain/src/transaction-calldata.mjs`.

### Tests

`packages/contracts/test/NexRewardDistributor.t.sol` — 23 tests. Covers: policy commits no funds; exact escrow; claim credits Vault not caller (even a stranger); `claimMany`; unclaimed reward follows Pass on sale; already-claimed stays in Vault through sale; later-minted serial ineligible; listed Vault can receive and seller cannot drain; non-publisher; no mints; double claim; tokenId 0 / OOB; retire; expiry; pause (publish/fund blocked, claim not); pinned asset; fee-on-transfer; allocation validation; “30% stored but 1 wei funded”; fuzz equal-split no dust.

**Pause-test trap:** `vm.expectRevert` is consumed by view calls in the argument list. Compute `policyId` *before* `expectRevert`, then call `fundCycle(policyId, …)`.

Full Foundry suite with `BASE_SEPOLIA_RPC_URL=https://sepolia.base.org`: **119 passed / 12 suites / 0 failed.** (Was 96 before rewards.)

Node tests also passing: `test/transaction-calldata.test.mjs`, `test/subgraph-client.test.mjs`, `test/deployment-source.test.mjs`, `test/subgraph-manifest.test.mjs`, `subgraph/test/subgraph-package.test.mjs`. Frozen-source tests *expect* the new `.sol` file to mismatch `FROZEN_V1_DEPLOYMENT_SOURCE` (`8790b635…`). That is correct. Git will print `path exists on disk, but not in '8790b635…'` — ignore.

### Subgraph / API / planner (wired, waiting on an address)

- Schema: `RewardPolicy`, `RewardCycle`, `RewardClaim` in `subgraph/schema.graphql`. `Edition.rewardPolicies` and `Pass.rewardClaims` derived.
- Mapping handlers in `subgraph/src/mapping.ts`.
- ABI at `subgraph/abis/NexRewardDistributor.json` (events only — machine was OOM during `sync-subgraph-abis.mjs`; the events file is enough for codegen). `scripts/sync-subgraph-abis.mjs` now lists `NexRewardDistributor`; re-run it when the machine is healthy to replace the events-only ABI with the full artifact ABI.
- **Both** `subgraph/subgraph.yaml` and `subgraph/subgraph.base-sepolia.yaml` have a `NexRewardDistributor` datasource at **`0x0000000000000000000000000000000000000000`**. Do not Goldsky-deploy that as-is. Fill the address after the contract is deployed. `subgraph.yaml` (Robinhood) still declares 5-parameter `MintAccessPublished` against shared 6-parameter ABIs — pre-existing, still broken, do not “fix” as a drive-by.
- API (`apps/api/src/server.mjs` only — bundled `api/v1.js` copies were **not** regenerated):
  - Public `GET /v1/editions/:address/rewards` and `GET /v1/passes/:edition/:tokenId/rewards` — must be registered **before** the generic `/v1/editions/` and `/v1/passes/` handlers or the address will swallow `/rewards`.
  - Auth prepare: `/v1/rewards/policies/prepare`, `/v1/rewards/cycles/prepare`, `/v1/rewards/claim`, `/v1/rewards/policies/retire`.
  - `transactionTargets.REWARD_*` all read `NEX_REWARD_DISTRIBUTOR_ADDRESS` (unset ⇒ prepare returns 503 `CONTRACT_CONFIGURATION_REQUIRED`, which is honest).
  - Fund prepare attaches `requiresPriorApproval`: Builder must `approve` `amountPerPass × eligibleSupply` first.
- Domain calldata: `packages/domain/src/transaction-calldata.mjs`.
- Subgraph client: `rewardPolicies`, `rewardClaims` in `packages/subgraph-client/src/index.mjs`. Cycles are labelled `status: 'FUNDED'` by construction.
- Planner: `scripts/plan-v1-deployment.mjs` adds `NexRewardDistributor` **after** `NexTBAResolver` with `(safe, launch, resolver)`. No one-time wiring. Does not change existing CREATE2 salts (per-contract name in the salt). Frozen mainnet reproduction check only asserts the original ten addresses; an 11th is fine. **Do not regenerate** `artifacts/deployment-plan/robinhood-mainnet.json`.

### What the frontend still does

Create-flow reward UI in `public/index.html` is the spec (four channels, sources `royalty/primary/other/manual`, “no share quantity is fixed until a funded drop exists”, delivery always Pass Vault). The dashboard still reads rules from the create payload. That is correct until a Cycle is funded on chain. Nobody has wired the new GET endpoints into the UI.

---

## 7. What is left (honest list)

### Ask Admiano before doing any of these

1. Commit the reward work.
2. Deploy `NexRewardDistributor` to Base Sepolia, fill subgraph datasource + `NEX_REWARD_DISTRIBUTOR_ADDRESS`, redeploy subgraph (Goldsky may still be at the project limit — last time we deleted `1.0.1` and reused the tag).
3. Build S2-02 multi-asset Vault claim (endpoint + tx builder in `v2-app.mjs`, BigInt base units, ERC-721 whole-only, must respect `isVaultLocked()`).

### Not blocked on him

- Strip frontend false attestation `nmVaultClaimAudit()` and `setTimeout` purchase simulation at **lines 15570 / 15568** of the approved UI. `listedVaultLock: true` is now actually true; the percentage-claim claims are still unbacked. The object reports capability rather than measuring it — do not use it as evidence.
- Boot the API against a real `DATABASE_URL`. Still never done. Production guard refuses to boot without it.
- Re-pin `deployments/erc6551.*.json` for the other three networks (planner fails closed there).
- Reconcile Robinhood `subgraph.yaml` 5-param `MintAccessPublished` vs 6-param ABIs.
- Public product journey for §47 explorer hashes — needs ≥48h because `MIN_PREVIEW_DURATION = 1 days`. Deployment txs are already real.

### Governance / product, unchanged

- Safe 1-of-2.
- Mainnet still needs a real `FROZEN_V2_*` re-freeze. No unfrozen path for `base-mainnet`.
- Collectibles / royalty-percentage enforcement / claim expiry: declined by the defaults that were allowed to stand. Do not add them as a surprise.

### Scores (latest, in `NEXMARKETS_BASE_TESTNET_FINAL_STATUS.md`)

| Domain | At original handover | Now |
|---|---:|---:|
| Contracts | 82 | 90 |
| Backend / API | 45 | 56 |
| Indexer | 50 | 66 |
| Frontend integration | 55 | 57 |
| Base Sepolia deployment | 35 | 70 |
| End-to-end product completeness | 40 | 58 |

Still **NOT CERTIFIED**.

---

## 8. How to continue without repeating this session’s mistakes

- PowerShell PATH for forge/cast; never bash `VAR=value` prefixes.
- Commit before `plan-v1-deployment.mjs` so `sourceCommit` is real.
- Simulate the Safe plan on a fork (`scripts/simulate-v1-deployment.mjs`) before broadcast.
- One-time wiring slots cannot be replayed. If a hash mismatches post-deploy, stop.
- `NexPassAccount` must follow `NexListingRegistry`. `NexRewardDistributor` must follow `NexTBAResolver`.
- After any `MintAccessPublished` ABI change, update yaml signature + schema + mapping + ABIs together or the subgraph silently misses events.
- Specific `expectRevert(selector)`, never bare `expectRevert()`.
- Do not load `.env` wholesale into a shell command.
- Push to `main` only when asked; expect a smart-mode approval card.
- Bundled `api/v1.js` / `apps/api/api/v1.js` / `apps/web/api/*.js` are committed copies of `apps/api/src/server.mjs`. Reward routes exist in the source file only. If you need Vercel/API bundles to match, find the esbuild step and regenerate — do not hand-patch five copies unless that is still how address updates are done.
- Graph codegen: `subgraph/generated/` is gitignored. `graph codegen` needs the yaml datasource (hence the zero address). Do not Goldsky-deploy until the real address is filled.

---

## 9. Artifact index

| File | Role |
|---|---|
| `NEXMARKETS_BASE_TESTNET_HANDOVER.md` | Original audit handover, updated in this chat with §0a and rewritten §6–§9 |
| `NEXMARKETS_BASE_TESTNET_DEPLOYMENTS.md` | Live-read addresses (post-redeploy) + superseded table |
| `NEXMARKETS_BASE_TESTNET_GAPS.md` | S1–S4 register. S2-01 is IMPLEMENTED, UNDEPLOYED |
| `NEXMARKETS_BASE_TESTNET_FINAL_STATUS.md` | Verdict and scores |
| `NEXMARKETS_BASE_TESTNET_E2E_CERTIFICATION.md` | 9-step fork journey + Seaport companion |
| `NEXMARKETS_BASE_TESTNET_AUTHORITY_MATRIX.md` | UI capability → authority |
| `packages/contracts/src/NexRewardDistributor.sol` | The new contract |
| `packages/contracts/test/NexRewardDistributor.t.sol` | 23 tests |
| `packages/contracts/test/SeaportFulfillmentFork.t.sol` | Seaport fill (already committed) |
| `scripts/plan-v1-deployment.mjs` | Now plans 11 contracts including the distributor |
| `scripts/simulate-v1-deployment.mjs` | Fork-execute a plan before it costs gas |
| This file | Context for *this* conversation |

Prior chat transcript (tool calls stripped): `C:\Users\USER\.cursor\projects\c-Users-USER-NEXMARKETS-nexmarkets-production\agent-transcripts\c7449199-ab54-47b6-bd1a-9c5e7c2a2938\c7449199-ab54-47b6-bd1a-9c5e7c2a2938.jsonl`

---

## 10. Ground rule

Every test count in this file was produced in this conversation (119 Foundry; 10 Node on the reward-related files). Re-run rather than cite. Do not quietly edit `FROZEN_V1_*`. Do not “fix” republishable Terms. Do not invent a Merkle tree for rewards. Do not deploy or commit the distributor until Admiano answers the question in §0.
