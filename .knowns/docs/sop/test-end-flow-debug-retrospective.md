---
title: Test End Flow Debug Retrospective
description: Retrospective on test end flow debugging and fixes
createdAt: '2026-02-27T15:27:04.080Z'
updatedAt: '2026-03-28T23:11:49.489Z'
tags:
  - sop
  - bugfix
  - test-end
  - retrospective
---

# 0034 - Test End Flow Debugging Retrospective (2026-02-12)

## Overview

This document records the debugging journey and architectural discoveries made while investigating why students see a "Test results are still being processed" error after a teacher ends an IELTS test early. The session spanned several hours and involved multiple hypothesis cycles before arriving at the true root cause and a broader architectural redesign.

---

## 1. Initial Problem Statement

**User Report:** When a teacher clicks "End Test" before the timer expires, students are redirected to a results page that shows either "Test not found" or "Test results are still being processed. Please try refreshing the page in a few seconds."

**Starting Context:** The teacher's `endFullSession()` function had already been fixed in a prior session (conversation `4ee2ff17`) to auto-submit all unsubmitted students, not just disconnected ones. Despite that fix, the student results page still failed to load.

---

## 2. Debugging Journey — Chronological

### Hypothesis 1: Results Page Load Order (Surface Fix #1)

**Theory:** The results page (`StudentTestResultsPage.tsx`) was structured to load `tests/${testId}` first, but the teacher's `endFullSession()` sets `testId: null` before the student arrives. So `tests/null` returns nothing → "Test not found."

**Action:** Restructured `loadResults()` to prioritize the permanent result record (`getStudentSessionResult()`) over the testId-based lookup. This way, even if `testId` is cleared, the results page first tries the permanent record which contains all necessary metadata.

**Outcome:** Build succeeded, but the student STILL saw "Test results are still being processed." The restructuring was logically correct but didn't solve the real problem — the permanent result simply didn't exist in the expected Firebase path.

### Hypothesis 2: Firebase Propagation Timing (Surface Fix #2)

**Theory:** The teacher's `endFullSession()` writes the permanent result via `saveTestResult()`, then immediately clears `testId: null`. The student's `onValue` listener fires on the `testId` change and navigates to results. But the `saveTestResult()` write might not have propagated to the student's Firebase SDK cache yet.

**Action:** Added retry logic with progressive delays (1.5s, 3s, 4.5s, 6s, 7.5s — up to 5 retries) to `loadResults()`. When `testId` is null and no permanent result is found, the page waits and retries.

**Outcome:** All 6 retries exhausted. The console showed:
```
[Results] No permanent result found yet
[Results] testId cleared, no permanent result yet. Retrying in 1500ms (attempt 2/6)...
... (repeats through attempt 6/6)
[Results] testId cleared and no permanent result found after all retries
```

This proved it was NOT a timing issue. The result was simply never saved to the expected location. Something more fundamental was wrong.

### Hypothesis 3: The True Root Cause — Guest Detection Bug

**Discovery Process:**

The user pushed back firmly:
> *"Pushing forward from dead-end to dead-end like this only corrupts our logics, structures further and cascades to major errors. Investigate the root cause, not just surface-level symptoms."*

This critical feedback redirected the investigation from the student-side (results page) to the teacher-side (auto-submit pipeline).

**Deep Trace of the Teacher's Auto-Submit Pipeline:**

```
endFullSession() [useMonitorControls.ts]
  → identifyUnsubmittedStudents(session.players)
  → autoSubmitAllUnsubmittedStudents() [autoSubmitDisconnected.ts]
    → For each student:
      → const isGuest = student.studentId.startsWith('guest_') || !student.studentId.includes('_')  ← BUG
      → saveTestResult(..., isGuest, ...)
        → if (isGuest) → saveGuestResultInternal() → saves to guest_results/
        → else → saves to test_results/ + creates indexes
```

**The Bug (line 349 in `autoSubmitDisconnected.ts`):**

```typescript
const isGuest = student.studentId.startsWith('guest_') || !student.studentId.includes('_');
```

The student's Firebase Auth UID was `G5yDXmkDfsVhoKYTp7xTwbbggtB2`. This ID:
- Does NOT start with `guest_` → `false`
- Does NOT contain `_` → `true`
- **Result: `isGuest = true`** — WRONG!

When `isGuest === true`, `saveTestResult()` routes to `saveGuestResultInternal()` which saves to `guest_results/` — a completely different Firebase path. Meanwhile, `getStudentSessionResult()` queries `test_results_by_session/` — which only gets populated by the non-guest save path. The result existed, just in the wrong bucket.

**Fix Applied:** Changed `isGuest` to only check the `guest_` prefix:
```typescript
const isGuest = student.studentId.startsWith('guest_');
```

**Scope of Bug:** Found the same faulty pattern in **3 files total**:
1. `src/utils/monitor/autoSubmitDisconnected.ts` (line 349) — **critical path** for teacher-end auto-submit
2. `src/utils/resultsMigration.ts` (line 64) — migration utility
3. `src/hooks/test/useTestSubmission.ts` (line 360) — student self-submit (less likely to fire due to `!auth.currentUser` guard, but still wrong)

All three were fixed.

---

## 3. Architectural Discovery — Redirect Design Is Wrong

After the root cause was fixed, the user asked a more fundamental question:
> *"List out the stories of interactions both macro and micro between teacher and students after the test start so I can help you clear out conflict and convolution."*

This led to mapping the full test lifecycle and discovering a **design-level problem**: the current flow redirects students to `/student-test-results/:sessionCode` — a standalone full-page route. But the session is still alive. The teacher may assign more tests in the same session. Students should stay in the waiting lobby.

### User's Design Decisions:

1. **Students return to the waiting lobby** after test ends — NOT a separate results page
2. **A results modal automatically appears** in the lobby showing their test results
3. Students can **close and reopen** the modal while staying in the lobby
4. The modal shows the **most recent test only**
5. The modal shows **full detailed breakdown** (score, band, question-by-question) in a tight, single-screen design

### Edge Cases Confirmed:
| Edge Case | Decision |
|-----------|----------|
| Student submitted before teacher ends | Returns to lobby with results modal |
| Student answered 0 questions | Gets a result record (0%) with results modal |
| Student disconnected | Clean handling |
| Multiple tests in same session | Clean reset between tests |
| Which results to show | Only the most recent test |

A PRD was created: `documentation/tasks/PRD-test-end-flow-refactor.md`

---

## 4. Key Lessons Learned

### Lesson 1: Chase the Data Path, Not the Symptoms

The root cause was in the **teacher's auto-submit pipeline** writing data to the wrong Firebase path. All symptoms appeared on the **student side** (results page failing). Two surface-level fixes (restructuring load order, adding retry logic) were applied to the student side before the teacher-side data path was traced end-to-end. 

**Takeaway:** When data isn't where expected, trace the **write path** before fixing the **read path**.

### Lesson 2: Firebase Auth UIDs Are Not Predictable

The guest detection assumed all non-guest IDs contain underscores. Firebase Auth UIDs are base64-encoded strings with no guaranteed format. The only reliable way to detect guests is the `guest_` prefix convention we control.

**Takeaway:** Never use negative pattern matching (`!includes('_')`) on external IDs. Only match on conventions we explicitly define.

### Lesson 3: The User's Pushback Was the Turning Point

The user's firm redirection ("Investigate the root cause, not just surface-level symptoms") was what broke the cycle of patching. Without that feedback, more patches would have been piled on the student-side code.

### Lesson 4: Architecture Matters More Than Bug Fixes

Even after the guest detection bug was fixed, the redirect-to-results-page design was architecturally wrong. The user's question about interaction stories revealed that the whole redirect approach conflicted with the session lifecycle. The correct solution is returning to the lobby with a results modal — a fundamentally different flow.

---

## 5. Files Modified During This Session

| File | Change | Status |
|------|--------|--------|
| `src/utils/monitor/autoSubmitDisconnected.ts` | Fixed guest detection (`isGuest = startsWith('guest_')`) | ✅ Done |
| `src/utils/resultsMigration.ts` | Same guest detection fix | ✅ Done |
| `src/hooks/test/useTestSubmission.ts` | Same guest detection fix | ✅ Done |
| `src/pages/StudentTestResultsPage.tsx` | Restructured load order + added retry logic | ✅ Done (to be partially reverted per PRD Phase 6) |
| `documentation/tasks/PRD-test-end-flow-refactor.md` | Created PRD for architectural redesign | ✅ Created |

---

## 6. Open Items / Next Steps

The PRD (`PRD-test-end-flow-refactor.md`) outlines 6 phases:

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Fix guest detection bug | ✅ Done |
| 2 | Change redirect destination → lobby | ⏳ Pending PRD approval |
| 3 | Create `TestResultsModal` component | ⏳ Pending PRD approval |
| 4 | Integrate modal into `StudentWaitingRoomPage` | ⏳ Pending PRD approval |
| 5 | Clean up `endFullSession()` (add `isSubmitted` to cleanup) | ⏳ Pending PRD approval |
| 6 | Revert retry logic from `StudentTestResultsPage` | ⏳ Pending PRD approval |

The PRD has been delivered to the user and is awaiting assessment before implementation begins.


## 2026-03-28 Amendment — Result Persistence Invariant Incident

### Event
A teacher-reported incident showed that `student@test.com` completed a class-session IELTS Reading attempt, saw the waiting-room result modal fail after repeated re-fetch attempts, and could not find the attempt in either the student academic record or the teacher student-history view.

### Concrete live case
- Session code: `3F15BY`
- Result id: `-OolNjDsPHI4s410MXaT`
- Canonical `/test_results/{resultId}` row existed
- Student, session, and teacher discovery indexes were initially missing
- Ownership was initially unresolved even though the row represented a teacher-owned class session

### Finding
This was not a simple UI-rendering bug. It was a persistence invariant failure:
- the canonical row was written
- discoverability paths were not fully written
- feature readers therefore behaved as if no saved result existed

### Root-cause lesson
The earlier test-end retrospective correctly focused on chasing the data path instead of the symptom, and this later incident reinforces the same rule. For result features, "saved" must mean:
- canonical row exists
- required indexes exist
- ownership is resolved enough for the intended reader surfaces

### Solution applied
- canonical result writes were moved to a single RTDB multi-location root update
- class-session ownership resolution now falls back to canonical `result.teacherId` when session ownership metadata cannot be resolved
- the live row for `3F15BY` was repaired and made discoverable again

### Feature state after fix
- new writes of this class should no longer create the same partial-save orphan state
- student waiting-room retrieval, academic record, and teacher history all depend on the same underlying discoverability contract
- remaining long-term gap: add a generic backfill/reindex utility for historical orphaned result rows

See @doc/patterns/pattern-canonical-result-persistence-invariants, @doc/architecture/results-academic-record, and @doc/sop/enhanced-saved-results-ux.


## 2026-03-29 Amendment — Live No-Result Incident

### Event

A live student session still failed after the previous local fix set. The console log showed the student being treated as already completed, redirected back into the waiting room, and the waiting-room modal retrying result lookup repeatedly without finding any durable result.

### Concrete live case
- Session code: `2CEBLR`
- Test id: `test-1774721949650-sqed9qj`
- Student symptom: `Student has already completed this test. Redirecting...` followed by waiting-room retries with no result found
- Live data symptom:
  - `game_sessions/2CEBLR` had already rotated back toward waiting-state fields
  - `lastTestId` existed
  - player `latestResultId` did not exist
  - `test_results_by_session/2CEBLR` was empty
  - no canonical `test_results/{resultId}` row existed for the failed finish

### Start-to-end path that was traced
1. Teacher starts a test from the materials card in Teacher Lobby.
2. Session enters teacher monitor / in-progress state correctly.
3. Student submits manually or is auto-submitted when the teacher ends the test.
4. Result persistence runs.
5. Session/player completion flags and waiting-room navigation react to the finish.
6. Student waiting room tries to resolve the just-finished result for modal display.

The start path was not the bug. The break began at persistence/finalization.

### Findings

#### Finding 1: This was not a waiting-room modal bug
The modal was correctly exposing that no durable result existed. It retried because the session state implied a result should be available, but the database had no canonical row to read.

#### Finding 2: Nested `undefined` inside result context broke canonical persistence
The teacher auto-submit path could build `ResultContext` / academic metadata from live sessions where `academicContext` was absent. Optional fields such as `classId` and `courseId` remained nested `undefined` values. RTDB rejects those writes, so canonical result persistence failed before `/test_results/{resultId}` existed.

#### Finding 3: Completion state advanced ahead of durability
Some flows were still able to mark the player/session as completed or navigate to result UI before durable persistence was guaranteed. That created the false-success state the student saw.

#### Finding 4: Session Management had an unsafe interaction with active tests
The Session Management page could end a session via the legacy `endSession()` service path. That path is acceptable for generic session closure but unsafe for active in-progress tests because it bypasses the teacher-monitor auto-submit contract.

#### Finding 5: Zero-answer fallback handling was too optimistic
The disconnected/unsubmitted fallback could skip students with zero counted answers instead of persisting an explicit 0-score result. That creates the same product symptom: completion state without discoverable result data.

### Solutions applied
- Added recursive RTDB sanitization before canonical and index writes.
- Moved manual submit to persist the canonical result before marking player completion or navigating with `showResults`.
- Made teacher end flow derive academic context from live session fields when embedded academic context is absent.
- Made teacher end flow fail closed if any auto-submit result fails to persist.
- Ensured zero-answer fallback still creates a durable 0-score result.
- Blocked Session Management from finalizing active in-progress tests through the legacy end-session path.
- Surfaced the Session Management failure reason to the user instead of a generic error.

### Root-cause lesson
A completion flag is not evidence of durable result persistence. In this system, the only trustworthy indicator is successful canonical save plus required discovery paths. Any flow that sets completion first is architecturally unsafe.

### Current state after fix
- Teacher Lobby start flow remains valid.
- Teacher Monitor is the authoritative end-test path for active tests.
- Session Management may still list active sessions, but it must not be used as a generic substitute for monitor-based finalization.
- Student waiting-room result retrieval remains a dependent consumer, not the source of truth.
- Result persistence now defends against missing indexes, missing ownership resolution, and nested `undefined` payload failures.

### Remaining interaction risks to watch
- Historical sessions created before the fixes may still contain orphaned or missing result data.
- Any future code that constructs `context` or academic metadata objects from optional fields can reintroduce the RTDB `undefined` rejection if recursive sanitization is bypassed.
- Any new end-session entry point must either delegate to the monitor finalization pipeline or explicitly refuse active in-progress tests.

See also @doc/patterns/pattern-canonical-result-persistence-invariants and @doc/architecture/test-system-architecture.
