# Result View Map

Source of truth for PRD-0040 surface classification. This document records what is currently active in the codebase, what domain each surface belongs to, and which surfaces are demo-only, unwired, or alternate.

Companion docs:
- `documentation/tasks/0040-prd-unified-result-view-architecture-and-governance.md`
- `documentation/architecture/result-view-permission-matrix.md`
- `documentation/rules/result-view-reuse.md`
- `documentation/architecture/result-view-fr-closure-matrix.md`

Status keys:
- `active`
- `legacy`
- `unwired`
- `demo-only`

Domain keys:
- `saved-result`
- `session/post-test`
- `guest-result/claim`
- `writing`
- `live-monitoring`
- `unwired/demo`

Writing lifecycle keys:
- `draft`
- `monitor`
- `queue`
- `editor`
- `result`
- `alternate/dormant`

## Surface Inventory

| Surface | Status | Domain | Writing lifecycle | Route / host | Primary data path | Owner / host contract | Coverage anchor | Resolution disposition | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `ResultSlidePanel` | active | saved-result | - | `AcademicRecordPage`, `StudentDashboardPage`, `StudentHomeworkListPage`, `StudentHomeworkDetailPage` | RTDB `test_results/{resultId}` | student saved-result shell | `ResultSlidePanel.test.tsx` | - | Delegates content to `SharedSavedResultCore`. No visible shell-level ownership check. |
| `ResultDetailModal` | active | saved-result | - | `TeacherHomeworkDetailPage` | RTDB `test_results/{resultId}` | teacher modal shell | `ResultDetailModal.test.tsx` | - | Delegates content to `SharedSavedResultCore`. Homework-specific behavior is part of the current contract. |
| `LegacyResultDetailView` | active | saved-result | - | `ResultDetailPage` | RTDB `test_results/{resultId}` | teacher/admin full-page shell | `LegacyResultDetailView.test.tsx` | - | Delegates content to `SharedSavedResultCore`. Legacy-named, but still active. Uses ownership middleware. |
| `ResultDetailPage` | active | saved-result | - | `/result/:resultId` | route wrapper | wrapper only | `ResultDetailPage.test.tsx` | - | Student redirects to academic record; teacher/admin stays full-page. |
| `AcademicRecordPage` | active | saved-result | - | `/student/academic-record` | query param `?result=` -> `ResultSlidePanel` | student query-param owner | `AcademicRecordPage.test.tsx` | - | Canonical student saved-result host. |
| `StudentDashboardPage` | active | saved-result | - | `/student`, `/student/dashboard` | notification metadata `resultId` -> `ResultSlidePanel` | student dashboard notification owner | `StudentDashboardPage.teachers.test.jsx` | - | Opens panel directly when metadata contains `resultId`. |
| `StudentHomeworkListPage` | active | saved-result | - | student homework list | result open -> `ResultSlidePanel` | student homework host | `StudentHomeworkListPage.test.tsx` | - | Entry owner, not a disposable wrapper. |
| `StudentHomeworkDetailPage` | active | saved-result | - | student homework detail | result open -> `ResultSlidePanel` | student homework host | `StudentHomeworkDetailPage.test.tsx` | - | Entry owner, not a disposable wrapper. |
| `TeacherHomeworkDetailPage` | active | saved-result | - | teacher homework detail | result open -> `ResultDetailModal` | teacher homework host | `TeacherHomeworkDetailPage.test.tsx` | - | Teacher modal host. |
| `TeacherStudentHistoryPage` | active | saved-result | - | `/teacher/student/:studentId/history` | `buildRoute('RESULT_DETAIL', { resultId })` | teacher deep-link owner | `TeacherStudentHistoryPage.test.tsx` | - | History view drives canonical permanent-result deep links. |
| `StudentWaitingRoomPage` | active | session/post-test | - | `/student-wait/:gameSessionId` | RTDB `game_sessions/{sessionId}` and session result handoff | waiting-room-first student post-test owner | `StudentWaitingRoomPage.test.jsx` | - | Auto-opens results modal when `showResults` is set. |
| `TestResultsModal` | active | session/post-test | - | mounted by waiting room | RTDB `test_results_by_student`, `test_results_by_session`, `lastTestId` fallback | student live-session review surface | static audit only | - | Session-first loader; not a plain `resultId` reader. |
| `StudentTestResultsPage` | active | session/post-test | - | `/student-test-results/:sessionCode`, `/student/results/:sessionCode` | RTDB `game_sessions/{sessionCode}` plus permanent-result fallback | rich student session review page | `StudentTestResultsPage.test.tsx` | - | Legacy direct result probe still exists on `/student/results/:sessionCode`. |
| `TeacherResultsDashboard` | active | session/post-test | - | `/teacher/results` | RTDB `game_sessions` plus aggregated session-result loaders | teacher aggregate results dashboard | `resultsService.test.ts` | - | Dashboard/aggregate result surface, not a saved-result shell. |
| `TeacherTestResultsPage` | active | session/post-test | - | `/teacher-test-results/:sessionCode` | RTDB `game_sessions/{sessionCode}` plus session result loaders | teacher session-result page | `TeacherTestResultsPage.test.tsx` | - | Includes writing result section. |
| `TeacherResultsPage` | active | session/post-test | - | `/teacher-results/:gameSessionId` | RTDB `game_sessions/{gameSessionId}` | teacher live session results | `TeacherResultsPage.test.jsx` | - | Adjacent session surface, not a saved-result shell. |
| `StudentResultsPage` | active | session/post-test | - | `/student-results/:gameSessionId` | RTDB `game_sessions/{gameSessionId}` plus `sessionStorage.playerId` | student live session results | `StudentResultsPage.test.jsx` | - | Test is stale. |
| `TeacherFeedbackPage` | active | session/post-test | - | `/teacher-feedback/:gameSessionId` | RTDB `game_sessions/{gameSessionId}` and feedback paths | teacher session feedback page | `TeacherFeedbackPage.test.jsx` | - | Smoke-only coverage. |
| `StudentFeedbackPage` | active | session/post-test | - | `/student-feedback/:gameSessionId` | RTDB `game_sessions/{gameSessionId}` and `sessionStorage.playerId` | student session feedback page | none found | - | Adjacent feedback surface, not saved-result. |
| `GuestResultsPage` | active | guest-result/claim | - | `/guest-results` | RTDB `guest_results/{guestName}` | guest lookup/list page | none found | - | Public route, but backend read still requires auth and the current CTAs point to invalid `/login` and `/register` routes. |
| `ProfileCompletionPage` | active | guest-result/claim | - | `/profile/complete` | `checkClaimableResults(email)` | authenticated claim/recovery owner | none found | - | Opens claim modal when guest names are claimable. |
| `ClaimResultsModal` | active | guest-result/claim | - | mounted by profile completion | `claimGuestResults(guestName, userId)` | guest claim executor | none found | - | Writes non-canonical RTDB result path. |
| `TeacherTestMonitorPage` | active | live-monitoring | monitor | `/teacher-test/:sessionCode` and related monitor routes | RTDB `game_sessions/{sessionId}` | live monitor owner | static audit only | - | Also owns writing monitor and release-adjacent flows. |
| `StudentDetailModal` | active | live-monitoring | - | mounted by monitor flows | RTDB session/player paths | live monitoring detail surface | static audit only | - | Not a result-view migration anchor. |
| `WritingTestPage` | active | writing | draft | student writing test flow | RTDB `game_sessions/{sessionCode}/writing/...` | student writing draft/edit host | static audit only | - | Draft/autosave front door. |
| `WritingMonitorCard` | active | writing | monitor | mounted by teacher monitor | RTDB live writing draft paths | teacher monitor card | `WritingMonitorCard.test.tsx` | - | Monitor-time operational surface. |
| `WritingPeekModal` | active | writing | monitor | mounted by teacher monitor | RTDB live draft text | teacher monitor peek | static audit only | - | Reads live draft, not final submission. |
| `TeacherGradingPage` | active | writing | queue | `/teacher/grading`, `/teacher/grading/writing` | Firestore `writing_submissions` query | teacher grading queue | static audit only | - | Operational front door for grading. |
| `WritingGradingPage` | active | writing | editor | `/teacher/grading/writing/:submissionId` | Firestore `writing_submissions/{submissionId}` | active grading editor | static audit only | - | Autosave and Save Draft currently mark work graded. |
| `WritingResultView` | active | writing | result | mounted by student/teacher result bridges | Firestore `writing_submissions/{submissionId}` | writing result viewer | static audit only | - | Result surface, not front door. |
| `WritingResultDetailModal` | active | writing | result | mounted by writing result flows | Firestore `writing_submissions/{submissionId}` | writing result modal | static audit only | - | Can reopen grading. |
| `WritingTestResultsSection` | active | writing | result | mounted by `TeacherTestResultsPage` | Firestore writing submission lookup | writing result bridge | static audit only | - | Session result page bridge into writing results. |
| `SubmissionCompletePage` | active | writing | result | `/submission-complete` | location state handoff -> `/student-test-results/:sessionCode` | writing submission-complete bridge | static audit only | - | Active post-submission bridge from writing/test completion into student result review. |
| `InlineWritingGrader` | active | writing | editor | mounted by `TeacherTestMonitorPage` for THCS | live session result state | THCS inline writing grading | `thcsWritingGrading.service.test.ts` | - | Separate from IELTS writing submission architecture. |
| `WritingGradingModal` | unwired | writing | alternate/dormant | no active route | none in current app wiring | alternate grading toolchain | none found | remove now | Documented heavily in `.knowns`, not wired in current app. |
| `StudentResultOverview` | unwired | writing | alternate/dormant | no active route | none in current app wiring | student writing redesign artifact | none found | remove now | Docs-only in current repo state. |
| `StudentDetailedMarkup` | unwired | writing | alternate/dormant | no active route | none in current app wiring | student writing redesign artifact | none found | remove now | Docs-only in current repo state. |
| `FeedbackComponentsDemo` | demo-only | unwired/demo | - | `/demo/feedback` | writes RTDB `courses/demo-course-789` and `test_results/demo-result-123` | public demo route | none found | remove now | Public demo with live data writes. |
| `FeedbackDemoPage` | demo-only | unwired/demo | - | `/demo/feedback-system` | local mock state | public demo route | none found | remove now | Reachable public demo. |
| `AcademicRecordDemoPage` | demo-only | unwired/demo | - | `/demo/academic-record` | local mock state | public demo route | none found | remove now | Reachable public demo. |
| `DemoIndexPage` | demo-only | unwired/demo | - | `/demo` | public demo hub | public demo route | none found | remove now | Links to demo routes, including some missing ones. |

## Current High-Risk Classifications

- `ResultSlidePanel` and `AcademicRecordPage` are active saved-result surfaces, but their visible ownership enforcement is weaker than the PRD intent.
- `TestResultsModal` and `StudentTestResultsPage` are active session/post-test surfaces and must not be collapsed into a `resultId` abstraction.
- `GuestResultsPage` is active, but its route/public posture does not match backend read rules cleanly.
- `FeedbackComponentsDemo` is demo-only but reachable and operationally risky because it writes live RTDB paths.
- `WritingGradingModal`, `StudentResultOverview`, and `StudentDetailedMarkup` are not active runtime surfaces today; they should be treated as `alternate/dormant` or `unwired`, not migration anchors.

## Stale Producers and Config-Only References

- `StudentClassDetailPage.jsx` still produces `/student/results/${classId}/${assignment.id}` links, which do not match any mounted result route.
- `routeSecurity.ts` still contains `/student/results/history`, but no mounted route was found for that path in `App.jsx`.
- `featureRegistry.ts` tracks `/student/results/:sessionCode` and related routes, but it does not currently list `/teacher/results`, `/guest-results`, or the public demo surfaces. Treat the registry as observability metadata, not as a complete result-surface inventory.
