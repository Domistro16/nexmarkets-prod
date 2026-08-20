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

The definitions support four mechanisms:

- `TimeBased`: remaining seconds inside a fixed start/end window;
- `QuantityBased`: remaining units, consumed with an idempotent use ID;
- `Connected`: a non-consuming entitlement active inside a fixed window; and
- `Redemption`: remaining claims, consumed one at a time with a globally
  idempotent redemption ID.

The remaining state is keyed by Edition plus exact token ID. A transfer does
not call this registry and therefore cannot reset time, units, or redemption
history.

## Listing lock

The Protocol Admin binds a listing-authority contract once. That authority
sets the exact Pass to `listed` before a listing is active and clears it only
when the listing is cancelled or otherwise inactive. All state-changing
utility calls fail while the Pass is listed. A direct ERC-721 transfer does
not clear the lock; this is deliberately conservative until the listing
authority clears stale market state.

## Authority and integration boundary

The Protocol Admin binds the initializer once. The initializer is expected to
be the future mint/Advantage integration contract and must be deployed code,
not an EOA. This PR does not alter `NexMintController`; wiring the initializer
after each successful mint is the next integration step. Production deployment
is not performed by this contract gate.
