# Security V1

Contract ownership belongs to a Safe with at least two owners. Initial threshold 1 is allowed only with the planned threshold increase recorded. One-time wiring validates code, owner and back-references. Primary/secondary fees are constants; SafeERC20, checks-effects-interactions, reentrancy guards, scoped idempotency and atomic rollback protect settlement.

The API uses wallet signatures, expiring single-use nonces, opaque revocable sessions, CSRF and origin checks, input/body limits, rate limiting, parameterized SQL and escaped UI rendering. Uploads are owner-scoped and safety-gated. Dependencies and GitHub Actions are exact-version/commit pinned; npm audit is a CI gate. Secrets stay in secret managers and are excluded from logs/git.

This repository evidence is not an external audit. Production launch still requires the deployment/runtime gate and independent security review of the final exact commit.
