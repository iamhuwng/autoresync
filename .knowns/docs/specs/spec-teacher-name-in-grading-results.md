---
title: 'Spec: Teacher Name in Grading Results'
createdAt: '2026-03-01T13:13:51.639Z'
updatedAt: '2026-03-01T17:20:43.665Z'
description: >-
  Specification for adding the grading teacher's name to IELTS Writing results
  and THCS writing question results
tags:
  - spec
  - approved
---
## Overview

Add the grading teacher's name/identity to THCS writing test results. When a teacher grades a writing question, store WHO graded it (name + UID + timestamp) and display it to students in academic records.

### Key Decisions (FINAL — Approved 2026-03-01)

| Decision | Value |
|----------|-------|
| AI auto-marking for THCS writing | **IGNORE** — plan to remove later |
| BatchGradingPanel | **DELETE** — orphaned dead code |
| Dual-write strategy | RTDB session + permanent test_results/ |
| Display format | "Graded by {teacherName}" only, no grading history |
| Teacher name fallback | `displayName → email → 'Teacher'` |
| Score UI | Horizontal slider (0 to question max) |
| Student answer in grading | Read-only |
| Student result view | Pills overview + detailed card list mode |
| Student design standard | Flat social-feed (student-view-design) |
| Model answers | Only show if set in answer key |
| IELTS Writing student view | PASS — already shows "Graded by" |
| StudentDetailModal | OUT OF SCOPE — unnecessary |
| THCSTestLayout data pipe | FIX — pass writingResult prop in review mode |

## Requirements

### Functional Requirements

- FR-1: When a teacher grades a THCS writing question, store the teacher's UID, display name, and timestamp alongside the grade in RTDB AND permanent test_results/.
- FR-2: Display the grading teacher's name in the student result view (both overview pills and detailed mode).
- FR-3: Teacher grading UI shows question results table + writing grading area with horizontal slider scores, read-only student answers, and conditional feedback.
- FR-4: Dual-write: grading writes to both RTDB session (live) and permanent test_results/ (academic records) simultaneously.
- FR-5: New service function `updateThcsWritingGrade()` handles permanent record updates with score recalculation.
- FR-6: Fix THCSTestLayout to pass writingResult prop so students see grading info in-session review.
- FR-7: Establish long-term enforcement rules for all future writing test types to follow this grading pipeline.

### Non-Functional Requirements

- NFR-1: Backward compatible — existing graded results without teacher name display gracefully.
- NFR-2: No additional RTDB reads — denormalize teacher name at write time.
- NFR-3: Auto-save debounced every ~20s, writes to BOTH RTDB and permanent record (no split state). Explicit "Save All Grades" button also available.
- NFR-4: Pills overview ONLY for THCS tests (40+ questions). IELTS keeps existing WritingResultView flow.
## Acceptance Criteria

- [x] AC-1: InlineWritingGrader saves `gradedByUid`, `gradedByName`, `gradedAt` to RTDB writingResult
- [x] AC-2: InlineWritingGrader dual-writes to permanent test_results/ via `updateThcsWritingGrade()`
- [x] AC-3: InlineWritingGrader uses horizontal slider for score (0 to question max) with read-only student answer
- [x] AC-4: Student result view has Overview mode (pills: green/red/amber) with click-to-expand
- [x] AC-5: Student result view has Detailed mode (scrollable card list, expandable per question)
- [x] AC-6: Writing questions in student view show "Graded by {teacherName}" when teacher-graded
- [x] AC-7: Model answers only shown if set in answer key
- [x] AC-8: Results without `gradedByName` degrade gracefully (no crash, omit "Graded by" line)
- [x] AC-9: WritingGradingResult type includes `gradedByUid?`, `gradedByName?`, `gradedAt?` fields
- [x] AC-10: `updateThcsWritingGrade()` recalculates totalScore/percentage after each grade
- [x] AC-11: markingStatus transitions correctly (pending → partially-graded → fully-graded)
- [x] AC-12: BatchGradingPanel deleted (orphaned dead code)
- [x] AC-13: Auto-save drafts + explicit "Save All Grades" button in teacher grading UI
- [x] AC-14: Teacher grading page shows full question results table (all Qs as rows)
- [x] AC-15: THCSTestLayout passes writingResult to THCSQuestionRenderer in review mode
- [x] AC-16: Long-term enforcement rules documented and enforced via integration-safety-rules, skills, and global memory

## Technical Design

### Data Model: WritingGradingResult (thcs-test.types.ts) — NEW FIELDS
- `gradedByUid?: string`
- `gradedByName?: string`
- `gradedAt?: number`

### Architecture: Dual-Write
```
Teacher grades Q38 via InlineWritingGrader
    ├── Write 1: RTDB session (live)
    │   writingResult: { teacherScore, teacherFeedback, gradingTier,
    │                    gradedByUid, gradedByName, gradedAt }
    └── Write 2: Permanent record
        updateThcsWritingGrade() → test_results/{resultId}
        + recalculate totalScore, percentage
        + check markingStatus transition
```

### Files to Modify

| File | Change |
|------|--------|
| thcs-test.types.ts | Add gradedBy fields |
| testResults.service.ts | New updateThcsWritingGrade() |
| InlineWritingGrader.tsx | Dual-write, slider, auto-save, teacher props |
| TeacherTestMonitorPage.tsx | Pass teacherUid/teacherName props |
| THCSWritingRenderer.tsx | Display "Graded by {name}" |
| THCSTestLayout.tsx | Pass writingResult prop in review mode |
| ResultDetailPage.tsx | Pills + detailed mode |
| BatchGradingPanel.tsx | DELETE |
| integration-safety-rules.md | New Rule #18 |
| Skills + global rules | Writing grading enforcement |

### Explicitly OUT OF SCOPE
- StudentDetailModal (teacher monitor modal) — unnecessary
- IELTS Writing student view — already works
- AI auto-marking removal — deferred
- Homework/solo writing submission pipeline — deferred

## Edge Cases

| # | Scenario | Resolution |
|---|----------|------------|
| EC1 | Teacher has no displayName | Fallback: displayName → email → 'Teacher' |
| EC2 | No history needed | Last writer wins |
| EC9 | Multiple writing Qs graded one by one | updateThcsWritingGrade() handles incrementally |
| EC10 | markingStatus transition | Count remaining after each. 0 left → fully-graded |

## Open Questions

All resolved. None remaining.
