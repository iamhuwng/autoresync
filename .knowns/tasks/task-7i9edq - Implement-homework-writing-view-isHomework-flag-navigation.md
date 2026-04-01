---
id: 7i9edq
title: Implement homework writing view — isHomework flag + navigation
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-7
  - feature
  - student
  - homework
  - safety-rule-1
  - safety-rule-2
createdAt: '2026-02-27T20:04:04.617Z'
updatedAt: '2026-04-01T03:39:50.647Z'
timeSpent: 205
parent: 6emz0n
---
# Implement homework writing view — isHomework flag + navigation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement homework writing view  detect isHomework flag, show deadline info, enforce word minimum strictly, pre-load previous essay on re-attempt, submit with context.type=homework. Late check: hard-deadline blocks, allow-late marks as late. Navigate to homework page after submit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Detects isHomework flag
- [x] #2 Deadline info displayed
- [x] #3 Word minimum enforced strictly
- [x] #4 Re-attempt pre-loads previous essay
- [x] #5 Late check: hard-deadline blocks, allow-late marks late
- [x] #6 Navigates to homework page after submit
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add isHomework prop or detect from navigation 2. Display deadline header 3. Strict word minimum enforcement 4. Pre-load previous essay for re-attempts 5. Submit with homework context 6. Late submission checks 7. Override post-submit navigation
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Safety Rule 2: verify navigation state has homework data. Re-attempt: fetch previous from Firestore. Safety Rule 1: navigation paths from routes.ts.

Implemented 2026-02-28: Added homework mode to WritingPracticeView. New HomeworkWritingContext prop exported from WritingPracticeView.tsx. StudentPracticePage passes homeworkContext when isHomework. Features: deadline banner (wpv-deadline-badge), hard-deadline blocking overlay, allow-late marking, previousEssay pre-load for re-attempts, homework submit context with homeworkId+isLate, post-submit navigation to /student/homework. CSS for deadline badge added. Zero TS errors.

2026-04-01 regression fix: Writing homework delivery now forwards homework timer/attempt state (`timerMinutes`, `maxAttempts`, `startedAt`) into `StudentPracticePage` and `WritingPracticeView`. The homework timer now anchors to the persisted attempt start time, single-attempt homework auto-resumes saved progress without exposing restart, and homework timer expiry auto-submits the attempt. Added targeted Vitest coverage for timer override/timeout submit and single-attempt auto-resume.
<!-- SECTION:NOTES:END -->

