---
id: 837knl
title: Create useActiveTimeTracking.ts — per-task active time tracking
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - hook
  - student
  - time-tracking
  - new-file
  - gap-10
createdAt: '2026-02-27T20:03:12.531Z'
updatedAt: '2026-02-27T23:03:08.859Z'
timeSpent: 28
parent: fbtwz4
---
# Create useActiveTimeTracking.ts — per-task active time tracking

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create useActiveTimeTracking.ts  per-task active time tracking via keystroke gap detection. GAP-10: taskCount is constant derived from format. All state in useRef. 5-minute gap pauses counting. Returns getActiveTime, onKeystroke, switchTask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All tracking state in useRef
- [x] #2 5-minute gap pauses counting
- [x] #3 switchTask saves previous task time
- [x] #4 Returns getActiveTime, onKeystroke, switchTask
- [x] #5 Intervals cleaned on unmount
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/hooks/useActiveTimeTracking.ts 2. useRef for all state 3. onKeystroke: start interval, update lastKeystrokeAt 4. 5-min gap check every 1s 5. switchTask: save previous time 6. Cleanup intervals on unmount
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-10: taskCount derived by parent from format. 5-min threshold. Students dont see time  teacher only. All state in useRef to avoid re-renders.

All ACs verified. useActiveTimeTracking.ts fully implemented: all state in useRef (6 refs, zero useState), 5-min idle timeout pauses counting, switchTask saves previous task elapsed time, returns {getActiveTime, onKeystroke, switchTask}, interval cleaned on unmount via useEffect.
<!-- SECTION:NOTES:END -->

