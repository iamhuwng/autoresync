---
title: Homework Solo Practice Architecture
description: 'Solo practice and homework system: data flows, status machine, result context, access control.'
createdAt: '2026-02-27T16:20:59.562Z'
updatedAt: '2026-03-29T08:41:42.846Z'
tags:
  - architecture
  - homework
  - solo
  - practice
---

# Homework & Solo Practice Architecture

## Overview

Two offline/async test-taking modes complementing the live session system:
- **Solo Practice:** Students self-study from library materials at their own pace
- **Homework:** Teachers assign materials with deadlines, attempt limits, and feedback timing

Both share the same test-taking infrastructure but add context tracking, access control, and deadline management.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ Teacher Side                │ Student Side                    │
│ ┌────────────────────────┐  │ ┌──────────────────────────┐   │
│ │TeacherHomeworkListPage │  │ │StudentHomeworkListPage   │   │
│ │HomeworkCreateModal     │  │ │StudentHomeworkDetailPage │   │
│ │HomeworkConfigPanel     │  │ │StudentLibraryPage        │   │
│ └──────────┬─────────────┘  │ │StudentPracticePage       │   │
│            │                │ └──────────┬───────────────┘   │
│            │ creates        │            │ takes              │
│            ▼                │            ▼                    │
│ /homework_assignments       │ StudentSoloTestPage.tsx         │
│                             │ (shared for both modes)         │
├─────────────────────────────┴────────────────────────────────┤
│ Result Context System:                                        │
│ { type: 'homework'|'self_study', source: {...},              │
│   assignment?: { dueDate, attemptNumber, isLate } }          │
├──────────────────────────────────────────────────────────────┤
│ RTDB Paths:                                                   │
│ /homework_assignments/{id}  /homework_submissions/{id}        │
│ /solo_sessions/{id}         /student_groups/{id}              │
│ /homework_templates/{id}    /test_results (with context)      │
└──────────────────────────────────────────────────────────────┘
```

## Data Flows

### Self-Study Flow
```
StudentLibraryPage → Browse materials
  → Click "Practice" → /student/solo-test/:materialId
  → soloSessionManager.createSoloSession()
  → context = { type: 'self_study', source: { type: 'library' } }
  → On submit → results saved with context → result detail
```

### Homework Flow
```
Teacher: HomeworkCreateModal (3 steps: select → configure → confirm)
  → homeworkManager.createHomework()
  → status: draft → scheduled → active → past_due → closed

Student: StudentHomeworkListPage → StudentHomeworkDetailPage
  → Creates submission on "Start"
  → context = { type: 'homework', assignment: { dueDate, attemptNumber } }
  → On submit → link result to submission → teacher sees results
```

### Homework Status Machine
```
draft ─→ scheduled ─→ active ─→ past_due ─→ closed
       (set dates) (availableFrom) (dueDate)  (manual)
```
Automatic transitions via `homeworkAutoTransitionService` (client-side checks + callbacks).

## Key Services
| Service | Purpose |
|---------|---------|
| `homeworkManager.ts` | Homework CRUD |
| `homeworkSubmissionService.ts` | Student submission tracking |
| `soloSessionManager.ts` | Solo practice session lifecycle |
| `materialDiscoveryService.ts` | Library search/filtering |
| `studentGroupService.ts` | Saved student groups |
| `homeworkTemplateService.ts` | Reusable homework configs |
| `studentStreakService.ts` | Practice streak tracking |
| `homeworkAutoTransitionService.ts` | Automatic status transitions |

## Result Context System
All results include a `context` field:
```typescript
{ type: 'class_session' | 'homework' | 'self_study' | 'course_material',
  source: { type: 'class' | 'homework' | 'library', id, name },
  assignment?: { homeworkId, dueDate, isLate, attemptNumber },
  configApplied: { timerMinutes, feedbackTiming, source } }
```
Colors: 🏫 Live=Blue, 📋 Homework=Orange, 📖 Practice=Green, 📚 Course=Purple

## Access Control
- Teachers see results **only for assigned students**
- Verified via `assignmentManager.isStudentAssignedToTeacher()`
- On unassignment: results preserved but teacher access revoked
- `AccessControlWrapper` handles periodic rechecks

## Related Docs
- @doc/system/solo-study-homework-system — Full system doc
- @doc/system/database-schema-homework-solo — Database schema
- @doc/prd/prd-solo-study-homework — PRD
- @doc/prd/prd-unified-solo-practice — Unified practice PRD
- @doc/architecture/test-system-architecture — Test system (cross-ref)


## 2026-03-29 Addendum — IELTS Writing Exception Path

The generic solo/homework architecture in this document remains broadly correct for non-writing materials, but IELTS Writing now needs an explicit exception note.

### Current Writing path
- IELTS Writing solo and homework entry currently route through `StudentPracticePage`, not the older generic `StudentSoloTestPage` wording used above.
- `StudentPracticePage` detects `testType: 'IELTS'` plus `skill: 'Writing'` and renders `WritingPracticeView`.
- `WritingPracticeView` writes canonical Firestore `writing_submissions` rows and then materializes the compatible RTDB result/index records.
- Live-session Writing uses a separate `WritingTestPage` + RTDB live-session draft path and only later promotes into `writing_submissions`.

### Why this matters
- Non-writing IELTS solo practice depends on the student-safe RTDB projection path.
- IELTS Writing does not use that same delivery contract and must be evaluated against the Writing-specific grading/result lifecycle.
- Homework Writing currently reuses the solo-practice Writing UI, but it is not yet identical to the generic homework submission lifecycle described elsewhere in the codebase.

### Guardrail
- When updating solo practice or homework architecture, do not assume IELTS Writing follows the same submit, result-detail, or ownership path as Reading/Listening or generic solo-test flows.
- Cross-check with @doc/architecture/scheme/ielts-writing-current-state-scheme before changing Writing-related logic.

## 2026-03-29 Implementation Update — IELTS Writing Homework/Practice Sync

The current implementation now enforces the Writing-specific async contract in the homework and solo-practice flows:

- Homework Writing attempts are routed with `homeworkId`, `submissionId`, and the assigning `teacherId` into `StudentPracticePage` and `WritingPracticeView`.
- Homework Writing no longer behaves like free teacher-pick solo practice. The assigned homework teacher is the grading target, and the stored Writing submission now records that with `context.assigningTeacherId`.
- Submitting a homework Writing essay now updates both storage systems: `writing_submissions/{resultId}` plus the canonical `homework_submissions/{submissionId}` lifecycle row.
- Final teacher grading now upgrades the linked homework attempt to `graded` and stores the band score used by homework-facing student UI.
- Student homework cards/details now treat Writing as a manual-review workflow: pending submissions show waiting-state copy, and graded submissions can display band output instead of percentage-only assumptions.
