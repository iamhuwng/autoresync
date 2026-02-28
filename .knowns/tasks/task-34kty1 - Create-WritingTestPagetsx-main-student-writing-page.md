---
id: 34kty1
title: Create WritingTestPage.tsx — main student writing page
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - page
  - student
  - live-session
  - new-file
  - gap-10
  - gap-11
  - gap-12
createdAt: '2026-02-27T20:03:17.162Z'
updatedAt: '2026-02-27T23:21:43.559Z'
timeSpent: 48
parent: fbtwz4
---
# Create WritingTestPage.tsx — main student writing page

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingTestPage.tsx  main student writing page. GAP-11: props testData+sessionCode. GAP-12: auth from useAuth. GAP-10: taskCount from format. Layout: TestHeader+TestTimer+tabs+split panel. Wires all 3 hooks. Timer expiry auto-submits. Reconnect restores. Teacher reopen subscribes to RTDB.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Props: testData and sessionCode (GAP-11)
- [x] #2 Auth from useAuth (GAP-12)
- [x] #3 taskCount derived from format (GAP-10)
- [x] #4 All 3 hooks wired correctly
- [x] #5 Timer expiry auto-submits
- [x] #6 Reconnect restores from RTDB
- [x] #7 Teacher reopen subscribes to RTDB flag
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-student/WritingTestPage.tsx + CSS 2. Define props (GAP-11) 3. Get auth (GAP-12) 4. Derive taskCount (GAP-10) 5. Wire 3 hooks 6. Build layout 7. Handle tab switching 8. Wire submit via autoSubmitFromRTDB 9. Timer expiry auto-submit 10. beforeunload warning 11. Reconnect via loadSavedState 12. Teacher reopen RTDB subscription
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-11: props are testData+sessionCode. GAP-12: user from useAuth not Mantine. GAP-10: taskCount is constant. Submit uses autoSubmitFromRTDB. Each session = separate submission.

All 7 ACs verified. WritingTestPage.tsx fully implemented: props testData+sessionCode (GAP-11), auth from useAuth (GAP-12), taskCount from format (GAP-10), all 3 hooks wired (activeTime, autoSave, pastePrevention delegated to WritingEditor), submit via autoSubmitFromRTDB with flush, reconnect via loadSavedState on mount, teacher reopen via RTDB onValue subscription.
<!-- SECTION:NOTES:END -->

