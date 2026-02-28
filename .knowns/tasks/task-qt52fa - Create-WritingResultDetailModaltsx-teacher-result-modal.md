---
id: qt52fa
title: Create WritingResultDetailModal.tsx — teacher result modal
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-6
  - component
  - teacher
  - results
  - modal
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:03:54.124Z'
updatedAt: '2026-02-27T22:33:25.672Z'
timeSpent: 0
parent: zrnpte
---
# Create WritingResultDetailModal.tsx — teacher result modal

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingResultDetailModal.tsx  teacher-facing result modal. Shows overall band, per-task annotated essays, criteria scores, feedback, audit trail. Re-grade button navigates to grading page. Native HTML/CSS modal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shows overall band and per-task details
- [ ] #2 Includes annotated essays and charts
- [ ] #3 Audit trail displayed
- [ ] #4 Re-grade button navigates correctly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create component + CSS 2. Render modal with backdrop 3. Band scores + task details 4. AnnotatedEssayReadOnly per task 5. CriteriaScoreChart per task 6. Audit trail section 7. Re-grade button
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Teacher sees FULL audit trail. Re-grade uses TEACHER_GRADING_DETAIL route. Opened from TeacherTestResultsPage.
<!-- SECTION:NOTES:END -->

