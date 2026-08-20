# NexAdvantageRegistry boundary

`NexAdvantageRegistry` is the canonical remaining-utility ledger for each
exact `NexPassEdition` address and token ID. ERC-721 ownership remains the
authority for who may use a Pass; the registry never mints, transfers, burns,
or rewrites serial ownership.

## What is stored

Each minted Pass is initialized once against:

- the Edition’s onchain `termsVersionHashOf(tokenId)`;
- the corresponding `NexLaunchRegistry` `advantagesHash`; and
- one or more immutable Advantage definitions.

The registry recomputes the published commitment as
`keccak256(abi.encode(ADVANTAGES_DOMAIN, configs))`. The complete ordered
configuration array is covered, including each quantity, time window, kind,
Advantage ID, and definition hash; a caller cannot substitute different
utility definitions under the published Terms hash.

The definitions support four mechanisms:

- `TimeBased`: remaining seconds inside a start/end window whose own clock
  pauses only for a listing interval that reaches its window;
- `QuantityBased`: remaining units, consumed with an idempotent use ID;
- `Connected`: a non-consuming entitlement active inside a fixed window; and
- `Redemption`: remaining claims, consumed one at a time with an idempotent
  redemption ID scoped to the exact Edition, token ID, and Advantage.

The remaining state is keyed by Edition plus exact token ID. A transfer does
not call this registry and therefore cannot reset time, units, or redemption
history.

Quantity and redemption use records are scoped to the exact utility and bind
the applied amount, so the same ID can be reused on another Pass without
cross-Pass collisions while inconsistent retries fail.

## Listing lock

The Protocol Admin binds `NexListingRegistry` once as the listing-authority
contract. That authority sets the exact Pass to `listed` before a listing is
active and clears it only when the listing is cancelled or otherwise inactive.
All state-changing utility calls fail while the Pass is listed. A direct
ERC-721 transfer does not clear the lock; this is deliberately conservative
until `NexListingRegistry.syncListing` clears stale market state. Each
TimeBased Advantage tracks its own listing overlap: a listing before its start
does not shift that start, a listing after expiry cannot revive it, and an
active window resumes with its unused time when the listing is cleared.

## Authority and integration boundary

The Protocol Admin binds `NexAdvantageInitializer` once; it must be deployed
code, never an EOA. The MintController independently binds the same initializer
and calls it atomically for every serial in a successful mint when the active
Terms commit Advantages. Payment, mint and all Advantage initialization revert
together on any mismatch or failure. Before either one-time authority slot is
consumed, the contracts verify the immutable registry, LaunchRegistry,
MintController and Protocol Admin back-references. Production deployment has
not been performed.
