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
node scripts/release-check.mjs --mode release --target hosting --base <review-base> `
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
node scripts/release-check.mjs --mode release --target hosting --base <review-base> `
  --observe-hosting --env-fingerprint $envFingerprint `
  --json --receipt tmp/release-receipts/release-assessment.json
```

Provider metadata remains `UNVERIFIED` when it lacks deployed source/tree.
Once a production manifest is independently present, use `--observe-hosting`.
For `target === 'hosting'` on protected `main`, routine frontend releases do
not require a separate review-card JSON file; when backend paths in
`live_sha..HEAD` differ, the Hosting target scopes dependency observation
strictly to the changed backend services (and requires a compatibility review
binding when explicitly reconciling changed hotfix paths or assessing multi-service
`target === 'all'` changes). Routine frontend Hosting releases skip unrelated
RTDB, Firestore, Cloudflare Worker, and R2 probes. Follow
`documentation/system/integration-releases.md` for supported scope and separate
backend qualification; the target grants no Worker deployment readiness. Post-deploy
Hosting readback (`deploy-live.mjs` / `release-evidence.mjs`) polls with bounded
backoff (up to 90s) until Firebase Hosting finalizes the new live version and
serves the expected manifest and assets; `npm run release:verify-existing -- --operation-id <operationId>`
resumes interrupted verification without redeploying. A `PASS` from fixtures or a
manually edited receipt is not production evidence.

Only an assessment with `PASS` or `NOT_APPLICABLE`, fresh revalidation, and
explicit production dispatch through the single-job `Release Promotion` workflow
(or local `npm run deploy:hosting`) may publish Hosting. The deployment script is
the only supported mutating route. It requires a checkout with `tooling:doctor`
green so Firebase CLI and build dependencies are present.

## Agent application-verification duty

For an application-impacting candidate, the agent owns proportionate
verification before merging and dispatching `Release Promotion`:

1. Inspect the changed surfaces and choose proportionate proof. The agent may use
   focused tests, a browser, an emulator, provider checks, or a disposable
   qualification journey. No framework, browser, account scheme, or journey is
   prescribed here.
2. Run the selected checks against the exact candidate source and verify that
   affected behavior and boundaries work as intended.
3. For built-site proof, run `npm run build:production` and verify the served
   output with `scripts/release-local-readback.mjs`; once merged to protected
   `main`, dispatch the single-job `Release Promotion` workflow (`operation: publish`).
4. If a required check cannot run, investigate the available tools, access and
   environments first. Report the exact missing external resource and affected
   evidence; do not end with a generic `UNVERIFIED` report when the work is
   still actionable.

The release checker remains conservative: `UNVERIFIED`, `REVIEW_REQUIRED`, and
`BLOCKED` are machine decisions requiring preparation or evidence, not approval.
This duty gives the agent authority over test selection and execution while leaving
source integrity, provenance, freshness, concurrency, publication, recovery and
production authorization to the release system and owner boundary.

## Scoped Hosting dependencies & Worker/rules releases

Hosting dependency checks (`scripts/release-hosting-dependencies.mjs`) are scoped
strictly to backend services that actually changed in `live_sha..HEAD`:
- RTDB rules readback runs only when `database.rules.json` changed.
- Firestore rules or index readback runs only when `firestore.rules` or `firestore.indexes.json` changed.
- Cloudflare Worker or R2 probes run only when that specific Worker's source/config or `sharedHomeworkInputs` changed.

Worker and Firebase rules releases require service-specific qualification (targeted
tests, dry-run build, version-addressed Cloudflare `/versions/:id` or Firebase rules
readback) and separate deployment authorization outside the Hosting-only route.

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
Hosting rollback, record the verified prior version ID and run Firebase's
native `firebase hosting:clone temp-a1437:kahut1@<prior-version-id> temp-a1437:kahut1:live --project temp-a1437`
operation; verify `https://kahut1.web.app` afterward. This is recovery evidence,
not production authorization, and it does not roll back database, Worker, or Backblaze changes.

## Stop conditions

Treat `BLOCKED`, `UNVERIFIED`, and `REVIEW_REQUIRED` as decisions requiring
preparation or evidence, not approval. Report the exact missing evidence,
affected service, deployment order, recovery information, and authorization
boundary. Never replace an unavailable provider observation with caller-supplied
JSON or a manually edited receipt.

For a dependency-free managed worktree, direct `node` assessment commands are the supported cold-start path. Run builds or deployment only after selecting a checkout with the repository-owned dependencies and rechecking its status.

Completion means the receipt, source/base, observed state, compatibility review,
tests, and worktree state all agree. If any input changes, rerun the checker.
