---
id: sq1px4
title: 'Implement Submit Grading — validation, band calc, notifications'
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - feature
  - teacher
  - grading
  - submit
  - band-calculation
  - safety-rule-11
  - safety-rule-14
createdAt: '2026-02-27T20:03:43.730Z'
updatedAt: '2026-02-27T22:31:30.372Z'
timeSpent: 0
parent: jtjism
---
# Implement Submit Grading — validation, band calc, notifications

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement Submit Grading flow: validate all non-voided criteria scored, calculate bands via ieltsWritingBandCalculator, build WritingGradingResult, handle re-grading with audit trail, update Firestore+RTDB, notify student, clear localStorage, navigate to queue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Validates all non-voided criteria scored
- [ ] #2 Band calculation with IELTS rounding
- [ ] #3 Re-grading requires reason and creates audit
- [ ] #4 Updates Firestore and RTDB
- [ ] #5 Notifies student
- [ ] #6 Clears localStorage and navigates to queue
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Validate criteria scored 2. Calculate task and overall bands 3. Build WritingGradingResult 4. If re-grading: validate reason, create audit 5. Update Firestore 6. Update RTDB result 7. Send notification 8. Clear localStorage 9. Navigate to queue
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Band calc uses exact IELTS rounding. Re-grading: version increments, previous scores saved. Safety Rule 11: withRestoreGuard. Safety Rule 14: use existing resultId.
<!-- SECTION:NOTES:END -->

