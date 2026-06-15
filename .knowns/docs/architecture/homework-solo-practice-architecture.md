---
title: Homework Solo Practice Architecture
description: 'Solo practice and homework system: data flows, status machine, result context, access control, and Reading V2 return-path rules.'
createdAt: '2026-02-27T16:20:59.562Z'
updatedAt: '2026-06-15T00:00:00.000Z'
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


## 2026-04-01 Amendment — IELTS Writing Homework Timer And Resume Contract

IELTS Writing homework now relies on an explicit route-state contract between the homework shells, `StudentPracticePage`, and `WritingPracticeView`.

Required homework delivery fields:
- `homeworkId`
- `submissionId`
- `teacherId`
- `dueDate`
- `lateSubmissionAllowed`
- `timerMinutes`
- `maxAttempts`
- `startedAt`

Timer rules:
- homework timer override wins when `timerMinutes` is present
- `timerMinutes === undefined` means fallback to the Writing test duration
- `timerMinutes === null` or `<= 0` means no timer
- `startedAt` from the homework attempt is the canonical countdown anchor across close-tab and resume flows

Resume rules:
- saved local Writing progress may show a resume choice only when homework policy still allows a fresh attempt
- single-attempt homework (`maxAttempts === 1`) must auto-resume and must not offer restart
- if a resume decision modal is shown, countdown time must pause while the decision is pending

Timeout rule:
- homework Writing timer expiry must auto-submit the homework attempt instead of leaving only a local draft

## 2026-04-02 Amendment - Reading Passage Highlight Contract

Solo practice and homework Reading flows now share one source-of-truth renderer contract:
- `src/skills/reading/components/PassageRenderer.tsx` is the owning implementation for passage highlighting behavior.
- `src/components/PassageRenderer_v2.jsx` is a compatibility wrapper only and must delegate to the skill-owned renderer instead of reimplementing highlight logic.
- Highlight persistence must be based on source passage offsets, not per-paragraph DOM offsets.
- Selections that start in one rendered paragraph and end in the next are valid and must save as one logical highlight.
- New solo student preferences must default `highlighterEnabled` to `false`, so the tool stays off until the student explicitly enables it.

See @doc/architecture/reading-passage-highlighting-architecture.

## 2026-04-05 Amendment — IELTS Writing Homework Copy Paste Toggle And Persistence Contract

IELTS Writing homework now honors the homework anti-cheat copy/paste flag instead of running as an always-on exception.

Homework Writing rules:
- `WritingPracticeView` must load `homework_assignments/{homeworkId}` and derive the enable flag from `homework.antiCheatConfig?.detectCopyPaste`.
- missing homework anti-cheat config means copy/paste prevention is off for homework Writing.
- the homework delivery surface owns the shared writing paste-prevention hook and passes its attachment callback into `WritingEditor`.
- homework saved local progress must persist `pasteAttemptCount` together with essays, active task, and timer anchor state.
- homework resume must restore that persisted `pasteAttemptCount` before the submission flow materializes the Writing payload.

Scope boundary:
- this contract changes homework Writing only; solo Writing behavior remains unchanged in the same implementation pass.

Detailed reference:
- @doc/architecture/ielts-writing/ielts-writing-copy-paste-toggle-and-attempt-persistence-2026-04-05

## 2026-04-09 Amendment - Mobile IELTS Reading Homework Launch Integrity

Homework mobile Reading now depends on two additional launch rules:
- homework launchers must pass a non-empty `studentName` into the shared practice surface so submission creation never writes `undefined` into Firestore payloads
- `StudentPracticePage.tsx` must preserve homework `timerMinutes` and `maxAttempts` from route state when handing off to the shared Reading practice host

Why this matters:
- mobile homework resume depends on the canonical launch state staying intact after navigation from the student homework detail surface
- the resumed phone Reading route must restore the correct timed/attempt-limited behavior instead of silently degrading to the untimed solo default

Reference:
- @doc/architecture/mobile-ielts-reading-test-taking

## 2026-06-03 Amendment - Reading V2 Homework Completion Contract

Reading V2 homework has a two-store completion contract:

- trusted Reading V2 submit writes/scored the namespaced Reading V2 result
- the student practice page completes the linked Firestore `homework_submissions/{submissionId}` row through `submitHomework(...)`

Both are required. The Reading V2 result alone is not enough for Student Homework rows, Teacher Homework Detail counts, completion-rate summaries, or homework result review entry points.

Rules:

- Reading Passage homework launch uses assignment-pinned `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}` payloads.
- Reading Passage set homework composes only assignment-pinned passage snapshots.
- submit payloads stay projection-bound and carry no browser answer keys.
- `submitHomework(...)` receives the trusted result id plus score fields from Reading V2 submit.
- idempotent already-submitted retry can be soft success.

Detailed reference: @doc/architecture/reading-v2-material-publish-and-passage-library.

## 2026-06-15 Amendment - Reading V2 Return Path Contract

Reading V2 solo-practice and homework launches now require an explicit in-runtime exit path instead of relying on browser history.

Required rules:
- `StudentPracticePage.tsx` remains the owner of launch-context-to-destination mapping for non-live Reading V2 exits.
- the rendered `ReadingV2RuntimeShell` must expose a visible top-right `X` control through host wiring
- homework exits return to `STUDENT_HOMEWORK`
- course-material exits return to `STUDENT_COURSE_DETAIL` for the active `courseId`
- solo-practice, public-library, and private-material library exits return to `STUDENT_LIBRARY`
- exit routing must preserve the existing student shell entry semantics instead of inventing a standalone Reading V2 landing page

Scope boundary:
- this amendment covers non-live Reading V2 launches from homework and student practice entry points
- it does not change live-session Reading V2 routing in `TestPageRouter.tsx`
- it does not change Writing, Listening, or legacy Reading V1 exit behavior in the same pass

Obsolete as of 2026-06-15:
- expecting students to use browser back because Reading V2 runtime has no explicit return affordance
- treating public/private solo practice as context-free launches that can safely strand the student inside the runtime shell

Detailed reference:
- @doc/architecture/reading-v2-runtime-integrations
