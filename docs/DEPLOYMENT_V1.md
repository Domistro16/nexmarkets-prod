# V1 deployment and abort gate

No Robinhood mainnet deployment is authorized by this implementation PR.

Testnet uses the isolated `MockUSDG` source at
`packages/contracts/src/MockUSDG.sol` (six decimals, owner-controlled issuance)
and the same production contract graph. Mainnet always uses the verified
canonical USDG address; the planner rejects any MockUSDG substitution.

After the testnet Safe exists, set `RH_TESTNET_RPC_URL`,
`TESTNET_MOCK_USDG_OWNER` to that Safe address, and use
`npm run mock-usdg:plan:testnet`. Broadcasting additionally requires the
explicit `MOCK_USDG_DEPLOY_CONFIRM=I_UNDERSTAND_THIS_SUBMITS_A_TESTNET_TRANSACTION`
and `DEPLOYER_PRIVATE_KEY` environment variables. The command refuses all
mainnet flags and records only public deployment metadata.

The public testnet input record is
`deployments/nexmarkets-v1.inputs.robinhood-testnet.json`. It deliberately
contains null address fields and explicit blockers until a real two-owner
testnet Safe and testnet-only MockUSDG deployment have been independently
verified; it is not a substitute for those onchain prerequisites.

`scripts/plan-v1-deployment.mjs` computes deterministic CREATE2 addresses from pinned Foundry artifacts and the verified immutable factory. It requires a Safe address, at least two distinct owners, threshold 1 or greater, exact fee recipients and a verified settlement token. Threshold 1 is permitted initially only with `RAISE_THRESHOLD_TO_2_PLUS` recorded. For contracts with Solidity immutables, the plan pins the normalized runtime template and immutable byte ranges; the exact observed runtime hash is read back and frozen only after deployment. It never mislabels the zero-placeholder artifact runtime as deployable runtime bytecode.

Every release-capable plan must name the frozen deployment source explicitly:

```text
NEXMARKETS_DEPLOYMENT_SOURCE_COMMIT=8790b635ba55512e5d0e295fb1217a3993ecdafb
npm run deploy:v1:plan:testnet
```

The planner compares the frozen commit with the current working tree's
deployment-affecting Solidity, Foundry/remapping and pinned-toolchain inputs.
Evidence-only commits are allowed; any deployable-input difference fails with
`DEPLOYMENT_SOURCE_MISMATCH`. `--unfrozen-dev` is available only for a local
developer plan and cannot produce Safe bundles. For this V1 release the source
commit is fixed to `8790b635ba55512e5d0e295fb1217a3993ecdafb` on both networks.

The current public mainnet input record is
`deployments/nexmarkets-v1.inputs.robinhood-mainnet.json`. It records the
already-verified Safe as both fee recipients but explicitly sets
`mainnetBroadcastAuthorized` to `false`; use it only for a dry-run after the
release source and Foundry artifacts are frozen.

Deployment order is LaunchRegistry, MintController, PassFactory, AdvantageRegistry, AdvantageInitializer, RoyaltyVault, ListingRegistry, Zone, NexPassAccount and TBAResolver. Before one-time calls, read back every runtime hash and immutable relationship. Then bind Factory, both Advantage initializer sides, Vault/ListingRegistry, Zone and listing authority in the manifest order.

The CREATE2 salts are prefixed with the Protocol Admin Safe address because the verified `ImmutableCreate2Factory.safeCreate2` requires the first 20 salt bytes to match the caller (or be zero). `scripts/build-v1-safe-bundles.mjs` emits two unsigned Safe Transaction Builder bundles: deployment first, and irreversible wiring separately. The wiring bundle is explicitly blocked until the runtime and immutable verification gate passes.

Abort before any irreversible setter when an address, code hash, owner, settlement token, Seaport, Registry, controller or back-reference differs. Do not "repair" by pointing a slot at a replacement contract. `verify-v1-deployment.mjs` fails on missing code or hash mismatch. Mainnet requires a separately Safe-approved final manifest.

Run `verify-v1-deployment.mjs` without flags after deployment and before the wiring bundle; it requires every one-time slot to still be empty. After the separately reviewed wiring Safe transaction, run it again with `--post-wire` to require every slot to equal its planned counterpart.

## Testnet execution checklist and evidence

The following sequence was executed on Robinhood testnet using public metadata
recorded in `deployments/robinhood-testnet.v1-deployment.json`. Private keys
remain process-environment/secret-manager inputs and were never committed.

1. Configure two distinct Safe owner addresses and threshold `1`, recording
   `RAISE_THRESHOLD_TO_2_PLUS`.
2. Confirm `RH_TESTNET_RPC_URL` identifies chain `46630` and the deployment
   signer has testnet ETH.
3. Deploy or verify the testnet Protocol Admin Safe; record its address,
   owners, threshold, version, runtime hash, transaction and block.
4. Deploy the isolated testnet-only `MockUSDG` with the Safe as owner using
   `npm run mock-usdg:plan:testnet` and the explicit testnet confirmation only
   when ready to broadcast; verify six decimals, symbol `USDG`, owner and
   runtime code.
5. Populate `deployments/nexmarkets-v1.inputs.robinhood-testnet.json` with the
   verified Safe, both fee recipients set to that Safe, owners, threshold and
   MockUSDG address.
6. Run the frozen-source planner and inspect all ten predicted addresses,
   init-code hashes and immutable wiring. Do not continue if any address is
   occupied unexpectedly.
7. Deploy and independently verify the ten contracts in dependency order,
   then execute the six one-time wiring calls only after every verification
   passes.
8. Run the complete post-deployment verifier, render/deploy the official
   `robinhood-testnet` Goldsky Turbo pipeline when credentials exist, apply the
   PostgreSQL migrations, start projector/lifecycle/reconciliation/outbox
   workers and require a healthy landed-block watermark.
9. A clearly identified test-only certification Edition was created at
   `0x4171D62F43B4168b07a01C04594455DBc3298437`. Terms were published with a
   real 24-hour Preview; `mintStartsAt` is `2026-08-21T21:42:30Z`. No production
   Genesis/Crier Edition was created.
10. Goldsky execution is pending credentials and the configured PostgreSQL
    endpoint was unavailable (`ECONNREFUSED localhost:5432`); those gates do
    not invalidate the independently verified onchain deployment.

The Safe execution tool is testnet-only and validates the frozen plan SHA,
Safe ownership, CREATE2 init-code hashes, empty predicted addresses and exact
wiring calldata before it can broadcast:

```text
node scripts/execute-safe-bundle.mjs --network=robinhood-testnet --phase=deploy --plan-sha256=<plan-sha> --broadcast
node scripts/execute-safe-bundle.mjs --network=robinhood-testnet --phase=wire --plan-sha256=<plan-sha> --broadcast
```

Certification Edition creation and Terms publication use a separate test-only
tool with an explicit confirmation guard. It never accepts a mainnet network:

```text
node scripts/testnet-certification-edition.mjs --phase=create --broadcast
node scripts/testnet-certification-edition.mjs --phase=terms --broadcast
```
