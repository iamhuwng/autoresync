# PRD-0036 Anti-Cheat Production Closeout

For the implementation-level runtime additions that were built beyond the PRD/tasklist wording, see [0036-anti-cheat-runtime-contracts.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0036-anti-cheat-runtime-contracts.md).

For the reporting-pipeline telemetry contract added after the production reset, see [0036-anti-cheat-observability-contract.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0036-anti-cheat-observability-contract.md).

## 1. Baseline Contract Mismatches Captured Before The Production Reset

These were the concrete PRD-to-code gaps that justified the production-reset checklist:

1. Teacher force-submit/reset was not a live intervention path. The monitor only toggled passive RTDB flags, so a mid-test teacher action did not guarantee a real student-side submit or resume flow.
2. IELTS homework was outside the anti-cheat system. Homework anti-cheat config was not loaded on the IELTS homework surface, and the dedicated THCS assignment dialog could create homework without any `antiCheatConfig`.
3. Answer-key obfuscation was incomplete. Student-facing loaders still fetched the full grading object first and stripped answers too late, leaving correct answers present in the initial client payload.
4. The grace-period implementation did not match FR-6 through FR-10. Long tab switches were counted immediately, even when the student had not yet used the two free switches.
5. Homework integrity and session integrity were treated as the same schema. Homework persistence stored a summary-shaped payload while teacher UI components expected a full session-style `IntegrityReport` with `events[]`.
6. Session-surface coverage was incomplete. Routed reading/listening pages and quiz parity were not fully wired to the same anti-cheat stack, so session behavior depended on which student page actually rendered.
7. Teacher observability and review workflows were partial. Refresh-log behavior, detail views, and integrity-click tracking were inconsistent, and temporary anti-cheat diagnostic UI was still present.

## 2. QA Matrix

This matrix was executed locally from the available verification surface in this workspace: focused Vitest coverage, integration tests, and a successful production build. A true multi-user staging click-through is still recommended before enabling the feature broadly, but it was not reproducible from this workspace because there is no seeded teacher/student anti-cheat fixture set or stable browser-auth harness for these exact flows.

| Area | Scenario | Evidence Executed | Local Result | Staging Follow-up |
|---|---|---|---|---|
| Live session | Generic IELTS session loads anti-cheat config, keeps answers out of render state, and flushes integrity before submit | `src/__tests__/integration/StudentTestPage.test.tsx`, `src/hooks/test/useTestData.test.ts`, `src/hooks/test/useTestSubmission.test.ts`, `npm run build` | Pass | Recommended |
| Live session | Routed reading page applies anti-cheat config and flush-before-submit | `src/__tests__/integration/ReadingTestPage.test.tsx`, `npm run build` | Pass | Recommended |
| Live session | Routed listening page applies anti-cheat config and teacher-force-submit support | `src/__tests__/integration/ListeningTestPage.test.tsx`, `src/services/sessionStudentControlService.test.ts`, `npm run build` | Pass | Recommended |
| Live session | Quiz route keeps parity for copy/paste, refresh, and flush-before-submit paths | `src/pages/StudentQuizPageNew.test.jsx`, `src/hooks/test/useTestIntegrity.test.ts`, `npm run build` | Pass | Recommended |
| Homework | IELTS homework uses student-safe payloads, lazy grading, and integrity summary persistence | `src/hooks/solo/useSoloTestData.test.ts`, `src/hooks/solo/useSoloSubmission.test.ts`, `src/services/homeworkSubmissionService.test.ts`, `npm run build` | Pass | Recommended |
| Homework | THCS homework persists summary integrity data and honors reset/nullified-attempt flows | `src/services/homeworkSubmissionService.test.ts`, `src/hooks/test/useTestCompletionCheck.test.ts`, `npm run build` | Pass | Recommended |
| Teacher monitor | Teacher force-submit, reset, refresh, and waiting-room resume behavior remain coherent | `src/services/sessionStudentControlService.test.ts`, `src/pages/StudentWaitingRoomPage.test.jsx`, `src/components/thcs-grading/THCSStudentProgressCard.test.tsx`, `src/components/writing-monitor/WritingMonitorCard.test.tsx` | Pass | Recommended |
| Teacher results | Session results render integrity badges/detail panels and reject homework-style summaries | `src/pages/TeacherTestResultsPage.test.tsx`, `src/config/featureRegistry.test.ts`, `npm run build` | Pass | Recommended |
| Teacher results | Homework detail page renders homework-summary integrity data without requiring `events[]` | `src/pages/TeacherHomeworkDetailPage.test.tsx`, `src/components/homework/HomeworkSubmissionTable.tsx` coverage via page tests, `npm run build` | Pass | Recommended |
| Data safety | Deterministic IELTS shuffle stays aligned between render-state and grading-state after answer-key separation | `src/utils/thcsShuffle.test.ts`, `src/hooks/test/useTestSubmission.test.ts`, `src/hooks/solo/useSoloSubmission.test.ts` | Pass | Recommended |

## 3. Reconciliation Against The Stale Junior Checklist

The original reference checklist in `tasks-0036-prd-anti-cheating-system.md` is now historical context only. These assumptions were stale and should not be reused as release signals:

| Stale Assumption In The Junior Checklist | Why It Was Invalid | Corrected Production State |
|---|---|---|
| “Audit v2 — All 20 issues from the audit assessment have been resolved.” | The later audit still found critical gaps across teacher intervention, homework coverage, answer-key loading, and schema mismatches. | The production-reset task list replaced the junior checklist as the release tracker. |
| Force-submit/reset was complete once `hasCompletedTest` and `forceSubmittedBy` were toggled. | Passive flag writes did not create a guaranteed live student-side submission or resume path. | Teacher intervention now uses the explicit session control service and student listeners for force-submit/reset behavior. |
| Homework anti-cheat coverage was effectively done because THCS had partial support. | IELTS homework had no anti-cheat parity, and THCS assignment could still bypass config persistence entirely. | Both THCS and IELTS homework flows now load/persist `antiCheatConfig` and write the corrected homework integrity summary. |
| Answer-key obfuscation was complete once answers were stripped in the hook/page layer. | The full grading payload was still fetched first, so answers were present in the initial client request/state. | Student-safe RTDB payloads and lazy grading-only reads now separate rendered state from answer-key state. |
| Homework integrity could be typed like a full session report. | Homework persistence intentionally stores a compact summary, not a full `events[]` timeline. | Homework normalization/rendering now uses the dedicated summary contract and only session reports expose event timelines. |
| Session anti-cheat coverage only needed `StudentTestPage.tsx`. | Routed reading/listening pages and quiz delivery use different surfaces; leaving them untouched created behavior gaps. | Reading, listening, quiz, and generic session routes now share the same anti-cheat expectations and regression coverage. |
| Refresh logs and teacher review were “done enough” once the badge existed. | Refresh behavior, detail rendering, and integrity action tracking were still incomplete. | Teacher monitor/results workflows now include refresh wiring, corrected detail rendering, and observability actions. |

## 4. Release Note Draft

### Summary

PRD-0036 is now in production-ready code shape for the anti-cheat and integrity workflow across live sessions, homework, and teacher review surfaces.

### What Changed

- Live IELTS session pages, routed reading/listening pages, and quiz delivery now apply the same anti-cheat configuration, event logging, warning, and flush-before-submit behavior.
- Homework anti-cheat now works across both IELTS and THCS assignment paths, including homework integrity summaries and nullified-attempt behavior when auto-submit is configured to lock remaining attempts.
- Teacher monitor flows now support real force-submit, reset, and refresh-log behavior instead of relying on passive flags alone.
- Teacher results and homework review pages now show integrity badges and detail panels using the correct schema for each context.
- Student-facing question state no longer carries answer keys in the render payload. Grading reads the answer-bearing questions separately when submission happens.
- Observability coverage now includes a dedicated `antiCheat` feature in the reporting pipeline, with high-signal runtime telemetry for protection initialization, violations, warning escalation, flush triggers, persistence outcomes, teacher force-submit handling, and homework entry blocking.

### Rollout Prerequisites

- Deploy the frontend app changes together with the updated `database.rules.json`.
- Backfill `student_safe_tests/{testId}` for active legacy tests, or re-save those tests before broad rollout so solo/homework student-safe loads do not fail on missing safe payloads.
- Verify a teacher account and at least one student account can complete one live-session smoke pass and one homework smoke pass after deployment.

## 5. Rollback Checklist

1. If rollout causes delivery or submission regressions, redeploy the previous frontend build first. The new anti-cheat data nodes are additive; the old frontend can ignore them.
2. Keep existing `student_safe_tests/{testId}` and `session_test_payloads/{sessionCode}` data in place during rollback. They are safe to leave populated and should not be deleted as part of first-response rollback.
3. Revert `database.rules.json` only if the incident is tied to the new safe-payload or session-payload rules. Otherwise, leaving the additive rules in place is lower risk than doing a second emergency deploy.
4. After rollback, verify these minimum paths in order:
   - Teacher can start a session.
   - Student can open a live test and submit successfully.
   - Student can open a homework assignment and submit successfully.
   - Teacher can open session results and homework results without integrity-panel crashes.
5. If the issue is isolated to legacy content missing `student_safe_tests/{testId}`, prefer a data backfill or test re-save over a full rollback.
6. Do not delete historical integrity data during rollback. Existing homework/session integrity records are still valid audit data even if the frontend is reverted.
