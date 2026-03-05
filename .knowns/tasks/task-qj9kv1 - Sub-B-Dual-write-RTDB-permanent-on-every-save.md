---
id: qj9kv1
title: 'Sub-B: Dual-write — RTDB + permanent on every save'
status: done
priority: high
labels:
  - writing-grading
  - service
  - teacher
createdAt: '2026-03-01T17:19:52.726Z'
updatedAt: '2026-03-01T17:39:13.164Z'
timeSpent: 0
parent: u2ovxj
spec: specs/spec-teacher-name-in-grading-results
fulfills:
  - AC-1
  - AC-2
---
# Sub-B: Dual-write — RTDB + permanent on every save

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add dual-write to InlineWritingGrader's save handler.

When teacher clicks Save on a writing question:
1. Write 1 (existing): RTDB session at `game_sessions/{code}/results/{studentId}/questionResults/{qNum}`
   - Add: `writingResult/gradedByUid`, `writingResult/gradedByName`, `writingResult/gradedAt`
2. Write 2 (NEW): Call `updateThcsWritingGrade(sessionCode, studentId, qNum, { score, maxScore, feedback, teacherName, teacherUid })`

BOTH writes happen on every explicit save. No separate auto-save (that's Sub-C). This keeps RTDB and permanent record in sync.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 handleSaveQuestion writes gradedByUid/gradedByName/gradedAt to RTDB
- [x] #2 handleSaveQuestion calls updateThcsWritingGrade() for permanent record after RTDB write
- [x] #3 If permanent write fails, RTDB write is NOT rolled back (log error + show warning)
- [x] #4 Build succeeds with no new TS errors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-03-02: Implemented. Added import of updateThcsWritingGrade to InlineWritingGrader. After RTDB write succeeds, calls updateThcsWritingGrade(sessionCode, studentId, qNum, {score, maxScore, feedback, teacherName, teacherUid}). Permanent write failures are caught and logged (RTDB not rolled back). Build clean.
<!-- SECTION:NOTES:END -->

