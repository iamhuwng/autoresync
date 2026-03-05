---
id: u2ovxj
title: Teacher UI — InlineWritingGrader refactor (PARENT — see sub-tasks)
status: done
priority: high
labels:
  - writing-grading
  - ui
  - teacher
createdAt: '2026-03-01T16:56:43.592Z'
updatedAt: '2026-03-01T17:45:20.891Z'
timeSpent: 0
spec: specs/spec-teacher-name-in-grading-results
fulfills:
  - AC-1
  - AC-2
  - AC-3
  - AC-13
  - AC-14
---
# Teacher UI — InlineWritingGrader refactor (PARENT — see sub-tasks)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PARENT TASK — Split into 4 sub-tasks. See children for implementation details. Original scope was too large for a single task (9 ACs spanning complete UI rewrite, data fetching, auto-save, and dual-write).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add `teacherUid` and `teacherName` to InlineWritingGraderProps
- [ ] #2 Replace SCORE_PRESETS buttons with HTML range slider (0 to pointsMax)
- [ ] #3 Student answer rendered read-only (gray bg, lock icon, not editable)
- [ ] #4 Feedback: full marks → auto '✓ Correct', partial/zero → editable text field
- [ ] #5 Dual-write: RTDB session write + updateThcsWritingGrade() for permanent record
- [ ] #6 Auto-save: debounced ~5s on score/feedback change
- [ ] #7 Explicit 'Save All Grades' button at bottom (saves all at once)
- [ ] #8 Show full question results table at top (all Q1-Q40 as rows with status)
- [ ] #9 All writing Qs shown simultaneously (not one-at-a-time stepper)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Current State
InlineWritingGrader.tsx (344 lines) is a stepper component that shows one writing question at a time with SCORE_PRESETS buttons [0, 0.25, 0.5, 0.75, 1.0]. It only writes to RTDB session. No dual-write, no auto-save, no teacher identity.

### Major Changes

#### 1. Props — Add teacher identity
```typescript
interface InlineWritingGraderProps {
    // ... existing props
    teacherUid: string;    // NEW
    teacherName: string;   // NEW
}
```
Also need to update TeacherTestMonitorPage.tsx where it renders InlineWritingGrader to pass these props.

#### 2. Layout — All Qs at once (not stepper)
Remove `currentIndex` stepper pattern. Render ALL writing questions simultaneously in a scrollable list. Each question card contains:
- Question prompt (read-only)
- Student answer (read-only, gray bg)
- Score slider (horizontal range input, 0 to pointsMax)
- Feedback (conditional: full marks = auto correct, else text field)

#### 3. Score — HTML range slider
Replace SCORE_PRESETS array + button row with:
```html
<input type="range" min="0" max={pointsMax} step="0.25" />
```
With labels showing 0 and max on ends, and current value displayed.

#### 4. Dual-write in handleSubmitGrade
```typescript
// Write 1: RTDB session (existing)
await update(ref(database, updatePath), { ... });

// Write 2: Permanent record (NEW)
await updateThcsWritingGrade(sessionCode, studentId, qNum, {
    score, maxScore, feedback, teacherName, teacherUid
});
```

#### 5. Auto-save (debounced ~5s)
Use useRef + setTimeout pattern for debounced auto-save. On score/feedback change, start 5s timer. Only saves to RTDB (not permanent) as draft. The "Save All Grades" button triggers permanent save.

#### 6. Question results table at top
Render a table showing all questions (Q1-Q40) with: number, type, student answer, correct/incorrect status, score. Writing questions show "⏳ Pending" or "✓ Graded".

### Files to modify
- `src/components/thcs-grading/InlineWritingGrader.tsx` — main refactor
- `src/pages/TeacherTestMonitorPage.tsx` — pass teacherUid/teacherName props

### Risk: High
Complete UI restructure. The existing stepper UX is being replaced with a full-page grading view.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-03-02: SPLIT into 4 sub-tasks after independent assessment found scope too large. Sub-tasks: u2ovxj-A (UI), u2ovxj-B (dual-write), u2ovxj-C (auto-save), u2ovxj-D (question table). This parent task is now a tracking container.

2026-03-02: All 4 sub-tasks completed:
- l4q0sd (Sub-A): UI refactor done
- qj9kv1 (Sub-B): Dual-write done
- qd4tcr (Sub-C): Auto-save done
- odi2nt (Sub-D): Results table done
Also completed 864xav (BatchGradingPanel cleanup).
<!-- SECTION:NOTES:END -->

