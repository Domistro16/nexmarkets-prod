# NexMarkets — Alice / Bob / Charlie Certification Journey

## Execution environment — read this first

This journey was executed as a **forked-chain certification**, per the approved plan.

| Property | Value |
|---|---|
| Method | `forge test --fork-url https://sepolia.base.org` |
| Fork source | Real Base Sepolia state |
| Chain ID asserted in test | `84532` |
| Fork block | `46,816,862` |
| Settlement token | **Canonical** Base Sepolia USDC `0x036CbD53…f3dCF7e` |
| ERC-6551 Registry | **Canonical** `0x000000006551…775758` |
| Seaport 1.6 | **Canonical** `0x00000000…eB395` |
| Result | **PASS** — all 9 steps |
| File | `packages/contracts/test/BaseSepoliaCertificationJourney.t.sol` |

### Why a fork, and what that costs in evidence

`NexLaunchRegistry.MIN_PREVIEW_DURATION` is a hardcoded `1 days`, and
`previewStartsAt` must be `>= block.timestamp`. Publish → 24 h Preview → 24 h Early
Access → Public is therefore a **≥48 hour wall-clock sequence** that cannot be
compressed on a live public testnet. A fork with `vm.warp` is the only way to exercise
it in a single run.

**Consequence: there are no public Base Sepolia transaction hashes or explorer links
for this journey.** Contract logic, state transitions and economics are proven against
real chain state; public on-chain settlement evidence is not. Section 47 of the brief
therefore cannot be satisfied by this run.

A deliberately empty `BASE_SEPOLIA_RPC_URL` makes the test skip, so it does not fail
in environments without network access.

### Actors

| Actor | Role | Funding |
|---|---|---|
| Alice `makeAddr("alice-builder")` | Builder | 100,000 USDC dealt on fork |
| Bob `makeAddr("bob-holder")` | Eligible holder | 100,000 USDC dealt on fork |
| Charlie `makeAddr("charlie-outsider")` | Ineligible wallet, then secondary buyer | 100,000 USDC dealt on fork |

Three distinct wallets were used precisely so permission bugs cannot hide.

> Note on the funding decision: the approved plan said "deploy a mock USDC". On a fork
> it is strictly better to `deal` balances of the **canonical** USDC contract, which is
> what was done. This honours §25 (no silent fake settlement token) while giving the
> same funding convenience. Mock ERC-20s were deployed **only** for reward assets that
> genuinely do not exist on Base Sepolia (NVDAc, NEX, OP) plus one ERC-721 collectible.

### Edition under test

| Field | Value |
|---|---|
| Name | Baldies |
| Supply | 2,000 |
| Price | 5 USDC |
| Builder Royalty | 500 bps (5%, the protocol maximum) |
| Early Access | 24 h, allowlist-gated, 500 allocation, 2 per wallet |
| Advantages | 10 credits (QuantityBased) |
| Pass Vault | Enabled via ERC-6551 |

---

## Step 1 — Publish and Preview ✅

```
[1] Published Baldies. Preview open.
termsVersionHash: 0x69e7a01d6f6bc0672a52ef8425e67756420686816aa88180b79c708e911b3b65
```

Asserted: `isPreviewOpen == true`; `isMintOpen`, `isAllowlistMintOpen`,
`isPublicMintOpen` all `false`. Active terms echo supply 2000, price 5 USDC,
`walletAllowance` 2, `allowlistSupply` 500, royalty 500 bps.

## Step 2 — Preview window is closed to everyone ✅

At `mintStartsAt - 1`, even an allowlisted wallet with a valid proof reverts
`MintClosed`. Preview is not a soft state.

## Step 3 — Early Access ✅ (contains the primary fix)

| Action | Expected | Result |
|---|---|---|
| Charlie `mintAllowlisted` (not on list) | revert | `NotAllowlisted` ✅ |
| Charlie `mint` (public entrypoint) | revert | `MintClosed` ✅ |
| Bob mint #1 | serial 1 | ✅ |
| Bob mint #2 | serial 2 | ✅ |
| **Bob mint #3** | **revert** | **`WalletAllowanceExceeded`** ✅ |

Post-state: `allowlistWalletMinted[Bob] == 2`, `allowlistMinted == 2`,
`totalMinted == 2`.

Exact settlement asserted on canonical USDC: 10 USDC paid, 0.5 USDC (5%) to the
protocol fee recipient, 9.5 USDC to Alice.

> **This step failed by construction before this session.** The pre-fix
> `NexMintController` had no per-wallet counter and `Terms` had no allowance field, so
> Bob could have minted the entire 500 allocation in a single call.

## Step 4 — Public Mint opens automatically ✅

```
[4] Public Mint opened automatically. Unused allocation rolled over.
```

At `allowlistEndsAt`: `isAllowlistMintOpen == false`, `isPublicMintOpen == true`,
with **no Builder transaction**. Only 2 of the 500 Early Access allocation were used;
remaining public supply asserted as `2000 - 2 = 1998`, confirming the unused 498 are
not stranded. Charlie then mints serial 3.

## Step 5 — Advantage consumption ✅

| State | Value |
|---|---|
| Pass #1 initial credits | 10 |
| Consume | 3 |
| **Remaining** | **7** |
| Replay same `useId` | no double-spend, still 7 ✅ |

## Step 6 — Multi-asset Pass Vault ✅

TBA derived deterministically from the canonical ERC-6551 registry;
`tbaResolver.account(...) == createAccount(...)`; `owner() == Bob`.

Funded with **five distinct assets**, disproving any two-slot array shape:

| Asset | Amount |
|---|---|
| USDC | 400 |
| NVDAc | 20 |
| NEX | 800 |
| OP | 50 |
| ERC-721 collectible | 1 (id 7) |

## Step 7 — Partial multi-asset claim ✅

Selection: USDC **100%**, NVDAc **25%**. All arithmetic in base units, no floating point.

| | Before | Claimed | After |
|---|---|---|---|
| USDC | 400 | **400** | 0 |
| NVDAc | 20 | **5** | **15** |
| NEX | 800 | 0 | 800 |
| OP | 50 | 0 | 50 |
| Collectible | 1 | 0 | 1 |

Bob's wallet received exactly +400 USDC and +5 NVDAc. No other balance changed.

## Step 8 — Listing lock ✅ (contains the critical fix)

Bob lists Pass #1 at 250 USDC for 7 days. `isListingActive == true`.

| Attempt while listed | Result |
|---|---|
| `isVaultLocked()` | `true` ✅ |
| Withdraw 800 NEX from Vault | **revert `PassVaultLockedWhileListed`** ✅ |
| Withdraw the ERC-721 collectible | **revert `PassVaultLockedWhileListed`** ✅ |
| `advantageRegistry.isListed` | `true` ✅ |
| `advantageRegistry.isUsable` | `false` (credits frozen) ✅ |

Vault balances unchanged: 15 NVDAc, 800 NEX, 50 OP, 1 collectible.

> **This is the defect that made the product unsafe.** Before this session
> `NexPassAccount.execute()` was gated only by `msg.sender == owner()`. A seller could
> empty a listed Pass and hand the buyer an empty Vault.

## Step 9 — Secondary transfer ✅

Listing cancelled → lock released (`isVaultLocked() == false`). Pass #1 transferred
Bob → Charlie.

| Invariant | Result |
|---|---|
| Buyer owns Pass #1 | ✅ |
| Vault address unchanged | ✅ |
| 15 NVDAc retained | ✅ |
| 800 NEX retained | ✅ |
| 50 OP retained | ✅ |
| Collectible retained | ✅ |
| **7 credits retained** (not 10, not 0) | ✅ |
| New owner controls TBA | ✅ |
| Seller `execute()` | revert `InvalidSigner` ✅ |
| Buyer claims 800 NEX | ✅ |

---

## What this journey does NOT prove

Stated plainly, because these gaps matter:

1. ~~**No real Seaport fulfilment.**~~ **Superseded.** *This* journey still moves
   ownership via `cancelListing` + `transferFrom`, but the gap it described is closed by
   a separate suite — see "Companion: Seaport fulfilment" below.
2. **No public transaction hashes.** Fork execution produces no explorer evidence.
3. **The backend was never in the loop.** No API call and no database write was
   exercised. This is a pure contract-authority certification. *(The subgraph has since
   been deployed and queried, but not as part of this journey.)*
4. **Rewards were not tested in this journey.** The Reward Policy / Reward Cycle model
   now exists and is deployed/indexed, but this older fork journey predates it.
5. **Vault claim went direct to the TBA.** The API/browser product path now exists, but
   step 7 predates it and called `execute()` directly, so this journey is not evidence
   for the HTTP/wallet orchestration.
6. ~~**The tested contracts are not the deployed contracts.**~~ **No longer true.** The
   fixed source in this journey was deployed to Base Sepolia on 2026-09-14. The
   addresses in `NEXMARKETS_BASE_TESTNET_DEPLOYMENTS.md` now host this bytecode.

## Companion: Seaport fulfilment — PASS (5/5)

`packages/contracts/test/SeaportFulfillmentFork.t.sol` closes limitation 1, against the
same forked Base Sepolia state with canonical Seaport 1.6 and canonical USDC.

A seller signs an EIP-712 restricted order; Seaport fulfils it. On a 250 USDC sale the
settlement is exact and atomic: 2.5 protocol fee, 12.5 Builder royalty into
`NexRoyaltyVault`, 235 to the seller, buyer debited exactly once. Both zone callbacks
fire — `authorizeOrder` before transfer and `validateOrder` after — and `recordRoyalty`
succeeds within the same fill, which is the ordering that matters, because the vault
refuses to record a claim it is not already holding the USDC to back. Settlement also
releases the Vault and Advantage locks with no additional transaction, and the 30-day
royalty hold is enforced against both early withdrawal and non-Builder callers.

The decisive negative case is an order that is validly signed **and** registered as a
listing, but underpays the protocol fee by one base unit. Every other defence is
satisfied, so only `NexMarketsZone` can stop it — and it reverts `ConsiderationMismatch`.
Negative tests assert specific selectors rather than bare reverts, since a signature
failure and a zone rejection are different guarantees and a bare `expectRevert` would
conflate them.

**Still not covered:** conduit-based fulfilment (the test uses a zero conduit key with
direct approvals), partial and advanced order types, `matchOrders`, and buyer-initiated
offers.

## Reproduce

```bash
cd packages/contracts
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
  forge test --match-path test/BaseSepoliaCertificationJourney.t.sol -vv

# companion Seaport fulfilment suite
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
  forge test --match-path test/SeaportFulfillmentFork.t.sol -vv
```

On PowerShell, `$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"` first; the
inline `VAR=value` form is bash-only and will not work here.
