# Payment-token configuration

- Status: **PASS (scoped testnet configuration)**
- Robinhood testnet settlement: **MockUSDG** at `0x6A4F8832c23C51ba626Eba9d50c8F862647C1679`.
- Scope: development/testnet only; the testnet config is marked `mock: true`, `testnetOnly: true`, and `productionForbidden: true`.
- Robinhood mainnet settlement: **USDG** at `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; mainnet manifest validation rejects a mock token.
- Base Sepolia settlement: **USDC** at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- Frontend labels are sourced from the chain-specific settlement object and display `MockUSDG` on Robinhood testnet.

This resolves the MockUSDG finding through the explicitly allowed testnet-only outcome. It is not evidence that production deployment is complete; live token bytecode and the required live-chain journey remain separate certification gates.
