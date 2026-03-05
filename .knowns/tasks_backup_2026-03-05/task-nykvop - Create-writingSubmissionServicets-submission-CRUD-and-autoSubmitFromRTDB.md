---
id: nykvop
title: Create writingSubmissionService.ts — submission CRUD and autoSubmitFromRTDB
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-1
  - services
  - firestore
  - rtdb
  - new-file
  - safety-rule-11
  - gap-04
  - gap-14
createdAt: '2026-02-27T20:02:52.045Z'
updatedAt: '2026-02-27T22:24:59.056Z'
timeSpent: 0
parent: u64tmq
---
# Create writingSubmissionService.ts — submission CRUD and autoSubmitFromRTDB

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create src/services/writingSubmissionService.ts. GAP-14: standalone autoSubmitFromRTDB function shared by student submit and teacher end-session. GAP-04: getPendingSubmissions uses single Firestore where + client-side teacher filter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 autoSubmitFromRTDB is standalone exported function
- [ ] #2 autoSubmitFromRTDB creates both Firestore and RTDB entries
- [ ] #3 getPendingSubmissions uses single where + client filter
- [ ] #4 All writes wrapped in withRestoreGuard
- [ ] #5 deepRemoveUndefined before Firestore writes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create file 2. Implement autoSubmitFromRTDB (reads RTDB, creates Firestore+RTDB result) 3. Implement createSubmission, getSubmission, updateGrading 4. Implement getPendingSubmissions with GAP-04 pattern 5. Implement getSubmissionsForStudent 6. Wrap all writes in withRestoreGuard
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-14: autoSubmitFromRTDB is shared by student and teacher monitor. GAP-04: DO NOT add extra .where() for teacher  requires composite index. Safety Rule 11+14: withRestoreGuard + never regenerate IDs.
<!-- SECTION:NOTES:END -->

