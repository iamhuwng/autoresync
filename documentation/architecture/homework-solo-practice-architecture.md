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

## Student Shell Homework Summary Contract

Homework summary groups that are reused across student shell pages belong to the shared student shell provider documented in `documentation/architecture/student-shell-data-loading.md`.

Required rules:
- shell-level homework summaries are loaded once for the shell route tree and reused by shell consumers and page consumers
- homework list, courses, library, and other shell pages may derive counters and urgency selectors from that shared summary owner
- dedicated homework detail or submission surfaces may own additional page-specific detail loads when those loads are not shell-global
- student shell navigation must not recreate overlapping homework summary loaders when only the page host changes

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
