# Integration and normal release selection

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
The command neither fetches Git objects nor changes branches, worktrees, files,
GitHub settings or deployments. Exit 0 means a normal source candidate; exit 2
means preparation/qualification is required; exit 1 is an invocation failure.
Every result keeps `deploymentReady: false` and authorization ungranted.

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

After the new workflow has actually reported on GitHub, the proposed main policy is:

- Require a pull request and **LuyenTap integration** from GitHub Actions
  (observed app ID `15368`), with the branch up to date before merging.
- Apply the policy to administrators; disable force pushes and branch deletion.
- Require resolved conversations. Require zero additional approving reviewers
  and no code-owner/last-pusher approval, so the solo maintainer can merge a
  qualified PR. Preserve existing history and allow normal merge commits.

Setting protection requires explicit authorization. Qualify it with a failing
PR check that demonstrably blocks merging, followed by the repaired exact-source
check. A local helper test does not establish enforcement. Never use an empty
required-check list or a path-filtered workflow as a substitute. See GitHub's
[protected branch documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Converge content without replaying history

The November 11 observation verified 458 assets at live `64e2bd69`, while remote
and local main were `3c6d5734` with no protection/rulesets. Those are dated
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
| RTDB and separately released notification/Listening services | Their own historical releases exist; Hosting ancestry is not service state | Fresh per-service artifact/configuration/rules comparison |
| Backup Worker normalization (`77e839f6`) and local routing | Genuine source differences | Establish active compatibility or prepare/defer the dependent behavior explicitly |

Focused component/unit tests support qualification; they do not settle the
browser/provider column. Record a group as finished only with its exact-source
evidence. Mark work deferred only through an explicit reviewed source change;
mark incompatible when an observed contract fails; keep unexplained or untested
work unresolved. Do not manufacture completion from a difference inventory.
The deployed-service JSON is a historical index, not current provider truth.

For Hosting qualification, test teacher authoring save/reload/publish and student
draft/highlight/reload/submit/resume, current Listening edit/cancel/runtime and
retired routes failing closed. Begin at `/login` with dev quick-login on teacher
localhost:5173 and student localhost:5174. Confirm runtime source/configuration
and resource ownership before reusing a server. Shared backend/role ports need
exclusive ownership or the established isolated lane; a port responding is not
source proof. Do not reset/import an existing local dataset to make this pass.

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
