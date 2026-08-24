# PRD0062 remaining-gates reconciliation — 2026-08-24

Status: `PARTIAL_CURRENT_CANDIDATE_PROOF_DOWNSTREAM_GATES_OPEN`.

This record reconciles the active PRD0062 completion gates after the current
#126 candidate was verified. It does not promote historical local evidence to
current-head or deployed acceptance, and it does not close #127–#136.

## Source and verification boundary

- Branch: `codex/prd0062-continuation-after-cleanup`.
- Git head at inspection: `28efe1cea9547619e96e6722655be998c0524be9`.
- The source inspection began at parent commit `28efe1cea9547619e96e6722655be998c0524be9` with the worktree dirty. Final commit and remote parity are recorded only after the current source, evidence, and independent review are committed.
- Current #126 production proof is
  `126-production-browser-proof-2026-08-24.md` and `.json`.
- Frontend focused proof in this worktree: 4 files / 25 tests passed.
- Current focused Activity security proof: 3 files / 16 passed with 1
  emulator-only skip; the exact emulator branch separately passed 1 file /
  2 tests.
- Direct production build passed: 9,504 modules transformed; bundle budget
  passed with a 245 KB root entry.
- Repository-wide `tsc --noEmit` remains red in unrelated existing
  Book/Material seams; no reported diagnostic was in the changed PDF transport
  or Worker repository files.
- Acceptance schema validation passed: 9 cases / 33 fixture entries.
- Safe rollback target readback passed for Worker version
  `511a9ca5-3245-4765-b032-46690e8cc20f` / number `142`; all delivery,
  document, Homework, runtime, source, assembly, and mutation gates were
  disabled. The older tracked v18 rollback JSON is historical and is not used
  as the current version identity.
- The semantic authority checker passed directly under native ARM64 `vite-node`
  with 32 capability rows, 32 accepted registrations, 33 fixture entries, and
  32 activity rows. The release activity-coverage matrix passed directly with
  32 rows and its native `vite-node` fixture checker passed 32 fixtures. The
  repository harness still reports `LIVE_DEPENDENCY_OVERLAY_COLLISION`, but it
  is no longer used as the only #127 result.

## 2026-08-24 current-source reconciliation before commit

The current source correction was exercised directly without repeating the
already accepted #126 production browser proof:

- #127 semantic conformance passed 32 capability rows, 32 accepted
  registrations, 33 fixture entries, and 32 activity rows. Release coverage
  passed 32 rows and 32 native fixture checks.
- The #128 source batch passed 18 files / 97 tests; the #129 source batch passed
  18 files / 95 tests; and the #130 source batch passed 19 files / 89 tests.
  These are source-only results and do not close their browser/deployed gates.
- The nested Homework manifest pin regression passed 3 files / 25 tests after
  `advanceBookHomeworkActivityBinding` began updating both manifest pins.
- The assembled Firebase rules matrix passed 8 result files, 23 suites, and
  89/89 tests. The current pure security run passed 217/252 tests with 35
  intentional skips and zero failures. Focused current Activity rules passed
  16 tests with one emulator-only skip, and the targeted emulator branch passed
  2/2 tests covering browser/cross-owner writes, ancestor-shaped updates, and
  delete denial.
- The local recovery acceptance passed 1/1 root test; the R2 backup worker
  passed 15 files / 82 tests. The direct production build transformed 9,504
  modules and passed the 245 KB root-entry budget.
- Changed-path ESLint passed. Repository-wide TypeScript remains red on
  unrelated pre-existing diagnostics outside the changed paths. The exact
  Cloudflare Worker startup attempt was run from
  `C:\Users\The Lord\repos\luyentap-prd0062` with
  `node node_modules/vitest/vitest.mjs run --config
  cloudflare/vitest.config.mjs --maxWorkers=1 --passWithNoTests=false
  --reporter=dot cloudflare/test/generated-book-rules-composer.test.ts`;
  Node was `arm64 C:\Program Files\nodejs\node.exe v22.17.1`, the config
  loaded `cloudflare/node_modules/workerd`, and it exited `1` with
  `Unsupported platform: win32 arm64 LE` before product assertions.

The canonical Activity composer now fails closed unless the two ordinary
canonical `.write` expressions have the expected create/update shape, then
retains only the immutable `!data.exists()` create branch. The raw 16A producer
fragment was not rewritten; the generated `database.rules.json` was regenerated
from the composer. The superseded unreferenced `activityPublish` slice was
removed, and current Homework fixtures now carry the nested manifest pin.
These corrections remain local until the branch commit and do not authorize a
production rules deployment, assignment mutation, remote measurement, pilot,
or release decision.

## Ticket ledger

| Ticket | Current disposition | Evidence / remaining gate |
|---|---|---|
| #127 / 51A | `CURRENT_SOURCE_CONFORMANT_SEMANTIC_AND_COVERAGE_PASS_CONSUMER_GATES_OPEN` | Direct native ARM64 semantic conformance passed with 32/32 capability rows and direct release coverage passed with 32 rows/32 fixtures. This closes the definition/conformance gate only; #128–#134 consumer and deployed gates remain open. |
| #128 / 51B1 | `LOCAL_NON_ACTIVATION_PROOF_WITH_HELD_POSITIVE_CASE` | `128-teacher-authoring-assignment-provisional-2026-08-12.json`; complete positive activated authoring/assignment, cleanup, and case-manifest proof remains open. |
| #129 / 51B2 | `LOCAL_ACCEPTANCE_NOT_DEPLOYED` | `129-teacher-updates-results-provisional-2026-08-12.json`; current-build integrated/deployed update, replacement, result, retry, and replay proof remains for #134. |
| #130 / 51C1 | `LOCAL_ACCEPTANCE_PLUS_BOUNDED_CURRENT_RUNTIME_PROOF_NOT_FULL_SUITE` | `130-student-runtime-provisional-2026-08-12.json` plus current #126 Homework PDF browser proof; the full all-context current-source/deployed matrix remains open. |
| #131 / 51C2 | `LOCAL_AUTOMATED_PASS_NATIVE_SCREEN_READER_PENDING` | `131-accessibility-device-provisional-2026-08-12.json`; native screen-reader announcement/order and remaining companion/true-zoom/device evidence remain open. |
| #132 / 51D1 | `LOCAL_BOUNDED_SECURITY_PASS_NOT_DEPLOYED` | `132-contract-security-provisional-2026-08-12.json` and `118-final-rules-proof-2026-08-12.json`; current exact tuple reconciliation and deployed security remain for #134. |
| #133 / 51D2 | `LOCAL_RECOVERY_PASS_NOT_DEPLOYED` | `133-legacy-backup-recovery-provisional-2026-08-12.json`; integrated deployed recovery, cleanup, and rollback remain for #134. |
| #134 / 51E | `APPROVAL_GATED_DOWNSTREAM` | `pre-134-readiness-assessment-2026-08-12.json`; requires current-build #128–#133 reconciliation, the #131 manual gate, an authorized deployed/canary drill, cleanup, readback, and rollback. |
| #135 / 52A | `LOCAL_PREPARATION_ACCEPTED_REMOTE_MEASUREMENT_BLOCKED` | Existing reconciliation/readiness records; representative remote traffic, bytes, latency, egress, billing, and headroom measurement needs separate authorization. |
| #136 / 52B | `PILOT_APPROVAL_GATED` | `126-bounded-pilot-scope.template.json` is only a template; an approved one-class pilot, telemetry/cost/security/cleanup/rollback readback, and explicit release/fail decision do not exist. |

## Safety boundary

No assignment replay, Firebase durable mutation, R2 mutation, Listening change,
main-worktree change, broad rollout, or pilot occurred in this reconciliation.
The current Worker candidate remains read-only for the bounded proof scope; its
mutation gates remain denied. Historical evidence is retained rather than
rewritten.

## Independent review disposition

Two independent reviews inspected the fixed-point diff, current unstaged diff,
and current untracked evidence. The Spec review confirms that production
acceptance, production-normal recovery, the native screen-reader gate, the
authorized deployed drill, representative remote measurement, and the pilot
release decision remain open. It also records that the native PDF.js path
refreshes on initial authorization failure but does not yet prove a later
range-request expiry/refresh path.

The Standards review identified the older excerpt-only statement in
`documentation/architecture/book-activity-runtime-and-assembly.md` as
conflicting with the approved PRD0062b full-PDF authority. A current authority
overlay was added to that document. The review's harness dispatcher and cleanup
ownership findings are outside the requested product scope and were not
changed; they do not become product PASS evidence.
