# Tasks: PRD-0036 - Anti-Cheating System Production Reset

> Generated from [0036-prd-anti-cheating-system.md](./0036-prd-anti-cheating-system.md)
> This file replaces the stale junior checklist as the production readiness tracker.

## Relevant Files

- `documentation/tasks/tasks-0036-prd-anti-cheating-system-production-reset.md` - Production-reset implementation checklist and progress tracker.
- `documentation/tasks/0036-anti-cheat-production-closeout.md` - Baseline contract-gap record, local QA matrix, stale-checklist reconciliation, and rollout/rollback notes.
- `documentation/tasks/0036-anti-cheat-runtime-contracts.md` - Runtime data-node and teacher/student coordination-field reference added after the production reset.
- `documentation/tasks/0036-anti-cheat-observability-contract.md` - Reporting-pipeline contract for anti-cheat telemetry, including feature actions, metadata envelopes, and AI-diagnostic usage boundaries.
- `src/types/integrity.types.ts` - Canonical integrity contracts for session reports and homework summaries.
- `src/utils/antiCheatPresets.ts` - Preset defaults, context overrides, and risk-level computation.
- `src/utils/antiCheatPresets.test.ts` - Preset and context-default regression coverage.
- `src/utils/integrityUtils.ts` - Shared helpers for session/homework integrity normalization, legacy payload coercion, and detail summaries.
- `src/hooks/test/useTestIntegrity.ts` - Core anti-cheat event engine and report builder.
- `src/hooks/test/useTestIntegrity.test.ts` - Regression coverage for visibility and blur/focus event flows.
- `src/hooks/test/useTestCompletionCheck.ts` - Re-entry / teacher force-submit detection entry point.
- `src/hooks/test/useTestCompletionCheck.test.ts` - Homework re-entry regression coverage for exhausted, nullified, missing, and in-progress submission states.
- `src/hooks/test/useTestSubmission.ts` - Live-session submission path, integrity persistence, and shuffle-aware lazy grading-only question loading.
- `src/hooks/test/useIntegrityRefreshRequest.ts` - Shared student-side hook that reacts to teacher refresh requests by flushing buffered integrity logs.
- `src/hooks/test/useIntegrityRefreshRequest.test.ts` - Regression coverage for the teacher-triggered integrity refresh listener.
- `src/hooks/monitor/useMonitorControls.ts` - Session start/reset flow, including student-safe session payload priming and cleanup.
- `src/hooks/test/useTestData.ts` - Session-mode test loader that consumes the pre-sanitized live-session payload.
- `src/hooks/test/useTestData.test.ts` - Regression coverage for session-mode student-safe payload loading without eager grading hydration.
- `src/hooks/test/useTestSubmission.test.ts` - Regression coverage for lazy grading-question fetch during live-session submission.
- `src/services/antiCheatReporting.ts` - Shared adapter that summarizes anti-cheat runtime events and emits them into the reporting pipeline under the dedicated anti-cheat feature.
- `src/services/testStorage.ts` - Test fetch/storage layer, student-safe payload caching for session and solo delivery, and grading-only question reads.
- `src/services/testResults.service.ts` - Permanent session-result storage and reset cleanup helpers for teacher re-open flows.
- `src/services/sessionStudentControlService.ts` - Teacher-side live force-submit/reset protocol plus session-wide integrity refresh requests.
- `src/services/sessionStudentControlService.test.ts` - Focused regression coverage for teacher live control writes, refresh requests, and result cleanup fallback.
- `database.rules.json` - RTDB rules for the dedicated student-safe session and solo/homework payload nodes.
- `src/utils/thcsShuffle.ts` - Deterministic IELTS/THCS shuffle helpers, including the shared student-facing vs grading replay transform for IELTS.
- `src/utils/thcsShuffle.test.ts` - Regression coverage for deterministic IELTS task-block and option shuffling.
- `src/hooks/solo/useSoloTestData.ts` - Solo/homework IELTS loader and grading-side question ref.
- `src/hooks/solo/useSoloSubmission.ts` - IELTS homework submission path, homework integrity persistence, and shuffle-aware lazy grading.
- `src/hooks/solo/useSoloTestData.test.ts` - Regression coverage for solo/homework student-safe payload loading without eager grading hydration.
- `src/hooks/solo/useSoloSubmission.test.ts` - Regression coverage for lazy grading-question fetch during solo/homework submission.
- `src/hooks/useHomeworkSubmission.ts` - Student homework entry-state hook that now respects nullified attempts when enabling new starts.
- `src/components/homework/HomeworkCreateModal.tsx` - Canonical teacher homework assignment modal and anti-cheat default/reset path.
- `src/services/homeworkManager.ts` - Homework creation and duplication persistence, including anti-cheat config carry-forward.
- `src/services/homeworkManager.test.ts` - Homework persistence regression coverage for anti-cheat config creation and duplication.
- `src/services/homeworkSubmissionService.ts` - Firestore homework submission persistence.
- `src/services/homeworkSubmissionService.test.ts` - Homework anti-cheat regression coverage for nullified attempts, auto-submit persistence, and teacher reset cleanup.
- `src/components/practice/IELTSPracticeView.tsx` - IELTS homework/practice surface with anti-cheat parity and homework shuffle display alignment.
- `src/components/practice/THCSPracticeView.tsx` - THCS homework integrity summary writer and reference flow.
- `src/components/thcs-editor/THCSHomeworkAssignDialog.tsx` - THCS assignment flow that must stop bypassing anti-cheat config.
- `src/types/homework.types.ts` - Homework submission/assignment types, including homework integrity shape.
- `src/components/homework/HomeworkSubmissionTable.tsx` - Teacher homework table that must use homework-summary integrity data.
- `src/components/test/IntegrityDetailPanel.tsx` - Teacher integrity detail UI for session reports and homework summaries.
- `src/components/thcs-grading/THCSStudentProgressCard.tsx` - THCS monitor card with status-gated teacher actions and integrity badge parity.
- `src/components/thcs-grading/THCSStudentProgressCard.test.tsx` - Focused regression coverage for THCS monitor action visibility and confirmations.
- `src/components/writing-monitor/WritingMonitorCard.tsx` - Writing monitor card with status-consistent integrity state and valid teacher actions.
- `src/components/writing-monitor/WritingMonitorCard.test.tsx` - Focused regression coverage for writing monitor status/action gating.
- `src/pages/TeacherHomeworkDetailPage.tsx` - Homework detail page that opens integrity detail panels and tracks those actions.
- `src/pages/TeacherHomeworkDetailPage.test.tsx` - Regression coverage for homework integrity badge clicks and legacy full-report normalization into homework summaries.
- `src/pages/TeacherTestResultsPage.tsx` - Session results page that opens integrity detail panels and tracks those actions.
- `src/pages/TeacherTestResultsPage.test.tsx` - Regression coverage for session-only integrity detail panels and rejection of homework-style summary payloads.
- `src/pages/StudentTestPage.tsx` - Main live IELTS session surface and teacher force-submit integration point.
- `src/pages/StudentWaitingRoomPage.jsx` - Student waiting-room resume logic after a teacher resets a live submission.
- `src/pages/StudentWaitingRoomPage.test.jsx` - Waiting-room regression coverage for teacher reset resume behavior.
- `src/pages/StudentQuizPageNew.jsx` - Quiz session anti-cheat parity work.
- `src/pages/StudentQuizPageNew.test.jsx` - Quiz-session coverage for integrity refresh wiring and config parity.
- `src/skills/reading/components/ReadingTestPage.tsx` - Routed live reading session surface with anti-cheat enforcement and shuffled display parity.
- `src/skills/listening/components/ListeningTestPage.tsx` - Routed live listening session surface with anti-cheat enforcement and teacher force-submit support.
- `src/__tests__/integration/StudentTestPage.test.tsx` - Routed generic IELTS session coverage for anti-cheat config wiring and flush-before-submit behavior.
- `src/__tests__/integration/ReadingTestPage.test.tsx` - Routed reading-session coverage for anti-cheat config wiring and flush-before-submit behavior.
- `src/__tests__/integration/ListeningTestPage.test.tsx` - Routed listening-session coverage for anti-cheat config wiring and flush-before-submit behavior.
- `src/pages/TeacherTestMonitorPage.tsx` - Teacher monitor actions and temporary diagnostic UI removal.
- `src/components/test/StudentProgressCard.tsx` - Teacher monitor card actions for force-submit versus reset availability by student status.
- `src/config/featureRegistry.ts` - Observability registry for touched teacher/homework/test workflows, including the dedicated anti-cheat runtime telemetry feature.
- `src/config/featureRegistry.test.ts` - Registry regression coverage for route resolution and tracked action definitions.

## Notes

- Use `npx vitest run [optional/path]` for focused verification and `npm run build` before calling this production-ready.
- Session integrity and homework integrity are different contracts. Homework must not be typed or rendered as a full session-style `IntegrityReport`.
- Do not expose integrity badges, detail panels, or raw reports on student-facing pages.
- Treat `tasks-0036-prd-anti-cheating-system.md` as historical context only. Its completed checkboxes are not a production signal.
- Any touched teacher action or route-level workflow must stay aligned with `src/config/featureRegistry.ts`.
- Focused verification completed so far: `src/hooks/test/useTestCompletionCheck.test.ts`, `src/hooks/test/useTestIntegrity.test.ts`, `src/hooks/test/useIntegrityRefreshRequest.test.ts`, `src/utils/antiCheatPresets.test.ts`, `src/utils/thcsShuffle.test.ts`, `src/services/homeworkManager.test.ts`, `src/services/homeworkSubmissionService.test.ts`, `src/services/sessionStudentControlService.test.ts`, `src/pages/StudentWaitingRoomPage.test.jsx`, `src/pages/StudentQuizPageNew.test.jsx`, `src/pages/TeacherHomeworkDetailPage.test.tsx`, `src/pages/TeacherTestResultsPage.test.tsx`, `src/__tests__/integration/StudentTestPage.test.tsx`, `src/__tests__/integration/ReadingTestPage.test.tsx`, `src/__tests__/integration/ListeningTestPage.test.tsx`, `src/components/thcs-grading/THCSStudentProgressCard.test.tsx`, `src/components/writing-monitor/WritingMonitorCard.test.tsx`, and `npm run build`.
- Focused verification for `5.1` to `5.3`: `src/hooks/test/useTestData.test.ts`, `src/hooks/test/useTestSubmission.test.ts`, `src/hooks/solo/useSoloTestData.test.ts`, `src/hooks/solo/useSoloSubmission.test.ts`, `src/services/testStorage.test.ts`, and `npm run build`.
- Focused verification for `5.4` and `5.5`: `src/utils/thcsShuffle.test.ts`, `src/hooks/test/useTestSubmission.test.ts`, `src/hooks/solo/useSoloSubmission.test.ts`, `src/hooks/test/useTestData.test.ts`, `src/hooks/solo/useSoloTestData.test.ts`, and `npm run build`.
- Focused verification for `6.1` and `6.2`: `src/config/featureRegistry.test.ts`, `src/hooks/test/useTestIntegrity.test.ts`, `src/hooks/test/useAntiCopyPaste.test.ts`, `src/hooks/test/useFullscreenMode.test.ts`, `src/hooks/test/useIntegrityRefreshRequest.test.ts`, `src/hooks/test/useTestCompletionCheck.test.ts`, `src/hooks/test/useTestData.test.ts`, `src/hooks/test/useTestSubmission.test.ts`, `src/hooks/solo/useSoloTestData.test.ts`, `src/hooks/solo/useSoloSubmission.test.ts`, `src/utils/thcsShuffle.test.ts`, `src/services/homeworkManager.test.ts`, `src/services/homeworkSubmissionService.test.ts`, `src/services/sessionStudentControlService.test.ts`, `src/pages/TeacherHomeworkDetailPage.test.tsx`, `src/pages/TeacherTestResultsPage.test.tsx`, `src/pages/StudentWaitingRoomPage.test.jsx`, `src/pages/StudentQuizPageNew.test.jsx`, `src/components/thcs-grading/THCSStudentProgressCard.test.tsx`, `src/components/writing-monitor/WritingMonitorCard.test.tsx`, and `npm run build`.
- Obsolete rollout caveat retired on 2026-05-10: normal teacher edit saves, `saveTestToFirebase()`, and `updateTestInFirebase()` must now regenerate `student_safe_tests/{testId}` with canonical test changes. Backfill remains repair-only for old/missing projection incidents, not the expected edit workflow.
- RTDB rules changed in `database.rules.json`; production rollout must deploy the updated database rules with the app code.
- The production closeout appendix in `documentation/tasks/0036-anti-cheat-production-closeout.md` records the original contract mismatches, the executed local QA matrix, the stale junior-checklist reconciliation, and the release/rollback plan.
- `documentation/tasks/0036-anti-cheat-runtime-contracts.md` documents the implementation-level additions that are easy to miss in the PRD: student-safe payload nodes, session payload caching, refresh/reset coordination timestamps, session cleanup rules, and live-session stale-payload fallback.
- `documentation/architecture/student-test-delivery-projections.md` documents the canonical-to-student projection contract for teacher edits, live-session cache freshness, and image-mode `questionImages` ranges.
- `documentation/tasks/0036-anti-cheat-observability-contract.md` documents the reporting-pipeline side of the system: the `antiCheat` feature, its emitted actions, the shared context envelope, and the metadata that is intentionally safe for AI/debug analysis.
- The `6.4` QA matrix was executed from the available local verification surface in this workspace: focused Vitest coverage and `npm run build`. A final human multi-user staging smoke pass is still recommended because this workspace does not contain seeded anti-cheat session/homework fixtures for direct click-through validation.
- Focused verification for the anti-cheat observability expansion: `src/config/featureRegistry.test.ts`, `src/hooks/test/useTestIntegrity.test.ts`, `src/hooks/test/useTestCompletionCheck.test.ts`, `src/hooks/test/useTestSubmission.test.ts`, `src/hooks/solo/useSoloSubmission.test.ts`, and `npm run build`.

## Tasks

- [ ] 1.0 Re-baseline the anti-cheat foundation and correct the core integrity engine
  - [x] 1.1 Compare the current implementation against the PRD integrity contracts and write down the exact mismatches before making code changes.
  - [x] 1.2 Fix `useTestIntegrity.ts` so tab-switch and blur handling apply both grace rules: under 5 seconds is grace, and the first 2 switches are also grace even if long.
  - [x] 1.3 Correct session context defaults in `antiCheatPresets.ts` and `SessionStartConfigModal.tsx` so session standard defaults keep logging enabled but student warnings and auto-submit disabled unless the teacher enables them.
  - [x] 1.4 Normalize the report builders so session writes produce a full `IntegrityReport` and homework writes produce a real `HomeworkIntegrity` summary.
  - [x] 1.5 Expand `useTestIntegrity.test.ts` to exercise real `visibilitychange`, `blur`, and `focus` flows instead of pre-labeled events.
  - [x] 1.6 Remove temporary anti-cheat diagnostic UI from student and teacher pages once regression coverage exists.

- [ ] 2.0 Complete anti-cheat enforcement across all live session student surfaces
  - [x] 2.1 Audit `TestPageRouter.tsx` to map every live-session entry surface.
  - [x] 2.2 Integrate the anti-cheat stack into `ReadingTestPage.tsx`.
  - [x] 2.3 Integrate the anti-cheat stack into `ListeningTestPage.tsx`.
  - [x] 2.4 Bring `StudentTestPage.tsx` and `StudentQuizPageNew.jsx` to full config parity, including copy/paste, right-click, keyboard shortcuts, fullscreen, warning handling, and flush-before-submit.
  - [x] 2.5 Verify deterministic shuffle behavior for session-mode IELTS delivery.
  - [x] 2.6 Add session integration coverage proving the routed live surfaces read config, classify events, and flush the final report.

- [ ] 3.0 Complete anti-cheat enforcement across both THCS and IELTS homework flows
  - [x] 3.1 Keep `HomeworkCreateModal.tsx` and `homeworkManager.ts` as the canonical homework anti-cheat configuration path.
  - [x] 3.2 Update `THCSHomeworkAssignDialog.tsx` so THCS homework creation no longer bypasses anti-cheat config.
  - [x] 3.3 Integrate anti-cheat hooks and homework config loading into `IELTSPracticeView.tsx`.
  - [x] 3.4 Align `THCSPracticeView.tsx` persistence/output to the corrected homework integrity contract.
  - [x] 3.5 Update `useSoloSubmission.ts` so IELTS homework submission writes homework integrity summary data and nullifies remaining attempts when required.
  - [x] 3.6 Wire `useTestCompletionCheck.ts` into the real homework entry flows with attempt-aware behavior.
  - [x] 3.7 Add homework regression coverage for assignment, violation, auto-submit, and reset paths.

- [ ] 4.0 Repair teacher-side intervention, monitoring, and integrity review workflows
  - [x] 4.1 Redesign the teacher force-submit/reset protocol so a live teacher action causes a real student-side submission or resume path.
  - [x] 4.2 Implement a real `Refresh Logs` behavior in `TeacherTestMonitorPage.tsx` and delete the temporary anti-cheat diagnostic strip.
  - [x] 4.3 Ensure the teacher monitor cards show integrity state consistently and only expose valid teacher actions.
  - [x] 4.4 Refactor `HomeworkSubmissionTable.tsx` and `IntegrityDetailPanel.tsx` so homework detail views do not assume a session-style `events` timeline exists.
  - [x] 4.5 Align `TeacherTestResultsPage.tsx` and `TeacherHomeworkDetailPage.tsx` with the corrected integrity schemas and click-to-detail behavior.
  - [x] 4.6 Add teacher-facing regression coverage for monitor actions, badge rendering, and homework/session data-shape differences.

- [ ] 5.0 Implement real answer-key separation and preserve grading correctness
  - [x] 5.1 Change the session test-loading path so the student-facing rendered payload does not rely on a grading object that is already in component state.
  - [x] 5.2 Apply the rendered-payload vs grading-payload split to `useSoloTestData.ts` so IELTS practice/homework delivery stops exposing answer data in render state.
  - [x] 5.3 Refactor `useTestSubmission.ts` and `useSoloSubmission.ts` to grade exclusively from the separated answer-key source.
  - [x] 5.4 Keep shuffle and grading stable after the separation by validating IDs, option remapping, and original-question references.
  - [x] 5.5 Add tests proving student-facing question state no longer contains answers while grading still succeeds.

- [ ] 6.0 Hardening, observability, and production readiness
  - [x] 6.1 Update `featureRegistry.ts` for any changed teacher monitor, homework assignment, or results workflows.
  - [x] 6.2 Run targeted Vitest suites for integrity hooks, homework flows, teacher monitor/results paths, and answer-key helpers.
  - [x] 6.3 Run `npm run build` and fix any new type/runtime issues.
  - [x] 6.4 Execute a manual QA matrix covering session vs homework vs solo and reading vs listening vs quiz vs THCS behavior, including teacher force-submit and reset.
  - [x] 6.5 Reconcile the stale junior checklist assumptions against the finished implementation.
  - [x] 6.6 Prepare a release note and rollback checklist for production rollout.
  - [x] 6.7 Surface anti-cheat runtime telemetry into the PRD-0037 reporting pipeline with a dedicated feature contract, high-signal metadata summaries, and focused verification.
