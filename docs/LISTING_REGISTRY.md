# NexListingRegistry + NexMarketsZone boundary

`NexListingRegistry` is the canonical NexMarkets state machine for a secondary
listing of one exact `NexPassEdition` serial. `NexMarketsZone` is deliberately a
thin adapter for the already verified Robinhood Seaport 1.6 deployment. Neither
contract deploys, upgrades, or forks Seaport.

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

## Seaport callback boundary

`NexMarketsZone` accepts `authorizeOrder` and `validateOrder` only from the
configured Seaport address. It forwards the exact `ZoneParameters` to the
registry and returns Seaport's required selector. The registry accepts only its
one-time wired zone, so an arbitrary contract cannot drive listing state.

Before authorization, the registry requires the listing to be active, inside
its time window, still owned by the original seller, and structurally equal to
the stored order. After Seaport has transferred the Pass, validation requires a
nonzero owner different from the seller, then marks the listing filled and
releases the Advantage lock.

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

The Protocol Admin binds the registry to the immutable LaunchRegistry,
AdvantageRegistry, and verified Seaport address at construction. It then binds
`NexMarketsZone` once. Before consuming that irreversible slot, the registry
checks the zone exposes this registry, the same Seaport address, and the same
Protocol Admin owner. `NexAdvantageRegistry` independently validates that the
listing authority points back to it and has the expected owner.

This is a contract-boundary review only. It does not deploy to Robinhood or
authorize production deployment. `NexRoyaltyVault` is the next boundary and
will separately enforce the 30-day secondary Builder Royalty hold.
