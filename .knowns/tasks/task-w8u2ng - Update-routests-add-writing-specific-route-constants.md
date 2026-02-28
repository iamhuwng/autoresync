---
id: w8u2ng
title: Update routes.ts — add writing-specific route constants
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-1
  - routing
  - modify-file
  - safety-rule-1
createdAt: '2026-02-27T20:02:47.907Z'
updatedAt: '2026-02-27T22:24:24.854Z'
timeSpent: 0
parent: u64tmq
---
# Update routes.ts — add writing-specific route constants

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update src/constants/routes.ts  add 4 writing routes: TEACHER_WRITING_CREATE, TEACHER_WRITING_EDIT, TEACHER_GRADING_QUEUE, TEACHER_GRADING_DETAIL. Add submissionId to RouteParams.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 4 routes added with correct paths
- [ ] #2 submissionId added to RouteParams
- [ ] #3 Follows existing naming conventions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Open routes.ts 2. Add 4 route constants 3. Add submissionId to RouteParams 4. Verify no duplicates
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Safety Rule 1: ALL routes must be registered here. draftId param for edit, submissionId param for grading.
<!-- SECTION:NOTES:END -->

