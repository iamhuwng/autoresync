---
id: oz6wo6
title: Create WritingMonitorCard.tsx — per-student monitor card
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-4
  - component
  - teacher
  - monitor
  - rtdb
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:03:23.167Z'
updatedAt: '2026-02-27T23:30:41.077Z'
timeSpent: 59
parent: vf19k6
---
# Create WritingMonitorCard.tsx — per-student monitor card

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingMonitorCard.tsx  per-student card subscribing to RTDB writing data. Shows: student name, connection status, active task, word count per task with color coding, last saved time. Peek button and Reopen Essay button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Subscribes to RTDB writing data
- [x] #2 Word count color coding
- [x] #3 Peek and Reopen buttons present
- [x] #4 RTDB cleanup on unmount
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-monitor/WritingMonitorCard.tsx + CSS 2. Subscribe to RTDB 3. Display student info and task status 4. Color-code word counts 5. Add Peek and Reopen buttons 6. Cleanup subscription on unmount
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reopen only works if timer not expired. Peek is invisible to student. Word count: orange below min, green above. RTDB sub: onValue with off cleanup.

All ACs verified. WritingMonitorCard.tsx fully implemented: subscribes to RTDB writing data via onValue, word count color coding (orange below min, green above  150 for Task 1, 250 for Task 2), Peek button (when not submitted) and Reopen button (when submitted), RTDB cleanup via unsub() on unmount. Also shows connection status (Active/Idle/Submitted) and tab switch warnings.
<!-- SECTION:NOTES:END -->

