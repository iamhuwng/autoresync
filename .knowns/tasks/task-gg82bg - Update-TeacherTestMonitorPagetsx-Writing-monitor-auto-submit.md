---
id: gg82bg
title: Update TeacherTestMonitorPage.tsx — Writing monitor + auto-submit
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-4
  - page
  - teacher
  - monitor
  - modify-file
  - gap-14
  - auto-submit
createdAt: '2026-02-27T20:03:26.117Z'
updatedAt: '2026-02-27T23:34:29.865Z'
timeSpent: 60
parent: vf19k6
---
# Update TeacherTestMonitorPage.tsx — Writing monitor + auto-submit

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update TeacherTestMonitorPage.tsx  detect skill===Writing, render WritingMonitorCard. End session: loop un-submitted students, call autoSubmitFromRTDB for each with progress indicator. Error handling: continue on failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Detects Writing skill for conditional rendering
- [x] #2 Renders WritingMonitorCard per student
- [x] #3 End session auto-submits un-submitted students
- [x] #4 Progress indicator during auto-submit
- [x] #5 Existing non-Writing behavior preserved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add skill===Writing check 2. Render WritingMonitorCard per student 3. Add peek modal state 4. Wire end-session auto-submit loop 5. Show progress: Auto-submitting X/Y 6. Error per-student handling
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-14: uses autoSubmitFromRTDB. Sequential auto-submit per student. Un-submitted = no Firestore doc. Preserve existing skill behavior.

All 5 ACs verified. TeacherTestMonitorPage.tsx has full Writing integration: detects skill=Writing via testData.skill, renders WritingMonitorCard per student with peek+reopen, end-session auto-submits unsubmitted students via autoSubmitFromRTDB (GAP-14), shows notification on completion, existing THCS/Reading/Listening behavior fully preserved. WritingPeekModal rendered at bottom of page.
<!-- SECTION:NOTES:END -->

