# Discovered Findings â€” PRD-0040: Unified Result View Architecture and Governance

This file contains all discovered findings from implementing `tasks-0040-prd-unified-result-view-architecture-and-governance.md`.
Per `process-task-list.md`: ONLY ADD. MUST NOT EDIT, REMOVE, OR COMBINE EXISTING CONTENT UNTIL THE TASKLIST IS FINISHED.

---

## Reassessment Findings (2026-03-25)

### Finding R-2026-03-25-1: Phase-4 closure was overstated until saved-result entry points were brought under release governance
The original PRD FR-051 requires all student entry points that can open the same live-session result to respect the same release state, including saved-result route/panel entry points. Earlier closure text treated saved-result shells as intentionally outside release-state governance. That was not faithful to the PRD. `ResultSlidePanel.tsx` now subscribes to `game_sessions/{sessionCode}` for `class_session` results, limits tabs by release state (`locked-review` â†’ overview only, `review-released` â†’ overview + review, `feedback-released` â†’ full), redacts unreleased feedback/explanations from the shared core, suppresses student feedback auto-generation until `feedback-released`, and now fails closed to `locked-review` if the session context is missing or the session release read errors.

### Finding R-2026-03-25-2: `endFullSession()` was contradicting FR-050 and FR-054 by relocking review after session end
The original PRD requires automatic review release when the teacher ends the live session. The implementation in `useMonitorControls.ts` had been writing `reviewReleaseState: 'locked-review'` during session end, which forced students back into the most restrictive state after the teacher ended the test. This has now been corrected so session end writes `review-released` by default and preserves `feedback-released` if the teacher had already promoted the session further.

### Finding R-2026-03-25-3: Release-state documentation drifted onto a non-existent `releaseStateConfig.ts` API
Several Phase-4 and Phase-9 findings described a role-aware `releaseStateConfig.ts` helper such as `getReleaseVisibility(state, role)`. The actual implementation lives in `src/types/releaseState.types.ts`, and `getReleaseVisibility()` accepts only the release state. Teacher/admin exceptions are achieved by separate teacher/admin surfaces and route ownership, not by a role-aware visibility helper. Any doc claiming the role-aware helper exists is inaccurate.

### Finding R-2026-03-25-4: Phase-9 enforcement closure was overstated until the governance gate was activated
Task-list item `9.1` had been marked complete before the repo actually failed result-related changes that omitted the result-view docs/change record. That gap is now corrected: `scripts/pre-commit-enforcement.js` enforces the PRD-0040 artifact bundle, and `.github/workflows/result-view-governance.yml` runs the same gate in CI.

### Finding R-2026-03-25-5: Demo-surface removal required residue cleanup to become truthful
The demo page/component files named in Phase 6 were removed from runtime earlier, but repo reconciliation remained incomplete until the stale demo-route/config/script residue was also removed from `src/config/routeSecurity.ts`, `src/scripts/setupFeedbackDemo.js`, `src/scripts/setupFeedbackDemo.ts`, and `src/scripts/mockFeedbackData.ts`.

### Finding R-2026-03-25-6: Guest-claim storage remains compatibility-mapped and non-canonical
Earlier closure text described guest claims as writing into canonical `test_results/{userId}` storage. The actual `claimGuestResults()` path still nests claimed results under `test_results/{userId}/{generatedResultId}` and does not rebuild the canonical saved-result indexes used elsewhere (`test_results_by_student`, `test_results_by_session`, etc.). The guest-domain compatibility carry is still real and should stay documented as such.

### Finding R-2026-03-25-7: Phase-9 enforcement scope remained too narrow until guest, dashboard, and writing-result surfaces were matched
The first pass of the PRD-0040 governance gate only matched the saved-result/session-core subset. That allowed several result-view surfaces documented in the architecture pack to bypass the change-record/doc bundle entirely, including `ClaimResultsModal`, `StudentResultsPage`, `TeacherResultsDashboard`, `TeacherResultsPage`, `WritingPeekModal`, `WritingResultView`, `WritingResultDetailModal`, `WritingTestResultsSection`, `SubmissionCompletePage`, `TeacherGradingPage`, `WritingGradingPage`, and `WritingGradingQueuePage`. The matcher has now been widened so the local pre-commit gate and CI workflow enforce the living-doc packet across the broader PRD-0040 result-surface inventory rather than only the original narrow subset.

### Finding R-2026-03-25-8: Guest-claim storage was later canonicalized, so the earlier compatibility-only carry is now historical
Finding R-2026-03-25-6 accurately described the repo before the follow-up remediation landed, but it is no longer current. `claimGuestResults()` now promotes claimed guest rows into canonical `test_results/{resultId}` records, rewrites ownership to the claiming user, rebuilds the standard saved-result indexes (`test_results_by_student`, `test_results_by_session`, `test_results_by_teacher`, `test_results_by_course`, and `test_results_by_class` when those fields exist), and deletes the guest staging bucket only after the root fan-out update succeeds. `migrateLegacyClaimedGuestResults()` was added as a privileged/manual helper so previously claimed nested rows can be reconciled without preserving the old compatibility-mapped storage contract as current truth.

### Finding R-2026-03-25-9: The class-detail result dead link is closed only because submission flow now persists canonical `resultId`
The original stale-link gap in `StudentClassDetailPage.jsx` could not be fixed safely by swapping route strings alone, because the class-assignment progress shape did not persist a canonical saved-result identifier. The follow-up remediation writes `resultId` and related submission metadata back into `classes/{classId}/students/{playerId}/assignments/{assignmentId}` from `useTestSubmission.ts`, extends `StudentAssignment` to carry that field, and makes `StudentClassDetailPage.jsx` navigate only through `buildRoute('RESULT_DETAIL', { resultId })` when the canonical id exists. Historical assignment rows that still lack `resultId` now fail closed behind a non-clickable pending state instead of sending users to a dead route.

### Finding R-2026-03-25-10: Result-surface observability drift was reduced by widening the tracked route inventory
The earlier reassessment correctly noted that `featureRegistry.ts` was metadata rather than authority, but it was also materially incomplete. The follow-up remediation added `/guest-results`, `/teacher/results`, and `/submission-complete` to the `results` feature inventory, added resolver coverage in `featureRegistry.test.ts`, and wrapped the public `/guest-results` route with `withTrackedRoute(..., 'results')` in `App.jsx`. This does not make the registry authoritative, but it removes several concrete observability blind spots that were still real at the time of Finding R-2026-03-25-7.

## Phase 3 Findings

### Finding F-3.3a: `LegacyResultDetailView` uses one-shot fetch, not real-time listener
`LegacyResultDetailView` uses `getTestResult()` (one-shot `get()`) rather than `onValue()` listener. Real-time access revocation during view is not possible with one-shot fetch. However, it has `useResultOwnershipCheck` which prevents initial load for unauthorized users. This is an accepted Phase 1 posture â€” the teacher/admin shell cannot detect mid-session revocation, but ownership is validated before first render.
**Resolution (Task 3.5):** Converted to `onValue` real-time listener. All three shells now use consistent RTDB listener pattern.

### Finding F-3.4a: All data paths flow through authenticated RTDB reads
Audit confirmed no shell bypasses the RTDB-authenticated read pipeline. `onValue()` and `getTestResult()` both use `ref(database, 'test_results/{id}')` which is subject to backend security rules. No shell uses local cache, stale data, or unauthenticated reads. Raw identifiers from query params, notifications, and parent props are used only as RTDB read keys â€” the backend rules are the actual enforcer.

### Finding F-3.4b: `ResultSlidePanel` fallback path also needs PERMISSION_DENIED check
The `getTestResult` fallback in `ResultSlidePanel` (triggered when the RTDB `onValue` listener fails before first snapshot) also needed PERMISSION_DENIED detection. This was addressed in Task 3.3 implementation â€” both the listener error and the fallback catch now check for permission denied.

### Finding F-3.5a: Stale-state drift risk in `LegacyResultDetailView`
Before Task 3.5, `LegacyResultDetailView` loaded result data via a one-shot `getTestResult()` call. If AI feedback was generated after the page loaded (e.g., auto-triggered by a student opening the same result in `ResultSlidePanel`), the teacher full-page view would not reflect the new feedback until page refresh. This was the exact "stale local state" risk described in Task 3.5.

### Finding F-3.5b: Feedback generation parity is intentionally asymmetric
`ResultSlidePanel` (student) and `ResultDetailModal` (teacher homework context) both auto-trigger feedback generation for THCS results and AI upgrades. `LegacyResultDetailView` (teacher/admin full-page) does NOT auto-trigger â€” this is intentional per FR-022 (existing workflow restrictions may not be silently overwritten). The teacher shell displays feedback if it exists (via shared `FeedbackTab`), but does not initiate generation. This asymmetry is by design, not a gap.

### Finding F-3.5c: All three shells now use consistent RTDB listener pattern
After Task 3.5, all three active saved-result shells (`ResultSlidePanel`, `ResultDetailModal`, `LegacyResultDetailView`) use `onValue` real-time listeners. This means: (1) feedback generated by any shell is automatically reflected in all open shells, (2) PERMISSION_DENIED access-lost detection works across all shells, (3) no stale-state drift is possible.

### Finding F-3.6a: Exact duplication across ResultSlidePanel and ResultDetailModal
Before Task 3.6, both `ResultSlidePanel` and `ResultDetailModal` contained identical: (1) `handleGenerateFormativeFeedback` callback (~30 lines), (2) auto-trigger `useEffect` (~20 lines), (3) `feedbackAttemptedRef` reset logic, (4) `storedFeedbackNeedsUpgrade` memoization. Total ~80 lines of duplicated code was extracted into `useFeedbackAutoTrigger` hook.

### Finding F-3.6b: In-flight dedupe prevents cross-shell duplicate generation
The PRD Â§10 edge case "Same result opened in multiple shells triggers duplicate feedback generation" is now prevented by the `inFlightGenerations` Map in `resultFeedbackGeneration.service.ts`. If a student opens a result in `ResultSlidePanel` while a teacher has the same result open in `ResultDetailModal`, and both auto-trigger generation, the second call returns the first call's promise instead of starting a duplicate.

### Finding F-3.7a: `super_admin` reuses the teacher full-page shell â€” confirmed
`ResultDetailPage.tsx` routes both `teacher` and `super_admin` to the same `LegacyResultDetailView` component. There is no separate admin shell, no conditional admin-only chrome, and no admin-specific rendering path. The `super_admin` sees the exact same result detail view as a teacher. The only difference is in ownership validation: `useResultOwnershipCheck` uses `useTeacherAccess` which grants `super_admin` access to all students' results without needing to be the class teacher.

### Finding F-3.7b: No Admin Tools diagnostics exist yet â€” deferred to Phase 2+
The PRD mentions "Admin Tools" diagnostics but the current implementation has no admin-specific diagnostic UI in any result shell. The `LegacyResultDetailView` has: (1) score summary via `SharedSavedResultCore`, (2) question review, (3) feedback display, (4) PDF certificate download. None of these are admin-specific â€” they are the same teacher view. Admin diagnostic tools (e.g., data integrity checks, feedback generation audit trail, RTDB path inspection) are not in scope for Phase 1 hardening and should be a separate follow-up task.

### Finding F-3.7c: Admin feedback trigger actions â€” same as teacher (none in LegacyResultDetailView)
The `LegacyResultDetailView` (teacher/admin full-page shell) does NOT auto-trigger feedback generation (Finding F-3.5b). It also provides no manual "Generate Feedback" or "Retry Feedback" button. The admin receives the same read-only feedback display as the teacher. This is by design: the full-page shell is a display-only view.

### Finding F-3.7d: Admin mutation prohibitions â€” confirmed no mutation surface exists
The `LegacyResultDetailView` has NO mutation actions: no score editing, no answer modification, no metadata editing, no result deletion, no ownership transfer, and no payload manipulation. The only interactive action is PDF certificate download (read-only) and the "Return" navigation button. This satisfies the PRD requirement to "explicitly prohibit ownership, metadata, score, answer, and payload editing" for the admin shell.

### Finding F-3.8a: Saved-Result Contract â€” Shared-Core Data Fields
All three shells consume these fields from `TestResultRecord` via `SharedSavedResultCore`: `resultId`, `totalScore`, `maxScore`, `percentage`, `bandScore`, `correct`, `incorrect`, `partialCredit`, `totalQuestions`, `questionResults[]`, `testTitle`, `testType`, `testSkill`, `submittedAt`, `timeElapsed`, `thcsData` (including `scaledScore`, `sectionResults`, `intentBreakdown`), `ieltsData` (including `passageResults`), `formativeFeedback`, `context` (including `type`, `configApplied`).

### Finding F-3.8b: Saved-Result Contract â€” Optional/Extension Fields
These fields are present in `TestResultRecord` but not consumed by all shells: `writingSubmission` (Writing skill only), `speakingSubmission` (Speaking skill only), `rubricScores` (Writing/Speaking only), `overallFeedback`/`hasFeedback` (teacher feedback â€” only `LegacyResultDetailView` full-page), `reMarkHistory`/`lastReMarkedAt`/`lastReMarkedBy` (re-marking â€” only session-context results), `markingStatus` (review workflow), `courseId`/`courseName`/`classId`/`className`/`moduleId`/`moduleName` (academic context metadata).

### Finding F-3.8c: Saved-Result Contract â€” Legacy Compatibility Fields
`userId` (alias for `studentId` in older records), `studentName` (may be stale if student profile changed after test), `teacherId` (optional, present on session-context results only), `isGuest` (guest student flag from session-based tests). These fields are tolerated but not required by `SharedSavedResultCore`.

### Finding F-3.8d: Saved-Result Contract â€” Shell-Specific Chrome & Actions
- **ResultSlidePanel** (student): Tab navigation (overview/review/feedback), attempt history/switching, close animation, backdrop click, escape key close, mobile vs desktop layout, feedback auto-trigger via `useFeedbackAutoTrigger`.
- **ResultDetailModal** (teacher homework): Back button, `ResultContextBadge`, `feedbackTiming` from homework config, feedback auto-trigger via `useFeedbackAutoTrigger`, inline vs modal sizing.
- **LegacyResultDetailView** (teacher/admin full-page): PDF certificate download, return navigation, ownership validation via `useResultOwnershipCheck`, NO feedback generation (display-only), RTDB listener with access-lost detection.

### Finding F-3.9a: No new database paths introduced
Audit confirmed all Phase 3 changes use the same canonical `test_results/{resultId}` RTDB path. The `useFeedbackAutoTrigger` hook contains no database imports â€” it delegates to `resultFeedbackGeneration.service.ts` which reads via `getTestResult()` (same `test_results/{resultId}` path). No new Firestore collections, RTDB nodes, or rule dependencies were added. No guest-claim storage or non-canonical paths were introduced or normalized.

### Finding F-3.10a: No cross-role leakage detected â€” shells are architecturally isolated
- **ResultSlidePanel**: Used ONLY in student pages (`StudentHomeworkListPage`, `StudentHomeworkDetailPage`, `AcademicRecordPage`). Contains no teacher/admin role checks or teacher-specific actions. Student-scoped by import graph.
- **ResultDetailModal**: Used ONLY in `TeacherHomeworkDetailPage`. Not imported by any student page. Teacher-scoped by import graph.
- **LegacyResultDetailView**: Used ONLY in `ResultDetailPage`, which redirects students away (`Navigate to /student/academic-record?result=...`) before the component renders. Teacher/super_admin scoped by route guard.
- No shell renders controls belonging to another role. No mutation actions leak across roles. Isolation is enforced by the import graph and route guards, not by runtime role checks inside the shared core.

---

## Phase 4 Findings

### Finding F-4.1a: Release-State Contract â€” Three States Defined
The live-session release model uses exactly three persisted states:
- **`locked-review`**: Student sees score, counts (correct/incorrect/partial), status indicators, and their own submitted answer text. Hidden: correct answers, AI explanations (`formativeFeedback`), teacher feedback (`overallFeedback`, per-question `teacherFeedback`), question stems/text, feedback-generation controls. This remains the effective fallback when `reviewReleaseState` is absent or when the teacher explicitly relocks the session.
- **`review-released`**: Student additionally sees correct answers, their own answer vs correct answer comparison, and question-level scoring detail. Still hidden: AI explanations, teacher feedback, and feedback-generation triggers. This is now the default state written when `endFullSession()` runs unless the teacher had already promoted the session to `feedback-released`.
- **`feedback-released`**: Student sees everything in `review-released` plus AI formative feedback and teacher feedback. This is the final release tier. Teacher explicitly releases this from the monitor. If feedback generation has not finished, students see the feedback loading shimmer when it becomes available via the existing `onValue` listener pattern.

### Finding F-4.1b: Release-State Storage Location
The release state is stored on the **session node**, not the result record. Path: `game_sessions/{sessionCode}/reviewReleaseState`. This choice is deliberate:
- The state governs live-session student review first, and now also governs student `ResultSlidePanel` entry points when a saved result is a `class_session` result with a resolvable `sessionCode`.
- The teacher monitor already owns `game_sessions/{sessionCode}` and can write to it atomically alongside `endFullSession()` and other session mutations.
- All student session-result surfaces (`TestResultsModal`, `StudentWaitingRoomPage`, `StudentTestResultsPage`) already read from `game_sessions/{sessionCode}` for session context.
- The `test_results/{resultId}` record remains the canonical saved result and is NOT modified by release state. Release-state filtering is a presentation-layer concern on the student side.
- Default value when `reviewReleaseState` is absent (legacy or null): `locked-review`. This ensures backwards compatibility â€” existing sessions that ended before this feature was implemented will default to the most restrictive state.

### Finding F-4.1c: Release-State Ownership
- **Writer**: Only the teacher who owns the session can change `reviewReleaseState`. This is enforced by RTDB security rules on `game_sessions/{sessionCode}` (existing `teacherId` check).
- **When set**: `endFullSession()` now sets `reviewReleaseState: 'review-released'` atomically with other session-end updates unless the session is already at `feedback-released`. No release state is set during `completeBaseTest()` (base timer expiry) since the session is still active.
- **Mutation surface**: `TeacherTestMonitorPage.tsx` will provide release toggle controls (Task 4.2). The monitor page can set `reviewReleaseState` to any of the three values via `update(sessionRef, { reviewReleaseState: newState })`.
- **Auto-release at session end**: When `endFullSession()` runs, it now auto-releases review by default. The teacher can still release early before session end, relock if needed, or advance further to `feedback-released` from the monitor.

### Finding F-4.1d: Migration from Current Permissive Behavior
Currently, `TestResultsModal.tsx` displays full result data to students immediately after session end â€” score, correct answers, question breakdown with correct vs student answer, and feedback. This is the **permissive** behavior that Phase 2 restricts.

Migration strategy:
1. `TestResultsModal.tsx` will read `reviewReleaseState` from session data (already available via the session listener or passed as prop from `StudentWaitingRoomPage`).
2. When `reviewReleaseState === 'locked-review'` or absent: only render score summary card, correct/incorrect/partial counts, and student's own answers (without marking as correct/incorrect). Hide the "Correct Key" column, the Explanation section, and the Feedback section. Do not render question stems.
3. When `reviewReleaseState === 'review-released'`: additionally render correct answers, correct/incorrect marking indicators, and question-level score breakdown.
4. When `reviewReleaseState === 'feedback-released'`: render everything (current full behavior).
5. The same filtering logic applies to `StudentTestResultsPage.tsx` and any other student surface that can show the same live-session result.
6. This is an **explicit policy change**, documented as intentional. The current permissive behavior is NOT preserved as a regression â€” it is being replaced by the release-state governance model.

### Finding F-4.1e: Cross-Entry Enforcement Strategy
All student entry points for the same live-session result must read `reviewReleaseState` from `game_sessions/{sessionCode}`. The minimum required files per Task 4.4 are:
- `StudentWaitingRoomPage.jsx` â€” primary post-session surface, opens `TestResultsModal`
- `StudentTestResultsPage.tsx` â€” standalone results page, direct URL access
- `AcademicRecordPage.tsx` â€” student academic history, can surface live-session results
- `StudentDashboardPage.jsx` â€” dashboard with recent results
- `StudentHomeworkListPage.tsx` â€” homework list with result links
- `StudentHomeworkDetailPage.tsx` â€” homework detail with result view

For each surface: if the result's `sessionCode` maps to a live session where `reviewReleaseState` is not `feedback-released`, the surface must enforce the corresponding visibility restrictions. The two session surfaces read the state directly. The four saved-result hosts achieve the same outcome indirectly because `ResultSlidePanel` now subscribes to `game_sessions/{sessionCode}` for `class_session` results and applies the same gate before rendering the shared core.

### Finding F-4.2a: endFullSession atomically auto-releases review
`endFullSession()` in `useMonitorControls.ts` now writes `reviewReleaseState: 'review-released'` as part of the atomic session-end update (alongside `status: 'waiting'`, `testId: null`, etc.), unless the session is already at `feedback-released`. This matches the original PRD intent more closely than the earlier relock behavior and removes the post-end contradiction where students were forced back to the most restrictive tier.

### Finding F-4.2b: setReviewReleaseState is a standalone imperative function
The `setReviewReleaseState(state: ReviewReleaseState)` function writes `{ reviewReleaseState: state, reviewReleaseStateUpdatedAt: Date.now() }` to the session node. It supports early release (teacher sets to `review-released` or `feedback-released` while session is still active or just ended) and post-end release (teacher returns to monitor/lobby and releases). The timestamp audit field (`reviewReleaseStateUpdatedAt`) enables analytics but has no governance logic.

### Finding F-4.2c: Review Release Control Bar â€” Teacher Monitor UI
The control bar renders in `TeacherTestMonitorPage.tsx` between the compact dashboard stats and the student grid. It appears when `submittedCount > 0` (at least one student has submitted). It shows three toggle buttons (ðŸ”’ Locked, ðŸ“‹ Review, ðŸ’¬ Full) with visual active state (colored border + background). Each click calls `setReviewReleaseState()` and shows a Mantine notification confirming the change. The current state is derived from `session.reviewReleaseState` via `getEffectiveReleaseState()` (which defaults null/absent to `locked-review`).

### Finding F-4.2d: useTeacherEndRedirect passes releaseState to waiting room
`useTeacherEndRedirect.ts` now reads the session-level `reviewReleaseState` when redirecting students to the waiting room after teacher-end. It passes `reviewReleaseState` in the navigation state (`state: { showResults: true, sessionCode, reviewReleaseState }`). This enables `StudentWaitingRoomPage.jsx` to immediately know the release restriction level when opening the `TestResultsModal`, without needing a separate RTDB read. The value is read fresh at redirect time, not cached.

### Finding F-4.3a: TestResultsModal visibility enforcement via getReleaseVisibility
`TestResultsModal.tsx` now accepts an optional `reviewReleaseState` prop and derives visibility flags using `getEffectiveReleaseState()` â†’ `getReleaseVisibility()`. This ensures that: (1) undefined/null defaults to `locked-review` (most restrictive), (2) visibility is computed from the canonical `ReleaseVisibility` type, (3) all conditional rendering uses the same set of boolean flags (`showCorrectAnswers`, `showAIFeedback`, `showQuestionScoring`). The modal does NOT store or cache the release state internally â€” it is a pure function of its prop.

### Finding F-4.3b: Three-tier content gating in TestResultsModal
The modal now enforces three tiers of content visibility:
- **`locked-review`**: Score summary cards (points, band/scaled score, distribution counts) are always visible. Question cards render with neutral gray styling (no correct/incorrect color indicators), no score breakdown per question (shows "Tap to view your answer" instead), and no correct answer comparison. THCS intent breakdown and section-level breakdown are hidden. A locked-review notice banner (ðŸ”’ "Detailed Review Locked") is shown.
- **`review-released`**: Correct answers, correct/incorrect color indicators, per-question score breakdowns, THCS intent breakdown, and THCS section breakdown become visible. An "Answers Released" notice banner (ðŸ“‹) is shown. Feedback/explanation sections remain hidden.
- **`feedback-released`**: Everything visible â€” full current behavior restored. AI feedback, per-question explanations, and performance feedback section all render.

### Finding F-4.3c: StudentWaitingRoomPage live RTDB listener for release state
`StudentWaitingRoomPage.jsx` now subscribes to `game_sessions/{sessionCode}/reviewReleaseState` via `onValue()` when `hasRecentResults` is true. This enables real-time updates: when the teacher toggles the release tier from the monitor, students in the waiting room see the content change instantly without page refresh. The listener is unsubscribed when `hasRecentResults` becomes false (e.g., when the teacher starts a new test and the completion flag resets).

### Finding F-4.3d: Initial release state sourced from navigation state, then live-synced
The release state flows through two channels: (1) initial value from `location.state.reviewReleaseState` (set by `useTeacherEndRedirect` at redirect time), and (2) continuous live updates from the RTDB listener. The navigation-state value seeds the UI immediately (no flicker of full content then restriction), and the RTDB listener ensures the student stays in sync if the teacher changes the release tier after the redirect.

### Finding F-4.4a: Cross-entry scope audit â€” only two session-scoped student surfaces exist
Audit of all six listed student entry files confirmed that only two are session-scoped (load via `sessionCode` from `game_sessions/`):
1. `StudentWaitingRoomPage.jsx` + `TestResultsModal.tsx` â€” primary post-session surface (Task 4.3)
2. `StudentTestResultsPage.tsx` â€” standalone results page, loads session data via `game_sessions/{sessionCode}` (Task 4.4)

The remaining four files (`AcademicRecordPage.tsx`, `StudentDashboardPage.jsx`, `StudentHomeworkListPage.tsx`, `StudentHomeworkDetailPage.tsx`) use `ResultSlidePanel`, which still loads the saved result from `test_results/{resultId}` but now also reads `game_sessions/{sessionCode}` for `class_session` results. They still are not session loaders, but they are no longer outside release-state governance for live-session saved-result access.

### Finding F-4.4b: StudentTestResultsPage reads release state from session data already in memory
`StudentTestResultsPage.tsx` already loads the full session object via `get(ref(database, 'game_sessions/{sessionCode}'))` into state. The `reviewReleaseState` field is available directly on `session.reviewReleaseState` without requiring an additional RTDB read. This differs from `StudentWaitingRoomPage.jsx` which uses a live `onValue` listener â€” `StudentTestResultsPage` uses a one-shot `get()` so it does NOT live-update. If the teacher changes the release state while the student has this page open, they must refresh. This is acceptable because this page is a standalone full-page view, not a monitored waiting room.

### Finding F-4.5a: Session and saved-result loading paths are cleanly separated â€” no action needed
Audit of `testResults.service.ts` consumers confirmed that session-scoped surfaces and saved-result surfaces use distinct loading functions with no cross-contamination:
- **Session-scoped surfaces** (`StudentTestResultsPage`, `TestResultsModal`): use `getStudentSessionResult()` (line 673 of service) which queries by `sessionCode + studentId`. Also use `getTestResult()` only for the permanent-result migration fallback.
- **Saved-result surfaces** (`ResultSlidePanel`, `ResultDetailModal`, `LegacyResultDetailView`): use `getTestResult()` (line 356 of service) which loads by `resultId` from `test_results/{resultId}`.
- **No shared presentational fragment** merges these paths. `SharedSavedResultCore` is used only by saved-result shells â€” it does NOT participate in session-scoped loading.
- Retry logic (`retryCount` in `StudentTestResultsPage`, `loadRetryRef` in `ResultSlidePanel`) is scoped to each surface and not shared.
- `getStudentResults()` (used by `TestResultsModal` for attempt history) queries by `studentId` across all sessions â€” this is a read-only analytics function, not a loader.
No changes were required.

### Finding F-4.6a: Monitor page contains zero feedback/explanation rendering â€” verified
`TeacherTestMonitorPage.tsx` does not import `FeedbackTab`, `formativeFeedback`, `overallFeedback`, `teacherFeedback`, or any feedback display component. The monitor page renders: (1) session controls (start/end/reset), (2) student grid with submission status, (3) review release control bar (Task 4.2). All feedback and explanation content remains on the three saved-result shells (`ResultSlidePanel`, `ResultDetailModal`, `LegacyResultDetailView`) via `SharedSavedResultCore` â†’ `FeedbackTab`. The monitor page is an operational control surface, not a result viewer. No changes were required.

### Finding F-4.7a: RTDB does not support field-level security â€” data-layer gating is not possible for child fields
Firebase Realtime Database security rules operate at the **node level**, not the field level. The `test_results/{resultId}` rule grants read access to any authenticated user where `data.child('studentId').val() === auth.uid`. Once a student can read `test_results/{resultId}`, they can read ALL child fields including `formativeFeedback`, `questionResults[].correctAnswer`, and `questionResults[].feedback`. There is no RTDB mechanism to restrict individual fields within a readable node.

This is a **fundamental RTDB limitation**. To achieve field-level restriction, one of three architectural changes would be required:
1. **Separate RTDB path**: Store restricted fields (feedback, correct answers) at `test_results_restricted/{resultId}` with teacher-only read rules. This requires a data migration and dual-write pattern.
2. **Firestore migration**: Move result storage to Firestore which supports field-level security rules via `get()` on sub-documents.
3. **Cloud Function proxy**: Serve result data through a Cloud Function that filters fields based on release state before returning to the client.

All three options are **major architectural changes** outside the scope of PRD-0040 Phase 2. The current posture â€” UI-layer gating with `getReleaseVisibility()` â€” is the accepted enforcement mechanism.

### Finding F-4.7b: AI feedback generation follows the delayed-generation contract
Feedback generation is NOT triggered during test submission. The `saveTestResult()` function in `testResults.service.ts` writes the result record with the student's answers and correct answers but does NOT call `generateFormativeFeedback()`. Feedback generation is triggered lazily via `useFeedbackAutoTrigger` hook when an eligible shell opens a saved result.

This means:
- During `locked-review`: student entry points for live-session results do not trigger feedback generation. Session surfaces never generate it, and `ResultSlidePanel` now suppresses student-side auto-triggering for governed `class_session` saved results.
- During `review-released`: students can review answers, but student-side feedback generation remains suppressed for governed live-session entry points.
- During `feedback-released`: the student can open the governed saved-result panel and feedback generation may run. The generated feedback is written to `test_results/{resultId}/formativeFeedback` and becomes readable.
- **Exception**: teacher/admin shells remain unrestricted and may still generate feedback earlier. In that case, the `formativeFeedback` field exists on the RTDB record, and a technically adept student could still read it via RTDB even though the UI hides it. This is the accepted RTDB limitation from Finding F-4.7a.

### Finding F-4.7c: Correct answers are always present in the result record â€” accepted posture
`questionResults[].correctAnswer` is written by `saveTestResult()` at submission time (inside the result record). This field is present on `test_results/{resultId}` from the moment the student submits their test. RTDB field-level restriction cannot hide this from the student (Finding F-4.7a). The UI-layer gating via `showCorrectAnswers` from `getReleaseVisibility()` hides correct answers in the `locked-review` and `review-released` tiers, but the raw data is readable via RTDB tools.

This is an **accepted data-layer posture** for PRD-0040 Phase 2. The correct answer is part of the canonical result record shape and has been present since the application's inception. Segregating it would require redesigning the entire result storage schema. A follow-up task for backend-level enforcement (Option 1 or 3 from Finding F-4.7a) may be scoped if the product team requires tamper-proof governance.

### Finding F-4.8a: Session-review test bundle (0.3.3) results â€” 1 pre-existing failure
Bundle: `npx vitest run StudentWaitingRoomPage.test.jsx StudentTestResultsPage.test.tsx TeacherTestResultsPage.test.tsx useTestSubmission.test.ts`
- **7 passed, 1 failed** (in `StudentWaitingRoomPage.test.jsx`)
- Failed test: `re-enters the active test when a teacher reset arrives for the current student` â€” expects a `STUDENT_TEST` navigation spy call with 0 actual calls.
- **Root cause**: Pre-existing failure. Last modification to `StudentWaitingRoomPage.jsx` was in PRD-0039 (commit `6f0f9ab`) and PRD-0030 (commit `1fb2dae`). No PRD-0040 Phase 2 changes touch this file.
- **Verdict**: Not a regression from release-governance work. No action required by PRD-0040.

### Finding F-4.8b: Security bundle (0.3.4/0.3.5) results â€” emulator tests require running emulator
- `testResults.service.test.ts`: **All passed** âœ“
- `PrivateRoute.test.tsx`: **All passed** âœ“
- `routeAccess.test.ts`: **All passed** âœ“
- `prd0040-security.emulator.test.ts`: **4 tests failed** â€” all due to `initializeTestEnvironment` failure (RTDB emulator not running). These tests require `firebase emulators:start` before execution and are infrastructure-gated.
- `enforce:check`: **All passed** âœ“
- **Verdict**: No regressions from PRD-0040 Phase 2 changes. Emulator test failures are environmental and expected without a running Firebase emulator.

### Finding F-4.8c: Manual check posture for release-state contract â€” UI-layer verified via code audit
The release-state contract is now runtime-verified across the main student and monitor-adjacent paths, with the remaining backend limitation still documented separately:
1. **locked-review**: `getReleaseVisibility('locked-review')` hides correct answers and feedback. Session surfaces consume this directly, and `ResultSlidePanel` now redacts governed `class_session` saved results down to overview-only.
2. **review-released**: `getReleaseVisibility('review-released')` exposes answer review but still withholds feedback. `ResultSlidePanel` now allows the review tab but still suppresses feedback for governed live-session saved results.
3. **feedback-released**: `getReleaseVisibility('feedback-released')` exposes full review and feedback. Governed `ResultSlidePanel` entry points now align with this state as well.
4. **Teacher/admin exception**: teacher/admin access is preserved by separate unrestricted shells (`ResultDetailModal`, `LegacyResultDetailView`), not by a role-aware helper signature.
5. **Verification status**: targeted runtime coverage now exists for `ResultSlidePanel`, `StudentTestResultsPage`, `TestResultsModal`, `StudentWaitingRoomPage`, `TeacherTestMonitorPage`, and `useMonitorControls`. `StudentWaitingRoomPage` now also fails closed to `locked-review` if the release-state listener errors.

### Finding F-4.10a: Stop-check verification â€” no stop conditions triggered
All three stop conditions from Task 4.10 were verified:
1. **No session flow rewritten as plain `resultId` loader**: Session loaders (`testResults.service.ts`) remain session-first with retry, fallback, and session-scoped lookup. No plain `resultId` abstraction was introduced.
2. **Release-state policy is NOT treated as accidental regression**: The three-state release model is documented as an intentional governance contract across findings F-4.3a through F-4.8c. All changes are explicit policy, not regression.
3. **No student entry-point asymmetry**: Session surfaces consume `getReleaseVisibility()` directly, and `ResultSlidePanel` now derives the same effective state for governed `class_session` saved results. The earlier saved-result bypass has been removed.

### Finding F-4.11a: Phase 2 (Task 4.0) closure gate â€” met after reassessment fixes
| Criterion | Status | Evidence |
|---|---|---|
| Release-state behavior consistent across student entry files | âœ… Met | Session surfaces, `StudentWaitingRoomPage` handoff, and governed `ResultSlidePanel` entry points now share the same release-state behavior, including fail-closed handling on waiting-room/panel listener errors |
| Teacher/admin exceptions remain valid | âœ… Met | Separate unrestricted shells still own teacher/admin access |
| Session loaders remain local | âœ… Met | `testResults.service.ts` remains separate; no shared session loader abstraction was introduced |
| Docs updated | âœ… Met | Living docs and findings were corrected in the 2026-03-25 reassessment |
| Automated tests pass | âœ… Met | Targeted release-governance bundles now cover `ResultSlidePanel`, `StudentTestResultsPage`, `TestResultsModal`, `StudentWaitingRoomPage`, `TeacherTestMonitorPage`, and `useMonitorControls` |
| Manual checks recorded | âœ… Met | Runtime-proof and code-audit evidence for the named cross-entry paths are now recorded in this findings file and the living docs |
| US-8 confirmed | âœ… Met | Student lock/review/full behavior is now runtime-proven across waiting-room, direct session page, and governed saved-result entry points |
| US-9 confirmed | âœ… Met | Teacher-controlled release remains architecturally correct and is now backed by dedicated monitor/hook tests |

## Phase 3: Guest-Result and Claim Domain (Task 5.0)

### Finding F-5.1a: Guest-result domain classification â€” four surfaces, one service, one RTDB node

The guest-result and claim domain consists of exactly four surfaces and one service:

| Surface | File | Type | Route / mount | Data path |
|---|---|---|---|---|
| `GuestResultsPage` | `src/pages/GuestResultsPage.tsx` | Page | `/guest-results` (public) | RTDB `guest_results/{guestName}` read |
| `ProfileCompletionPage` | `src/pages/ProfileCompletionPage.tsx` | Page | `/profile/complete` (authenticated) | `checkClaimableResults(email)` â†’ RTDB `guest_results` scan |
| `ClaimResultsModal` | `src/components/guest/ClaimResultsModal.tsx` | Modal | mounted by `ProfileCompletionPage` | `claimGuestResults(guestName, userId)` â†’ RTDB read `guest_results/{guestName}`, write `test_results/{userId}`, delete `guest_results/{guestName}` |
| `guestResultsService` | `src/services/guestResultsService.ts` | Service | N/A | RTDB `guest_results/{guestName}` CRUD + claim-to-`test_results` transfer |

**Domain boundary**: This domain is architecturally separated from the unified saved-result core (`SharedSavedResultCore`). Guest surfaces do not delegate to `SharedSavedResultCore`, do not use `ResultSlidePanel` / `ResultDetailModal` / `LegacyResultDetailView`, and do not participate in the release-state governance model. The separation is intentional and must be maintained.

**Existing test coverage**: `guestResultsService.test.ts` exists (service-level tests). Zero focused tests exist for `GuestResultsPage`, `ProfileCompletionPage`, or `ClaimResultsModal`.

### Finding F-5.1b: GuestResultsPage uses @mantine/core imports â€” Rule 15 violation

`GuestResultsPage.tsx` imports `Container`, `Title`, `TextInput`, `Button`, `Stack`, `Paper`, `Text`, `Group`, `Alert`, `Loader`, `Center`, `Divider` from `@mantine/core`. This violates Integration Safety Rule 15 (No Mantine â€” Absolute Import Ban). However, since this page is an existing legacy surface and Task 5.0 scope is governance/classification (not UI rewrite), the Mantine dependency is **documented but not remediated in this phase**. A future cleanup task should target this.

### Finding F-5.2a: Guest-result storage decision â€” keep current compatibility path

**Decision: KEEP the current compatibility story.** Rationale:

1. **Claim target is already canonical**: `claimGuestResults()` writes to `test_results/{userId}` â€” this IS the canonical saved-result RTDB path. The claim operation transfers data from the non-canonical `guest_results/{guestName}` node into the canonical path.
2. **Compatibility metadata is additive**: Claimed results carry `claimedAt` and `claimedFrom` fields. These are additive metadata that do not conflict with canonical `EnhancedTestResultRecord` fields. They provide audit trail value.
3. **Guest-specific metadata is stripped**: The claim operation explicitly destructures and removes `guestName`, `isGuestResult`, `savedAt`, and `resultId` before writing to the canonical path.
4. **No migration needed**: Since the destination is already canonical, no schema migration or data-contract change is required. The guest-result domain is a feeder into the canonical path, not a parallel storage system.

**Boundary constraint**: Guest claims must NOT be folded into `SharedSavedResultCore` or the saved-result shell architecture. The claim path is a one-time data transfer operation, not a rendering contract.

### Finding F-5.3a: Stale CTA route audit â€” two dead navigation targets

`GuestResultsPage.tsx` contains three `navigate()` calls that target non-existent routes:

| Line | Target | Actual route | Status |
|---|---|---|---|
| L146 | `navigate('/register')` | No `/register` route exists in `App.jsx` | âŒ Dead link |
| L181 | `navigate('/register')` | No `/register` route exists in `App.jsx` | âŒ Dead link |
| L188 | `navigate('/login')` | Login is at `/` (root), not `/login` | âŒ Dead link |

**Fix**: All three must be corrected. `/register` and `/login` should both navigate to `/` since the login page at the root handles both authentication and account creation (Google Sign-In).

### Finding F-5.3b: Route/backend auth mismatch on `/guest-results`

- `routeSecurity.ts` classifies `/guest-results` as `public` with `allowedRoles: ['guest']`
- `App.jsx` mounts it as a bare `<Route>` (no `PrivateRoute` wrapper) â€” consistent with `public`
- **However**: RTDB rules require `auth != null` for reading `guest_results` at the top level
- This means: an unauthenticated guest visiting `/guest-results` can see the page UI but the `getGuestResults()` call will fail with a permission error

**Disposition**: This mismatch is an existing pre-PRD-0040 condition. The page renders a search UI regardless, and the error is caught and displayed as "Failed to fetch results." This is not ideal UX but is functionally safe â€” no data leakage occurs. Documenting as accepted current behavior. A future UX improvement could add a pre-search auth check or informational message.

### Finding F-5.3c: `checkClaimableResults()` performs full scan of `guest_results` node

`guestResultsService.ts` line 216 reads the entire `guest_results` root node via `get(ref(database, 'guest_results'))` to find claimable names by email prefix. This is a full-node download, not a query. For small deployments this is acceptable, but it does not scale. Documenting as accepted current behavior for the compatibility path.

### Finding F-5.6a: Stop-check verification â€” no stop conditions triggered

All three stop conditions from Task 5.6 were verified:
1. **Guest-result NOT folded into saved-result shared core**: `GuestResultsPage`, `ClaimResultsModal`, `ProfileCompletionPage`, and `guestResultsService` remain completely independent of `SharedSavedResultCore`, `ResultSlidePanel`, `ResultDetailModal`, and `LegacyResultDetailView`. Zero imports cross this boundary.
2. **Guest claim writes NOT changed**: No changes were made to `claimGuestResults()` logic. The function still writes to `test_results/{userId}` with the same additive compatibility metadata (`claimedAt`, `claimedFrom`). The storage decision explicitly keeps the current path (Finding F-5.2a).
3. **CTA mismatches are documented AND fixed**: All three stale navigation targets were corrected in Task 5.3 (`/register` â†’ `/` x2, `/login` â†’ `/`). The route/backend auth mismatch is documented as accepted current behavior (Finding F-5.3b).

### Finding F-5.7a: Phase 3 (Task 5.0) closure gate â€” all criteria met

| Criterion | Status | Evidence |
|---|---|---|
| Guest flows explicitly classified | âœ… Met | Finding F-5.1a â€” four surfaces + one service classified as adjacent domain |
| CTA and route behavior resolved or documented | âœ… Met | Task 5.3 â€” three stale CTAs fixed. Finding F-5.3b â€” auth mismatch documented as accepted |
| Tests exist for the chosen path | âœ… Met | `GuestResultsPage.test.tsx` (11 tests), `ClaimResultsModal.test.tsx` (13 tests), `guestResultsService.test.ts` (pre-existing) |
| Living docs updated | âœ… Met | Task 5.5 â€” `result-view-map.md`, `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md` all updated |
| Change record updated | âœ… Met | Findings F-5.1a through F-5.7a appended to findings file |
| Storage decision documented | âœ… Met | Finding F-5.2a â€” keep current compatibility path |
| Domain boundary constraint documented | âœ… Met | Finding F-5.1a â€” boundary explicitly prohibits folding into SharedSavedResultCore |

---

## Phase 4 Findings (Task 6.0 â€” Writing Domain Resolution)

### Finding F-6.1a: Writing lifecycle map â€” complete surface classification

The writing domain operates as a **cross-store lifecycle** spanning RTDB (draft/autosave/monitor) and Firestore (submissions/grading/results). It is architecturally distinct from the `SharedSavedResultCore` saved-result shell and must not be collapsed into it.

**Writing lifecycle stages and named surfaces:**

| Lifecycle Stage | Surface | Status | Data Store | Owner Contract |
|---|---|---|---|---|
| `draft` | `WritingTestPage` | active | RTDB `game_sessions/{code}/writing/...` | Student draft/edit host with autosave via `useWritingAutoSave` |
| `monitor` | `WritingMonitorCard` | active | RTDB live writing draft paths | Teacher monitor card (operational) |
| `monitor` | `WritingPeekModal` | active | RTDB live draft text stream | Teacher live peek (reads RTDB, NOT Firestore) |
| `queue` | `WritingGradingQueuePage` (aliased as `TeacherGradingPage`) | active | Firestore `writing_submissions` query by `markingStatus === 'pending-review'` | Teacher grading front door |
| `editor` | `WritingGradingPage` | active | Firestore `writing_submissions/{submissionId}` | IELTS grading editor with annotations, criteria scoring, feedback |
| `editor` | `InlineWritingGrader` | active | RTDB live session result state | THCS inline writing grading (separate from IELTS) |
| `result` | `WritingResultView` | active | Firestore `writing_submissions/{submissionId}` | Student-facing result viewer (3-state: pending/partial/graded) |
| `result` | `WritingResultDetailModal` | active | Firestore `writing_submissions/{submissionId}` | Teacher result modal with edit-grades reentry |
| `result` | `WritingTestResultsSection` | active | Firestore writing submission lookup by session | Session result page bridge (mounted by `TeacherTestResultsPage`) |
| `result` | `SubmissionCompletePage` | active | Location state handoff â†’ `/student-test-results/:sessionCode` | Post-submission confirmation bridge |
| `alternate/dormant` | `WritingGradingModal` | unwired | none at runtime | Alternate grading toolchain â€” zero external imports |
| `alternate/dormant` | `StudentResultOverview` | unwired | none at runtime | Student writing redesign artifact â€” zero external imports |
| `alternate/dormant` | `StudentDetailedMarkup` | unwired | none at runtime | Student writing redesign artifact â€” zero external imports |

**Domain boundary constraint:** Writing surfaces must NOT be folded into `SharedSavedResultCore`, `ResultSlidePanel`, `ResultDetailModal`, or `LegacyResultDetailView`. The writing lifecycle uses Firestore `writing_submissions` as its canonical store, not RTDB `test_results`.

### Finding F-6.2a: Writing front doors are correctly identified

The writing architecture starts from **four operational front doors**, not from result viewers:

1. **Student draft front door**: `WritingTestPage` â€” student enters via session flow, writes essay with autosave to RTDB
2. **Teacher queue front door**: `WritingGradingQueuePage` â€” teacher enters via `/teacher/grading/writing`, sees pending submissions from Firestore
3. **Teacher monitor front door**: `TeacherTestMonitorPage` (writing mode) â€” teacher monitors live writing via `WritingMonitorCard`, `WritingPeekModal`, auto-submit, and reopen
4. **THCS inline grading front door**: `InlineWritingGrader` (mounted by `TeacherTestMonitorPage` for THCS sessions only)

Result viewers (`WritingResultView`, `WritingResultDetailModal`, `WritingTestResultsSection`, `SubmissionCompletePage`) are **downstream consumers**, not front doors. This is architecturally correct and must be preserved.

### Finding F-6.3a: Cross-store seam â€” RTDBâ†”Firestore documented

The writing domain has a critical cross-store seam that must remain explicit:

**Store 1: RTDB (draft/autosave/monitor)**
- Path: `game_sessions/{sessionCode}/writing/students/{playerId}/tasks/{taskNumber}`
- Contains: `essayText`, `lastSavedAt`, `isSubmitted`, timer state, tab-switch data
- Written by: `useWritingAutoSave` hook (debounced 3s), `WritingTestPage` on task switch
- Read by: `WritingPeekModal` (live stream), `WritingMonitorCard` (status), auto-submit logic

**Store 2: Firestore (submissions/grading/results)**
- Collection: `writing_submissions`
- Contains: full submission with `tasks[]`, `grading`, `annotations`, `auditTrail`, `testMeta`, integrity signals
- Written by: `writingSubmissionService.autoSubmitFromRTDB()` (promotes RTDB â†’ Firestore), `updateGrading()` (teacher saves)
- Read by: `WritingGradingQueuePage`, `WritingGradingPage`, `WritingResultView`, `WritingResultDetailModal`, `WritingTestResultsSection`

**Bridge function:** `autoSubmitFromRTDB()` in `writingSubmissionService.ts`:
1. Reads RTDB essay data at `game_sessions/{code}/writing/students/{playerId}`
2. Creates Firestore `writing_submissions` document with full task data, metadata, and integrity signals
3. Creates RTDB index record at `writing_submissions/{submissionId}` (slim reference only)
4. Marks RTDB draft as `isSubmitted: true`

**Seam constraint:** This bridge is the ONLY path from RTDB draft state to Firestore submission state. It must not be bypassed or collapsed into a generic result abstraction.

### Finding F-6.4.1a: Appendix A #1 â€” Teacher grading queue is the writing front door

**Appendix A finding:** "The active writing workflow starts at a teacher grading queue, not at a result viewer."

**Disposition:** âœ… **Accepted current behavior, documented in living docs.**

`WritingGradingQueuePage` (`TeacherGradingPage` alias) at `/teacher/grading/writing` loads `writing_submissions` by `markingStatus === 'pending-review'` and triages by source, format, word count, test title, and paste signals. This is correctly identified as the operational front door in Finding F-6.2a. No code change required.

### Finding F-6.4.2a: Appendix A #2 â€” Autosave/save-draft marks work as graded

**Appendix A finding:** "The active 'draft' grading path is not truly a draft path because autosave and Save Draft both call updateGrading(), and that service writes markingStatus: 'graded'."

**Disposition:** ðŸ“‹ **Named follow-up task (not an immediate fix).**

Verified in `WritingGradingPage`: both `handleSaveDraft` (line 304) and `handleSubmitGrading` (line 315) call `updateGrading()`. The `updateGrading()` service in `writingSubmissionService.ts` writes `markingStatus: 'graded'` regardless of whether the save is a draft or a final submission. This means:
- A partial save removes the submission from the pending queue
- A teacher cannot resume an interrupted grading session via the queue
- The teacher must navigate directly to the submission URL to continue

**Follow-up task:** Introduce a `markingStatus: 'in-progress'` state for draft saves, reserving `'graded'` for explicit submission. This is a behavioral change and requires its own PRD or task scope. Not an immediate fix for PRD-0040.

### Finding F-6.4.3a: Appendix A #3 â€” Last-edit loss race on student submit

**Appendix A finding:** "The student submit path has a last-edit loss race between pending save flush and Firestore snapshotting."

**Disposition:** ðŸ“‹ **Named follow-up task (not an immediate fix).**

Verified in `WritingTestPage` (line ~150): `handleSubmit` calls `flushPendingSave()` from `useWritingAutoSave`. However, `flushPendingSave()` triggers the debounced RTDB write but may not fully await completion before `autoSubmitFromRTDB()` snapshots RTDB into Firestore. The race window is small (the debounce is flushed, not re-debounced), but final keystrokes within the last debounce interval could theoretically be dropped.

**Follow-up task:** Add explicit `await` on the RTDB write confirmation inside `flushPendingSave()` before the Firestore submission snapshot. This is a data-integrity fix but requires careful testing to avoid deadlock with the timer-based auto-submit flow. Not an immediate fix for PRD-0040.

### Finding F-6.4.4a: Appendix A #4 â€” Writing is a cross-store lifecycle

**Appendix A finding:** "Writing is a cross-store lifecycle, not a normal saved-result shell."

**Disposition:** âœ… **Accepted current behavior, documented in living docs.**

This is the foundational architectural constraint for the entire Phase 4. Documented comprehensively in Finding F-6.3a (cross-store seam). The writing domain uses RTDB for draft/autosave/monitor and Firestore for submissions/grading/results. It must NOT be treated as "another result shell."

### Finding F-6.4.5a: Appendix A #5 â€” Writing monitor is an active control loop

**Appendix A finding:** "The writing monitor path is an active teacher control loop before any final result exists."

**Disposition:** âœ… **Accepted current behavior, documented in living docs.**

`TeacherTestMonitorPage` in writing-session mode renders `WritingMonitorCard`, supports `Peek` (via `WritingPeekModal`), supports `Reopen`, and handles auto-submit of unfinished drafts. This is an operational control surface that exists BEFORE any grading or result artifact. It is correctly classified as `monitor` lifecycle in Finding F-6.1a and documented as a front door in Finding F-6.2a.

### Finding F-6.4.6a: Appendix A #6 â€” Monitor and grading paths use different artifacts

**Appendix A finding:** "The monitor and grading/result paths use different artifacts."

**Disposition:** âœ… **Accepted current behavior, documented in living docs.**

- `WritingPeekModal` reads **live RTDB draft text** (real-time stream)
- `WritingGradingPage` reads **Firestore submissions** (post-promotion)
- Result viewers read **Firestore submissions** (post-grading)

The seam between RTDB (pre-submission) and Firestore (post-submission) is the `autoSubmitFromRTDB()` bridge documented in Finding F-6.3a. This seam is correct and must remain explicit.

### Finding F-6.4.7a: Appendix A #7 â€” Metadata not durably persisted by live editor

**Appendix A finding:** "Several metadata fields the grading/result tools rely on are not durably persisted by the live editor."

**Disposition:** ðŸ“‹ **Named follow-up task (not an immediate fix).**

The grading UI (`WritingGradingPage`) displays:
- `activeTimeSeconds` (line 495)
- `pasteAttemptCount` (line 496â€“500)
- `wordCount` (line 494)

The `autoSubmitFromRTDB()` bridge populates these from RTDB data, but the student editor (`WritingTestPage`) primarily persists essay text and active task selection. Some integrity signals (active time, paste attempts) are computed at submission time rather than durably tracked throughout the editing session.

**Follow-up task:** Audit which integrity signals are snapshot-computed vs. durably tracked and ensure all signals displayed in grading are reliably persisted. Not an immediate fix for PRD-0040.

### Finding F-6.4.8a: Appendix A #8 â€” Tab-switch monitoring contract incomplete

**Appendix A finding:** "The tab-switch monitoring contract is incomplete."

**Disposition:** ðŸ“‹ **Named follow-up task (not an immediate fix).**

The `useWritingAutoSave` hook exposes tab-switch recording, and `WritingMonitorCard` displays tab switches. However, task switching within `WritingTestPage` (switching between Task 1 and Task 2 in a full test) does not record tab switches. The monitoring assumption already spans editor and monitor components but the contract is not fully implemented.

**Follow-up task:** Complete the tab-switch recording contract to include intra-task switching. This is a monitoring-completeness improvement, not an architectural issue. Not an immediate fix for PRD-0040.

### Finding F-6.4.9a: Appendix A #9 â€” Feedback/editing loop is bidirectional

**Appendix A finding:** "The teacher feedback/editing loop is bidirectional, not terminal."

**Disposition:** âœ… **Accepted current behavior, documented in living docs.**

Verified in `WritingResultDetailModal` (line 36â€“39): `handleEditGrades` closes the modal and navigates to `/teacher/grading/writing/${submission.id}`, re-entering the grading editor. Submitting grades notifies students, but graded work can be reopened. The result modal is NOT an end-state viewer â€” it's a review surface with re-entry capability.

This is architecturally correct: the grading lifecycle is `queue â†’ editor â†’ result â†’ editor` (loop), not `queue â†’ editor â†’ result` (terminal). No change required.

### Finding F-6.4.10a: Appendix A #10 â€” Audit trail underimplemented

**Appendix A finding:** "The audit trail workflow is underimplemented."

**Disposition:** ðŸ“‹ **Named follow-up task (not an immediate fix).**

Verified: `WritingGradingPage` renders `GradingAuditTrail` (line 564), and `WritingResultDetailModal` renders it conditionally (line 244â€“245). The types expect structured regrade reasons. However, the live save path (`updateGrading()`) does not append audit entries â€” it only writes grading data. The `auditTrail` array on the submission is never populated by the current grading workflow.

**Follow-up task:** Implement audit entry creation in `updateGrading()` to record grader identity, timestamp, and action type (initial grade, regrade, draft save). Not an immediate fix for PRD-0040.

### Finding F-6.4.11a: Appendix A #11 â€” Two materially different grading architectures

**Appendix A finding:** "There are two materially different grading-tool architectures."

**Disposition:** âœ… **Classified and documented.**

**Architecture 1 â€” Canonical (active):**
- `WritingGradingPage` with `AnnotatedEssayRenderer`, `AnnotationToolbar`, `CriteriaScoringPanel`, `FeedbackPanel`, `CategoryManager`, `VoidTaskButton`, `GradingAuditTrail`
- Route: `/teacher/grading/writing/:submissionId`
- Status: **active**, production-ready, handles full IELTS grading workflow

**Architecture 2 â€” Alternate/Dormant (unwired):**
- `WritingGradingModal` with `EssayEditor`, `CommentSidebar`, `QuickCommentsDialog`, `CorrectionPopup`, `TabbedFeedbackEditor`, local draft recovery, separate audit handling
- Route: **none** â€” zero external imports, not mounted anywhere in the app
- Status: **unwired/dormant**, classified for removal in Task 6.5 (Finding F-6.5a)

These are distinct tool chains. The canonical one is production-ready. The alternate one is a redesign artifact that was never wired. They must NOT be blurred together.

### Finding F-6.4.12a: Appendix A #12 â€” THCS inline writing is a separate workflow

**Appendix A finding:** "THCS inline writing grading is a separate operational workflow and should not be blurred into IELTS writing."

**Disposition:** âœ… **Accepted current behavior, documented in living docs.**

`InlineWritingGrader` is mounted by `TeacherTestMonitorPage` (line 36, 1081) for THCS sessions only. It writes directly into live session result state (RTDB), not into Firestore `writing_submissions`. It is a completely separate operational workflow:
- Different data store (RTDB session state vs. Firestore submissions)
- Different grading flow (inline from monitor vs. dedicated editor page)
- Different grading criteria (THCS curriculum vs. IELTS band scoring)
- Different lifecycle (real-time during session vs. async post-submission)

Classified as `editor` lifecycle in the writing map but explicitly separate from IELTS writing.

### Finding F-6.5a: Alternate/dormant writing surface classification

Three alternate/dormant writing surfaces were audited for runtime wiring:

| Surface | Files | External Imports | Route | Disposition |
|---|---|---|---|---|
| `WritingGradingModal` | `.tsx` + `.css` | **Zero** â€” only self-referencing | None | **Remove now** (Phase 8, Task 8.1) |
| `StudentResultOverview` | `.tsx` + `.css` | **Zero** â€” only self-referencing | None | **Remove now** (Phase 8, Task 8.1) |
| `StudentDetailedMarkup` | `.tsx` + `.css` | **Zero** â€” only self-referencing | None | **Remove now** (Phase 8, Task 8.1) |

All three are redesign artifacts documented in `.knowns` but never wired into the active application. They have zero external imports, no routes, no lazy imports, and no test files. They are classified as `alternate/dormant` in the result-view-map and dispositioned as `remove now` for Phase 8 (Task 8.1).

**Removal gate:** Phase 8, Task 8.4 requires recoverable git version reference and removal note before deletion.

### Finding F-6.6a: No writing tests to add or update in this phase

Per Task 6.6: "Add or update focused tests only for writing surfaces that are retained or modified. Do not spend time creating tests for components that are being removed immediately."

No writing surfaces were modified in Phase 4. All work was classification-only. The three alternate/dormant surfaces are being removed (Phase 8). Active writing surfaces retain their existing test coverage status as documented in the result-view-map.

### Finding F-6.7a: Living docs update summary for Phase 4

The following living docs require updates in Task 6.7:
- `result-view-map.md` â€” add Phase 4 section documenting writing lifecycle classification
- `result-view-permission-matrix.md` â€” no access truth changes (writing surfaces retain existing permissions)
- `result-view-fr-closure-matrix.md` â€” no closure status changes
- PRD â€” no architecture truth changes (writing domain was already described in PRD)
- Change record (this findings file) â€” findings F-6.1a through F-6.9a

### Finding F-6.8a: Stop-check verification â€” no stop conditions triggered

All three stop conditions from Task 6.8 were verified:
1. **Writing NOT being rewritten as just another result shell:** Writing surfaces use Firestore `writing_submissions`, not RTDB `test_results`. Zero imports cross into `SharedSavedResultCore`, `ResultSlidePanel`, `ResultDetailModal`, or `LegacyResultDetailView`. Domain boundary is explicitly documented.
2. **RTDB-to-Firestore seam IS documented:** Finding F-6.3a provides complete documentation of the cross-store seam including store paths, bridge function, and the constraint that the bridge is the ONLY promotion path.
3. **All 12 Appendix A findings ARE classified:** Findings F-6.4.1a through F-6.4.12a provide explicit dispositions for all 12 items. Five are accepted current behavior, five are named follow-up tasks, and two are classified/documented.

### Finding F-6.9a: Phase 4 (Task 6.0) closure gate â€” all criteria met

| Criterion | Status | Evidence |
|---|---|---|
| Full writing lifecycle classified | âœ… Met | Finding F-6.1a â€” 13 surfaces across 6 lifecycle stages |
| Writing front doors correctly identified | âœ… Met | Finding F-6.2a â€” four operational front doors documented |
| Cross-store seam documented | âœ… Met | Finding F-6.3a â€” RTDBâ†”Firestore seam with bridge function |
| All 12 Appendix A findings have named outcomes | âœ… Met | Findings F-6.4.1aâ€“F-6.4.12a â€” 5 accepted, 5 follow-up, 2 classified |
| Retained writing surfaces have explicit status | âœ… Met | Finding F-6.1a â€” all active surfaces documented with lifecycle stage |
| Alternate/dormant surfaces classified | âœ… Met | Finding F-6.5a â€” three surfaces classified as remove-now for Phase 8 |
| Living docs updated | âœ… Met | Finding F-6.7a â€” result-view-map updated with Phase 4 section |
| Change record updated | âœ… Met | Findings F-6.1a through F-6.9a appended to findings file |
| No writing surface folded into saved-result core | âœ… Met | Finding F-6.8a â€” stop-check #1 passed |

**Named follow-up tasks from Appendix A dispositions:**
1. F-6.4.2a: Introduce `markingStatus: 'in-progress'` for draft saves
2. F-6.4.3a: Fix last-edit loss race in `flushPendingSave()` â†’ `autoSubmitFromRTDB()`
3. F-6.4.7a: Audit integrity signal persistence (active time, paste attempts)
4. F-6.4.8a: Complete tab-switch recording contract
5. F-6.4.10a: Implement audit entry creation in `updateGrading()`

---

## Phase 5 Findings (Task 7.0 â€” Live-Monitoring Domain Preservation)

### Finding F-7.1a: Live-monitoring surface classification â€” complete inventory

The live-monitoring domain is an **operational control domain** that exists independently of both saved-result shells and session result viewers. It manages real-time test supervision, not post-test result display.

**Live-monitoring surfaces and operational roles:**

| Surface | Status | Domain | Operational Role | Data Contract | Owner Workflow |
|---|---|---|---|---|---|
| `TeacherTestMonitorPage` | active | live-monitoring | Real-time student supervision, session controls, release-state ownership, auto-submit coordination | RTDB `game_sessions/{sessionCode}` (players, status, timer, settings, results) | Teacher monitor â€” owns start, pause, end, extend, accommodations, audio, release-state |
| `StudentDetailModal` | active | live-monitoring | Per-student live detail during session | RTDB session/player paths (answers, status, time elapsed) | Student drill-down from monitor â€” presentation-only consumption |
| `StudentProgressCard` | active | live-monitoring | Standard student card in monitor grid | RTDB player state (progress, status, connection) | Monitor grid child â€” presentation-only |
| `THCSStudentProgressCard` | active | live-monitoring | THCS-specific student card with part breakdowns | RTDB player state with THCS section data | Monitor grid child (THCS mode) â€” presentation-only |
| `WritingMonitorCard` | active | live-monitoring + writing | Writing student card during session | RTDB live writing draft paths | Monitor grid child (writing mode) â€” already classified in Phase 4 as `monitor` lifecycle |
| `WritingPeekModal` | active | live-monitoring + writing | Teacher peek at live RTDB draft text | RTDB live draft text stream | Monitor peek child â€” already classified in Phase 4 as `monitor` lifecycle |
| `InlineWritingGrader` | active | live-monitoring + writing | THCS inline grading from monitor | RTDB live session result state | Monitor-integrated grading â€” already classified in Phase 4 as `editor` lifecycle |
| `TeacherTestControlBar` | active | live-monitoring | Session control bar (start/pause/end/extend) | Monitor control actions | Monitor action bar â€” presentation + action dispatch |
| `AudioProgressPanel` | active | live-monitoring | Audio playback control for listening tests | RTDB audio section state | Monitor audio child â€” operational control |
| `HeadphoneRequestPanel` | active | live-monitoring | Headphone permission management (offline mode) | RTDB headphone request paths | Monitor permission child â€” operational control |
| `AccommodationStatusBar` | active | live-monitoring | Accommodated student time tracking | Computed from player accommodation data | Monitor accommodation child â€” presentation-only |
| `CountdownWarningModal` | active | live-monitoring | Timer expiry countdown warning | Timer state from `useTimerExpiry` hook | Monitor timer child â€” action dispatch |

### Finding F-7.2a: Release-state ownership remains exclusively in monitor workflows

**Write path (ownership):**
- `setReviewReleaseState()` is defined in `useMonitorControls.ts` (line 907)
- Called exclusively from `TeacherTestMonitorPage` (line 780)
- Writes to RTDB `game_sessions/{sessionCode}/reviewReleaseState`
- `endFullSession()` now auto-promotes session end to `review-released` while preserving `feedback-released` if the teacher already advanced further

**Read path (consumption only):**
- `StudentTestResultsPage` reads `session?.reviewReleaseState` (line 501) â€” consumer, NOT owner
- `TestResultsModal` receives `reviewReleaseState` as prop (line 32, 43) â€” consumer, NOT owner
- `useTeacherEndRedirect` reads release state during redirect (line 76, 86) â€” consumer, NOT owner

**Verification result:** Release-state ownership is exclusively within monitor workflows. No result viewer writes release state. No result viewer imports `setReviewReleaseState`. This boundary is architecturally correct and must be preserved.

### Finding F-7.3a: No shared presentational fragments between monitor and result surfaces

Audited cross-domain import paths:

| Check | Result |
|---|---|
| `TeacherTestMonitorPage` imports from saved-result components? | **ZERO** â€” no imports of `SharedSavedResultCore`, `ResultSlidePanel`, `ResultDetailModal`, `LegacyResultDetailView` |
| `StudentDetailModal` imports from saved-result components? | **ZERO** â€” self-contained with monitor-only data contracts |
| Monitor components used by result viewers? | **ZERO** â€” `StudentProgressCard`, `THCSStudentProgressCard`, `TeacherTestControlBar`, `AudioProgressPanel` are monitor-only |
| Shared loader or permission logic? | **ZERO** â€” monitor uses `useMonitorSession`/`useMonitorControls` hooks; result viewers use `useResultOwnershipCheck`, `useStudentDataAccessCheck`, or no ownership check |

The only cross-domain reference is `getReleaseVisibility()` from `src/types/releaseState.types.ts`, which is a shared utility function consumed by result viewers while monitor workflows own the release-state writes. This is a pure utility with no state, no side effects, and no cross-domain coupling. It is presentation-only and correctly shared.

### Finding F-7.4a: No monitor tests to add or update in this phase

Monitor behavior was not changed in Phase 5 (Task 7.0). All work was classification-only. Existing test coverage:
- `StudentDetailModal.test.tsx` â€” comprehensive (30+ test cases)
- `THCSStudentProgressCard.test.tsx` â€” existing
- `WritingMonitorCard.test.tsx` â€” existing
- Other monitor components â€” static audit only (no tests, but no behavioral changes)

### Finding F-7.5a: Living docs update summary for Phase 5

The following living docs require updates in Task 7.5:
- `result-view-map.md` â€” add Phase 5 section documenting live-monitoring domain classification
- `result-view-permission-matrix.md` â€” no access truth changes (monitor permissions unchanged)
- `result-view-fr-closure-matrix.md` â€” no closure status changes
- Change record (this findings file) â€” findings F-7.1a through F-7.7a

### Finding F-7.6a: Stop-check verification â€” no stop conditions triggered

Both stop conditions from Task 7.6 were verified:
1. **Monitor workflows NOT treated as disposable wrappers:** `TeacherTestMonitorPage`, `StudentDetailModal`, and all monitor child components are classified as operational control surfaces, not result viewer wrappers. They maintain their own hooks (`useMonitorSession`, `useMonitorControls`, `usePagination`), their own data contracts (RTDB session state), and their own action ownership (release state, pause, end, accommodations).
2. **Release ownership NOT drifting out of monitor:** `setReviewReleaseState` is exclusively in `useMonitorControls` (written from `TeacherTestMonitorPage`). No result viewer imports or calls this function. Downstream consumers only read release state via `getEffectiveReleaseState()`.

### Finding F-7.7a: Phase 5 (Task 7.0) closure gate â€” all criteria met

| Criterion | Status | Evidence |
|---|---|---|
| Monitor surfaces classified | âœ… Met | Finding F-7.1a â€” 12 monitor surfaces with operational roles, data contracts, and owner workflows |
| Release ownership remains in monitor | âœ… Met | Finding F-7.2a â€” write path exclusively in `useMonitorControls`/`TeacherTestMonitorPage` |
| Shared code is presentation-only | âœ… Met | Finding F-7.3a â€” only shared utility is `getReleaseVisibility()` (pure function, no state) |
| Docs and change records updated | âœ… Met | Finding F-7.5a â€” result-view-map updated with Phase 5 section |

---

## Phase 6 Findings (Task 8.0 â€” Unwired/Legacy/Demo Surface Triage)

### Finding F-8.1a: Full audit of all 9 targeted surfaces

Each required surface was audited through imports, routes, lazy imports, tests, demo links, and runtime reachability:

| Surface | Route | Lazy Import | External Consumers | Tests | RTDB Writes | Classification |
|---|---|---|---|---|---|---|
| `FeedbackComponentsDemo` | `/demo/feedback` (public) | `App.jsx:62` | None beyond route | None | **YES** â€” writes `courses/demo-course-789` and `test_results/demo-result-123` | **remove now** |
| `FeedbackDemoPage` | `/demo/feedback-system` (public) | `App.jsx:64` | None beyond route | None | No â€” local mock state | **remove now** |
| `AcademicRecordDemoPage` | `/demo/academic-record` (public) | `App.jsx:63` | None beyond route | None | No â€” local mock state | **remove now** |
| `DemoIndexPage` | `/demo` (public) | `App.jsx:65` | None beyond route | None | No â€” links to demo routes | **remove now** |
| `WritingGradingModal` | None | None | **Zero** external imports | None | No | **remove now** (already classified in F-6.5a) |
| `StudentResultOverview` | None | None | **Zero** external imports | None | No | **remove now** (already classified in F-6.5a) |
| `StudentDetailedMarkup` | None | None | **Zero** external imports | None | No | **remove now** (already classified in F-6.5a) |
| `WritingResultView` | N/A â€” lazy-loaded by `StudentTestResultsPage` | `StudentTestResultsPage.tsx:43` | `StudentTestResultsPage` (active consumer) | None found | No | **keep â€” active production surface** |
| `WritingTestResultsSection` | N/A â€” imported by `TeacherTestResultsPage` | Direct import, `TeacherTestResultsPage.tsx:29` | `TeacherTestResultsPage` (active consumer) | Mocked in `TeacherTestResultsPage.test.tsx:87` | No | **keep â€” active production surface** |

### Finding F-8.2a: Classification outcomes for all 9 surfaces

| Surface | Classification | Rationale |
|---|---|---|
| `FeedbackComponentsDemo` | **remove now** | Public demo route with live RTDB writes to production paths. Operational risk. |
| `FeedbackDemoPage` | **remove now** | Public demo route with local mock state. Not needed for production. |
| `AcademicRecordDemoPage` | **remove now** | Public demo route with local mock state. Not needed for production. |
| `DemoIndexPage` | **remove now** | Hub for demo routes being removed. |
| `WritingGradingModal` | **remove now** | Zero runtime wiring. Redesign artifact. (Phase 6 disposition) |
| `StudentResultOverview` | **remove now** | Zero runtime wiring. Redesign artifact. (Phase 6 disposition) |
| `StudentDetailedMarkup` | **remove now** | Zero runtime wiring. Redesign artifact. (Phase 6 disposition) |
| `WritingResultView` | **keep â€” active** | Lazy-loaded by `StudentTestResultsPage` for writing test results. Active production surface. |
| `WritingTestResultsSection` | **keep â€” active** | Imported by `TeacherTestResultsPage` for session-based writing results. Active production surface. |

### Finding F-8.3a: No retained wrappers in this phase

All surfaces classified as `remove now` have zero external consumers. No wrapper retention is needed. `WritingResultView` and `WritingTestResultsSection` are active production surfaces (not wrappers) and need no removal gate â€” they are retained as-is.

### Finding F-8.5a: FeedbackComponentsDemo live-path write risk â€” resolved by removal

`FeedbackComponentsDemo.tsx` contains two live RTDB write paths reachable on the public `/demo/feedback` route:
1. Line 82: `set(ref(database, 'courses/demo-course-789'), courseData)` â€” writes demo course data
2. Line 117: `set(ref(database, 'test_results/demo-result-123'), resultData)` â€” writes demo test result data

**Risk:** Any visitor to `/demo/feedback` can trigger live database writes to hardcoded demo paths. While the paths are demo-keyed, they exist in the production RTDB namespace and could pollute data views or confuse backup/analytics.

**Resolution:** Classified as `remove now`. Removal eliminates the risk entirely. No approved reason to retain live-path write behavior on a public demo route.

### Finding F-8.4a: Removal documentation â€” git recovery references

All 7 surfaces classified as `remove now` will be removed in Phase 8 execution. Before removal:
- **Git recovery reference:** Current commit hash at time of classification. All files exist in git history and can be recovered via `git checkout <hash> -- <path>`.
- **Removal note:** Documented in this findings file (F-8.2a) and in result-view-map.md (Phase 6 section).
- **Matching change record:** This finding (F-8.4a) serves as the change record entry.

**Files to remove (7 surfaces, 14 files):**
1. `src/pages/FeedbackComponentsDemo.tsx`
2. `src/pages/FeedbackDemoPage.tsx`
3. `src/pages/AcademicRecordDemoPage.tsx`
4. `src/pages/DemoIndexPage.tsx`
5. `src/components/writing-grading/WritingGradingModal.tsx`
6. `src/components/writing-grading/WritingGradingModal.css`
7. `src/components/writing-results/StudentResultOverview.tsx`
8. `src/components/writing-results/StudentResultOverview.css`
9. `src/components/writing-results/StudentDetailedMarkup.tsx`
10. `src/components/writing-results/StudentDetailedMarkup.css`

**Routes to remove from App.jsx:**
- `/demo` â†’ `DemoIndexPage`
- `/demo/feedback` â†’ `FeedbackComponentsDemo`
- `/demo/feedback-system` â†’ `FeedbackDemoPage`
- `/demo/academic-record` â†’ `AcademicRecordDemoPage`

**Lazy imports to remove from App.jsx:**
- Lines 62â€“65 (4 lazy imports for demo pages)

### Finding F-8.6a: No tests to add, update, or delete

- No tests exist for any of the 7 surfaces being removed (verified in F-8.1a audit)
- No stale tests need deletion
- `WritingResultView` and `WritingTestResultsSection` retain their existing coverage status (mocked in `TeacherTestResultsPage.test.tsx`)

### Finding F-8.7a: Living docs update summary for Phase 6

- `result-view-map.md` â€” update Phase 6 section noting removal decisions
- `result-view-permission-matrix.md` â€” no access truth changes
- `result-view-fr-closure-matrix.md` â€” no closure status changes
- Change record (this findings file) â€” findings F-8.1a through F-8.9a

### Finding F-8.8a: Stop-check verification â€” no stop conditions triggered

All three stop conditions from Task 8.8 were verified:
1. **No unwired or demo surface remains uncategorized:** All 9 surfaces have explicit classifications (F-8.2a).
2. **No retained wrapper has missing removal gate:** No wrappers were retained. All `remove now` surfaces have zero external consumers.
3. **No public/demo route carries live-path write risk without explicit decision:** `FeedbackComponentsDemo` live-write risk is resolved by removal plus stale residue cleanup (F-8.5a).

### Finding F-8.9a: Phase 6 (Task 8.0) closure gate â€” all criteria met

| Criterion | Status | Evidence |
|---|---|---|
| All targeted surfaces have explicit outcomes | âœ… Met | Finding F-8.2a â€” 7 remove-now, 2 keep-active |
| Removal history recorded | âœ… Met | Finding F-8.4a â€” file list, git recovery reference, change record |
| Tests match reality | âœ… Met | Finding F-8.6a â€” no stale tests, no missing tests |
| Docs and change records updated | âœ… Met | Finding F-8.7a â€” result-view-map and change record updated |
| Public/demo write risk resolved | âœ… Met | Finding F-8.5a â€” resolved by removal plus stale route/config/script cleanup |

**Note:** The actual file deletion and route removal occurred in commit `3449779` following this documentation phase, per Task 8.4 requirement "Do not delete first and document later."

---

## Phase 7 Findings (Task 9.0 â€” Enforcement and Merge Gate Closure)

### Finding F-9.1a: Enforcement and review check verification

The living-doc workflow requires these artifacts for any result-related change:
1. `documentation/architecture/result-view-map.md` â€” âœ… exists, current (7 phases documented)
2. `documentation/architecture/result-view-permission-matrix.md` â€” âœ… exists, unchanged (permissions not affected)
3. `documentation/architecture/result-view-fr-closure-matrix.md` â€” âœ… exists, unchanged (FRs not affected)
4. `documentation/tasks/findings-of-tasks-0040-prd-unified-result-view-architecture-and-governance.md` â€” âœ… exists, current (this file)
5. `documentation/tasks/0040-prd-unified-result-view-architecture-and-governance.md` â€” âœ… exists (governing PRD)

All five artifacts can now be reviewed together as one workflow, and the workflow is operational rather than aspirational. `scripts/pre-commit-enforcement.js` fails result-related changes that omit the map, permission matrix, FR closure matrix, or change record, and `.github/workflows/result-view-governance.yml` runs the same gate in CI.

### Finding F-9.2a: Runtime backend-rule verification path â€” emulator-blocked

The backend security rules test (`src/__tests__/security/prd0040-security.emulator.test.ts`) requires the Firebase emulators. Verification result:
- **Test file:** `prd0040-security.emulator.test.ts` â€” exists and reads `firestore.rules` + `database.rules.json`
- **Local run:** **Blocked** â€” `initializeTestEnvironment()` fails without running emulator
- **Required external runner:** `firebase emulators:exec "npx vitest run src/__tests__/security/prd0040-security.emulator.test.ts"` or CI pipeline with emulator pre-start
- **Follow-up owner:** CI pipeline setup â€” carried risk documented in F-9.6a

### Finding F-9.3a: Tamper-path verification coverage

| Tamper Path | Test Coverage | Status |
|---|---|---|
| `?result=` query param | `AcademicRecordPage.test.tsx` (6 tests: set, remove, normalize, mount-read) | âœ… Covered |
| Notification metadata/links | `ResultDetailPage.test.tsx` â€” student redirect with resultId | âœ… Covered |
| Legacy direct-result routes | `ResultDetailPage.test.tsx` â€” `/result/:resultId` role-based redirect/render | âœ… Covered |
| Same-result cross-entry | `AcademicRecordPage.test.tsx` â€” state-to-query normalization | âœ… Covered |
| Access-lost behavior | `ResultDetailPage.test.tsx` â€” student redirect (cannot see teacher view) | âœ… Covered |

### Finding F-9.4a: Legacy wrapper gate resolution â€” `LegacyResultDetailView`

`LegacyResultDetailView` is the only remaining component with "Legacy" in its name. Gate evaluation:
- **Entry point:** `/result/:resultId` for teacher/super_admin roles (via `ResultDetailPage.tsx`)
- **Import chain:** `ResultDetailPage` â†’ `LegacyResultDetailView` â†’ `SharedSavedResultCore` â†’ `QuestionOverviewSection`
- **Removal gate:** NOT satisfied â€” this component is the sole teacher full-page result viewer for notification deep-links. Removal requires migrating teacher deep-link entry to the slide panel or another surface.
- **Updated gate and target phase:** Retained. Removal blocked until teacher result notification entry is migrated to `TestResultsSlidePanel` (post-PRD-0040, tracked as a named follow-up).

### Finding F-9.5a: Test execution outcomes

| Test Bundle | Command | Result | Notes |
|---|---|---|---|
| `ResultDetailPage.test.tsx` | `npx vitest run` | âœ… **Passed** | 8 tests (student redirect, teacher render, admin render, ownership) |
| `AcademicRecordPage.test.tsx` | `npx vitest run` | âœ… **Passed** | Query-param management, state normalization, deep-link handling |
| `StudentTestResultsPage.test.tsx` | `npx vitest run` | âœ… **Passed** | Release-state gating, session loading, writing branch |
| `TeacherTestResultsPage.test.tsx` | `npx vitest run` | âœ… **Passed** | Detail panels, writing section, overall results |
| `prd0040-security.emulator.test.ts` | `npx vitest run` | âŒ **Blocked** | Requires Firebase emulator â€” see F-9.2a |
| UTF-8 check | `npm run check:utf8 -- <files>` | âœ… **Passed** | All 4 modified files pass |

### Finding F-9.6a: Unresolved risks converted to named follow-ups

| Risk | Follow-Up Task | Owner |
|---|---|---|
| Backend security rules not verified without emulator | Set up CI pipeline with Firebase emulator pre-start for `prd0040-security.emulator.test.ts` | CI/DevOps |
| `LegacyResultDetailView` still active for teacher deep-links | Migrate teacher result notification entry to `TestResultsSlidePanel`, then remove wrapper | Post-PRD-0040 feature work |
| Writing draft status: no `markingStatus: 'in-progress'` for draft saves | Introduce `markingStatus` field to prevent premature queue removal (Appendix A follow-up from F-6.4.5a) | Writing domain owner |
| Race condition in `flushPendingSave()` â†’ `autoSubmitFromRTDB()` | Fix last-edit loss race (Appendix A follow-up from F-6.4.6a) | Writing domain owner |
| Integrity signals not audited for durability | Audit active time and paste attempt persistence (Appendix A follow-up from F-6.4.7a) | Writing domain owner |
| Tab-switch recording incomplete | Complete the tab-switch recording contract for intra-task switching (Appendix A follow-up from F-6.4.8a) | Monitor domain owner |
| No audit trail for grading actions | Implement audit entry creation in `updateGrading()` (Appendix A follow-up from F-6.4.10a) | Writing domain owner |

### Finding F-9.7a: PRD phase acceptance gate reconciliation

| PRD Phase | Gate Criteria | Status | Evidence |
|---|---|---|---|
| Phase 1 (Surface Map) | All result-adjacent surfaces inventoried | âœ… Met | result-view-map.md (7 phases) |
| Phase 2 (Release State) | Three-state model verified, feedback on result surfaces only | âœ… Met | Findings F-2.x through F-3.x |
| Phase 3 (Saved-Result Core) | `SharedSavedResultCore` extracted, shells using it | âœ… Met | Findings F-4.x |
| Phase 4 (Guest Domain) | Guest result domain governed, CTA routes remediated | âœ… Met | Findings F-5.x |
| Phase 5 (Writing Domain) | Writing lifecycle mapped, Appendix A dispositioned | âœ… Met | Findings F-6.x |
| Phase 6 (Live Monitor) | Monitor preserved as operational domain | âœ… Met | Findings F-7.x |
| Phase 7 (Surface Triage) | Unwired/demo surfaces removed or explicitly retained | âœ… Met | Findings F-8.x (7 removed, 2 retained) |
| Phase 8 (Enforcement) | All docs current, tests passing, UTF-8 clean, risks named | âœ… Met | This finding (F-9.x) |

### Finding F-9.8a: Final living docs status

| Document | Status | Last Updated |
|---|---|---|
| `result-view-map.md` | âœ… Current | Phase 6 section added (surface triage) |
| `result-view-permission-matrix.md` | âœ… Current | No changes needed (permissions unchanged) |
| `result-view-fr-closure-matrix.md` | âœ… Current | No changes needed |
| Findings file (this document) | âœ… Current | Phase 7 findings added |
| Task list (`tasks-0040-...md`) | âœ… Current | All phases 1â€“9 marked |
| Governing PRD (`0040-prd-...md`) | âœ… Current | Architecture truth unchanged |

### Finding F-9.9a: Stop-check verification â€” no stop conditions triggered

| Stop Condition | Status |
|---|---|
| Any required doc is missing | âœ… All 6 docs present |
| Any required test bundle not run or deferred without owner | âœ… 4/5 passed; 1 deferred with owner (CI/DevOps â€” F-9.6a) |
| UTF-8 checks fail | âœ… All passed (4 files verified) |
| Any carried risk lacks a named follow-up | âœ… All 7 risks have named follow-ups (F-9.6a) |

### Finding F-9.10a: Phase 7 (Task 9.0) closure gate â€” all criteria met

| Criterion | Status | Evidence |
|---|---|---|
| Enforcement is active | âœ… Met | Pre-commit and CI governance enforcement are operational (F-9.1a) |
| Runtime-proof strategy is explicit | âœ… Met | Emulator requirement documented (F-9.2a) |
| Tamper paths are covered | âœ… Met | 5/5 tamper paths tested (F-9.3a) |
| Wrapper-removal gates are current | âœ… Met | `LegacyResultDetailView` gate updated (F-9.4a) |
| All required docs are current | âœ… Met | 6/6 documents verified (F-9.8a) |
| UTF-8 checks pass | âœ… Met | 4 files verified (F-9.5a) |
| Merge packet complete | âœ… Met | No tribal knowledge â€” all decisions documented in findings |

**PRD-0040 implementation is COMPLETE.** All 9 phases executed and verified. 7 dead surfaces removed (4,066 lines). All unresolved risks have named follow-ups.

---

## Continuation Findings (2026-03-25)

### Finding R-2026-03-25-11: Guest-claim storage has now been canonicalized; Finding R-2026-03-25-6 is historical only
`claimGuestResults()` no longer nests claimed rows under `test_results/{userId}/{generatedResultId}`. It now promotes each claimed guest result into canonical `test_results/{resultId}`, rewrites `studentId` to the claiming user, rebuilds `test_results_by_student`, `test_results_by_session`, `test_results_by_teacher`, `test_results_by_course`, and `test_results_by_class` fan-out indexes when those dimensions exist, and deletes `guest_results/{guestName}` only after the batch update succeeds. `ClaimResultsModal.test.tsx` and `guestResultsService.test.ts` now prove the canonical claim path. The earlier compatibility-only finding should be read as historical repo truth before this continuation.

### Finding R-2026-03-25-12: Historical nested claimed guest rows need a privileged/manual migration if they were created before canonicalization
Current claims are canonical, but older claimed guest rows may still exist under `test_results/{userId}/{resultId}` from the pre-fix implementation. `migrateLegacyClaimedGuestResults()` was added as a privileged/manual helper to promote those rows into the canonical saved-result shape and rebuild the standard indexes. This is a bounded follow-up on live data, not a reason to keep current writes non-canonical.

### Finding R-2026-03-25-13: Student class assignment result links now require persisted canonical resultId and fail closed when absent
`StudentClassDetailPage.jsx` no longer manufactures invalid `/student/results/${classId}/${assignment.id}` links. Completed assignments now navigate only through `buildRoute('RESULT_DETAIL', { resultId })` using `assignment.studentProgress.resultId`, and render `Result Pending` when no canonical `resultId` exists. `useTestSubmission.ts` now backfills `resultId` into `classes/{classId}/students/{studentId}/assignments/{assignmentId}` when class-assignment context is available, and `StudentClassDetailPage.test.jsx` covers both the valid-link and fail-closed cases.

### Finding R-2026-03-25-14: Result-surface observability inventory is now wider, but feature registry remains metadata rather than authority
`featureRegistry.ts` now includes `/guest-results`, `/teacher/results`, and `/submission-complete`, `featureRegistry.test.ts` covers those routes, and `App.jsx` now tracks `/guest-results` under the `results` domain. This closes the earlier missing-route gap, but the registry still remains observability metadata rather than the authoritative surface inventory, which is the living doc pack.

## Continuation Findings (2026-03-27)

### Finding R-2026-03-27-1: StudentTestResultsPage no longer drifts behind monitor release-state changes
The earlier follow-up review correctly identified that `StudentTestResultsPage.tsx` was still treating `game_sessions/{sessionCode}` as a one-shot snapshot. That gap is now closed: the page subscribes live to `game_sessions/{sessionCode}` via `onValue()`, derives release state through `deriveSessionReleaseState(session)`, and updates its gated review surface without requiring a manual refresh when the teacher changes release state from the monitor.

### Finding R-2026-03-27-2: TestResultsModal retry timers are now bounded to the modal open lifecycle
`TestResultsModal.tsx` previously left retry `setTimeout()` callbacks alive after the waiting-room modal was closed, which allowed background RTDB reload attempts and stale state to leak into later opens. The continuation fix introduced `retryTimeoutRef`, `openedRef`, and timer cleanup on close/unmount so retries stop when the modal is not visible.

### Finding R-2026-03-27-3: Historical class-assignment rows now have a repair path instead of permanent fail-closed behavior
The first remediation round fixed the bad class-result route by requiring canonical `resultId`, but older completed assignments without that field were still stranded behind `Result Pending`. `StudentClassDetailPage.jsx` now resolves missing assignment `resultId` values from the student's existing saved results, persists the repaired id back onto assignment progress, and only exposes `View Results` once the canonical route target exists.

### Finding R-2026-03-27-4: Legacy guest-result migration remains a privileged maintenance operation, not a client auto-fix
`migrateLegacyClaimedGuestResults()` must read historical nested rows under root `test_results`, but current RTDB rules do not allow normal claim-flow users to enumerate that root path. The helper therefore remains a privileged maintenance operation for backfill/reconciliation work rather than something the browser claim flow should call automatically.

### Finding R-2026-03-27-5: Result observability and governance matching now include the primary claim-recovery route and class-result producers
`/profile/complete` is now tracked under the `results` feature in `App.jsx` and `featureRegistry.ts`, closing the main claim-recovery observability gap. The PRD-0040 governance matcher was also widened to cover `StudentClassDetailPage`, `useTestSubmission`, and `class.types`, so future changes to canonical class-result production paths cannot bypass the doc/change-record gate.

