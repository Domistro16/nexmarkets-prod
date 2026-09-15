# NexMarkets Base Sepolia — Full Handover (2026-09-15)

Single-source continuation document. Older notes: `NEXMARKETS_CHAT_HANDOVER.md` (stale — written before rewards were committed/deployed), `NEXMARKETS_BASE_TESTNET_HANDOVER.md` (pre-redeploy).

## Live deployment (verified on-chain 2026-09-15)

Base Sepolia, chain 84532. All 11 contracts have runtime code and correct wiring. Manifest of record: `deployments/base-sepolia.v1-deployment.json`.

| Contract | Address |
|---|---|
| NexLaunchRegistry | 0x83125b7a5e8d4e79134D74f8E8b5052a58E054B5 |
| NexMintController | 0x8de2eD8bCB4216aF0b1a07D65A6dF229677BD758 |
| NexPassFactory | 0xcF0802892749fAD109c3B841b2a0D922D4DBD6ED |
| NexAdvantageRegistry | 0x6D4Db1939D322411EdE8970eCB14b729788f75Aa |
| NexAdvantageInitializer | 0x9b2f41F9602E3C1AA41a079893386E65AB130c1C |
| NexRoyaltyVault | 0xCbf82F765c80446baa753a56C563ED0291374614 |
| NexListingRegistry | 0x21C397F20Db8da540d22F798d7EC7f7c16CE9241 |
| NexMarketsZone | 0x490d55643F2CAf4D5A178FC84cA01792952C8458 |
| NexPassAccount | 0x8F48738e4BB35F5F6Dc0E40cf939040364AD3682 |
| NexTBAResolver | 0x6B53e133DA10d456296930c041d17606d9283DaF |
| NexRewardDistributor | 0x2453c5FCef787D076ff21614E54C50344FD1EB91 |

Settlement: canonical USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Seaport 1.6 `0x0000000000000068F116a894984e2DB1123eB395`. ERC-6551 Registry `0x000000006551c19487814612e58FE06813775758`. Protocol Admin Safe `0xE6D0846e6C0b51C61FdDb593A1914b85181E5783` — **still 1-of-2, threshold raise outstanding**. Subgraph `nexmarkets-v1-base-sepolia/1.0.1` synced, `hasIndexingErrors: false`.

Deployed fixes verified live: `mintController.allowlistLeaf(edition, wallet, allowance)` binds chain+controller+edition+wallet+allowance; `NexPassAccount.listingRegistry` is wired (listed Vault `execute()` reverts `PassVaultLockedWhileListed`).

Tests: 119 passing / 12 suites (`forge test --summary`; add `;C:\Users\USER\.foundry\bin` to PATH).

Git: `main` pushed through `9509821`. Working tree: this session's uncommitted changes (below) + untracked `scripts/run-base-sepolia-certification-journey.mjs`, this file, `NEXMARKETS_CHAT_HANDOVER.md`.

## Public lifecycle journey — IN PROGRESS, resumable

`scripts/run-base-sepolia-certification-journey.mjs` — phase-gated, idempotent, safe to re-run. State: `scratch/base-sepolia-journey/state.json` (gitignored; contains generated wallet keys — do not commit). `--reset` wipes.

**Completed on public Base Sepolia (2026-09-15 ~06:56Z):**
- Alice/Bob/Charlie/Dora wallets generated; 3 actors funded 0.005 ETH each.
- Real USDC split: Bob 10, Charlie 15 (5 mint + 8 buy).
- Mocks deployed: mockUSDC (6dp, owner-gated `MockUSDG`), NVDAc/NEX/OP (18dp `RewardToken`), `Collectible` ERC-721 — all in state.json.
- Edition "Baldies" `0xabB79BB16AaeC3A332cdfbd3e8b812d0541e7AF6` created by Alice; Terms published (tx `0x9a52c61e…`): supply 2000, 5 USDC, 5% royalty, EA 500 @ 2/wallet, 10-credit advantage, allowlist root = {Bob, Dora}.

**Clock gates:** Early Access opens **2026-09-16 06:59:56Z**. Public opens **2026-09-17 06:59:56Z**. Run the script again after each gate; it executes all newly-eligible phases and exits. Remaining phases: early → public → advantage → vault → claim → reward → list → sale → post → evidence.json.

Note on funding: minting/settlement uses real USDC (immutable). The 400-unit Vault deposit uses mockUSDC — document the journey as mock-vault-asset evidence, not canonical-USDC vault evidence.

## This session's uncommitted changes

1. `scripts/run-base-sepolia-certification-journey.mjs` — new, described above.
2. Rewards wired into frontend (`public/index.html`, `public/v2-app.mjs`, synced to `apps/web/public/` + `dist/`):
   - Vault claim modal now renders a "FUNDED PASS REWARDS" block: claimable cycles (`claimable` flag from `/v1/passes/:e/:t/rewards`) + claim history.
   - `nmOpenPassVault` wrapped (`installRewardVaultBridge`) to prefetch rewards on open; works for empty-vault passes with pending rewards.
   - `window.nmRewardClaim = liveRewardClaim` → `POST /v1/rewards/claim {cycleId, tokenId}` → `submitPrepared` → `waitForReceipt` → `hydrate`. Real tx confirmation; no local success mutation.
   - Asset symbol/decimals resolved via `eth_call` (raw ABI decode — v2-app has no ethers import).
   - Reward claims deliver into the **Pass Vault** (contract behavior); UI copy says so.
   - Claim button suppressed while `claimState.locked` (listed) — matches vault lock semantics.

## Verified API surface (from source + tests)

- `GET /v1/editions/:edition/rewards` → `{policies}` (Goldsky `rewardPolicies`).
- `GET /v1/passes/:edition/:tokenId/rewards` → `{claims, cycles}`; cycles carry `claimable`/`claimed`.
- `POST /v1/rewards/claim` `{cycleId, tokenId|tokenIds[]}` → prepared `claim`/`claimMany`.
- `POST /v1/rewards/policies/prepare` `{edition, source, allocationBps, rewardAsset, ongoing, endsAt}`.
- `POST /v1/rewards/cycles/prepare` `{policyId, asset, amountPerPass}` → +`requiresPriorApproval` note.
- `POST /v1/rewards/policies/retire` `{policyId}`.
- `POST /v1/vault/claims/prepare` `{edition, tokenId, assets[]}` → `ACCOUNT_CREATION_REQUIRED` or `CLAIM_READY` + per-asset prepared txs.
- `test/transaction-calldata.test.mjs` — 5/5 pass, validates all reward selectors.

## Remaining work (priority order)

1. **Continue the journey** at the two clock gates (above). This produces the §47 public tx evidence.
2. **API↔DB↔chain↔indexer round-trip** — API has never run against Postgres in this effort; boot `apps/api` with `DATABASE_URL`, walk publish→index→read.
3. **UI/perf/responsive sweeps** — page-by-page states, wallet checker, launch-state agreement (never exercised).
4. **Safe threshold 1→2** — `RAISE_THRESHOLD_TO_2_PLUS` outstanding; one plaintext `.env` key effectively controls the protocol.
5. **Regenerate artifacts** — the 5 `NEXMARKETS_BASE_TESTNET_*.md` files predate the reward deploy and this journey; rewrite after step 1-2 with real tx evidence.
6. Commit this session's changes (frontend wiring + script) when convenient; **never commit `scratch/`** (contains generated private keys).

## Gotchas

- `dist/` and `apps/web/dist/` are gitignored build copies; `apps/web/public/` is a tracked mirror of `public/` — keep them in sync when editing (done this session).
- `publishTemplateData` splices the same objects into the template's `ownedPasses` — mutating a `view` row from v2-app is visible to `passByKey` in index.html.
- `.env` values may be quoted — strip quotes when parsing.
- `MIN_PREVIEW_DURATION = 1 day` is on-chain; the 48h journey cannot be compressed.
- `eth_getLogs` >10k-block ranges get rejected on Base Sepolia RPC — chunk.
- Reward `claim` is permissionless and credits `tbaResolver.account(edition, tokenId)` — the Pass Vault, never the caller.
