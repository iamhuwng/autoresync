# Homework Solo Practice Architecture

Canonical visibility governance for homework and solo-practice results lives in:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`

## Homework Ownership

- Homework result ownership resolves from `homework_assignments/{homeworkId}`.
- The authoritative owner field is `createdBy`.
- Homework ownership overrides weaker session, course, class, or producer-local fields.

## Solo Practice Ownership

- Solo practice is student-owned, not teacher-owned.
- Solo-practice rows are visible to teachers only after the outer assignment gate passes.
- Solo-practice rows are never written to `test_results_by_teacher/*`.
- Solo-practice rows are always excluded from teacher-owned analytics.
- Teacher detail view for solo practice is view-only.

## Shared Contract

- Producers must persist the canonical `result.visibility` snapshot.
- Consumers must not promote `selectedTeacherId`, `assigningTeacherId`, or assignment status into ownership.

## 2026-04-02 Amendment - Reading Passage Highlight Contract

Solo practice and homework Reading flows now share one source-of-truth renderer contract:
- `src/skills/reading/components/PassageRenderer.tsx` is the owning implementation for passage highlighting behavior.
- `src/components/PassageRenderer_v2.jsx` is a compatibility wrapper only and must delegate to the skill-owned renderer instead of reimplementing highlight logic.
- highlight persistence must be based on source passage offsets, not per-paragraph DOM offsets
- selections that start in one rendered paragraph and end in the next are valid and must save as one logical highlight
- new solo student preferences must default `highlighterEnabled` to `false`, so the tool stays off until the student explicitly enables it

Reference:
- `documentation/architecture/reading-passage-highlighting-architecture.md`

## Student Shell Homework Summary Contract

Homework summary groups that are reused across student shell pages belong to the shared student shell provider documented in `documentation/architecture/student-shell-data-loading.md`.

Required rules:
- shell-level homework summaries are loaded once for the shell route tree and reused by shell consumers and page consumers
- homework list, courses, library, and other shell pages may derive counters and urgency selectors from that shared summary owner
- dedicated homework detail or submission surfaces may own additional page-specific detail loads when those loads are not shell-global
- student shell navigation must not recreate overlapping homework summary loaders when only the page host changes

## Teacher Class-Scoped Homework Surface Contract

Teacher class management now exposes homework as a first-class class-scoped surface rather than a placeholder redirect.

Required rules:
- class detail homework tabs must read from the same homework source of truth as the teacher homework dashboard by passing the active `classId` into the shared homework hook
- class detail homework fetches must stay gated behind the homework tab selection to avoid hidden background loading
- homework creation launched from a class page must pass a preselected target shaped as `{ type: 'class', classId, className }`
- successful create and reset flows from the class page must refetch the class-scoped homework list so the tab stays current without a full-page navigation
- class homework cards must open the teacher homework detail route for the selected row

Current repo anchors:
- `src/pages/TeacherClassDetailPage.tsx`
- `src/hooks/useHomeworkList.ts`
- `src/components/homework/HomeworkCard.tsx`
- `src/components/homework/HomeworkCreateModal.tsx`

## 2026-04-01 Amendment - IELTS Writing Homework Timer And Resume Contract

IELTS Writing homework currently reuses the student practice route and the `WritingPracticeView` delivery surface. That route handoff now has an explicit contract.

Required route state from homework entry points:
- `homeworkId`
- `submissionId`
- `teacherId`
- `dueDate`
- `lateSubmissionAllowed`
- `timerMinutes`
- `maxAttempts`
- `startedAt`

Timer rules:
- homework timer override wins over solo/default Writing timing when `timerMinutes` is present
- `timerMinutes === undefined` means "fallback to the Writing test duration if one exists"
- `timerMinutes === null` or `<= 0` means "no timer"
- `startedAt` from the homework attempt is the canonical timer anchor and must survive close-tab / back / resume flows

Resume rules:
- saved local Writing progress may show a resume decision only when homework policy still permits a fresh attempt
- single-attempt homework (`maxAttempts === 1`) must auto-resume and must not offer restart
- while a resume decision is pending, countdown time must not continue burning in the background

Timeout rule:
- when a homework Writing timer expires, the attempt should auto-submit the homework payload instead of leaving a stranded local draft
