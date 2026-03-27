# Findings For Tasks 0041 PRD Result Visibility Ownership Governance

## 2026-03-27

- The repository did not contain the governance docs named by Task `1.3` through `1.8` under `documentation/architecture` and `documentation/rules`. They were created in this change set so the runtime implementation can anchor on an explicit in-repo contract.
- The current teacher history path still filters locally by raw `result.teacherId`, and the blank-field fallback currently includes rows without proven ownership.
- Session ownership in current writers is still inconsistent with the authoritative session field. The real source record is `game_sessions/{sessionCode}.createdByUserId`; `session.teacherId` is synthetic tracking data.
- The current writing path still indexes teacher-owned rows from weak fallbacks including `session.teacherId`, `session.createdBy`, `testData.createdBy`, `selectedTeacherId`, and `assigningTeacherId`.
- `StudentQuizPageNew.jsx` still does not write canonical result rows, so live quiz remains outside canonical teacher history.
- Additional impacted files discovered beyond the original task-list file inventory:
  - `src/utils/monitor/autoSubmitDisconnected.ts`
  - `src/config/featureRegistry.ts`
  - `documentation/architecture/result-view-map.md`
  - `documentation/rules/result-view-reuse.md`
- During Task `2.x`, `src/types/results.types.ts` was found to already contain a partial PRD-0041 visibility surface with naming and field-shape drift from the locked contract. The implementation pass must normalize this file to the task-list contract instead of layering a second schema on top of it.
- `class-linked course_material` cannot be resolved from course data alone in every case. When a result carries `sessionCode` without `classId`, the resolver must bridge through `game_sessions/{sessionCode}.linkedClassId` before looking up the authoritative class owner.
- The new shared visibility services need dependency-injection seams for tests because the existing repo test style asserts exact RTDB batch-update maps directly against mocked Firebase helpers. Implementing the services without injectable boundaries would force broader module mocking and make the Task `2.10` branch coverage harder to keep precise.
- Partial `resultVisibility*` test files existed on disk with stale API names and contract fields from an interrupted implementation attempt. They had to be replaced to match the locked Task `2.x` service API and the normalized visibility field names before verification could be trusted.

## 2026-03-27 3.x service-layer normalization findings

- 	estResults.service.ts legacy read-time enrichment now performs a persisted 	est_results/{resultId}/visibility update before downstream teacher-facing mutations; tests that assume the first update() call is the business mutation are brittle and must assert on the payload instead.
- esultsService.ts teacher-scoped session aggregation can be neutralized without breaking admin/all-session mode by redirecting the teacher branch to canonical 	estResults.service rows and grouping the already-classified results by sessionCode afterward.
- guestResultsService.ts claim/migration fanout had to become async because authoritative ownership resolution is now required before batched RTDB updates are built; raw guest-row 	eacherId cannot safely precompute 	est_results_by_teacher/* fanout anymore.

## 2026-03-27 3.x service-layer normalization findings (corrective restatement)

- `testResults.service.ts` legacy read-time enrichment now performs a persisted `test_results/{resultId}/visibility` update before downstream teacher-facing mutations; tests that assume the first `update()` call is the business mutation are brittle and must assert on the payload instead.
- `resultsService.ts` teacher-scoped session aggregation can be neutralized without breaking admin/all-session mode by redirecting the teacher branch to canonical `testResults.service` rows and grouping the already-classified results by `sessionCode` afterward.
- `guestResultsService.ts` claim/migration fanout had to become async because authoritative ownership resolution is now required before batched RTDB updates are built; raw guest-row `teacherId` cannot safely precompute `test_results_by_teacher/*` fanout anymore.

## 2026-03-27 3.8 reindex and coverage findings

- The canonical runtime entry point for stale teacher-index cleanup is now `testResults.service.ts::rebuildTeacherResultIndexes()`, not the planner/applier helpers alone. The task list and future migrations should treat the shared reindex service as a pure plan/apply dependency and the canonical result service as the operational orchestration boundary.
- Normalized ownership cleanup had to extend beyond save-time writes. `updateResultScore()` and `deleteTestResult()` also needed to stop keying teacher-owned cleanup off raw `result.teacherId`, otherwise stale teacher-index rows could survive score updates or deletions even after the new reindex routine existed.
- Service-level proof for Task `3.9` is split across canonical and compatibility layers: `testResults.service.test.ts` covers reindex/removal and legacy enrichment ordering, `resultsService.test.ts` covers teacher-assignment filtering without raw owner fallthrough, and `guestResultsService.test.ts` covers guest claim fanout normalization so legacy claim paths cannot reintroduce stale `test_results_by_teacher/*` semantics.

## 2026-03-27 4.x writer normalization findings

- `useTestSubmission.ts` still fetched session metadata for attendance and academic context, but it was also pre-resolving result ownership locally from `session.createdBy` and synthetic `session.teacherId`. The hook now forwards only canonical session identifiers and snapshots while leaving ownership resolution to the canonical service layer.
- `useSoloSubmission.ts` callers often provide sparse practice context, including self-study launches with blank source ids and homework launches where `homeworkId` lived only in hook props instead of resolver-visible result context. The hook now canonicalizes source ids, source names, and homework/course identifiers from `materialId`, `homeworkId`, `courseContext`, and caller snapshots before saving.

- `THCSPracticeView.tsx` and `THCSTestLayout.tsx` were both still using original test authorship (`testData.createdBy`) as the raw `teacherId` save argument, even though the canonical service now owns ownership resolution. Both THCS writers now route through explicit context-normalization helpers so they persist authoritative homework/course/self-study/session identifiers instead.
- THCS writer coverage did not exist in the repo. To keep the migration moving without introducing heavyweight UI harness work mid-slice, the implementation added focused pure-helper tests that lock the writer context contract for practice and live-session THCS flows.

## 2026-03-27 4.5/4.6 writing ownership normalization findings

- `writingSubmissionService.ts` had legacy ownership shortcuts in both persistence and grading sync paths. The implementation now routes writing-result persistence through `resolveResultOwnership(...)`, stores normalized visibility under `result.visibility`, and builds `test_results_by_teacher/*` rows only from `visibility.visibilityOwnerTeacherId` when `ownershipResolved === true`.
- Unresolved writing rows now consistently flow to `/reports/result_visibility/unresolved/{resultId}` through `resultVisibilityReporting.service`, while resolved rows clear any stale unresolved-report entry for the same result.
- `WritingPracticeView.tsx` previously mixed canonical submission creation with direct ad hoc RTDB result writes. The component now preserves Firestore submission writes but delegates result materialization to `materializeSubmissionResult(...)`, removing local ownership/index logic from the UI layer.
- Writing auto-submit now follows the same canonical materialization path and includes an idempotency guard for already-materialized `resultId` rows, reducing duplicate canonical result writes during timer/teacher-end submit races.
- Dedicated coverage was missing for the writing-specific writer migration scope. New focused tests were added in `src/services/writingSubmissionService.test.ts` and `src/components/writing-practice/WritingPracticeView.test.tsx` to lock the canonical delegation and normalized ownership/index behavior.
- A broader unrelated harness gap remains outside Task `4.5/4.6`: `src/pages/StudentTestResultsPage.test.tsx` fails when run in isolation unless its `firebase/database` mock exports `update`.

## 2026-03-27 4.7 quiz canonicalization findings

- `StudentQuizPageNew.jsx` previously persisted only incremental session-player state (`game_sessions/*/players/*`) and had no completion-only canonical write boundary. Terminal session-state transitions could navigate away without creating a canonical `test_results/*` row.
- Canonical quiz persistence now runs only on terminal quiz states and uses `saveTestResult(...)` after recomputing final marking from saved answer maps plus any pending unsent answer. This avoids trusting transient cumulative `player.score` values from incremental updates.
- A write-once guard is now required in this surface to prevent duplicate canonical rows across repeated terminal snapshots. The implementation uses both local in-flight/result guards and cross-record checks (`player.latestResultId` plus existing `test_results_by_student/{studentId}` rows for the same session/test).
- The terminal-status finalization path required an explicit race guard: when status becomes terminal before quiz payload arrives, canonicalization must wait for quiz data (when a quizId exists) instead of marking terminal handling complete too early.
- `StudentQuizPageNew.test.jsx` now includes focused writer-flow coverage for completion-only canonical persistence and duplicate-write prevention when completed snapshots re-emit.

## 2026-03-27 4.8 writer coverage addendum

- Terminal quiz completion handling must treat `waiting` as a completion boundary for canonicalization in this surface, because teacher-end session flow commonly transitions students through `waiting` while still requiring canonical history persistence.
- Writer-flow coverage for quiz now explicitly includes an in-progress guard assertion: no canonical `saveTestResult(...)` call is allowed while the quiz remains `in-progress`, even when session snapshots re-emit.

## 2026-03-27 Phase 4 completion-gate verification finding

- Running the broad `npm test -- --run --reporter=basic` gate in the current workspace fails for unrelated baseline suites (including parser expectations, emulator-dependent security tests without configured host/port, and existing page-level test instability) and eventually hits Node heap OOM. This blocks marking parent Task `4.0` complete under the process-task-list full-suite protocol, even though scoped writer migration checks for `4.1` through `4.8` are passing.

## 2026-03-27 5.x consumer-slice migration findings

- `TeacherStudentHistoryPage.tsx` no longer performs any local raw-owner filtering. It now classifies rows through `classifyTeacherResultVisibility(...)` only, keeps assignment checks as the outer gate, and renders loading/error/success inside the teacher shell (`TeacherHeader` + `AppShell`) instead of a standalone gradient wrapper.
- `ResultFilters.tsx` now derives test-type and skill options from the classified result set supplied by the parent consumer. The static `test`/`quiz` and fixed skill option assumptions are removed from the component.
- `ResultDetailPage.tsx` keeps the student redirect path unchanged while moving teacher/admin detail rendering under the teacher shell surface.
- `LegacyResultDetailView.tsx` now treats shared visibility verdicts as final teacher/admin authority, applies explicit solo-practice view-only presentation, hides unresolved rows from teacher detail, and renders deleted-source metadata with submission snapshot as the primary label plus current-source name as supplemental metadata when present.
- Immediate access-loss behavior is now explicitly enforced in detail view by clearing rendered sensitive result content when teacher detail access is revoked after initial render.
- `AdminReportsPage.tsx` now includes a read-only unresolved diagnostics section backed by `/reports/result_visibility/unresolved/{resultId}` with isolated loading/error handling so feature-health rendering is not blocked by unresolved-diagnostics fetch timing.
- New/updated coverage for this slice is present in `TeacherStudentHistoryPage.test.tsx`, `ResultFilters.test.tsx`, `ResultDetailPage.test.tsx`, `LegacyResultDetailView.test.tsx`, and `AdminReportsPage.test.tsx`; scoped verification passed (`5` files, `31` tests).
- Full-suite completion protocol was executed after `5.x` subtask completion and currently fails in this workspace due unrelated baseline issues plus Node heap OOM in the broad test run. Parent Task `5.0` remains unchecked; `6.x` work can proceed while full-suite stabilization is handled separately.

## 2026-03-27 6.x readiness audit findings

- `6.1` is mostly covered in existing service tests, but there are still explicit scenario gaps: no direct service-layer assertion for the public-library case where the assignment owner differs from content author (Teacher A assigned, Teacher C authored), and no teacher read/history assertions for homework, class-linked course material, and standalone course-material contexts after classification.
- `6.2` is currently blocked by missing direct writer-flow tests for `THCSPracticeView` and `THCSTestLayout`. Existing coverage for these surfaces is helper-level context builders only (`thcsPracticeResultContext.test.ts` and `thcsSessionResultContext.test.ts`), not submit-path persistence assertions.
- `6.3/6.4` now have substantial coverage from the latest migration, but there are remaining assertion gaps: no explicit history-row assertion for solo-practice tagging, no explicit unresolved-row-absence assertion in history tests, and partial-only proof that all teacher-owned actions are absent for solo-practice detail rows.
- `6.5` is not ready: `database.rules.json` still lacks explicit `/reports/result_visibility/unresolved/*` rule coverage and still includes legacy raw-`teacherId` / assignment-only result visibility assumptions; the aligned security test files still encode or summarize those legacy assumptions and do not yet assert super-admin-only unresolved-report access.

## 2026-03-27 6.1 service-layer verification completion findings

- Public-library ownership mismatch coverage (Teacher A assignment owner versus Teacher C content author) is explicitly locked in `src/services/resultVisibility.service.test.ts` by asserting normalized owner authority instead of raw authored fields.
- Service-layer normalization coverage for teacher-owned `class_session`, `homework`, class-linked `course_material`, standalone `course_material`, and student-history retention for unresolved legacy rows is now explicit in `src/services/testResults.service.test.ts` via `getTeacherResults(...)` and `getStudentResults(...)` assertions.
- The `6.1` scoped verification gate passed with `cmd /c npx vitest run src/services/testResults.service.test.ts src/services/resultVisibility.service.test.ts --reporter=basic` (`2` files, `49` tests) plus `npm run check:utf8 -- src/services/testResults.service.test.ts src/services/resultVisibility.service.test.ts`.
- Full-suite execution remains deferred to later subtasks per current execution instruction; only `6.1` was completed in this step.

## 2026-03-27 6.2 writer-flow verification completion findings

- Existing writer-flow coverage already existed for `useTestSubmission`, `useSoloSubmission`, `writingSubmissionService`, `WritingPracticeView`, and `StudentQuizPageNew`; the explicit remaining gaps were direct submit-path coverage for `THCSPracticeView` and `THCSTestLayout`.
- New direct writer-flow tests were added in `src/components/practice/THCSPracticeView.test.tsx` and `src/components/thcs-student/THCSTestLayout.test.tsx`, asserting canonical `saveTestResult(...)` invocation with normalized `resultContext` and no raw teacher-owner shortcut forwarding.
- Scoped `6.2` writer matrix passed with `cmd /c npx vitest run src/hooks/test/useTestSubmission.test.ts src/hooks/solo/useSoloSubmission.test.ts src/components/practice/THCSPracticeView.test.tsx src/components/thcs-student/THCSTestLayout.test.tsx src/services/writingSubmissionService.test.ts src/components/writing-practice/WritingPracticeView.test.tsx src/pages/StudentQuizPageNew.test.jsx --reporter=basic` (`7` files, `19` tests).

## 2026-03-27 6.3 page verification completion findings

- `TeacherStudentHistoryPage.test.tsx` was extended with explicit assertions for inclusion/exclusion behavior, `Solo Practice` list labeling, unresolved-row absence, deleted-source snapshot title rendering, absence of generic `teacher-owned` and `legacy/unverified` badges, and immediate redirect on assignment-access revocation.
- `ResultDetailPage.test.tsx` was extended with an access-loss shell-regression assertion so teacher-shell framing remains intact when detail content transitions into an access-revoked state.
- Scoped page verification passed with `cmd /c npx vitest run src/pages/TeacherStudentHistoryPage.test.tsx src/pages/ResultDetailPage.test.tsx src/components/results/LegacyResultDetailView.test.tsx --reporter=basic` (`3` files, `31` tests).

## 2026-03-27 6.4 result-detail verification completion findings

- `LegacyResultDetailView.tsx` still rendered teacher action buttons for solo-practice rows despite view-only intent; the implementation now gates certificate and print actions behind `shouldAllowTeacherActions` so solo-practice stays strictly view-only.
- `LegacyResultDetailView.test.tsx` now explicitly asserts solo-practice rows hide teacher-owned actions and still render source metadata, including submission snapshot labels for teacher-visible rows.
- `6.4` coverage is included in the same scoped detail/page suite run (`3` files, `31` tests).

## 2026-03-27 6.5 security/rules verification completion findings

- `database.rules.json` removed raw-`teacherId` and blanket teacher-wide result-read assumptions from `test_results` and index paths, and added explicit super-admin-only access to `reports/result_visibility/unresolved/{resultId}`.
- `src/__tests__/security/ownership.test.ts` and `src/__tests__/security/firebaseRules.test.ts` were rewritten to PRD-0041 normalized-visibility contracts (teacher visibility from `result.visibility`, unresolved exclusion, no raw-owner shortcuts, and unresolved-report super-admin lock).
- `src/services/securityMiddleware.test.ts` now includes explicit regressions proving raw-teacher-id fallback is denied and that middleware remains only an outer assignment gate, not final per-result visibility authority.
- Scoped `6.5` security/rules verification passed with `cmd /c npx vitest run src/__tests__/security/ownership.test.ts src/__tests__/security/firebaseRules.test.ts src/hooks/useOwnershipCheck.test.ts src/services/securityMiddleware.test.ts src/components/access/AccessControlWrapper.test.tsx --reporter=basic` (`5` files, `95` tests).

## 2026-03-27 6.6 final gate checklist completion findings

- A dedicated final-gate checklist was added directly under Task `6.6` in `documentation/tasks/tasks-0041-prd-result-visibility-ownership-governance.md`, with explicit check items for resolver authority, reindex handling, unresolved admin diagnostics, live quiz canonical writes, solo-practice indexing boundaries, governance-doc alignment, and scoped test completion.
- The final scoped gate run across all `6.1` through `6.5` verification files passed in one combined execution:
  `cmd /c npx vitest run src/services/testResults.service.test.ts src/services/resultVisibility.service.test.ts src/hooks/test/useTestSubmission.test.ts src/hooks/solo/useSoloSubmission.test.ts src/components/practice/THCSPracticeView.test.tsx src/components/thcs-student/THCSTestLayout.test.tsx src/services/writingSubmissionService.test.ts src/components/writing-practice/WritingPracticeView.test.tsx src/pages/StudentQuizPageNew.test.jsx src/pages/TeacherStudentHistoryPage.test.tsx src/pages/ResultDetailPage.test.tsx src/components/results/LegacyResultDetailView.test.tsx src/__tests__/security/ownership.test.ts src/__tests__/security/firebaseRules.test.ts src/hooks/useOwnershipCheck.test.ts src/services/securityMiddleware.test.ts src/components/access/AccessControlWrapper.test.tsx --reporter=basic`
  with `17` files and `194` tests passing.
- Parent Task `6.0` remains intentionally unchecked at this point because the process-task-list parent-completion protocol also requires staging/commit sequencing once all subtasks are complete.

## 2026-03-27 6.x completion corrective restatement (finalized)

- Corrective note: the earlier readiness-audit entry that described `6.3`/`6.4` assertion gaps is now superseded by passing scoped verification; required page/detail assertions are present and passing in the current test suites.
- `6.2` final writer-flow coverage now includes explicit tests for class/assignment context linkage (`useTestSubmission`), source fallback semantics (`useSoloSubmission`), canonical THCS homework/course/class-session contexts, anti-`testData.createdBy` regressions, unresolved writing fanout guardrails, homework-mode writing delegation, and quiz `waiting`-terminal canonicalization.
- `6.5` final security/rules updates now lock `/test_results_by_session/*` against blanket authenticated reads and keep `/reports/result_visibility/unresolved/*` super-admin-only, with aligned security test rewrites for normalized visibility rules.
- Consolidated scoped verification for `6.2` through `6.5` passed with `cmd /c npx vitest run ... --reporter=basic` across `15` files and `159` tests, and UTF-8 validation passed for all touched text files.
- Corrective governance note: during merge, Task `7.1` through `7.5` were accidentally marked complete by delegated edits and were immediately reverted to unchecked to preserve the later-phase execution boundary.
- Parent Task `6.0` is now checked complete in the task list after `6.1` through `6.6` passed with the final checklist explicitly recorded under `6.6`.

## 2026-03-27 6.6 post-merge verification update

- Final combined verification was re-run after merge corrections across all `6.1` through `6.5` scoped files and passed with `17` files and `208` tests:
  `cmd /c npx vitest run src/services/testResults.service.test.ts src/services/resultVisibility.service.test.ts src/hooks/test/useTestSubmission.test.ts src/hooks/solo/useSoloSubmission.test.ts src/components/practice/THCSPracticeView.test.tsx src/components/thcs-student/THCSTestLayout.test.tsx src/services/writingSubmissionService.test.ts src/components/writing-practice/WritingPracticeView.test.tsx src/pages/StudentQuizPageNew.test.jsx src/pages/TeacherStudentHistoryPage.test.tsx src/pages/ResultDetailPage.test.tsx src/components/results/LegacyResultDetailView.test.tsx src/__tests__/security/firebaseRules.test.ts src/__tests__/security/ownership.test.ts src/hooks/useOwnershipCheck.test.ts src/services/securityMiddleware.test.ts src/components/access/AccessControlWrapper.test.tsx --reporter=basic`.
- This post-merge run supersedes earlier interim `6.6` count notes recorded before all writer/security merges settled.

## 2026-03-27 7.x / 8.1 / 8.2 later-phase dashboard slice findings

- Later-phase PRD-0041 execution was explicitly reopened by the user after the verified `6.6` gate. The task list still needs the `7.x` guardrails to remain visible and checked before broader consumer rollout continues.
- Runtime consumer inventory needed one explicit boundary note: legacy quiz leaderboard route `/teacher-results/:gameSessionId` is not part of the PRD-0041 teacher-owned history/detail/dashboard inventory and remains outside this migration unless a later subtask pulls it in deliberately.
- `TeacherResultsDashboard.jsx` was already reading canonical teacher results, but it still used a Mantine shell, direct router navigation, and no analytics-exclusion pass. The later-phase dashboard slice now routes through the native teacher shell, uses navigation abstraction for canonical result detail and student history entry points, and excludes rows whose shared visibility verdict sets `excludeFromAnalytics === true`.
- The results feature registry required new action coverage for the migrated dashboard interactions: session expansion, CSV export, and student-history navigation.
- `App.jsx` route permissions for `/teacher/results` were narrower than `routeSecurity.ts` and blocked the later-phase super-admin parity already recorded in the security config. The route now matches the existing teacher-or-super-admin registration.
- Scoped later-phase verification passed with `cmd /c npx vitest run src/pages/TeacherResultsDashboard.test.jsx src/config/featureRegistry.test.ts --reporter=basic` (`2` files, `12` tests).

## 2026-03-27 8.3 / 8.6 / 8.7 teacher test results slice findings

- `TeacherTestResultsPage.tsx` still had two direct PRD-0041 bypasses: a local session-owner deny path (`session.teacherId` / `createdBy`) and a raw-answer fallback that rebuilt teacher analytics from `session.players`. The page now loads canonical `getSessionResults(sessionCode)` rows only, classifies them through `classifyTeacherResultVisibility(...)`, keeps the table on teacher-visible rows, and limits summary cards, exports, and question analytics to rows where `excludeFromAnalytics === false`.
- The page also had direct route coupling (`/sessions`, `/teacher/student/:studentId/history`) and no shared action tracking for exports/history. It now uses `useNavigation(...)` plus `useFeatureTracking('results')`, while integrity-detail tracking remains on the existing reporting service path.
- The writing-session branch on the same route was still bypassing the canonical visibility contract by querying `getSubmissionsBySession(sessionCode)` directly. `WritingTestResultsSection.tsx` now filters canonical session results first, then fetches submission detail only for teacher-visible rows, computes writing stats from analytics-eligible rows only, and routes grading/back actions through the shared navigation abstraction.
- `WritingResultDetailModal.tsx` no longer owns hardcoded grading navigation. Grade navigation is now supplied from the parent writing surface so the route abstraction and tracking stay centralized.
- `/teacher-test-results/:sessionCode` in `App.jsx` was narrower than `routeSecurity.ts`; it allowed only `teacher` even though the security config already allowed `teacher` and `super_admin`. The route guard now matches the existing security registration.
- Dedicated regression coverage now exists for both migrated surfaces: `TeacherTestResultsPage.test.tsx` covers visible-vs-analytics-eligible behavior, export filtering, history navigation, integrity tracking, and writing-route handoff; `WritingTestResultsSection.test.tsx` covers canonical row filtering, visible-row-only submission loading, detail tracking, and grading navigation.
- Scoped verification passed with `cmd /c npx vitest run src/pages/TeacherTestResultsPage.test.tsx src/components/writing-results/WritingTestResultsSection.test.tsx src/config/featureRegistry.test.ts --reporter=basic` (`3` files, `15` tests), and `npm run check:utf8 -- src/pages/TeacherTestResultsPage.tsx src/pages/TeacherTestResultsPage.test.tsx src/components/writing-results/WritingTestResultsSection.tsx src/components/writing-results/WritingResultDetailModal.tsx src/components/writing-results/WritingTestResultsSection.test.tsx src/config/featureRegistry.ts src/App.jsx` passed.

## 2026-03-27 8.4 result detail metadata completion findings

- `LegacyResultDetailView.tsx` was already using `classifyTeacherResultVisibility(...)` as the final teacher/admin authority, with `useResultOwnershipCheck(...)` kept as the outer assignment gate only. The remaining PRD-0041 gap was detail-metadata completeness, not a second local ownership path.
- The source metadata panel previously disappeared whenever a teacher-visible row had normalized `result.visibility` fields but no snapshot/current source names. This left teacher detail without the full shared visibility contract even after access was correctly classified.
- The detail view now keeps source metadata visible whenever a normalized visibility snapshot exists and renders fallback metadata from that contract: submission snapshot fallback text, visibility context, source id, and ownership-resolution source. Deleted/archived-source badges and current-source naming still layer on top of the same panel.
- Regression coverage in `src/components/results/LegacyResultDetailView.test.tsx` now proves both named-source rows and sparse normalized-visibility rows render the metadata contract consistently.
- Scoped verification passed with `cmd /c npx vitest run src/pages/ResultDetailPage.test.tsx src/components/results/LegacyResultDetailView.test.tsx --reporter=basic` (`2` files, `24` tests) and `npm run check:utf8 -- src/components/results/LegacyResultDetailView.tsx src/components/results/LegacyResultDetailView.test.tsx`.

## 2026-03-27 8.4 result detail metadata corrective addendum

- A remaining contract leak still existed after the first 8.4 pass: `LegacyResultDetailView.tsx` could promote `className`, `courseName`, or `moduleName` into the primary source snapshot label when `result.visibility.sourceNameSnapshot` was absent. That mixed academic-context chips with canonical source metadata and could mislabel session-owned rows.
- The final 8.4 patch removed that legacy fallback and added an explicit visibility-classification row to the source metadata panel so the primary label stays tied to the shared `result.visibility` contract only.
- A new regression test now proves sparse rows with course/class/module context do **not** surface those values as the source snapshot label, while the scoped suite still passes with `25` tests across `ResultDetailPage.test.tsx` and `LegacyResultDetailView.test.tsx`.

## 2026-03-27 8.5 filter inventory completion findings

- Runtime inventory confirmed that `src/components/results/ResultFilters.tsx` has one migrated teacher-facing consumer only: `src/pages/TeacherStudentHistoryPage.tsx`. No other later-phase PRD-0041 consumer currently mounts this component.
- The existing page regression already locks the contract boundary: `TeacherStudentHistoryPage.test.tsx` asserts that `ResultFilters` receives only the classified teacher-visible result set after `classifyTeacherResultVisibility(...)` filtering, not the raw student-complete result list.
- `ResultFilters.test.tsx` continues to prove the component derives test-type and skill options directly from the supplied result set, so no additional runtime patch was required for `8.5`.
- Scoped verification passed with `cmd /c npx vitest run src/components/results/ResultFilters.test.tsx src/pages/TeacherStudentHistoryPage.test.tsx --reporter=basic` (`2` files, `10` tests) and `npm run check:utf8 -- src/components/results/ResultFilters.tsx src/components/results/ResultFilters.test.tsx src/pages/TeacherStudentHistoryPage.tsx src/pages/TeacherStudentHistoryPage.test.tsx`.

## 2026-03-27 8.8 later consumer rollout closure finding

- The inventoried later-phase teacher-facing surfaces from `8.1` are now all migrated in writing: `TeacherResultsDashboard.jsx`, `TeacherTestResultsPage.tsx`, `TeacherStudentHistoryPage.tsx`, `ResultDetailPage.tsx`, `LegacyResultDetailView.tsx`, `ResultFilters.tsx`, `resultsService.ts`, and the `App.jsx` route entry points. The only explicitly out-of-scope surface remains the legacy quiz leaderboard route `/teacher-results/:gameSessionId`, which was already deferred in the inventory itself.

## 2026-03-27 9.1 analytics inventory completion findings

- The explicit teacher-facing analytics inventory is now recorded in implementation findings: `TeacherResultsDashboard.jsx` summary cards, per-session stats, and CSV export; `TeacherTestResultsPage.tsx` stat cards, question analytics, CSV export, and PDF export; `WritingTestResultsSection.tsx` summary cards; and `TeacherStudentHistoryPage.tsx` stat cards plus chart widgets. No in-scope ranking widget is currently wired.
- The legacy leaderboard route `/teacher-results/:gameSessionId` remains explicitly outside the PRD-0041 analytics inventory and is deferred in writing unless a later task pulls it back into scope.
- Inventory audit also confirmed one latent non-surface risk for later work: `testResults.service.getSessionStatistics(...)` still computes raw session stats and would need the same analytics exclusion rules before any future teacher-facing adoption.

## 2026-03-27 9.2 analytics exclusion completion findings

- `TeacherStudentHistoryPage.tsx` now keeps solo-practice rows in the visible history list while excluding them from analytics cards and chart widgets through a separate `analyticsResults` pass; the render helper now receives the analytics count explicitly instead of closing over an out-of-scope variable.
- `TeacherResultsDashboard.jsx` analytics filtering now requires both `shouldDisplayInTeacherHistory === true` and `excludeFromAnalytics === false`, preventing hidden unresolved rows from leaking into summary cards or CSV export when the super-admin path loads broad session data.
- `TeacherTestResultsPage.tsx` and `WritingTestResultsSection.tsx` continue to keep visible teacher rows separate from analytics-eligible rows, and their updated regressions now use explicit `solo_practice` and unresolved fixtures instead of generic analytics-excluded placeholders.

## 2026-03-27 9.3 analytics fallback verification findings

- Super-admin analytics classification no longer falls back to raw `result.teacherId` in `TeacherResultsDashboard.jsx`, `TeacherTestResultsPage.tsx`, or `WritingTestResultsSection.tsx`; those surfaces now resolve the viewer teacher id from normalized `result.visibility.visibilityOwnerTeacherId` only, or the current viewer as the final fallback.
- Export-facing mapping in `src/services/resultsService.ts` no longer copies raw `result.teacherId` into teacher-facing `StudentResult.teacherId`. Both `toStudentResult(...)` and legacy `getSessionResults(...)` now expose only normalized `visibility.visibilityOwnerTeacherId`, leaving the field empty when ownership is unresolved or solo-practice.
- Focused regressions now prove that super-admin analytics classification uses normalized ownership inputs only and that mapped session/export payloads no longer leak raw teacher-owner fallbacks.

## 2026-03-27 9.4 analytics regression completion findings

- `TeacherStudentHistoryPage.test.tsx` now proves solo-practice rows stay visible in the history list while analytics cards ignore them.
- `TeacherResultsDashboard.test.jsx`, `TeacherTestResultsPage.test.tsx`, and `WritingTestResultsSection.test.tsx` now use explicit `solo_practice` and unresolved fixtures, proving visible-vs-analytics separation at the dashboard and session analytics layers.
- `resultsService.test.ts` now includes export and mapped-session regressions proving normalized teacher ownership is the only teacher identifier that reaches analytics/export-facing payloads.
- Scoped verification passed with `cmd /c npx vitest run src/pages/TeacherStudentHistoryPage.test.tsx src/pages/TeacherResultsDashboard.test.jsx src/pages/TeacherTestResultsPage.test.tsx src/components/writing-results/WritingTestResultsSection.test.tsx src/services/resultsService.test.ts --reporter=basic` (`5` files, `33` tests) plus `npm run check:utf8 -- ...` across the touched 9.x files.

## 2026-03-27 9.5 analytics migration closure findings

- Every inventoried PRD-0041 analytics surface is now migrated or explicitly deferred in writing: dashboard summary/export, teacher test results summary/question analytics/export, writing summary cards, and teacher-student history cards/charts are all covered; the only deferred route remains the already out-of-scope legacy leaderboard `/teacher-results/:gameSessionId`.
- Parent Task `9.0` remains intentionally unchecked even though `9.1` through `9.5` are complete, because the process-task-list parent completion protocol still requires the later commit step before the parent task can be marked complete.

## 2026-03-27 10.1a monitor auto-submit canonicalization findings

- Rechecked `documentation/tasks/process-task-list.md` before this slice and recorded the newly discovered monitor writer gap instead of leaving it undocumented.
- `src/hooks/monitor/useMonitorControls.ts` no longer depends on preloaded `fullTestData` for the live monitor auto-submit branches. When `completeBaseTest()` or `endFullSession()` needs canonical marking and the hook was not given question payloads up front, it now fetches `tests/{testId}` on demand, extracts root-question or section-question arrays, and prefers `autoSubmitAllUnsubmittedStudents(...)` so the canonical `saveTestResult(...)` path still runs.
- Canonical teacher ownership inputs in the same hook now prefer `createdByUserId`, then `createdBy`, and stop treating synthetic `session.teacherId` as the first owner source for these auto-submit branches.
- `src/hooks/monitor/useMonitorControls.test.ts` now proves both live branches: base-time disconnected auto-submit fetches the test payload and stays on the canonical writer, and teacher-end auto-submit does the same when the hook starts without `fullTestData`.
- The legacy raw-answer utility in `src/utils/monitor/autoSubmitDisconnected.ts` still exists as an emergency preservation fallback if no markable test payload can be resolved at runtime. That residual path is now explicit in the task list instead of remaining an invisible governance hole.
- Scoped verification passed with `cmd /c npx vitest run src/hooks/monitor/useMonitorControls.test.ts --reporter=basic` and `cmd /c npm run check:utf8 -- src/hooks/monitor/useMonitorControls.ts src/hooks/monitor/useMonitorControls.test.ts`.

## 2026-03-27 10.2 unresolved report versioning findings

- Rechecked `documentation/tasks/process-task-list.md` before advancing the checklist and verified the unresolved-report contract directly from code plus focused tests.
- `src/types/results.types.ts` now requires `reportVersion` on unresolved result diagnostics, and `src/services/resultVisibilityReporting.service.ts` writes the canonical schema version on every upsert while preserving the rest of the normalized unresolved payload.
- `src/pages/AdminReportsPage.tsx` renders the schema version read-only as `v1` for normalized reports and `legacy` for older rows that predate versioning, preserving the single admin diagnostic destination rather than forking the reporting surface.
- Scoped verification passed with `cmd /c npx vitest run src/services/resultVisibilityReporting.service.test.ts src/pages/AdminReportsPage.test.tsx src/services/resultVisibility.service.test.ts --reporter=basic` and `cmd /c npm run check:utf8 -- src/types/results.types.ts src/services/resultVisibilityReporting.service.ts src/services/resultVisibilityReporting.service.test.ts src/services/resultVisibility.service.test.ts src/pages/AdminReportsPage.tsx src/pages/AdminReportsPage.test.tsx`.

## 2026-03-27 10.6 deleted-source verification findings

- `src/services/resultVisibility.service.test.ts` now explicitly covers the later-phase deleted-source rule: teacher-visible rows keep deleted-source snapshot metadata when ownership was proven, and teacher surfaces stay denied when the row is both deleted-source and unresolved.
- This verification reuses the same focused 10.2 command set because the deleted-source assertions live in the shared visibility service suite and the admin diagnostics suite ensures the unresolved branch still lands in the same reporting workspace.

## 2026-03-27 10.3 single admin-destination verification finding

- Grep audit across `src/` and `documentation/` shows unresolved result diagnostics still have exactly one admin-facing destination: `src/pages/AdminReportsPage.tsx` listening to `/reports/result_visibility/unresolved`. All other matches are service writes, tests, or governance docs; no second admin UI or alternate reporting workspace was introduced.

## 2026-03-27 10.1 remaining legacy service enrichment findings

- Rechecked `documentation/tasks/process-task-list.md` before closing the next ordered subtask and audited the remaining service-layer readers of student result history. The active legacy readers were `academicRecordService.ts`, `materialDiscoveryService.ts`, and `badgeService.ts`; `accountDeletionService.ts` still touches `test_results_by_student/*`, but only for deletion cleanup rather than read-time enrichment or visibility decisions.
- `src/services/academicRecordService.ts` now delegates `getResultsByStudent(...)` directly to canonical `getStudentResults(...)`, so downstream academic filters, summaries, and previews consume the same normalized `result.visibility` and deleted-source enrichment used elsewhere instead of hand-loading `test_results_by_student/*` plus `test_results/{resultId}`.
- `src/services/materialDiscoveryService.ts` now derives self-study material history from canonical student results only, keeping the service-layer-only enrichment boundary intact while still filtering to `context.type === 'self_study'`.
- `src/services/badgeService.ts` was an additional active gap discovered during the grep audit. Badge checks for first-test, streak, module completion, course completion, and improvement now all read canonical student results instead of raw student index snapshots, with improvement comparisons preferring normalized percentage values while retaining legacy score fallback compatibility.
- Focused regressions now lock the migration in `src/services/academicRecordService.test.ts`, `src/services/materialDiscoveryService.test.ts`, and `src/services/badgeService.test.ts`. Scoped verification passed with `cmd /c npx vitest run src/services/academicRecordService.test.ts src/services/materialDiscoveryService.test.ts src/services/badgeService.test.ts --reporter=basic` (`3` files, `62` tests) plus `cmd /c npm run check:utf8 -- src/services/academicRecordService.ts src/services/academicRecordService.test.ts src/services/materialDiscoveryService.ts src/services/materialDiscoveryService.test.ts src/services/badgeService.ts src/services/badgeService.test.ts`.

## 2026-03-27 10.4 / 10.5 class-course reindex findings

- Rechecked `documentation/tasks/process-task-list.md` before advancing the next ordered legacy-handling slice. The stale-index audit confirmed that `test_results_by_class/*` and `test_results_by_course/*` were the active non-teacher indexes still capable of drifting away from normalized visibility, with `test_results_by_class/*` remaining a live reader dependency through `getClassTestScores(...)`.
- `src/services/resultVisibilityReindex.service.ts` now deletes stale nested class/course index locations and rebuilds only canonical locations derived from normalized visibility (`visibility.classId` / `visibility.courseId`) with safe root-field fallback (`result.classId` / `result.courseId`) for already ownership-proven rows. Solo-practice and unresolved rows never backfill these indexes, but any stale nested rows they already had are removed in the same pass.
- `src/services/testResults.service.ts::rebuildTeacherResultIndexes()` keeps its historical entry point name but now orchestrates teacher, course, and class repair together by reading the existing `test_results_by_teacher/*`, `test_results_by_course/*`, and `test_results_by_class/*` trees and feeding all of them into the shared reindex planner. Runtime logging now includes class/course rebuild and deletion counts alongside the existing aggregate counters.
- New regression coverage in `src/services/resultVisibilityReindex.service.test.ts` proves canonical class/course rebuild plus unresolved-row exclusion, and `src/services/testResults.service.test.ts` proves the live reindex orchestration removes stale nested rows and backfills only ownership-proven canonical targets. Scoped verification passed with `cmd /c npx vitest run src/services/resultVisibilityReindex.service.test.ts src/services/testResults.service.test.ts --reporter=basic` (`2` files, `51` tests) plus `cmd /c npm run check:utf8 -- src/services/resultVisibilityReindex.service.ts src/services/resultVisibilityReindex.service.test.ts src/services/testResults.service.ts src/services/testResults.service.test.ts`.

## 2026-03-27 10.7 legacy handling completion finding

- With `10.1` through `10.6` now verified in sequence, the later-phase legacy handling gate is satisfied in the current tree: remaining service-layer readers use canonical enrichment, unresolved reporting stays explicit and single-destination, deleted-source visibility stays bounded by proven ownership, and the shared reindex path now repairs teacher/class/course indexes while excluding unresolved or solo-practice backfill. Parent Task `10.0` remains intentionally unchecked until the commit protocol in `documentation/tasks/process-task-list.md` is satisfied.

## 2026-03-27 11.x governance hardening findings

- Rechecked `documentation/tasks/process-task-list.md` before closing the final later-phase subtasks. The subagent audit was correct that `11.x` was mainly a documentation drift issue, not a fresh runtime defect.
- `documentation/architecture/result-visibility-ownership-governance.md` and `documentation/result-visibility-producer-consumer-contract.md` now include `reportVersion` in the unresolved-report schema so the governance layer matches the already-verified runtime/test contract.
- `documentation/rules/result-visibility-review-checklist.md` now explicitly rejects missing reconciliation coverage, not just missing stale-index cleanup, and it now states the exact later-phase rule that the governance doc, permission matrix, producer-consumer contract, and reviewer checklist must move together in any policy-surface change set.
- `documentation/architecture/result-view-permission-matrix.md` was audited as already structurally complete for `11.2`; this slice adds the explicit same-change-set rule there so the governance bundle enforces itself.
- `documentation/architecture/result-view-fr-closure-matrix.md` was upgraded from a coarse FR summary into a locked by-layer PRD scenario matrix. Each later-phase scenario now points to concrete service, writer-flow, page/component, security/rules, analytics, and route-entry/navigation anchors, and the matrix records the current state as `passing` based on the previously completed scoped verification runs.
- With those docs updated together and UTF-8-verified, `11.1` through `11.7` are satisfied in the current tree. Parent Task `11.0` remains intentionally unchecked pending the commit/stage protocol from `documentation/tasks/process-task-list.md`.

## 2026-03-27 independent assessment amendments

- Cross-checked the current tree against the original PRD, the task checklist, and a focused verification pack: `cmd /c npx vitest run src/services/resultOwnershipResolver.test.ts src/services/resultVisibility.service.test.ts src/services/testResults.service.test.ts src/services/resultsService.test.ts src/services/guestResultsService.test.ts src/pages/TeacherStudentHistoryPage.test.tsx src/pages/ResultDetailPage.test.tsx src/components/results/LegacyResultDetailView.test.tsx src/pages/TeacherResultsDashboard.test.jsx src/pages/TeacherTestResultsPage.test.tsx src/components/writing-results/WritingTestResultsSection.test.tsx src/pages/AdminReportsPage.test.tsx src/__tests__/security/ownership.test.ts src/__tests__/security/firebaseRules.test.ts src/components/results/ResultSlidePanel.test.tsx src/components/results/ResultDetailModal.test.tsx --reporter=basic` passed (`16` files, `213` tests).
- The focused pack does **not** invalidate one live runtime mismatch: unresolved-result reporting is still written from client-side result flows (`src/services/testResults.service.ts`, `src/services/writingSubmissionService.ts`, `src/services/guestResultsService.ts`) while `database.rules.json` only allows `super_admin` writes to `/reports/result_visibility/unresolved/{resultId}`. Unresolved saves can therefore hit partial-write failure after the canonical result row is already persisted.
- `TeacherStudentHistoryPage.tsx` still does not enforce true immediate access-loss behavior in the live page session. It performs a one-time `useStudentDataAccessCheck(studentId)` gate plus one async `getStudentResults(...)` load, but there is no live assignment subscription or periodic revalidation after the first render. `useOwnershipCheck.ts` only reruns when dependencies change or `recheck()` is called manually.
- The current implementation materially narrows PRD-0040 governance artifacts: `documentation/architecture/result-view-permission-matrix.md` and `documentation/architecture/result-view-fr-closure-matrix.md` now read as PRD-0041 Phase 1 teacher-visibility docs rather than the broader all-surface result-view verification pack PRD-0040 originally defined. Runtime shell separation is mostly preserved, but the living-doc governance layer has drifted.
- Course/class scoped indexes are still written unconditionally in `src/services/testResults.service.ts`, `src/services/writingSubmissionService.ts`, and `src/services/guestResultsService.ts` whenever `courseId` / `classId` exists, even though `src/services/resultVisibilityReindex.service.ts` only treats ownership-resolved, non-solo rows as eligible canonical targets. This leaves write-time drift that later reindex cleanup has to undo.
- `src/services/testResults.service.ts::getTeacherResults(...)` still reads only `test_results_by_teacher/{teacherId}` and hardcodes `hasAssignmentAccess: true` during classification. That means it does not implement the task-list claim that teacher-scoped reads resolve solo-practice visibility separately after the outer access gate.
- `src/services/securityMiddleware.ts::validateResultOwnership(...)` still encodes assignment-only result access semantics. Current teacher-facing consumers compensate by running the shared visibility classifier afterward, but the middleware contract itself has not been fully demoted to outer-gate-only semantics.
- `src/__tests__/security/firebaseRules.test.ts` remains a contract/mock suite and explicitly states that it does not run the emulator. The new normalized write paths and rules are therefore only partially verified at the security layer.
- No major runtime regression was found against PRD-0040's core shell model: `SharedSavedResultCore` remains presentation-only, `ResultSlidePanel` / `ResultDetailModal` / `LegacyResultDetailView` still delegate to that shared body, `/result/:resultId` still behaves as the saved-result wrapper route, and the writing/session domains were not flattened into the shared saved-result loader. The main PRD-0040 risk discovered in this assessment is governance drift plus the history-page access-loss gap, not shell collapse.
## 2026-03-27 implementation-fix amendments

- Rechecked the unresolved-report path against the live code and applied the runtime fix: `database.rules.json` now keeps `/reports/result_visibility/unresolved/{resultId}` read access super-admin-only but allows authenticated non-guest producer writes with schema validation tied to the canonical `test_results/{resultId}` row. `src/__tests__/security/firebaseRules.test.ts` was updated to the same producer-write / admin-read contract.
- Rechecked the immediate access-loss gap and applied the consumer-side fix: `src/hooks/useOwnershipCheck.ts` now subscribes to teacher assignment changes through `src/services/assignmentManager.ts` for `student_data` and teacher result gates, and `src/pages/TeacherStudentHistoryPage.tsx` now clears sensitive content into an in-shell `Access denied` / `Access revoked` state instead of redirecting to a detached route. Focused regressions were added in `src/hooks/useOwnershipCheck.test.ts` and `src/pages/TeacherStudentHistoryPage.test.tsx`.
- Re-ran the scoped course/class index finding against the current tree and the earlier report turned out to be stale. `src/services/testResults.service.ts`, `src/services/writingSubmissionService.ts`, and `src/services/guestResultsService.ts` already gate `test_results_by_course/*` and `test_results_by_class/*` writes through `isScopedIndexBackfillEligible(...)`, and the existing focused service suites confirm unresolved or solo-practice rows are excluded from those indexes.
- Reduced the PRD-0040 governance drift in the living docs by rewriting the lead scope statements in `documentation/architecture/result-view-permission-matrix.md` and `documentation/architecture/result-view-fr-closure-matrix.md` so they explicitly remain unified PRD-0040 + PRD-0041 governance artifacts rather than 0041-only replacements.
- Focused verification after the fixes passed:
  - `cmd /c npx vitest run src/__tests__/security/firebaseRules.test.ts src/hooks/useOwnershipCheck.test.ts src/pages/TeacherStudentHistoryPage.test.tsx --reporter=basic` (`3` files, `44` tests)
  - `cmd /c npx vitest run src/pages/ResultDetailPage.test.tsx src/components/results/LegacyResultDetailView.test.tsx --reporter=basic` (`2` files, `25` tests)
  - `cmd /c npx vitest run src/services/testResults.service.test.ts src/services/writingSubmissionService.test.ts src/services/guestResultsService.test.ts src/services/resultVisibilityReporting.service.test.ts --reporter=basic` (`4` files, `85` tests)
## 2026-03-27 remaining contract-fix amendments

- Completed the canonical teacher-read contract fix in `src/services/testResults.service.ts::getTeacherResults(...)`. The service no longer passes a fake `hasAssignmentAccess: true` classifier input. It now filters the teacher-owned index by canonical visibility only: `ownershipResolved === true`, `visibility.visibilityOwnerTeacherId === teacherId`, and `contextType !== 'solo_practice'`. Focused regressions were added in `src/services/testResults.service.test.ts` for unresolved and solo-practice rows appearing in the mocked teacher index.
- Completed the middleware contract fix in `src/services/securityMiddleware.ts`. `result`, `test_result`, and `student_data` now all share the same student-assignment outer-gate helper instead of keeping a separate result-specific ownership branch. The middleware still does not inspect `visibilityOwnerTeacherId`, unresolved flags, or any other per-result metadata. `src/services/securityMiddleware.test.ts` now includes an explicit parity assertion proving `result` and `student_data` resolve identically for the same teacher/student assignment state.
- Focused verification after these final contract fixes passed: `cmd /c npx vitest run src/services/testResults.service.test.ts src/services/securityMiddleware.test.ts src/services/resultsService.test.ts src/hooks/useOwnershipCheck.test.ts --reporter=basic` (`4` files, `121` tests).
