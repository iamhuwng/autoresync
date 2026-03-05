---
id: g5yfeo
title: Update firestore.rules — add rules for writing_submissions and writing_drafts
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-1
  - firestore-rules
  - security
  - modify-file
  - safety-rule-12
  - gap-02
createdAt: '2026-02-27T20:02:53.505Z'
updatedAt: '2026-02-27T22:25:05.235Z'
timeSpent: 0
parent: u64tmq
---
# Update firestore.rules — add rules for writing_submissions and writing_drafts

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update firestore.rules  add rules for writing_submissions (read if student or teacher, write if auth), writing_drafts (read/write if owner), and GAP-02: users/userId/settings for annotation categories.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 writing_submissions rules added
- [ ] #2 writing_drafts rules with owner check
- [ ] #3 users/userId/settings rules added (GAP-02)
- [ ] #4 firebase deploy --only firestore:rules succeeds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Open firestore.rules 2. Add writing_submissions rules 3. Add writing_drafts rules 4. Add users/userId/settings rules (GAP-02) 5. Test deploy
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-02: users/uid/settings path for annotation categories. Safety Rule 12: verify not in FIRESTORE_EXCLUDE backup. Submissions need teacher read for grading.
<!-- SECTION:NOTES:END -->

