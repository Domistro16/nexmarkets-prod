# Robinhood — Canonical Seaport 1.6 Deployment Gate

## Observed state

The 2026-08-17 explorer result that classified canonical Seaport as empty is
historical and superseded. A live RPC preflight on 2026-08-18 observed code at
all three canonical addresses on chain ID 4663:

- Seaport 1.6: 23,981 bytes, runtime hash `0x95809b70c9659c30188db5fdd87103e24b1a55379af8c851fca393aba0224a00`;
- ConduitController: 8,820 bytes, runtime hash `0x880348b652e7cce91216153a4d0107e70c77b92192f3d7a127ff1f1351961948`;
- Immutable CREATE2 factory: 2,099 bytes, runtime hash `0x767db8f19b71e367540fa372e8e81e4dcb7ca8feede0ae58a0c0bd08b7320dee`.

No NexMarkets deployment transaction is required or permitted for these
addresses while this verified state remains unchanged.

## Locked response

Do **not** replace Seaport with a NexMarkets exchange and do **not** deploy a fork to a convenience address.

Use OpenSea's official canonical CREATE2 procedure.

Canonical addresses:

- Seaport 1.6: `0x0000000000000068F116a894984e2DB1123eB395`
- ConduitController: `0x00000000F9490004C11Cef243f5400493c00Ad63`
- Immutable CREATE2 factory: `0x0000000000ffe8b47b3e2130213b802212439497`

Official source pins used by OpenSea's verification instructions:

- Seaport 1.6: `ProjectOpenSea/seaport-core@523097f`
- ConduitController verification source: `ProjectOpenSea/seaport@821a049`

## Required execution sequence

1. `eth_chainId` must equal `4663` (or `46630` for testnet).
2. `eth_getCode` at canonical Seaport and ConduitController addresses.
3. If either address has unexpected non-empty code: **STOP**.
4. Check the canonical Immutable CREATE2 factory address.
5. If the factory is absent, follow OpenSea's documented new-chain factory setup exactly.
6. Deploy ConduitController canonically.
7. Deploy Seaport 1.6 canonically.
8. Read runtime bytecode back from Robinhood.
9. Compare against independently built official pinned source artifacts.
10. Call Seaport `information()` and verify version + ConduitController binding.
11. Pin runtime hashes into the signed NexMarkets deployment manifest.
12. Only then allow NexMarkets secondary-market integration tests.

## Verification result — 2026-08-18

- `information()` reports Seaport `1.6` and canonical ConduitController
  `0x00000000F9490004C11Cef243f5400493c00Ad63`.
- Seaport was independently compiled from
  `ProjectOpenSea/seaport-core@523097f9cee66c15d308c900c50f336b291cda08`
  with solc `0.8.24`; every non-immutable runtime byte matched Robinhood.
- ConduitController was independently compiled from
  `ProjectOpenSea/seaport@821a049c6d5984cc5a18073bd578688cb41e9a53`
  with solc `0.8.14`; every non-immutable runtime byte matched Robinhood.
- ConduitController and the CREATE2 factory are byte-for-byte identical to
  their Ethereum canonical deployments. Robinhood Seaport differs from
  Ethereum only in the expected chain ID and domain-separator immutable bytes.
- Strict runtime verification passes. The deployment manifest remains
  `VERIFIED_UNSIGNED`; source-commit provenance, final byte freeze, and an
  authorized release signature are still required.

No private key is stored in this repository. Deployment must use a throwaway/deployer key with only the required ETH and transfer final NexMarkets admin authority to Safe where NexMarkets contracts require administration. Seaport itself is canonical infrastructure, not NexMarkets-administered protocol code.
