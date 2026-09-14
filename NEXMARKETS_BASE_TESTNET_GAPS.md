# NexMarkets — Base Testnet Gap Register

Severity: **S1** protocol-breaking / funds-at-risk · **S2** product promise unbacked ·
**S3** correctness or governance · **S4** hygiene.

Status: **FIXED AND DEPLOYED** = corrected in source, tested, and live on Base Sepolia
as of the 2026-09-14 redeploy. Entries marked **CLOSED**, **WITHDRAWN** or
**NOT A FINDING** record why, including where the original finding was itself wrong.

---

## S1 — Protocol-breaking

### S1-01 · Pass Vault could be drained while listed · FIXED AND DEPLOYED

`NexPassAccount.execute()` was the vanilla ERC-6551 reference account, gated only by
`msg.sender == owner()`. A seller could list Pass #1 holding 400 USDC, wait for a
buyer, drain the Vault in the same block, and settle the sale leaving an empty Pass.
The source comment stated the account holds no listing authority.

The frontend simultaneously advertised `listedVaultLock: true`.

**Fix.** `NexPassAccount` now takes the canonical listing authority as an immutable
constructor argument and exposes `isVaultLocked()`. `execute()`, `isValidSigner()` and
`isValidSignature()` all fail closed while an executable listing exists. Deposits are
never blocked. Expiry, cancel, sale and seller-transfer all auto-release the lock via
`isListingActive`, so a Vault cannot be bricked.

**Required to close:** redeploy `NexPassAccount` **and** `NexTBAResolver`. Note this
changes every Pass Vault address — see S3-01.

**Tests:** `testVaultCannotBeDrainedWhileListed`,
`testListedPassSignatureAuthorityIsAlsoLocked`,
`testExpiredListingDoesNotPermanentlyLockTheVault`,
`testLockFailsClosedWhenListingAuthorityIsUnreadable`, journey step 8.

### S1-02 · Early Access per-wallet allowance unenforceable · FIXED AND DEPLOYED

`NexLaunchRegistry.Terms` had no per-wallet field and `NexMintController` tracked only
a phase total. The brief's own certification case — 500 allocation, max 2 per wallet,
third mint must revert — could not be satisfied. A single allowlisted wallet could take
the entire Early Access allocation in one call, defeating the purpose of an allowlist.

**Fix.** Added `Terms.walletAllowance` and
`allowlistWalletMinted[edition][termsVersionHash][wallet]`. The proven leaf allowance
and any Edition-wide cap both bind; oversized batches cannot straddle the cap.

**Required to close:** redeploy `NexLaunchRegistry` and `NexMintController`.

**Tests:** `testEarlyAccessPerWalletAllowanceIsEnforcedOnChain`,
`testEarlyAccessBatchCannotStraddleTheWalletCap`,
`testFuzzWalletEarlyMintsNeverExceedAllowance` (20,000 runs), journey step 3.

---

## S2 — Product promise unbacked

### S2-01 · Reward Policy / Reward Cycle model · MISSING

Zero occurrences of `RewardPolicy` / `RewardCycle` across `packages/`, `services/`,
`subgraph/schema.graphql` and the contracts. §13 and §14 of the brief are entirely
unimplemented: no policy record, no funded cycle, no snapshot block, no distribution
root, no funding/distribution transaction, no status.

Consequently the product cannot distinguish "30% of Builder Royalty → tokenized-stock
rewards, ongoing" (a rule) from "20.5 NVDAc per holder" (a funded amount) — which is
the exact distinction the brief requires.

**Not fixed in this session, deliberately.** Designing a reward distribution protocol
is a product and economic decision (pull vs push, Merkle distributor vs per-Pass
accrual, snapshot semantics, funding custody, claim expiry). Inventing one unilaterally
would be the wrong call.

**Required to close — proposed shape:**
1. `RewardPolicy` — policy id, edition, source (`BUILDER_ROYALTY` / `EXTERNAL`),
   allocation bps, reward asset, cadence, status.
2. `RewardCycle` — cycle id, policy id, snapshot block, eligible supply, funded amount,
   asset, actual asset amount, distribution root, funding tx, distribution tx, status.
3. A pull-based `NexRewardDistributor` keyed by `(cycleId, tokenId)` with Merkle proof,
   crediting the **Pass Vault (TBA)**, not the current holder wallet — so rewards
   follow the Pass and inherit the listing lock.
4. Subgraph entities + `rewardDeposited` event so the exact-Pass chart can render.
5. Dashboard must surface an asset only once a cycle is `FUNDED`/`CONFIRMED`.

### S2-02 · Multi-asset Vault claim has no product path · MOCKED

The UI advertises per-asset 25/50/75/100% selection, mixed percentages, select-all and
ERC-721 whole-only. There is no claim endpoint in the 38-endpoint API and no claim
transaction builder in `v2-app.mjs`. The only "Vault" flows wired are the Builder
**Royalty** Vault withdrawal and Advantage redemption — different features.

The journey's step 7 partial claim worked only because the test called
`IERC6551Executable.execute()` directly.

**Required to close:** a Vault claim transaction builder that derives the TBA, batches
per-asset transfers with BigInt base-unit math, derives controls from token standard
(no percentages for ERC-721), simulates before signing, and refreshes from chain after
confirmation. Must respect `isVaultLocked()`.

### S2-03 · Frontend asserts capabilities it does not measure · S2

`nmVaultClaimAudit()` (approved UI line 15570) returns a hardcoded `supports` object
including `listedVaultLock: true` — false on chain until this session — plus
`perAssetPercentages: [25,50,75,100]` and `mixedPercentages: true`, which have no
backend path.

Line 15568 wraps `completeSelectedMarketPurchase` to locally mutate `ownedPasses`,
copy `listingVault(l)` onto the owned Pass, clear `l.vault`, and re-render via
`setTimeout(apply, 0)` — a client-side simulation of vault transfer on purchase.

**Required to close:** delete the hardcoded `supports` object or compute each field
from live authority; remove the local purchase mutation in favour of post-confirmation
chain reads.

---

## S3 — Correctness and governance

### S3-01 · Redeploy invalidates every Pass Vault address · S3 · CLOSED

ERC-6551 account addresses derive from the implementation address, so replacing
`NexPassAccount` changed the deterministic TBA for every Pass, and `NexTBAResolver`
pins `implementationRuntimeCodeHash` as an immutable so it was redeployed too.

**Closed by verification, not migration.** The inventory this entry demanded was
performed: a scan of every block since the original deployment found 2 Editions, both
with `totalMinted() == 0`, zero `NexTBAResolver` events, and no balance on the old
implementation. No Pass had ever been minted, so no Vault had ever existed and the
reset cost nothing. This was checked rather than assumed.

### S3-02 · Deployment blocked by frozen-release control · S3 · CLOSED for testnet

`scripts/deployment-source.mjs` still pins `FROZEN_V1_DEPLOYMENT_SOURCE` and
`FROZEN_V1_CREATION_BYTECODE_HASHES`. **Neither was edited.**

The premise of this entry was wrong: that gate is a *mainnet* control.
`plan-v1-deployment.mjs --unfrozen-dev` and
`build-v1-safe-bundles.mjs --allow-unfrozen-testnet` are explicitly scoped to
`base-sepolia` and `robinhood-testnet`, and the previous Base Sepolia deployment had
already used that path — its `deploymentSourceCommit` was `7bb4d1f7…`, not the frozen
commit. The redeploy therefore required no release decision and overrode no control.

**Still open for mainnet.** `base-mainnet` has no unfrozen path, so shipping there
still needs an explicit V2 release decision and a `FROZEN_V2_*` re-freeze.

### S3-03 · Protocol admin Safe is 1-of-2 · S3 · OPEN

Live read: owners `0x7ec76611…` and `0xD83deFbA…`, **threshold 1**. Either key alone
controls pause/unpause and the one-time authority slots on all eight ownable contracts.
`0xD83deFbA…` is also `DEPLOYER_PRIVATE_KEY` in the local plaintext `.env`.

The deployment manifest records `governanceTransition: "RAISE_THRESHOLD_TO_2_PLUS"` as
outstanding. Until then this is effectively single-EOA control and must not be
described as decentralised.

### S3-04 · Terms remain mutable after first mint · S3 · OPEN

`publishTerms` can be called by the publisher at any time, including after minting. It
is constrained only by `activeSupply >= totalMinted` and a forced fresh 1-day Preview.
Already-minted Passes are safe — each snapshots its own `termsVersionHash` — but a
Builder can still change price, royalty, Advantages and allowlist for later minters of
the same Edition.

§6 asks that after first mint "immutable Edition terms must not silently change". The
change is not silent (new version, new hash, restarted Preview), so this is a
**PARTIAL**, not a breach. Confirm it is the intended product rule; if not, gate
`publishTerms` on `totalMinted() == 0` for economic fields.

**Resolved 2026-09-14:** confirmed as the **intended product rule**. Economic Terms stay
republishable after minting begins, because a new version means a new hash and a forced
fresh 1-day Preview, and already-minted Passes snapshot their own terms. No gate added.

### S3-05 · No API rate limiting · S3 · NOT A FINDING (withdrawn)

**This entry was wrong.** Rate limiting is implemented in `apps/api/src/server.mjs`: a
`RateLimiter` class that throws a 429 `RATE_LIMITED`, applied to every request keyed on
remote address, configured at 300 requests per 60,000 ms. It is also covered by a
passing test, "same-origin and rate-limit controls fail closed". §32 is satisfied.

### S3-06 · Seaport fulfilment path unverified · S3 · CLOSED

Closed by `packages/contracts/test/SeaportFulfillmentFork.t.sol` — 5 tests, all passing
against forked Base Sepolia with canonical Seaport 1.6 and canonical USDC.

A restricted order is signed by the seller and fulfilled by Seaport. On a 250 USDC sale
the split is exact: 2.5 protocol fee, 12.5 Builder royalty into `NexRoyaltyVault`,
235 to the seller, summing to the sale price with the buyer debited once. Both zone
callbacks fire (`authorizeOrder` before transfer, `validateOrder` after) and
`recordRoyalty` succeeds inside the same atomic fill — which matters, because the vault
refuses to record a claim it is not already holding the USDC to back. Settlement also
releases the Vault and Advantage locks with no extra transaction, and the 30-day
royalty hold is enforced against early and non-Builder withdrawal.

The load-bearing negative case is a validly signed order whose hash **is** registered as
a listing but whose protocol fee is one base unit short: every other defence is
satisfied, so only `NexMarketsZone` stands in the way, and it reverts
`ConsiderationMismatch`. Negative tests assert specific selectors, because a signature
failure and a zone rejection are different guarantees.

**Not covered:** conduit-based fulfilment (a zero conduit key with direct approvals was
used), partial and advanced order types, `matchOrders`, and buyer-initiated offers.

---

## S4 — Hygiene

### S4-01 · Backend never executed · S4 · PARTIALLY CLOSED

**Indexer: closed.** The subgraph was rebuilt and redeployed against the new address
set and is live, queried and indexing with `hasIndexingErrors: false`. It is no longer
static code reading.

**Backend: still open.** No API server was started and no database was connected, so
every backend claim in the authority matrix remains static code reading. The API's own
unit tests do pass (12/12), but that is not runtime proof against a real store.

### S4-02 · Named frontend authority file absent · S4 · OPEN

`NEXMARKETS_HOMEPAGE_HERO_LOAD_OPTIMIZED_FINAL.html` does not exist. Work proceeded
against `…PASS_TEXT_FIT_UX_FIXED.html` per explicit instruction. Reconcile the naming.

### S4-03 · Secrets · NO FINDING

No private key, RPC secret or database password appears in any tracked file. `.env` is
gitignored and untracked, with no history. No secret is exposed client-side; the
64-hex values in the served bundle are event topic hashes.

The local `.env` does hold a live deployer key and a Supabase password in plaintext —
normal for local dev, but note that key is a threshold-1 Safe owner (S3-03).
