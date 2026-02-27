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
