# IELTS Writing Feature-Family Stability Audit (2026-04-06)

## Purpose
This audit reviews the full IELTS Writing feature family against the current approved contracts and recent accepted UI/interaction decisions. It is report-only: no fixes are included in this document.

## Source-Of-Truth Precedence
1. Root IELTS Writing architecture docs under `documentation/architecture/ielts-writing/`
2. Explicitly accepted Stitch decisions, especially `.stitch/Verifying Current Development Branch.md`
3. Current runtime code and tests

When these sources disagree, the discrepancy is recorded as a contract conflict rather than silently treating current code as correct.

## Audit Coverage
The audit covers:
- teacher authoring and edit shell
- teacher grading orchestration and interaction surfaces
- published student and teacher result readers
- writing submission, grading draft, and publish compatibility services
- available automated verification coverage for these surfaces

## Verification Method
Code review plus existing automated tests only.

Attempted verification commands:
- `cmd /c npx vitest run src/components/writing-grading/EssayEditor.test.tsx src/components/writing-grading/CommentSidebar.test.tsx src/components/writing-grading/TabbedFeedbackEditor.test.tsx src/components/writing-grading/CriteriaScoringPanel.test.tsx src/components/writing-grading/WritingSuggestionsPanel.test.tsx src/components/writing-grading/WritingSuggestionsReviewModal.test.tsx --reporter=basic`
- `cmd /c npx vitest run src/components/writing-results/PublishedFeedbackPanel.test.tsx src/components/writing-results/WritingPublishedMarkupViewer.test.tsx src/components/writing-results/WritingStudentResultSurface.test.tsx src/components/writing-results/WritingTeacherResultSurface.test.tsx --reporter=basic`
- `cmd /c npx vitest run src/components/writing/WritingTestEditModal.test.tsx src/services/writingSubmissionService.test.ts src/services/writingSuggestionService.test.ts src/services/writingTestService.test.ts --reporter=basic`

All three suites failed before collection because `@testing-library/jest-dom` could not resolve `@adobe/css-tools` from `node_modules`. That failure is itself an audit finding because it removes the current regression safety net.

## Subsystem Matrix
| Subsystem | Status | Evidence summary |
| --- | --- | --- |
| Authoring and edit shell | Mixed | `WritingTestEditModal` still provides one modal-driven authoring surface, but verification is blocked by the current broken test harness. |
| Grading orchestration | Fail | `WritingGradingPage.tsx` owns the real publish gates, readiness UI, pending drafts, locks, suggestions, and task switching, but those rules do not currently resolve to one shared readiness contract. |
| Grading interaction surfaces | Fail | Scoring and feedback edit-mode behavior is under unresolved contract conflict between accepted Stitch decisions and current docs/code. |
| Published and result readers | Mixed | Primary published flows share `WritingPublishedMarkupViewer` and `PublishedFeedbackPanel`, but fallback readers still use a separate older tooltip model. |
| Data and compatibility services | Mixed | `publishGrading()` remains stricter than the page UI and protects publication integrity, but page indicators do not mirror that service contract. |
| Automated verification | Fail | Component and service tests exist, but the current test runtime cannot collect them because of the missing dependency. |

## Findings

### 1. Readiness UI and real grading gates have drifted apart
Severity: High
Category: Logic bug and architectural split

Evidence:
- `WritingGradingPage.tsx:596-612` gates publishing by requiring all non-voided tasks to have scores and a meaningful summary using `isHtmlMeaningful(...)`.
- `WritingGradingPage.tsx:2251-2254` also blocks `Submit Grading` when any pending comment draft exists.
- `WritingGradingPage.tsx:2574-2589` renders the `Readiness` block with a different rule set:
  - `Summary Required` uses raw truthiness instead of `isHtmlMeaningful(...)`
  - `Draft Comments` counts saved active comments only and ignores pending comment drafts
  - the block is active-task-local while publish gating is submission-wide across all non-voided tasks

Why this is unstable:
Teachers are shown a readiness signal that does not describe the actual publish contract. The page therefore exposes two different truths at once: the checklist and the real submit gate.

Required stabilization direction:
Create one shared readiness evaluator that both the visible checklist and the publish path consume.

### 2. Edit-mode scoring and feedback no longer have one authoritative contract
Severity: High
Category: Unresolved contract conflict

Evidence from accepted Stitch history:
- `.stitch/Verifying Current Development Branch.md:188-189` records the accepted direction that scoring should not use extra `Task X Criteria` / `Task X Feedback` wrappers, should use whole-band values `4 5 6 7 8 9`, and should remove the feedback toolbar.
- `.stitch/Verifying Current Development Branch.md:258-262` restates those decisions as the implementation target.

Evidence from current docs:
- `grading-editor-state-and-compatibility.md:269-272` now states the opposite contract: decimal scoring (`0.5` steps) and a restored live feedback toolbar.
- `lifecycle-and-surfaces.md:195` also documents the live feedback toolbar as part of the scoring workflow surface.

Evidence from current code:
- `CriteriaScoringPanel.tsx:69-76` uses `type="range"`, `min="0"`, `max="9"`, `step="0.5"`.
- `CriteriaScoringPanel.tsx:83-84` renders `Band 0` to `Band 9` range labels.
- `TabbedFeedbackEditor.tsx:212-278` renders a persistent toolbar with bold, italic, underline, list, undo, and redo actions.
- `featureRegistry.ts:202` still tracks `formatFeedback` as an active grading action.

Why this is unstable:
The feature family currently lacks a single authoritative edit-mode scoring contract. Regressions are inevitable because future work can honestly justify either design from existing project artifacts.

Required stabilization direction:
Resolve the contract conflict first, then align docs, code, tests, and mockup references to the single approved outcome.

### 3. Published fallback readers still bypass the shared annotation interaction model
Severity: Medium
Category: Architectural split

Evidence:
- `WritingStudentResultSurface.tsx:233-245` and `WritingTeacherResultSurface.tsx:166-177` use `WritingPublishedMarkupViewer` on the primary path but fall back to `AnnotatedEssayReadOnly` when only compatibility annotations are available.
- `AnnotatedEssayReadOnly.tsx:24-45` computes tooltip position relative to the local container instead of the newer shared overlay positioning contract.
- `AnnotatedEssayReadOnly.tsx:75-92` renders a local absolute tooltip with a separate lifetime and presentation model.

Why this is unstable:
Primary published readers and fallback readers do not share the same annotation interaction system. The user experience therefore depends on which storage artifact a result happens to have, not just on phase or viewer mode.

Required stabilization direction:
Either migrate fallback readers onto the shared published annotation contract or explicitly document them as intentionally degraded compatibility-only surfaces.

### 4. The grading page remains a very large coordinator without page-level contract tests
Severity: Medium
Category: Coverage gap and drift risk

Evidence:
- `src/pages/WritingGradingPage.tsx` is 2502 lines long.
- A simple token count shows 107 occurrences of `useState(`, `useEffect(`, `useMemo(`, or `useCallback(` in that file.
- There is no `WritingGradingPage.test.tsx`; current tests focus on leaf components such as `EssayEditor`, `CommentSidebar`, `CriteriaScoringPanel`, and `TabbedFeedbackEditor`.

Why this is unstable:
The page owns the actual integration behavior: load, lock ownership, pending comment drafts, suggestion review, readiness, publish gating, and task switching. Component-level tests do not prove that those rules compose correctly at the page boundary, which is where many of the recent regressions have appeared.

Required stabilization direction:
Add page-level integration coverage around the real coordinator behaviors instead of relying only on leaf-component regression tests.

### 5. The current automated test harness is broken for the writing feature family
Severity: Medium
Category: Verification infrastructure failure

Evidence:
- All targeted Vitest runs failed before test collection with the same resolution error: `Cannot find package '@adobe/css-tools' imported from ...\@testing-library\jest-dom\dist\index.mjs`.

Why this is unstable:
Even when tests exist, the writing feature family currently has no working fast verification path. That means regressions can be introduced without the repo providing usable automated feedback.

Required stabilization direction:
Repair the dependency/test-runtime issue first, then rerun the writing bundle and treat any newly revealed failures as real audit work items.

## Positive Findings
These areas currently provide a stronger foundation than the unstable surfaces above.

### A. Service-level publication rules remain stricter than the page UI
Evidence:
- `writingSubmissionService.ts:1088-1109` refuses publication unless each non-voided task has all required criterion scores and a meaningful task summary.

Why this matters:
Even with the current page-level readiness drift, incomplete grading data is still rejected by the canonical publish path.

### B. Primary published readers already share one main published markup path
Evidence:
- `WritingStudentResultSurface.tsx:233-244` and `WritingTeacherResultSurface.tsx:166-176` both route their primary published path through `WritingPublishedMarkupViewer`.
- `WritingStudentResultSurface.tsx:394` and `WritingTeacherResultSurface.tsx:229` use `PublishedFeedbackPanel` for the read-only feedback rail.

Why this matters:
The core published reader direction is already standardized. The main remaining result-surface drift is concentrated in the fallback reader path.

## Prioritized Stabilization Backlog

### 1. Contract-definition fixes
1. Resolve the scoring and feedback edit-mode contract conflict between accepted Stitch history and the current architecture docs.
2. Publish one canonical contract for edit-mode `Scoring` and `Suggestions`, including score scale, toolbar policy, wrapper policy, and topbar ownership.
3. Freeze the approved mockup references inside the root IELTS Writing architecture docs so future work does not need to infer intent from old conversation logs.

### 2. State-ownership fixes
1. Extract a shared readiness evaluator for task-level and submission-level grading state.
2. Make `Readiness`, button disabled states, and publish validation consume the same evaluation result.
3. Explicitly model whether pending comment drafts contribute to readiness and document that rule.

### 3. Interaction-surface fixes
1. Standardize fallback published annotation reading onto the same overlay and feedback-selection contract as the primary published markup viewer, or explicitly downgrade it as compatibility-only.
2. Review other compatibility-only surfaces for silent UI divergence from the main grading and published flows.

### 4. Service and compatibility fixes
1. Keep `publishGrading()` as the canonical publication gate.
2. Audit page/UI code that duplicates service rules and remove local rule forks where possible.
3. Verify compatibility projections stay derived from `publishedGrading` instead of becoming an alternate source of truth.

### 5. Test-gap fixes
1. Repair the missing `@adobe/css-tools` dependency or the test-runtime wiring that now breaks Vitest collection.
2. Add a page-level `WritingGradingPage` integration test suite for:
   - readiness vs publish gating
   - task switching with pending comment drafts
   - suggestion approval blocking
   - voided-task publish behavior
3. Keep component-level tests, but treat them as leaf-surface regression checks rather than proof of end-to-end grading behavior.

## Audit Conclusion
The IELTS Writing feature family has a usable canonical publish/service backbone, but its teacher grading surface is still unstable at the contract and orchestration layers. The most important next step is not another UI patch. It is to resolve the edit-mode contract conflict and collapse duplicate readiness/publish logic into shared evaluators that the whole page can trust.
