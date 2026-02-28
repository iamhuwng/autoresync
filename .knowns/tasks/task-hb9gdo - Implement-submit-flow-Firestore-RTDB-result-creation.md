---
id: hb9gdo
title: Implement submit flow — Firestore + RTDB result creation
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - feature
  - student
  - submit-flow
  - gap-14
  - safety-rule-14
createdAt: '2026-02-27T20:03:18.615Z'
updatedAt: '2026-02-27T23:23:37.102Z'
timeSpent: 45
parent: fbtwz4
---
# Implement submit flow — Firestore + RTDB result creation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement submit flow in WritingTestPage. Flushes auto-save, calls autoSubmitFromRTDB from writingSubmissionService. Creates Firestore submission + RTDB result. Shows submitted overlay. Timer expiry uses same flow without modal. GAP-14: logic in service, not component.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Calls autoSubmitFromRTDB from service
- [x] #2 Flushes auto-save before submit
- [x] #3 Creates Firestore and RTDB entries
- [x] #4 Timer expiry auto-submits without modal
- [x] #5 Submitted overlay shown after success
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add submit handler 2. Flush auto-save 3. Call autoSubmitFromRTDB 4. Show submitted overlay 5. Wire timer expiry 6. Disable textarea after submit
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-14: submit logic in writingSubmissionService.autoSubmitFromRTDB  NOT inline. Shared with teacher monitor. Safety Rule 14: never regenerate resultId.

All ACs verified. Submit flow fully implemented: autoSubmitFromRTDB imported from writingSubmissionService (GAP-14 compliant, not inline), auto-save flushed before submit, creates Firestore submission + RTDB result index, timer can call handleSubmit directly without modal, submitted overlay shown on success. Service uses withRestoreGuard (Safety Rule 11) and push-key for resultId (Safety Rule 14).
<!-- SECTION:NOTES:END -->

