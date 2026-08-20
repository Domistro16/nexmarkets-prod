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

- `TimeBased`: remaining seconds inside a start/end window whose clock pauses
  while the Pass is listed;
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

The Protocol Admin binds a listing-authority contract once. That authority
sets the exact Pass to `listed` before a listing is active and clears it only
when the listing is cancelled or otherwise inactive. All state-changing
utility calls fail while the Pass is listed. A direct ERC-721 transfer does
not clear the lock; this is deliberately conservative until the listing
authority clears stale market state.
TimeBased utility time is frozen for the full listed interval and resumes when
the listing is cleared.

## Authority and integration boundary

The Protocol Admin binds the initializer once. The initializer is expected to
be the future mint/Advantage integration contract and must be deployed code,
not an EOA. Before either one-time authority slot is consumed, the registry
verifies the expected immutable registry, LaunchRegistry, and owner wiring
exposed by that contract. This PR does not alter `NexMintController`; wiring
the initializer after each successful mint is the next integration step.
Production deployment is not performed by this contract gate.
