# Integration and normal release selection

The active release-architecture objectives, phase boundaries and Phase 3
acceptance matrix are maintained in
[the canonical architecture plan](../architecture/luyentap-release-architecture-plan.md).
This document is the operational source for integration and release selection;
dated observations remain evidence records.

This document explains source convergence and normal-release selection. The
current release operator commands and promotion contract live in
[release-safety.md](release-safety.md); dated observations below remain
evidence records and do not duplicate or replace that runbook. “Release
qualification Phase 3” here refers to the CI promotion architecture, distinct
from product PRD Phase 3 work.

Phase 2 extends the existing release assessment and Release Safety workflow.
It does not equate main with production. A passing integration check establishes
its declared test/build scope; the exact release candidate still needs the
shared release assessment, relevant browser/provider evidence and authorization.

## Start with a release plan

```powershell
npm run release:plan
npm run release:plan -- --cwd <candidate-checkout> --json
```

The planner independently reads the live manifest and every listed asset, uses
that source as its default comparison base, and invokes `release-check.mjs`.
It reads the existing production environment file only to compute its digest;
it does not print its values. The existing `LUYENTAP_PRODUCTION_ENV_FILE`
override and `--env-file` select that file. No new credentials are provisioned.

Output contains candidate identity/dirty state, observed live identity, affected
services, shared assessment findings and hotfix obligations, advisory impact
clues, suggested changed/collocated tests, and the next preparation steps.
CSS changes containing external-resource directives are not suggested as pure
presentation changes; arbitrary application code defaults to possible behavior
change. These clues do not clear compatibility gates. Test suggestions do not
establish coverage of imports, callers, negative cases or browser flows.

`--offline --base <revision>` permits an explicitly unverified local comparison.
An explicit online base that disagrees with live is blocked by the shared
assessor. Missing source objects are reported, never silently reconstructed.
The command neither fetches Git objects nor changes branches, worktrees, candidate files,
GitHub settings or deployments. Exit 0 means a normal source candidate; exit 2
means preparation/qualification is required; exit 1 is an invocation failure.
Every result keeps `deploymentReady: false` and authorization ungranted.
Authenticated provider tools may refresh their existing local session cache;
this does not create a login, change permissions or modify application state.

### Hosting publication scope

The planner defaults to `--target hosting`; `--target all` retains the broader
service assessment. The shared checker defaults to `all`, so select
`release:check -- --target hosting --base <observed-live-revision>` explicitly
when preparing a Hosting publication. The guarded Hosting command selects this
scope automatically. Fixed historical service-release profiles remain separate.

A monorepo difference does not mean every service will be deployed. The Hosting
scope preserves the complete source/service delta while checking its actual
active dependencies. When backend paths differ, native readback must establish
candidate rules equal active RTDB/Firestore rules, stable Worker versions,
bindings/routing, and private-audio access/lifecycle constraints. All 15 compiled
shared Homework inputs must equal the verified live Hosting source. Changes to
those inputs, Functions, indexes, Firebase configuration or Vite configuration
cannot use this qualification path. They require their own substantive review
and service qualification; there is no override flag.

The observation describes active backend code; it does not certify candidate
Worker code or repair the pre-existing scorer mismatch. The compatibility review
must also bind its `dependenciesFingerprint`, which covers exact candidate,
production environment, verified Hosting baseline and active provider state.
Native readback is repeated after archive retention and before publication.
Changed dependencies stop publication. The retained intent includes the same
binding. Caller JSON cannot create native observations. A review file records
technical review, never establishes independent evidence or owner authorization.

Without a backend delta, the existing frontend path remains in use. After a
qualified normal release from main, unchanged backend files no longer create a
historical production-to-main delta; this is not a new release branch or a
permanent production-source reconstruction process.

### Historical corrections

Hotfix comparison uses the verified live Git tree as its current baseline.
An unchanged live successor needs no repeated historical equivalence review.
Any changed protected path still needs review, including restoring an older
hotfix while losing a later correction. Without a trusted matching live tree,
the historical checks remain conservative. Paths, file modes and deletions are
compared through Git tree entries.

The planner groups the residual paths once in its readable output; JSON retains
each obligation and disposition. Reviewing the same path against several old
releases is mechanical bookkeeping, not several distinct product decisions.
Existing exact-candidate reconciliation bindings remain required. This change
neither deletes release history nor manufactures compatibility approvals.

`--integration-ref` defaults to local `refs/heads/main`. Its ancestry and
divergence are context, not releasability evidence. Remote freshness, required
CI and protection are explicitly **not observed by this command**. Verify those
on GitHub before integration; rerun the native deployment preflight before any
authorized publication. No serialized planner report becomes trusted evidence.

## One required GitHub result

The existing Release Safety workflow reports **LuyenTap integration** on every
pull request, main/release-branch push and merge-group event, with no path filter.
It aggregates candidate release/emulator/build checks, shared guards and app
tests, notification tests, candidate Homework/backup Worker tests/build, and the
existing retained deployed-Worker rebuild. That last job proves retention and
rebuildability of its recorded source, not candidate behavior.

Candidate jobs bind their successful result to the checked-out event commit and
tree. The final job runs with `always()` and rejects missing, failed, cancelled,
skipped or mismatched-source dependencies. The app and candidate Worker scopes
reuse the existing strict Vitest report validator: nonzero tests, exact selected
files, no failures/skips/TODOs. Relevant coverage remains a review responsibility.
The build uses disposable acceptance configuration and the existing bundle budget.
PRs test their merge commit; stale base checks must be blocked by protection.

Formal sessions are being abandoned. Their six specific suites are excluded
from this new required scope; shared clocks and student practice/homework resume
checks remain. This does not remove feature code or change the older independent
workflows. New verification must address a retained workflow or a concrete
convergence risk, rather than expand into general application QA.

The Homework Worker also compiles shared files from `src/` and `functions/`.
The shared assessor classifies those exact inputs as `backup-worker` impact in
addition to their existing scopes. CI checks Wrangler's actual source map against
that same path map; a newly compiled, unclassified repository input fails the
integration job. Scoring/contract changes therefore cannot be reported as a
Hosting-only release. No extra approval store or policy engine is introduced.

The main policy applied and read back on November 11 is:

- Require a pull request and **LuyenTap integration** from GitHub Actions
  (observed app ID `15368`), with the branch up to date before merging.
- Apply the policy to administrators; disable force pushes and branch deletion.
- Require resolved conversations. Require zero additional approving reviewers
  and no code-owner/last-pusher approval, so the solo maintainer can merge a
  qualified PR. Preserve existing history and allow normal merge commits.

The owner authorized this policy. The real [PR #202](https://github.com/iamhuwng/autoresync/pull/202)
passed the complete [Release Safety run](https://github.com/iamhuwng/autoresync/actions/runs/42916422768)
at `2b5218f0`. A subsequent authorized [controlled run](https://github.com/iamhuwng/autoresync/actions/runs/42917059040)
at `6c0eb381` deliberately skipped `guardrails`: all four running dependencies
passed, the aggregate failed for the skipped/missing-source dependency and
GitHub reported this non-draft, mergeable PR as `BLOCKED`. The temporary skip
is restored in the repair; require the repaired latest head to pass before any
authorized merge. No merge endpoint was called to test enforcement.

Real-run qualification exposed five empty, unreferenced development Gitlinks
without `.gitmodules` URLs. Their tracked entries were removed and exact ignore
rules added; all directories and 15 registered worktrees were preserved. The
retained historical Worker is extracted from its exact Git archive and still
must match the original normalized artifact hash. Two imported conversation
records also needed their existing local byte-preservation rules checked into
`.gitattributes`; their blob contents were preserved. Checkout credential
cleanup and whole-source integrity checks remain enabled.

Future protection changes require authorization. A local helper test does not
establish enforcement. Never use an empty
required-check list or a path-filtered workflow as a substitute. See GitHub's
[protected branch documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Phase 3 CI promotion boundary

The repository now tests the release-card contract in the existing read-only
Release Safety workflow. `scripts/release-promotion.mjs` binds the exact main
source and event SHA, observed baseline, actual passing verification result,
verification plan, compatibility review, configuration/dependency state,
environment fingerprint, artifact manifest identity, source-bound application
verification evidence when required by changed paths, missing proof, impact and
recovery limits. `scripts/deploy-live.mjs --deploy-retained`
verifies that bound artifact and publishes it through the
same `deployHosting` route without a second build.

The guarded workflow is now defined in `.github/workflows/release-promotion-phase3.yml`.
It is manual and main-only. Its preparer derives the source, live baseline,
environment/configuration/artifact bindings, affected verification scope,
owner-facing impact and missing proof. Codex supplies an external source-keyed
verification bundle when application paths require evidence; preparation reads
the retained asset back by tag and digest, and the workflow validates the bundle
without running a fixed browser suite. The protected `production` environment is the
separate owner authorization boundary; the existing executor remains the only
publication route, and the recovery dispatch resumes one recorded operation
without rebuilding or publishing.
The publish job preserves the operation UUID even when the executor exits after
provider acceptance, uploads the reconciliation patch and operation evidence to
the retained Hosting operation when available, and also keeps them in the Action
artifact. The generated verification plan is retained and rehydrated in the
promotion job; discovered compatibility reviews are passed to the existing
assessor with their exact digest.
All Action transfers use repository-relative staging directories, so the
artifact root is stable across runner jobs. Changelog and operation-evidence
upload failures fail the publication job instead of being silently converted to
a successful release. The workflow also uploads a bounded
`changelog-integration-request.json`; it records that the temporary checkout
patch still requires protected-main integration and never marks that handoff as
canonical reconciliation.

GitHub protection, environment approval, short-lived ADC federation and
provider publication/recovery remain external qualification decisions. The
14 November Hosting experiment is infrastructure evidence for publication,
readback, native clone recovery and cleanup; it is not an application browser
requirement. Codex chooses any additional browser or tool verification required
by the actual change. The separate local-development reliability plan remains
proposed and separately authorized; it is not part of this release implementation.

For an application-impacting candidate, Codex records the selected proof outside the
candidate checkout and creates an external source-keyed bundle with
`scripts/release-verification-bundle.mjs`. The bundle is retained as the
published prerelease asset `verification-<source revision>/verification-bundle.json`.
It binds the exact revision, base, source fingerprint, environment fingerprint,
deterministic build-input identity, timestamp and a compact tool-neutral record. The `none` CLI value derives that identity from the candidate tree and environment fingerprint. Evidence references
are `bundle://artifact/<id>` values; each referenced artifact is embedded with
its size and SHA-256, so preparation can read the retained bytes back and fail
closed on missing, fabricated, altered, stale or mismatched proof.

Codex may use a browser, emulator, provider tool or focused automated check as
the method requires. A non-application candidate gets an explicit
`not-required` record from the path classifier and does not need a bundle.
Preparation validates the bundle against the current source and environment, and
the promotion card carries the validated bundle digest and content. This avoids
a source-committed record whose fingerprint would include itself.

The handoff is reproducible: after Codex finishes its selected checks, it writes
the compact record and evidence files outside the checkout, then runs:

```powershell
node scripts/release-verification-bundle.mjs --create --base <reviewed-base> --record <record.json> --environment <environment-file> --environment-identity <identity> --build-identity none --evidence=browser:<evidence-file> --output <bundle.json>
node scripts/release-verification-bundle.mjs --publish <bundle.json>
```

The command returns the prerelease tag and bundle digest; supply both as the
guarded workflow's `verification_tag` and `verification_sha256` inputs.

## Converge content without replaying history

The [November 11 convergence follow-up](../release-audits/2026-11-11-source-convergence.md)
records current native dependency evidence and bounded implementation checks.
It qualifies the new Hosting dependency observation on clean main `c2780d5d`;
candidate compatibility approval and adoption of the later tooling remain
pending. The initial comparison below is dated context, not the current gate.

The initial November 11 observation verified 458 assets at live `64e2bd69`, while remote
and local main were `3c6d5734` with no protection/rulesets. Protection was then
applied and qualified as recorded above; main's source was not changed. Those are dated
observations, not future defaults. The histories diverged by 98 main-only and
12 live-only commits; their trees differed at 317 paths (191 under `src`).

Use current main as the convergence candidate and preserve its existing history.
Do not perform a mass historical merge or create another permanent selective
release branch. Review and qualify the actual live-to-candidate delta:

| Scope at that observation | Evidence/disposition | Remaining qualification |
| --- | --- | --- |
| Deployed answer-processing corrections | All nine `23ae29a7` modules already match main byte for byte | Preserve and exercise their callers; no replay needed |
| Runtime layout/table/splitter corrections | Runtime CSS matches; forward integrations are recorded | Newer TSX draft/highlight/resume behavior needs semantic regression proof |
| Legacy Reading retirement and Listening facade removal (`51fe89ba`) | Implemented; historical record lacks completed browser qualification | Authoring/runtime/retired-route tests and authenticated affected flows |
| RTDB and Firestore rules | November 11 native provider reads match candidate/main (Firestore after CRLF normalization) | No rules publication indicated; repeat readback for a later authorized release |
| Upload and notification services | Active modules match their recorded artifacts; relevant source matches main | No service publication indicated by this source delta |
| Homework/backup Worker | Snapshot normalization is already active; shared scorer/guard differ from the active module | Retained candidate artifact is reviewed below; preserve this separate service obligation |

Focused component/unit tests support qualification; they do not settle the
browser/provider column. Record a group as finished only with its exact-source
evidence. Mark work deferred only through an explicit reviewed source change;
mark incompatible when an observed contract fails; keep unexplained or untested
work unresolved. Do not manufacture completion from a difference inventory.
The deployed-service JSON is a historical index, not current provider truth.

A read-only runtime check initially found student localhost:5174 serving the old
`64e2bd69` production artifact, and teacher localhost:5173 serving Reading
runtime source different from current main. Backend ownership was unverified.
This could not count as current-main browser proof. The owner later reserved the
role/Worker ports. A detached candidate runtime was identified against the served
source map; teacher quick-login and a local Reading draft save/reload/publication
were observed. An attempted Start Test entered the abandoned session flow and
failed before creating a session. That path was stopped and supplies no student
evidence. No session code was changed. The task-owned runtime was then stopped;
the same Firebase emulator processes and their data were preserved.

Any further browser verification must answer a named release question, such as
whether the candidate's new student draft state survives reload. Test student
behavior as Student through the student interface; use teacher authoring only
for its own behavior or necessary fixture preparation. Begin at `/login` with
dev quick-login on teacher localhost:5173 or student localhost:5174. Confirm
source/configuration and resource ownership first. A port responding is not source
proof. Do not reset/import existing local data or revive sessions for qualification.

## Observed Homework Worker dependency

The November 11 readback identified active Worker version
`3b966806-0b31-405f-bc33-b7f1ac6a6557` at 100%, module SHA-256
`fd4d41dac99ac574e8004cf670496747c0f906f4ac0fbcb5e5e9f25e1c3d13cf`.
The live module includes snapshot normalization, but lacks newer shared scorer
and paragraph-anchor guard logic. An isolated execution of only its pure scoring
declarations demonstrated these differences:

| Expected answer / submitted answer | Active Worker score | Candidate score |
| --- | --- | --- |
| `1/2` / `12` | 1 | 0 |
| `1.5` / `15` | 1 | 0 |
| `1/2` / `1/2` | 1 | 1 |
| `1,000 km` / `1000 km` | 1 | 1 |

Both main and current Hosting already contain the newer shared scorer/guard
source. This is a pre-existing cross-service mismatch, not a Phase 2 regression.
It does not justify publishing a Worker for every unrelated presentation change.
When changed behavior depends on that service, resolve its actual compatibility
and publication scope before the dependent Hosting release.

The retained candidate Worker built from the unchanged product source at
`987599dd` is 455,373 bytes, SHA-256
`35a2e6264fb9494c162ff2e2cb872059bcf8a0eebd0507e18ca297b9a5ae7a4f`.
The existing 121 Worker tests passed; the focused scorer/guard suites are included
in the new required app scope. All 37 compiled repository inputs were compared
with source; 15 are outside the Worker directory. Bundle comparison, normalizing
only known historical build-root labels, isolates four differing modules: scorer,
canonical guard, Firebase auth and homework assignments. The latter two are
main's local-emulator auth/routing support; deployment review must still account
for them. Other compiled sections match. Source configuration is unchanged.

This is a reviewable artifact, not deployment approval or full remote runtime
qualification. A future authorized Worker release must bind its exact source,
artifact/configuration and current provider state, preserve the old version/module
above for recovery, and verify publication independently. Do not relax historical
fixed observers or submit a self-authored approval file to force readiness.
Sanitized service readbacks, pure-score assertions and artifact comparisons are
retained with the architecture plan as `phase2-service-observation.json` and
`phase2-homework-qualification.json`. They are dated evidence, not ongoing live state.

If an observed backend incompatibility requires choosing between a new service
release and deferring behavior, present that concrete choice to the owner.
Continue unrelated qualification while the choice or external authorization is
pending. Emergency live-based fixes retain the existing forward-integration
and hotfix checks until their successors are deliberately qualified.

## Adoption and the owner's role

Preserve the implementation on its task branch, publish it and integrate through
a PR only within the authorized scope. Introducing the checks does not certify
all existing main features for production. Keep current production unchanged
while main's actual remaining scope is qualified.

The owner reviews the working result and authorizes its release scope. The agent
handles Git selection, evidence and digests. A pull request is the proposed
integration change; Actions supplies automatic checks; branch protection stops
an unqualified merge. None of those supplies production authorization.

Phase 2 adoption remains incomplete until real protection is enforced, main is
a qualified normal source, and two consecutive authorized normal releases are
selected from it without reconstruction. Source-selection tests may establish
capability earlier; they cannot be counted as production publications. Local
runtime ownership improvements remain a prerequisite for reliable browser
proof, not a reason to build a second release framework.
