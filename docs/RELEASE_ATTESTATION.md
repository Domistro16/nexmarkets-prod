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
workflow records `UNAVAILABLE` when GitHub cannot persist them (for example,
on a private user-owned repository) and continues to produce the release
record. The required governance control is the Protocol Admin Safe approval
described below.

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
the source commit, the workflow commit, attestation status/references, and all
verified Robinhood primitive hashes.

## Protocol Admin Safe approval

Do not put `DEPLOYER_PRIVATE_KEY` in GitHub. Use `scripts/deploy-safe.mjs`
locally with an explicit owner set and threshold, then have the resulting
Protocol Admin Safe approve the exact manifest digest. Configure the public
Safe address and approved digest as repository variables, and the Safe
signature as the repository secret:

```powershell
gh variable set PROTOCOL_ADMIN_SAFE_ADDRESS --body <safe-address>
gh variable set PROTOCOL_ADMIN_SAFE_APPROVED_HASH --body 2c609951e0f20a33187d0bbab68217abfc3d4993d8dc26d5803bbf1940e512a5
gh secret set PROTOCOL_ADMIN_SAFE_SIGNATURE
```

When those values are present, the workflow calls `npm run safe:verify` and
records the EIP-1271 result. Without them the release record remains
`PENDING`; no governance approval is implied. Safe approval—not GitHub
attestation—is the required NexMarkets Edition release control.

`NexPassEdition` and the custom NexMarkets contracts remain gated until the
release bundle is independently verified and the Safe approval is recorded.
