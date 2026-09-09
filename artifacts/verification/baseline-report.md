# NexMarkets Baseline Verification Report

**Capture point:** 2026-09-08, Africa/Lagos  
**Purpose:** evidence-first verification before implementation repair  
**Verdict at baseline:** `PRODUCTION MIGRATION NOT VERIFIED`

This report records the state before changing implementation code. The only new files created during the baseline were audit artifacts under `artifacts/verification/` and the browser audit helper under `scratch/`; no application source was repaired before these findings were recorded.

## Executive finding

The latest approved HTML was used as the production shell: `public/index.html` and the approved file have the same 4,006,067-byte HTML body and differ by the expected hydration bridge/module append. Chromium rendered the approved file and the served production page at 1440×900. That proves source adoption and visual-shell loading, not a completed migration.

The implementation is not certifiable. The critical evidence is:

- `npm test`: 118 tests, 112 passed, 0 failed, 6 skipped. The skipped tests are PostgreSQL/indexer integration cases.
- `npm run build`: failed at the API esbuild stage with four access/path-resolution errors, although the web-copy check printed a PASS line.
- Playwright: 24 tests executed, 22 passed, 2 failed. Both PNG-download cases failed with `download.createReadStream: canceled` and `ENOSPC` while Playwright wrote its artifact.
- Foundry, Anvil, and PostgreSQL executables are unavailable in the workspace, so contract execution, live database migration, and live chain verification were not rerun.
- The shipped HTML contains hard-coded production-path arrays for projects, collections, listings, owned passes, dashboard state, and create defaults (`public/index.html:4545-4787`). The bridge replaces them after hydration, but the fixture code remains in the production document and the legacy profile writer still uses localStorage (`public/index.html:14408-14478`).
- The current client canonicalizes only the configured certification Edition/pass in detail state and maps other detail routes back to the first known project (`public/v2-app.mjs:1172-1218`, `1232-1278`).
- The domain normalizer silently converts an unrecognized/legacy design into a Classic fallback (`packages/domain/src/launch-draft.mjs:357-362`), contrary to the requirement that removed designs cannot enter through stale drafts or migration fallback.
- The current browser config exposes Robinhood testnet and Base Sepolia only, marks testnet mode, and marks production readiness false (`public/config.json`).

## Requirement scorecard

Statuses mean: **PASS** = executable evidence covers the requirement; **PARTIAL** = meaningful implementation/evidence exists but a material part is unverified; **FAIL** = an executable contradiction or explicit missing behavior exists; **NOT APPLICABLE** = no applicable path in this build. A source symbol alone is not treated as PASS.

| Requirement | Status | Baseline evidence |
|---|---|---|
| 1. Reference authorities | PARTIAL | Latest HTML is present and rendered. Functional authority code exists in API/domain/contracts, but the config authority still names the retired `NEXMARKETS_ELITE_RELEASE_CANDIDATE.html` (`packages/config/src/networks.mjs:1-5`). |
| 2. Verify before modifying | PASS | This report and artifacts were captured before implementation repairs. |
| 3. Latest HTML migration | PARTIAL | Production entry is generated from `NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` (`scripts/build-web.mjs:15-39`), but route/data behavior below is not equivalent. |
| 4. Not a second mock app | FAIL | Production document ships fixture arrays and a localStorage Builder-profile implementation (`public/index.html:4545-4787`, `14408-14478`). The bridge is an override, not isolation. |
| 5. One source of truth | PARTIAL | `CANONICAL_AUTHORITY` is explicit (`packages/domain/src/authority.mjs:1-19`), but Pass rendering has a domain authority, inline demo authority, legacy renderer, and local profile authority in one shipped document. |
| 6. Authentication/account | PARTIAL | Server has nonce/challenge, signature verification, HttpOnly session and CSRF (`apps/api/src/server.mjs:523-545`); browser tests cover challenge/wrong-network wiring, but no real wallet signature/session/chain transaction was rerun. |
| 7. Six-phase Create | PARTIAL | Browser suite exercised the wizard and draft API fixture (tests 11-14); no fresh real-user/PostgreSQL persistence or refresh-at-each-phase proof. |
| 8. Create artwork cleanliness | PARTIAL | Upload endpoint validates MIME, size, checksum and image bytes (`apps/api/src/server.mjs:716-753`); fresh no-artwork boundary versus Baldie/demo assets was not completed. |
| 9. Random mode | PARTIAL | HTML toggle explicitly hides manual selectors (`public/index.html:6103`, `6327`); no browser test toggled on/off with console assertion. |
| 10. Random assignment math | PARTIAL | Domain has 13 options × 5 colorways and deterministic deck (`packages/domain/src/pass-design.mjs:8-76`) with unit coverage; no 65-serial production assignment capture. |
| 11. Random immutability | NOT VERIFIED | No complete Create→publish→mint→reveal→market→download comparison was executed. |
| 12. Canonical Pass configuration | PARTIAL | Server-side `pass-design.mjs` exists, but inline `demoFinal`/`nmFastDemoAssignment` and legacy renderer are separately reachable in the shipped HTML (`public/index.html:13394-13527`). |
| 13. Public Pass performance | PARTIAL | Chromium visual audit captured iframe counts: authority home 23 / production home 25; authority discover 18 / production discover 21; market production 3 under the fixture. No trace/payload budget was recorded. |
| 14. Home hero authority | PARTIAL | Four hero lock attributes exist in the approved HTML (`NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html:4239-4240` and adjacent hero markup); repeat/resize/runtime-rotation proof was not completed. |
| 15. Demo-art boundary | FAIL | Demo/Baldie pool is deliberately shipped in the production HTML (`public/index.html:13403-13555`) and the independent legacy profile seed reads it; no executable fresh-create boundary proof exists. |
| 16. Download end to end | FAIL | Playwright ran the real button path; both download tests failed before file inspection with cancellation/ENOSPC. Existing test checks only PNG signature and 2048 dimensions (`test/browser/webapp.acceptance.spec.mjs:385-420`). |
| 17. Download composition | NOT VERIFIED | No representative PNG was successfully captured and pixel-compared. |
| 18. Preview | PARTIAL | Server enforces a 24-hour minimum for explicitly supplied preview timing and requires approved artwork (`apps/api/src/server.mjs:652-695`); API bypass and live public availability were not tested. |
| 19. Debut | NOT VERIFIED | Lifecycle normalization exists, but no controlled clock/chain lifecycle transition was executed. |
| 20. Mint/acquisition | PARTIAL | Browser tests exercise prepare/broadcast callbacks with a fixture wallet/provider, not a live testnet transaction; no fresh transaction hash/event/DB/indexer evidence. |
| 21. Reveal | NOT VERIFIED | No minted serial was compared to pre-publish frozen configuration. |
| 22. Advantage | PARTIAL | Contract tests/source include committed advantage transfer/list lock semantics (`packages/contracts/test/NexAdvantageRegistry.t.sol:255-442`); no live use/list/cancel flow. |
| 23. Listing | PARTIAL | API validates seller/session/order policy and has prepare/cancel intents (`apps/api/src/server.mjs:755-814`); browser tests cover wiring, not settled exact ownership. |
| 24. Exact secondary purchase | PARTIAL | Exact token/order validation exists in API and contracts; no second-wallet live settlement evidence. |
| 25. Stale listings | PARTIAL | Contract tests include transferred/expired/stale order rejection (`packages/contracts/test/NexListingRegistry.t.sol:469-530`); no current live scenario. |
| 26. Builder public profile | PARTIAL | Latest profile markup and live social adapter exist (`public/index.html:14461-14485`, `public/v2-app.mjs:811-906`); all current profiles and owner-control leakage were not browser-verified. |
| 27. Independent Builder identity | FAIL | Schema enforces one `builder_profile` per `account_id` (`infra/schema/0003_social_and_builder_profiles.sql:3-15`), and API profile update has no builder identity key (`apps/api/src/server.mjs:551-567`). Multiple independent identities are not evidenced. |
| 28. Dashboard → Builder profile | PARTIAL | API PUT and live adapter exist; persistence/refresh/public reflection was not executed with an authenticated user. |
| 29. Multiple Builder identities | FAIL | No executable support/evidence; schema is account-unique and the endpoint edits the session account only. |
| 30. Builder updates | PARTIAL | API stores milestones and public adapter reads them (`apps/api/src/server.mjs:568-574`, `public/v2-app.mjs:844-860`); no authenticated end-to-end persistence test. |
| 31. Builder Q&A | PARTIAL | API checks profile/question ownership through store methods (`apps/api/src/server.mjs:575-596`); no public→dashboard→answer browser run or direct unauthorized request result. |
| 32. Discover | PARTIAL | `/v1/discover` and detail enrichment are wired (`public/v2-app.mjs:1232-1278`); fixture browser coverage only exercises loading/navigation and not every current launch/filter combination. |
| 33. Individual launch responsiveness | NOT VERIFIED | Existing browser overflow suite covers only `/`, `/discover`, `/market`, `/create`, `/dashboard/holder`; it does not cover all launch/profile/edition/listing screens at all nine widths. |
| 34. Market | PARTIAL | API-backed listings are wired; visual audit showed production empty-state under its fixture while the static authority shows seeded listings, and no live exact-listing audit was completed. |
| 35. Dashboard | PARTIAL | Dashboard adapters and tabs exist; no real account data or all-tab responsive run. |
| 36. Site-wide responsiveness | PARTIAL | Existing Playwright overflow suite passed its five routes × nine widths; requirement covers more routes and bounding-box/container checks, which were not run. |
| 37. Text | FAIL | Browser/source output contains mojibake such as `Â·`, `â€¦`, and `Ã¢` in visible strings (`public/v2-app.mjs:115-190`, `packages/domain/src/pass-design.mjs:8-20`). No complete clipping/ellipsis audit passed. |
| 38. Buttons/controls | PARTIAL | The authority has explicit compact control CSS and Create markup; no complete all-phase computed-height/sticky-overlap audit. |
| 39. State cleanup | FAIL | Reachable/loaded production document still contains legacy localStorage profile writer, old renderer aliases, demo seed authority and compatibility layer (`public/index.html:5280-5285`, `13394-13555`, `14408-14485`). |
| 40. Network/contract config | FAIL | Four chains exist in source config, but browser runtime exposes only testnet networks and `productionReady:false`; Robinhood testnet settlement is MockUSDG (`packages/config/src/networks.mjs:25-45`, `public/config.json`). |
| 41. Fees | PARTIAL | Contract tests assert 5% primary and 1% secondary plus royalty behavior (`packages/contracts/test/PrimaryLaunchTrio.t.sol:219-223`, `NexListingRegistry.t.sol:385-431`); frontend economics currently hard-code/derive incomplete values and dashboard `primaryProceeds` is always `0` (`public/v2-app.mjs:1294-1460`). |
| 42. Contract tests | NOT VERIFIED | Foundry is unavailable; historical release JSON claims 71/71 and 5,000 fuzz runs, but that is not a current execution result. |
| 43. Frontend/backend tests | PARTIAL | Root Node suite passed 112/118; browser 22/24. There are no root `typecheck`, `lint`, unit, integration, or migration-test scripts; build failed. |
| 44. Database migration | NOT VERIFIED | Seven SQL files and 38-table schema verifier exist; PostgreSQL is unavailable and no realistic old-data migration was run. |
| 45. No data loss | NOT VERIFIED | Deployment artifact names representative certification IDs but no before/after database query was executed in this workspace. |
| 46. File storage | PARTIAL | Upload/complete validation and object storage module exist; browser media tests pass fixture/API upload flow, but full invalid/oversize/failure/retry/persistence matrix was not run. |
| 47. Security | PARTIAL | Session, CSRF, target/calldata/order checks and contract fail-closed tests exist; no complete direct attack matrix was executed against a running persisted service. |
| 48. Performance | NOT VERIFIED | No trace, payload, request, layout-shift or renderer budget artifact was captured. |
| 49. Accessibility | NOT VERIFIED | No axe/automated accessibility command or full keyboard pass is configured in the observed package scripts. |
| 50. Docs vs product | PARTIAL | Docs and FAQ/Terms surfaces exist in the authority; network/fee/lifecycle text was not reconciled field-by-field against runtime config and contract authority. |
| 51. Visual regression | PARTIAL | Identical 1440×900 Chromium screenshots were captured for authority and production core screens (`artifacts/verification/baseline/*.png`, `visual.json`); Discover/Market data differs and launch/profile/owned/create-phase comparisons are missing. |
| 52. Complete human journey | FAIL | No uninterrupted human journey was run with two real wallets, persisted DB, live testnet transactions, exact serial comparison and social actions. |
| 53. Failure policy | FAIL | Multiple critical requirements above remain unverified or contradicted. |
| 54. Final report | PASS | This baseline report uses the requested evidence/status structure; final post-repair report remains required. |

## Latest HTML surface → production surface matrix

The production implementation is a static HTML document plus `public/v2-app.mjs`/`public/nm-v2-data-bridge.js`; it is not a conventional route-per-component frontend. The mapping below is therefore by DOM screen and runtime function.

| Latest HTML surface | Intended production route | Production component/runtime | Structure | Functionality | Responsive | Mock replacement |
|---|---|---|---|---|---|---|
| Home `#home` | `/` | Inline home renderer + `v2-app.mjs` hydration | PASS | PARTIAL | PARTIAL | FAIL: demo arrays remain in shipped document |
| Discover `#discover` | `/discover` | Inline discover renderer + `/v1/discover` | PASS | PARTIAL | PARTIAL | PARTIAL |
| Launch detail `#project` | `/projects/:project` | `renderProjectPage`, `goView`, `projectModel` | PARTIAL | PARTIAL | NOT VERIFIED | FAIL for arbitrary detail: state falls back to first project |
| Builder profile `#builder` | builder/profile navigation | `nmRenderBuilderPage`, live social adapter | PASS | PARTIAL | NOT VERIFIED | FAIL: legacy seed/localStorage code remains |
| Market `#market` | `/market` | Market renderer + normalized `/v1/market/listings` | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Edition/collection `#collection` | `/editions/:edition` | `renderEditionPage`, `goView` | PARTIAL | PARTIAL | NOT VERIFIED | FAIL for arbitrary edition fetch |
| Exact listing `#listing` | `/market` (current) | `renderListingPage` | FAIL: no exact URL mapping | PARTIAL | NOT VERIFIED | PARTIAL |
| Owned Pass `#owned` | `/dashboard/holder?view=owned` | `renderOwnedPage`, `openOwnedPass` | FAIL: query ignored by `routeInfo` | PARTIAL | NOT VERIFIED | PARTIAL |
| Dashboard overview | `/dashboard/holder` | `renderDashboard`, `dashboardOverview` | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Dashboard Passes | dashboard tab | `dashboardPasses` | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Dashboard Advantages | dashboard tab | `dashboardAdvantages` | PASS | PARTIAL | PARTIAL | PARTIAL |
| Dashboard Listings | dashboard tab | `dashboardListings` | PASS | PARTIAL | PARTIAL | PARTIAL |
| Dashboard Launches | dashboard tab | `dashboardLaunches` | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Dashboard Earnings | dashboard tab | `dashboardEarnings` | PASS | FAIL: primary proceeds mapped to 0 | NOT VERIFIED | PARTIAL |
| Dashboard Activity | dashboard tab | `dashboardActivity` | PASS | FAIL: adapter returns empty activity | NOT VERIFIED | PARTIAL |
| Dashboard Builder profile | `/dashboard/builder` intended | `nmDashboardBuilderProfile`, API override | PARTIAL | PARTIAL | NOT VERIFIED | FAIL: legacy localStorage function remains |
| Create Phase 1 | `/create` stage 1 | `renderCreate`, `submitCreateDraft` | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Create Phase 2 | `/create` stage 2 | `renderCreate` economics | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Create Phase 3 | `/create` stage 3 | `renderCreate` advantage mapping | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Create Phase 4 | `/create` stage 4 | `renderCreate` artwork | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Create Phase 5 | `/create` stage 5 | `renderCreate` Pass/random design | PASS | PARTIAL | PARTIAL | FAIL: legacy design fallback remains |
| Create Phase 6 | `/create` stage 6 | review/publish callbacks | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Docs | `/docs` intended | `#docs`, inline `renderDocsPage` | PASS | FAIL: no `routeInfo`/history route | NOT VERIFIED | N/A |
| FAQ | `/faq` intended | `#faq`, inline FAQ renderer | PASS | FAIL: no URL route | NOT VERIFIED | N/A |
| Terms | `/terms` intended | `#terms`, inline Terms renderer | PASS | FAIL: no URL route | NOT VERIFIED | N/A |

## Fixture/mock inventory

| Fixture or mock | Location | Classification | Evidence/reason |
|---|---|---|---|
| `projects` seed array | `public/index.html:4545` | **UNACCEPTABLE / production-reachable code** | Replaced by bridge only after hydration; shipped in the production entry and used by legacy renderers. |
| `projectExperience` seed | `public/index.html:4557` | **UNACCEPTABLE / production-reachable code** | Hard-coded product/about/Advantage/social content remains in runtime. |
| `collections` and `listings` seeds | `public/index.html:4648-4677` | **UNACCEPTABLE / production-reachable code** | Static Market prices, floors and owners are embedded. |
| `ownedPasses` and `dashboardState` seeds | `public/index.html:4678-4728` | **UNACCEPTABLE / production-reachable code** | Hard-coded owned Passes, listings, earnings and activity exist in shipped frontend. |
| `createDefaultData` | `public/index.html:4729-4787` | **UNACCEPTABLE fallback risk** | Default draft begins as a named demo product; runtime does replace with neutral data after hydration, but this is not isolated. |
| Baldie/demo asset pool | `public/index.html:13403-13555` | **PARTIALLY ACCEPTABLE only for explicit demo surfaces** | Approved seeded/demo use is plausible, but no executable boundary test proves a real fresh draft cannot receive it. |
| `readStore/writeStore` Builder profile | `public/index.html:14408-14478` | **UNACCEPTABLE** | localStorage is a production path; v2 later overrides the writer but the competing authority remains. |
| old localStorage create draft helpers | `public/index.html:5280-5641`, `5937` | **UNACCEPTABLE fallback risk** | v2 comments acknowledge the retired browser-only path; it remains shipped. |
| browser fixture API/provider | `test/browser/webapp.acceptance.spec.mjs` | **ACCEPTABLE test-only** | Isolated in Playwright tests, not shipped. It means those E2E tests are not live backend/chain proof. |
| deployment/release JSON claims | `deployments/MAINNET_RELEASE_CANDIDATE.json` | **ACCEPTABLE evidence artifact, not fresh proof** | Historical claims are not current executable test results. |

## Authority map at baseline

| Concept | Canonical source claimed by implementation | Competing/defect note |
|---|---|---|
| User | PostgreSQL `account` + authenticated session | Server boundary is sound; browser `state.authenticated` is view state only. |
| Wallet | EIP-1193 provider address / server session wallet | UI state can be stale until provider event; no live account-change run. |
| Builder | `account.id` / `builder_profile.account_id` | One profile per account; no support for multiple Builder identities. |
| Product | PostgreSQL `project` content/status | Static `projects` seed competes before/around hydration. |
| Edition | Chain Edition + indexed `edition` projection | Client fetches only certification Edition plus discover summaries. |
| Pass | ERC-721 token ID + `pass_token_projection` | Inline/demo renderer can regenerate visual state. |
| Pass Design | Frozen `passAssignments`/`pass-design.mjs` | `demoFinal`, `nmFastDemoAssignment`, and legacy fields are competing runtime authorities. |
| Artwork | Object storage + media metadata + Edition artwork commitment | Client has inline Baldie assets and IndexedDB draft art. |
| Advantage | `NEX_ADVANTAGE_REGISTRY` + `advantage_state_projection` | No live use/list transfer proof. |
| Advantage remaining state | On-chain registry, indexed projection | Client derives display values from API. |
| Listing | Seaport signed order + Listing Registry + `listing_projection` | Browser fixture order paths are not live settlement proof. |
| Ownership | ERC-721 chain state indexed to DB | Correct claimed authority in `authority.mjs`; not freshly reconciled. |
| Sale | Seaport fill/chain event + projections | Not live verified. |
| Referral | PostgreSQL referral ledger | Frontend adapter exposes only derived amount; not live verified. |
| Royalty | Royalty Vault/chain claims + DB projection | Dashboard primary/royalty display is incomplete. |
| Terms version | Launch Registry on-chain terms snapshot + `terms_version` | Client has terms normalization; no live revision test. |
| Builder Update | PostgreSQL `builder_milestone` | Adapter is wired; no authenticated persistence run. |
| Builder Question | PostgreSQL `builder_question` | Ownership check is in store/API; no direct unauthorized test. |
| Activity | Indexed chain events + DB/social projections | Client currently returns `activity: []` in `buildDashboardData`. |

## Evidence artifacts and commands

### Browser and visual artifacts

- `artifacts/verification/baseline/visual.json` contains authority/production screenshots and DOM metrics at 1440×900.
- `artifacts/verification/baseline/authority-home-1440.png` and `production-home-1440.png` show the same approved hero hierarchy; production adds the live network selector in the header.
- `artifacts/verification/baseline/authority-market-1440.png` shows the authority’s seeded Edition carousel/listings; `production-market-1440.png` shows the production empty state under the intercepted API response, proving the runtime does not simply render the static Market fixture.
- `npm run test:browser` with `NEXMARKETS_TEST_OUTPUT_DIR` redirected into the workspace: **24 executed, 22 passed, 2 failed**. The failures are the two “Owned Pass download produces a 2048 by 2048 PNG” cases; both ended with cancelled download/ENOSPC artifact writes.
- Existing browser overflow coverage checks only five routes at nine widths and passed those cases; it is not the full requested route matrix.

### Source/config evidence

- Approved shell and production entry: `NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html`, `public/index.html:4198-4787`.
- Build authority selection and API bundling: `scripts/build-web.mjs:15-104`.
- Live data bridge: `public/nm-v2-data-bridge.js`.
- Live adapter, routing, auth, hydration and actions: `public/v2-app.mjs:1172-1548`, `2008-2454`.
- API authorization and mutations: `apps/api/src/server.mjs:523-814`.
- Canonical Pass domain: `packages/domain/src/pass-design.mjs`.
- Authority declarations: `packages/domain/src/authority.mjs`.
- Schema: `infra/schema/0001_phase0_authority.sql` through `0007_media_upload_verification.sql`.

### Non-executable historical claims

`deployments/MAINNET_RELEASE_CANDIDATE.json` claims Foundry 71/71, 5,000 serial fuzz runs, Node/Postgres 88/88, six web tests, 34 tables and zero npm audit vulnerabilities. The current workspace cannot reproduce those claims because Foundry/PostgreSQL are unavailable, the current root test result is 118 tests with six skips, and the current build fails. These claims are retained as traceability evidence only.

## Baseline conclusion

The migration has a real API/domain/contract foundation and uses the latest HTML shell, but the evidence does not establish that the full approved experience is connected to the real backend and chain state. The baseline contains critical failures in production fixture isolation, route/detail data authority, Pass/download verification, production network readiness, and unexecuted live transaction/database verification. Repair and re-verification are required before any production certification.
