# API V1

The API is a no-custody transaction preparation and read-model service. Public routes provide health/readiness, Discover, projects, Editions with Terms history, exact Passes with Advantage/listing projections and active market listings. Authenticated routes provide owned Passes and Advantages, transaction status/event reporting, Builder dashboards/project drafts, media upload preparation and preparation for mint, Terms, listing/cancellation, Advantage use and royalty withdrawal. Referral attribution/settlement remains the PostgreSQL Builder-Settled ledger; it is intentionally not exposed as arbitrary onchain calldata.

Authentication is a Robinhood-chain/domain-bound signed wallet challenge with a single-use nonce and expiration. Successful verification creates an opaque, server-stored, revocable session cookie and separate CSRF token. Mutation routes require the session, CSRF token, same origin and an idempotency key. User wallets sign and submit transactions; the server never stores a user key. Safe Edition submission is not authorized by pretending the Safe is an EOA: the chain worker/API accept it only after verifying a successful Safe `ExecutionSuccess` plus the expected Factory `EditionCreated` evidence for that request.

Responses include request IDs and structured error codes. Security headers, body limits and rate limiting are enabled. Production should terminate TLS at the edge and use a distributed rate-limit adapter when horizontally scaled. `/healthz` checks process liveness; `/readyz` checks PostgreSQL plus actual Robinhood head-to-Goldsky-landed-watermark and finalized-watermark freshness thresholds and fails closed when stale. Latest protocol-event height is reported separately and is never used as ingestion progress.

Listing preparation enforces that the seller is the authenticated wallet. The order builder derives or verifies the exact Registry `zoneHash`, reproduces Seaport 1.6 `getOrderHash(OrderComponents)`, emits the Registry `createListing` call when the counter and deployment address are supplied, and rejects wrong USDG, fee, royalty, seller, token, expiry or extra consideration. A submitted transaction hash moves a job only to `SUBMITTED`; confirmation and finalization require receipt/finality evidence from the chain worker.

`POST /v1/listings/signed-order` verifies the Seaport 1.6 EIP-712 signature against the authenticated seller and stores only the fulfillment capability. It does not activate a listing. `POST /v1/listings/buy` requires an active chain-projected ListingRegistry record, revalidates the stored order against that projection, and prepares canonical Seaport `fulfillOrder` calldata while persisting Seaport as the lifecycle target and exact input. The buyer wallet still signs and pays exactly the projected USDG price.

For non-Seaport mutations, deployment-configured target addresses override all request data and only the expected function selectors are accepted. The API fails closed with `CONTRACT_CONFIGURATION_REQUIRED` before custom contracts are deployed; it never signs or submits on behalf of the user.
# Builder Safe workflow

`POST /v1/editions/prepare` creates a project-linked `edition_request` and a
Safe proposal payload. It does not ask the Builder EOA to submit
`NexPassFactory.createEdition`, because Factory ownership remains with the
Protocol Admin Safe. The API records a Safe execution only after its receipt
contains the successful Safe execution event and the expected Factory
`EditionCreated` event. The request stores the byte-exact CREATE2 prediction
derived from the complete Edition config (name, symbol, Safe initial owner,
edition ID, cap, artwork commitment, base URI and salt); the observed event
must match that address and its configured Protocol Admin/MintController.
Goldsky/chain workers then advance the request through
submitted, confirmed and finalized states.
