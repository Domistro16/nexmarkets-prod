# USDG V1 Risk Policy

NexMarkets V1 uses canonical Robinhood-chain USDG for settlement only.

Runtime certification must establish the deployed contract's actual decimals, code/proxy/facet authority, pause/freeze behavior and upgrade authority before mainnet.

Paxos' public USDG code describes centrally managed mint/burn, pause and asset-protection powers and, in newer shared token contracts, optional/registered-holder reward mechanics. NexMarkets must therefore **not** assume USDG behaves like an immutable minimal ERC-20.

Policy:

1. Pass economics remain denominated in nominal USDG amounts; NexMarkets never markets stablecoin-level rewards as Pass yield.
2. Any token-level reward behavior observed in `NexRoyaltyVault` or protocol-held balances must receive an explicit accounting/legal decision before mainnet. It must not silently accrue to Pass holders, Builders or NexMarkets.
3. USDG pause/freeze/upgrade events are external dependency incidents and require monitoring/runbooks.
4. Mainnet launch is blocked until USDG runtime/proxy/facet lineage is captured in the signed deployment manifest.
