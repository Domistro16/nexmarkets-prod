# Browser storage authority map

| Storage key/access | Classification | Canonical authority | Verification |
|---|---|---|---|
| `localStorage.nexmarkets_network` | Cosmetic network-selection preference | Chain-scoped runtime config and backend network header | The selected network is validated against `/config.json` and `networkPolicy`; it does not contain a Product, Edition, Pass, listing, Advantage, transaction, earnings, or identity record. |
| `sessionStorage.nex_csrf` | Ephemeral security token | Server session and CSRF validation | It is discarded on disconnect/session failure and is never used to resolve an account or domain record. |
| `sessionStorage.nexmarkets_selected_builder` | Non-authoritative UI selection | `BuilderMembership` queried from `/v1/me/builders` | The value is matched against the server-returned membership list; every profile, Product, and dashboard mutation sends a `builderId` that the server authorizes. |
| Approved production HTML browser storage | No domain storage | PostgreSQL, chain and indexed read models | `test/authority-convergence.test.mjs` asserts no `localStorage.` access in the approved HTML. |

No browser storage is accepted as authority for authenticated identity, Builder profile, Product, Edition, Pass ownership, artwork, Random assignment, listing, Advantage, transaction, earnings, Builder update, Q&A, or published launch state. Frontend state is a render cache and is replaced by API/indexer hydration.
