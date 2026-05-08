---
id: 15t4me
title: Remove essay scroll on annotation focus and retarget correction editing
status: done
priority: high
labels:
  - ielts-writing
  - grading
  - regression
createdAt: '2026-04-05T19:06:20.314Z'
updatedAt: '2026-04-05T19:14:43.232Z'
timeSpent: 493
---
# Remove essay scroll on annotation focus and retarget correction editing

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Separate annotation focus from editor navigation in the IELTS writing grading editor, and make correction editing trigger from the visible replacement text rather than the struck source span. Add regression coverage for the focus and correction click contracts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Focusing or saving comments/corrections in the teacher IELTS writing editor does not call DOM/editor scroll-to-element behavior as part of focus styling.
- [x] #2 Correction editing is triggered from the visible replacement text target, while the struck original source text is no longer the edit trigger.
- [x] #3 Regression tests cover the no-scroll focus contract and the correction replacement-only edit trigger.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented root-level annotation interaction fix. Comment mark application now uses a direct transaction instead of focus-driven selection changes, focused comment/correction styling no longer calls DOM scrollIntoView, correction editing is triggered only from the visible replacement span, and essay annotation click routing is unified so replacement edits correction while original piggyback-comment text can still route through comment click semantics. Verified with targeted Vitest, UTF-8 checks, production build, and a live local browser pass through Teacher > Grading > IELTS Writing showing no page scroll on lower-paragraph Add comment and replacement-only correction editing.
<!-- SECTION:NOTES:END -->

