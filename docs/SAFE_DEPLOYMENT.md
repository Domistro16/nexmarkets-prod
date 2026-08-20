# Protocol Admin Safe deployment

`scripts/deploy-safe.mjs` plans and, only with an explicit confirmation flag,
deploys a Safe v1.4.1 proxy through the canonical Safe Proxy Factory on
Robinhood mainnet (`4663`) or testnet (`46630`, selected with
`--network=robinhood-testnet`). The deployer is only the transaction sender;
the Safe owners and threshold come from configuration and are never inferred
from the deployer key.

The script is read-only by default. It verifies the Robinhood chain ID, Safe
singleton runtime hash, Safe Proxy Factory runtime hash, fallback-handler code,
and the deterministic CREATE2 address before printing a plan. It submits only
when both flags are present:

```powershell
$env:SAFE_DEPLOY_CONFIRM = 'I_UNDERSTAND_THIS_SUBMITS_A_TRANSACTION'
cmd /c npm run safe:deploy
# Testnet uses: cmd /c npm run safe:plan:testnet
```

Required `.env` values:

```dotenv
RH_MAINNET_RPC_URL=https://rpc.mainnet.chain.robinhood.com
# For testnet, use RH_TESTNET_RPC_URL and --network=robinhood-testnet.
DEPLOYER_PRIVATE_KEY=<runtime-only-secret>
SAFE_OWNER_ADDRESSES=0xOwnerOne,0xOwnerTwo,0xOwnerThree
SAFE_THRESHOLD=2
```

The Safe must have at least two owners. Threshold `1` is permitted for initial
production deployment and controller handoff only when the record is explicitly
labelled `INITIAL_PRODUCTION_THRESHOLD_1_MINIMUM_2_OWNERS` and includes the
planned transition `RAISE_THRESHOLD_TO_2_PLUS`. A threshold of at least `2`
remains the target for ongoing protocol governance.

Review the deterministic plan first:

```powershell
cmd /c npm run safe:plan
```

The script never writes the private key to disk or logs it. A successful
broadcast writes only the public deployment record to
`artifacts/safe-deployment/robinhood-mainnet.protocol-admin-safe.json`; that
artifact is ignored from source control. Do not add the Safe address to the
frozen bootstrap manifest without producing a new reviewed manifest digest.

The manifest digest used for Safe approval is the canonical repository-byte
digest (`2c609951e0f20a33187d0bbab68217abfc3d4993d8dc26d5803bbf1940e512a5`).
The planner normalizes Windows CRLF working-tree line endings to LF before
hashing, so local Safe approval matches the committed manifest bytes.

Canonical deployment references:

- [Safe deployments](https://github.com/safe-global/safe-deployments)
- [Safe v1.4.1 Proxy Factory](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/proxies/SafeProxyFactory.sol)
