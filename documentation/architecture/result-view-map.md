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

## PRD-0049 Reconciliation Note

PRD-0049 reconciles the live-parity local `main` history back into `origin/main`. The result-related files entering `origin/main` through that reconciliation preserve the existing surface map below; no new result shell, route owner, or lifecycle role is introduced by the reconcile itself.

## PRD-0043 External Writing Import Note

PRD-0043 adds an external/admin homework Writing import intake to `TeacherGradingPage`, which is already the active Writing queue surface. The import creates canonical Firestore `writing_submissions` with homework context plus matching homework/result projections, then continues through the existing `/teacher/grading/writing/:submissionId` editor path. No new result shell, saved-result host, or Writing lifecycle role is introduced.

## 2026-07-05 Retired Source Material Note

The retired-material cleanup keeps completed results and result indexes. Retained rows may carry `sourceMaterialRemoved: true` after reviewed purge tooling removes retired source payload references. That marker is a source-loading/display contract only: `SharedSavedResultCore`, `ReviewTab`, `StudentTestResultsPage`, `TeacherTestResultsPage`, and `ResultDetailModal` continue to render saved answers and scores from permanent result data without creating a new result shell or changing the surface inventory below.

## Surface Inventory

| Surface | Status | Domain | Writing lifecycle | Route / host | Primary data path | Owner / host contract | Coverage anchor | Resolution disposition | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `ResultSlidePanel` | active | saved-result | - | `AcademicRecordPage`, `StudentDashboardPage`, `StudentHomeworkListPage`, `StudentHomeworkDetailPage` | RTDB `test_results/{resultId}` plus `game_sessions/{sessionCode}` for `class_session` release-state reads | student saved-result shell | `ResultSlidePanel.test.tsx` | - | Delegates content to `SharedSavedResultCore`. No shell-level ownership check. Student entry owners now share one saved-result release gate for `class_session` results, so locked/review/feedback visibility stays aligned across dashboard, academic-record, and homework entry points. The panel derives release state from `game_sessions/{sessionCode}` and fails closed to `locked-review` when the session context is missing or the release read errors. |
| `ResultDetailModal` | active | saved-result | - | `TeacherHomeworkDetailPage` | RTDB `test_results/{resultId}` | teacher modal shell | `ResultDetailModal.test.tsx` | - | Delegates content to `SharedSavedResultCore`. **Task 3.2 route gate:** teacher route gate + homework context; no shell-level ownership check (see permission-matrix.md Task 3.2, path 5). RTDB read access still depends on canonical `result.visibility`; homework-detail `permission_denied` must be fixed in resolver/reindex data flow, not by adding modal-local fallback ownership. |
| `LegacyResultDetailView` | active | saved-result | - | `ResultDetailPage` | RTDB `test_results/{resultId}` | teacher/admin full-page shell | `LegacyResultDetailView.test.tsx` | - | Delegates content to `SharedSavedResultCore`. **Task 3.2 route/detail gate:** `useResultOwnershipCheck` protects the full-page detail route, while final row inclusion still comes from canonical visibility services. |
| `ResultDetailPage` | active | saved-result | - | `/result/:resultId` | route wrapper | wrapper only | `ResultDetailPage.test.tsx` | - | Student redirects to academic record; teacher/admin stays full-page. |
| `AcademicRecordPage` | active | saved-result | - | `/student/academic-record` | query param `?result=` -> `ResultSlidePanel` | student query-param owner | `AcademicRecordPage.test.tsx` | - | Canonical student saved-result host. |
| `StudentDashboardPage` | active | saved-result | - | `/student`, `/student/dashboard` | notification metadata `resultId` -> `ResultSlidePanel` | student dashboard notification owner | `StudentDashboardPage.teachers.test.jsx` | - | Opens panel directly when metadata contains `resultId`. |
| `StudentHomeworkListPage` | active | saved-result | - | student homework list | result open -> `ResultSlidePanel` | student homework host | `StudentHomeworkListPage.test.tsx` | - | Entry owner, not a disposable wrapper. |
| `StudentHomeworkDetailPage` | active | saved-result | - | student homework detail | result open -> `ResultSlidePanel` | student homework host | `StudentHomeworkDetailPage.test.tsx` | - | Entry owner, not a disposable wrapper. |
| `TeacherHomeworkDetailPage` | active | saved-result | - | teacher homework detail | result open -> `ResultDetailModal` | teacher homework host | `TeacherHomeworkDetailPage.test.tsx` | - | Teacher modal host. |
| `TeacherStudentHistoryPage` | active | saved-result | - | `/teacher/student/:studentId/history` | `buildRoute('RESULT_DETAIL', { resultId })` | teacher deep-link owner | `TeacherStudentHistoryPage.test.tsx` | - | History view drives canonical permanent-result deep links. **Task 3.2 outer/deep-link gate:** `useStudentDataAccessCheck` protects the student-history page and the downstream result-detail route has its own gate; this page is not result ownership authority. |
| `StudentWaitingRoomPage` | active | session/post-test | - | `/student-wait/:gameSessionId` | RTDB `game_sessions/{sessionId}` and session result handoff | waiting-room-first student post-test owner | `StudentWaitingRoomPage.test.jsx` | - | `showResults` is only the fast path. The waiting room also reconstructs recent-result availability from persisted player breadcrumbs (`lastTestId`, `lastTestSessionCode`, `lastTestEndedAt`) plus the session release snapshot so refreshes and lost router state can restore the correct review entry without depending on transient navigation state alone. Auto-open still depends on the recent-result window. |
| `TestResultsModal` | active | session/post-test | - | mounted by waiting room | RTDB `test_results_by_student`, `test_results_by_session`, `lastTestId` fallback | student live-session review surface | `TestResultsModal.test.tsx` | - | Session-first loader; not a plain `resultId` reader. **Phase 2:** governed by `getReleaseVisibility()` release-state contract and now runtime-tested across locked/review/full release tiers. |
| `StudentTestResultsPage` | active | session/post-test | - | `/student-test-results/:sessionCode`, `/student/results/:sessionCode` | RTDB `game_sessions/{sessionCode}` plus permanent-result fallback | rich student session review page | `StudentTestResultsPage.test.tsx` | - | Live-subscribes to `game_sessions/{sessionCode}` so release-state changes update while the page is open. Legacy direct result probe still exists on `/student/results/:sessionCode`. **Phase 2:** governed by `getReleaseVisibility()` release-state contract. |
| `TeacherResultsDashboard` | active | session/post-test | - | `/teacher/results` | RTDB `game_sessions` plus aggregated session-result loaders | teacher aggregate results dashboard | `resultsService.test.ts` | - | Dashboard/aggregate result surface, not a saved-result shell. |
| `TeacherTestResultsPage` | active | session/post-test | - | `/teacher-test-results/:sessionCode` | RTDB `game_sessions/{sessionCode}` plus session result loaders | teacher session-result page | `TeacherTestResultsPage.test.tsx` | - | Includes writing result section. |
| `TeacherResultsPage` | active | session/post-test | - | `/teacher-results/:gameSessionId` | RTDB `game_sessions/{gameSessionId}` | teacher live session results | `TeacherResultsPage.test.jsx` | - | Adjacent session surface, not a saved-result shell. |
| `StudentResultsPage` | active | session/post-test | - | `/student-results/:gameSessionId` | RTDB `game_sessions/{gameSessionId}` plus `sessionStorage.playerId` | student live session results | `StudentResultsPage.test.jsx` | - | Test is stale. |
| `TeacherFeedbackPage` | active | session/post-test | - | `/teacher-feedback/:gameSessionId` | RTDB `game_sessions/{gameSessionId}` and feedback paths | teacher session feedback page | `TeacherFeedbackPage.test.jsx` | - | Smoke-only coverage. |
| `StudentFeedbackPage` | active | session/post-test | - | `/student-feedback/:gameSessionId` | RTDB `game_sessions/{gameSessionId}` and `sessionStorage.playerId` | student session feedback page | none found | - | Adjacent feedback surface, not saved-result. |
| `GuestResultsPage` | active | guest-result/claim | - | `/guest-results` | RTDB `guest_results/{guestName}` | guest lookup/list page | `GuestResultsPage.test.tsx` | - | Public route; backend read requires auth (accepted mismatch per Finding F-5.3b). CTA routes are corrected to `/`, and the route is now tracked under the `results` feature surface in `App.jsx` / `featureRegistry.ts`. Mantine dependency remains documented (Finding F-5.1b). |
| `ProfileCompletionPage` | active | guest-result/claim | - | `/profile/complete` | `checkClaimableResults(email)` | authenticated claim/recovery owner | none found | - | Opens claim modal when guest names are claimable. No focused page test exists yet. |
| `ClaimResultsModal` | active | guest-result/claim | - | mounted by profile completion | `claimGuestResults(guestName, userId)` | guest claim executor | `ClaimResultsModal.test.tsx`, `guestResultsService.test.ts` | - | Claim flow now promotes guest rows into canonical `test_results/{resultId}` records, rebuilds the normal saved-result indexes, and preserves claim metadata. `migrateLegacyClaimedGuestResults()` remains a privileged/manual maintenance helper for older nested claim rows when present. |
| `TeacherTestMonitorPage` | active | live-monitoring | monitor | `/teacher-test/:sessionCode` and related monitor routes | RTDB `game_sessions/{sessionId}` | live monitor owner | `TeacherTestMonitorPage.test.tsx` | - | Also owns writing monitor and release-adjacent flows. **Phase 2:** confirmed as operational control surface only Ã¢â‚¬â€ `FeedbackTab` absent (Finding F-4.6a). Owns release controls but does not display long-form feedback, and release-control behavior is now runtime-tested. |
| `StudentDetailModal` | active | live-monitoring | - | mounted by monitor flows | RTDB session/player paths | live monitoring detail surface | static audit only | - | Not a result-view migration anchor. |
| `WritingTestPage` | active | writing | draft | student writing test flow | RTDB `game_sessions/{sessionCode}/writing/...` | student writing draft/edit host | static audit only | - | Draft/autosave front door. |
| `WritingMonitorCard` | active | writing | monitor | mounted by teacher monitor | RTDB live writing draft paths | teacher monitor card | `WritingMonitorCard.test.tsx` | - | Monitor-time operational surface. |
| `WritingPeekModal` | active | writing | monitor | mounted by teacher monitor | RTDB live draft text | teacher monitor peek | static audit only | - | Reads live draft, not final submission. |
| `TeacherGradingPage` | active | writing | queue | `/teacher/grading`, `/teacher/grading/writing` | Firestore `writing_submissions` query | teacher grading queue | static audit only | - | Operational front door for grading. PRD-0043 adds external/admin homework import intake here without changing the queue lifecycle role. |
| `WritingGradingPage` | active | writing | editor | `/teacher/grading/writing/:submissionId` | Firestore `writing_submissions/{submissionId}` | active grading editor | static audit only | - | Autosave and Save Draft currently mark work graded. |
| `WritingResultView` | active | writing | result | mounted by student/teacher result bridges | Firestore `writing_submissions/{submissionId}` | writing result viewer | static audit only | - | Result surface, not front door. |
| `WritingResultDetailModal` | active | writing | result | mounted by writing result flows | Firestore `writing_submissions/{submissionId}` | writing result modal | static audit only | - | Can reopen grading. |
| `WritingTestResultsSection` | active | writing | result | mounted by `TeacherTestResultsPage` | Firestore writing submission lookup | writing result bridge | static audit only | - | Session result page bridge into writing results. |
| `SubmissionCompletePage` | active | writing | result | `/submission-complete` | location state handoff -> `/student-test-results/:sessionCode` | writing submission-complete bridge | static audit only | - | Active post-submission bridge from writing/test completion into student result review. |
| `InlineWritingGrader` | active | writing | editor | mounted by `TeacherTestMonitorPage` for THCS | live session result state | THCS inline writing grading | `thcsWritingGrading.service.test.ts` | - | Separate from IELTS writing submission architecture. |
| `WritingGradingModal` | unwired | writing | alternate/dormant | no active route | none in current app wiring | alternate grading toolchain | none found | remove now | Documented heavily in `.knowns`, not wired in current app. |
| `StudentResultOverview` | unwired | writing | alternate/dormant | no active route | none in current app wiring | student writing redesign artifact | none found | remove now | Docs-only in current repo state. |
| `StudentDetailedMarkup` | unwired | writing | alternate/dormant | no active route | none in current app wiring | student writing redesign artifact | none found | remove now | Docs-only in current repo state. |
| `FeedbackComponentsDemo` | demo-only | unwired/demo | - | historical `/demo/feedback` route | writes RTDB `courses/demo-course-789` and `test_results/demo-result-123` | public demo route | none found | remove now | Page file removed from runtime, and the stale config/script residue was removed from the repo on 2026-03-25. |
| `FeedbackDemoPage` | demo-only | unwired/demo | - | historical `/demo/feedback-system` route | local mock state | public demo route | none found | remove now | Page file removed from runtime, and the stale route-security residue was removed from the repo on 2026-03-25. |
| `AcademicRecordDemoPage` | demo-only | unwired/demo | - | historical `/demo/academic-record` route | local mock state | public demo route | none found | remove now | Page file removed from runtime, and the stale route-security residue was removed from the repo on 2026-03-25. |
| `DemoIndexPage` | demo-only | unwired/demo | - | historical `/demo` route | public demo hub | public demo route | none found | remove now | Page file removed from runtime, and the stale route-security residue was removed from the repo on 2026-03-25. |

## Phase 2: Release-State Governance (Tasks 4.1Ã¢â‚¬â€œ4.8)

The three-state release model (`locked-review` Ã¢â€ â€™ `review-released` Ã¢â€ â€™ `feedback-released`) is verified and functional:
- **Enforcement**: UI-layer via `getReleaseVisibility()` in `src/types/releaseState.types.ts`.
- **Data-layer**: RTDB does not support field-level restriction. `correctAnswer` is readable on the result record from submission time. Student-side AI generation is now delayed until `feedback-released` for live-session saved-result panels, but the data-layer posture is still weaker than the PRD ideal.
- **Session vs saved-result**: Session surfaces are governed by release state. Student saved-result entry points that reuse `ResultSlidePanel` are also governed for `class_session` results by reading `game_sessions/{sessionCode}` and fail closed if that session context is missing or unreadable. Teacher/admin saved-result shells remain unrestricted.
- **Monitor boundary**: `TeacherTestMonitorPage` owns release controls but does not render `FeedbackTab`.
- **Runtime proof**: `TestResultsModal`, `StudentWaitingRoomPage`, `StudentTestResultsPage`, `ResultSlidePanel`, `TeacherTestMonitorPage`, and `useMonitorControls` now have dedicated release-governance regression coverage.

## Current High-Risk Classifications

- `ResultSlidePanel` and its student entry owners now share release-state behavior for live-session results, but visible ownership enforcement is still weaker than the PRD intent because RTDB remains the actual owner check.
- `TestResultsModal` and `StudentTestResultsPage` are active session/post-test surfaces and must not be collapsed into a `resultId` abstraction.
- `GuestResultsPage` is active with corrected CTA routes. Its public route posture vs. auth-required backend read is an accepted mismatch (Finding F-5.3b).
- Removed demo pages are no longer runtime-reachable, and the stale demo route/config/script residue has also been cleaned. Historical docs still name those surfaces for auditability.
- `WritingGradingModal`, `StudentResultOverview`, and `StudentDetailedMarkup` are not active runtime surfaces today; they should be treated as `alternate/dormant` or `unwired`, not migration anchors.

## Phase 3: Guest-Result Domain Classification (Task 5.0)

The guest-result/claim domain is formally classified as an **adjacent domain**, architecturally separated from the unified saved-result core:
- **Surfaces**: `GuestResultsPage`, `ProfileCompletionPage`, `ClaimResultsModal`, `guestResultsService`
- **Storage**: RTDB `guest_results/{guestName}` (staging) -> canonical `test_results/{resultId}` plus standard saved-result fan-out indexes on claim
- **Decision**: Canonicalize guest claims now. `claimGuestResults()` writes to the same canonical saved-result path used elsewhere, and `migrateLegacyClaimedGuestResults()` remains a privileged/manual maintenance helper for historical compatibility-mapped claim rows.
- **Tests**: `GuestResultsPage.test.tsx` (11 tests), `ClaimResultsModal.test.tsx` (13 tests), `guestResultsService.test.ts` (canonical-claim and legacy-migration coverage)
- **Boundary**: Must NOT be folded into `SharedSavedResultCore` or saved-result shell architecture.

## Stale Producers and Config-Only References

- `StudentClassDetailPage.jsx` now repairs missing class-assignment `resultId` values in the background from existing student results, then opens class-assignment results only through canonical `/result/:resultId` navigation. The UI still fails closed until a canonical id is resolved.
- The old `routeSecurity.ts` `/student/results/history` residue was removed on 2026-03-25; the path remains historical documentation only.
- `featureRegistry.ts` now lists `/guest-results`, `/teacher/results`, `/submission-complete`, and `/profile/complete`, but it remains observability metadata rather than a complete result-surface inventory.

## Phase 4: Writing Domain Resolution (Task 6.0)

The writing domain is formally classified as a **cross-store lifecycle** architecturally separate from both the unified saved-result core and the session/post-test domain:

### Writing Lifecycle Architecture
- **Draft** (RTDB): `WritingTestPage` Ã¢â€ â€™ `useWritingAutoSave` Ã¢â€ â€™ RTDB `game_sessions/{code}/writing/...`
- **Monitor** (RTDB): `WritingMonitorCard`, `WritingPeekModal` Ã¢â€ â€™ live RTDB draft streams
- **Bridge** (RTDBÃ¢â€ â€™Firestore): `autoSubmitFromRTDB()` in `writingSubmissionService.ts` Ã¢â‚¬â€ the ONLY promotion path
- **Queue** (Firestore): `WritingGradingQueuePage` Ã¢â€ â€™ `writing_submissions` by `markingStatus === 'pending-review'`
- **Editor** (Firestore): `WritingGradingPage` (IELTS), `InlineWritingGrader` (THCS, separate workflow)
- **Result** (Firestore): `WritingResultView`, `WritingResultDetailModal`, `WritingTestResultsSection`, `SubmissionCompletePage`
- **Alternate/Dormant** (unwired): `WritingGradingModal`, `StudentResultOverview`, `StudentDetailedMarkup` Ã¢â€ â€™ all remove-now (Phase 8)

### Boundary Constraint
Writing surfaces MUST NOT be folded into `SharedSavedResultCore`, `ResultSlidePanel`, `ResultDetailModal`, or `LegacyResultDetailView`. The writing lifecycle uses Firestore `writing_submissions` as its canonical store, not RTDB `test_results`.

### Appendix A Disposition Summary (12 findings)
- **5 accepted current behavior**: #1 (queue front door), #4 (cross-store), #5 (monitor control loop), #6 (different artifacts), #9 (bidirectional loop), #12 (THCS separate)
- **5 named follow-up tasks**: #2 (draft marking status), #3 (last-edit race), #7 (metadata persistence), #8 (tab-switch contract), #10 (audit trail)
- **2 classified/documented**: #11 (two grading architectures)
- Full dispositions: Findings F-6.4.1aÃ¢â‚¬â€œF-6.4.12a in the change record

### Named Follow-Up Tasks
1. Introduce `markingStatus: 'in-progress'` for draft saves (F-6.4.2a)
2. Fix last-edit loss race in `flushPendingSave()` (F-6.4.3a)
3. Audit integrity signal persistence (F-6.4.7a)
4. Complete tab-switch recording contract (F-6.4.8a)
5. Implement audit entry creation in `updateGrading()` (F-6.4.10a)

## Phase 5: Live-Monitoring Domain Preservation (Task 7.0)

The live-monitoring domain is formally classified as an **operational control domain**, architecturally independent from both saved-result shells and session result viewers:

### Monitor Surface Inventory (12 surfaces)
- **Core**: `TeacherTestMonitorPage` (owner of session controls, release state, accommodations, auto-submit)
- **Student detail**: `StudentDetailModal` (per-student drill-down, presentation-only)
- **Grid cards**: `StudentProgressCard`, `THCSStudentProgressCard`, `WritingMonitorCard` (presentation-only)
- **Control surfaces**: `TeacherTestControlBar`, `AudioProgressPanel`, `HeadphoneRequestPanel`, `AccommodationStatusBar`, `CountdownWarningModal`
- **Writing integration**: `WritingPeekModal` (RTDB live draft), `InlineWritingGrader` (THCS inline grading)

### Release-State Ownership
- **Write (ownership)**: Exclusively `TeacherTestMonitorPage` Ã¢â€ â€™ `useMonitorControls.setReviewReleaseState()`
- **Read (consumption)**: `StudentTestResultsPage`, `TestResultsModal`, `ResultSlidePanel` (for `class_session` saved results), `useTeacherEndRedirect`
- **Boundary**: No result viewer writes release state. The shared `getReleaseVisibility()` is a pure function with no state or side effects.

### Cross-Domain Verification
- Zero imports from saved-result components (`SharedSavedResultCore`, `ResultSlidePanel`, `ResultDetailModal`, `LegacyResultDetailView`)
- Zero shared loaders or permission logic between monitor and result domains
- Monitor hooks (`useMonitorSession`, `useMonitorControls`) are monitor-exclusive

## Phase 6: Unwired/Legacy/Demo Surface Triage (Task 8.0)

### Removed surfaces (7) Ã¢â‚¬â€ git recovery: `ffb3747`
| Surface | Former Route/Wiring | Removal Reason |
|---|---|---|
| `FeedbackComponentsDemo` | `/demo/feedback` (public) | Live RTDB writes on public route Ã¢â‚¬â€ production risk |
| `FeedbackDemoPage` | `/demo/feedback-system` (public) | Unwired demo Ã¢â‚¬â€ local mock only |
| `AcademicRecordDemoPage` | `/demo/academic-record` (public) | Unwired demo Ã¢â‚¬â€ local mock only |
| `DemoIndexPage` | `/demo` (public) | Hub for removed demo routes |
| `WritingGradingModal` | None (zero imports) | Dormant redesign artifact |
| `StudentResultOverview` | None (zero imports) | Dormant redesign artifact |
| `StudentDetailedMarkup` | None (zero imports) | Dormant redesign artifact |

Note: runtime removal is real, and the stale demo residue in `src/config/routeSecurity.ts` plus the old demo setup scripts was removed on 2026-03-25. Historical documentation still names the old surfaces for auditability.

### Retained active surfaces (2)
| Surface | Consumer | Reason |
|---|---|---|
| `WritingResultView` | `StudentTestResultsPage` (lazy-loaded) | Active student-facing writing result viewer. In the wide student result slide modal, published markup clicks force-open `Comments` and align the whole comment rail by `selected comment header top == clicked annotation top`. |
| `WritingTestResultsSection` | `TeacherTestResultsPage` (direct import) | Active teacher-facing writing session results |
