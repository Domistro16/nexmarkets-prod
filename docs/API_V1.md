# API V1

The API is a no-custody transaction preparation and read-model service. Public routes provide health/readiness, Discover, projects, Editions with Terms history, exact Passes with Advantage/listing projections and active market listings. Authenticated routes provide owned Passes and Advantages, transaction status/event reporting, Builder dashboards/project drafts, media upload preparation and preparation for mint, Terms, listing/cancellation, Advantage use and royalty withdrawal. Referral attribution/settlement remains the PostgreSQL Builder-Settled ledger; it is intentionally not exposed as arbitrary onchain calldata.

Authentication is a Robinhood-chain/domain-bound signed wallet challenge with a single-use nonce and expiration. Successful verification creates an opaque, server-stored, revocable session cookie and separate CSRF token. Mutation routes require the session, CSRF token, same origin and an idempotency key. User wallets sign and submit transactions; the server never stores a user key.

Responses include request IDs and structured error codes. Security headers, body limits and rate limiting are enabled. Production should terminate TLS at the edge and use a distributed rate-limit adapter when horizontally scaled. `/healthz` checks process liveness; `/readyz` checks PostgreSQL.

Listing preparation enforces that the seller is the authenticated wallet. The order builder derives or verifies the exact Registry `zoneHash`, reproduces Seaport 1.6 `getOrderHash(OrderComponents)`, emits the Registry `createListing` call when the counter and deployment address are supplied, and rejects wrong USDG, fee, royalty, seller, token, expiry or extra consideration. A submitted transaction hash moves a job only to `SUBMITTED`; confirmation and finalization require receipt/finality evidence from the chain worker.

For non-Seaport mutations, deployment-configured target addresses override all request data and only the expected function selectors are accepted. The API fails closed with `CONTRACT_CONFIGURATION_REQUIRED` before custom contracts are deployed; it never signs or submits on behalf of the user.
