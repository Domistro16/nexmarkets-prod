# Performance verification

- Status: **PASS**
- Measurement mode: fresh Chromium page per requested surface against the built production shell; no fixture API responses were injected.
- Note: the local API was started with the configured environment. Backend availability is reported separately by the route result; it is not replaced with sample data.

| Surface | Ready (ms) | JS bytes / requests | Requests | Image bytes / requests | Iframes | CLS | Pass hosts / ready | Malformed / loose | Market transition | Canonical Pack probe |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Home | 1911 | 199122 / 4 | 10 | 0 / 0 | 0 | 0.0000 | 0 / 0 | 0 / 0 | 378 ms | n/a |
| Discover | 2255 | 199122 / 4 | 10 | 0 / 0 | 0 | 0.0606 | 0 / 0 | 0 / 0 | 309 ms | n/a |
| Launch detail | 1917 | 199122 / 4 | 11 | 0 / 0 | 0 | 0.0614 | 0 / 0 | 0 / 0 | 366 ms | n/a |
| Market | 1974 | 199122 / 4 | 10 | 0 / 0 | 0 | 0.0606 | 0 / 0 | 0 / 0 | 268 ms | n/a |
| Builder profile | 2067 | 199122 / 4 | 10 | 0 / 0 | 0 | 0.0599 | 0 / 0 | 0 / 0 | 359 ms | n/a |
| Dashboard | 2308 | 199122 / 4 | 10 | 0 / 0 | 0 | 0.0607 | 0 / 0 | 0 / 0 | 353 ms | n/a |
| Create | 2197 | 199122 / 4 | 10 | 0 / 0 | 0 | 0.0606 | 0 / 0 | 0 / 0 | 344 ms | 171 ms |

## Regression checks

- The audit records empty/loose/malformed Pack hosts separately from `.nm-pass-ready` hosts.
- Public pages must not boot dozens of full Pack editors; the iframe and same-origin iframe counts above are the measured values.
- Create includes an isolated timing probe for the canonical current renderer. It is not injected into production data or counted as a public Pack editor.
- The result is a shell/performance measurement, not production certification; live API, database and chain gates remain independent.
