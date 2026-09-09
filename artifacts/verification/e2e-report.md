# NexMarkets human-journey E2E verification

- Status: **BLOCKED**
- Scope: the original Builder-to-holder journey was assessed against the repaired authority boundaries. No DevTools state mutation was used, and no synthetic transaction hash is treated as live-chain evidence.
- Browser regression coverage: Playwright **24/24 passed** after the authority synchronization repair. Those tests use intercepted API responses and fake EIP-1193 providers where documented; they are regression evidence, not a production journey certification.

| Journey step | Evidence inspected | Result |
|---|---|---|
| Builder profile | API profile/Q&A tests; multi-Builder identity test | PASS at API/domain boundary; no live authenticated journey |
| Product and Create 1–6 | Create round-trip and browser Create tests | PASS for persistence/validation and browser regression; full live six-step journey not run |
| Artwork and Random | Media provenance tests; deterministic assignment tests | PASS at domain/API boundary; no live user journey |
| Preview, Publish and Debut | Published-content join tests; existing Edition/Terms receipts | PASS for existing chain record; fresh API-backed publish journey unavailable |
| Discover, launch page and Builder profile | 24/24 browser regression; existing chain Edition; local API read-model response | PASS for regression shell and API corroboration |
| Primary purchase and reveal | Existing primary receipt and `PrimaryMintSettled` event; RPC owner/TBA/Advantage reads | PASS for historical testnet evidence; no new transaction submitted because the fixed certification Edition is already minted |
| Dashboard and Pass download | Desktop/mobile Playwright download tests | PASS with repaired canonical content handoff; live authenticated dashboard not certified |
| Advantage use and listing | Existing Advantage/listing state and API negative tests | PASS for recorded chain state and API boundary |
| Change ask | No replacement-order transaction hash in the supplied lifecycle artifact | **NOT PROVEN** |
| Delist, relist and secondary purchase | Existing cancellation, relist, fill and stale-listing receipts; current RPC/Subgraph state | PASS for recorded historical testnet lifecycle |
| Second-wallet ownership and Advantage transfer | Secondary buyer event, current owner, Advantage remaining state | PASS for recorded historical chain state; no fresh two-wallet journey |
| Builder update, public question and answer | Builder social/Q&A API tests | PASS at API/domain boundary; no live authenticated journey |

## External certification blockers

1. The fixed certification Edition already contains the recorded mint, so this run did not submit another primary purchase or fabricate a replacement change-ask transaction. A fresh certification fixture and funded wallets are required for a new live journey.
2. No change-ask/replacement-order transaction exists in the supplied lifecycle evidence.
3. Independent recertification has not returned `PRODUCTION MIGRATION VERIFIED`.

## Cleared infrastructure blockers

- PostgreSQL migrations 0001–0009 were applied through the configured direct endpoint. The isolated before/after verifier passed with preserved counts, IDs, values and zero integrity violations.
- The local API is running at `http://127.0.0.1:4020`; `/healthz`, `/readyz`, and the certification Pass endpoint return HTTP 200.
- The API-backed testnet validator reports API `PASS`, Goldsky `PASS`, all 10 receipts valid, and all event/state checks passing.

## Related evidence

- Chain receipt/state validator: `artifacts/verification/testnet-certification.md`
- Browser regression: `artifacts/verification/browser-final2/browser-acceptance.json`
- Performance: `artifacts/verification/performance-report.md`
- Accessibility: `artifacts/verification/accessibility-report.md`
- Security: `artifacts/verification/security-report.md`
- Database migration: `artifacts/verification/database-migration-report.md`
