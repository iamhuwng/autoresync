---
id: n6vth5
title: Create writingTestService.ts — CRUD for writing drafts and tests
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
createdAt: '2026-02-27T20:02:50.676Z'
updatedAt: '2026-02-27T22:24:37.673Z'
timeSpent: 0
parent: u64tmq
---
# Create writingTestService.ts — CRUD for writing drafts and tests

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create src/services/writingTestService.ts following draftCloudService.ts pattern. Methods: saveWritingDraft, getWritingDraft, updateWritingDraft, deleteWritingDraft, getUserWritingDrafts, publishWritingTest. GAP-03: draft ID via Firestore auto-ID. GAP-08: test ID via Firebase push ID.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 File at src/services/writingTestService.ts
- [ ] #2 saveWritingDraft with auto-ID generation
- [ ] #3 publishWritingTest writes to RTDB with skill Writing
- [ ] #4 deepRemoveUndefined before all Firestore writes
- [ ] #5 All writes wrapped in withRestoreGuard
- [ ] #6 Follows draftCloudService pattern
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create file 2. Import Firebase SDK, withRestoreGuard, deepRemoveUndefined 3. Study draftCloudService.ts lines 351-588 4. Implement CRUD methods 5. Implement publishWritingTest with RTDB write 6. Wrap all writes in withRestoreGuard 7. Export all
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-03: doc(collection(db, writing_drafts)).id for draft ID. GAP-08: push(ref(database, tests)).key for test ID. Safety Rule 11: withRestoreGuard on all writes. Safety Rule 14: never regenerate IDs.
<!-- SECTION:NOTES:END -->

