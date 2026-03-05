---
id: ozfki4
title: Create useWritingAutoSave.ts — debounced RTDB sync
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - hook
  - student
  - rtdb
  - auto-save
  - new-file
  - gap-06
createdAt: '2026-02-27T20:03:14.282Z'
updatedAt: '2026-02-27T23:04:40.247Z'
timeSpent: 30
parent: fbtwz4
---
# Create useWritingAutoSave.ts — debounced RTDB sync

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create useWritingAutoSave.ts  debounced 3s RTDB sync for essay text. RTDB paths: game_sessions/code/students/uid/writing/task1,task2,activeTask,tabSwitches. On tab switch: flush pending save immediately. loadSavedState for reconnect.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Debounced 3s RTDB sync
- [x] #2 Tab switch flushes pending save
- [x] #3 loadSavedState restores essays and tab
- [x] #4 Cleanup timer on unmount
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/hooks/useWritingAutoSave.ts 2. useRef for debounce timer 3. saveTask: debounce 3s to RTDB 4. saveActiveTab: immediate write 5. addTabSwitch: append to array 6. loadSavedState: read all fields 7. Flush before tab switch 8. Cleanup on unmount
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Save only active task text on change. Flush BEFORE switching tabs. lastSavedAt uses Date.now(). Reconnect: loadSavedState on mount. GAP-06: useRef for timer.

All ACs verified. useWritingAutoSave.ts fully implemented: debounced 3s RTDB sync via setTimeout, tab switch flushes pendingSaveRef before writing activeTask, loadSavedState reads all fields from RTDB and returns {task1Text, task2Text, activeTask, tabSwitches}, timer cleaned on unmount. Also exposes flushPendingSave for submit flow.
<!-- SECTION:NOTES:END -->

