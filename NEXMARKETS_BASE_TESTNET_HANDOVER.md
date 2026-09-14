# NexMarkets Base Testnet Authority Verification — Agent Handover

**Session date:** 2026-09-14
**Repo:** `C:\Users\USER\NEXMARKETS\nexmarkets-production` (git remote `Domistro16/nexmarkets-prod`, branch `main`)
**Status at handover:** audit + contract fixes complete and tested; deployment blocked pending a human decision.
**Status now (updated 2026-09-14, later session):** **deployed, wired, verified, and pushed.**

Read this top to bottom before touching anything.

---

## 0a. UPDATE — what changed after this handover was written

Both open decisions in §9 were resolved, and **neither turned out to be a real blocker.**

| Handover claim | Reality |
|---|---|
| Deployment blocked on a V2 re-freeze (§6) | Wrong for testnet. The frozen gate is a *mainnet* control; `--unfrozen-dev` + `--allow-unfrozen-testnet` are sanctioned, and the previous deployment already used them. `FROZEN_V1_*` was **never edited**. |
| Pass Vault migration needed (§6) | Nothing to migrate. Zero Passes had ever been minted, so zero Vaults ever existed. Verified by full block scan, not assumed. |
| Seaport fulfilment untested (§7, option B) | Closed. 5 passing tests fulfil a real signed Seaport 1.6 order. |
| API rate limiting absent (§7) | Wrong. It exists: 300 requests / 60 s, with a passing test. |

**What actually blocked deployment** was two tooling defects the handover did not know
about — the planner encoded no constructor arguments for the new `NexPassAccount`, and
the `NexTBAResolver` codehash pin was stale. Both would have reverted on chain while
the planner reported `PASS`. Both are fixed; see §6.

**Commits:** `e53f5d9` (contract fixes + tooling), `1b8774b` (address propagation),
`f7beb70` (Seaport tests). All pushed to `origin/main`.

**Test state now:** 96 passed / 11 suites / 0 failed.

Sections §6, §7 and §9 below have been rewritten. §1–§5 are preserved as the original
record.

---

## 0. Environment gotchas — read first, these will waste your time otherwise

| Thing | Detail |
|---|---|
| **Foundry** | Installed at `C:/Users/USER/.foundry/bin` (forge/cast/anvil/chisel 1.8.1). **Not on PATH.** Every command needs `export PATH="$PATH:/c/Users/USER/.foundry/bin"` first. |
| **foundryup is broken here** | Its attestation download 504s from GitHub. Foundry was installed by downloading `foundry_v1.8.1_win32_amd64.zip` directly and verifying `sha256 = 02d98fc2c573793960ee06b7f642487d483fe30572f7e248804c207334a418d8` against the official `.sha256`. Don't retry foundryup. |
| **`dist/` is gitignored** | The `read`/`edit` tools **refuse** to open anything under `dist/`. `public/` has byte-identical copies of `v2-app.mjs`, `config.json`, `index.html` etc. Use `public/`, or shell out with `sed`/`awk`. |
| **Home dir is a git repo** | `C:\Users\USER` itself is a git repo, so `git status` from the wrong cwd spews unrelated noise and permission warnings. Always `cd` into `nexmarkets-production`. |
| **`packages/contracts/lib`** | gitignored but present locally (`forge-std`, `openzeppelin-contracts`). Don't re-init submodules. |
| **Full test suite is slow** | ~5 minutes, dominated by two 20,000-run fuzz invariants. Use `--match-path` while iterating. |
| **`vm.prank` consumption** | This bit the work twice. `vm.prank(x); foo.bar(registry.baz())` — the **nested** `registry.baz()` consumes the prank and `foo.bar` runs as the test contract. Hoist every nested call above the prank. |
| **Fork test skips silently** | `BaseSepoliaCertificationJourney.t.sol` returns early and trivially "passes" if `BASE_SEPOLIA_RPC_URL` is unset. It is only meaningful when that env var is set. |
| **Network works** | `https://sepolia.base.org` is reachable from this machine. Base Sepolia chain id `84532`. |

---

## 1. Decisions the user already made (do not relitigate)

Asked as a 4-part question at session start; answers were:

1. **Frontend authority** = `NEXMARKETS_HOMEPAGE_DISCOVER_MARKET_COLLECTIBLE_ROTATION_PASS_TEXT_FIT_UX_FIXED.html`
   `sha256 4109892076bb332b8a882dc3226f22a9c45bd99a5cb906b05baf6a57bbf55e23`
   (The file named in the original brief, `NEXMARKETS_HOMEPAGE_HERO_LOAD_OPTIMIZED_FINAL.html`, **does not exist** anywhere in the workspace.)
2. **Contract fixes** = "Fix, test, and redeploy to Sepolia" — fixes and tests are done; redeploy is blocked, see §6.
3. **E2E method** = Anvil/forge fork with time-warp (not a 48h public run).
4. **Funding** = "deploy a mock USDC". **Deliberately improved on:** on a fork it is strictly better to `deal` balances of the *canonical* USDC, which is what was done — this honours brief §25 (no silent fake settlement token) with the same convenience. Mock ERC-20s were deployed **only** for reward assets that genuinely don't exist on Base Sepolia (NVDAc, NEX, OP) plus one ERC-721. Flag this to the user if it matters.

---

## 2. What the system actually is

Not vapor. Verified live on Base Sepolia at block ~46.81M:

- 10 deployed contracts, all with real bytecode, all one-time wiring slots consumed.
- Canonical Seaport 1.6, canonical ERC-6551 Registry, canonical Base Sepolia USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6dp).
- Real 38-endpoint `/v1` API (`apps/api/src/server.mjs`, 1200 lines) with a Postgres store and a `DATABASE_URL_REQUIRED_FOR_PRODUCTION` guard.
- Real integration layer: `public/v2-app.mjs` (232 KB) calls **28 distinct endpoints**.
- Goldsky subgraph `nexmarkets-v1-base-sepolia/1.0.1`, 14 entities, start block 46,598,681. *(Redeployed under the same tag from block 46,818,316 — see §0a.)*
- Indexer with correct design: deterministic `chainId:txHash:logIndex` event identity, `orphaned_at` reorg marking, finality watermarks (`services/indexer/src/runtime.mjs`, `projector.mjs`).

**Architecture note that confuses people:** the approved UI snapshot is a self-contained
demo app with global state arrays. `dist/index.html` = that exact snapshot **plus**
additive integration (`nm-v2-data-bridge.js` + `v2-app.mjs`), which overwrites those
global arrays with API data via `window.__nmV2SetData`. `__NEXMARKETS_FIXTURE_MODE__` is
`false` in the served build. Full diff confirmed **no UI regression**.

Addresses, admin, and wiring: see `NEXMARKETS_BASE_TESTNET_DEPLOYMENTS.md`.

---

## 3. Defects found

### Fixed in source this session

**S1-01 — Pass Vault drainable while listed (CRITICAL).**
`NexPassAccount` was the vanilla ERC-6551 reference account; `execute()` gated only by
`msg.sender == owner()`. Its own comment said it holds no listing authority. A seller
could list a Pass holding 400 USDC, let a buyer commit, drain the TBA, and settle —
handing over an empty Vault. The frontend simultaneously hardcoded `listedVaultLock: true`.

**S1-02 — Early Access per-wallet allowance unenforceable (CRITICAL).**
`NexLaunchRegistry.Terms` had no per-wallet field; `NexMintController` tracked only a
phase total (`allowlistMinted[edition][termsHash]`). The brief's certification case
(500 allocation, max 2/wallet, third mint reverts) was impossible. One wallet could take
the whole allocation in a single call.

**S1-03 — Merkle leaf bound wallet only (HIGH).**
Was `keccak256(bytes.concat(keccak256(abi.encode(account))))`. No edition, no chain, no
allowance → proofs replayable across Editions sharing a root.

### Not fixed

**S2-01 — Reward Policy / Reward Cycle model: IMPLEMENTED, UNDEPLOYED.** See §7.
`NexRewardDistributor` separates Policy (a rule) from Cycle (funded money), credits
the Pass Vault, and is covered by 23 passing tests. Not on Base Sepolia yet.

**S2-02 — Multi-asset Vault claim: MOCKED.** UI advertises per-asset 25/50/75/100%,
mixed percentages, select-all, ERC-721 whole-only. No claim endpoint exists in the 38,
no claim tx builder in `v2-app.mjs`. The only wired "Vault" flows are the Builder
**Royalty** Vault withdrawal and Advantage redemption — different features.

**S2-03 — Frontend asserts capability it doesn't measure.** In the approved UI:
- line **15570**: `nmVaultClaimAudit()` returns a hardcoded `supports` object including
  `listedVaultLock:true` (false on chain until this session), `perAssetPercentages:[25,50,75,100]`,
  `mixedPercentages:true` — none backed.
- line **15568**: wraps `completeSelectedMarketPurchase` to locally mutate `ownedPasses`,
  copy `listingVault(l)` onto the owned Pass, clear `l.vault`, re-render via `setTimeout(apply,0)`
  — a client-side simulation of vault transfer on purchase.

Full severity-ranked register: `NEXMARKETS_BASE_TESTNET_GAPS.md`.

---

## 4. Exactly what was changed

| File | Change |
|---|---|
| `packages/contracts/src/erc6551/NexPassAccount.sol` | Added `INexPassVaultListingLock` iface + immutable `listingRegistry` ctor arg. New `isVaultLocked()`. `execute()`, `isValidSigner()`, `isValidSignature()` all fail closed while an executable listing exists. Deposits never blocked. Auto-releases on cancel/sale/expiry/seller-transfer. Does **not** brick if the oracle is unreadable. |
| `packages/contracts/src/NexLaunchRegistry.sol` | `Terms` gains `uint256 walletAllowance` (after `allowlistSupply`). `MintAccessPublished` gains the field. `_validateTerms` enforces `walletAllowance == 0` when no allowlist, and `<= activeSupply` otherwise. |
| `packages/contracts/src/NexMintController.sol` | New `allowlistWalletMinted[edition][termsHash][wallet]`. `mintAllowlisted` signature is now `(request, allowance, proof)`. New errors `WalletAllowanceExceeded`, `WalletAllowanceRequired`. `allowlistLeaf(edition, account, allowance)` now binds `block.chainid, address(this), edition, account, allowance`. New view `allowlistRemaining(...)`. |
| `packages/contracts/test/*.t.sol` (5 files) | Added `walletAllowance: 0` to Terms literals; updated `mintAllowlisted` / `allowlistLeaf` / `new NexPassAccount(...)` call sites. Added `TBAListingLockMock` to `NexTBAResolver.t.sol`. |
| `packages/contracts/test/EarlyAccessAndVaultLock.t.sol` | **NEW** — 15 tests. |
| `packages/contracts/test/BaseSepoliaCertificationJourney.t.sol` | **NEW** — the 9-step fork journey. |

**Nothing outside `packages/contracts/` was modified.** No frontend, backend, indexer,
config or deployment file was touched.

---

## 5. Test state (all fresh runs, nothing cited from history)

| | |
|---|---|
| Baseline before fixes | **75 passed** / 8 suites |
| After fixes | **91 passed** / 10 suites, **0 failed** |
| Fuzz invariants | 2 × 20,000 runs |

```bash
export PATH="$PATH:/c/Users/USER/.foundry/bin"
cd packages/contracts
forge test --summary

# The fork journey (only meaningful with the env var):
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
  forge test --match-path test/BaseSepoliaCertificationJourney.t.sol -vv
```

Fork journey result: **9/9 steps PASS** against real Base Sepolia state (fork block
46,816,862). Proven: Bob's 3rd mint reverts `WalletAllowanceExceeded`; Charlie rejected
calling the contract directly; public mint opens on time with no Builder tx and unused
allocation rolls over; 10 credits → consume 3 → **7 remain**, and 7 arrive with the buyer;
5-asset Vault partial-claims to exactly +400 USDC / +5 NVDAc leaving 15 NVDAc; draining a
listed Vault reverts; seller locked out after transfer.

**Limits of that run — do not overstate it.** It was a fork, so **no public tx hashes**
(brief §47 unsatisfied). **No Seaport order was ever fulfilled** — ownership moved via
`cancelListing` + `transferFrom`. Backend and indexer were never in the loop. Step 7
called `execute()` directly because no product claim path exists.

Details: `NEXMARKETS_BASE_TESTNET_E2E_CERTIFICATION.md`.

---

## 6. How deployment actually happened (rewritten)

The redeploy is **done**. 10 deployments at blocks 46,818,316–46,818,334 and 6 wiring
calls at 46,818,356–46,818,364, all `EXECUTED_VERIFIED`, cost ~0.00011 ETH.

**`FROZEN_V1_*` was never edited.** The original advice — don't quietly edit it — was
right, but the conclusion that it blocked the testnet was not. That gate is a mainnet
control: `plan-v1-deployment.mjs --unfrozen-dev` and
`build-v1-safe-bundles.mjs --allow-unfrozen-testnet` are explicitly scoped to
`base-sepolia` and `robinhood-testnet`, and the live deployment this audit examined had
already been made that way (`deploymentSourceCommit: 7bb4d1f7…`, not the frozen commit).

**The Pass Vault migration question dissolved.** A scan of every block since the
original deployment found 2 Editions, both `totalMinted() == 0`, zero resolver events,
and no balance on the old implementation. No Pass had ever been minted, so no Vault had
ever existed. Checked, not assumed.

### The two defects that actually blocked it

Neither was known when this handover was written. Both would have reverted on chain,
and `plan-v1-deployment.mjs` printed `PASS` while emitting the broken plan.

1. **`NexPassAccount` constructor argument.** The fix gave it an immutable
   `listingRegistry`, but the planner still called `add('NexPassAccount', …, [], [])`.
   The tell is `initCodeHash == creationBytecodeHash` — no arguments encoded. The
   constructor would have reverted `ListingRegistryRequired`.
2. **Stale `NexTBAResolver` codehash pin.** That immutable makes the account's runtime
   codehash depend on the deployed listing registry address, so it is network-specific
   and cannot be read from the build artifact. The pin in
   `deployments/erc6551.base-sepolia.json` was stale and the resolver constructor would
   have reverted `InvalidCodeHash`. The planner now materializes the immutable to derive
   the pin and **fails closed** on mismatch.

`scripts/simulate-v1-deployment.mjs` was added: it executes a generated plan against a
fork as the Safe, checks every runtime codehash, and runs the wiring — before any of it
costs gas or consumes the one-time slots, which cannot be replayed. Use it.

**Deploy order still matters:** `NexPassAccount` must follow `NexListingRegistry`. The
planner already orders them correctly.

### Gotchas worth inheriting

- **The salt embeds `sourceCommit`, which is `HEAD`** — not the working tree. Planning
  from a dirty tree yields addresses labelled with a commit that lacks your changes.
  Commit first. (This is why the fixes were committed before planning.)
- Re-pinning is circular if you fight it: commit code → plan → read the expected hash
  from the `TBA_ACCOUNT_RUNTIME_PIN_STALE` error → update the JSON → re-plan. The JSON
  is not part of the provenance-tracked source set, so this is safe.
- **The shell here is PowerShell.** The `export PATH=…` recipe in §0 is bash and will
  not work. Use `$env:PATH += ";C:\Users\USER\.foundry\bin"`.

---

## 7. What is left

### Blocked on the user

1. ~~**Reward model design**~~ — **built 2026-09-14.** `NexRewardDistributor` is in
   source, tested (23/23), indexed, and exposed on the API. It is **not deployed**.
   The remaining decision is whether to deploy it onto Base Sepolia as an 11th
   protocol contract (planner already includes it; `FROZEN_V1_*` still untouched).
   ERC-721 collectibles, royalty-percentage enforcement, and claim expiry were
   explicitly declined by the defaults you allowed to stand.

*(The V2 release decision is resolved for testnet — see §6. It returns only for mainnet.)*

### Build work

| Item | Sev | State |
|---|---|---|
| Reward Policy + Reward Cycle (contracts, API, subgraph entities) | S2 | **IMPLEMENTED, UNDEPLOYED** — `NexRewardDistributor` + subgraph entities + read/prepare endpoints. Dashboard still needs to render funded cycles. Collectibles out of scope. |
| Multi-asset Vault claim path (endpoint + tx builder, BigInt base units, standard-derived controls, must respect `isVaultLocked()`) | S2 | MOCKED — largest remaining buildable item needing no decision |
| Remove frontend false attestation + `setTimeout` purchase simulation (lines 15570 / 15568) | S2 | Located, untouched. `listedVaultLock: true` is now genuinely true; the rest are not |
| ~~API rate limiting~~ | ~~S3~~ | **Withdrawn — it exists.** 300 req / 60 s in `server.mjs`, with a passing test |

### Verification debt

- ~~**Seaport fulfilment never tested.**~~ **Closed** by `test/SeaportFulfillmentFork.t.sol`, 5 passing tests: a real signed restricted order fulfilled through canonical Seaport 1.6, with exact fee/royalty/seller splits, both zone callbacks, royalty accrual inside the atomic fill, lock release on settlement, and the 30-day hold enforced. Not covered: conduit fulfilment, partial/advanced orders, `matchOrders`, buyer offers.
- **Backend never executed.** No server started, no DB connected. Backend claims in the authority matrix remain static code reading. *(The indexer is now live and indexing cleanly — that half is closed.)*
- **Public Sepolia product journey** for real tx hashes (§47) — still needs ≥48h wall clock because `MIN_PREVIEW_DURATION` is a hardcoded `1 days` and `previewStartsAt >= block.timestamp`. The deployment half of §47 is now satisfied with real explorer transactions.
- **Brief sections inventoried but not exercised:** §9 Discover wallet checker, §10 launch-state agreement across pages, §26 tokenURI/metadata, §27 random assignment determinism, §29 exact-Pass history events, §30 collection chart from indexed events, §31 Builder profile, §32 per-endpoint auth probing, §41 page-by-page responsive/empty/error states, §45 performance.

### Housekeeping introduced by the redeploy

- `deployments/erc6551.*.json` pins for the other three networks are now stale; the planner fails closed there until re-pinned.
- `subgraph/subgraph.yaml` (robinhood-testnet) still declares the 5-parameter `MintAccessPublished` while sharing the regenerated 6-parameter ABIs, so it will not rebuild until reconciled.
- `NexRewardDistributor` is in the planner as an 11th contract. The subgraph datasource currently points at the zero address until that deploy fills it.

### Governance

- **Safe is 1-of-2** (owners `0x7ec76611…`, `0xD83deFbA…`; threshold **1**) — effectively single-key control of all 8 ownable contracts. `0xD83deFbA…` is also `DEPLOYER_PRIVATE_KEY` in plaintext local `.env`. Manifest flags `RAISE_THRESHOLD_TO_2_PLUS` as outstanding. **Do not describe this deployment as decentralised.**
- ~~**Terms remain republishable after first mint**~~ — **resolved 2026-09-14: confirmed as the intended product rule.** A new version means a new hash and a forced fresh 1-day Preview, and minted Passes snapshot their own terms. No `totalMinted() == 0` gate was added. Do not "fix" this.

### Secrets — no finding

No private key, RPC secret or DB password in any tracked file. `.env` gitignored and
untracked, no history. Nothing exposed client-side (the 64-hex values in the bundle are
event topic hashes).

---

## 8. Scores

| Domain | At handover | Now |
|---|---:|---:|
| Contracts | 82/100 | **90/100** |
| Backend / API | 45/100 | **56/100** |
| Indexer | 50/100 | **66/100** |
| Frontend integration | 55/100 | **57/100** |
| Base Sepolia deployment | 35/100 | **70/100** |
| **End-to-end product completeness** | **40/100** | **58/100** |

Verdict: still **NOT CERTIFIED**, but no longer for the original reason. Both S1
defects are closed on chain. Certification is now withheld for product completeness —
rewards missing, Vault claim mocked, backend unexecuted, admin effectively one key.
Reasoning per domain is in `NEXMARKETS_BASE_TESTNET_FINAL_STATUS.md`.

---

## 9. THE OPEN QUESTION — user has not answered this

Verbatim, the question put to the user at the end of the session:

> The highest-leverage next step is the V2 decision, since it unblocks deployment *and*
> the public Sepolia run that produces your explorer evidence.
>
> If you want me to keep moving without that decision, the best-value independent work is
> the **Seaport fulfilment fork test** — it's the largest unverified money path in the
> system and needs no deployment.
>
> **Which do you want?**

Three live options:

| Option | Needs user input? | Unblocks | Outcome |
|---|---|---|---|
| **A. V2 re-freeze + Sepolia redeploy** | **Yes** — release decision + TBA migration plan | Deployment, public tx evidence, closes both S1s for real | ✅ **DONE.** Needed neither a re-freeze nor a migration; see §6 |
| **B. Seaport fulfilment fork test** | No | Closes S3-06, the biggest unverified money path | ✅ **DONE.** 5 passing tests |
| **C. Reward model design doc** | **Yes** — product/economic decisions | Unblocks the largest missing subsystem (S2-01) | ✅ **DONE.** Built as `NexRewardDistributor` rather than a doc; ERC-20 equal-split into the Pass Vault, never reclaimable, allocation % is a published commitment. **Not deployed.** |

The original A/B/C question is closed. The highest-leverage remaining work is **deploy
the distributor** (if you want rewards live on Base Sepolia) or **S2-02, the multi-asset
Vault claim path**, which still needs no decision.

---

## 10. Artifact index

| File | Contents |
|---|---|
| `NEXMARKETS_BASE_TESTNET_AUTHORITY_MATRIX.md` | Every UI capability → backend/contract/indexer authority, with VERIFIED / IMPLEMENTED-BUT-UNVERIFIED / PARTIAL / MOCKED / MISSING labels |
| `NEXMARKETS_BASE_TESTNET_DEPLOYMENTS.md` | Live-read addresses (**post-redeploy**), bytecode sizes, admin, wiring, superseded address table |
| `NEXMARKETS_BASE_TESTNET_E2E_CERTIFICATION.md` | The 9-step journey with explicit "what this does NOT prove" |
| `NEXMARKETS_BASE_TESTNET_GAPS.md` | Severity-ranked gaps (S1–S4) with exact required fixes |
| `NEXMARKETS_BASE_TESTNET_FINAL_STATUS.md` | Executive verdict and scores |
| `NEXMARKETS_BASE_TESTNET_HANDOVER.md` | This document |

**Ground rule for whoever picks this up:** every number in these artifacts was produced
in this session. No historical test count, CI result or prior certification was reused as
evidence. Keep it that way — re-run rather than cite.
