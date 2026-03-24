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
| `/result/:resultId` via `ResultDetailPage` | `student`, `teacher`, `super_admin` | `PrivateRoute` auth + hierarchical role check | RTDB `test_results/{resultId}` through route wrapper | RTDB allows owning student, matching teacherId, any `teacher`, any `super_admin` | `ResultDetailPage.test.tsx`, `PrivateRoute.test.tsx` | mismatch | Route config says ownership-sensitive, but route wrapper does not enforce ownership. **Phase 1 carry decision (Task 0.5 Decision 1):** Students are redirected to `/student/academic-record?result={resultId}`. Teacher/admin path is guarded by `useResultOwnershipCheck` in `LegacyResultDetailView`. Backend RTDB rule mismatch (any teacher can read any result) remains a separate tracked risk. |
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

## Task 3.2: Named Enforcement Layers for Saved-Result Entry Paths

Each saved-result entry path has a **named responsible enforcement layer**. "Responsible" means: this is the layer that must block unauthorized access before result data is rendered. Route gating alone is necessary but not sufficient.

### 1. `/result/:resultId` via `ResultDetailPage`

| Attribute | Value |
|---|---|
| **Named enforcement layer** | `useResultOwnershipCheck` in `LegacyResultDetailView` (teacher/admin path) + student redirect safety net |
| **Current wiring** | ✅ Wired. Teacher/admin: `LegacyResultDetailView` calls `useResultOwnershipCheck(result?.studentId)` and denies render on failure. Student: `ResultDetailPage` detects student role and redirects to `/student/academic-record?result={resultId}` before any result data is loaded. |
| **Residual risk** | Backend RTDB allows any `teacher` to read any result. The app is stricter than the backend. Tracked separately (Task 0.5 Decision 1). |
| **Regression test** | `ResultDetailPage.test.tsx`: verifies student redirect with exact query param; `LegacyResultDetailView.test.tsx`: verifies ownership denial rendering. |

### 2. `AcademicRecordPage` → `?result=` query param → `ResultSlidePanel`

| Attribute | Value |
|---|---|
| **Named enforcement layer** | Student route gate (`PrivateRoute` student-only) + RTDB backend read rule (owning student can read own results) |
| **Current wiring** | ⚠️ Partially wired. The route is student-only. The `ResultSlidePanel` reads `test_results/{resultId}` via RTDB — backend rules restrict student reads to the owning student. However, there is no **shell-level** ownership check verifying the query param `resultId` belongs to the logged-in user before attempting the read. The backend is the actual enforcer. |
| **Residual risk** | A student could craft a `?result=<otherId>` query param. The RTDB read would fail at the backend for non-owned results, but the panel would show a loading/error state rather than an explicit "not your result" message. This is acceptable for Phase 1 but not ideal. |
| **Regression test** | `AcademicRecordPage.test.tsx`, `ResultSlidePanel.test.tsx`. No explicit test for crafted foreign `resultId` (backend enforcement is the safety net). |

### 3. `StudentDashboardPage` → notification metadata `resultId` → `ResultSlidePanel`

| Attribute | Value |
|---|---|
| **Named enforcement layer** | Student route gate + notification ownership (notifications are per-user) + RTDB backend read rule |
| **Current wiring** | ⚠️ Partially wired. Notifications are fetched per-user (`getPaginatedUserNotifications(user.uid, ...)`), so `notif.metadata.resultId` is expected to reference a result belonging to the logged-in student. However, no shell-level check validates that the `resultId` embedded in the notification metadata actually belongs to the current user before opening the panel. RTDB backend rules are the actual enforcer. |
| **Residual risk** | If a notification is somehow sent with a foreign `resultId`, the panel would attempt to read it. Backend would block the read for non-owned results. Notification creation is server-side, limiting practical attack surface. |
| **Regression test** | `StudentDashboardPage.teachers.test.jsx`. No explicit test for poisoned notification metadata. |

### 4. `StudentHomeworkListPage` / `StudentHomeworkDetailPage` → homework-owned `resultId` → `ResultSlidePanel`

| Attribute | Value |
|---|---|
| **Named enforcement layer** | Student route gate + homework submission ownership (results are derived from own submissions) + RTDB backend read rule |
| **Current wiring** | ⚠️ Partially wired. The homework pages derive `resultId` from the student's own submission records. The `setSelectedResultId(resultId)` call trusts the submission-derived identifier. No shell-level ownership check exists in `ResultSlidePanel`. RTDB backend rules are the actual enforcer. |
| **Residual risk** | Submission data is read from paths scoped to the logged-in student, so the `resultId` should always be the student's own. Attack surface is minimal but not zero-trust at the shell level. |
| **Regression test** | Homework page tests. No explicit test for foreign `resultId` injection. |

### 5. `TeacherHomeworkDetailPage` → `ResultDetailModal`

| Attribute | Value |
|---|---|
| **Named enforcement layer** | Teacher route gate (hierarchical role check) + homework page context (teacher views their assigned homework's submissions) + RTDB backend read rule (any teacher can read any result) |
| **Current wiring** | ⚠️ Partially wired. The route is teacher-only. The homework detail page shows submissions for a specific homework assignment. The `ResultDetailModal` shell has no explicit ownership check — it trusts the `selectedResultId` from the parent page. Backend RTDB allows any teacher read, so this is functionally permissive. |
| **Residual risk** | Any authenticated teacher can read any result via RTDB. The app scopes display to homework-specific submissions, but the shell does not independently verify. This is a known backend-weaker pattern. |
| **Regression test** | `TeacherHomeworkDetailPage.test.tsx`, `ResultDetailModal.test.tsx`. |

### 6. `TeacherStudentHistoryPage` → `buildRoute('RESULT_DETAIL', { resultId })` → `/result/:resultId`

| Attribute | Value |
|---|---|
| **Named enforcement layer** | Teacher route gate + `useStudentDataAccessCheck(studentId)` on the history page + downstream `useResultOwnershipCheck` in `LegacyResultDetailView` |
| **Current wiring** | ✅ Wired (dual-layer). History page blocks access if the teacher is not assigned to the student. Navigation to `/result/:resultId` then hits the `ResultDetailPage` → `LegacyResultDetailView` → `useResultOwnershipCheck` pipeline. Two independent enforcement points. |
| **Residual risk** | Same as entry path #1: backend RTDB allows any teacher to read. The app is stricter. |
| **Regression test** | `TeacherStudentHistoryPage.test.tsx`, `ResultDetailPage.test.tsx`, `LegacyResultDetailView.test.tsx`. |

### Summary Matrix

| Entry path | Enforcement layer | Wired? | Backend enforcer? | Shell-level check? |
|---|---|---|---|---|
| `/result/:resultId` (teacher/admin) | `useResultOwnershipCheck` | ✅ Yes | ✅ RTDB rules | ✅ `LegacyResultDetailView` |
| `/result/:resultId` (student redirect) | redirect safety net | ✅ Yes | N/A (no data load) | ✅ redirect before render |
| `AcademicRecordPage ?result=` | RTDB backend rules | ⚠️ Partial | ✅ RTDB rules | ❌ No shell-level check |
| `StudentDashboardPage` notification | RTDB backend rules + notification scope | ⚠️ Partial | ✅ RTDB rules | ❌ No shell-level check |
| Homework pages (student) | RTDB backend rules + submission scope | ⚠️ Partial | ✅ RTDB rules | ❌ No shell-level check |
| `TeacherHomeworkDetailPage` | Teacher route + homework context | ⚠️ Partial | ✅ RTDB rules (broad) | ❌ No shell-level check |
| `TeacherStudentHistoryPage` | `useStudentDataAccessCheck` + `useResultOwnershipCheck` | ✅ Yes | ✅ RTDB rules | ✅ Dual-layer |

**Key finding:** Student entry paths (2, 3, 4) rely on RTDB backend rules as the actual enforcer, with no shell-level ownership check in `ResultSlidePanel`. This is explicitly documented as a Phase 1 accepted posture. The teacher full-page path (1, 6) is the only path with explicit shell-level ownership enforcement.

## Task 3.3/3.4: Approved Ownership-Aware Data Path & Access-Lost Defense

All saved-result data paths flow through the RTDB-authenticated read pipeline. No shell bypasses this with local cache, stale data, or unauthenticated reads.

### Data Path Audit

| Shell | Primary data path | Fallback data path | PERMISSION_DENIED handled? | Data cleared on revocation? |
|---|---|---|---|---|
| `ResultSlidePanel` | `onValue(ref(database, 'test_results/{id}'))` | `getTestResult(id)` via `get(ref(...))` | ✅ Task 3.3 | ✅ `setResult(null)` + access-lost UI |
| `ResultDetailModal` | `onValue(ref(database, 'test_results/{id}'))` | `getTestResult(id)` via `get(ref(...))` | ✅ Task 3.3 | ✅ `setResult(null)` + access-lost UI |
| `LegacyResultDetailView` | `onValue(ref(database, 'test_results/{id}'))` (Task 3.5 upgrade) | N/A | ✅ Task 3.5 (PERMISSION_DENIED detection) | ✅ `setResult(null)` + access-lost UI + `useResultOwnershipCheck` (pre-render) |

### Identifier Trust Model

Raw identifiers from query params (`?result=`), notification metadata, and parent-provided props are **never trusted beyond using them as RTDB read keys**. The RTDB backend rules are the ownership enforcer:
- Student reads: `auth.uid === data.child('studentId').val()` — backend blocks foreign result reads
- Teacher reads: `auth.token.role === 'teacher'` — backend allows (known broad-teacher risk)
- If the RTDB read fails with `PERMISSION_DENIED`, shells now clear data and show access-lost state (Task 3.3, FR-035)

### Implementation Files

- `src/utils/rtdbAccessLost.ts`: Shared `isPermissionDeniedError()` detection utility
- `ResultSlidePanel.tsx`: RTDB error handler + fallback error handler + access-lost UI state
- `ResultDetailModal.tsx`: RTDB error handler + access-lost UI state
- `ResultSlidePanel.test.tsx`: 3 FR-035 regression tests (initial PERMISSION_DENIED, mid-session revocation, non-permission errors)

## Task 4.x: Phase 2 Release-State Governance Contract

The live-session review model uses a three-state release policy: `locked-review`, `review-released`, and `feedback-released`. This section documents the verified enforcement architecture.

### Release-State Visibility Contract

| State | Score | Correct Answers | Explanations | Feedback |
|---|---|---|---|---|
| `locked-review` | ✅ | ❌ | ❌ | ❌ |
| `review-released` | ✅ | ✅ | ✅ | ❌ |
| `feedback-released` | ✅ | ✅ | ✅ | ✅ |

### Enforcement Layers

| Layer | Enforced? | Mechanism | Notes |
|---|---|---|---|
| **UI-layer** (primary) | ✅ Yes | `getReleaseVisibility()` in `releaseStateConfig.ts` returns visibility flags consumed by session-scoped surfaces | Teacher/admin exception: always returns all `true` |
| **RTDB field-level** | ❌ No | RTDB does not support field-level restriction | Accepted posture (Finding F-4.7a) |
| **Delayed-generation** | ✅ Yes | Feedback is only written to `test_results/{resultId}/formativeFeedback` when a student opens a saved-result shell via `useFeedbackAutoTrigger` | Prevents leakage during `locked-review` or `review-released` states (Finding F-4.7b) |
| **correctAnswer exposure** | ⚠️ Accepted | `correctAnswer` is written to the result record at submission time; readable via RTDB tools regardless of release state | UI hides via `showCorrectAnswers` flag. Data-layer restriction requires schema redesign (Finding F-4.7c) |

### Scope Boundaries

- **Session-scoped surfaces** (`TestResultsModal`, `StudentTestResultsPage`): governed by release state
- **Saved-result shells** (`ResultSlidePanel`, `ResultDetailModal`, `LegacyResultDetailView`): NOT governed by release state — they display full content to the result owner
- **Monitor page** (`TeacherTestMonitorPage`): operational control surface — owns release controls but does NOT display feedback (`FeedbackTab` absent per Finding F-4.6a)

## Review Gate

Any result-related change should be blocked if it assumes:
- route gating equals ownership enforcement
- teacher read access is assigned-teacher-only in RTDB
- session result visibility is protected by backend release-state rules
- guest-result storage already matches canonical saved-result indexing
- demo/public routes are harmless because they are "just demos"
- a student shell-level ownership check exists (it does not — RTDB backend is the enforcer for student paths)
- release-state visibility is enforced at the data layer (it is UI-layer only — accepted posture per Phase 2 findings)
- feedback is available on session-scoped surfaces before `feedback-released` state (it is not generated until saved-result shell is opened)

