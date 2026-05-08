---
title: IELTS Writing Copy Paste Toggle And Attempt Persistence 2026-04-05
description: Architecture note for the live-session and homework IELTS Writing copy/paste toggle, shared editor ownership, and paste-attempt persistence contract.
createdAt: '2026-04-05T03:52:04.816Z'
updatedAt: '2026-04-05T03:52:23.101Z'
tags:
  - architecture
  - ielts
  - writing
  - anti-cheat
  - homework
  - live-session
---

# IELTS Writing Copy Paste Toggle And Attempt Persistence 2026-04-05

## Purpose

This note defines the current contract for enabling or disabling writing anti-copy/paste in live IELTS Writing sessions and writing homework while preserving paste-attempt evidence through submit and review.

## Control source

Writing must reuse the existing teacher anti-cheat toggle instead of adding a Writing-only metadata flag.

Live-session source:
- `game_sessions/{sessionCode}.antiCheatConfig.detectCopyPaste`
- configured through the live start modal

Homework source:
- `homework_assignments/{homeworkId}.antiCheatConfig.detectCopyPaste`
- configured through the homework anti-cheat section

Rules:
- missing config means copy/paste prevention is off for live Writing and homework Writing
- there is no separate `WritingTestMetadata` or draft-level toggle for this behavior
- the teacher-facing controls remain the existing anti-cheat surfaces

## Enforcement model

The Writing domain still uses the specialized `useExternalPastePrevention(...)` hook rather than the generic PRD-0036 container-wide anti-copy stack.

When enabled:
- external paste into the essay textarea is blocked
- drag and drop into the essay textarea is blocked
- suspicious bulk insertion is reverted
- recent internal copy/cut from the same textarea is still allowed for normal essay editing

Ownership rule:
- `WritingEditor` is a thin textarea wrapper only
- the parent delivery surface owns one shared hook instance and passes `attachToTextarea` into the editor
- the editor must not own `pasteAttemptCount`

## Live-session contract

`WritingTestPage` is the live Writing owner.

Required behavior:
- derive `detectCopyPaste` from the session root
- initialize the shared hook with that enable flag
- hydrate `pasteAttemptCount` from RTDB saved writing state when present
- sync updated `pasteAttemptCount` back to `game_sessions/{sessionCode}/students/{studentUid}/writing/pasteAttemptCount`
- flush the latest count to RTDB before submit so `autoSubmitFromRTDB()` snapshots the current value

Bridge rule:
- `autoSubmitFromRTDB()` remains the only canonical promotion path from RTDB draft state into Firestore `writing_submissions/{submissionId}`
- that bridge must continue materializing the RTDB `pasteAttemptCount` into the canonical submission record

## Homework contract

`WritingPracticeView` is the homework Writing owner.

Required behavior:
- load the homework document via `getHomeworkById(homeworkId)`
- derive the enable flag from `homework.antiCheatConfig?.detectCopyPaste`
- persist `pasteAttemptCount` in saved local homework Writing state together with essays, active task, and timer anchor state
- restore `pasteAttemptCount` on resume before submission materialization

Submission rule:
- homework Writing submit must use the shared hook's `pasteAttemptCount` when building the canonical submission payload

## Scope boundary

This implementation pass intentionally does not:
- add a new Writing-specific builder setting
- move Writing onto the generic anti-cheat container stack
- change solo Writing practice behavior

## Repo anchors

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

## Related docs

- @doc/architecture/scheme/ielts-writing-current-state-scheme
- @doc/architecture/homework-solo-practice-architecture
- @doc/prd/ielts-writing-test-system-prd
