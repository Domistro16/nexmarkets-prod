# NexListingRegistry + NexMarketsZone + NexRoyaltyVault boundary

`NexListingRegistry` is the canonical NexMarkets state machine for a secondary
listing of one exact `NexPassEdition` serial. `NexMarketsZone` is deliberately a
thin adapter for the already verified Robinhood Seaport 1.6 deployment.
`NexRoyaltyVault` is the order-backed 30-day Builder Royalty ledger. None of
these contracts deploys, upgrades, or forks Seaport.

## What a listing commits

The seller first registers a listing with an order hash and the exact:

- Edition address and token ID;
- current seller (`ownerOf(tokenId)` at registration);
- historical `termsVersionHash` recorded on that token;
- USDG amount;
- Builder Royalty receiver and rate read from the token's ERC-2981 snapshot;
- Seaport start and expiry timestamps; and
- a versioned `zoneHash` covering all of the fields above.

The registry also checks that the historical Terms version exists in
`NexLaunchRegistry`, that the Edition's token Terms hash matches it, and that
the Edition's royalty response matches the Terms royalty snapshot. The signed
Seaport order must reproduce the stored offer, USDG consideration, seller,
timestamps, and `zoneHash`. ERC-721 orders are exact-quantity orders; extra or
incorrect consideration items fail closed.

Secondary economics are fixed in code. For a signed sale price `P`, the buyer
pays exactly `P`: 1% goes to the NexMarkets fee recipient, the token's
snapshotted Builder Royalty goes to `NexRoyaltyVault`, and the seller receives
the remainder. The royalty leg remains separate even when the Builder is also
the seller. A zero-royalty Pass still pays the fixed 1% protocol fee and creates
no Vault claim.

## Seaport callback boundary

`NexMarketsZone` accepts `authorizeOrder` and `validateOrder` only from the
configured Seaport address. It forwards the exact `ZoneParameters` to the
registry and returns Seaport's required selector. The registry accepts only its
one-time wired zone, so an arbitrary contract cannot drive listing state.

Before authorization, the registry requires the listing to be active, inside
its time window, still owned by the original seller, and structurally equal to
the stored order. The exact consideration is protocol fee, Vault royalty when
nonzero, and seller proceeds; the three components sum to the signed price.
After Seaport has transferred the Pass and USDG, validation requires a nonzero
owner different from the seller. It then records the royalty claim, marks the
listing filled, and releases the Advantage lock. Any failure reverts the whole
Seaport fulfillment, including its NFT and USDG transfers.

## Thirty-day royalty hold

Only the permanently bound `NexListingRegistry` may record a claim. Each
nonzero claim stores the Seaport order hash, Edition, token ID, Builder, amount,
and `releaseAt = settlement timestamp + 30 days`. The order hash may be
recorded only once, and the Vault refuses to create liabilities beyond its
actual USDG balance.

Only the immutable Builder recipient may withdraw. Withdrawal before
`releaseAt` and a second withdrawal both fail. The Vault exposes no admin path
that can redirect or accelerate an outstanding Builder claim.

## Stale state and Advantage locking

Creating a listing calls the one-time listing authority on
`NexAdvantageRegistry` before the order is signed, so state-changing Advantage
use is blocked while the Pass is listed. Cancellation, permissionless
`syncListing`, and successful fill release the lock. A direct ERC-721 transfer
cannot call the registry; the registry therefore treats the order as inactive
immediately, while `syncListing` records it as stale and releases the lock.
Expired orders are likewise inactive and can be permissionlessly synchronized.
No stale order is accepted by the Seaport callbacks.

The listing lock is independent of ownership and survives a direct transfer
until stale market state is cleared. This conservative behavior prevents the
new owner from consuming utility through an order that still exists in an
external Seaport indexer.

## One-time wiring

The Protocol Admin deploys the Vault first, then binds the registry to the
immutable LaunchRegistry, AdvantageRegistry, Vault, fixed fee recipient, and
verified Seaport address at construction. The Vault permanently binds that
registry only after checking the registry points back to it and has the same
owner. The registry then binds `NexMarketsZone` once. Before consuming that
irreversible slot, the registry checks the zone exposes this registry, the same
Seaport address, and the same Protocol Admin owner. `NexAdvantageRegistry`
independently validates that the listing authority points back to it and has
the expected owner.

This boundary remains unchanged by the later V1 integration. ERC-6551/TBA,
Goldsky projection, reconciliation, API and web layers attach to it without
replacing Seaport, ERC-721 ownership, listing policy or Vault authority. No
Robinhood mainnet deployment has been performed.
