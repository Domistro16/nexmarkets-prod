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

### S2-01 · Reward Policy / Reward Cycle model · FIXED AND DEPLOYED

The missing subsystem now exists at every layer that does not require a live address.

`NexRewardDistributor` publishes a Policy (a rule, no money) and funds a Cycle (an
exact per-Pass amount, escrowed 1:1). Entitlement is keyed to the serial, never to a
wallet: serials are sequential from 1, so eligible set is `1..totalMinted()` at
funding. Claims are permissionless and credit the Pass Vault, so rewards follow the
Pass through sale and can land in a listed Vault without letting the seller drain it.
The listing lock still gates outbound `execute` only.

**Three product decisions, recorded rather than hidden:**

1. **ERC-20 only.** Tokenized stocks, stablecoins and the future-token airdrop share
   this equal-split path. ERC-721 collectible drops are explicitly out of scope —
   unique NFTs cannot be split equally and would need a separate assignment mechanism.
2. **Never reclaimable.** Once funded, escrow belongs to the Passes forever. There is
   no Builder sweep, no claim expiry, and pause never blocks claims.
3. **`allocationBps` is a published commitment, not an enforced mechanism.** "30% of
   Builder royalty" is stored and indexed so the Edition page can show the promise.
   Nothing intercepts `NexRoyaltyVault` to collect it. Do not render the percentage as
   a protocol guarantee. Enforcing it would mean redeploying the royalty and listing
   authorities.

There is no Merkle tree. The brief's own example ("20.5 NVDAc per holder") is an equal
split over sequential IDs, which is just division. A fee-on-transfer or rebasing asset
is rejected at funding so entitlements cannot be silently unbacked.

Covered by `test/NexRewardDistributor.t.sol` (23 tests, including a 256-run fuzz that
every serial receives exactly `amountPerPass` and the distributor ends at zero).
Subgraph entities `RewardPolicy` / `RewardCycle` / `RewardClaim` and API reads
`GET /v1/editions/:address/rewards` and `GET /v1/passes/:edition/:tokenId/rewards`
are wired. Prepare endpoints exist for publish / fund / claim / retire; fund notes
that the Builder must `approve` `amountPerPass × eligibleSupply` first.

**Closed on chain 2026-09-14.** `NexRewardDistributor` is deployed at
`0x2453c5FCef787D076ff21614E54C50344FD1EB91` as the eleventh contract in the
coherent Base Sepolia graph. The Goldsky `1.0.1` datasource was redeployed from block
`46,827,960`, reached Active/100% synced with no indexing errors, and the API/browser
configuration now exposes the live address. The dashboard still needs a funded-cycle
surface; that is a presentation gap, not an absent reward authority.

### S2-02 · Multi-asset Vault claim has no product path · IMPLEMENTED

The UI's per-asset 25/50/75/100% selection now feeds
`POST /v1/vault/claims/prepare`. The API resolves the exact TBA, verifies current
ERC-721 Pass ownership against the authenticated wallet, checks deployed-account code,
calls `isVaultLocked()`, verifies each ERC-20 balance or ERC-721 owner, and emits one
owner-signed TBA `execute` transaction per selected asset. ERC-20 quantities cross the
API boundary only as decimal-free uint256 base-unit strings; ERC-721s are whole-only.

The journey's step 7 partial claim worked only because the test called
`IERC6551Executable.execute()` directly.

If the counterfactual account has not been created, the endpoint first prepares the
permissionless resolver `createAccount` call, then revalidates lock and balances after
confirmation. The browser waits for every receipt and refreshes from authority rather
than mutating a local balance. Contract-level multi-asset journey coverage remains on
the fork; no public Base Sepolia holder claim has yet produced explorer evidence.

### S2-03 · Frontend asserts capabilities it does not measure · CLOSED

`nmVaultClaimAudit()` (approved UI line 15570) returns a hardcoded `supports` object
including `listedVaultLock: true` — false on chain until this session — plus
`perAssetPercentages: [25,50,75,100]` and `mixedPercentages: true`, which have no
backend path.

Line 15568 wraps `completeSelectedMarketPurchase` to locally mutate `ownedPasses`,
copy `listingVault(l)` onto the owned Pass, clear `l.vault`, and re-render via
`setTimeout(apply, 0)` — a client-side simulation of vault transfer on purchase.

**Closed 2026-09-14.** The hardcoded `nmVaultClaimAudit()` attestation and the
`completeSelectedMarketPurchase`/`setTimeout` local Vault transfer mutation were
deleted. The fallback claim handler no longer edits balances or reports success; the
live runtime reports completion only after confirmed wallet transactions.

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
controls pause/unpause and the one-time authority slots on all nine ownable contracts.
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
