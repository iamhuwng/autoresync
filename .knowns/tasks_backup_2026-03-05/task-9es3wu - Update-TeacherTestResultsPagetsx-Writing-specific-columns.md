---
id: 9es3wu
title: Update TeacherTestResultsPage.tsx — Writing-specific columns
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-6
  - page
  - teacher
  - results
  - modify-file
  - safety-rule-8
createdAt: '2026-02-27T20:03:55.729Z'
updatedAt: '2026-02-27T22:33:32.124Z'
timeSpent: 0
parent: zrnpte
---
# Update TeacherTestResultsPage.tsx — Writing-specific columns

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update TeacherTestResultsPage.tsx  detect Writing results, add columns: Overall Band, Per-Task Bands, Marking Status badge, Word Count. Row click opens WritingResultDetailModal. Load submission from Firestore for modal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Writing-specific columns added
- [ ] #2 Status badges: pending=orange, graded=green
- [ ] #3 Row click opens result modal
- [ ] #4 Existing non-Writing columns preserved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add conditional columns for Writing 2. Add conditional values 3. Add modal state 4. Wire row click 5. Load submission lazily 6. Render modal
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
writingData field provides: overallBand, markingStatus, tasks. Full submission loaded only on modal open. Safety Rule 8: modal must be rendered.
<!-- SECTION:NOTES:END -->

