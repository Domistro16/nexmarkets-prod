# Protocol Admin Safe deployment

`scripts/deploy-safe.mjs` plans and, only with an explicit confirmation flag,
deploys a Safe v1.4.1 proxy through the canonical Safe Proxy Factory on
Robinhood Chain (chain ID `4663`). The deployer is only the transaction sender;
the Safe owners and threshold come from configuration and are never inferred
from the deployer key.

The script is read-only by default. It verifies the Robinhood chain ID, Safe
singleton runtime hash, Safe Proxy Factory runtime hash, fallback-handler code,
and the deterministic CREATE2 address before printing a plan. It submits only
when both flags are present:

```powershell
$env:SAFE_DEPLOY_CONFIRM = 'I_UNDERSTAND_THIS_SUBMITS_A_TRANSACTION'
cmd /c npm run safe:deploy
```

Required `.env` values:

```dotenv
RH_MAINNET_RPC_URL=https://rpc.mainnet.chain.robinhood.com
DEPLOYER_PRIVATE_KEY=<runtime-only-secret>
SAFE_OWNER_ADDRESSES=0xOwnerOne,0xOwnerTwo,0xOwnerThree
SAFE_THRESHOLD=2
```

Review the deterministic plan first:

```powershell
cmd /c npm run safe:plan
```

The script never writes the private key to disk or logs it. A successful
broadcast writes only the public deployment record to
`artifacts/safe-deployment/robinhood-mainnet.protocol-admin-safe.json`; that
artifact is ignored from source control. Do not add the Safe address to the
frozen bootstrap manifest without producing a new reviewed manifest digest.

Canonical deployment references:

- [Safe deployments](https://github.com/safe-global/safe-deployments)
- [Safe v1.4.1 Proxy Factory](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/proxies/SafeProxyFactory.sol)
