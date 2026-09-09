# Accessibility verification

- Status: **PASS**
- Automated and manual pass: fresh Chromium audits at desktop and 390px mobile viewports for Home, Discover, launch detail, Market, Create, Dashboard, Builder profile, plus Escape/modal state checks.
- The audit was run against the rebuilt production shell with no fixture responses injected.

| Surface | Viewport | Ready | Unlabelled controls | Missing image alt | Hidden focusables | Contrast findings | Keyboard stops / visible | Focus-style misses | Dialogs | Modal open→closed |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Home | 1440x900 | yes | 0 | 0 | 0 | 4 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Home | 390x844 | yes | 0 | 0 | 0 | 8 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Discover | 1440x900 | yes | 0 | 0 | 0 | 4 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Discover | 390x844 | yes | 0 | 0 | 0 | 8 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Launch detail | 1440x900 | yes | 0 | 0 | 0 | 4 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Launch detail | 390x844 | yes | 0 | 0 | 0 | 8 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Market | 1440x900 | yes | 0 | 0 | 0 | 4 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Market | 390x844 | yes | 0 | 0 | 0 | 8 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Create | 1440x900 | yes | 0 | 0 | 0 | 4 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Create | 390x844 | yes | 0 | 0 | 0 | 7 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Dashboard | 1440x900 | yes | 0 | 0 | 0 | 4 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Dashboard | 390x844 | yes | 0 | 0 | 0 | 9 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Builder profile | 1440x900 | yes | 0 | 0 | 0 | 4 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |
| Builder profile | 390x844 | yes | 0 | 0 | 0 | 9 | 14 / 14 | 0 | 0 / 0 | 1 → 0 |

## Findings

- Critical/serious automated findings: none.
- Warning: Home: contrast 4.34 for NEXMARKETS
- Warning: Home: contrast 4.34 for Terms
- Warning: Home: contrast 4.34 for Docs
- Warning: Home: contrast 4.34 for FAQ
- Warning: Home: contrast 4.34 for NEXMARKETS
- Warning: Home: contrast 4.34 for Terms
- Warning: Home: contrast 4.34 for Docs
- Warning: Home: contrast 4.34 for FAQ
- Warning: Home: contrast 4.4 for Discover
- Warning: Home: contrast 4.4 for ＋Create
- Warning: Home: contrast 4.4 for Market
- Warning: Home: contrast 4.4 for Account
- Warning: Discover: contrast 4.34 for NEXMARKETS
- Warning: Discover: contrast 4.34 for Terms
- Warning: Discover: contrast 4.34 for Docs
- Warning: Discover: contrast 4.34 for FAQ
- Warning: Discover: contrast 4.34 for NEXMARKETS
- Warning: Discover: contrast 4.34 for Terms
- Warning: Discover: contrast 4.34 for Docs
- Warning: Discover: contrast 4.34 for FAQ
- Warning: Discover: contrast 4.4 for Home
- Warning: Discover: contrast 4.4 for ＋Create
- Warning: Discover: contrast 4.4 for Market
- Warning: Discover: contrast 4.4 for Account
- Warning: Launch detail: contrast 4.34 for NEXMARKETS
- Warning: Launch detail: contrast 4.34 for Terms
- Warning: Launch detail: contrast 4.34 for Docs
- Warning: Launch detail: contrast 4.34 for FAQ
- Warning: Launch detail: contrast 4.34 for NEXMARKETS
- Warning: Launch detail: contrast 4.34 for Terms
- Warning: Launch detail: contrast 4.34 for Docs
- Warning: Launch detail: contrast 4.34 for FAQ
- Warning: Launch detail: contrast 4.4 for Discover
- Warning: Launch detail: contrast 4.4 for ＋Create
- Warning: Launch detail: contrast 4.4 for Market
- Warning: Launch detail: contrast 4.4 for Account
- Warning: Market: contrast 4.34 for NEXMARKETS
- Warning: Market: contrast 4.34 for Terms
- Warning: Market: contrast 4.34 for Docs
- Warning: Market: contrast 4.34 for FAQ
- Warning: Market: contrast 4.34 for NEXMARKETS
- Warning: Market: contrast 4.34 for Terms
- Warning: Market: contrast 4.34 for Docs
- Warning: Market: contrast 4.34 for FAQ
- Warning: Market: contrast 4.4 for Home
- Warning: Market: contrast 4.4 for Discover
- Warning: Market: contrast 4.4 for ＋Create
- Warning: Market: contrast 4.4 for Account
- Warning: Create: contrast 4.34 for NEXMARKETS
- Warning: Create: contrast 4.34 for Terms
- Warning: Create: contrast 4.34 for Docs
- Warning: Create: contrast 4.34 for FAQ
- Warning: Create: contrast 4.34 for NEXMARKETS
- Warning: Create: contrast 4.34 for Terms
- Warning: Create: contrast 4.34 for Docs
- Warning: Create: contrast 4.34 for FAQ
- Warning: Create: contrast 4.4 for Discover
- Warning: Create: contrast 4.4 for Market
- Warning: Create: contrast 4.4 for Account
- Warning: Dashboard: contrast 4.34 for NEXMARKETS

## Scope note

- A live authenticated data journey and real API/chain availability are separate certification gates; this artifact measures the rendered shell and its keyboard semantics without masking unavailable production data.
