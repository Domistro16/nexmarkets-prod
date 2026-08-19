# Primary-launch contract boundary

The primary mint path is one security boundary:

`NexPassFactory` → `NexLaunchRegistry` → `NexMintController` → `NexPassEdition`

## Responsibilities

- `NexPassFactory` is controlled by the Protocol Admin Safe. It creates one
  permanent Edition with CREATE2, sets the one-time MintController, registers
  the Edition, and transfers Edition ownership to the Protocol Admin Safe.
- `NexLaunchRegistry` owns the versioned Terms and Preview lifecycle. A
  material change creates a new Terms hash and restarts Preview without
  deploying a second ERC-721. Active supply may never be below already minted
  serials.
- `NexMintController` accepts only the currently active Terms hash during the
  Registry mint window. It charges the configured USDG price, splits the
  protocol-fixed 5% primary fee from the primary recipient amount, records a
  payer-scoped idempotency key, and then calls `NexPassEdition.mint`. A
  post-mint Terms-hash check rejects any publisher mutation made from an NFT
  receiver callback. Any referral hint emitted by the controller is
  noncanonical; the backend Builder-Settled referral ledger remains authoritative.
- `NexPassEdition` remains the permanent serial/ownership layer. It independently
  enforces its absolute cap and snapshots the exact Terms hash and Builder
  Royalty for each minted token.

## Required invariants

- One Factory, Registry, and MintController deployment must be wired together
  before any Edition is created.
- The Registry settlement token and Controller USDG address must match the
  verified Robinhood USDG primitive.
- The Factory, Registry, Controller, and Editions are non-upgradeable.
- Preview must last at least 24 hours; mint is open only in
  `[mintStartsAt, mintEndsAt)`.
- A retry with the same payer and intent ID cannot charge or mint twice. A
  failed payment, receiver callback, or Edition mint rolls the intent back.
- No payment is accepted by `NexPassEdition`, and no MintController call is
  valid unless the Edition points to that Controller.

## Deployment sequence

1. Deploy `NexLaunchRegistry` with the verified USDG address and Protocol Admin
   Safe owner.
2. Deploy `NexMintController` against that Registry and USDG, with the Protocol
   Admin Safe as owner and the fee recipient. The primary fee rate is fixed in
   the contract at 5% (500 bps).
3. Deploy `NexPassFactory` with the same Safe, Registry, and Controller.
4. Have the Protocol Admin Safe bind the Factory once in the Registry.
5. Use the Factory to create and wire an Edition, then publish its first Terms
   version from the authorized publisher.
6. Independently review the full trio and Safe-controlled deployment record
   before opening production minting.
