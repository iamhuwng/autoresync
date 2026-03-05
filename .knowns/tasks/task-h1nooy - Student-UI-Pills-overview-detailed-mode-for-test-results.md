---
id: h1nooy
title: Student UI — Pills overview + detailed mode for test results
status: done
priority: medium
labels:
  - writing-grading
  - ui
  - student
createdAt: '2026-03-01T16:56:52.634Z'
updatedAt: '2026-03-01T18:11:13.332Z'
timeSpent: 332
spec: specs/spec-teacher-name-in-grading-results
fulfills:
  - AC-4
  - AC-5
  - AC-6
  - AC-7
  - AC-8
---
# Student UI — Pills overview + detailed mode for test results

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement student result view for THCS tests with: (1) Overview mode — grid of colored pills (green correct, red incorrect, amber partial), click to expand detail card, (2) Detailed mode — scrollable card list with all questions, expandable, (3) Toggle between modes via buttons in sticky header, (4) Writing questions show: student answer, correction if not full marks, model answers ONLY if set in answer key, "Graded by {teacherName}" when teacher-graded, (5) Follow student-view-design standard (flat, no glass). Files: ResultDetailPage.tsx. Must handle backward compat (no gradedByName → omit "Graded by" line).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Overview mode: grid of pills (green/red/amber) with click-to-expand
- [x] #2 Detailed mode: scrollable card list with all questions, each expandable
- [x] #3 Toggle buttons for switching between Overview and Detailed modes
- [x] #4 Writing Qs show 'Graded by {teacherName}' when gradedByName exists
- [x] #5 Model answers only shown if correctAnswer is present (not always)
- [x] #6 Backward compat: no gradedByName → omit 'Graded by' line gracefully
- [x] #7 Follows student-view-design standard (flat bg, no glass, social-feed)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan (REVISED)

### Guards
- Pills view ONLY for THCS tests (testType === 'THCS-THPT' or testSkill === 'Mixed')
- IELTS Writing keeps existing WritingResultView flow (already has 'Graded by')
- IELTS Reading/Listening keeps existing expandable list

### Component Extraction
- Create `src/components/results/QuestionPillsGrid.tsx` — reusable pills grid
- Create `src/components/results/QuestionDetailedList.tsx` — detailed card list
- Both imported by ResultDetailPage, switched via viewMode toggle

### Data
- Read from permanent record `TestResultRecord.questionResults[]`
- Writing questions identified by `questionType` containing 'sentence-rewrite'
- Show 'Graded by {gradedByName}' only when field exists (graceful degradation)
- Model answers: for now, show `correctAnswer` if non-empty. (modelAnswers from test content would require extra fetch — defer)

### Styling
- Follow student-view-design FLAT styling (#f3f4f6 bg, white cards, no glass)
- NOT the 3-column social-feed layout (this is a standalone results page)

### Files
- `src/components/results/QuestionPillsGrid.tsx` — NEW
- `src/components/results/QuestionDetailedList.tsx` — NEW
- `src/pages/ResultDetailPage.tsx` — import + conditional render
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-03-02: Plan updated per independent assessment:
- Add test type guard: pills view ONLY for THCS (40+ questions). IELTS keeps existing WritingResultView flow.
- Extract QuestionPillsGrid and QuestionDetailedList into separate components
- modelAnswers gap: updateThcsWritingGrade() already writes to permanent record but doesn't store modelAnswers. Need to check if we should add modelAnswers to permanent record questionResults[] or read them from the test content instead.
- 3-column layout does NOT apply to ResultDetailPage (standalone page). Only flat styling applies.

2026-03-02: Implemented Student UI task h1nooy.

Created:
- src/components/results/QuestionPillsGrid.tsx (Overview mode: clickable colored pills grid)
- src/components/results/QuestionDetailedList.tsx (Detailed mode: expandable card list)

Refactored:
- ResultDetailPage.tsx: Full student-view-design compliance
  - Replaced all gradient/glass patterns with flat #f3f4f6 bg, white cards
  - Added student-view-root class for CSS override
  - Added THCS detection (testType/testSkill/question count)
  - Added view mode toggle (Overview/Detailed) for THCS only
  - IELTS keeps existing expandable list unchanged
  - Writing Qs show 'Graded by {teacherName}' when gradedByName exists
  - Model answers shown when available
  - Backward compat: graceful degradation for missing fields
  - Buttons changed to pill-shaped per design standard

Build clean. Validation passed.

📚 Extracted to @doc/patterns/pattern-thcs-result-view-toggle
<!-- SECTION:NOTES:END -->

