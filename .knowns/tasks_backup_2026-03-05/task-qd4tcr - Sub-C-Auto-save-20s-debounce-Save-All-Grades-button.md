---
id: qd4tcr
title: 'Sub-C: Auto-save (20s debounce) + Save All Grades button'
status: done
priority: medium
labels:
  - writing-grading
  - ui
  - teacher
createdAt: '2026-03-01T17:20:02.456Z'
updatedAt: '2026-03-01T17:42:09.447Z'
timeSpent: 0
parent: u2ovxj
spec: specs/spec-teacher-name-in-grading-results
fulfills:
  - AC-13
---
# Sub-C: Auto-save (20s debounce) + Save All Grades button

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add auto-save and 'Save All Grades' to InlineWritingGrader.

Auto-save:
- Debounced 20s (not 5s — too aggressive per assessment)
- Triggers on score slider change or feedback text change
- Writes to BOTH RTDB AND permanent record (same dual-write as Sub-B to avoid split state)
- Save-on-blur also triggers for individual questions
- Visual indicator: small 'Saving...' / 'Saved ✓' text near each question

'Save All Grades' button:
- At bottom of grading view
- Saves ALL writing questions with current scores/feedback
- Same dual-write per question
- Success toast: 'All grades saved'

Key design decision: Auto-save writes to BOTH stores (not just RTDB draft) to prevent split state between session data and permanent record.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Auto-save debounced at 20s per question on score/feedback change
- [x] #2 Auto-save writes to BOTH RTDB and permanent (same dual-write)
- [x] #3 Save-on-blur triggers for individual questions
- [x] #4 Visual indicator: 'Auto-saving...' / 'Auto-saved ✓' per question
- [x] #5 'Save All Grades' button in footer saves all questions with current data
- [x] #6 Timer cleanup on unmount via useRef + useEffect cleanup
- [x] #7 Build succeeds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-03-02: Implemented. Added:
- 20s per-question debounce auto-save via useRef timers + cleanup on unmount
- handleScoreChange / handleFeedbackChange wrappers that update state + schedule auto-save
- Auto-save uses same dual-write (RTDB + permanent) as manual save
- Auto-save status indicator per question: 'Auto-saving...' / '✓ Auto-saved'
- Save All Grades button in footer — saves every question sequentially
- Timer cleanup in useEffect cleanup returning
- scoresRef/feedbacksRef for avoiding stale closures
Build clean.
<!-- SECTION:NOTES:END -->

