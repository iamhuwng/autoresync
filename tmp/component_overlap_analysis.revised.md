# Test Result View Architecture - Revised Research Audit

> Status: revised after repo-wide audit on 2026-03-24
> Scope: active result-detail surfaces, adjacent session-result views, writing-result views, and governance needed to prevent future drift
> Validation: static repo audit plus targeted Vitest pass (38 tests passed across ResultDetailModal, ResultSlidePanel, LegacyResultDetailView, StudentTestResultsPage)

---

## Executive Summary

The original analysis identified a real duplication problem, but it overstated both the inventory completeness and the architectural unification scope.

The most defensible conclusion is:
- Strong overlap exists across the 3 active `resultId`-driven detail viewers:
  - `src/components/results/ResultDetailModal.tsx`
  - `src/components/results/ResultSlidePanel.tsx`
  - `src/components/results/LegacyResultDetailView.tsx`
- `src/pages/StudentTestResultsPage.tsx` is adjacent, but not the same class of component. It is session-driven, retry-heavy, and supports recalculation and writing branching.
- Writing result views should not be folded into the same first-phase refactor. The active path is `WritingResultView`; `StudentResultOverview` and `StudentDetailedMarkup` currently appear unwired.
- Governance is required. Without an app-map document and a reuse-first rule, future work will continue to branch into parallel implementations.

---

## What Changed From The Original Analysis

### Corrections

1. The audit is not truly exhaustive unless it includes a usage/import sweep, not just identifier and semantic greps.
2. `StudentTestResultsPage` should not be treated as equivalent to the `resultId` viewers for a shared first-pass data hook.
3. `StudentResultOverview` was treated as active, but current repo search shows no imports/usages outside its own file.
4. `StudentDetailedMarkup` exists and was omitted from the writing inventory, though it also appears unwired.
5. `calculateBandScore()` is already centralized in `src/services/autoMarking.service.ts`; it is not a duplicated utility that needs extraction.
6. Several file line counts and line-saving estimates in the original markdown are stale.

### Findings That Still Hold

1. `ResultDetailModal`, `ResultSlidePanel`, and `LegacyResultDetailView` duplicate significant result-detail rendering concepts.
2. `LegacyResultDetailView` and `StudentTestResultsPage` provide a degraded feedback experience compared with the RTDB + AI-trigger flows.
3. `FeedbackTab` is materially richer than `FormativeFeedbackPanel`, though deprecation should be treated as a design decision, not a direct audit conclusion.
4. The AI feedback generation path is deduplicated safely in the service layer.

---

## Audit Methodology

A complete audit for this domain needs 3 passes, not 2.

### Pass 1 - Identifier Search

Useful for finding direct `resultId` detail views and feedback triggers.

Patterns validated:
- `getTestResult`
- `resultId`
- `formativeFeedback`
- `generateFormativeFeedbackForSavedResult`
- `/result/:resultId`

### Pass 2 - Semantic Search

Useful for catching adjacent result UIs under different models.

Patterns validated:
- `score`
- `band`
- `submission`
- `grading`
- `question` / `correct answer`
- `feedback`

### Pass 3 - Usage / Wiring Search

This is the missing pass from the original analysis.

It answers:
- Is the component actually used in the app?
- Is it a demo-only artifact?
- Is it active production UI, dead code, or an unfinished redesign?

Without this pass, an audit can confuse active viewers with unwired or demo-only components.

---

## Current App Map

### A. Canonical `resultId`-Driven Detail Surfaces

These are the active surfaces that display an existing saved result record by ID or deep link.

| Surface | Role / Context | Entry Points | Notes |
|---|---|---|---|
| `ResultSlidePanel` | Student | `AcademicRecordPage`, `StudentDashboardPage`, `StudentHomeworkDetailPage`, `StudentHomeworkListPage` | Active canonical student result-detail UI |
| `ResultDetailModal` | Teacher | `TeacherHomeworkDetailPage` | Active teacher modal result-detail UI |
| `LegacyResultDetailView` | Teacher + super_admin | `ResultDetailPage` via `/result/:resultId` | Full-page route-backed UI |

### B. Session / Post-Test Result Surfaces

These are active, but they are not simple `resultId` detail views.

| Surface | Role / Context | Why Separate |
|---|---|---|
| `StudentTestResultsPage` | Student post-test page | Loads by `sessionCode`, retries permanent result lookup, can recalculate from session answers, branches to writing |
| `TestResultsModal` | Student waiting room | Multi-path session result fetch and waiting-room constraints |
| `StudentDetailModal` | Teacher live monitoring | Monitoring, re-marking, accommodation, live session context |
| `StudentResultsPage.jsx` | Legacy student post-game leaderboard | Session/leaderboard view, not a saved-result detail viewer |

### C. Writing Result Surfaces

| Surface | Current Status | Notes |
|---|---|---|
| `WritingResultView` | Active | Current student writing result renderer from `StudentTestResultsPage` |
| `WritingResultDetailModal` | Active | Teacher modal opened from `WritingTestResultsSection` |
| `StudentResultOverview` | Unwired | No production imports/usages found in repo-wide search |
| `StudentDetailedMarkup` | Unwired | Detailed markup reader exists but no production imports/usages found |

### D. Demo-Only / Ancillary Feedback UIs

| Surface | Current Status | Notes |
|---|---|---|
| `StudentFeedbackViewer` | Demo-only | Referenced by `FeedbackComponentsDemo.tsx` only |
| `TeacherFeedbackManager` | Demo-only | Referenced by `FeedbackComponentsDemo.tsx` only |

---

## Entry-Point Evidence

### Student

`ResultSlidePanel` is already the shared student detail surface across multiple entry points:
- `src/pages/AcademicRecordPage.tsx`
- `src/pages/StudentDashboardPage.jsx`
- `src/pages/StudentHomeworkDetailPage.tsx`
- `src/pages/StudentHomeworkListPage.tsx`

This is the strongest evidence that student-side consolidation is already partially successful.

### Teacher

Teacher-side access is fragmented:
- `src/pages/TeacherHomeworkDetailPage.tsx` -> `ResultDetailModal`
- `src/pages/TeacherStudentHistoryPage.tsx` -> `/result/:resultId` -> `ResultDetailPage` -> `LegacyResultDetailView`
- `src/pages/TeacherTestMonitorPage.tsx` -> `StudentDetailModal`
- `src/components/writing-results/WritingTestResultsSection.tsx` -> `WritingResultDetailModal`

### Admin / super_admin

There is no separate admin result-detail UI today.

`/result/:resultId` is protected for `student`, `teacher`, and `super_admin`, and `ResultDetailPage` routes non-students into `LegacyResultDetailView`.

Implication:
- Admin does not need a separate first-phase result shell.
- Admin can share the teacher full-page shell in the unification plan.

---

## Corrected Overlap Assessment

### Cluster 1 - High-Overlap `resultId` Viewers

These 3 are the best first-phase unification target:
- `ResultDetailModal`
- `ResultSlidePanel`
- `LegacyResultDetailView`

Shared concerns:
- saved-result loading
- score summary rendering
- question review rendering
- answer formatting
- AI feedback display decisions
- route or context badges
- certificate or secondary controls around the same underlying result data

Important differences:
- student shell vs teacher shell vs full-page shell
- tabbed layout vs single-scroll layout
- RTDB real-time listener present in `ResultDetailModal` and `ResultSlidePanel`, absent in `LegacyResultDetailView`
- AI auto-trigger / upgrade present in `ResultDetailModal` and `ResultSlidePanel`, absent in `LegacyResultDetailView`

### Cluster 2 - Adjacent But Distinct Session Result Page

`StudentTestResultsPage` should not be folded into the same first-pass hook.

Reasons:
- keyed by `sessionCode`, not `resultId`
- reads `game_sessions/{sessionCode}` directly
- retries when permanent result is not available yet
- recalculates a fallback score from live answer data
- supports writing-result branch to `WritingResultView`
- includes `courseAverage` and post-test page concerns

Best interpretation:
- It may reuse a future presentational body or shared subcomponents.
- It should not define phase-1 architecture.

### Cluster 3 - Writing Domain

Writing should stay separate in phase 1.

Reasons:
- different data model (`WritingSubmission`)
- different review primitives (criteria, annotations, comments, audit trail)
- separate teacher grading route
- currently mixed active and unwired components

Phase 1 here should be cleanup and active/wired status confirmation, not unification with MCQ/mixed result-detail viewers.

---

## Utility Duplication - Corrected View

### Real duplication worth extracting

1. `formatAnswer()` style helper logic still appears in:
- `ResultDetailModal`
- `LegacyResultDetailView`
- `ReviewTab`
- `StudentDetailModal`
- `TestResultsModal`
- `StudentTestResultsPage`

This is a good extraction candidate.

### Not actually duplicated in the way originally claimed

1. `calculateBandScore()` is already centralized in `src/services/autoMarking.service.ts`.
2. `ResultSlidePanel` does not define or call its own `calculateBandScore()` helper.
3. `ResultDetailModal` does not define or call its own `calculateBandScore()` helper.

Conclusion:
- Keep `calculateBandScore()` where it is.
- Do not create a new `resultUtils.ts` just to move an already-shared function.

---

## Security and Permission Model

The unification plan is sufficient only if security stays at the shell/hook boundary.

### Recommended boundary

- Shared body: pure rendering from already-authorized data.
- Role/context shells: own permission checks, route semantics, and context-specific actions.
- Data hooks: validate access path and loading strategy for their own domain.

### What this means in practice

1. Student shell
- uses the canonical student slide-panel chrome
- supports attempt switching and student-facing tabs

2. Teacher/admin full-page shell
- serves `/result/:resultId`
- admin reuses teacher full-page shell unless a real admin-specific requirement appears

3. Teacher modal shell
- can share the same body but preserve homework-specific modal presentation

4. Session/post-test shells
- remain separate until explicitly migrated

This preserves security and avoids role-branch explosion inside one giant component.

---

## Governance Gaps That Need To Be Fixed

The codebase needs explicit documentation and rules so future work does not create parallel viewers again.

### Required governance artifacts

1. Result View Map document
- A living doc that lists every active result surface, its route, role, data source, and owning file.
- Must distinguish active, unwired, legacy, and demo-only components.

2. Result View Reuse rule
- Before creating any new result-detail UI, the developer must map the request onto the existing viewer matrix.
- If none fits, the PRD must explain why.

3. PRD checklist addition
- Every result-related PRD must include:
  - target entry points
  - target roles
  - existing component chosen for reuse or extension
  - explicit non-goals for unaffected result surfaces

4. Task implementation checklist
- Before coding, grep for:
  - result viewer entry points
  - imports/usages of the candidate viewer
  - existing tests for the viewer

5. Dead-code status tracking
- Unwired viewers should be tagged as either:
  - planned next-phase work
  - archive / remove
  - keep for future, not production

### Recommended enforcement rules

#### Rule A - Reuse Before New Result UI
If a task changes how a student, teacher, or admin views a saved result:
1. Read the Result View Map.
2. Identify the existing canonical surface.
3. Reuse or extend that surface unless the PRD states why it cannot be used.
4. Update the map if a surface is added, removed, or re-scoped.

#### Rule B - Active vs Unwired Inventory Check
If a component is included in a migration or architecture audit:
1. Confirm whether it is production-used, demo-only, or unwired.
2. Do not plan migrations around unwired code without product confirmation.

#### Rule C - Context Boundary Rule
Do not merge `resultId`-driven viewers with session/post-test viewers in the same first-phase refactor unless the loader contracts are first made equivalent.

#### Rule D - Shared Core Ownership
The shared core may own rendering and result-derived presentation rules.
The shell owns:
- role/context permissions
- routing/deep-link semantics
- modal/page/panel chrome
- workflow-specific controls

---

## Revised Implementation Plan

### Phase 0 - Documentation and Map First

Deliverables:
- Create `documentation/architecture/result-view-map.md`
- Add `documentation/rules/result-view-reuse.md`
- Tag active vs unwired vs demo-only result surfaces

### Phase 1 - Unify the 3 Active `resultId` Viewers

Target files:
- `ResultDetailModal`
- `ResultSlidePanel`
- `LegacyResultDetailView`

Deliverables:
- shared render body for saved-result display
- shared answer-format helper
- shared AI-feedback display contract where appropriate
- shell-specific controls preserved

### Phase 2 - Selective Reuse In `StudentTestResultsPage`

Do not force the same loader hook.

Instead:
- reuse only pure presentational pieces that fit the session-driven page
- keep session lookup, retry, fallback recalculation, and writing branch local

### Phase 3 - Clean Up Writing Surface Inventory

Decide fate of:
- `StudentResultOverview`
- `StudentDetailedMarkup`

Only after that should writing-view consolidation be assessed.

### Phase 4 - Harden Governance

Add requirements to future PRDs and implementation tasks so result-view work cannot bypass the canonical map.

---

## Test and Verification Notes

Targeted tests run successfully:
- `src/components/results/ResultDetailModal.test.tsx`
- `src/components/results/ResultSlidePanel.test.tsx`
- `src/components/results/LegacyResultDetailView.test.tsx`
- `src/pages/StudentTestResultsPage.test.tsx`

Result:
- 4 test files passed
- 38 tests passed

Interpretation:
- The current system is not broken in the tested flows.
- The problem is architectural drift, inventory accuracy, and future maintainability.

---

## Final Recommendation

The amended plan is sufficient if scoped as follows:

### Sufficient scope

Unify active saved-result detail features across:
- student slide-panel view
- teacher modal view
- teacher/admin full-page route view

### Not sufficient if expanded without more design work

Do not claim the same first-pass plan also unifies:
- `StudentTestResultsPage`
- writing-result readers
- teacher monitoring modal
- feedback-editor/demo surfaces

### Decision

Proceed with a PRD for:
- unified active `resultId` result-detail architecture
- shell separation by role/context
- governance rules and app-map documentation
- deferred handling for session/post-test and writing domains
