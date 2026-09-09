# Security verification

- Status: **PASS**
- Executed against the real HTTP API handlers with signed wallet challenges, CSRF headers, session records, Builder memberships, listing projections, and transaction idempotency. No browser state or DevTools mutation was used.
- `CHAIN_AUTHORITY_DELEGATED` cases intentionally test the API prepare boundary: the API cannot claim an on-chain mint/Advantage result, so the actual Edition ownership, listing lock, and Advantage behavior remain contract/RPC certification responsibilities.

| Attack / negative test | Result | HTTP / code | Detail |
|---|---|---|---|
| unauthorized Builder profile edit | REJECTED | 403 / BUILDER_NOT_AUTHORIZED | HTTP 403 (BUILDER_NOT_AUTHORIZED) |
| editing another Builder | REJECTED | 403 / BUILDER_NOT_AUTHORIZED | HTTP 403 (BUILDER_NOT_AUTHORIZED) |
| price tampering | REJECTED | 400 / INVALID_USDG_PRICE | HTTP 400 (INVALID_USDG_PRICE) |
| supply tampering | REJECTED | 400 / INVALID_SUPPLY | HTTP 400 (INVALID_SUPPLY) |
| minting wrong Edition | PASS_REVERTED_ONCHAIN | tx status 0 / MintClosed() | funded-wallet tx 0x997e831054b4894a01ef90214d5c19392c0453254f9b5443c1b33b2de92536f2, block 115919109; known Edition supply 1 -> 1 |
| purchasing wrong serial (signed-order mismatch) | REJECTED | 400 / ORDER_HASH_MISMATCH | HTTP 400 (ORDER_HASH_MISMATCH) |
| listing someone else's Pass | REJECTED | 403 / SELLER_SESSION_MISMATCH | HTTP 403 (SELLER_SESSION_MISMATCH) |
| Advantage use while listed | CHAIN_AUTHORITY_DELEGATED | 201 | HTTP 201 |
| stale listing purchase | REJECTED | 409 / ACTIVE_SIGNED_LISTING_REQUIRED | HTTP 409 (ACTIVE_SIGNED_LISTING_REQUIRED) |
| purchasing a read-model serial mismatch | REJECTED | 400 / projected exact Pass offer mismatch | HTTP 400 (projected exact Pass offer mismatch) |
| answering another Builder's Q&A | REJECTED | 404 / QUESTION_NOT_FOUND | HTTP 404 (QUESTION_NOT_FOUND) |
| invalid wallet signature | REJECTED | 400 / Wallet signature mismatch | HTTP 400 (Wallet signature mismatch) |
| nonce replay | REJECTED | 400 / Wallet challenge already consumed | HTTP 400 (Wallet challenge already consumed) |
| expired session | REJECTED | 401 / SESSION_INVALID | HTTP 401 (SESSION_INVALID) |
| wrong chain | REJECTED | 401 / SESSION_NETWORK_MISMATCH | HTTP 401 (SESSION_NETWORK_MISMATCH) |
| duplicate transaction submission | IDEMPOTENT | 201/201 | transaction txj_c41d1c00-9c20-4eb6-9a9a-11f97c56f9e5 reused |

## Interpretation

- Builder edits, cross-Builder access, malformed economics, serial mismatches, stale listings, Q&A ownership, invalid signatures, nonce replay, expired sessions, wrong-chain sessions, and duplicate submissions are rejected or idempotent at the API boundary.
- Wrong-Edition mint was also submitted by funded wallet `0xD83deFbA240568040b39bb2C8B4DB7dB02d40593` and reverted onchain with `MintClosed()`; receipt `0x997e831054b4894a01ef90214d5c19392c0453254f9b5443c1b33b2de92536f2` at block 115919109. The known Edition supply remained 1 -> 1.
- Advantage preparation while listed remains delegated until an actually listed Pass controlled by an available funded signer exists.

## Funded-wallet evidence

- Machine-readable receipt and before/after state: `artifacts/testnet-certification/final-live-chain-negative.json`.

