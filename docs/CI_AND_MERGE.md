# CI and merge policy

## Required pull-request tests

`.github/workflows/ci.yml` runs on every pull request targeting `main`, on push to `main`, and by manual dispatch. Its single job, **`release-gate`**, runs on `ubuntu-24.04` with `python:3.13-trixie`, system Chromium and Korean fonts. It runs `npm run test:release`, verifies generated `dist/` matches committed source, and checks the npm pack contents without publishing.

The gate includes SHA-256 renderer lock, logical-stream tests, visual sample baseline, 10 structural fixtures, 10 Hancom direct-PDF comparisons, real-world fixture regression, Diff/Viewer/Track Changes/React integration, SSR and security tests. A test failure prevents the CI job from succeeding.

The real Hancom Track Changes corpus is not supplied and its test currently reports SKIP, not PASS. No automated process publishes to npm (`private: true` remains set).

## Merge policy

`.github/workflows/auto-merge.yml` responds only to a successful completed `CI` workflow run associated with an owner-authored, same-repository, non-draft open PR targeting `main`. It verifies the PR head SHA matches the SHA associated with that successful run, then attempts a squash merge. The privileged workflow does not check out or run PR code.

**Protect `main` in GitHub Settings → Rules / Branch protection**:
- Require a pull request for merges and the `CI / release-gate` status check.
- Disallow force-push, deletion and bypass of required checks.
- Restrict who may edit GitHub workflows and CI scripts.
- Ensure GitHub Actions has permission to use `contents: write` and `pull-requests: write` in the merge workflow.

GitHub only activates `workflow_run` workflows already present on the default branch. Consequently the **initial PR that installs this workflow must be merged manually after CI passes**, or the default-branch workflow must be bootstrapped separately with owner approval. Following that initial activation, same-repository PRs authored by `rydolabs` can be merged automatically when CI passes. GitHub's repository-level native auto-merge flag is not required for this `workflow_run` mechanism.

The pixel-regression baseline is environment-sensitive; review changes to fonts, Chromium and dependencies rather than loosening metric thresholds to bypass a failure.
