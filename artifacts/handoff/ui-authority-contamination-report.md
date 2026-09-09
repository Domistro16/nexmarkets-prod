# UI-authority contamination report

## Classification

`NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` is **MODIFIED_BY_CODEX — NOT
AUTHORITATIVE**. The approved authority is external to this repository and was
not supplied in the working tree at freeze time. This report therefore
preserves evidence; it does not assess whether any modification improved the
interface.

The current source was copied byte-for-byte to
`artifacts/handoff/NEXMARKETS_V2_BUILDER_PROFILE_ELITE_CODEX_MODIFIED.html`.

## Current source evidence

| Item | Observation |
|---|---|
| Path | `NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` |
| Git status | `?? NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` (untracked) |
| Tracked in HEAD | No |
| Current SHA-256 | `34bac0e30e66e2d0f675d71d2a22033e6b176b3351320bc1e5b97212d41d8308` |
| Current size | 4,010,788 bytes |
| Current line count | 14,531 (PowerShell `Get-Content` count) |
| Creation/last-write observed | 2026-09-08 13:08:31 / 2026-09-09 07:46:59 (local filesystem time) |
| Git path history | `git log --all -- NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` returned no commits |
| Preserved copy | Same hash and size; see the handoff artifact named above |

## Recoverability of the pre-run source

No authoritative preimage exists in the current Git object history or in a
second repository copy. An exact Codex-vs-approved byte diff is therefore not
recoverable from this checkout. The following are historical *candidates*, not
confirmed preimages:

* The modified `SHA256SUMS` currently records `8c00aee0b6a3dcb9d520ac313880de00b3bd3f27180c2bb6e62334a8130801f6` for this path. The checksum file itself is a working-tree modification and no file with that digest is available here.
* `artifacts/verification/final-report.md` records an earlier observed digest
  `7fbd5c3017b663b05ff9b57cd90802089a8b280fa66d09285c56a18bdd2444f8`.
  That report is stale evidence and its preimage is not present.
* The tracked file
  `product-authority/NEXMARKETS_ELITE_RELEASE_CANDIDATE.html` has hash
  `24daa3e2afc280690db3d213f953334b10cf92309f2698552c5db543b00b90a6` and is
  a different filename/content; it is not used as a V2 preimage.

The exact available Git representation of the current untracked file is in
`artifacts/handoff/ui-authority-current-untracked.diff`. It was generated with
`git diff --no-index --binary -- /dev/null NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html`
(exit code 1, as expected for a difference) and is a full-add diff, not a
pre-run modification diff.

## Exact Git/config evidence of authority changes

The following changes are directly recoverable from `git diff` against HEAD:

```diff
-  "file": "NEXMARKETS_ELITE_RELEASE_CANDIDATE.html",
-  "sha256": "24daa3e2afc280690db3d213f953334b10cf92309f2698552c5db543b00b90a6",
+  "file": "NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html",
+  "sha256": "34bac0e30e66e2d0f675d71d2a22033e6b176b3351320bc1e5b97212d41d8308",
```

This same authority switch appears in both `docs/authority/product-authority.json`
and `packages/config/src/networks.mjs`. `scripts/verify-product-authority.mjs`
also changed its default candidate from
`../product-authority/NEXMARKETS_ELITE_RELEASE_CANDIDATE.html` to
`../NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html`. `SHA256SUMS` gained a V2 path
entry, but the recorded `8c00...` digest does not match the current file.

The current `README.md`, generated API/readiness bundles, deployment bootstrap
metadata, and verification artifacts contain the newer `34ba...` digest. Those
references are propagation of the working-tree authority switch, not proof of
an external approval.

## Current-file modifications and staged blocks

Because the V2 source has no Git preimage, the following is an inventory of
the identifiable staged blocks present in the contaminated file. Start lines
are from the frozen 14,531-line copy. The IDs/comments and the remediation
reports establish that these were introduced during the implementation run;
the list is not presented as a byte-perfect diff against the missing external
source.

### CSS/style blocks

* Lines 7–41: `nm-pass-atomic-critical` iframe boot/geometry gate.
* Lines 3047–4130: staged foundation, Home, Create, collection-artwork,
  Discover, banner/compact corrections, and hero-performance refinements
  (`nm-elite-foundation-stage1`, `nm-elite-home-stage2`,
  `nm-create-elite-stage3`, `nm-create-stage32-refinement`,
  `nm-stage33-collection-artwork`, `nm-elite-discover-stage4-css`,
  `nm-stage41-discover-banner-lock`, `nm-stage42-discover-compact-correction`,
  `nm-home-hero-performance-refinement`).
* Lines 6924–8111: Pass embed mode, Market 1.0, real Pass thumbnail,
  Dashboard 1.0, and project mint/owned-page styling.
* Lines 8297–8697: V2 lifecycle/network, stage-10 repair, project detail/video
  flow, and responsive completion blocks.
* Lines 8698–13297: staged Pass visual, Home, Discover, Market, exact-Pass,
  interaction, dashboard, owned, docs/FAQ/Terms, social, eight-pack, and
  embed styling (`nm-v2-stage2-pass-visual-style` through
  `nm-nexmarkets-embed`).
* Lines 13298–14530: random-pass authority, demo variety, atomic runtime,
  Create six-phase UI/UX fixes, launch-detail corrections, sitewide UI audit,
  and Builder-profile styling.

### JavaScript/runtime blocks

The current file contains script blocks beginning at lines 4198, 6877, 6919,
7068, 7326, 7539, 7887, 8112, 8343, 8532, 8598, 8709, 8823, 8977, 9130,
9253, 9428, 9782, 10007, 10538, 11112, 11339, 11425, 11623, 11769, 11957,
12164, 12206, 12270, 12378, 12792, 13231, 13255, 13306, 13353, 13431,
13584, 13615, 13767, 14059, and 14430. Their IDs identify the corresponding
authority binding, foundation/hydration, lifecycle/network, staged visual
runtime, Market/Dashboard/Owned flows, Docs/FAQ/Terms, social, eight-pack and
native renderer, demo-art, PNG export, Create random toggle, and Builder
profile manager changes.

Notable concrete behaviors visible in those blocks:

* `nmFixtureMode`, `__NEXMARKETS_FIXTURE_MODE__`, `nmFastDemoAssignment`, and
  `data-nm-fixture-project` define fixture/demo branches.
* `NM_PASS_AUTHORITY`, `NM_EIGHT_PACKS`, `NM_RANDOM_PASS_POOL`, seeded random
  assignment, native Pack mounting, and `nmDashboardExportV2` define Pass and
  download behavior.
* Create artwork import/mapping/placeholder functions and IndexedDB helpers
  (`NM_ART_DB`) define artwork handling.
* Builder profile/social/dashboard functions include profile editing, updates,
  questions, answers, and public-profile routing; a later callback delegates
  some profile saves to `__nmV2SaveBuilderProfile`.

## Requested modification categories

| Category | Evidence in current copy | Forensic conclusion |
|---|---|---|
| CSS | Dozens of `nm-*` style blocks and Pass/layout overrides listed above | Present; exact original-vs-current declarations cannot be reconstructed without the external preimage |
| JavaScript | Staged runtime IDs, fixture/demo branches, lifecycle, Pack, export, social and Builder callbacks | Present; exact original-vs-current statements cannot be reconstructed without the external preimage |
| Builder profile | `nm-elite-builder-profile-style`, `nm-elite-builder-profile-runtime`, `nmDashboardBuilderProfile`, `/builders` adapter callbacks | Present in contaminated copy |
| Pass system | `NM_PASS_AUTHORITY`, eight-pack tables, seeded random assignment, native Pack renderer, export runtime | Present in contaminated copy |
| Artwork/demo art | 35 `data:image/` occurrences, inline logo/art fallbacks, `Baldie` marker occurrences, placeholder and dynamic media helpers | Inline/fallback/demo art logic remains; no tracked binary art preimage is available |
| Network/config text | Current source has no literal `Base Sepolia` string; it has 29 `Robinhood` and 18 `USDG` matches plus one `USDC` match | Network behavior is primarily injected/implemented by runtime/config, not conclusively attributable to this HTML alone |
| Data bridge/hydration | Source itself has no `nm-v2-data-bridge` tag; current `scripts/build-web.mjs` injects the bridge, hydration style, fixture flag, and `/v2-app.mjs` | Build/runtime hydration is coupled to the contaminated source |
| Cleanup/removals | Comments such as “Consolidated historical release refinements” and multiple override blocks; no preimage | Removed/cleaned content cannot be identified exactly from this checkout |

## Did the modifications reach production entrypoints?

Yes, by current build mechanics and tracked diffs. The modified
`scripts/build-web.mjs` reads this repository copy, injects runtime tags, writes
`public/index.html`, and mirrors it to `apps/web/public/index.html`,
`apps/api/public/index.html`, and generated `dist` outputs. Those tracked
production copies are modified in the working tree and contain the V2 body;
their current hashes differ because of the injected runtime tags. API bundles
also embed the changed authority manifest/hash. This is a provenance finding,
not a statement that the resulting UI matches the external approved authority.

## Artwork disappearance forensic conclusion

The repository contains no Git-tracked PNG/JPG/JPEG/WEBP/SVG/AVIF/GIF assets in
HEAD, and `git ls-files --deleted` plus extension-filtered diffs found zero
deleted/modified/renamed tracked art files. The current `public`,
`apps/web/public`, and `apps/api/public` trees likewise contain no standalone
art image files. There are 81 untracked PNGs under verification/scratch paths;
they are screenshots or one live-certification upload, not replacements for a
tracked production asset. The complete path/hash inventory is in
`artifacts/handoff/art-asset-change-report.md`.

The contaminated HTML still carries inline base64 images and fallback/demo art,
while production artwork can be supplied through API/media hydration. Thus the
evidence does **not** show a Git/disk deletion event. It does show that
standalone production art files are absent and that reachability depends on
inline fallbacks or runtime media URLs; whether an external approved asset was
removed, excluded from build, made unreachable by hydration, or merely never
existed in this checkout cannot be determined without the external authority
and its asset inventory. No repair was attempted.

## Manifest handling

The authority manifest/config was changed during the implementation run to
the contaminated V2 filename/hash, as shown above. It was **not** changed
again after the freeze instruction. The next engineer must compare against the
external authority and set any manifest/checksum deliberately; this handoff
does not endorse the current `34ba...` value.
