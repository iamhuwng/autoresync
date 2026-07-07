# PRD-0040 Preflight Ledger

> Task 0.1 deliverable. Every surface touched by PRD-0040 with domain, canonical surface, route/host, parent owner, data path, backend-rule dependency, tests, manual checks, docs to update, and forbidden moves.

---

## 0. 2026-03-25 Reassessment Corrections

This file contains both a frozen preflight baseline and historical verification notes from the original implementation window. Readers using it for current-state review should account for these repo-truth corrections:

- `LegacyResultDetailView` no longer uses one-shot-only loading; it now uses an RTDB `onValue` listener like the other saved-result shells.
- `src/components/results/SharedSavedResultCore.test.tsx` now exists, so the old "missing test" note in the frozen baseline is historical, not current.
- `ResultSlidePanel` now applies live-session release-state governance for `class_session` saved results by subscribing to `game_sessions/{sessionCode}` and withholding unreleased review/feedback tabs.
- `endFullSession()` now auto-releases `review-released` on session end and preserves `feedback-released` if it was already set, which is closer to the original FR-050 / FR-054 intent than the earlier relock behavior.
- Guest-result claims now promote staged guest rows into canonical RTDB `test_results/{resultId}` records, rebuild the standard saved-result indexes, and retain a privileged/manual `migrateLegacyClaimedGuestResults()` helper for older nested claim rows.
- Demo files were removed, and the stale demo config/script residue was also removed from `src/config/routeSecurity.ts`, `src/scripts/setupFeedbackDemo.js`, `src/scripts/setupFeedbackDemo.ts`, and `src/scripts/mockFeedbackData.ts`.
- The routeSecurity-only `/student/results/history` residue identified in the frozen audit has also been removed; it now survives only in historical docs.
- `StudentClassDetailPage.jsx` now repairs missing class-assignment `resultId` values in the background from existing student results, navigates only through canonical `buildRoute('RESULT_DETAIL', { resultId })` links, and still fails closed until a canonical id is resolved.
- `StudentTestResultsPage.tsx` now live-subscribes to `game_sessions/{sessionCode}` so release-state changes propagate without refresh.
- `TestResultsModal.tsx` now clears retry timers on close and unmount so background RTDB retries do not leak across modal opens.
- `ClaimResultsModal.tsx` now loads claim counts in `useEffect`, replacing the earlier render-time async initialization.
- `useTestSubmission.ts` now persists `resultId` back onto class-assignment progress when class-assignment context is available, so new submissions repair the canonical deep-link path automatically.
- `featureRegistry.ts` and `App.jsx` now cover `/guest-results`, `/teacher/results`, `/submission-complete`, and `/profile/complete` as result-domain surfaces; the registry remains observability metadata, not the authoritative surface inventory.

## 0.1 2026-07-07 Teacher Materials Bulk Library Governance Note

The teacher-materials bulk-library branch touches two result-related files without changing result-view architecture:

- `src/config/featureRegistry.ts`: adds Teacher Materials bulk action names for selected-material assign/delete/archive tracking. This is observability metadata only and does not add a result route, result host, or result surface.
- `src/hooks/test/useTestSubmission.ts`: replaces the failed canonical persistence `alert()` with `toast.error('Failed to submit test. Please try again.')`. The submission flow still aborts before marking the player submitted when `saveTestResult()` fails, preserving the existing canonical writer contract.

Required governance docs updated in the same branch: `result-view-map.md`, `result-view-permission-matrix.md`, and `result-view-fr-closure-matrix.md`. No PRD-0040 FR closure status changed.

## 1. Saved-Result Shells

### 1.1 ResultSlidePanel (Student Shell)

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Canonical surface | `ResultSlidePanel` |
| Status | active |
| Route / host | Mounted by `AcademicRecordPage`, `StudentDashboardPage`, `StudentHomeworkListPage`, `StudentHomeworkDetailPage` |
| Parent owner | Student entry points own open/close; panel receives `resultId` + `onClose` |
| Data path | RTDB `test_results/{resultId}` via `onValue` listener, fallback `getTestResult()`, plus `game_sessions/{sessionCode}` listener for `class_session` release-state governance |
| Backend-rule dependency | RTDB `test_results/{resultId}` Ã¢â‚¬â€ allows owning student read, any teacher read, any super_admin read |
| Tests to run | `src/components/results/ResultSlidePanel.test.tsx` |
| Manual checks | Verify panel opens from each parent owner, attempt switching works, live-session saved results obey locked/review/feedback release gating, and feedback auto-triggers only after `feedback-released` |
| Docs to update | `result-view-map.md`, `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md` |
| Forbidden moves | No ownership check inside shell; no permission decisions in shared core; no fourth shell; do not bypass live-session release-state governance for `class_session` results |

### 1.2 ResultDetailModal (Teacher Modal Shell)

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Canonical surface | `ResultDetailModal` |
| Status | active |
| Route / host | Mounted by `TeacherHomeworkDetailPage` |
| Parent owner | Teacher homework detail page owns open/close; modal receives `opened`, `resultId`, `onClose`, optional `inline` |
| Data path | RTDB `test_results/{resultId}` via `onValue` listener, fallback `getTestResult()` |
| Backend-rule dependency | RTDB `test_results/{resultId}` Ã¢â‚¬â€ allows any teacher read (broader than assigned-teacher intent) |
| Tests to run | `src/components/results/ResultDetailModal.test.tsx` |
| Manual checks | Verify modal opens from teacher homework detail, feedbackTiming controls work, feedback generation triggers |
| Docs to update | `result-view-map.md`, `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md` |
| Forbidden moves | No student controls in teacher shell; no ownership edit; feedbackTiming is homework-specific behavior to preserve |

### 1.3 LegacyResultDetailView (Teacher/Admin Full-Page Shell)

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Canonical surface | `LegacyResultDetailView` |
| Status | active |
| Route / host | Mounted by `ResultDetailPage` at `/result/:resultId` |
| Parent owner | `ResultDetailPage` is wrapper-only; `LegacyResultDetailView` owns data loading and ownership check |
| Data path | RTDB `test_results/{resultId}` via `onValue` listener with access-lost handling |
| Backend-rule dependency | RTDB `test_results/{resultId}` Ã¢â‚¬â€ allows any teacher read; `useResultOwnershipCheck` adds shell-level check |
| Tests to run | `src/components/results/LegacyResultDetailView.test.tsx` |
| Manual checks | Verify ownership check redirects unauthorized, PDF generation, teacher feedback display |
| Docs to update | `result-view-map.md`, `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md` |
| Forbidden moves | Do not convert into a fourth shell; do not remove ownership check; do not add admin mutation actions |

### 1.4 ResultDetailPage (Route Wrapper)

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Canonical surface | `ResultDetailPage` (wrapper only, NOT a shell) |
| Status | active |
| Route / host | `/result/:resultId` |
| Parent owner | Route wrapper; students redirected to `/student/academic-record?result={resultId}`; teacher/admin see `LegacyResultDetailView` |
| Data path | None directly Ã¢â‚¬â€ delegates to `LegacyResultDetailView` |
| Backend-rule dependency | `PrivateRoute` auth gate; hierarchical role check |
| Tests to run | `src/pages/ResultDetailPage.test.tsx` |
| Manual checks | Verify student redirect, teacher/admin full-page render, missing resultId guard |
| Docs to update | `result-view-map.md`, `result-view-permission-matrix.md` |
| Forbidden moves | Do not make this a fourth shell; do not add smart loading logic here |

## 2. Saved-Result Entry Owners (Parent Hosts)

### 2.1 AcademicRecordPage

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Route | `/student/academic-record` |
| Shell owned | `ResultSlidePanel` |
| Open mechanism | Query param `?result={resultId}` or inline selection |
| Data path | Reads student results for listing; `?result=` opens panel |
| Tests | `src/pages/AcademicRecordPage.test.tsx` |
| Forbidden moves | Do not reduce to placeholder; do not remove query-param behavior |

### 2.2 StudentDashboardPage

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Route | `/student`, `/student/dashboard` |
| Shell owned | `ResultSlidePanel` |
| Open mechanism | Notification metadata `resultId` Ã¢â€ â€™ opens panel directly |
| Data path | Notification metadata triggers panel open |
| Tests | `src/pages/StudentDashboardPage.teachers.test.jsx` |
| Forbidden moves | Do not remove notification-driven open; do not reduce to placeholder |

### 2.3 StudentHomeworkListPage

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Route | Student homework list |
| Shell owned | `ResultSlidePanel` |
| Open mechanism | Result selection from homework list Ã¢â€ â€™ `setSelectedResultId` |
| Tests | `src/pages/StudentHomeworkListPage.test.tsx` |
| Forbidden moves | Do not reduce to placeholder; this is a real entry owner |

### 2.4 StudentHomeworkDetailPage

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Route | Student homework detail |
| Shell owned | `ResultSlidePanel` |
| Open mechanism | Result selection from homework detail Ã¢â€ â€™ `setSelectedResultId` |
| Tests | `src/pages/StudentHomeworkDetailPage.test.tsx` |
| Forbidden moves | Do not reduce to placeholder; this is a real entry owner |

### 2.5 TeacherHomeworkDetailPage

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Route | Teacher homework detail |
| Shell owned | `ResultDetailModal` |
| Open mechanism | `setSelectedResultId` from submission table Ã¢â€ â€™ modal opens |
| Data path | Homework detail provides context; modal loads result |
| Tests | `src/pages/TeacherHomeworkDetailPage.test.tsx` |
| Forbidden moves | Do not remove homework-specific behavior; feedbackTiming is part of contract |

### 2.6 TeacherStudentHistoryPage

| Field | Value |
|-------|-------|
| Domain | saved-result |
| Route | `/teacher/student/:studentId/history` |
| Shell owned | None directly Ã¢â‚¬â€ navigates to `/result/:resultId` (deep link) |
| Open mechanism | `buildRoute('RESULT_DETAIL', { resultId })` navigation |
| Data path | Uses `useStudentDataAccessCheck` for student data access |
| Tests | `src/pages/TeacherStudentHistoryPage.test.tsx` |
| Forbidden moves | Do not remove student-access check; do not bypass route navigation |

## 3. Session/Post-Test Surfaces

### 3.1 StudentWaitingRoomPage

| Field | Value |
|-------|-------|
| Domain | session/post-test |
| Route | `/student-wait/:gameSessionId` |
| Data path | RTDB `game_sessions/{sessionId}`, session result handoff |
| Tests | `src/pages/StudentWaitingRoomPage.test.jsx` |
| Phase | Phase 2 (release-state governance) |

### 3.2 TestResultsModal

| Field | Value |
|-------|-------|
| Domain | session/post-test |
| Route | Mounted by waiting room |
| Data path | RTDB `test_results_by_student`, `test_results_by_session`, `lastTestId` fallback |
| Tests | `src/components/test/TestResultsModal.test.tsx`, `src/pages/StudentWaitingRoomPage.test.jsx` |
| Phase | Phase 2 |

### 3.3 StudentTestResultsPage

| Field | Value |
|-------|-------|
| Domain | session/post-test |
| Route | `/student-test-results/:sessionCode`, `/student/results/:sessionCode` |
| Data path | RTDB `game_sessions/{sessionCode}` plus permanent-result fallback |
| Tests | `src/pages/StudentTestResultsPage.test.tsx` |
| Phase | Phase 2 |

### 3.4 TeacherTestResultsPage

| Field | Value |
|-------|-------|
| Domain | session/post-test |
| Route | `/teacher-test-results/:sessionCode` |
| Data path | RTDB `game_sessions/{sessionCode}` plus session result loaders |
| Tests | `src/pages/TeacherTestResultsPage.test.tsx` |
| Phase | Phase 2 |

### 3.5 TeacherResultsDashboard

| Field | Value |
|-------|-------|
| Domain | session/post-test |
| Route | `/teacher/results` |
| Data path | RTDB `game_sessions` plus aggregated session-result loaders |
| Tests | `src/services/resultsService.test.ts` |
| Phase | Classification only in Phase 0 |

### 3.6 StudentResultsPage

| Field | Value |
|-------|-------|
| Domain | session/post-test |
| Route | `/student-results/:gameSessionId` |
| Data path | RTDB `game_sessions/{gameSessionId}` + `sessionStorage.playerId` |
| Tests | `src/pages/StudentResultsPage.test.jsx` (stale) |

### 3.7 TeacherFeedbackPage

| Field | Value |
|-------|-------|
| Domain | session/post-test |
| Route | `/teacher-feedback/:gameSessionId` |
| Data path | RTDB `game_sessions/{gameSessionId}` and feedback paths |
| Tests | `src/pages/TeacherFeedbackPage.test.jsx` (smoke only) |

### 3.8 StudentFeedbackPage

| Field | Value |
|-------|-------|
| Domain | session/post-test |
| Route | `/student-feedback/:gameSessionId` |
| Data path | RTDB `game_sessions/{gameSessionId}` + `sessionStorage.playerId` |
| Tests | None found |

## 4. Guest-Result/Claim Surfaces

### 4.1 GuestResultsPage

| Field | Value |
|-------|-------|
| Domain | guest-result/claim |
| Route | `/guest-results` (public) |
| Data path | RTDB `guest_results/{guestName}` |
| Backend-rule | Top-level read requires `auth != null`; child write unrestricted |
| Tests | `src/pages/GuestResultsPage.test.tsx` |
| Risk | Public route vs. auth-required backend read remains an accepted mismatch; stale CTA targets were corrected to `/`. |

### 4.2 ProfileCompletionPage

| Field | Value |
|-------|-------|
| Domain | guest-result/claim |
| Route | `/profile/complete` |
| Data path | `checkClaimableResults(email)` |
| Tests | None found |

### 4.3 ClaimResultsModal

| Field | Value |
|-------|-------|
| Domain | guest-result/claim |
| Route | Mounted by profile completion |
| Data path | `claimGuestResults(guestName, userId)` Ã¢â‚¬â€ promotes claimed rows into canonical `test_results/{resultId}` storage, rebuilds standard saved-result indexes, and leaves `migrateLegacyClaimedGuestResults()` as a privileged/manual helper for older nested claim rows |
| Tests | `src/components/guest/ClaimResultsModal.test.tsx`, `src/services/guestResultsService.test.ts` |

## 5. Live-Monitoring Surfaces

### 5.1 TeacherTestMonitorPage

| Field | Value |
|-------|-------|
| Domain | live-monitoring |
| Route | `/teacher-test/:sessionCode` |
| Data path | RTDB `game_sessions/{sessionId}` |
| Tests | `src/pages/TeacherTestMonitorPage.test.tsx`, `src/hooks/monitor/useMonitorControls.test.ts` |
| Phase | Phase 2 (release controls), Phase 3 (writing monitor) |

### 5.2 StudentDetailModal

| Field | Value |
|-------|-------|
| Domain | live-monitoring |
| Route | Mounted by monitor flows |
| Data path | RTDB session/player paths |
| Tests | Static audit only |

## 6. Writing Surfaces

### 6.1 TeacherGradingPage (queue)

| Field | Value |
|-------|-------|
| Domain | writing |
| Lifecycle | queue |
| Route | `/teacher/grading`, `/teacher/grading/writing` |
| Data path | Firestore `writing_submissions` query |

### 6.2 WritingGradingPage (editor)

| Field | Value |
|-------|-------|
| Domain | writing |
| Lifecycle | editor |
| Route | `/teacher/grading/writing/:submissionId` |
| Data path | Firestore `writing_submissions/{submissionId}` |

### 6.3 WritingResultDetailModal (result)

| Field | Value |
|-------|-------|
| Domain | writing |
| Lifecycle | result |
| Data path | Firestore `writing_submissions/{submissionId}` |

### 6.4 WritingResultView (result)

| Field | Value |
|-------|-------|
| Domain | writing |
| Lifecycle | result |
| Data path | Firestore `writing_submissions/{submissionId}` |

### 6.5 WritingTestResultsSection (result)

| Field | Value |
|-------|-------|
| Domain | writing |
| Lifecycle | result |
| Host | Mounted by `TeacherTestResultsPage` |

### 6.6 WritingPeekModal (monitor)

| Field | Value |
|-------|-------|
| Domain | writing |
| Lifecycle | monitor |
| Data path | RTDB live draft text |

### 6.7 SubmissionCompletePage (result bridge)

| Field | Value |
|-------|-------|
| Domain | writing |
| Lifecycle | result |
| Route | `/submission-complete` |
| Data path | Location state handoff Ã¢â€ â€™ `/student-test-results/:sessionCode` |

### 6.8 InlineWritingGrader (THCS editor)

| Field | Value |
|-------|-------|
| Domain | writing |
| Lifecycle | editor |
| Host | Mounted by `TeacherTestMonitorPage` for THCS |

## 7. Unwired/Demo Surfaces

### 7.1 WritingGradingModal (alternate/dormant)

| Field | Value |
|-------|-------|
| Domain | writing |
| Status | unwired |
| Resolution | remove now |
| Evidence | No active route; documented in `.knowns` only |

### 7.2 StudentResultOverview (alternate/dormant)

| Field | Value |
|-------|-------|
| Domain | writing |
| Status | unwired |
| Resolution | remove now |
| Evidence | Docs-only in current repo state |

### 7.3 StudentDetailedMarkup (alternate/dormant)

| Field | Value |
|-------|-------|
| Domain | writing |
| Status | unwired |
| Resolution | remove now |
| Evidence | Docs-only in current repo state |

### 7.4 FeedbackComponentsDemo

| Field | Value |
|-------|-------|
| Domain | unwired/demo |
| Status | demo-only |
| Route | `/demo/feedback` |
| Risk | **Writes live RTDB paths** (`courses/demo-course-789`, `test_results/demo-result-123`) |
| Resolution | remove now |

### 7.5 FeedbackDemoPage

| Field | Value |
|-------|-------|
| Domain | unwired/demo |
| Status | demo-only |
| Route | `/demo/feedback-system` |
| Resolution | remove now |

### 7.6 AcademicRecordDemoPage

| Field | Value |
|-------|-------|
| Domain | unwired/demo |
| Status | demo-only |
| Route | `/demo/academic-record` |
| Resolution | remove now |

### 7.7 DemoIndexPage

| Field | Value |
|-------|-------|
| Domain | unwired/demo |
| Status | demo-only |
| Route | `/demo` |
| Resolution | remove now |

## 8. Stale Producers and Config-Only References

- `StudentClassDetailPage.jsx` now repairs missing class-assignment `resultId` values in the background from existing student results, opens class-assignment results only through canonical `/result/:resultId` navigation, and renders a non-clickable pending state until a canonical id is available
- The old `routeSecurity.ts` `/student/results/history` residue was removed on 2026-03-25; historical notes still mention it for auditability
- `featureRegistry.ts` now includes `/guest-results`, `/teacher/results`, `/submission-complete`, and `/profile/complete`; treat it as observability metadata only, not the authoritative result-surface inventory

---

## Verification Bundle Summary (Task 0.3)

### Test File Existence Check

| File | Exists |
|------|--------|
| `src/pages/AcademicRecordPage.test.tsx` | Ã¢Å“â€¦ |
| `src/pages/StudentDashboardPage.teachers.test.jsx` | Ã¢Å“â€¦ |
| `src/pages/StudentHomeworkListPage.test.tsx` | Ã¢Å“â€¦ |
| `src/pages/StudentHomeworkDetailPage.test.tsx` | Ã¢Å“â€¦ |
| `src/pages/TeacherHomeworkDetailPage.test.tsx` | Ã¢Å“â€¦ |
| `src/pages/TeacherStudentHistoryPage.test.tsx` | Ã¢Å“â€¦ |
| `src/pages/ResultDetailPage.test.tsx` | Ã¢Å“â€¦ |
| `src/pages/StudentWaitingRoomPage.test.jsx` | Ã¢Å“â€¦ |
| `src/pages/TeacherTestResultsPage.test.tsx` | Ã¢Å“â€¦ |
| `src/components/results/LegacyResultDetailView.test.tsx` | Ã¢Å“â€¦ |
| `src/components/results/ResultSlidePanel.test.tsx` | Ã¢Å“â€¦ |
| `src/components/results/ResultDetailModal.test.tsx` | Ã¢Å“â€¦ |
| `src/components/results/SharedSavedResultCore.test.tsx` | Ã¢ÂÅ’ (created by task 2.2) |
| `src/pages/StudentTestResultsPage.test.tsx` | Ã¢Å“â€¦ |
| `src/hooks/test/useTestSubmission.test.ts` | Ã¢Å“â€¦ |
| `src/components/PrivateRoute.test.tsx` | Ã¢Å“â€¦ |
| `src/__tests__/auth/PrivateRoute.test.tsx` | Ã¢Å“â€¦ |
| `src/services/guestResultsService.test.ts` | Ã¢Å“â€¦ |
| `src/services/testResults.service.test.ts` | Ã¢Å“â€¦ |
| `src/__tests__/security/routeAccess.test.ts` | Ã¢Å“â€¦ |
| `src/__tests__/security/prd0040-security.emulator.test.ts` | Ã¢Å“â€¦ |

**Reconciliation (2026-03-25):** `SharedSavedResultCore.test.tsx` was created as part of task 2.2 and now exists. The frozen baseline above retains the original âŒ mark for historical accuracy.

---

## Enforcement Script Existence

| Script/Command | Exists |
|----------------|--------|
| `scripts/pre-commit-enforcement.js` | Ã¢Å“â€¦ |
| `scripts/run-security-tests.js` | Ã¢Å“â€¦ |
| `npm run test:security` | Ã¢Å“â€¦ |
| `npm run enforce:check` | Ã¢Å“â€¦ |
| `npm run check:utf8` | Ã¢Å“â€¦ |

---

## Verification Baseline Results (Task 0.3 Ã¢â‚¬â€ Frozen)

Baseline captured 2026-03-24. Any regression against these counts blocks merge.

| Bundle | ID | Files | Tests | Result |
|--------|----|-------|-------|--------|
| Phase-1 baseline | 0.3.1 | 9/9 | 32/32 | Ã¢Å“â€¦ PASS |
| Saved-result shells | 0.3.2 | 3/3 | 35/35 | Ã¢Å“â€¦ PASS |
| Session/post-test | 0.3.3 | 2/2 | 6/6 | Ã¢Å“â€¦ PASS |
| Security/auth | 0.3.4 | 5/5 | 130/130 | Ã¢Å“â€¦ PASS |
| Enforcement scripts | 0.3.5 | Ã¢â‚¬â€ | Ã¢â‚¬â€ | `enforce:check` Ã¢Å“â€¦; `test:security` 11/13 (2 pre-existing) |
| Test file existence | 0.3.6 | 20/21 | Ã¢â‚¬â€ | Only `SharedSavedResultCore.test.tsx` missing (task 2.2 deliverable) |

### Pre-Existing Failures (Not Regressions)

1. **`AccessDeniedPage.test.tsx`** Ã¢â‚¬â€ Mantine duplicate-text match issue in `test:security` bundle. Pre-existing; not caused by PRD-0040.
2. **`prd0040-security.emulator.test.ts`** Ã¢â‚¬â€ Requires Firebase emulator running. Expected to fail without `firebase emulators:exec`. Blocked on emulator availability (see Ã‚Â§Blocking Decisions below).

### Exact Commands (Frozen)

```bash
# 0.3.1 Phase-1 baseline
cmd /c npx vitest run src/pages/AcademicRecordPage.test.tsx src/pages/StudentDashboardPage.teachers.test.jsx src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx src/pages/TeacherHomeworkDetailPage.test.tsx src/pages/TeacherStudentHistoryPage.test.tsx src/pages/ResultDetailPage.test.tsx src/pages/StudentWaitingRoomPage.test.jsx src/pages/TeacherTestResultsPage.test.tsx --reporter=default

# 0.3.2 Saved-result shells
cmd /c npx vitest run src/components/results/LegacyResultDetailView.test.tsx src/components/results/ResultSlidePanel.test.tsx src/components/results/ResultDetailModal.test.tsx --reporter=default

# 0.3.3 Session/post-test
cmd /c npx vitest run src/pages/StudentTestResultsPage.test.tsx src/hooks/test/useTestSubmission.test.ts --reporter=default

# 0.3.4 Security/auth
cmd /c npx vitest run src/components/PrivateRoute.test.tsx src/__tests__/auth/PrivateRoute.test.tsx src/services/guestResultsService.test.ts src/services/testResults.service.test.ts src/__tests__/security/routeAccess.test.ts --reporter=default

# 0.3.5 Enforcement
npm run test:security
npm run enforce:check
```

---

## Stop Conditions (Task 0.4 Ã¢â‚¬â€ Frozen)

**Stop immediately and escalate if any of the following occur:**

1. **Fourth active saved-result shell appears.** Only three active shells are sanctioned: `ResultSlidePanel` (student), `ResultDetailModal` (teacher modal), `LegacyResultDetailView` (teacher/admin full-page). Any new shell is a stop condition.
2. **Any result surface is uncategorized.** Every surface touched by a code change must appear in `result-view-map.md` with a domain and status before the change lands.
3. **Any task needs a new result data path** not already documented in the preflight ledger above. New RTDB or Firestore paths require explicit documentation and backend-rule audit before coding.
4. **Any task needs a new result route not named in the PRD.** New routes require PRD amendment first.
5. **A deprecated wrapper would survive without a concrete removal gate.** Every deprecated component must have a target removal phase and gate documented.
6. **Backend-rule truth is being claimed without emulator-backed proof.** Until emulator tests pass, backend-rule claims must cite the `database.rules.json` text directly, not assume enforcement.

---

## Blocking Architectural Decisions (Task 0.5 Ã¢â‚¬â€ Recorded)

### Decision 1: `/result/:resultId` Student Ownership Gap

**Decision:** Phase 1 **carries** the current behavior. Students hitting `/result/:resultId` are redirected to `/student/academic-record?result={resultId}` (implemented in PRD-0039 Task 4.9). The `LegacyResultDetailView` ownership check (`useResultOwnershipCheck`) remains as the teacher/admin path guard. No changes to this flow in Phase 1.

**Rationale:** The redirect already protects students. The ownership check on the teacher/admin path is functional. Changing this in Phase 1 risks breaking the working redirect + slide panel flow.

**Implementation for task 3.1:** Task 3.1 implements whatever is decided here. Since we carry, task 3.1 documents the carry decision and adds a regression test confirming the redirect works.

### Decision 2: Guest-Result Claim - Canonical Promotion with Legacy Migration

**Decision:** Guest-result claim now **promotes into the canonical saved-result path**. `claimGuestResults()` writes claimed rows to `test_results/{resultId}`, rebuilds the normal saved-result fan-out indexes, and deletes the staging guest bucket only after the batch update succeeds. A privileged/manual `migrateLegacyClaimedGuestResults()` helper exists for environments that still contain the older nested claimed rows.

**Rationale:** The older compatibility-mapped destination was materially out of step with the rest of the saved-result architecture. Canonical promotion resolves that drift without adding a fourth storage contract, while the migration helper preserves recoverability for historical data.

### Decision 3: Public/Demo Feedback Routes

**Decision:** Public and demo feedback routes are **classified as demo-only** and scheduled for removal in Phase 8 (triage). No production traffic flows through them.

**Surfaces affected:** `FeedbackComponentsDemo`, `FeedbackDemoPage`, `AcademicRecordDemoPage`, `DemoIndexPage`.

**Risk:** `FeedbackComponentsDemo` wrote to live RTDB paths (`courses/demo-course-789`, `test_results/demo-result-123`). Cleanup is now complete in the repo, but the historical risk remains documented here for auditability.

### Decision 4: Manual Checks When PRD Requires Them

**Manual check protocol:**
1. Open the app in a browser with the relevant role (student/teacher/admin)
2. Navigate to the surface under test
3. Verify the expected behavior matches the PRD requirement
4. Screenshot or record the verification in the conversation log

**When manual checks apply:**
- Any change to entry-point behavior (how a parent host opens a shell)
- Any change to ownership/permission checks
- Any change to feedback display or generation triggers
- Any change to route redirects

### Decision 5: Runtime-Proof Work Blocked on Emulator

**Blocked items:**
- `prd0040-security.emulator.test.ts` Ã¢â‚¬â€ 4 tests require Firebase RTDB emulator
- Any backend-rule change verification
- Firestore rules verification for writing domain

**Mitigation:** Until emulator is available, backend-rule claims cite `database.rules.json` text directly. The emulator test file exists and will pass once `firebase emulators:exec` is available.

---

## Change Record (Task 0.6)

### PRD-0040 Implementation Packet Ã¢â‚¬â€ Change Record

| Field | Value |
|-------|-------|
| PRD | 0040 Ã¢â‚¬â€ Unified Result View Architecture and Governance |
| Implementation start | 2026-03-24 |
| Readiness gate status | **COMPLETE** |
| Preflight ledger | `documentation/architecture/prd0040-preflight-ledger.md` |
| Living docs | `result-view-map.md`, `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md`, `result-view-reuse.md` |
| Verification baseline | See Ã‚Â§Verification Baseline Results above |
| Stop conditions | See Ã‚Â§Stop Conditions above |
| Blocking decisions | See Ã‚Â§Blocking Architectural Decisions above |
| Manual check protocol | See Ã‚Â§Decision 4 above |

### Carried Risks

1. **Emulator unavailability** Ã¢â‚¬â€ 4 security emulator tests cannot run. Backend-rule verification relies on static rule file analysis.
2. **`AccessDeniedPage.test.tsx` pre-existing failure** Ã¢â‚¬â€ Mantine duplicate-text match. Not a regression; tracked for separate fix.
3. **Historical nested guest-claim rows may still exist** - environments that already used the old compatibility-mapped claim path may need a privileged/manual `migrateLegacyClaimedGuestResults()` run.
4. **Historical class-assignment rows may lack persisted `resultId`** Ã¢â‚¬â€ `StudentClassDetailPage.jsx` now fails closed instead of generating dead links, but older assignment progress rows still need backfill or replayed submissions before they can deep-link into saved results.

### Phase Sequence

| Phase | Scope | Depends On |
|-------|-------|-----------|
| 0.0 | Readiness gate | Ã¢â‚¬â€ |
| 1.0 | Lock saved-result baseline | 0.0 |
| 2.0 | Extract shared saved-result core | 1.0 |
| 3.0 | Security hardening, feedback parity | 2.0 |
| 4.0 | Live-session release model | 3.0 |
| 5.0 | Guest-result domain | 4.0 |
| 6.0 | Writing domain classification | 4.0 |
| 7.0 | Live-monitoring preservation | 4.0 |
| 8.0 | Legacy/demo triage | 4.0 |
| 9.0 | Enforcement and merge gate | 5.0Ã¢â‚¬â€œ8.0 |

---

## Phase-1 Baseline Lockdown (Task 1.0)

### 1.1 Ã¢â‚¬â€ Active Saved-Result Shell Count: Exactly 3

| # | Shell | Type | Status |
|---|-------|------|--------|
| 1 | `ResultSlidePanel` | Student slide-out panel | active |
| 2 | `ResultDetailModal` | Teacher modal | active |
| 3 | `LegacyResultDetailView` | Teacher/admin full-page body | active |

**`ResultDetailPage`** is wrapper-only (role-based routing, no data loading, no rendering logic). Confirmed NOT a fourth shell.

**Grep confirmation:** No other component in `src/` reads `test_results/{resultId}` via `onValue` or `getTestResult()` and renders a full result detail UI. `StudentFeedbackViewer`, `THCSPracticeView`, and `WritingPracticeView` reference the path but serve different purposes (feedback viewing and practice). The old `FeedbackComponentsDemo` residue has been removed.

### 1.2 Ã¢â‚¬â€ Host-Owner Registry

| Host Page | Shell Owned | Open Mechanism |
|-----------|-------------|----------------|
| `AcademicRecordPage` | `ResultSlidePanel` | Query param `?result={resultId}` or inline `setSelectedResultId` |
| `StudentDashboardPage` | `ResultSlidePanel` | Notification metadata `resultId` Ã¢â€ â€™ `setSelectedResultId` |
| `StudentHomeworkListPage` | `ResultSlidePanel` | Result selection Ã¢â€ â€™ `setSelectedResultId` |
| `StudentHomeworkDetailPage` | `ResultSlidePanel` | Result selection Ã¢â€ â€™ `setSelectedResultId` |
| `TeacherHomeworkDetailPage` | `ResultDetailModal` | Submission table row click Ã¢â€ â€™ `setSelectedResultId` |
| `TeacherStudentHistoryPage` | (deep-link) | `buildRoute('RESULT_DETAIL', { resultId })` Ã¢â€ â€™ `/result/:resultId` Ã¢â€ â€™ `ResultDetailPage` Ã¢â€ â€™ `LegacyResultDetailView` |

### 1.3 Ã¢â‚¬â€ Risk Path Enforcement Ledger

| Entry Path | Enforcement Layer | Notes |
|------------|-------------------|-------|
| `/result/:resultId` | `PrivateRoute` auth gate Ã¢â€ â€™ `ResultDetailPage` role check Ã¢â€ â€™ students redirected to `/student/academic-record?result={resultId}` Ã¢â€ â€™ teachers/admins get `LegacyResultDetailView` with `useResultOwnershipCheck` | Student ownership gap carried per Decision 1 |
| `?result={resultId}` on academic record | `PrivateRoute` + `StudentLayout` role gate Ã¢â€ â€™ `ResultSlidePanel` reads RTDB directly | No shell-level ownership check; relies on RTDB rules allowing owning student read |
| Dashboard notification Ã¢â€ â€™ panel | `PrivateRoute` + notification metadata Ã¢â€ â€™ `setSelectedResultId` Ã¢â€ â€™ `ResultSlidePanel` | Trusts notification metadata; hardening target in task 3.4 |
| Homework list/detail Ã¢â€ â€™ panel | `PrivateRoute` + homework page context Ã¢â€ â€™ `setSelectedResultId` Ã¢â€ â€™ `ResultSlidePanel` | Parent context provides resultId; no shell-level re-validation |
| Teacher homework Ã¢â€ â€™ modal | `PrivateRoute` + teacher role Ã¢â€ â€™ submission table Ã¢â€ â€™ `ResultDetailModal` | No additional ownership check in modal; relies on teacher RTDB read rule |
| Teacher history Ã¢â€ â€™ deep link | `PrivateRoute` + `useStudentDataAccessCheck` Ã¢â€ â€™ `buildRoute` Ã¢â€ â€™ `/result/:resultId` | Ownership check is on teacher-history page, not on target page |

### 1.4 Ã¢â‚¬â€ Phase-1 Non-Goals (Explicit)

These are NOT in scope for phases 0Ã¢â‚¬â€œ3:

1. **No session loader unification** Ã¢â‚¬â€ `testResults.service.ts` session/post-test loading stays separate
2. **No guest loader unification** Ã¢â‚¬â€ `guestResultsService.ts` stays separate
3. **No writing loader unification** Ã¢â‚¬â€ Firestore `writing_submissions` loading stays separate
4. **No live-monitor loader unification** Ã¢â‚¬â€ monitor RTDB paths stay separate
5. **No new admin-only result body** Ã¢â‚¬â€ admin reuses teacher shell with additive diagnostics only
6. **No risky admin mutation tools** Ã¢â‚¬â€ no ownership edit, metadata edit, score edit, answer edit, or raw payload edit
7. **No new result storage path** Ã¢â‚¬â€ all shells continue reading from `test_results/{resultId}`

### 1.5 Ã¢â‚¬â€ FR Baseline for Phase-1

FRs that Phase 1 can affect directly (per PRD sections 8.1Ã¢â‚¬â€œ8.4):

| FR Range | Scope | Current Status |
|----------|-------|---------------|
| FR-014Ã¢â‚¬â€œ017 | Shared core extraction, shell-and-core model | partial/unverified |
| FR-021Ã¢â‚¬â€œ027 | Feedback parity, display consistency | partial |
| FR-030Ã¢â‚¬â€œ036 | Security hardening, ownership, access-loss | partial/unverified |
| FR-042Ã¢â‚¬â€œ045A | Living doc governance | verified/partial |

FR closure matrix (`result-view-fr-closure-matrix.md`) was verified current in task 0.2. No stale rows found.

### 1.6 Ã¢â‚¬â€ Closure Checklist

- [x] Shell count confirmed: exactly 3 active + 1 wrapper
- [x] Host-owner list recorded with open mechanisms
- [x] Path-by-path enforcement ledger recorded
- [x] Phase-1 non-goals recorded (7 items)
- [x] FR baseline recorded and cross-checked against closure matrix
- [x] Change record linked (see Ã‚Â§Change Record above)
- [x] All items match living docs exactly

---

## SharedSavedResultCore Contract (Task 2.1)

### What the Shared Core Is

`SharedSavedResultCore` is a **presentation-only** component that renders the content body of a saved test result. It receives a loaded `TestResultRecord` and rendering callbacks Ã¢â‚¬â€ it never loads data, never checks ownership, never decides access. All 3 shells delegate their content rendering to this single component.

### Architecture

```
Shell (owns chrome, data loading, ownership, open/close)
  Ã¢â€â€Ã¢â€â‚¬ SharedSavedResultCore (presentation-only body)
       Ã¢â€Å“Ã¢â€â‚¬ ScoreSummarySection (score ring/cards, stat cards)
       Ã¢â€Å“Ã¢â€â‚¬ SectionBreakdownSection (THCS sections, IELTS passages)
       Ã¢â€Å“Ã¢â€â‚¬ AnswerMapSection (pill grid, question navigation)
       Ã¢â€Å“Ã¢â€â‚¬ QuestionReviewSection (answer cards, explanations, teacher feedback)
       Ã¢â€Å“Ã¢â€â‚¬ FeedbackSection (AI analysis, study recommendations, trend, class position)
       Ã¢â€â€Ã¢â€â‚¬ Empty/Error/Loading states (presentation only)
```

### Props Contract

```typescript
interface SharedSavedResultCoreProps {
  /** The loaded test result record. Never null when core renders. */
  result: TestResultRecord;

  /** Shell layout variant Ã¢â‚¬â€ affects spacing, sizing, and visual density */
  variant: 'slide-panel' | 'modal' | 'full-page';

  /** Which sections to render. Shells control visibility. */
  sections?: {
    scoreSummary?: boolean;       // default: true
    sectionBreakdown?: boolean;   // default: true
    answerMap?: boolean;          // default: true
    questionReview?: boolean;     // default: true
    feedbackDisplay?: boolean;    // default: true
    teacherFeedback?: boolean;    // default: false (only full-page shell enables this)
    writingPlaceholder?: boolean; // default: false (only full-page shell)
  };

  /** Formative feedback state Ã¢â‚¬â€ passed from shell's feedback management */
  feedbackState?: {
    formativeFeedback?: FormativeFeedback | null;
    feedbackLoading?: boolean;
    feedbackError?: string | null;
    needsUpgrade?: boolean;
    isEligibleForAIFeedback?: boolean;
    onRetryFeedback?: () => void;
  };

  /** Navigation callbacks Ã¢â‚¬â€ shells wire these to their own tab/scroll behavior */
  onNavigateToQuestion?: (questionNumber: number) => void;

  /** feedbackTiming from homework context Ã¢â‚¬â€ controls question breakdown visibility */
  feedbackTiming?: 'after_completion' | 'after_deadline' | 'never';

  /** Whether overview answer-map pills may navigate into the review surface */
  canNavigateToReview?: boolean; // default: true
}
```

### Sections Allowed in the Shared Core

| Section | Description | All 3 shells? |
|---------|------------|---------------|
| **ScoreSummarySection** | Score ring/percentage, stat cards (points, correct/incorrect/partial, time, scaled score for THCS, band score for IELTS) | Yes Ã¢â‚¬â€ each shell renders score differently today; core normalizes |
| **SectionBreakdownSection** | THCS section results, IELTS passage breakdown | Yes Ã¢â‚¬â€ `OverviewTab` and `ResultDetailModal` both render these |
| **AnswerMapSection** | Pill grid showing correct/incorrect/partial per question, with click-to-navigate | Yes Ã¢â‚¬â€ `OverviewTab` and `ResultDetailModal` (`QuestionPillsGrid`) both render |
| **QuestionReviewSection** | Per-question answer comparison, AI explanations, pending-review notices | Yes Ã¢â‚¬â€ `ReviewTab` and `ResultDetailModal` both render; `LegacyResultDetailView` has expandable cards |
| **FeedbackSection** | AI performance analysis, study recommendations, score trend, class position | Partial Ã¢â‚¬â€ `FeedbackTab` is most complete; `ResultDetailModal` has subset; `LegacyResultDetailView` has teacher-only |
| **TeacherFeedbackSection** | Per-question teacher feedback + overall teacher feedback | `LegacyResultDetailView` only Ã¢â‚¬â€ via `FeedbackDisplay` component |
| **WritingPlaceholder** | Writing/speaking submission placeholder | `LegacyResultDetailView` only Ã¢â‚¬â€ via `WritingSpeakingPlaceholder` |

### Presentation-Only Helpers Allowed to Move into Core

These are pure display helpers with no side effects:

- `getTestCategory()` Ã¢â‚¬â€ derive THCS/IELTS/generic from result
- `formatDate()` / `formatTime()` Ã¢â‚¬â€ timestamp formatting
- `formatAnswer()` Ã¢â‚¬â€ answer display formatting
- `getTypeBadge()` Ã¢â‚¬â€ type badge derivation
- `getPerformanceLevel()` Ã¢â‚¬â€ performance tier label/icon
- `getPillStatus()` Ã¢â‚¬â€ question pill color derivation
- `getIntentColor()` Ã¢â‚¬â€ score bar color derivation
- `formatScore()` Ã¢â‚¬â€ numeric score formatting
- `ScoreRing` Ã¢â‚¬â€ SVG score ring widget
- `StatCard` Ã¢â‚¬â€ stat card widget
- `AnalysisSection` Ã¢â‚¬â€ AI analysis section renderer

### Logic That MUST Stay Outside the Core

| Logic | Owner | Rationale |
|-------|-------|-----------|
| **Data loading** (RTDB `onValue`, `getTestResult` fallback) | Shell | FR-012: permission decisions stay outside |
| **Ownership check** (`useResultOwnershipCheck`) | Shell / parent host | FR-012, FR-030Ã¢â‚¬â€œ033 |
| **Feedback generation trigger** (`generateFormativeFeedbackForSavedResult`) | Shell | Side effect; shell owns retry state |
| **Feedback upgrade detection** (`needsAiFeedbackUpgrade`) | Shell | Decision logic |
| **Tab switching / navigation** | Shell | Shell chrome behavior |
| **Open/close behavior** (backdrop click, escape key, animation) | Shell | Shell chrome behavior |
| **Attempt switching** (`useTestAttempts`) | Shell | Data loading behavior |
| **Route navigation** (back button, redirect) | Shell / parent host | Navigation is shell-owned |
| **feedbackTiming evaluation** | Shell (passed as prop) | Homework-specific behavior |
| **Body scroll lock** | Shell | Platform behavior |
| **`calculateBandScore()` helper** | PROHIBITED from core | FR-028: deprecated helper must not be frozen into shared core |

### Stale-State Refresh Behavior

When a shell opens (or re-opens after being closed):
1. Shell sets loading state and starts fresh RTDB listener or one-shot fetch
2. Core receives new `result` prop Ã¢â€ â€™ re-renders with fresh data
3. No local caching in core Ã¢â‚¬â€ core is stateless with respect to result data
4. If feedback is generated while core is displayed, shell updates `feedbackState` props Ã¢â€ â€™ core re-renders

### Legacy Result Degradation

When a legacy result is missing expected fields:

| Missing Field | Core Behavior |
|---------------|--------------|
| `thcsData` | Skip THCS section breakdown; render generic score summary |
| `ieltsData` | Skip IELTS passage breakdown; render generic score summary |
| `formativeFeedback` | Skip AI analysis section; show "not available" state |
| `questionResults` | Skip answer map and question review; show empty state |
| `bandScore` | Omit band score stat card; show other cards only |
| `timeElapsed` | Show "Ã¢â‚¬â€" in time stat card |
| `context` | Skip context badge; render without homework context |
| `overallFeedback` | Skip teacher overall feedback section |
| `teacherFeedback` per question | Skip teacher feedback per question |
| `writingSubmission` / `speakingSubmission` | Skip writing placeholder |

### Compatibility Expectations Per Shell

| Shell | Sections Used | Shell-Specific Additions |
|-------|--------------|------------------------|
| `ResultSlidePanel` | All except teacherFeedback, writingPlaceholder | Tab switching (overview/review/feedback); attempt history; panel chrome |
| `ResultDetailModal` | All except teacherFeedback, writingPlaceholder | Modal chrome; feedbackTiming gating; inline mode |
| `LegacyResultDetailView` | All including teacherFeedback, writingPlaceholder | Full-page chrome; PDF certificate; print; return button; ownership redirect |

### Prohibited Actions

1. **No new centralized band-score helper.** The deprecated `calculateBandScore()` must not be frozen into core. Scoring follows `scoringConfiguration` path.
2. **No permission decisions in core.** Core renders states; it never decides who sees what based on role/ownership.
3. **No data fetching in core.** Core receives data via props only.
4. **No fourth shell.** Core is consumed by exactly 3 shells.
5. **No new result data path.** Core reads from `TestResultRecord` only Ã¢â‚¬â€ no direct RTDB/Firestore access.
