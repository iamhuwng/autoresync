# Result View Permission Matrix

Current access matrix for result-related surfaces in PRD-0040. This documents the actual split between route-level gating, in-page ownership checks, backend rule behavior, and test coverage.

Companion docs:
- `documentation/tasks/0040-prd-unified-result-view-architecture-and-governance.md`
- `documentation/architecture/result-view-map.md`
- `documentation/rules/result-view-reuse.md`
- `documentation/architecture/result-view-fr-closure-matrix.md`

Status keys:
- `matches` = app and backend align with the intended surface contract
- `weaker-backend` = app intent is stricter than backend rules
- `weaker-app` = backend may protect more than the surface itself
- `mismatch` = route/app/backend posture conflicts materially

| Surface / path | App-visible roles | App gate | Primary read path | Backend rule reality | Coverage anchor | Status | Notes |
|---|---|---|---|---|---|---|---|
| `/result/:resultId` via `ResultDetailPage` | `student`, `teacher`, `super_admin` | `PrivateRoute` auth + hierarchical role check | RTDB `test_results/{resultId}` through route wrapper | RTDB allows owning student, matching teacherId, any `teacher`, any `super_admin` | `ResultDetailPage.test.tsx`, `PrivateRoute.test.tsx` | mismatch | Route config says ownership-sensitive, but route wrapper does not enforce ownership. |
| `LegacyResultDetailView` | teacher, super_admin | in-page `useOwnershipCheck()` | RTDB `test_results/{resultId}` | backend still allows any teacher read | `LegacyResultDetailView.test.tsx` | weaker-backend | Delegates rendering to `SharedSavedResultCore`. Shell-level ownership is stricter than RTDB teacher reads. |
| `AcademicRecordPage` -> `ResultSlidePanel` | student | student route + query param host | RTDB `test_results/{resultId}` | backend allows owning student; any teacher could also read same path | `AcademicRecordPage.test.tsx`, `ResultSlidePanel.test.tsx` | weaker-app | Delegates rendering to `SharedSavedResultCore`. Query param open path has no visible shell-level ownership check. |
| `StudentDashboardPage` inline result open | student | student route + notification metadata | RTDB `test_results/{resultId}` | same as above | `StudentDashboardPage.teachers.test.jsx` | weaker-app | Trusts `notif.metadata.resultId` to open the panel. |
| `StudentHomeworkListPage` / `StudentHomeworkDetailPage` | student | student route + homework page ownership | RTDB `test_results/{resultId}` | same as above | homework page tests | weaker-app | Host pages are real contracts, but shell-level ownership is not explicit. |
| `TeacherHomeworkDetailPage` -> `ResultDetailModal` | teacher, super_admin | teacher route via hierarchy | RTDB `test_results/{resultId}` | backend allows any teacher read | `TeacherHomeworkDetailPage.test.tsx`, `ResultDetailModal.test.tsx` | weaker-backend | Delegates rendering to `SharedSavedResultCore`. Modal preserves workflow behavior, but backend is broader than assigned-teacher intent. |
| `TeacherStudentHistoryPage` | teacher, super_admin | teacher route + `useStudentDataAccessCheck` | navigation to `/result/:resultId` | backend `test_results` still allows any teacher read | `TeacherStudentHistoryPage.test.tsx` | weaker-backend | Host page validates student access, but downstream RTDB rule remains broad. |
| `StudentWaitingRoomPage` -> `TestResultsModal` | student | student route | RTDB `game_sessions/{sessionId}`, `test_results_by_student/{studentId}`, `test_results_by_session/{sessionCode}` | `game_sessions` and `test_results_by_session` are readable by any authenticated user; student index readable by that student or any teacher | `StudentWaitingRoomPage.test.jsx` | weaker-backend | Session privacy and release-state are not enforced by RTDB rules. |
| `StudentTestResultsPage` | student | student route | RTDB `game_sessions/{sessionCode}`, `test_results_by_student`, legacy direct `getTestResult(sessionCode)` | session paths broad; legacy direct result probe still hits RTDB result path | `StudentTestResultsPage.test.tsx` | mismatch | Legacy route can treat sessionCode as direct resultId before session validation. |
| `/teacher/results` via `TeacherResultsDashboard` | teacher, super_admin by service logic | teacher route via hierarchy | RTDB `game_sessions` plus aggregated session-result loaders | backend `game_sessions` readable by any authenticated user; dashboard narrowing happens in client/service code | `resultsService.test.ts` | weaker-backend | Aggregate dashboard is app-restricted, but its source session reads are broader in RTDB. |
| `TeacherTestResultsPage` | teacher, super_admin | teacher route via hierarchy | RTDB `game_sessions/{sessionCode}` plus session results | backend `game_sessions` readable by any authenticated user | `TeacherTestResultsPage.test.tsx` | weaker-backend | App route is teacher-only, backend session read is much broader. |
| `StudentResultsPage` | student | student route | RTDB `game_sessions/{gameSessionId}` + `sessionStorage.playerId` | backend session read/write open to any authenticated user | `StudentResultsPage.test.jsx` | weaker-backend | Session result route depends heavily on client-side path discipline. |
| `StudentFeedbackPage` | student | student route | RTDB `game_sessions/{gameSessionId}` + `sessionStorage.playerId` | backend session read/write open to any authenticated user | none found | weaker-backend | No meaningful UI coverage found. |
| `TeacherFeedbackPage` | teacher, super_admin | teacher route via hierarchy | RTDB session and feedback nodes | feedback node supports teacher/super_admin session reads; session node open to any auth | `TeacherFeedbackPage.test.jsx` | weaker-backend | Smoke-only coverage. |
| `/guest-results` via `GuestResultsPage` | public route | none | RTDB `guest_results/{guestName}` | top-level read requires `auth != null`; child write is unrestricted | static audit only | mismatch | Public route does not align cleanly with backend read rules, and current CTA buttons navigate to invalid `/login` and `/register` routes. |
| `/profile/complete` guest claim | authenticated users | `PrivateRoute` | RTDB `guest_results/{guestName}` read and `test_results/{userId}` write | claim path writes non-canonical saved-result path; guest node writes are open | static audit only | mismatch | Claim workflow and canonical result storage do not align. |
| `/submission-complete` via `SubmissionCompletePage` | student | student route | location state handoff into `/student-test-results/:sessionCode` | no backend read on this page; downstream result review inherits session-route/backend posture | static audit only | partial | Active bridge surface for writing/test completion, not an authority boundary by itself. |
| `TeacherGradingPage` / `WritingGradingPage` | teacher, super_admin by route hierarchy | teacher route(s) | Firestore `writing_submissions/{submissionId}` | reads limited to student/assigned teacher; create/update open to any authenticated user; no explicit super_admin read | static audit only | mismatch | App role model is broader than Firestore read, and Firestore mutation is too open. |
| `WritingResultDetailModal` / `WritingResultView` | role depends on host | host-level route or page gate | Firestore `writing_submissions/{submissionId}` | read limited to student or assigned/selected teacher | static audit only | partial | Better read protection than RTDB result paths, but host-level super_admin behavior is not proven. |
| `/demo/feedback` via `FeedbackComponentsDemo` | public route | none | RTDB `courses/demo-course-789`, `test_results/demo-result-123` writes | backend permits authenticated writes to these RTDB nodes | static audit only | mismatch | Public route with live write capability. |

## Current Rule Truth That Reviewers Must Not Forget

- RTDB `test_results/{resultId}` is not assigned-teacher-only. Any `teacher` can read any result under current rules.
- RTDB `test_results_by_student/{studentId}` is readable and writable by any `teacher`, not only the assigned teacher.
- RTDB `test_results_by_session/{sessionCode}` and `game_sessions/{sessionId}` are readable by any authenticated user.
- RTDB `guest_results/{guestName}` is writable without auth at the child node.
- Firestore `writing_submissions/{submissionId}` has better read scoping than RTDB saved results, but create and update remain open to any authenticated user.

## Review Gate

Any result-related change should be blocked if it assumes:
- route gating equals ownership enforcement
- teacher read access is assigned-teacher-only in RTDB
- session result visibility is protected by backend release-state rules
- guest-result storage already matches canonical saved-result indexing
- demo/public routes are harmless because they are "just demos"
