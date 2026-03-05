---
id: 17z24x
title: Update StudentLibraryPage.tsx — writing test display + icon
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-7
  - page
  - student
  - library
  - modify-file
  - safety-rule-1
createdAt: '2026-02-27T20:04:06.429Z'
updatedAt: '2026-02-28T03:11:25.840Z'
timeSpent: 63
parent: 6emz0n
---
# Update StudentLibraryPage.tsx — writing test display + icon

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update StudentLibraryPage.tsx  display writing tests with pen icon and Writing skill label. Show format info (Task 1 Only / Task 2 Only / Full Test). Click navigates to practice page with materialId.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Writing tests displayed with pen icon
- [x] #2 Format info shown
- [x] #3 Click navigates to practice page
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Ensure writing tests in fetch 2. Add Writing icon mapping 3. Add Writing label 4. Add format info display 5. Wire click navigation
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tests from RTDB where skill===Writing. Navigate to practice page not live session. Safety Rule 1: route from routes.ts.

Implemented 2026-02-28: Added SvgPen icon, purple badge for writing skill, format badge (Full Test/Task 1/Task 2) from material.format, SvgPen in stat row instead of question count. Navigation already worked via /student/practice/:materialId.
<!-- SECTION:NOTES:END -->

