# Pass renderer authority map

| Renderer | Callers | Routes/surfaces | Production reachability | Authority rule |
|---|---|---|---|---|
| `legacyPassHTML` / `legacyMountPass` | Historical shell functions and old launch compatibility hook | Home/launch/market legacy call sites in `NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` | Fixture/demo mode only; `legacyPassHTML` returns empty outside `__NEXMARKETS_FIXTURE_MODE__`, and production fixture routes have no project records | Never selects production pack, palette, artwork, material, or serial |
| `nmFinalProjectCompiled` + `nmFinalMountPass` | Home, Discover, launch detail, Dashboard, owned Pass, market and export adapters | Current public and authenticated surfaces | Production current renderer | Consumes API/chain-backed frozen design configuration and the canonical presentation path |
| Create authoring renderer | `v2-app.mjs` Create flow and canonical launch-draft normalization | Create/Preview | Production current authoring path | `launch-draft.mjs` accepts only approved Pass options and freezes the renderer version/configuration |
| Export renderer | `nmPassContextForExport` and export/share helpers | Download/export | Production current export path | Uses the same compiled/frozen configuration passed to the canonical renderer |
| `legacy-inline-v0` compatibility role | Domain `resolvePassRenderer` only for explicitly versioned historical configs | Historical records | Compatibility-only | Cannot be selected for newly authored configurations |

The executable compatibility selector is in `packages/domain/src/pass-renderer.mjs`. New configurations resolve to `pass-renderer-v1` (`canonical-current`); obsolete or unknown versions fail closed. The browser's historical renderer remains in the source for historical/demo compatibility but is gated from production data.
