# Art / asset change report

Capture basis: `git status`, `git diff --name-status`, `git diff --summary`,
`git ls-files --deleted`, Git tree inspection, and a filesystem extension scan
were run at the freeze point. No asset was restored, removed, renamed, or
rewritten for this handoff.

## Git-tracked asset changes

**Deleted/modified/moved/renamed tracked art assets: 0.**

`git ls-files` contains no PNG, JPG/JPEG, WEBP, SVG, AVIF, or GIF files in the
baseline tree, and `git diff --name-status -- '*.png' '*.jpg' '*.jpeg'
'*.webp' '*.svg' '*.avif' '*.gif'` returned no entries. Consequently there is
no last containing commit or replacement path for a tracked binary asset. The
application's Pass artwork is supplied through the media/API layer and the
approved HTML's inline renderer/fallback functions, rather than a tracked
binary asset directory.

The phrase “approved HTML” in the historical wording above must not be read as
an authority claim. The repository copy of
`NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` was modified by Codex and is
**MODIFIED_BY_CODEX — NOT AUTHORITATIVE**. Its inline art/fallback inventory is
preserved for forensics only and is not the external approved-art baseline.

## Newly generated, untracked image files

The scan found 81 untracked PNGs. They are verification screenshots or the
live-certification upload; none is a replacement for a deleted tracked asset.
For every file below:

- status: **newly generated** (untracked)
- tracked by Git: **no**
- last known commit containing it: **none**
- replacement path: **none**
- current production application reference: **no**, except the explicit live
  artwork noted below

### Verification screenshot set (16 baseline files)

`artifacts/verification/baseline/authority-create-1440.png`,
`artifacts/verification/baseline/authority-dashboard-1440.png`,
`artifacts/verification/baseline/authority-discover-1440.png`,
`artifacts/verification/baseline/authority-docs-1440.png`,
`artifacts/verification/baseline/authority-faq-1440.png`,
`artifacts/verification/baseline/authority-home-1440.png`,
`artifacts/verification/baseline/authority-market-1440.png`,
`artifacts/verification/baseline/authority-terms-1440.png`,
`artifacts/verification/baseline/production-create-1440.png`,
`artifacts/verification/baseline/production-dashboard-1440.png`,
`artifacts/verification/baseline/production-discover-1440.png`,
`artifacts/verification/baseline/production-docs-1440.png`,
`artifacts/verification/baseline/production-faq-1440.png`,
`artifacts/verification/baseline/production-home-1440.png`,
`artifacts/verification/baseline/production-market-1440.png`,
`artifacts/verification/baseline/production-terms-1440.png`.

### Final-live browser screenshots (15 files)

`artifacts/verification/final-live-browser/01-builder-connected.png`,
`artifacts/verification/final-live-browser/02-create-phase-1.png`,
`artifacts/verification/final-live-browser/03-create-phase-2.png`,
`artifacts/verification/final-live-browser/04-create-phase-3-advantages.png`,
`artifacts/verification/final-live-browser/05-create-phase-4-artwork-random.png`,
`artifacts/verification/final-live-browser/06-create-phase-5-timing.png`,
`artifacts/verification/final-live-browser/07-create-phase-6-review.png`,
`artifacts/verification/final-live-browser/08-product-published.png`,
`artifacts/verification/final-live-browser/09-builder-profile-before-save.png`,
`artifacts/verification/final-live-browser/10-builder-profile-saved.png`,
`artifacts/verification/final-live-browser/11-edition-create-review.png`,
`artifacts/verification/final-live-browser/12-edition-created.png`,
`artifacts/verification/final-live-browser/builder-profile-failure.png`,
`artifacts/verification/final-live-browser/edition-failure.png`,
`artifacts/verification/final-live-browser/failure.png`.

### Final visual comparison set (30 files)

`artifacts/verification/final-visual/authority-builder-1440.png`,
`artifacts/verification/final-visual/authority-create-1-1440.png`,
`artifacts/verification/final-visual/authority-create-2-1440.png`,
`artifacts/verification/final-visual/authority-create-3-1440.png`,
`artifacts/verification/final-visual/authority-create-4-1440.png`,
`artifacts/verification/final-visual/authority-create-5-1440.png`,
`artifacts/verification/final-visual/authority-create-6-1440.png`,
`artifacts/verification/final-visual/authority-dashboard-1440.png`,
`artifacts/verification/final-visual/authority-discover-1440.png`,
`artifacts/verification/final-visual/authority-edition-1440.png`,
`artifacts/verification/final-visual/authority-home-1440.png`,
`artifacts/verification/final-visual/authority-launch-1440.png`,
`artifacts/verification/final-visual/authority-listing-1440.png`,
`artifacts/verification/final-visual/authority-market-1440.png`,
`artifacts/verification/final-visual/authority-owned-1440.png`,
`artifacts/verification/final-visual/production-builder-1440.png`,
`artifacts/verification/final-visual/production-create-1-1440.png`,
`artifacts/verification/final-visual/production-create-2-1440.png`,
`artifacts/verification/final-visual/production-create-3-1440.png`,
`artifacts/verification/final-visual/production-create-4-1440.png`,
`artifacts/verification/final-visual/production-create-5-1440.png`,
`artifacts/verification/final-visual/production-create-6-1440.png`,
`artifacts/verification/final-visual/production-dashboard-1440.png`,
`artifacts/verification/final-visual/production-discover-1440.png`,
`artifacts/verification/final-visual/production-edition-1440.png`,
`artifacts/verification/final-visual/production-home-1440.png`,
`artifacts/verification/final-visual/production-launch-1440.png`,
`artifacts/verification/final-visual/production-listing-1440.png`,
`artifacts/verification/final-visual/production-market-1440.png`,
`artifacts/verification/final-visual/production-owned-1440.png`.

### Post-repair visual comparison set (16 files)

`artifacts/verification/post-repair-visual/authority-create-1440.png`,
`artifacts/verification/post-repair-visual/authority-dashboard-1440.png`,
`artifacts/verification/post-repair-visual/authority-discover-1440.png`,
`artifacts/verification/post-repair-visual/authority-docs-1440.png`,
`artifacts/verification/post-repair-visual/authority-faq-1440.png`,
`artifacts/verification/post-repair-visual/authority-home-1440.png`,
`artifacts/verification/post-repair-visual/authority-market-1440.png`,
`artifacts/verification/post-repair-visual/authority-terms-1440.png`,
`artifacts/verification/post-repair-visual/production-create-1440.png`,
`artifacts/verification/post-repair-visual/production-dashboard-1440.png`,
`artifacts/verification/post-repair-visual/production-discover-1440.png`,
`artifacts/verification/post-repair-visual/production-docs-1440.png`,
`artifacts/verification/post-repair-visual/production-faq-1440.png`,
`artifacts/verification/post-repair-visual/production-home-1440.png`,
`artifacts/verification/post-repair-visual/production-market-1440.png`,
`artifacts/verification/post-repair-visual/production-terms-1440.png`.

### Live artwork upload (1 file)

`artifacts/verification/live-assets/nexmarkets-testnet-certification.png` is
newly generated/uploaded, untracked, and has no Git history or replacement.
It is referenced by `scripts/run-final-live-builder-preview.mjs` as the
certification upload input. The resulting application record references the
verified media endpoint `/v1/media/med_493b8c74-6c4c-4604-9771-bfb628deeeab/content`;
the local PNG path itself is not a production route reference.

### Scratch diagnostic screenshots (3 files)

`scratch/strict-audit-authority-home.png`,
`scratch/strict-audit-production-discover-390.png`, and
`scratch/strict-audit-production-home.png` are untracked diagnostic captures.
They are not referenced by the application and have no replacement or Git
history.

## Notes on inline/demo artwork

The approved HTML contains inline/fallback Pass-renderer functions and string
references such as `nmProjectFallbackArt`; those are source-code behavior, not
binary files. This report does not alter or remove them. Any future forensic
review should distinguish those inline references from the untracked PNG
evidence above.
