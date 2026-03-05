---
id: odi2nt
title: 'Sub-D: Question results table at top of grading view'
status: done
priority: medium
labels:
  - writing-grading
  - ui
  - teacher
createdAt: '2026-03-01T17:20:13.634Z'
updatedAt: '2026-03-01T17:44:28.798Z'
timeSpent: 0
parent: u2ovxj
spec: specs/spec-teacher-name-in-grading-results
fulfills:
  - AC-14
---
# Sub-D: Question results table at top of grading view

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add full question results table above the writing grading area in InlineWritingGrader.

Data source: TeacherTestMonitorPage must pass `allQuestionResults` prop (read from RTDB session `game_sessions/{code}/results/{studentId}/questionResults`).

Table format (per approved mockup):
- One row per question: Q1 (MCQ): A ✓ (1) | Q2 (MCQ): B ✗ Correct: C (0) | ... | Q38 (Writing): ⏳ Pending
- Color coding: green for correct, red for incorrect, amber for partial
- Writing questions show '⏳ Pending' or '✓ Graded'

Requires:
1. New prop on InlineWritingGrader: `allQuestionResults: Record<string, any>`
2. TeacherTestMonitorPage reads from RTDB and passes it
3. Table component rendered above writing grading area
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 allQuestionResults prop added to InlineWritingGrader
- [x] #2 Collapsible question results table rendered at top of scrollable area
- [x] #3 Summary counts: auto-graded/total + pending writing count
- [x] #4 Expand shows 2-column grid with Q number, type, status icon, score
- [x] #5 Collapsed by default
- [x] #6 Wired from TeacherTestMonitorPage session results
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-03-02: Implemented. Added allQuestionResults prop + collapsible overview table at top of InlineWritingGrader. Shows compact 2-column grid of all 40 question results with type labels, ✓/✗ icons, and score. Pending writing questions highlighted in amber. Collapsed by default with summary counts. Wired from session?.results?.[studentId]?.questionResults.
<!-- SECTION:NOTES:END -->

