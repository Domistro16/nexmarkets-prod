# NexMarkets — Base Testnet Certification: Final Status

## Verdict

**NOT CERTIFIED for Base Sepolia — but no longer for the original reason.**

Both S1 defects are now closed **on chain**. The fixed contracts were deployed and
wired on 2026-09-14 and verified by live read, so a seller can no longer drain a listed
Pass Vault and the Early Access per-wallet cap is enforceable. Secondary settlement
through canonical Seaport 1.6 has since been fulfilled and verified end to end.

Certification is still withheld for operational and end-to-end completeness, not
contract safety: the API has not been booted against the production database, no public
mint-through-secondary-sale journey exists, reward/Vault dashboard discovery remains
partial, and protocol admin remains effectively one key.

## What is genuine

- A real, fully wired 11-contract deployment on Base Sepolia, all with live bytecode,
  all one-time authority slots consumed, canonical Seaport 1.6 / ERC-6551 / USDC.
- Canonical settlement in real Base Sepolia USDC. No silent fake token.
- A real 39-endpoint API with a Postgres store, session + CSRF, and a production guard
  that refuses to boot without `DATABASE_URL`.
- A real integration layer: `v2-app.mjs` calls 28 distinct endpoints. This is not a
  demo pretending to be wired.
- An indexer whose design is correct: deterministic `chainId:txHash:logIndex` event
  identity, orphan marking, finality watermarks.
- Advantage accounting that genuinely survives transfer — 10 credits, consume 3,
  7 remain, and 7 arrive with the buyer.
- ERC-6551 Pass Vaults that genuinely follow the Pass across transfer, with the old
  owner correctly locked out.
- The approved UI is intact. The served build is a strict superset with no regression.

## What is not

- Reward cycles are live at the protocol/indexer/API layers, but the dashboard does not
  yet discover and render funded cycles. Collectibles remain out of reward scope and
  `allocationBps` is a published commitment, not an enforced royalty split.
- Multi-asset Vault claiming has a validated API and wallet transaction path, but no
  indexed arbitrary-token inventory. Claim rows must carry real token contract addresses,
  and no public Base Sepolia holder claim has been executed as certification evidence.
- The backend server was never booted against a database. (The indexer *is* now running:
  the subgraph was redeployed against the new addresses and is indexing with no errors.)
- No public **product** journey — mint through secondary sale — has run on public Base
  Sepolia. The deployment and wiring transactions are real and on explorer; the product
  journey still needs ~48 h because `MIN_PREVIEW_DURATION` is a hardcoded `1 days`.
- Protocol admin is a 1-of-2 Safe — effectively one key.

## Work completed

| | |
|---|---|
| Foundry 1.8.1 installed | sha256-verified against the official release |
| Baseline suite | **75 passed** / 8 suites (fresh run, not cited) |
| Contract fixes | 3 defects across 3 contracts |
| Final suite | **119 passed** / 12 suites, 0 failed |
| New fuzz invariants | 2 × 20,000 runs |
| Fork certification journey | **9/9 steps PASS** against real Base Sepolia state |
| Base Sepolia reward redeploy | 11 deployments + 6 wiring calls, all `EXECUTED_VERIFIED` |
| Seaport 1.6 fulfilment | **5/5 PASS** — real signed order, real fill, real USDC |

### Invariants now proven

| Invariant | Status |
|---|---|
| `minted <= totalSupply` | ✅ |
| `earlyMinted <= earlyAccessCap` | ✅ fuzz, 20k runs |
| `walletEarlyMints <= walletAllowance` | ✅ fuzz, 20k runs |
| `advantageConsumed <= advantageIssued` | ✅ |
| Listed mutable state cannot change while listing executable | ✅ |
| Secondary transfer preserves Pass-bound state | ✅ |
| No unauthorized wallet controls a Pass Vault | ✅ |
| `protocolFee + builderRoyalty + sellerProceeds == salePrice` | ✅ real Seaport 1.6 fill |
| Zone rejects a signed, listed order that underpays by 1 base unit | ✅ `ConsiderationMismatch` |
| Royalty is unwithdrawable before the 30-day hold, and only by the Builder | ✅ |
| Funded reward escrow equals `amountPerPass × eligibleSupply` and fully claims into Pass Vaults | ✅ fuzz |
| `claimAmount <= actualVaultBalance` | ✅ API reads the exact TBA balance/owner before preparing; token execution enforces again |

## Scores

| Domain | Score | Reasoning |
|---|---:|---|
| **Contracts** | **94/100** | The 11-contract live graph includes the tested distributor and locked ERC-6551 account. 119 Foundry tests pass; historical testnet replacement and 1-of-2 admin remain risks. |
| **Backend / API** | **67/100** | Reward reads/prepares and validated multi-asset Vault claim preparation exist. The server still has not been booted against a real database. |
| **Indexer** | **78/100** | The live 17-entity schema includes rewards and Goldsky is Active/100% synced. Arbitrary Vault token inventory is not indexed. |
| **Frontend integration** | **65/100** | Vault claims now submit and confirm real transactions; funded reward-cycle presentation and token inventory discovery remain partial. |
| **Base Sepolia deployment** | **86/100** | All 11 planned contracts and six one-time wires are live and verified; production readiness remains false. |
| **End-to-end product completeness** | **68/100** | Reward authority and Vault claim paths exist, but the database-backed runtime and public product-journey evidence remain outstanding. |

A visually complete frontend does not justify a high backend score, and a passing
contract suite does not justify a high product score. These are scored independently
and deliberately.

## The three things that matter next

1. **Boot and exercise the API with the real PostgreSQL schema**, including transaction
   lifecycle updates for reward and Vault claim intents.
2. **Add authoritative Vault inventory and funded reward-cycle dashboard reads** so the
   UI discovers claimable assets rather than relying on supplied presentation rows.
3. **Run the product journey on public Base Sepolia**, accepting the ≥48 h wall clock,
   to produce the explorer evidence §47 requires for mint through secondary sale. The
   deployment half of §47 is already satisfied.

## Honest note on method

The certification journey and the Seaport fulfilment both ran on a **fork**, not public
Base Sepolia. That was the approved choice and it was the right one for proving logic
quickly against real chain state — but it produces no transaction hashes. Anyone reading
this should not treat step-by-step passes in
`NEXMARKETS_BASE_TESTNET_E2E_CERTIFICATION.md` as public on-chain settlement evidence.

The **deployment** is the exception: the 11 deployment and 6 wiring transactions are
real, public and on explorer, listed in `deployments/base-sepolia.v1-deployment.json`.
Contract state assertions in `NEXMARKETS_BASE_TESTNET_DEPLOYMENTS.md` are live reads of
public Base Sepolia, not fork state.

Every number in these artifacts was produced in this session. No historical test count,
CI result or prior certification was reused as evidence.

---

### Artifacts

| File | Contents |
|---|---|
| `NEXMARKETS_BASE_TESTNET_AUTHORITY_MATRIX.md` | Every UI capability → backend / contract / indexer authority |
| `NEXMARKETS_BASE_TESTNET_DEPLOYMENTS.md` | Live-read addresses, admin, wiring, redeploy requirements |
| `NEXMARKETS_BASE_TESTNET_E2E_CERTIFICATION.md` | The 9-step journey, with explicit limits |
| `NEXMARKETS_BASE_TESTNET_GAPS.md` | Severity-ranked gaps and exact required fixes |
| `NEXMARKETS_BASE_TESTNET_FINAL_STATUS.md` | This document |
