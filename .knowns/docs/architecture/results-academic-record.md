---
title: Results Academic Record
createdAt: '2026-02-27T17:02:41.986Z'
updatedAt: '2026-02-27T20:33:50.115Z'
description: >-
  Result lifecycle, IELTS bands vs THCS scores, result context system, access
  points, UX gaps.
tags:
  - architecture
  - results
  - academic-record
  - scoring
---
# Results & Academic Record Architecture

## Overview

The results system spans the full pipeline from test submission to long-term academic tracking. It supports multiple viewing contexts (session, student, class, aggregate) and two scoring systems (IELTS bands, THCS scaled scores).

## Result Lifecycle

```
Student submits test → resultsService.saveTestResult()
  → Auto-grade (MC, fill-in) or Manual grade (writing)
  → Save to /test_results/{resultId}
  → Create indexes: by_session, by_student
  → Context tagged: live/homework/practice/course
  → Available in: StudentTestResultsPage, TeacherTestResultsPage, AcademicRecord
```

## Scoring Systems

### IELTS Band Scoring
- Reading/Listening: Raw score → Band score (1.0-9.0)
- Per-question-type breakdown
- Overall band calculation

### THCS Scaled Scoring
- Raw score → Scaled score (out of 10)
- Vietnamese labels
- Per-section breakdown

## Result Access Points

### Student Views
| Page | Route | Description |
|------|-------|-------------|
| `StudentTestResultsPage.tsx` | `/student-test-results/:code` | Immediate post-test results |
| `StudentResultsPage.jsx` | `/student-results/:id` | Legacy quiz results |
| `TestReviewPage.tsx` | `/result/:id/review` | Detailed answer review |
| `AcademicRecordPage` | `/student/academic-record` | Full academic history |
| Dashboard "My History" tab | `/student` | Quick access to results |

### Teacher Views
| Page | Route | Description |
|------|-------|-------------|
| `TeacherTestResultsPage.tsx` | `/teacher-test-results/:code` | Session results |
| `TeacherResultsDashboard.jsx` | `/teacher/results` | ⚠️ Aggregate dashboard (NO navbar button!) |
| `TeacherStudentHistoryPage.tsx` | `/teacher/student/:id/history` | Individual student history |

### Known UX Issue (from analysis)
⚠️ **Teacher Results Dashboard** at `/teacher/results` exists but has **no navigation button** in the teacher lobby. Teachers must know the URL. This is a critical discoverability gap.
See @doc/sop/enhanced-saved-results-ux

## Components

| Component | Purpose |
|-----------|---------|
| `ResultDetailModal` | Full result breakdown (shared student/teacher) |
| `ResultCard` | Result list item card |
| `ResultContextBadge` | Context badge (Live/Homework/Practice) |
| `HomeworkResultsSummary` | Homework-specific completion summary |
| `StudentPracticeHistory` | Solo practice history view |
| `THCSProgressTab` | THCS-specific progress tracking |

## Result Context System (from PRD-0016)

All results include a `context` field for filtering:
```typescript
{
  type: 'class_session' | 'homework' | 'self_study' | 'course_material',
  source: { type, id, name },
  assignment?: { homeworkId, dueDate, isLate, attemptNumber },
  configApplied: { timerMinutes, feedbackTiming, source }
}
```

Badge colors: 🏫 Live=Blue, 📋 Homework=Orange, 📖 Practice=Green, 📚 Course=Purple

## RTDB Paths

```
/test_results/{resultId}/        — Individual result records
/test_results_by_session/{sessionId}/{resultId}  — Session → results index
/test_results_by_student/{studentId}/{resultId}  — Student → results index
/guest_results/{resultId}/       — Guest user results (separate bucket)
```

## Related Docs
- @doc/sop/enhanced-saved-results-ux — Results UX investigation (teacher nav gap)
- @doc/prd/prd-academic-record — Academic record PRD
- @doc/prd/prd-saved-result-system — Enhanced result system PRD
- @doc/architecture/test-system-architecture — Test system (parent)
- @doc/architecture/homework-solo-practice-architecture — Result context system
- @doc/sop/test-end-flow-debug-retrospective — Guest result bug
