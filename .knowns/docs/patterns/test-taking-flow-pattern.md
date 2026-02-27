---
title: Test-Taking Flow Pattern
createdAt: '2026-02-27T16:15:35.074Z'
updatedAt: '2026-02-27T20:33:31.819Z'
description: >-
  How students take tests: routing, rendering, timer sync, submission,
  auto-submit. Covers IELTS and THCS paths.
tags:
  - pattern
  - test
  - student
  - timer
---
# Pattern: Test-Taking Flow

## Problem
Students need to take tests (IELTS or THCS) in real-time with synced timers, then submit answers for automatic grading. The flow must handle: normal completion, teacher-forced end, disconnection, and zero-answer edge cases.

## Solution

### Routing
```
Student joins session → TestPageRouter.tsx
  → Detects test type from session metadata
  → IELTS → StudentTestPage.tsx
  → THCS → THCSTestLayout.tsx
```

### Timer Synchronization
- Timer state lives in RTDB: `/sessions/{id}/timer`
- Both teacher monitor and student UI read same source
- `useTestTimer` hook subscribes to RTDB, runs local interval
- ⚠️ Never render `TimerDisplay` with `totalTime=0` (causes instant onTimeUp)

### Submission Pipeline
```
Student completes → useTestSubmission.submitAnswers()
  → Compute score (auto-grade for MC, fill-in)
  → Check guest status: ONLY startsWith('guest_')
  → Save to /test_results/{resultId}
  → Create indexes: by_session, by_student
  → Navigate to results
```

### Auto-Submit (Teacher Ends Early)
```
Teacher clicks "End Test" → useMonitorControls.endFullSession()
  → identifyUnsubmittedStudents(session.players)
  → autoSubmitAllUnsubmittedStudents()
  → For each: grade with whatever answers exist (may be 0%)
  → Students return to lobby with results modal
```

## Gotchas
1. **Guest detection bug (FIXED):** Firebase UIDs don't contain `_`, so `!id.includes('_')` incorrectly flags real users as guests. Only use `startsWith('guest_')`.
2. **Timer=0 bug (FIXED):** If no timer is set, `totalTime=0` causes instant `onTimeUp`. Guard with `totalTime > 0` before rendering.
3. **Write-before-read race:** Teacher's `saveTestResult()` must complete before student navigates to results. Use retry logic as fallback.

## Key Files
- `src/pages/TestPageRouter.tsx` — Test type routing
- `src/hooks/test/useTestTimer.ts` — Timer sync
- `src/hooks/test/useTestSubmission.ts` — Submission pipeline
- `src/utils/monitor/autoSubmitDisconnected.ts` — Auto-submit logic

## Source
Distilled from:
- @doc/sop/test-end-flow-debug-retrospective
- @doc/sop/timer-bug-fix-retrospective
- @doc/architecture/test-system-architecture
