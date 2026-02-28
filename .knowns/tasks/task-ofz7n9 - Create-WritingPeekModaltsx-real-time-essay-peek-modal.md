---
id: ofz7n9
title: Create WritingPeekModal.tsx — real-time essay peek modal
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-4
  - component
  - teacher
  - monitor
  - modal
  - rtdb
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:03:24.648Z'
updatedAt: '2026-02-27T23:32:44.152Z'
timeSpent: 45
parent: vf19k6
---
# Create WritingPeekModal.tsx — real-time essay peek modal

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingPeekModal.tsx  native HTML/CSS modal showing real-time essay text from RTDB. Read-only display. Tab switching for full test. Word count and active time shown.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Real-time RTDB subscription
- [x] #2 Read-only essay display
- [x] #3 Tab switching for full test
- [x] #4 Cleanup on close/unmount
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-monitor/WritingPeekModal.tsx + CSS 2. Subscribe to RTDB on open 3. Display read-only essay 4. Add tab bar for multi-task 5. Show stats 6. Cleanup on close
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Peek invisible to student  no RTDB write for peek. Essay updates real-time. Modal ~80% viewport width.

All ACs verified. WritingPeekModal.tsx fully implemented: real-time RTDB subscription via onValue (only when open), read-only essay display in pre-wrap div, tab switching for full-test format, cleanup via unsub() on close/unmount. No RTDB writes (invisible to student). Word count shown in footer with color coding.
<!-- SECTION:NOTES:END -->

