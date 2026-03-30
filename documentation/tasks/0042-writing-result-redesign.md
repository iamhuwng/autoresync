# 0042 Writing Result Redesign

## Status

- Status: implemented
- Primary implementation date: 2026-03-30
- Purpose of this document: implementation record, crosscheck guide, and future-reference summary for the IELTS Writing result redesign

This file is not just the original plan. It records what was actually implemented, what governs the feature now, where the code lives, what was verified, and what still remains outside the completed change set.

## Problem Statement

The previous IELTS Writing result surfaces were not a trustworthy representation of the actual grading flow:

- they did not align well with the canonical output shape from the grading tool
- they leaned too heavily on generic saved-result patterns that assume auto-graded question review
- they did not clearly separate unpublished versus published Writing feedback
- they risked leaking or implying draft/placeholder grading states that do not match the intended Writing workflow
- they did not clearly reflect the unified visibility and ownership rules already governing the broader result system

The redesign needed to be anchored on the grading tool, Writing-specific result data, and the app's real teacher/student shells.

## Important Interpretation Decision

The approved Stitch mockups are **structural guidance**, not literal pixel targets.

That means:

- the Stitch work defines information hierarchy, layout intent, module ordering, and state shape
- the shipped UI should still respect the actual app's teacher-shell language and student-view design standard
- the implementation should not force the app to visually mimic any mismatch or artifact from the mockup images

This was explicitly clarified during implementation and is now part of the intended contract.

## Final Product Contract

### High-level outcome

IELTS Writing result readers now use dedicated Writing surfaces rather than stretching generic score/review/feedback shells to represent manual grading.

### Public phase model

Only **two public phases** are allowed in both teacher and student result readers:

- `pending-review`
- `published`

Teacher draft ownership and lock conflict are **internal operational states** inside pending review. They are not a third public phase.

### No route expansion

No new major result route was introduced for this redesign.

Existing hosts were preserved and made Writing-aware:

- student full-page results
- student saved-result slide panel
- teacher session Writing table
- teacher Writing detail modal
- generic teacher result-detail hosts that can encounter Writing rows

### Immediate post-submit behavior

`SubmissionCompletePage` remains acknowledgement-only for pure IELTS Writing. It is **not** the Writing result page.

## Authoritative Reference Order

When future work needs to verify or extend this feature, read sources in this order:

1. `.knowns/docs/specs/ielts-writing-result-surfaces-2026-03-30.md`
2. `.knowns/docs/architecture/scheme/ielts-writing-current-state-scheme.md`
3. `.knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md`
4. `.knowns/docs/architecture/results-academic-record.md`
5. `documentation/design/student-view-design-standard.md`
6. `documentation/architecture/ui-design-standards.md`

Historical logs, workspace-sync artifacts, and old placeholder UX assumptions are background evidence only. They are not source of truth.

## Stitch References

### Teacher

- Pending Review: project `16045306118408829321`, screen `05c0abd5f36f453e9034b03d35ffd66c`
- Published: project `16045306118408829321`, screen `1608486d50c1443b936de8c3d8f82921`

### Student

- Published baseline: project `6940178863508396499`, screen `1c9d1e92ca12494a8209f308076c7b6b`

### Accepted student amendments from mockup review

- `Task Summary` is a separate right-column module
- `Task Summary` is expanded by default
- `Criteria Feedback` sits below `Task Summary`
- `Criteria Feedback` is collapsed by default
- band score area is compact, not a hero
- band score area must respond logically to the number of active tasks

## Final UX Contract By View

### Student view

#### Pending review

Must show:

- submission snapshot
- task prompt information
- essay preview
- timing/word-count context
- waiting-state explanation / "what happens next"

Must not show:

- band score
- teacher feedback
- published markup
- criteria feedback
- draft content

#### Published

Must show:

- compact band strip
- teacher metadata when available
- main-column response / markup area
- right-column `Task Summary`
- right-column collapsed `Criteria Feedback`
- published comments / markup only

Must not show:

- unpublished draft-only teacher state
- non-published comments
- generic auto-graded question-review scaffolding

### Teacher view

#### Pending review

Must show:

- submission facts
- source / visibility / ownership context
- essay preview
- correct action state:
  - `Grade now`
  - `Resume draft`
  - read-only explanation

#### Published

Must show:

- compact band strip
- per-task modules derived from active tasks
- task summaries
- criteria feedback
- ordered comments
- markup reader
- audit/version context
- `Reopen` only when allowed

Must not rely on:

- fixed Task 1 / Task 2 summary columns
- generic score-summary assumptions
- raw teacher id fields as authority

## Data Contract

### Canonical source

The canonical Writing detail source is Firestore:

- `writing_submissions/{submissionId}`
- especially `publishedGrading`

### Precedence rules

1. `publishedGrading`
2. legacy `grading`
3. legacy `annotations`
4. RTDB compatibility snapshot only as degraded fallback

### Important implications

- Writing result readers must not infer final published state from generic result-shell assumptions alone
- Writing result readers must not read draft content into student-visible state
- published markup comes from canonical published grading artifacts, not generic saved-result question review

### Runtime fallback rule

If canonical Firestore detail cannot be loaded at runtime, result shells may synthesize a read-only Writing submission from the RTDB snapshot so the UI fails soft instead of blanking or crashing.

This is especially important for:

- degraded environments
- older compatibility rows
- test environments

### Student pending-review optimization

For student-facing pending-review rows in the saved-result shell, the surface may render directly from the RTDB-derived fallback without waiting for Firestore because unpublished rows do not need canonical published grading data.

## Visibility And Permission Rules

The redesign preserves the broader unified result-governance model.

### Authority rules

- teacher access is based on normalized ownership plus assignment access
- raw `teacherId`, `assigningTeacherId`, and `selectedTeacherId` are not authoritative by themselves
- solo practice remains student-owned and teacher-read-only where visible
- unresolved rows remain excluded from teacher-owned result views/history

### Student release gating

Student Writing result readers must still honor the session/saved-result release contract before showing published feedback.

In practice:

- published Writing data is only revealed when release state permits it
- pending-review student surfaces remain blank with respect to grading output

## Implementation Map

### Shared adapter and types

Primary file:

- `src/components/writing-results/writingResultSurface.ts`

What it owns:

- `WritingResultPhase`
- `WritingResultViewerMode`
- `WritingResultSurfaceData`
- `WritingResultTaskData`
- canonical build logic from submission data
- published-versus-legacy precedence
- task-count-aware band-summary generation
- RTDB snapshot fallback synthesis

### Read-only markup renderer

Primary file:

- `src/components/writing-results/WritingPublishedMarkupViewer.tsx`

Purpose:

- render published TipTap-based markup safely
- support marked/original switching
- avoid old HTML injection assumptions

### Student result body

Primary file:

- `src/components/writing-results/WritingStudentResultSurface.tsx`

Key behavior:

- student-shell layout inside `.student-view-root`
- compact band strip
- published right rail ordering
- pending-review waiting state
- page and panel variants

### Teacher result body

Primary file:

- `src/components/writing-results/WritingTeacherResultSurface.tsx`

Key behavior:

- teacher-shell visual language
- pending/published body reuse
- task-aware band strip
- audit/task summary/criteria modules
- action hooks for grading and reopen

### Student full-page integration

Primary file:

- `src/pages/StudentTestResultsPage.tsx`

What changed:

- Writing branch now uses the dedicated Writing surface
- page stays within student-view design language
- release gating controls published data visibility
- Writing-specific actions are tracked

### Student saved-result panel integration

Primary file:

- `src/components/results/ResultSlidePanel.tsx`

What changed:

- Writing rows bypass generic `SharedSavedResultCore`
- Writing rows load canonical Firestore submission lazily
- Writing rows can use RTDB-derived fallback submission when needed
- pending-review student rows can render without waiting for Firestore
- generic tab-bar assumptions are removed for Writing

### Teacher Writing session list integration

Primary file:

- `src/components/writing-results/WritingTestResultsSection.tsx`

What changed:

- row model now uses Writing surface semantics instead of fixed `task1Band` / `task2Band`
- status derives from phase + draft state + viewer mode
- per-task bands are dynamic
- teacher modal opens with viewer-mode-aware behavior

### Teacher Writing modal integration

Primary file:

- `src/components/writing-results/WritingResultDetailModal.tsx`

What changed:

- modal body now uses the teacher Writing surface
- no longer assumes old placeholder/result-view structure

### Generic teacher result-host integration

Primary files:

- `src/components/results/ResultDetailModal.tsx`
- `src/components/results/LegacyResultDetailView.tsx`

What changed:

- these hosts detect Writing rows
- Writing rows delegate to dedicated Writing teacher result body
- Writing detail is lazy-loaded so the generic host can mount safely without boot-time Firestore side effects

### Feature tracking

Primary file:

- `src/config/featureRegistry.ts`

Added/updated actions:

- `returnToDashboard`
- `printWritingResults`
- `switchWritingMarkupMode`
- `toggleWritingCriteriaFeedback`

## Concrete Files Added

- `src/components/writing-results/writingResultSurface.ts`
- `src/components/writing-results/WritingPublishedMarkupViewer.tsx`
- `src/components/writing-results/WritingStudentResultSurface.tsx`
- `src/components/writing-results/WritingTeacherResultSurface.tsx`

## Concrete Files Updated

- `src/components/writing-results/WritingResultView.tsx`
- `src/components/writing-results/WritingResultDetailModal.tsx`
- `src/components/writing-results/WritingTestResultsSection.tsx`
- `src/pages/StudentTestResultsPage.tsx`
- `src/components/results/ResultSlidePanel.tsx`
- `src/components/results/ResultDetailModal.tsx`
- `src/components/results/LegacyResultDetailView.tsx`
- `src/config/featureRegistry.ts`

## Crosscheck Matrix

| Requirement | Implemented | Where to verify |
|---|---|---|
| Two public phases only | yes | `writingResultSurface.ts` |
| Student pending review is blank with respect to grading output | yes | `WritingStudentResultSurface.tsx`, `ResultSlidePanel.tsx`, `StudentTestResultsPage.tsx` |
| Student published uses right-column `Task Summary` above collapsed `Criteria Feedback` | yes | `WritingStudentResultSurface.tsx` |
| Band strip is compact and task-count-aware | yes | `writingResultSurface.ts`, student/teacher surfaces |
| Writing uses canonical Firestore submission detail | yes | `ResultSlidePanel.tsx`, `ResultDetailModal.tsx`, `LegacyResultDetailView.tsx`, `WritingTestResultsSection.tsx` |
| RTDB snapshot fallback exists | yes | `writingResultSurface.ts`, host integrations |
| Generic saved-result core is bypassed for Writing | yes | `ResultSlidePanel.tsx`, teacher detail hosts |
| Unified visibility rules preserved | yes | teacher result hosts plus `classifyTeacherResultVisibility` usage |
| SubmissionCompletePage remains acknowledgement-only | preserved | see architecture/result docs and existing flow |
| Published markup uses canonical published grading path | yes | `WritingPublishedMarkupViewer.tsx`, `writingResultSurface.ts` |

## Verification Performed

### Tests run

```bash
cmd /c npx vitest run src/components/writing-results/WritingTestResultsSection.test.tsx src/pages/StudentTestResultsPage.test.tsx src/components/results/ResultSlidePanel.test.tsx src/components/results/ResultDetailModal.test.tsx src/components/results/LegacyResultDetailView.test.tsx --reporter=basic
```

Result:

- passed
- 5 test files
- 68 tests passing at verification time

### UTF-8 verification

```bash
cmd /c npm run check:utf8 -- src/components/results/LegacyResultDetailView.tsx src/components/results/ResultDetailModal.tsx src/components/results/ResultSlidePanel.tsx src/components/writing-results/writingResultSurface.ts src/components/writing-results/WritingPublishedMarkupViewer.tsx src/components/writing-results/WritingStudentResultSurface.tsx src/components/writing-results/WritingTeacherResultSurface.tsx src/components/writing-results/WritingResultView.tsx src/components/writing-results/WritingResultDetailModal.tsx src/components/writing-results/WritingTestResultsSection.tsx src/pages/StudentTestResultsPage.tsx src/config/featureRegistry.ts
```

Result:

- passed

### Documentation validation

Knowns validation run against docs:

- valid
- 0 errors
- 0 warnings
- only unrelated info-level items remained elsewhere in the docs corpus

## Documentation Updated During This Work

Source-of-truth and cross-reference docs updated:

- `.knowns/docs/specs/ielts-writing-result-surfaces-2026-03-30.md`
- `.knowns/docs/architecture/results-academic-record.md`
- `.knowns/docs/specs/grading-editor-redesign.md`

What those updates captured:

- Stitch is inspirational, not literal
- actual shipped hosts and delegation points
- RTDB fallback behavior
- superseded status of old generic Writing result-reader assumptions

## Remaining Gap / Deferred Cleanup

The implementation and primary docs are complete, but one broader documentation pass remains outside this task's finished code path:

- not every older PRD or historical artifact was back-annotated as superseded

Examples of still-desirable cleanup:

- broader PRD back-annotation where Writing result surfaces were previously described in generic-result terms
- additional historical task/log notes pointing to the new result-surface source of truth

This is cleanup/documentation debt, not a blocker for the implemented feature.

## Anti-Regression Notes

Future work should **not**:

- re-route Writing result content back through generic `SharedSavedResultCore` question-review sections
- add a third public phase for draft/lock conflict
- treat raw teacher id fields as authority
- make the student pending-review state display score/feedback before publication
- restore fixed Task 1 / Task 2 score columns in teacher result summaries
- use old placeholder result readers as a design anchor

Future work should **prefer**:

- `publishedGrading` first
- RTDB only for discovery and degraded fallback
- task-aware rendering derived from real submission tasks
- actual app shell language over literal mockup parity

## Short Executive Summary

This task successfully replaced the old IELTS Writing result-reader assumptions with a dedicated Writing result system that:

- matches the grading tool's published output
- preserves the app's teacher/student shell language
- enforces a strict two-phase public model
- respects unified visibility permissions
- supports degraded fallback safely
- is documented well enough to serve as the next engineer's crosscheck reference

## 2026-03-30 Interaction Amendment - Exact Parallel Comment Repositioning

A later refinement tightened the student Writing slide-modal comment interaction into the final shipped behavior.

### Final contract

In the wide student Writing slide modal:

- clicking a highlighted annotation in the left essay must force-open the Comments tab
- the whole comments rail must move as one block
- the selected comment stays in normal list order and is not overlaid above sibling comments
- the right-side visual anchor is the selected comment header row
- the left-side visual anchor is the clicked annotation top line
- the intended steady-state is `selected comment header top == clicked annotation top`
- the interaction remains read-only and does not expose grading controls

### Implementation detail

The final implementation uses the clicked annotation `rect.top` from the published markup viewer and computes the rail translation from the selected comment header's natural offset inside the comments stack.

Important notes:

- this replaced the earlier approximate list-scroll behavior
- this also replaced the looser center-based alignment attempt
- alignment math must not depend on the rail's current animated transform state
- the contract currently applies to the published markup path, not the legacy annotation fallback path

### Code areas involved in the amendment

- `src/components/writing-results/WritingPublishedMarkupViewer.tsx`
- `src/components/writing-results/WritingStudentResultSurface.tsx`
- `src/components/writing-results/WritingStudentResultSurface.test.tsx`

### Live verification

Verified with the student dev account using the direct result route:

- `http://127.0.0.1:4173/student/academic-record?result=-OosUDrZdaDhAb6vxk34`

Result:

- the whole comments rail aligned correctly against the clicked annotation
- measured live result across multiple annotations: `deltaHeaderTop = 0px`

### Important caveat from live check

During live verification, the student account's normal Academic Record page did not expose the Writing widget in its visible page state, so the direct `?result=` route above was the reliable verification entry point.

## 2026-03-30 Amendment - Grading Tool Interaction Parity

The writing-result redesign is no longer only a student-reading-surface change. The teacher grading editor now follows the same cross-column comment-rail contract so teachers and students are not taught different navigation models.

Final grading-tool interaction contract:
- clicking highlighted essay text forces the right-side `Comments` tab open
- the whole comments rail moves as one block
- the selected comment stays in natural essay-order list position
- the right-side anchor is the selected comment header row
- the left-side anchor is the clicked annotation top line
- the intended steady-state is `selected comment header top == clicked annotation top`

Implementation touchpoints:
- `src/pages/WritingGradingPage.tsx`
- `src/components/writing-grading/EssayEditor.tsx`
- `src/components/writing-grading/CommentSidebar.tsx`
- `src/components/writing-grading/CommentCard.tsx`
- `src/components/writing-grading/CommentSidebar.test.tsx`

This supersedes earlier grading-tool wording that described the matching comment as merely scrolling into view.