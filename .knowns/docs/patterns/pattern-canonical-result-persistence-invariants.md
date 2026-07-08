---
title: 'Pattern: Canonical Result Persistence Invariants'
description: 'Canonical persistence contract for RTDB test results: atomic save of canonical row plus discovery indexes, ownership fallback rules, read-path dependencies, and repair expectations.'
createdAt: '2026-03-27T22:56:18.635Z'
updatedAt: '2026-05-11T17:43:09.129Z'
tags:
  - pattern
  - results
  - rtdb
  - data-integrity
  - visibility
  - bug-prevention
---

# Pattern: Canonical Result Persistence Invariants

## Why this exists

A test result is not truly "saved" when only the canonical `/test_results/{resultId}` row exists. In this system, result visibility depends on secondary discovery paths used by student and teacher readers. If those indexes are missing or ownership stays unresolved, the row exists but behaves like lost data.

This pattern was formalized after the 2026-03-28 incident where a teacher-ended IELTS Reading session created a canonical result row that was invisible to:
- the student waiting-room result modal
- the student academic record
- the teacher student-history view

See @doc/sop/test-end-flow-debug-retrospective and @doc/architecture/results-academic-record.

## Failure class

### Symptom cluster
- Student sees: "Test results are still being processed" / repeated re-fetch attempts
- Student academic record does not show the test
- Teacher student history does not show the test
- `/test_results/{resultId}` exists, so the row looks saved in raw data checks

### Root cause
The system historically allowed partial persistence:
- canonical row written to `/test_results/{resultId}`
- one or more required indexes not written
- `visibility.ownershipResolved` left false for a valid class-session result

That creates a false-positive save: the row exists, but the product cannot discover it through the normal read paths.

## Canonical persistence contract

A canonical class-session result save is only successful when all of the following are true in the same logical operation:
- `/test_results/{resultId}` is written
- `/test_results_by_student/{studentId}/{resultId}` exists
- `/test_results_by_session/{sessionCode}/{resultId}` exists
- `/test_results_by_teacher/{teacherId}/{resultId}` exists when teacher ownership is known
- `game_sessions/{sessionCode}/players/{studentId}/latestResultId` is updated when session-player state is available
- `visibility.ownershipResolved === true` for teacher-owned class-session results

Operational rule: discoverability is part of durability.

## Write pattern

Use a single RTDB multi-location root update for the canonical row and every required index.

Why:
- sequential writes can succeed for the canonical row and fail for indexes
- readers are index-driven, so partial success produces silent data loss in product surfaces
- a single root `update(...)` gives a clear all-or-nothing persistence boundary for the result record and its lookup graph

Related standard: @doc/patterns/pattern-rtdb-multi-path-write-obligation

## Ownership resolution rule

For `context.type === 'class_session'`, ownership resolution must not fail merely because session ownership metadata is temporarily unavailable.

Resolution order:
1. resolve from session metadata when available
2. if unresolved but canonical `result.teacherId` is already present and valid, use that as the fallback owner
3. only keep the row unresolved when both session metadata and canonical teacher ownership are genuinely absent or contradictory

This prevents valid teacher-owned rows from being persisted as invisible `ownershipResolved: false` records.

## Read-path dependencies

These product surfaces depend on different lookup paths:
- Student waiting-room modal: session index, student index, `latestResultId`, and legacy fallbacks
- Student academic record: student index
- Teacher student history: teacher index plus resolved visibility ownership

Implication: when one save defect removes indexes, multiple seemingly unrelated features fail together.

## Repair expectations

When debugging or building backfills, treat these as repair targets for historical rows:
- missing student/session/teacher indexes for an existing canonical row
- missing `latestResultId` on the session player node
- unresolved ownership on a row that already contains trustworthy canonical teacher ownership

A one-off row patch is not enough as a long-term standard. The system should support generic backfill or reindex tooling for historical orphaned rows.

## Important references
- `src/services/testResults.service.ts`
- `src/services/resultOwnershipResolver.ts`
- `src/components/test/TestResultsModal.tsx`
- `src/services/academicRecordService.ts`
- `src/pages/TeacherStudentHistoryPage.tsx`
- `documentation/tasks-0041-assessment.md`

## Current state as of 2026-03-28
- New canonical saves use an atomic multi-location RTDB write for the canonical row plus discovery indexes.
- Class-session ownership resolution falls back to canonical `result.teacherId` when session ownership metadata is unavailable.
- The previously failing live session `3F15BY` was repaired and is now discoverable by student, session, and teacher lookup paths.
- Remaining gap: historical orphaned rows still need a generic backfill/reindex utility if full systemic cleanup is required.


## 2026-03-29 Amendment — Recursive Payload Sanitization and Completion Ordering

### Additional failure class

Canonical-first persistence is still not sufficient when the payload contains nested `undefined` values. Firebase RTDB rejects `undefined` anywhere in an object tree, so a class-session result can fail before the canonical row exists if `context`, `source`, or academic metadata includes optional `undefined` fields.

This failure mode is more severe than a missing-index bug because it leaves **no durable result row at all** while the surrounding session flow may still try to behave as if the result exists.

### New invariants
- Sanitize result payloads recursively before every RTDB `set(...)` or root `update(...)`.
- Never mark player state as `isSubmitted`, `hasCompletedTest`, or navigate with `showResults` until canonical result persistence returns a durable `resultId`.
- Teacher end flow must fail closed: if any auto-submit result fails to persist, do not reset or complete the session as if the test ended cleanly.
- Zero-answer auto-submissions still need a durable 0-score result; "no answers" is not a valid reason to skip persistence.
- Active in-progress test sessions must be finalized from the teacher monitor flow, not from generic session-management completion utilities.

### Why this matters

Several product surfaces are optimistic about completion state:
- student test router can redirect away once completion flags are set
- waiting-room result retrieval can open the modal if navigation says results should exist
- session cleanup can move the room back to `waiting`

If those surfaces advance before canonical persistence succeeds, the UI presents a false-success state and then retries forever against missing data.

### Current operational state as of 2026-03-29
- `saveTestResult()` recursively sanitizes payloads before canonical and index writes.
- Manual submit now persists the canonical result before marking the player submitted or redirecting to result UI.
- Teacher end flow derives academic context from live session fields, persists auto-submitted results first, and aborts session closure on any failed save.
- Session Management no longer acts as a safe end-test path for active in-progress sessions.
- Historical incidents created before this amendment may still require repair if no durable canonical row was ever written.

### Related docs
- @doc/sop/test-end-flow-debug-retrospective
- @doc/architecture/test-system-architecture
- @doc/architecture/results-academic-record


## 2026-05-10 Amendment - Homework Visibility Misclassification Repair

Additional failure class:
- Teacher Homework Detail can list a submission but the result modal shows `Access Revoked` because `/test_results/{resultId}` is not teacher-readable.
- Root cause can be canonical visibility misclassification, especially treating generic homework `context.source.submissionId` as a Writing submission id and persisting `visibility.sourceType: "writing_submission"` with `ownershipResolved: false`.

New invariant:
- Generic homework `context.source.submissionId` is not a Writing ownership signal.
- Normal Reading/Listening homework results resolve through `context.assignment.homeworkId` -> `homework_assignments/{homeworkId}.createdBy`.
- Explicit Writing identifiers only may trigger `writing_submissions/{submissionId}` ownership lookup.
- `ensureResultVisibility()` and `rebuildTeacherResultIndexes()` must re-resolve unresolved historical rows before exclusion remains final.
- UI fallback reads after `permission_denied` are forbidden; repair belongs in canonical visibility/indexing.

Related history: @doc/architecture/changelog/homework-result-visibility-repair
