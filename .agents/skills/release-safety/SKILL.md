---
name: release-safety
description: Use this skill when preparing, assessing, or hotfixing a LuyenTap release, investigating what is deployed, checking Hosting/Worker/Firebase/Backblaze impact, or deciding whether a production deployment may proceed. Follow the repository release-safety scripts and preserve their conservative evidence gates.
---

# LuyenTap release safety

Use the executable scripts as the authority. This skill is an agent-facing
recipe, not a second validation implementation.

## Start from current state

Read `documentation/system/release-safety.md`,
`documentation/system/local-live-deployment.md`, and the infrastructure rules
when the task involves deployment or deployed-state claims. Then inspect:

```powershell
git status --short --branch
npm run tooling:doctor
```

A dirty candidate is a hard stop: select or create an isolated source/worktree
before assessment. Choose an explicit reviewed `--base`; a branch name,
`HEAD^`, or a local build is not production truth.

## Establish evidence before assessing

Use the production manifest observer for the manifest-bearing live site:

```powershell
node scripts/release-check.mjs --mode release --base <review-base> `
  --observe-hosting --env-fingerprint <production-env-sha256> --json
```

The observer verifies the served source identity and listed content hashes.
For historical releases without a manifest, `--observe-hosting-provider` reads
provider metadata through the existing repository-owned Firebase CLI. If it
reports `sourceKnown: false`, exact-source preparation remains `UNVERIFIED`.
Reuse declared tools without installing dependencies or creating junctions.

The October 18 manifest-bearing release and its qualification limits are recorded
in `documentation/release-audits/2026-10-18-book-hosting-release.md`. Re-read the
live manifest; a dated release record does not establish the next deployment's state.

## Normal release

Assess the selected candidate and write a receipt:

```powershell
$envFile = Join-Path $HOME '.luyentap\env\.env.production'
$envFingerprint = (Get-FileHash $envFile -Algorithm SHA256).Hash.ToLower()
node scripts/release-check.mjs --mode release --base <review-base> `
  --observe-hosting --env-fingerprint $envFingerprint `
  --json --receipt tmp/release-receipts/release-assessment.json
```

Provider metadata remains `UNVERIFIED` when it lacks deployed source/tree.
Once a production manifest is independently present, use `--observe-hosting`;
application changes also require a compatibility review bound to the exact
source, base, and observed fingerprint. A `PASS` from fixtures or a manually
edited receipt is not production evidence.

Only an assessment with `PASS` or `NOT_APPLICABLE`, fresh revalidation, and
separate explicit production authorization may reach `npm run deploy:hosting`.
The deployment script is the only supported mutating route. It requires the canonical checkout (or a checkout with `tooling:doctor` green) because Firebase CLI and build dependencies are intentionally not installed into managed worktrees.

## Independent hotfix

Use an observed deployed revision, never the dirty development checkout:

```powershell
node scripts/hotfix-prepare.mjs --source <verified-source-revision> --destination ..\luyentap-hotfix
Set-Location ..\luyentap-hotfix
node <release-safety-checkout>\scripts\release-check.mjs --mode hotfix `
  --base <verified-source-revision> --observe-hosting --json `
  --receipt tmp/release-receipts/hotfix-assessment.json
```

If provider evidence has no verified source revision, stop and report the
external bootstrap requirement; do not substitute `HEAD^`. Apply only the
correction and required dependencies. Keep compatibility reviews outside the
candidate worktree so the candidate stays clean. The assessment records a
computed reconciliation obligation; later releases must preserve the hotfix
content or stop for review.

## First bootstrap and recovery

For the pre-manifest site, the local bootstrap is deliberately build-only:

```powershell
npm run build:production -- --build-only
```

It requires a clean checkout, binds the generated manifest to that checkout's
revision/tree, performs the production-environment and bundle checks, and does
not deploy. Inspect that artifact and obtain separate authorization before the
existing reviewed Firebase Hosting command is used for the first manifest-bearing
release. Never copy an artifact built from a dirty checkout into that step.

For disposable Hosting rehearsal channels, generate a unique channel ID, record
it before deployment, and delete exactly that channel in a `finally` cleanup
step. Verify the final channel listing contains no orphan. For an authorized
Hosting recovery, record the verified prior version/channel and use Firebase's
native `hosting:clone <site>:<source> <site>:<target>` operation; verify the
target URL afterward. This is recovery evidence, not production authorization,
and it does not roll back database, Worker, or Backblaze changes.

## Stop conditions

Treat `BLOCKED`, `UNVERIFIED`, and `REVIEW_REQUIRED` as decisions requiring
preparation or evidence, not approval. Report the exact missing evidence,
affected service, deployment order, recovery information, and authorization
boundary. Never replace an unavailable provider observation with caller-supplied
JSON or a manually edited receipt.

For a dependency-free managed worktree, direct `node` assessment commands are the supported cold-start path. Run builds or deployment only after selecting a checkout with the repository-owned dependencies and rechecking its status.

Completion means the receipt, source/base, observed state, compatibility review,
tests, and worktree state all agree. If any input changes, rerun the checker.
