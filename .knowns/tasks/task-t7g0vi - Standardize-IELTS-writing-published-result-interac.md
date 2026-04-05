---
id: t7g0vi
title: Standardize IELTS writing published result interactions across student and teacher surfaces
status: done
priority: high
labels:
  - bugfix
  - ielts-writing
  - results
  - annotations
createdAt: '2026-04-05T14:04:04.647Z'
updatedAt: '2026-04-05T14:17:10.807Z'
timeSpent: 780
---
# Standardize IELTS writing published result interactions across student and teacher surfaces

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bring the writing-results stack into parity with the grading editor where appropriate: align published tooltip geometry, ensure teacher/student result surfaces both render correction data consistently, and document the published-viewer interaction contract. Keep grading-editor editing semantics separate from read-only result surfaces.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Published writing markup viewer uses a single tooltip geometry contract across result surfaces
- [x] #2 Teacher and student result surfaces both pass published corrections through the shared viewer
- [x] #3 Read-only result surfaces keep their own published-feedback rail model without inheriting grading-editor-only comment rail behavior
- [x] #4 Targeted tests cover published correction visibility and tooltip placement behavior
- [x] #5 Architecture docs reflect the published-viewer/result-surface interaction contract
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Standardize the shared published markup viewer so read-only tooltip geometry and correction rendering follow one contract across result surfaces.
2. Align teacher and student result shells on consistent published correction/comment visibility without importing grading-editor-only interactions.
3. Add targeted tests for published viewer tooltip placement and teacher/student correction coverage.
4. Update root and Knowns architecture docs for the published-viewer interaction contract.
5. Rebuild and verify before packaging.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation progress:
- Standardized the shared `WritingPublishedMarkupViewer` on the grading editor's viewport tooltip geometry contract instead of container-local absolute placement.
- Teacher result surfaces now pass published corrections through the shared viewer and render the viewer when corrections exist even if comments do not.
- Added targeted regression coverage for published viewer tooltip portal behavior and teacher result correction-only rendering.

Implementation progress:
- Standardized the shared `WritingPublishedMarkupViewer` onto the same viewport-clamped, body-portal, side-adjacent hover-tooltip contract as the grading essay editor by extracting shared overlay geometry utilities.
- Fixed teacher published-result parity so corrections-only tasks still render through the shared markup viewer and teacher result surfaces now pass `corrections` into that viewer.
- Integrated the in-progress student result `Feedback` rail refactor already present in the worktree instead of reverting it, and updated the student-result regression tests to target the new `PublishedFeedbackPanel` data contract.
- Added targeted viewer and teacher-result tests for tooltip placement and correction forwarding.

Verification:
- cmd /c npx vitest run src/components/writing-results/WritingPublishedMarkupViewer.test.tsx src/components/writing-results/WritingTeacherResultSurface.test.tsx src/components/writing-results/WritingStudentResultSurface.test.tsx --reporter=basic
- cmd /c npm run check:utf8 -- src/components/writing-grading/annotationOverlayPosition.ts src/components/writing-results/WritingPublishedMarkupViewer.tsx src/components/writing-results/WritingPublishedMarkupViewer.test.tsx src/components/writing-results/WritingTeacherResultSurface.tsx src/components/writing-results/WritingTeacherResultSurface.test.tsx documentation/architecture/ielts-writing/contracts-and-governance.md documentation/architecture/ielts-writing/lifecycle-and-surfaces.md
- cmd /c npm run build
<!-- SECTION:NOTES:END -->

