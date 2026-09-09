# Base Sepolia redeployment decision

- Recorded: 2026-09-09
- Network: Base Sepolia (`84532`)
- Existing deployment: `deployments/base-sepolia.v1-deployment.json`
- Decision: a replacement Base Sepolia V1 graph is required before the current Builder launch can be permissionless.

## Objective evidence

The existing ten-contract deployment passes bytecode, ownership, primitive, and post-wire relationship verification. It is not missing or corrupt.

Its Factory at `0x8fDE37c4C1A60733c9842f336fc331c4C7d8eB41` exposes the legacy Safe-mediated `createEdition(config,publisher,salt)` path. A read-only RPC simulation of the current permissionless `createEdition(config,salt)` ABI failed, while the legacy call succeeded only with the Protocol Admin Safe as caller and initial Edition owner.

That makes ordinary authenticated Builder publication dependent on a Safe owner, contrary to the approved permissionless model.

## Why a Factory-only replacement is insufficient

The Launch Registry authorizes a single configured Factory. The Mint Controller, Advantage Registry/Initializer, Listing Registry, Royalty Vault, Zone, and TBA Resolver are bound to the Registry and each other through immutable constructor values or one-time wiring slots. A new Factory cannot register Editions through the already-wired legacy Registry.

The smallest coherent replacement is therefore the existing repository-defined V1 dependency graph. Canonical Base Sepolia USDC, Seaport 1.6, Conduit Controller, ERC-6551 Registry, and the existing Protocol Admin Safe remain unchanged.

No Robinhood deployment or historical Edition is migrated or modified.
