---
id: 4k145z
title: Fix IELTS writing grading draft saves marking submissions graded
status: done
priority: high
labels:
  - bugfix
  - ielts-writing
  - grading
createdAt: '2026-03-29T06:47:42.303Z'
updatedAt: '2026-03-29T06:52:03.945Z'
timeSpent: 257
---
# Fix IELTS writing grading draft saves marking submissions graded

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Teacher grading edits or draft saves should not remove a writing submission from the pending queue before final submit. Preserve partial grading state while keeping markingStatus pending-review until explicit submit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: WritingGradingPage used the same updateGrading() path for both draft saves and final submit, and the service always wrote markingStatus='graded'. Fix: updateGrading() now accepts explicit grading options, draft saves persist only to the Firestore submission with markingStatus='pending-review', final submit still syncs canonical RTDB results as graded, and the page now checks service success before clearing unsaved state or navigating. Added regression tests for draft-save behavior and pending-row score suppression.
<!-- SECTION:NOTES:END -->

