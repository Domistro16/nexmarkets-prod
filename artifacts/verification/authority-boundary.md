# Authority boundary audit

This inventory classifies the fixture, demo, mock and browser-storage sources found during remediation. The production entrypoint is built from `NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` by `scripts/build-web.mjs`.

## Fixture and demo sources

| Source | Classification | Production reachability | Boundary/evidence |
|---|---|---|---|
| `NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` seed arrays (`projects`, `projectExperience`, `collections`, `listings`, `ownedPasses`, `dashboardState`, `createDefaultData`) | Demo-only | Not reachable in production mode | All seed values are inside `nmFixtureMode`; production initializes empty collections and the API/chain hydration path is authoritative. |
| Inline `fixtureProfiles`, `fixtureCompiled`, demo artwork, `NM_EIGHT_PACKS`, `demoFinal`, `nmFastDemoAssignment`, and legacy Pass wrappers in the approved HTML | Demo-only / historical compatibility | Not reachable for production records | Each demo branch is guarded by `__NEXMARKETS_FIXTURE_MODE__`; current production records use the API/indexer configuration and canonical renderer path. |
| `public/index.html`, `apps/web/public/index.html`, `apps/api/public/index.html`, and `dist/**` copies | Generated deployment output | Same boundary as the approved source | `scripts/build-web.mjs` copies the approved source and injects `false` fixture mode unless `NEXMARKETS_FIXTURE_MODE=true`. |
| `services/indexer/src/fixtures.mjs`, `test/fixtures/**`, and fixture objects in `test/**` | Test-only | Not imported by production server or web bundle | Used by Node, API, Subgraph, and browser tests only. |
| `test/browser/webapp.acceptance.spec.mjs` intercepted API responses and fake EIP-1193 provider | Test-only | Not production reachable | Playwright route interception and provider setup are scoped to the browser test process. They are not transaction evidence. |
| `scratch/**` audit helpers and `artifacts/testnet-certification/**` | Development/evidence-only | Not runtime authorities | Scripts and recorded evidence are not imported by the application. Testnet JSON is validated by `scripts/verify-testnet-certification.mjs`. |
| `packages/contracts/src/MockUSDG.sol` and `scripts/*mock-usdg*` | Development/testnet-only | Forbidden for production configuration | `packages/config/src/networks.mjs` marks the Robinhood testnet token `mock: true`, `testnetOnly: true`, and `productionForbidden: true`; mainnet verification rejects mock settlement. |
| `product-authority/NEXMARKETS_ELITE_RELEASE_CANDIDATE.html` | Historical reference | Not shipped by the build | Retained as a reference artifact; it is not the approved production input. |

## Executable checks

- `test/authority-convergence.test.mjs` evaluates the approved seed block with fixture mode both disabled and enabled. Production mode has zero fixture authorities; fixture mode retains the sample set.
- The same test asserts that the approved production HTML contains no `localStorage.` access and that legacy/demo renderer entrypoints are guarded.
- `npm run verify:authority` binds the generated product to the approved HTML SHA-256.

Any new demo content must be added to a test fixture or to the explicit fixture-mode branch; it must not be used as a fallback for a failed production read.
