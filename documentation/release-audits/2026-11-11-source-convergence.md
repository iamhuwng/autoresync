# Phase 2 source convergence — 11 November 2026

Scope: qualify the actual production-to-main difference and remove demonstrated
source-selection obstacles. No product feature, abandoned session flow, Firebase
rule, Worker implementation, data, branch protection or production deployment is
changed by this work. The implementation is on `codex/source-convergence` and
still requires reviewed integration before use from main.

## Source selection

The examined integration source is `c2780d5d3a889fcd45f54dbcb31c9296e754815e`.
The independently observed Hosting source is
`64e2bd69f5a0c42b38822783d54cb1677178d68e`, tree
`3a315f88480159fab14ee694fb69b3be8d9d539a`, with 458 verified assets.
A temporary clean checkout of the existing main commit is used for native
qualification while preserving the development diff. The development checker is
the tool under qualification; it is not represented as already adopted on main.
The complete comparison contains 342 paths; the 30-path hotfix union below is
only one subset, not a substitute for reviewing the full candidate's intent.

Reconcile content through normal integration, without replaying production's
historical commits. Of 126 historical hotfix/path mismatch occurrences, 74
already preserve verified current live content. The remaining 52 occurrences
cover 30 unique paths: 13 product/configuration source paths, six product tests,
six release-tooling/workflow paths, and five documentation/ignore paths. These
are review obligations, not 30 demonstrated defects.

The shared assessor now compares protected paths to the verified live tree.
It accepts unchanged published successors and still requires review of a later
change, deletion, mode change or restoration of an obsolete hotfix. An explicit
regression test first reproduced the obsolete-hotfix escape as `PASS`, then
confirmed it requires review after correction. Untrusted observations and the
wrong source tree cannot establish live equivalence. JSON retains individual
obligations; readable planner output groups the distinct paths once.

## Retained behavior and reusable evidence

| Scope | Disposition and evidence |
| --- | --- |
| Reading answer processing | Existing service observations/source comparison establish all nine deployed correction modules already match main. No replay or additional source edit is indicated. |
| Reading runtime/layout | Intentional successor: persisted draft, timer/highlights and formatted/table content have focused existing regression coverage. The [completed runtime record](../architecture/changelog/reading-v2-completed-runtime-layout-2026-11-11.md) records 77/77 candidate and 78/78 main tests, production build, affected browser layouts and exact live hashes. Reuse within that stated scope; it does not prove every newer page lifecycle in a browser. |
| Reading studio/parser/prompts | Intentional successor with accepted-answer pools, grouped multi-answer semantics and canonical prompt schema. Existing import-normalization tests cover the actual changed schema and negative malformed cases; no concrete incompatible payload was found. |
| Listening player | Intentional successor. No callers pass the removed deprecated props. The [Listening record](2026-10-30-listening-classic-player.md) includes 106 UI tests, 97 deployment/recorder tests and completed browser playback/seek/speed/refresh checks; physical-device audio is unqualified. |
| Student/teacher routing and retirement | Retained Reading V2/Listening routes and fail-closed retired routes have existing direct tests. No session functionality is being qualified. One bounded coverage gap was closed in the existing StudentPractice exit test: it now asserts saved projection identity, original start time, homework context and auto-resume support. No application behavior was changed. |
| Tests, tooling and bookkeeping | Product tests are evidence, not extra product features. Release foundation evidence and the current focused release suites cover tooling changes. Documentation/ignore changes require no application scenario; exact reconciliation metadata remains bound to the candidate. |

## Hosting and backend dependency boundary

The previous assessment treated any backend source difference as if the backend
were included in the requested publication. A Hosting-only operation can retain
different backend source while using independently observed, compatible active
services. The new `hosting` target implements that distinction in the existing
assessor, planner, deployment caller and retained intent.

This path requires exact clean source, verified live Git/tree/assets and
production environment; unchanged shared Homework inputs and supported Firebase/
build configuration; active rules equal candidate rules; stable native Worker
versions/bindings/routing and private-audio controls. It does not certify backend
source equivalence. The actual active dependencies receive a fingerprint that
must match the existing technical compatibility review. Changed shared inputs,
Functions, indexes or unsupported configuration cannot use this path. General
service assessment and historical fixed release profiles retain their gates.

Backend readback repeats after archive retention and before publication. The
archive retains the same candidate/environment/Hosting/provider/review binding;
missing, forged or mismatched dependency evidence is rejected. These technical
bindings never provide owner authorization. No compatibility approval file was
written to force a passing assessment.

The known Homework scorer mismatch remains a separate service obligation.
Current main and current Hosting share the newer scorer inputs; this source
selection does not introduce the mismatch or repair the active Worker's older
scorer. A change depending on newer Worker behavior needs that service's own
qualification and authorization. An unrelated frontend release does not imply
a Worker publication.

Native qualification also found the provider reader copying an expired Wrangler
access token. The reader now obtains the token privately through the installed
`wrangler auth token --json` command and the existing stateless x64 resolver.
Wrangler refreshes the existing OAuth session; the observer requires that same
credential type. Tokens are neither logged nor retained. Provider failures now
identify the host/path and status, without request credentials.

## Verification and remaining acceptance

Focused release suites passed 141/141 with no skipped tests. The affected
StudentPractice/resume files passed 44/44, and the strict report validator
confirmed the exact two files and zero failures/skips/TODOs. After the retained
evidence omission guard, archive/planner suites passed 30/30. Native observation
and final shared-reader checks completed as follows:

- Shared provider/Hosting/planner suites: 24/24, zero failures or skips.
- Native dependency observation: succeeded at 05:53:42 UTC (12:53 Bangkok).
  Two stable native provider reads established matching candidate RTDB/Firestore
  rules, all four active Worker deployments/configurations, private-audio
  controls, and unchanged shared source inputs. Provider fingerprint:
  `e1293c0516e33fd26cdb75ea5c9f5e2657fdd08c89d69284f1f3f371e3092f5f`.
- Active Homework Worker remains `3b966806-0b31-405f-bc33-b7f1ac6a6557`, module
  `fd4d41dac99ac574e8004cf670496747c0f906f4ac0fbcb5e5e9f25e1c3d13cf`.
  No service publication occurred.
- Planner remains `QUALIFICATION_REQUIRED`: native dependencies now qualify,
  but exact-candidate frontend compatibility and hotfix successor review are
  required. It reports `deploymentReady: false` and no authorization.
- Independent bounded source review found no material defect in target
  isolation, native branding/binding, hotfix live-successor comparison,
  pre-publication revalidation or retained intent. It did not run tests or
  independently observe providers; the native evidence above supplies that
  separate proof. No new current-main student browser acceptance is claimed.

Evidence is retained beside the consolidated architecture plan in
`C:/Users/The Lord/.codex/visualizations/2026/11/10/01a1c6e8-b044-7d02-a1f2-b0bec683c9c9/`:
`convergence-native-*`, `convergence-final-*`, `convergence-late-check.*` and
`convergence-google-*`. Failed native attempts remain separate: first a cold
Google CLI timeout, then expired Cloudflare authentication. The exact Google
commands subsequently passed unchanged, but the PowerShell script launcher timed
out intermittently again. The observer uses the installed Google SDK's tested
Windows `.cmd` launcher instead. No Google configuration or credentials were
altered.

This work does not count as either required normal production release. New
GitHub publication/PR/merge and every deployment remain outside this work's
authorization. Before a future publication, integrate the reviewed changes,
select the actual clean integrated commit, regenerate its native evidence and
technical review bindings, and use the guarded Hosting command under separate
owner authorization. Keep the current production and recovery versions intact.

Local work is preserved in `source-convergence-qualified-snapshot/` beside the
architecture plan: full changed files, a binary Git patch, the base revision
and SHA-256 manifest. This is local preservation, not a remote backup or commit.
The temporary proof checkout is task-owned and removed after its clean-state
check; existing worktrees and their data remain preserved. If adoption is
rejected, the current main/production sources continue to use their existing
mechanisms. No source history needs to be reset.
