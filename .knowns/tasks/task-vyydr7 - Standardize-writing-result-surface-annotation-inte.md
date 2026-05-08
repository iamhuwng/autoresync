---
id: vyydr7
title: Standardize writing result surface annotation interactions
status: done
priority: high
labels:
  - bugfix
  - ielts-writing
  - results
  - annotations
createdAt: '2026-04-05T14:04:17.265Z'
updatedAt: '2026-04-05T18:40:37.134Z'
timeSpent: 16571
---
# Standardize writing result surface annotation interactions

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bring the published IELTS writing result surfaces into structural parity with the recent grading-editor fixes. Standardize tooltip mounting/placement in the shared published markup viewer, align student and teacher result surfaces on published comment/correction handling, and update docs/tests for the result-surface contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Published hover tooltips on Writing result readers use the same body-portal, viewport-clamped, side-adjacent placement contract as the grading essay editor
- [x] #2 Student Writing result surface exposes a neutral read-only feedback rail that groups published comments and corrections into separate sections
- [x] #3 Teacher Writing result surface passes published corrections into the shared markup viewer and exposes a grouped published feedback panel
- [x] #4 Targeted tests cover the standardized published viewer tooltip behavior plus student and teacher feedback-surface wiring
- [x] #5 Teacher grading pending-comment activation keeps movement inside the right comment rail and never relies on page-level scroll-to-element behavior
- [x] #6 Teacher grading pending comments render a transient dotted source-text underline before save without persisting orphan comment marks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Expanded scope per user request to close the remaining annotation-interaction gap across grading and published result surfaces. Added shared local-rail positioning helper for grading and published feedback panels, replaced page-scrolling fallback behavior with viewport-local reveal logic, switched CommentComposer autofocus to TipTap focus with scrollIntoView:false, and introduced a transient pending-comment source-range decoration in EssayEditor so unsaved drafts underline the selected original text without mutating persisted markup. Added targeted tests for CommentComposer no-scroll focus, CommentSidebar local fallback movement, pending-comment preview rendering, PublishedFeedbackPanel local fallback movement, and updated student/teacher result-surface alignment expectations. Verified with targeted Vitest, UTF-8 checks, and npm run build.
Completed after expanded scope verification. This task now covers the shared published-result interaction contract plus the final grading-side no-page-scroll pending comment behavior needed to keep grading and result surfaces behaviorally aligned where applicable.
<!-- SECTION:NOTES:END -->

