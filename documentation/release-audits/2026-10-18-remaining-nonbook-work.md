# Remaining non-Book work — 2026-10-18

This follow-up starts from synchronized main `42fcf888`, after the qualified
Hosting release of `83d794d4`. It does not authorize or record another service
deployment. The owner explicitly chose to keep the retained student feedback
pages and Student Study OS design pack separate from stable main.

## Homework direct recipients

The reconstruction already contains the basic teacher-owned class-member key
to Firebase UID mapping. Fresh Cloudflare source readback at
`2026-10-18T01:16:17.705Z` confirms that active backup Worker version
`f37869c0-c597-41cc-893b-7f7652d80e41` still lacks that mapping. Its sole module,
`reading-release-candidate.mjs`, has SHA-256
`c789454458790c5fb0893952043a150b34cefa345c5b02b06c1f04edddad112b`.

The follow-up hardens the existing source fix:

- IDs retain their original input indices through trimming and blank filtering.
  Canonical IDs and corresponding names are deduplicated together, keeping the
  first occurrence. Assignment count and direct access grants use the same IDs.
- Only nonblank class-record UIDs replace member IDs. Guests with optional or
  blank UIDs retain their existing member identity.
- Teacher authorization remains limited to owned classes or active links and
  assignments. Super-admin direct-ID authorization is unchanged; it does not
  scan all classes or normalize arbitrary member aliases. Existing UI producers
  already prefer a roster UID when available.

The shared consumers are `homeworkManager`'s authenticated student query,
index-based names in `useTargetGrid` and teacher homework detail, and the THCS
notification producer's committed assignment recipient list. This correction
changes their stored input; it adds no announcement, reporting action, delivery
host, database node, rule, or index. Existing toast/reporting/notification ports
are unchanged. It does not claim a new notification was delivered.

Verification: the expanded route regression first failed because two canonical
recipients retained four names. After correction, all **92 backup Worker tests
in 15 files pass**, including 37 assignment tests covering UID grants, aligned
names, blank IDs/UIDs, guest fallback, admin scope, unauthorized rejection and
grant rollback. Wrangler 4.68.1 dry-run succeeds (412.52 KiB). The assessment
guardrail, applicable pre-commit enforcement and `git diff --check` pass.

Tests used the existing canonical backup package through Windows x64 Node,
with the selected checkout as `--root`. Its configuration and lockfile hashes
match the canonical package. Loading the selected config directly initially
resolved its root ARM64 Rollup tree; selecting the byte-identical canonical
config avoided that tool-resolution mismatch without installing dependencies.

**Not deployment-ready yet:** comparison of the actual dry-run module with the
active module also finds unrelated Book source-upload state validation changes
imported by backup/restore code from shared app modules. Deploying that bundle
as a homework-only release would cross the Book scope boundary. Those
dependencies must be isolated and reviewed first. No Worker deployment or
authenticated browser creation/read/delivery acceptance has occurred for this
follow-up. The production JWT verifier does not accept local emulator tokens;
the route tests mock authentication and provider transport explicitly.

An isolated candidate based on pre-reconstruction `422b7323`, with only the
recipient correction, removes the Book validation drift but still differs from
the active Reading submit implementation: production retains assignment-owner
binding and writes `teacher_result_keys`, whereas this historical source lacks
that binding and writes the older teacher result index. Preserve those live
guards and index semantics before releasing either candidate. The first
isolation comparison deliberately fails rather than labeling this drift as
compiler-only. The candidate does not establish deployed Git provenance.

Local read-only source and dry-run evidence is preserved under
`C:/Users/The Lord/repos/luyentap-prd0062/tmp/deployment-audit-20261017/` as
`homework-worker-current-source.json`,
`homework-live-reading-release-candidate.mjs` and
`homework-recipient-worker-dry-run/`.

## Retained history and independent Listening work

The 28 commits on `codex/retained-local-main-feedback-20261017` reduce to:

- `de643fe8`: obsolete environment wiring, already superseded on main. Do not
  restore it; it would regress orchestrated development and gateway ownership.
- `f92f507c`: Student Study OS draft specifications, three responsive HTML
  masters, component prototypes and evidence. It has no runtime authority.
- The remaining 26 commits: 23 final static HTML files under `public/student/`
  for bao, be, bo, ducanh, dw, nguyen and tung. They contain student dashboards,
  essays and feedback and would be public without login if deployed. Preserve
  them separately, as the owner requested; do not import their old Cloudflare
  dependency changes.

The separate seven-commit Listening cleanup chain is being reconciled in an
isolated branch. Its coordinated upload/session/cleanup/rules/restore scope is
listed in [the Listening inventory](../system/listening-cleanup-reconciliation-20261017.md).
Historical ancestry alone does not establish runtime readiness. Keep scheduled
deletion disabled, preserve current Book/security changes in shared files, and
qualify the resulting source and real lifecycle before any service release.

PDF Book and newer local persistence/recovery tooling remain separate work.
This record closes neither their acceptance nor the overall remaining-work task.

## Superseding homework source isolation result

The isolated backend candidate preserves both deployed Reading behaviors:
saved homework ownership/material binding and `teacher_result_keys` discovery.
The shared matcher and Academic band calculation remain intact. Its actual
bundle is equal to the fresh active module outside the reviewed `resolveTarget`
function after only dependency debug-path prefix, source-map comment, CRLF, and
an exactly equal 98-line pure declaration block emitted in a different position
are accounted for. The proof asserts that the moved block itself is unchanged.

Evidence: `homework-worker-isolation-proof.json`, generated at
`2026-10-18T01:35:30.915Z`; active module SHA-256 remains `c7894544...ad112b`,
candidate module SHA-256 `6e4bb95e53191b1a32e361e044765c4d6da7d39764d0e904abcf8ddd82e4f7ed`,
normalized outside-target SHA-256
`ff00c8cd6e85798880f2e2542c43174e7ef9f4d84ff098562df1600b57d9c7e1`.
This is explicitly reviewed equivalence, not byte identity or proof of the
historical deployed Git revision. The first failed comparison remains evidence.

The Reading source restoration is also applied to the main-based correction
branch. Its full backup suite passes **93 tests in 15 files**; the shared submit
core passes **8 tests** and the passage-set/scoring suites pass **18 tests**.
The retained Functions source caller is coherent with the core; deprecated
Functions deployment and generated output are not qualified by these checks.

The source correction is in draft PR #150. The service candidate is isolated
on `codex/homework-worker-release-20261018`, based on `422b7323` with the live
Reading corrections restored, so it does not change the Book backup contract.
A direct main-based Worker rebuild still includes the separate Book validation
delta and is not a substitute for that service candidate. Neither branch has
been deployed, and authenticated recipient workflow/delivery acceptance remains
unverified.

## Reproducible backup build dependencies

The previous backup package lock selected jose 6.1.3 and Wrangler 4.68.1 while
the active bundle uses jose 6.2.2 and the matching compiler output is produced
by Wrangler 4.103.0/esbuild 0.28.1. The isolated service candidate and main-based
source fix now pin jose 6.2.2 and Wrangler 4.103.0 in the backup package. The
lock-only update installs no dependency tree. Existing matching jose and
Wrangler installations were reused for the successful bundle comparison.

The assessment workflow gains a dedicated backup job that installs this package
from its lock, runs the suite and performs a non-mutating Worker dry-run on a
fresh runner. That job's actual result must be checked before claiming fresh
clone qualification. Local testing does not claim the older installed backup
tool tree was upgraded. Windows workerd remains on the existing x64 route.

### Fresh-runner and clean service proof

At source `3c36d128`, GitHub run `39088312826` passed the new backup job:
fresh `npm ci`, **93 tests in 15 files**, and Wrangler **4.103.0** dry-run
(413.43 KiB). Assessment guardrails and result governance also passed. This
proves installation/build repeatability; that main-based bundle still includes
the separate Book dependency delta and is not the scoped service release.

The isolated service candidate is committed and pushed as
`99bb3f073319c57f62b0889d7c0a98b054e06e95` on
`codex/homework-worker-release-20261018`, tree
`6cebb25691f322fd811c0ab5dd6ccf113e71dfe5`. It passes **92 backup tests in
15 files** and **8 submit-core tests**. The older service base has four restore
tests versus five on reconstructed main, accounting for the total difference.
A clean-source rebuild at `2026-10-18T01:59:54Z` and fresh provider readback
retain the candidate/live module hashes and outside-target equality above;
the comparison receipt now binds this exact clean revision and tree. Neither
branch is deployed. Authenticated recipient/delivery qualification remains open.

## Superseding authenticated local qualification — October 18, 10:40 Bangkok

The isolated Worker candidate `99bb3f07` passed local authenticated Teacher and
Student acceptance at `2026-10-18T03:40:49.219Z`. The real lobby Assign HW action
called the compiled candidate handler; Teacher Homework Timeline showed the
assignment, and its recipient's Homework list/detail launched the assigned
Writing prompt and editor. No answer was entered or submitted. The nonrecipient
student's list excluded it, and its protected payload read returned 401 versus
the recipient's 200. An exact alias/UID request separately reproduced duplicate
recipients in the old handler and one canonical UID with the aligned name in
the candidate. Normal UI selection already prefers UIDs, so the replay and
browser checks establish different parts of this contract.

Wrong-issuer, wrong-signature and unsigned-token requests returned 401; a student
assignment attempt returned 403. Browser identity came from actual disposable
Auth emulator login. A test-only adapter exchanged its verified principal for
an ephemeral RS256 token; unchanged jose verification read the fixture JWKS.
OAuth and database REST calls were routed to emulators. This is local
integration evidence, not real Google-issued-token or production service proof.

The acceptance UI artifact was built from `7953a039`; its app inputs are
unchanged through deployed source `091a1746`. It was reused, not rebuilt from
that later revision. The Worker is clean at `99bb3f07`, bundle SHA-256
`6e4bb95e53191b1a32e361e044765c4d6da7d39764d0e904abcf8ddd82e4f7ed`.
The binding audit records hashes and zero remaining task-owned listeners;
shared RTDB/Firestore emulators and the rich development namespace were preserved.

Existing limitations are explicit: unchanged Firestore rules permit any signed-in
account to read ordinary assignment metadata directly, although the nonrecipient
list and protected material checks reject access as described above. Student
detail logs two denied private authoring-test reads and leaves Questions loading;
the assigned safe payload still launches correctly. Ten intentionally blocked
font-resource errors were retained; no unclassified captured error remained.
Console and pageerror channels were combined, so no separate pageerror-count
claim is made. Only Writing assignment/launch was exercised; grading, trusted
Reading submission, new notification delivery and provider execution were not.

PR #150's branch was updated from stable main (`2ce856e3`), preserving the
Book correction. All four CI checks passed, including 93 backup tests and the
Wrangler 4.103.0 non-deploying build. Independent source review found no introduced
recipient or Reading-owner/index defect and reproduced isolated bundle equality
outside `resolveTarget`. The main-based Worker bundle remains excluded because
it includes unrelated Book backup dependencies.

A fresh provider read at `2026-10-18T03:24:38.296Z` still found active version
`f37869c0-c597-41cc-893b-7f7652d80e41`, module SHA-256 `c7894544...ad112b`;
bindings, compatibility date, retention and schedule match the scoped service
configuration. Only read operations were performed. Worker-specific release
preflight, separate release authorization and actual live acceptance remain
required; the generic Hosting observer does not verify backup Worker release
readiness. No provider release or Firebase rule change is claimed.

Evidence in the canonical ignored audit directory: `homework-qualification.json`,
`homework-qualification-audit.json`, `homework-qualification-student-opened.png`,
and `homework-provider-read-2026-10-18T03-24-38-296Z.json`.

## Superseding release gate and deferred Listening decision

The fixed native Homework Worker observer is integrated with the shared release
checker. Its actual GET-only assessment passed at `2026-10-18T07:15:19.405Z`;
the separate operational receipt no longer substitutes for the mandatory
shared gate. Exact scope, recovery, 77 focused checker/deployment/observer test
results and limitations are in [the Worker release packet](2026-10-18-homework-worker-release.md).
PR #150 merge and isolated Worker deployment remain separately unauthorized.

The owner acknowledged keeping the Listening cleanup draft separate while
finishing stable after the permanent-marker recovery tradeoff was explained.
PR #151 stays a draft with sweep disabled; no permanent-marker implementation,
Listening deployment or PDF Book rollout is included.
