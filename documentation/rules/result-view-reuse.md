# Result View Reuse Rule

Use this rule for every result-related task, PRD, or implementation. The goal is to stop new work from flattening active workflows, bypassing ownership contracts, or treating dormant/demo surfaces as canonical.

Companion docs:
- `documentation/tasks/0040-prd-unified-result-view-architecture-and-governance.md`
- `documentation/architecture/result-view-map.md`
- `documentation/architecture/result-view-permission-matrix.md`
- `documentation/architecture/result-view-fr-closure-matrix.md`

## 0. Review Gate

Reviewers block merge for any result-related change if any required artifact is missing:
- the updated result-view map
- the updated permission matrix
- the updated FR closure matrix when PRD-0040 closure status changes
- the required change record in `documentation`, Knowns, or Antigravity Knowledge when the work deviates from the PRD

Missing any of the above means the task is not review-complete.

## 1. Required Before Coding

Every result-related task must name:
- the canonical surface
- the domain: `saved-result`, `session/post-test`, `guest-result/claim`, `writing`, `live-monitoring`, or `unwired/demo`
- the exact route or host page
- the exact parent entry owners that open or host the surface
- the exact data path(s) read or written
- the exact backend rule dependency
- the exact tests to run or add
- the exact docs to update
- the explicit non-goals

If any of those are missing, the task is not ready.

## 2. Canonical Surface Checklist

### Saved-result work

You must state whether the target is:
- `ResultSlidePanel`
- `ResultDetailModal`
- `LegacyResultDetailView`
- `ResultDetailPage` only as a wrapper, never as a fourth shell

You must also name the existing host owners:
- `AcademicRecordPage`
- `StudentDashboardPage`
- `StudentHomeworkListPage`
- `StudentHomeworkDetailPage`
- `TeacherHomeworkDetailPage`
- `TeacherStudentHistoryPage`

### Session / post-test work

You must state whether the target is:
- `StudentWaitingRoomPage`
- `TestResultsModal`
- `StudentTestResultsPage`
- `TeacherTestResultsPage`
- another adjacent session result or feedback page

You may not describe these surfaces as plain `resultId` readers unless a specific data-contract change proves that.

### Guest / claim work

You must state whether the task affects:
- `GuestResultsPage`
- `ProfileCompletionPage`
- `ClaimResultsModal`
- `guestResultsService`

You must name the compatibility story for non-canonical guest claim storage.

### Writing work

You must classify the target lifecycle role:
- `draft`
- `monitor`
- `queue`
- `editor`
- `result`
- `alternate/dormant`

You may not start from writing result viewers only. You must say whether the task touches:
- RTDB draft/autosave state
- Firestore `writing_submissions`
- monitor peek/reopen/auto-submit
- grading queue/editor
- THCS inline writing

## 3. Mandatory Safety Questions

Before changing any result-related surface, answer all of these:

1. Does the task rely on route gating where ownership is actually enforced elsewhere?
2. Does the task trust a query param, notification payload, route segment, or sessionStorage value?
3. Does the task read RTDB `test_results/{resultId}` directly?
4. Does the task read `game_sessions/{sessionId}` or `test_results_by_session/{sessionCode}` and assume privacy that backend rules do not enforce?
5. Does the task touch guest claim storage or demo/public routes?
6. Does the task assume a dormant or `.knowns`-referenced surface is actually runtime-reachable?

If any answer is "yes", the task must call it out explicitly in the task doc or PRD before coding starts.

## 4. Required Docs To Update

Result-related changes must update, in the same change set:
- `documentation/architecture/result-view-map.md`
- `documentation/architecture/result-view-permission-matrix.md`
- `documentation/architecture/result-view-fr-closure-matrix.md` when the change affects PRD-0040 closure status
- the governing PRD when architecture truth changes

## 5. Required Verification

At minimum, choose the relevant anchors:
- `src/components/results/ResultSlidePanel.test.tsx`
- `src/components/results/ResultDetailModal.test.tsx`
- `src/components/results/LegacyResultDetailView.test.tsx`
- `src/pages/ResultDetailPage.test.tsx`
- `src/pages/AcademicRecordPage.test.tsx`
- `src/pages/StudentDashboardPage.teachers.test.jsx`
- `src/pages/StudentHomeworkListPage.test.tsx`
- `src/pages/StudentHomeworkDetailPage.test.tsx`
- `src/pages/TeacherHomeworkDetailPage.test.tsx`
- `src/pages/TeacherStudentHistoryPage.test.tsx`
- `src/pages/StudentWaitingRoomPage.test.jsx`
- `src/pages/StudentTestResultsPage.test.tsx`
- `src/pages/TeacherTestResultsPage.test.tsx`
- `src/services/testResults.service.test.ts`
- `src/services/guestResultsService.test.ts`
- `src/__tests__/security/prd0040-security.emulator.test.ts` when the task relies on backend-rule truth rather than route-only behavior

If the task involves ownership, guest claim, route tampering, or demo/public risk, static route tests are not enough by themselves.

## 6. Unwired/Demo Triage and Removal Policy

For unwired or demo-only result surfaces, each surface must be classified as exactly one of:
- `remove now`
- `keep for named future task`
- `convert to documented legacy wrapper`

Default policy:
- `remove now` is the default unless a named approved future task keeps the surface alive
- demo/public result surfaces do not get a free pass just because they are demos
- open-ended "maybe later" retention is not allowed

Before removing any result surface, record:
- a recoverable git version reference
- a removal note in the living docs
- a matching change record in `documentation`, Knowns, or Antigravity Knowledge

## 7. Forbidden Shortcuts

Do not:
- invent a fourth saved-result shell
- treat host pages as disposable wrappers
- flatten session/post-test flows into a plain `resultId` loader
- assume backend rules enforce assigned-teacher ownership when RTDB currently allows broader teacher reads
- normalize guest claim into canonical result storage without an explicit migration story
- promote demo/public surfaces into production anchors
- treat `.knowns`, `.backup`, or build-cache references as proof of runtime reachability
- start writing architecture from result viewers only

