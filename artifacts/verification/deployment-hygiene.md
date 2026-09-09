# Deployment hygiene certification

- Status: **PASS**
- Verified: 2026-09-09
- Scope: database endpoint strategy and settlement-token environment separation.

## PostgreSQL connection strategy

| Purpose | Endpoint | Result |
|---|---|---|
| Production runtime pooling | Supabase transaction pooler, port 6543 | PASS |
| Schema migrations and direct administrative checks | Supabase direct/session endpoint, port 5432 (`DIRECT_URL`) | PASS |

The stale local pooler password was replaced from the already-working direct connection credential without logging either secret. A post-repair connection probe authenticated through both endpoints. `infra/schema/migrate.mjs` deliberately prefers `DIRECT_URL`, so migrations do not depend on transaction-pooler behavior; application runtime may use `DATABASE_URL` through the pooler.

No database URL, password, access token, or private key is recorded in this artifact.

## Settlement-token separation

| Network class | Settlement token | Status |
|---|---|---|
| Robinhood testnet | `MockUSDG` at `0x6A4F8832c23C51ba626Eba9d50c8F862647C1679` | Explicitly testnet-only |
| Production | Chain-specific configured real USDG address | Required by production readiness gate |

`MockUSDG` has not been renamed or represented as a production token. The payment-token verifier and deployment manifests retain the environment distinction.

## Evidence command

`node --env-file=.env scripts/preflight-final-live-certification.mjs`

Observed results: configured pooler PASS, direct endpoint PASS, credentials aligned, Robinhood testnet chain ID 46630, deployed contract code present, and local API readiness PASS.

