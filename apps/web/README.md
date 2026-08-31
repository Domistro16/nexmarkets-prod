# NexMarkets web

The browser shell is the supplied NexMarkets V2 Global Product Experience
template (`public/index.html`). Its visual/layout markup remains template-owned;
`public/v2-app.mjs` is the small runtime adapter that hydrates the template from
the certified API/Goldsky records and Robinhood testnet configuration.

Run `npm run web:config:testnet` followed by `npm run web:build` and serve
`dist/` through `npm run web:serve:testnet` for a same-origin local testnet
session. The adapter keeps public pages read-only during this acceptance pass,
shows explicit loading/error states, and never puts RPC, database or provider
secrets in browser configuration.

The V1 web client is a responsive, no-custody application backed by the real API and an EIP-1193 wallet. It contains no production mock product state: empty screens stay empty until Goldsky-backed read models contain finalized chain data.

Routes cover Home, Discover, Pass detail, Market, Create, Holder dashboard, Builder dashboard and transaction progress. Wallet authentication uses the API signed challenge; transaction preparation comes from the API and the connected wallet submits user-authorized calls. Live actions cover minting with USDG balance/allowance checks, Advantage use, Seaport listing signature and registration, exact-price Seaport purchase, listing cancellation and matured RoyaltyVault withdrawal. A transaction hash is displayed only as `SUBMITTED`, never as confirmation or finality.

`public/config.example.json` remains deliberately non-production-ready until a Safe deployment manifest supplies verified custom-contract addresses. Run `npm run web:build` to generate `apps/web/dist`.
