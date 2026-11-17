---
name: release-safety
description: Use this skill when preparing, assessing, or hotfixing a LuyenTap release, investigating what is deployed, checking Hosting/Worker/Firebase/Backblaze impact, or deciding whether a production deployment may proceed. Follow the repository release-safety scripts and preserve their conservative evidence gates.
---

# LuyenTap release safety

Use the executable scripts as the authority. This skill is an agent-facing
recipe, not a second validation implementation.

## When the user says “deploy”

Treat the request as permission to prepare and execute the appropriate release
route, subject to the repository's production-authorization boundary. Do not
replay the full release ceremony by habit. Inspect the candidate and live state,
then choose the smallest route that proves the changed behavior and protects the
publication:

| Change shape | Codex-selected route |
| --- | --- |
| Documentation, tests or tooling only | PR checks and integration evidence; no application preview unless the change affects a live service |
| Routine frontend or static Hosting change | Focused checks and a browser/preview journey only when behavior can regress |
| Worker, rules, configuration, index or provider change | The affected native emulator/provider check and its ordering/recovery evidence |
| Coordinated frontend plus backend change | Persistent qualification foundation, disposable run state and a coordinated journey |
| Release-infrastructure change | Source/artifact, operation, publication, readback and recovery checks |

These shapes are not overlapping shortcuts: tooling that changes release,
deployment or recovery machinery is release infrastructure. When more than one
shape matches, choose the strictest route.

Before running a selected route, check the capabilities it needs: repository
tools, the persistent qualification foundation, non-production bindings and
provider credentials. If a capability is absent, investigate the approved
recovery path before reporting a blocker. Do not require QA inputs, browser
frameworks, accounts or provider checks that the selected route does not use.

Codex owns test choice, browser choice, depth, sequencing and technical
diagnosis. The owner supplies the objective and genuine production authorization;
the mechanical helpers derive hashes, paths, evidence bindings and operation
identities. Reuse an existing retained artifact or operation when it matches the
candidate. If publication is ambiguous, resume and verify that operation; never
start a second publication to solve a readback delay.

The route is complete when the exact selected evidence, source/artifact identity,
authorization, freshness check, live readback and cleanup agree. A route that
does not need application evidence may use the explicit `not-required` decision;
an application route needs the source-bound bundle, and a built-site route adds
the exact tested artifact. These are conditional evidence boundaries, not extra
human approval steps.

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
Once a production manifest is independently present, use `--observe-hosting`;
application changes also require a compatibility review bound to the exact
source, base, and observed fingerprint. When backend paths differ, the Hosting
target independently observes active dependencies and requires that review's
`dependenciesFingerprint` to match. Follow `documentation/system/integration-releases.md`
for supported scope and separate backend qualification; the target grants no
Worker deployment readiness. A `PASS` from fixtures or a manually
edited receipt is not production evidence.

Only an assessment with `PASS` or `NOT_APPLICABLE`, fresh revalidation, and
separate explicit production authorization may reach `npm run deploy:hosting`.
The deployment script is the only supported mutating route. It requires the canonical checkout (or a checkout with `tooling:doctor` green) because Firebase CLI and build dependencies are intentionally not installed into managed worktrees.

## Codex application-verification duty

For an application-impacting candidate, Codex owns the verification decision and
must complete the handoff before treating the release as ready for promotion:

1. Inspect the changed surfaces and choose proportionate proof. Codex may use
   focused tests, a browser, an emulator, provider checks, or a disposable
   qualification journey. No framework, browser, account scheme, or journey is
   prescribed here.
2. Run the selected checks against the exact candidate source and record why
   that scope is sufficient. Cover each changed runtime boundary or state the
   concrete reason a boundary is outside the candidate's behavior.
3. Retain the redacted results and create the source-bound verification bundle
   with the exact source, base, environment, build identity and evidence
   references. A pre-merge result cannot be reused for a different protected
   merge commit.
4. If a required check cannot run, investigate the available tools, access and
   environments first. Report the exact missing external resource and affected
   evidence; do not end with a generic `UNVERIFIED` report when the work is
   still actionable.

The release checker remains conservative: `UNVERIFIED`, `REVIEW_REQUIRED`, and
`BLOCKED` are machine decisions requiring preparation or evidence, not approval.
This duty gives Codex authority over test selection and execution while leaving
source integrity, provenance, freshness, concurrency, publication, recovery and
production authorization to the release system and owner boundary.

## Isolated Homework Worker release

For the pinned October 18 Homework Worker artifact, follow
`documentation/release-audits/2026-10-18-homework-worker-release.md` and use
`--observe-homework-worker --worker-bundle <path> --worker-config <path>`.
The fixed provider observer qualifies only that exact clean source/base/tree,
bundle and deployment configuration. It preserves the full source diff in the
receipt and cannot select arbitrary services. Require fresh shared-checker
`PASS`, independent review and separate Worker authorization. Hosting and
Functions remain outside this artifact release; prepare Worker execution and
recovery using the packet's reviewed operational plan.

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
