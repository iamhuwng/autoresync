---
id: vf19k6
title: 'PRD-0030: Teacher Test Monitor (Writing-Specific)'
status: done
priority: high
labels:
  - prd-0030
  - ielts-writing
  - phase-4
  - epic
  - teacher
  - monitor
createdAt: '2026-02-27T20:03:21.726Z'
updatedAt: '2026-02-27T23:34:43.981Z'
timeSpent: 0
---
# PRD-0030: Teacher Test Monitor (Writing-Specific)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 4 epic. Writing-specific additions to TeacherTestMonitorPage: per-student WritingMonitorCard with word count and active task, WritingPeekModal for real-time essay viewing, end-session auto-submit for all un-submitted students.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 3 subtasks completed
- [ ] #2 Per-student cards with writing data
- [ ] #3 Peek modal with real-time essay
- [ ] #4 End session auto-submits all students
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create WritingMonitorCard (4.1) 2. Create WritingPeekModal (4.2) 3. Update TeacherTestMonitorPage (4.3)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Adds to existing monitor  not a separate page. Monitor subscribes to RTDB. End-session uses autoSubmitFromRTDB. Peek is invisible to student.

All 3 subtasks completed: WritingMonitorCard (oz6wo6), WritingPeekModal (ofz7n9), TeacherTestMonitorPage integration (gg82bg).
<!-- SECTION:NOTES:END -->

