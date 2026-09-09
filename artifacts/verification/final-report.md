# NexMarkets Final Implementation Verification, Migration Audit & Production Certification

Capture point: 2026-09-08, Africa/Lagos

This is the post-repair certification report. The historical baseline was captured before source repairs and is preserved at artifacts/verification/baseline-report.md. The baseline verdict was PRODUCTION MIGRATION NOT VERIFIED.

The audit inspected the complete approved HTML authority, rendered it in Chromium, exercised the shipped HTML plus v2-app.mjs, tested the API/domain adapters, inspected the schema/contracts/indexer configuration, and reran the available automated suites. No destructive data operation or production deployment was performed.

## A. EXECUTIVE VERDICT

# PRODUCTION MIGRATION NOT VERIFIED

The implementation has a real API/domain/contract foundation and now loads the latest approved HTML shell, but it is not certified as the application represented by the approved experience.

The verdict is forced by executable evidence:

- No live testnet transaction was executed. The browser mint/list/buy tests use a fake EIP-1193 provider and intercepted API responses; there are no current transaction hashes, contract events, indexer records, database records, or ownership-settlement proofs.
- The shipped production entry still contains hard-coded projects, listings, owned Passes, dashboard state, Create defaults, demo/legacy renderers, and a localStorage Builder-profile authority. The bridge overlays live data after hydration; it does not remove the competing production-reachable code.
- The configured runtime is Robinhood testnet with MockUSDG and productionReady: false. Mainnet deployment is not performed.
- PostgreSQL, migration replay, before/after data retention, Foundry, Anvil, accessibility testing, performance tracing, and the complete two-wallet human journey were not executable in this workspace.
- Multiple Builder identities are structurally unsupported because builder_profile.account_id is unique.
- Dashboard primary proceeds and public Builder volume are still hard-coded or returned as zero rather than being backed by a primary-mint read model.

## B. SCORECARD

| Area | Status | Evidence |
|---|---|---|
| Latest HTML migration | PARTIAL | scripts/build-web.mjs builds public/index.html from the approved HTML; authority hash and Chromium visual snapshots pass. Data/runtime equivalence is incomplete. |
| Backend preserved | PARTIAL | API/domain/contracts/indexer sources and 113 passing Node tests exist; PostgreSQL migration and live chain preservation were not run. |
| Auth | PARTIAL | Server challenge/signature/session/CSRF boundary exists; browser coverage uses a fixture provider and does not cover a real wallet lifecycle. |
| Create 1–6 | PARTIAL | Browser wizard and full draft payload exercise pass; no authenticated real-user database refresh/publish path was proven. |
| Pass authority | FAIL | packages/domain/src/pass-design.mjs is canonical in source, but reachable inline Pass/demo/legacy authorities remain in public/index.html. |
| Random | PARTIAL | Browser audit proves 65 deterministic assignments expose 13 options and five colour indices; persisted lifecycle immutability is not proven. |
| Artwork | PARTIAL | Neutral draft defaults and validated media API exist; storage boundary and fresh-create/demo-art isolation were not fully proven. |
| Preview | PARTIAL | Server validates published artwork and a 24-hour timing floor; live public Preview and bypass rejection were not executed. |
| Debut | NOT VERIFIED | No controlled-clock or live lifecycle transition was executed. |
| Mint | PARTIAL | Prepare/broadcast wiring and calldata tests pass; no real transaction or settlement evidence. |
| Reveal | NOT VERIFIED | No newly minted serial was compared with its pre-publish frozen assignment. |
| Advantage | PARTIAL | Contract/API semantics and local tests exist; no live use/list/cancel/transfer journey. |
| Market | PARTIAL | API listing read model and exact-order validation exist; no live exact listing audit. |
| Listing | PARTIAL | Session ownership, Seaport signature, Zone, counter and policy checks exist; browser proof is fake-provider only. |
| Secondary purchase | PARTIAL | Exact token/order validation is tested locally; no two-wallet live settlement. |
| Download | PARTIAL | Real Chromium Download PNG path passes signature and 2048×2048 checks in the current fixture; five-family pixel comparison was not performed. |
| Dashboard | PARTIAL | All tab routes render and activity is now joined/mapped; real account data and primary proceeds remain incomplete. |
| Builder profile | PARTIAL | Elite public structure and social API are present; all real profiles, persistence and control leakage were not proven. |
| Builder management | PARTIAL | Profile/update/Q&A API authorization and local tests exist; no authenticated browser persistence journey. |
| Responsive | PARTIAL | 24 browser tests pass and document overflow is absent on their route matrix; custom audit still reports transformed-object bounds and broader clipping heuristics. |
| Security | PARTIAL | Server/session/order validation and security tests pass; complete live attack matrix was not run. |
| Performance | NOT VERIFIED | No trace, payload, request, layout-shift or renderer budget was captured. |
| Docs | PARTIAL | Docs/FAQ/Terms surfaces render; field-by-field reconciliation against live network/fee/lifecycle behavior is incomplete. |
| Tests | PARTIAL | Available suites pass, but required contract, database, lint/typecheck, accessibility and live E2E evidence is missing. |

## C. CRITICAL FAILURES

1. Live transaction certification is absent. No current testnet mint, listing, cancellation, secondary purchase, Advantage action, indexer confirmation, or ownership transfer was executed. The fake browser hashes are not transaction evidence.

2. Production is not production-ready. public/config.json selects Robinhood testnet, exposes a MockUSDG settlement token, sets testnetOnly: true, and sets productionReady: false. The release candidate says mainnet custom deployment was not performed.

3. The production bundle is still a second mock application. Static projects, projectExperience, collections, listings, ownedPasses, dashboardState, and createDefaultData remain in the shipped entry. The live bridge replaces data after hydration but does not isolate or delete the competing implementation.

4. Pass configuration has competing reachable authorities. The domain Pass authority, inline NM_EIGHT_PACKS/legacy functions, demoFinal, nmFastDemoAssignment, compatibility aliases, and template renderers can all participate in production rendering. One canonical per-serial persisted renderer path is not proven.

5. Random immutability is unverified. The 65-serial deterministic browser check stops at assignment generation. No assignment was compared through publish, Preview, Debut, mint, reveal, ownership, listing, resale and PNG download.

6. Builder identity is not independent. The schema enforces one builder_profile per account and the profile endpoint edits only the session account. Requirements for multiple Builder identities and switching/authorization cannot pass on this schema.

7. Builder earnings are incomplete. buildDashboardData sets primaryProceeds: 0; launch rows set primary: 0; PostgreSQL profile stats return totalVolumeUsdg: '0'. No primary-mint projection is queried by the dashboard.

8. Database migration and no-data-loss certification are unverified. PostgreSQL is unavailable, six integration tests are skipped, DATABASE_URL is absent, and no realistic old-data migration replay or before/after IDs were checked.

9. The complete human journey is unverified. There is no uninterrupted Builder → public user → holder → Buyer 2 → Builder social journey with two real wallets, persisted state and chain settlement.

10. Required performance, accessibility and full security matrices were not executed. A passing local browser smoke suite is insufficient evidence for those requirements.

## D. NON-CRITICAL DEFECTS

- The custom layout audit found no document-level horizontal overflow on its tested pages, but it found seven desktop routes with raw element bounds exceeding local containers. Most are transformed Pass objects, an internal carousel track, a tooltip, or a 5-pixel product container. At 320px it found one transformed #nmDxFeaturedPass bound. These are measurable QA findings even where the visual object is intentional.
- The same audit reports 12 broad clipping heuristics and three Market button text width flags; its important-text selector was otherwise clean. These need a focused visual/text pass before release.
- The successful production build emits repeated MetaMask SDK empty-glob warnings.
- Root scripts for typecheck, lint, test:unit, test:integration, and test:e2e are absent.
- npm audit --audit-level=high could not reach the registry audit endpoint, so dependency vulnerability status is not certified.
- Visual authority screenshots use the approved static seeded content while production screenshots use intercepted live-style content. Structure is comparable, but data-dependent pixel equality is not a valid conclusion.
- The local Playwright server intentionally clears incomplete object-storage environment variables so the browser harness can exercise the configured local path. That is test-harness behavior, not production storage proof.

## E. MIGRATION EVIDENCE

### Approved authority and build evidence

- Approved file: NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html.
- Current SHA-256: 7fbd5c3017b663b05ff9b57cd90802089a8b280fa66d09285c56a18bdd2444f8.
- npm run verify:authority: PASS with the same hash.
- scripts/build-web.mjs reads that file, appends only the hydration/data bridge and v2-app.mjs, writes the checked-in and deployment web entries, and bundles the API.
- public/index.html has the expected bridge/module append. Its body is the approved HTML body, but the approved body itself contains the prototype fixture and compatibility code catalogued below.
- The authority body marker is data-nm-foundation="elite-v1".

### Latest HTML surface → production route → production runtime

This product uses the approved static HTML surface plus v2-app.mjs/nm-v2-data-bridge.js; it does not use one React component per route. PASS in the structure column means the DOM surface and hierarchy were rendered. It does not mean the data or transaction requirement passed.

| Latest HTML surface | Production route | Production component/runtime | Structure | Hierarchy | Functionality | Responsive | Mock replacement |
|---|---|---|---|---|---|---|---|
| Home #home | / | Inline Home renderer, goView, projectModel, live hydration | PASS | PASS | PARTIAL | PARTIAL | FAIL |
| Discover #discover | /discover | Inline Discover renderer, /v1/discover, content join | PASS | PASS | PARTIAL | PARTIAL | PARTIAL |
| Launch detail #project | /projects/:slug or /projects/:editionAddress | routeInfo, loadRequestedRouteData, projectModel | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Builder profile #builder | Builder navigation; no dedicated /builders/:id route | Elite Builder renderer plus /v1/builders/:id adapter | PASS | PASS | PARTIAL | NOT VERIFIED | FAIL |
| Market #market | /market | Market renderer plus /v1/market/listings | PASS | PASS | PARTIAL | PARTIAL | PARTIAL |
| Edition/collection #collection | /editions/:editionAddress | Collection renderer plus /v1/editions/:address | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Exact listing #listing | /listings/:orderHash | Listing renderer plus exact order lookup | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Owned Pass #owned | /dashboard/holder?view=owned | Owned renderer plus /v1/me/passes | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Dashboard Overview | /dashboard/holder | Dashboard renderer and live dashboard adapter | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Dashboard Passes | /dashboard/passes | Dashboard tab passes | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Dashboard Advantages | /dashboard/advantages | Dashboard tab advantages | PASS | PASS | PARTIAL | PARTIAL | PARTIAL |
| Dashboard Listings | /dashboard/listings | Dashboard tab listings | PASS | PASS | PARTIAL | PARTIAL | PARTIAL |
| Dashboard Launches | /dashboard/launches | Dashboard tab launches | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Dashboard Earnings | /dashboard/earnings | Dashboard tab earnings | PASS | PASS | FAIL for primary proceeds | NOT VERIFIED | PARTIAL |
| Dashboard Activity | /dashboard/activity | Dashboard tab activity, mapped builder.activity | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Dashboard Builder profile | /dashboard/builder | Elite management surface plus profile API | PASS | PASS | PARTIAL | NOT VERIFIED | FAIL |
| Create Phase 1 Product | /create | renderCreate stage 1, draft autosave | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Create Phase 2 Edition & Economics | /create | renderCreate stage 2, draft validation | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Create Phase 3 Advantage | /create | renderCreate stage 3, normalized advantage payload | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Create Phase 4 Pass Design/artwork | /create | renderCreate stage 4, canonical/legacy adapter | PASS | PASS | PARTIAL | NOT VERIFIED | FAIL |
| Create Phase 5 Launch timing | /create | renderCreate stage 5, Preview timing | PASS | PASS | PARTIAL | PARTIAL | PARTIAL |
| Create Phase 6 Review/publish | /create | Review renderer plus /v1/builder/projects | PASS | PASS | PARTIAL | NOT VERIFIED | PARTIAL |
| Docs | /docs | Docs renderer | PASS | PASS | PARTIAL | NOT VERIFIED | NOT APPLICABLE |
| FAQ | /faq | FAQ renderer | PASS | PASS | PARTIAL | NOT VERIFIED | NOT APPLICABLE |
| Terms | /terms | Terms renderer | PASS | PASS | PARTIAL | NOT VERIFIED | NOT APPLICABLE |

Route repairs made after baseline are present in apps/web/public/v2-app.mjs: routeInfo, goView, loadRequestedRouteData, and pathForRoute preserve exact project/edition/pass/listing URLs and no longer select the first project for an unmatched detail route. API content joins are in apps/api/src/server.mjs and the two store implementations.

### Repairs made after baseline

1. Goldsky/subgraph Edition rows now join the published PostgreSQL Project content by Edition address before the frontend builds the public model. Regression coverage is in test/api-project-content-join.test.mjs.
2. Builder dashboard activity now comes from the persisted activity query and is mapped into the template dashboard. Regression coverage extends test/api-social.test.mjs.
3. Exact detail/listing/Owned URLs no longer silently fall back to the first known Project.
4. Discover schedule descriptions now wrap in the shared live-data style injection. The focused layout diagnostic confirmed the previous nowrap width issue was removed.
5. The local browser harness clears only incomplete storage configuration so it can run its fixture flow; the API storage module still fails closed on partial production configuration.

These repairs improved the implementation, but none removes the critical failures above.

### Authority map

| Concept | Canonical source of truth | Competing authority or audit result |
|---|---|---|
| User | PostgreSQL account plus authenticated server session | Client state.authenticated is view state; live wallet session was not run. |
| Wallet | EIP-1193 provider address bound to server session and chain | Client can hold stale view state until provider events; account-change/disconnect matrix not run. |
| Builder | PostgreSQL builder_profile linked to account | Account is unique in schema; multiple Builder identities are not supported. |
| Product | PostgreSQL project.content, status and object-storage references | Inline projects/projectExperience fixtures remain reachable. |
| Edition | On-chain Edition plus Goldsky/PostgreSQL projection | Public API now joins Project content; live chain consistency not run. |
| Pass | ERC-721 Edition/token ID and indexed Pass projection | Inline/demo renderers can regenerate visual state independently. |
| Pass Design | Frozen passAssignments validated by packages/domain/src/pass-design.mjs | Inline NM_EIGHT_PACKS, demoFinal, nmFastDemoAssignment, and legacy compatibility code remain reachable. |
| Artwork | Object storage/media metadata plus Edition artwork commitment | Demo/Baldie pool and draft compatibility paths remain in shipped HTML. |
| Advantage | NexAdvantageRegistry plus indexed projection | No live use/list/cancel transfer test. |
| Advantage remaining state | On-chain Registry state indexed into DB | Frontend only derives display values from API; no live reconciliation. |
| Listing | Seaport signed order, NexListingRegistry, and listing projection | Browser listing proof uses intercepted API/provider. |
| Ownership | ERC-721 chain state indexed to pass_token_projection | No current live post-mint/post-sale owner record. |
| Sale | Seaport fulfillment and chain/indexer events | No current live secondary settlement. |
| Referral | PostgreSQL referral ledger; on-chain hint is noncanonical | No live attribution/settlement test. |
| Royalty | NexRoyaltyVault claims and indexed royalty projection | Dashboard primary proceeds does not have an equivalent primary-mint projection. |
| Terms version | NexLaunchRegistry terms snapshot and terms_version mirror | Live publish/revision behavior not executed. |
| Builder Update | PostgreSQL builder_milestone | API and local social test pass; browser persistence not run. |
| Builder Question | PostgreSQL builder_question | API ownership check is tested; public/dashboard browser path not run. |
| Activity | Indexed/DB activity plus social projections | Store and adapter now expose activity, but full account journey was not run. |

The intended canonical declaration is also explicit in packages/domain/src/authority.mjs; the problem is that the shipped template still contains competing reachable authorities.

### Requirement-by-requirement matrix

| Requirement | Status | Evidence and limitation |
|---|---|---|
| 1. Reference authorities | PARTIAL | Approved HTML was fully inspected, hashed and rendered. Functional sources exist in API/domain/contracts/indexer, but a complete old-application-to-current authority comparison was not executable. |
| 2. Verify before modifying | PASS | artifacts/verification/baseline-report.md records the pre-repair state and was captured before source repairs. |
| 3. Latest HTML migration | PARTIAL | Build source is the latest HTML and visual surfaces render; live behavior/data is incomplete. |
| 4. Not a second mock application | FAIL | Production-reachable fixture arrays, legacy functions and localStorage profile code remain in the shipped entry. |
| 5. One source of truth | PARTIAL | Domain authority is declared, but multiple Pass/demo/profile authorities remain reachable. |
| 6. Authentication/account | PARTIAL | Server verifies nonce-bound wallet signatures and issues HttpOnly/CSRF session; no real wallet lifecycle matrix. |
| 7. Six-phase Create | PARTIAL | Browser exercises stage transitions and full draft payload; no real persisted account refresh/publish proof. |
| 8. Create artwork cleanliness | PARTIAL | Neutral source defaults and media validation exist; fresh no-artwork vs demo-art boundary not fully executed. |
| 9. Random mode | PASS | Browser functional audit exercised Random OFF → ON → OFF: manual selector counts 3/1 → 0/0 → 3/1, ARIA state changed, and audit errors were empty. |
| 10. Random assignment math | PARTIAL | Browser audit recorded 65 assignments, all 13 option IDs and colour indices 0–4, deterministic and serial-stable; persistence is unverified. |
| 11. Random immutability | NOT VERIFIED | No complete lifecycle comparison for one serial. |
| 12. Canonical Pass configuration | FAIL | pass-design.mjs is not the only reachable renderer/config authority. |
| 13. Public Pass performance | PARTIAL | Chromium counts were captured; no performance traces or payload budgets. |
| 14. Home hero authority | PARTIAL | Browser audit found heroLockCount: 4; repeat navigation/resize/rotation exclusion was not fully run. |
| 15. Demo-art authority boundary | FAIL | Baldie/demo pool is shipped and production-reachable; no fresh-create isolation proof. |
| 16. Download end to end | PARTIAL | Real Chromium Download PNG button path passed current fixture and IHDR 2048×2048 checks; five families and pixel comparison were not performed. |
| 17. Download composition | NOT VERIFIED | No representative family-by-family pixel/balance comparison. |
| 18. Preview | PARTIAL | Server enforces approved media and a 24-hour explicit timing minimum; live public/bypass test absent. |
| 19. Debut | NOT VERIFIED | No controlled clock or chain lifecycle transition. |
| 20. Mint/primary acquisition | PARTIAL | Prepare/broadcast wiring and fake-provider browser test pass; no real chain transaction. |
| 21. Reveal | NOT VERIFIED | No minted Pass compared to pre-publish frozen assignment. |
| 22. Advantage | PARTIAL | Local contract/API semantics exist; live remaining/use/list lock/re-enable path absent. |
| 23. Listing | PARTIAL | API validates session seller, order hash, signature, Zone and policy; no live settlement. |
| 24. Exact secondary purchase | PARTIAL | Exact token/order validation exists; no two-wallet transfer proof. |
| 25. Stale listing | PARTIAL | Local stale/expired/transferred rejection tests exist; no current live stale listing scenario. |
| 26. Builder profile rebuild | PARTIAL | Elite public markup and API adapter render; every current profile and owner-control leak not fully tested. |
| 27. Independent Builder identity | FAIL | builder_profile.account_id is unique; product/profile model does not support independent identities. |
| 28. Dashboard → Builder profile | PARTIAL | PUT endpoint, media checks and adapter exist; authenticated refresh/public reflection not browser-proven. |
| 29. Multiple Builder identities | FAIL | Schema and endpoint are account-singleton; unauthorized alternate identity test cannot pass as specified. |
| 30. Builder updates | PARTIAL | Persisted milestone API and dashboard activity test pass; browser journey not run. |
| 31. Builder Q&A | PARTIAL | API persistence/ownership test passes; public question → dashboard answer browser path not run. |
| 32. Discover | PARTIAL | API, filters/model route and content join exist; every current launch/filter combination not tested. |
| 33. Individual launch responsiveness | NOT VERIFIED | Nine-width custom check was not run for every current launch. |
| 34. Market | PARTIAL | Listing API and exact model exist; no live listing data/collection grouping audit. |
| 35. Dashboard | PARTIAL | All tabs route/render and activity mapping is repaired; real account data/primary earnings incomplete. |
| 36. Site-wide responsiveness | PARTIAL | Browser suite covers five routes × nine widths and no document overflow; custom 20-route desktop audit still finds local bounds. |
| 37. Text | PARTIAL | Important heading/body/control selector found no text overflow in the custom audit, but broad clipping reports 12 cases and Market reports three width flags. |
| 38. Buttons and controls | PARTIAL | Wizard/control surfaces render; complete computed-height, sticky-cover and touch-target audit absent. |
| 39. State cleanup | FAIL | Legacy design/demo/localStorage state remains reachable in the production document. |
| 40. Network/contract configuration | FAIL | Config validation passes structurally, but runtime is testnet-only/MockUSDG/productionReady false and Base Sepolia has no subgraph. |
| 41. Fees | PARTIAL | Contract/domain constants and order tests cover 5% primary, 1% secondary and 0–5% royalty bounds; frontend/dashboard duplication and primary proceeds are incomplete. |
| 42. Contract tests | NOT VERIFIED | forge test cannot run because Foundry is not installed. |
| 43. Frontend/backend tests | PARTIAL | Available Node/API/web/subgraph/browser/build checks pass as listed; required named scripts are absent and live integrations skipped. |
| 44. Database migration | NOT VERIFIED | Seven migrations/38 tables validate statically; PostgreSQL replay was not run. |
| 45. No data loss | NOT VERIFIED | No before/after representative DB records were queried. |
| 46. File storage | PARTIAL | Media module and browser fixture upload/complete flow exist; invalid/oversize/failure/retry/real object-storage matrix absent. |
| 47. Security | PARTIAL | Session/CSRF/order/calldata checks and local tests pass; full direct attack matrix/live session replay not run. |
| 48. Performance | NOT VERIFIED | No trace/payload/renderer/layout-shift artifact. |
| 49. Accessibility | NOT VERIFIED | No axe or equivalent accessibility run and no full keyboard evidence. |
| 50. Docs against product | PARTIAL | Docs/FAQ/Terms render; network, USDG, fee, Preview, Debut, Market, Advantage, listing lock, referral and royalty claims were not reconciled field-by-field. |
| 51. Visual regression | PARTIAL | 15 authority and 15 production snapshots at 1440×900 were captured with zero audit errors; no pixel-diff threshold or all-width screenshot set. |
| 52. Complete human journey | FAIL | No uninterrupted two-wallet persisted-chain journey. |
| 53. Failure policy | FAIL | Critical requirements remain unverified or contradicted. |
| 54. Final report | PASS | This post-repair report contains the required A–J sections, evidence, statuses and gap list. |

## F. TEST RESULTS

| Exact command | Result |
|---|---|
| cmd /c npm test | PASS — 119 tests, 113 pass, 0 fail, 6 skipped, 0 cancelled. The six skips are PostgreSQL/indexer/Goldsky integration cases. |
| cmd /c npm run test:api | PASS — 34 tests, 34 pass, 0 fail, 0 skipped. |
| cmd /c npm run test:web | PASS — 10 tests, 10 pass, 0 fail, 0 skipped. |
| cmd /c npm run subgraph:test | PASS — 2 tests, 2 pass, 0 fail, 0 skipped. |
| cmd /c npx playwright test --config test/playwright.config.mjs --trace=off | PASS — 24 tests, 24 pass, 0 fail, 0 skipped; desktop and mobile projects, 2 workers. Artifact: artifacts/verification/browser-final2/browser-acceptance.json. |
| cmd /c npm run verify:authority | PASS — approved HTML SHA-256 7fbd5c3017b663b05ff9b57cd90802089a8b280fa66d09285c56a18bdd2444f8. |
| cmd /c npm run verify:config | PASS — Robinhood mainnet/testnet and Base mainnet/Sepolia bootstrap files validate. |
| cmd /c npm run verify:schema | PASS — 7 migrations, 38 required tables. |
| cmd /c npm run verify:goldsky | PASS — GOLDSKY_SUBGRAPH_PRIMARY_TURBO_DEPRECATED, 22 events, Robinhood mainnet/testnet. |
| cmd /c npm run security:secrets | PASS — 378 files scanned, 0 secrets found. |
| cmd /c npm run verify:production | PASS only as a non-deployment check — deployment: NOT_PERFORMED, governance RAISE_THRESHOLD_TO_2_PLUS; it is not production certification. |
| node --check apps/api/src/memory-store.mjs; node --check packages/data/src/postgres-store.mjs; node --check apps/web/public/v2-app.mjs | PASS — all three syntax checks. |
| cmd /c npm run build in the default sandbox | FAIL at API esbuild because the environment denied access while resolving api-src/v1/[...slug].js, healthz.js, and readyz.js. |
| cmd /c npm run build rerun with required filesystem permission | PASS — {"status":"PASS","app":"@nexmarkets/web","routes":9,"output":"public","bundledApi":true}; repeated MetaMask empty-glob warnings remain. |
| forge test | NOT RUN — forge command is unavailable. |
| anvil --version | NOT RUN — anvil command is unavailable. |
| psql --version | NOT RUN — PostgreSQL client is unavailable. |
| cmd /c npm run db:migrate | FAIL/NOT RUN — DATABASE_URL is required. |
| cmd /c npm run typecheck, lint, test:unit, test:integration, test:e2e | NOT RUN — those npm scripts do not exist. |
| cmd /c npm audit --audit-level=high | NOT CERTIFIED — registry audit endpoint failed; this is not a clean audit result. |

Historical counts in deployments/MAINNET_RELEASE_CANDIDATE.json were not treated as current evidence. Its Foundry and Postgres claims are not substitutes for the unavailable current executions.

## G. VISUAL QA

### Captured artifacts

- Authority and production screenshots: artifacts/verification/final-visual/.
- Visual JSON: artifacts/verification/final-visual/visual.json.
- Functional route/layout JSON: artifacts/verification/post-repair-functional/report.json.
- Baseline screenshots and pre-repair report: artifacts/verification/baseline/ and artifacts/verification/baseline-report.md.

The final visual audit captured 15 authority snapshots and 15 production snapshots at 1440×900:

- Home
- Discover
- launch detail
- Builder profile
- Market
- Edition/collection
- exact listing
- Owned
- Dashboard
- Create phases 1 through 6

The visual audit returned errors: []. Structure and hierarchy are recognizably the approved elite surface. The production Home screenshot includes the live network selector, and production data is intentionally different from the authority’s static seeded data. That proves shell adoption and rendering, not functional equivalence.

### Widths and measurable layout results

The browser acceptance test checked document overflow for five public routes at:

1440, 1180, 1024, 900, 860, 768, 600, 390, and 320px.

The custom post-repair audit checked 20 routes at 1440px and Discover at the same nine widths. It recorded:

- route count: 20
- responsive widths: 9
- route overflow findings: 7
- responsive overflow findings: 1 at 320px
- broad clipped-text findings: 12
- important-text findings: 0 in its focused selector
- maximum active iframes: 5
- audit errors: 0
- hero lock count: 4

The raw findings are primarily transformed Pass bounds, the Market internal carousel track, Create banner natural sizing, the listing tooltip, and dashboard line-box metrics. They remain reportable until a focused visual review proves each is an intentional internal rail or is repaired.

## H. E2E TRANSACTION EVIDENCE

NONE — no live testnet transaction was executed; therefore no current transaction hashes, contract events, indexer events, persisted DB records, ownership changes, Advantage transfers, listing fills, or seller/buyer dashboard settlement records can be included.

The browser tests titled:

- live mint flow sends committed Terms and broadcasts the prepared transaction
- live listing flow reads the exact owned Pass, signs Seaport data, and registers the order
- live buy flow requires the signed listing and broadcasts Seaport fulfillment

all use a test fixture API/provider. They prove request/calldata wiring, not network settlement. Historical hashes in release/deployment JSON were excluded from this section because they were not generated by this verification run.

## I. REMAINING MOCKS

| Fixture/mock or duplicate authority | Location | Classification |
|---|---|---|
| projects seed array | public/index.html, projects declaration | UNACCEPTABLE — production-reachable in the shipped document. |
| projectExperience seed | public/index.html, projectExperience declaration | UNACCEPTABLE — hard-coded product/about/Advantage content remains reachable. |
| collections and listings seed arrays | public/index.html, collections/listings declarations | UNACCEPTABLE — static Market prices, owners and states remain shipped. |
| ownedPasses and dashboardState | public/index.html, ownedPasses/dashboardState declarations | UNACCEPTABLE — hard-coded ownership, listings, earnings and activity remain shipped. |
| createDefaultData | public/index.html, Create default declaration | UNACCEPTABLE fallback risk — the live adapter later publishes neutral data, but the default is not isolated. |
| Baldie/demo artwork pool | public/index.html, demo pool and demoFinal functions | PARTIALLY ACCEPTABLE only for explicit demo surfaces; currently production-reachable and fresh-Create isolation is not proven. |
| NM_EIGHT_PACKS and inline Pass family tables | public/index.html | UNACCEPTABLE duplicate authority — these are current-looking options but independently define renderer behavior beside pass-design.mjs. |
| demoFinal, nmFastDemoAssignment, legacy renderer aliases | public/index.html | UNACCEPTABLE duplicate production-reachable Pass engines. |
| readStore/writeStore Builder profile | public/index.html, nexmarkets_builder_profiles_v2 | UNACCEPTABLE — localStorage remains a profile authority path. |
| Retired localStorage Create/social helpers | public/index.html | UNACCEPTABLE fallback/compatibility path. |
| Browser API and provider fixtures | test/browser/webapp.acceptance.spec.mjs | ACCEPTABLE — test-only and not shipped; explains why browser transaction tests are not live proof. |
| Release candidate historical claims | deployments/MAINNET_RELEASE_CANDIDATE.json | ACCEPTABLE as traceability metadata only; not runtime state or fresh evidence. |
| apps/web/public/app.mjs | Build-time checked legacy app | HISTORICAL/UNREFERENCED by the current HTML module entry, but it remains in the build workspace and is still scanned by the build script. |

The existence of a bridge does not change the classification of shipped competing code. The requirement was that actual production paths use real backend/chain state, not merely that live data can overwrite fixture state after boot.

## J. FINAL GAP LIST

Before production certification, the implementation still needs:

1. A final approved production network configuration with deployed, verified contracts, correct settlement token, complete subgraph/indexer configuration, strict primitive checks, and an explicit production approval record.
2. A real PostgreSQL environment and migration replay against a realistic pre-migration dataset, including before/after verification for User, Builder, Project, Edition, Pass, Listing and Advantage records.
3. Removal or hard isolation of all shipped fixture arrays, localStorage profile/create authorities, legacy Pass engines and duplicate renderer/config tables. Production should have one data authority and one canonical Pass compiler/renderer.
4. A persisted per-Edition/per-serial frozen assignment record containing family, material, palette, artwork, position, logo, serial and renderer version, then use that record for Preview, Debut, mint, reveal, Owned, Market, listing and PNG download.
5. A production primary-mint projection and dashboard aggregation for gross primary sales, protocol fee and Builder proceeds. Remove the hard-coded zero fields and derive all fee/economics displays from shared policy/data.
6. A Builder identity model that supports multiple identities per account where required, explicit Builder selection in projects and social endpoints, and authorization tests for cross-identity edits.
7. Live testnet execution with two funded wallets: signed auth, Create/Preview, controlled Debut, mint, reveal, Advantage use, listing, ask update, cancel, relist, exact secondary purchase, transfer, and dashboard/activity verification. Record every hash/event/indexer/DB result.
8. Negative live tests for wrong network, rejected signature, insufficient balance, duplicate click, pending refresh, stale listing, alternate token, price/supply manipulation, listed Advantage use, expired session, replay, invalid signature and unauthorized social/media actions.
9. Five-family Download PNG evidence with actual downloaded files, pixel/config comparison, exact palette/artwork/serial checks and representative artifacts at 2048×2048.
10. Full storage testing for avatar/logo/single artwork/collection artwork, invalid MIME, oversize, failed upload, retry, checksum and persistence against the real object store.
11. Full nine-width responsive testing for every current launch, Builder profile, Edition, listing, Owned and Dashboard screen, followed by repair of every non-intentional raw bound/clipping result.
12. Performance traces and budgets for Home, Discover, Market, Dashboard, Builder profile and Create: JS payload, image payload, requests, layout shifts, render blocking, renderer count and iframe count.
13. Automated accessibility plus keyboard testing for header, dialogs, Create forms, tabs, toggles, Market actions, Dashboard and Builder profile.
14. Docs/FAQ/Terms reconciliation against the final network, USDG/USDC, fees, Preview, Debut, Market, Advantage, listing lock, referral and royalty behavior.
15. Contract test execution with Foundry, database/indexer integration execution, and explicit root scripts for typecheck, lint, unit, integration and E2E checks.
16. One uninterrupted human-journey run with no manual state editing, followed by a final rerun of all critical-path tests.

Known critical and major implementation gaps remain after this verification. Production certification must not be issued.
