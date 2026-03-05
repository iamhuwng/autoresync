---
id: l4q0sd
title: 'Sub-A: InlineWritingGrader UI — slider + read-only + all-at-once'
status: done
priority: high
labels:
  - writing-grading
  - ui
  - teacher
createdAt: '2026-03-01T17:19:43.502Z'
updatedAt: '2026-03-01T17:37:40.945Z'
timeSpent: 0
parent: u2ovxj
spec: specs/spec-teacher-name-in-grading-results
fulfills:
  - AC-1
  - AC-3
---
# Sub-A: InlineWritingGrader UI — slider + read-only + all-at-once

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Visual-only refactor of InlineWritingGrader. No persistence changes.

1. Add `teacherUid` and `teacherName` to props (wire from TeacherTestMonitorPage via useAuth)
2. Replace SCORE_PRESETS buttons with HTML `<input type="range">` slider (0 to pointsMax, step 0.25)
3. Show all writing Qs simultaneously (remove currentIndex stepper, render all in a scrollable list)
4. Student answer rendered read-only (gray bg, lock icon, no editing)
5. Feedback: full marks → auto "✓ Correct" text, partial/zero → editable textarea
6. Save button per question (existing handleSubmitGrade, no dual-write yet)

Do NOT change persistence layer. Do NOT add auto-save. Do NOT add question results table.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Add teacherUid and teacherName to InlineWritingGraderProps
- [x] #2 Replace stepper with all-at-once scrollable list
- [x] #3 Both preset buttons AND slider for score input
- [x] #4 Student answer rendered read-only with lock icon
- [x] #5 Conditional feedback: full marks → auto correct, partial/zero → editable
- [x] #6 Per-question Save button (not global yet)
- [x] #7 Progress pills and counter in header
- [x] #8 Visual distinction: green border + bg for saved, neutral for pending
- [x] #9 TeacherTestMonitorPage wires useAuth() for teacher identity
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-03-02: Implemented. Full rewrite of InlineWritingGrader.tsx:
- Removed stepper (currentIndex), now shows all writing Qs simultaneously
- Added teacherUid/teacherName props, wired from TeacherTestMonitorPage via useAuth()
- Score: preset buttons (0/25/50/75/100%) + continuous range slider
- Student answer: read-only div with lock icon (not editable)
- Feedback: conditional — full marks shows '✓ Correct', partial/zero shows textarea
- Per-question Save button with 'Saved'/'Update' state
- Progress pills (green dots) + counter in header
- Saved cards: green border + subtle green bg + '✓ Saved' badge
- Modal widened from 700px to 900px for better content fit
- Build clean (no new TS errors)
<!-- SECTION:NOTES:END -->

