# PRD: Test End Flow Refactor — Teacher Ends Test Early

## 1. Problem Statement

When a teacher ends a test early, the student experience is broken. Instead of being returned to the waiting lobby with a results summary, students are redirected to a full-page results route (`/student-test-results/:sessionCode`) that fails to load because of multiple race conditions and a critical guest-detection bug.

**Root causes identified:**
1. **Guest Detection Bug** (critical): `isGuest = !studentId.includes('_')` incorrectly treats Firebase Auth UIDs (e.g., `G5yDXmkDfsVhoKYTp7xTwbbggtB2`) as guests, routing their results to `guest_results/` instead of `test_results/`
2. **Architectural mismatch**: The flow redirects students away from the session to a standalone results page, which is wrong because the session is still active (teacher may assign more tests)
3. **Timing race**: The teacher's `endFullSession()` clears `testId: null` via Firebase, which the student detects before the permanent result record has propagated

## 2. Desired Behavior (Per User Requirements)

### After teacher ends test:
1. **Students return to the waiting lobby** (`/student-wait/:sessionCode`) — NOT a separate results page
2. **A results modal/dialog automatically appears** showing their test results
3. Students can **close and reopen** the results modal while staying in the lobby
4. The modal shows the **most recent test only**
5. The modal shows **full detailed breakdown** similar to `StudentTestResultsPage` but with tighter, single-screen design

### Edge Cases (confirmed with user):
- **EC1: Student who submitted before teacher ends** → Returns to lobby with results modal
- **EC2: Student who answered 0 questions** → Gets a result record (0%) and sees results modal  
- **EC3: Student who disconnected** → Clean handling
- **EC4: Multiple tests in same session** → Clean reset between tests
- **EC5: Which results to show** → Only the most recent test

## 3. Current Architecture (What Happens Now)

### Flow: Teacher clicks "End Test"

```
TEACHER SIDE (useMonitorControls.endFullSession):
1. identifyUnsubmittedStudents(session.players)
2. autoSubmitAllUnsubmittedStudents() → saveTestResult()
3. Mark players: isSubmitted=true, hasCompletedTest=true
4. Clear session: { testId: null, status: 'waiting', ... }
5. Clear player test data: { answers: null, hasSubmitted: false, ... }

STUDENT SIDE (ReadingTestPage):
1. Firebase onValue fires → testData becomes null
2. useEffect detects !testData
3. Calls useTeacherEndRedirect.checkAndRedirect()
4. Reads player.isSubmitted from Firebase → true
5. Redirects to /student-test-results/:sessionCode ← WRONG DESTINATION
6. StudentTestResultsPage.loadResults() tries getStudentSessionResult()
7. Queries test_results_by_session/ → NOT FOUND (result was saved to guest_results/)
8. Shows error: "Test results are still being processed"
```

### Key Files Involved:

| File | Role |
|------|------|
| `hooks/monitor/useMonitorControls.ts` | Teacher's endFullSession() |
| `utils/monitor/autoSubmitDisconnected.ts` | Auto-submit + guest detection bug |
| `skills/reading/components/ReadingTestPage.tsx` | Student test page, reacts to test end |
| `hooks/test/useTeacherEndRedirect.ts` | Decides where student goes after test end |
| `pages/StudentTestResultsPage.tsx` | Full-page results (current wrong destination) |
| `pages/StudentWaitingRoomPage.jsx` | Student lobby (correct destination) |
| `services/testResults.service.ts` | saveTestResult + getStudentSessionResult |

## 4. Proposed Solution

### Architecture Change: Return to Lobby + Results Modal

Instead of redirecting to a standalone results page, students return to the waiting lobby and see a results modal.

### Step-by-Step Implementation:

#### Phase 1: Fix the Guest Detection Bug (DONE ✅)
- Change `isGuest = student.studentId.startsWith('guest_')` in 3 files
- Files: `autoSubmitDisconnected.ts`, `resultsMigration.ts`, `useTestSubmission.ts`

#### Phase 2: Change Student Redirect Destination
**File: `hooks/test/useTeacherEndRedirect.ts`**
- Instead of `navigate('/student-test-results/:sessionCode')`, navigate to the waiting room: `navigate('/student-wait/:sessionCode')`
- Pass state indicating results should be shown: `{ state: { showResults: true, sessionCode } }`

**File: `skills/reading/components/ReadingTestPage.tsx` (line 143-154)**
- The `!testData` handler should redirect to waiting room instead of calling `checkAndRedirect()`
- Pass the sessionCode so the waiting room knows to show results

#### Phase 3: Create TestResultsModal Component
**New file: `components/test/TestResultsModal.tsx`**
- Uses `@mantine/core` `Modal` component (matches existing design patterns like `StudentDetailModal`)
- Receives `sessionCode` and `studentId` as props
- Fetches the permanent result record via `getStudentSessionResult()`
- Displays in a single-screen layout:
  - Score header (score/max, percentage, band score)
  - Questions summary (correct/incorrect/partial)
  - Performance feedback
  - Scrollable question-by-question breakdown
- Has a close button + can be reopened

#### Phase 4: Integrate Modal into StudentWaitingRoomPage
**File: `pages/StudentWaitingRoomPage.jsx`**
- Check for `location.state?.showResults` on mount
- If results flag is present, auto-open `TestResultsModal`
- Store the `sessionCode` for the most recent completed test in component state
- Provide a "View Last Results" button so student can reopen the modal
- When session's `testId` changes (teacher assigns new test), clear the results state

#### Phase 5: Clean Up Teacher's endFullSession()
**File: `hooks/monitor/useMonitorControls.ts`**
- Ensure `isSubmitted` is cleared along with other player flags at line 410-435 (currently missing)
- Add `isSubmitted: null` to the player cleanup updates
- The `lastTestId` saved at line 403 is useful — keep it so the waiting room knows which test results to show

#### Phase 6: Clean up StudentTestResultsPage retry logic
**File: `pages/StudentTestResultsPage.tsx`**
- Revert the retry logic added during this debugging session
- This page is still valid for when students navigate to it from their history (not from a live session)
- Keep the original straightforward loading logic

## 5. Data Flow After Fix

```
TEACHER clicks "End Test":
1. autoSubmitAllUnsubmittedStudents() → saveTestResult() [with CORRECT isGuest=false]
   → Saves to test_results/{resultId}
   → Creates index at test_results_by_session/{sessionCode}/{resultId}
   → Creates index at test_results_by_student/{studentId}/{resultId}
2. Mark players: { isSubmitted: true, hasCompletedTest: true, submittedBy: 'teacher-end' }
3. Save lastTestId on session
4. Clear session: { testId: null, status: 'waiting' }
5. Clear player test data (including isSubmitted)

STUDENT detects testData=null:
1. Navigate to /student-wait/:sessionCode with state { showResults: true }
2. StudentWaitingRoomPage sees showResults flag
3. Opens TestResultsModal
4. Modal calls getStudentSessionResult(studentId, sessionCode)
   → Queries test_results_by_session/ → FOUND ✅
5. Displays results in modal
6. Student stays in lobby, ready for next test
```

## 6. Questions for Assessment

None — user has confirmed all edge case behaviors. Ready for implementation after PRD approval.

## 7. Files to Create/Modify

| File | Action |
|------|--------|
| `components/test/TestResultsModal.tsx` | **CREATE** — New results modal component |
| `hooks/test/useTeacherEndRedirect.ts` | **MODIFY** — Redirect to lobby instead of results page |
| `skills/reading/components/ReadingTestPage.tsx` | **MODIFY** — Redirect to lobby on test end |
| `skills/listening/components/ListeningTestPage.tsx` | **MODIFY** — Same change for listening tests |
| `pages/StudentWaitingRoomPage.jsx` | **MODIFY** — Add results modal integration |
| `hooks/monitor/useMonitorControls.ts` | **MODIFY** — Add isSubmitted to cleanup |
| `pages/StudentTestResultsPage.tsx` | **MODIFY** — Revert retry logic, keep as history viewer |
| `utils/monitor/autoSubmitDisconnected.ts` | **DONE** — Guest detection already fixed |
| `utils/resultsMigration.ts` | **DONE** — Guest detection already fixed |
| `hooks/test/useTestSubmission.ts` | **DONE** — Guest detection already fixed |
