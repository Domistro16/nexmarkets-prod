# Phase 0/1 Status — 2026-08-17

## Live infrastructure gate update — 2026-08-18

The earlier empty-address observation is superseded. A live chain ID 4663
preflight found the canonical CREATE2 factory, ConduitController, and Seaport
1.6 deployed. Both OpenSea contracts were independently rebuilt from the
pinned official commits and match the Robinhood runtime outside expected
constructor immutable slots.

USDG, SupplyControl, OFT wrapper, Timelock authority, ERC-6551, and Safe have
been resolved and pinned. The strict live primitive verifier now passes. See
`docs/ROBINHOOD_INFRASTRUCTURE_GATE.md`.

The remaining boundary is release governance: the verified manifest is pinned
to source commit `2da21ae` and remains `VERIFIED_UNSIGNED` until GitHub
artifact attestations and Protocol Admin Safe approval of the exact manifest
digest are independently recorded before Phase 2 custom contract work begins.

## Completed in this bootstrap

### Phase 0

- Production monorepo boundary created.
- Certified product authority hash committed and executable hash-check added.
- Robinhood mainnet/testnet network policy committed.
- USDG-only V1 / WETH-disabled / Base-disabled policy enforced in manifest validation.
- Canonical authority map committed.
- Deployment-manifest schema and mainnet/testnet bootstrap manifests created.
- Opaque domain ID generator created.
- Fail-closed chain transaction lifecycle created.
- Wallet-signature challenge lifecycle skeleton created (signature cryptography intentionally waits for the selected wallet library).
- Initial PostgreSQL authority tables defined.
- API/indexer/worker service boundaries created.
- Contract package created but feature Solidity intentionally gated.
- CI/static tests created.

### Phase 1

Executable dependency verifier created. It checks:

- RPC chain ID;
- deployed runtime code + Keccak-256 hash;
- USDG `name`, `symbol`, `decimals`;
- USDG EIP-1967 implementation/admin slots where applicable;
- Seaport `information()` version and ConduitController binding;
- ConduitController runtime;
- Safe singleton runtime against the pinned official Safe v1.4.1 code hash;
- ERC-6551 canonical registry presence/hash.

The verifier is deliberately **fail closed**:

- no RPC = `BLOCKED`, never PASS;
- missing expected runtime hash in strict mode = `BLOCKED` before network calls;
- absent ERC-6551 canonical registry = explicit canonical-deployment requirement;
- unexpected code/hash = FAIL;
- mainnet MockUSDG = forbidden.

## Runtime status in this build environment

The local artifact container cannot resolve external RPC hosts. Therefore no fake RPC PASS is recorded. The static Phase 0/1 implementation is tested here; the runtime gate must execute from CI/deployment infrastructure with Robinhood RPC connectivity.

## Newly surfaced USDG consideration

Paxos' current public token code documents centralized pause/freeze/upgrade powers and newer USDG reward mechanics for registered holders. That does not change USDG-only settlement, but it creates a required mainnet accounting/security decision for protocol-held balances, especially the 30-day Royalty Vault. See `docs/authority/USDG_RISK_POLICY.md`.

## Historical infrastructure observation

On 2026-08-17 Robinhood Blockscout classified the canonical Seaport 1.6
address `0x0000000000000068F116a894984e2DB1123eB395` as an EOA/no-contract
address. That observation is retained for audit history but was superseded by
the 2026-08-18 live RPC and independent-build verification recorded above.

OpenSea's current deployment documentation explicitly supports deploying Seaport 1.6 and ConduitController to their canonical addresses on EVM chains via CREATE2. The official verification instructions pin Seaport-core commit `523097f` for Seaport 1.6 and Seaport commit `821a049` for ConduitController verification.

## Remaining before Phase 2 feature contracts

1. Run GitHub Actions attestation for the frozen manifest and production release
   artifact from the exact source/release commit.
2. Have the Protocol Admin Safe approve the manifest digest with its threshold
   signature and record the Safe address/signature.
3. Independently verify both attestation bundles and the Safe EIP-1271 result.
4. Resolve the separate testnet manifest and official Paxos testnet USDG before
   testnet economic integration.
5. Review and pin the Tokenbound account implementation selected for
   NexMarkets accounts.

Only then start `NexPassEdition` and the rest of Phase 2.
