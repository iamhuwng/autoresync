---
id: gbvj23
title: Create writingAnnotationService.ts — annotation category CRUD
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-1
  - services
  - firestore
  - new-file
  - safety-rule-11
  - gap-24
createdAt: '2026-02-27T20:02:54.842Z'
updatedAt: '2026-02-27T22:25:12.771Z'
timeSpent: 0
parent: u64tmq
---
# Create writingAnnotationService.ts — annotation category CRUD

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GAP-24: Create src/services/writingAnnotationService.ts. getCategories reads from users/teacherId/settings/writingAnnotationCategories. saveCategories writes with merge:true, wrapped in withRestoreGuard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 File at src/services/writingAnnotationService.ts
- [ ] #2 getCategories handles missing document gracefully
- [ ] #3 saveCategories uses merge:true
- [ ] #4 saveCategories wrapped in withRestoreGuard
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create file 2. Implement getCategories with graceful missing-doc handling 3. Implement saveCategories with merge:true 4. Wrap saveCategories in withRestoreGuard 5. Export both
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-24: per-teacher category storage. Default categories auto-populated by CategoryManager on first use. Depends on GAP-02 Firestore rules.
<!-- SECTION:NOTES:END -->

