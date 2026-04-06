---
id: 4ec4ge
title: Migrate IELTS writing scoring panel into shared grading-page design system
status: done
priority: high
labels:
  - ielts-writing
  - ui
  - teacher-grading
createdAt: '2026-04-06T04:24:18.746Z'
updatedAt: '2026-04-06T06:41:41.947Z'
timeSpent: 2479
---
# Migrate IELTS writing scoring panel into shared grading-page design system

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the legacy inline-style CriteriaScoringPanel with a shared scoring-surface contract so Task 1 and Task 2 use the same redesigned scoring rail structure, with task-specific variation limited to TA vs TR semantics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the shared scoring-surface migration for teacher IELTS Writing grading. Replaced the inline-style CriteriaScoringPanel with a dedicated CSS contract bound to the grading-page token system, removed the leftover page-level csp scroll helper, and added a regression test asserting Task 1 and Task 2 share the same structure with only TA/TR semantic divergence. Targeted Vitest, UTF-8 check, and production build all passed. Browser route probing was inconclusive because the local Playwright session returned an empty login page text snapshot, so verification for this pass is code-level plus build-level.

2026-04-06 follow-up: kept the shared decimal scoring rail but fixed the remaining edit-mode fit-and-finish gaps. Restored the live feedback-editor toolbar (bold, italic, underline, bullet list, numbered list, undo, redo), wired toolbar actions into grading feature tracking as `formatFeedback`, and stabilized scoring-card header geometry so long criterion labels no longer deform the two-column grid when values are present. Verified with targeted Vitest, UTF-8 check, and production build.
<!-- SECTION:NOTES:END -->

