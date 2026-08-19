# Optional frozen release attestation

The Robinhood bootstrap manifest is frozen to source commit `2da21ae` and
currently hashes to:

`2c609951e0f20a33187d0bbab68217abfc3d4993d8dc26d5803bbf1940e512a5`

Any source or manifest change requires a new commit, a new manifest digest,
and a new release-attestation run.

## GitHub Actions configuration

The `robinhood-release-attestation` workflow is manual by design. It verifies
the source ancestry, exact manifest bytes, all local release gates, and the
read-only Robinhood primitive gate before attempting two attestations with
GitHub's OIDC/Sigstore-backed `actions/attest` action:

- the frozen bootstrap manifest;
- the deterministic production source bundle.

These attestations are optional provenance for NexMarkets Edition. The
workflow records `UNAVAILABLE` when GitHub cannot persist them and continues to
produce the release record. The required governance control is the Protocol
Admin Safe approval described below.

Configure the repository Actions secret before dispatching it:

```powershell
gh secret set RH_MAINNET_RPC_URL --body https://rpc.mainnet.chain.robinhood.com
```

After the release branch/commit is pushed, dispatch the workflow with the
frozen values:

```powershell
gh workflow run robinhood-release-attestation.yml `
  --ref <release-commit-or-branch> `
  --field source_commit=2da21ae `
  --field manifest_sha256=2c609951e0f20a33187d0bbab68217abfc3d4993d8dc26d5803bbf1940e512a5
gh run watch
gh run download <run-id>
```

The uploaded release bundle contains any available attestation bundles and
`robinhood-mainnet.release-record.json`. That record binds the manifest hash,
the source commit, the workflow commit, attestation status/references, the
Safe approval status, and all verified Robinhood primitive hashes.

The public release record never contains the Safe EIP-1271 signature. Any
earlier release runs or bundles that did contain protected material were
removed; the static record marks those historical attestations
`REDACTED_RUN_REMOVED`. Future runs use status-only Safe evidence.

## Protocol Admin Safe approval

Do not put `DEPLOYER_PRIVATE_KEY` in GitHub. Use `scripts/deploy-safe.mjs`
locally with an explicit owner set and threshold, then have the resulting
Protocol Admin Safe approve the exact manifest digest. Configure the public
Safe address and approved digest as repository variables, and the Safe
EIP-1271 signature only in the protected repository secret:

```powershell
gh variable set PROTOCOL_ADMIN_SAFE_ADDRESS --body <safe-address>
gh variable set PROTOCOL_ADMIN_SAFE_APPROVED_HASH --body 2c609951e0f20a33187d0bbab68217abfc3d4993d8dc26d5803bbf1940e512a5
gh variable set PROTOCOL_ADMIN_SAFE_THRESHOLD --body 1
gh variable set PROTOCOL_ADMIN_SAFE_GOVERNANCE_PROFILE --body INITIAL_PRODUCTION_THRESHOLD_1_MINIMUM_2_OWNERS
gh secret set PROTOCOL_ADMIN_SAFE_SIGNATURE
```

The production Safe must always have at least two owners. Threshold 1 is
permitted for initial production deployment and controller handoff under the
explicit governance profile `INITIAL_PRODUCTION_THRESHOLD_1_MINIMUM_2_OWNERS`.
The release record must also carry the planned transition
`RAISE_THRESHOLD_TO_2_PLUS`; threshold >= 2 is the required ongoing governance
milestone.

When those values are present, the workflow calls `npm run safe:verify` and
records the EIP-1271 result. The signature is deliberately never written to a
tracked file, release artifact, attestation bundle, or workflow log. The public
release record contains only non-secret Safe metadata (address, owner-count
minimum, threshold, governance profile, approved digest, and verification
status). Without those values the release record remains `PENDING`;
no governance approval is implied. The current initial-production Safe approval status
is recorded in
[`docs/release/robinhood-mainnet.safe-approval.json`](./release/robinhood-mainnet.safe-approval.json).

The manifest's `release.status` remains `VERIFIED_UNSIGNED` and
`signedManifest: false` by design: the frozen infrastructure manifest is not
mutated to embed a detached Safe signature, because doing so would change the
approved manifest digest. The detached Safe evidence and the workflow release
record are the canonical governance evidence for that unchanged digest; the
signature itself remains protected and unpublished.

`NexPassEdition` contract review and CI may proceed against the permanent
collection architecture. Initial production deployment and the controller
handoff may proceed once the release bundle is independently verified and the
minimum-two-owner threshold-1 Safe approval is recorded. The planned transition
to threshold >= 2 remains an explicit follow-up governance requirement before
ongoing protocol administration.
