# Final live certification preflight

- Status: **BLOCKED BEFORE FRESH EDITION BROADCAST**
- Verified: 2026-09-09
- Network: Robinhood testnet, chain ID 46630

## Ready inputs

- Funded Builder/deployer wallet: `0xD83deFbA240568040b39bb2C8B4DB7dB02d40593`
- Gas balance observed: 0.00173890687 native token
- Settlement balance observed: 2.87 MockUSDG
- Protocol Safe threshold: 1; Builder/deployer signer is an owner
- Factory, listing registry, launch registry, mint controller, Advantage registry, Seaport integration and Goldsky endpoint are reachable.
- Local API readiness is PASS with database `ok` and indexer `fresh`.
- New test artwork is prepared at `artifacts/verification/live-assets/nexmarkets-testnet-certification.png`.
- Artwork SHA-256: `d543e603d6beeeb4e80669aa038d3f47fdda2ab0128654e939d3a83010a001a5`.

## External blockers found

### Media upload authority

The production upload flow requires `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ACCESS_KEY_ID`, and `OBJECT_STORAGE_SECRET_ACCESS_KEY` (and an endpoint when using an S3-compatible provider). Only `OBJECT_STORAGE_BUCKET` is configured. A UI upload therefore cannot return an approved persistent media asset. A data URL, fake upload interception, direct fixture, or invented IPFS URL would not satisfy live certification and was not used.

### Mandatory Preview elapsed time

The deployed `NexLaunchRegistry` requires at least 86,400 seconds between `previewStartsAt` and `mintStartsAt`. The public Robinhood RPC exposes `arb`, `arbdebug`, `eth`, `net`, `rpc`, and `web3`; it exposes no local EVM time-warp module. A freshly published Edition therefore cannot reach a valid Debut and primary mint in the same session. This is an intentional protocol rule, not a failed test.

### Wallet roles

Only the Builder/deployer private key is configured. Holder Wallet A and Buyer Wallet B can be generated and funded from it for testnet execution, but they cannot substitute for the missing persistent media upload authority or the 24-hour chain clock.

## Current chain inventory

- The sole Pass previously published by the configured signer is already owned by `0x50fFa31ca4480c9f1aB1f055c54C3eb582b492EC`.
- The configured signer owns no Pass indexed by Goldsky and therefore cannot create a genuine replacement order before the fresh Edition mints.
- The historical Pass has no active listing.

## Completed funded-wallet negative

- Wrong-Edition mint: **PASS**. Transaction `0x997e831054b4894a01ef90214d5c19392c0453254f9b5443c1b33b2de92536f2` was mined at block 115919109 with receipt status 0.
- The deployed controller returned `MintClosed()` (`0x589ed34b`).
- Known certification Edition supply remained 1 → 1, proving no unauthorized Pass was minted.
- Machine evidence: `artifacts/testnet-certification/final-live-chain-negative.json`.

No transaction hash was fabricated and no malformed immutable Edition metadata was broadcast merely to make the clock start.
