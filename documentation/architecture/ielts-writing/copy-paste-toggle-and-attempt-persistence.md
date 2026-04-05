# IELTS Writing Copy Paste Toggle And Attempt Persistence

This note captures the current delivery contract for enabling or disabling writing anti-copy/paste in live IELTS Writing sessions and writing homework, while preserving paste-attempt accounting for submission and review.

## Scope

This contract covers:
- live-session IELTS Writing via `WritingTestPage`
- homework IELTS Writing via `WritingPracticeView`
- the shared writing editor and paste-prevention hook boundary

This contract does not change:
- solo Writing practice behavior in this implementation pass
- generic PRD-0036 anti-cheat telemetry or fullscreen ownership for Writing
- teacher-side Writing authoring metadata or builder forms

## Control Source

Writing now reuses the existing teacher anti-cheat control source instead of inventing a Writing-only flag.

Live-session source:
- `game_sessions/{sessionCode}.antiCheatConfig.detectCopyPaste`
- configured through `SessionStartConfigModal`

Homework source:
- `homework_assignments/{homeworkId}.antiCheatConfig.detectCopyPaste`
- configured through `HomeworkCreateModal` and `AntiCheatConfigSection`

Rules:
- missing config means copy/paste prevention is off for live Writing and homework Writing
- there is no separate `WritingTestMetadata` or draft-level copy/paste toggle
- the teacher-facing UI surface remains the existing anti-cheat controls

## Enforcement Model

IELTS Writing still uses a Writing-specific paste-prevention layer rather than the generic container-wide anti-copy stack.

Current behavior when enabled:
- external paste into the essay textarea is blocked
- drag and drop into the essay textarea is blocked
- suspicious bulk insertion is reverted
- recent internal copy/cut from the same textarea is still allowed for normal essay editing

Ownership rule:
- `WritingEditor` is a thin textarea wrapper and must not own paste-prevention state
- the parent delivery surface owns one shared `useExternalPastePrevention(...)` instance and passes `attachToTextarea` into `WritingEditor`

## Live Session Contract

`WritingTestPage` is the live Writing owner.

Required behavior:
- subscribe to the session root and derive `detectCopyPaste` from `session.antiCheatConfig?.detectCopyPaste`
- initialize the shared writing paste-prevention hook with that enable flag
- hydrate `pasteAttemptCount` from `game_sessions/{sessionCode}/students/{studentUid}/writing/pasteAttemptCount` when saved RTDB state exists
- write updated `pasteAttemptCount` back to that RTDB writing path during the session
- write the latest `pasteAttemptCount` before submit so `autoSubmitFromRTDB()` snapshots the current value

Result rule:
- `autoSubmitFromRTDB()` remains the canonical promotion bridge and persists the RTDB `writing/pasteAttemptCount` into the Firestore `writing_submissions/{submissionId}` record

## Homework Contract

`WritingPracticeView` is the homework Writing owner.

Required behavior:
- load the homework document via `getHomeworkById(homeworkId)`
- derive the enable flag from `homework.antiCheatConfig?.detectCopyPaste`
- use the shared writing paste-prevention hook only as a homework-scoped toggle source; solo Writing remains on its previous behavior in this pass
- persist `pasteAttemptCount` in the saved practice state alongside essays, active task, and timer anchor data
- restore `pasteAttemptCount` on resume so refresh/reopen flows do not reset the count before submission

Submission rule:
- homework writing submissions must send the shared hook's `pasteAttemptCount` into the canonical `createSubmission(...)` payload

## Explicit Non Goals

This implementation intentionally does not:
- add a new Writing-specific anti-cheat setting in the Writing builder or Writing metadata
- retrofit the full generic anti-cheat event pipeline into the Writing essay editor
- change solo Writing practice to honor homework/session anti-cheat config

## Verification Anchors

Implementation anchors:
- `src/hooks/useExternalPastePrevention.ts`
- `src/components/writing-student/WritingEditor.tsx`
- `src/components/writing-student/WritingTestPage.tsx`
- `src/hooks/useWritingAutoSave.ts`
- `src/components/writing-practice/WritingPracticeView.tsx`

Coverage anchors:
- `src/hooks/useExternalPastePrevention.test.ts`
- `src/components/writing-student/WritingTestPage.test.tsx`
- `src/components/writing-practice/WritingPracticeView.test.tsx`
- `src/services/writingSubmissionService.test.ts`

## Related Docs

- `contracts-and-governance.md`
- `lifecycle-and-surfaces.md`
- `../homework-solo-practice-architecture.md`
- `../../../.knowns/docs/architecture/scheme/ielts-writing-current-state-scheme.md`