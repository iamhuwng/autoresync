# Tasks: PRD-0019 - Test Duration End Flow

> Generated from PRD: `0019-prd-test-duration-end-flow.md`
> Created: 2026-02-04
> Status: Planning

---

## Relevant Files

### New Files to Create
- `src/components/test/TimeUpOverlay.tsx` - Student-side overlay during 5-second grace period before auto-submission
- `src/components/test/CountdownWarningModal.tsx` - Teacher-side 10-second countdown warning before auto-end
- `src/components/test/AccommodationStatusBar.tsx` - Bar showing remaining accommodated students after base time ends
- `src/hooks/test/useTimerExpiry.ts` - Hook to manage countdown logic and auto-trigger for both student and teacher
- `src/pages/SubmissionCompletePage.tsx` - Writing skill post-submission confirmation page

### Files to Modify
- `src/hooks/test/useTestTimer.ts` - Add TimeUpOverlay trigger and grace period logic
- `src/hooks/test/useTestSubmission.ts` - Add `hasCompletedTest` flag handling and skill-based redirect
- `src/hooks/monitor/useMonitorControls.ts` - Split `endTest()` into `completeBaseTest()` and `endFullSession()`
- `src/components/test/TeacherTestControlBar.tsx` - Add countdown modal trigger at 10 seconds remaining
- `src/components/test/StudentProgressCard.tsx` - Add extra time badge and visual highlighting for accommodated students
- `src/pages/TeacherTestMonitorPage.tsx` - Integrate AccommodationStatusBar and final redirect
- `src/skills/listening/components/ListeningTestPage.tsx` - Integrate TimeUpOverlay and skill-based redirect
- `src/skills/reading/components/ReadingTestPage.tsx` - Integrate TimeUpOverlay and skill-based redirect
- `src/pages/StudentTestPage.tsx` - Integrate TimeUpOverlay and re-entry prevention
- `src/services/navigationService.ts` - Add redirect prevention for completed students
- `src/types/session.types.ts` (or similar) - Add new player/session schema fields

### Test Files
- `src/components/test/TimeUpOverlay.test.tsx` - Unit tests for TimeUpOverlay
- `src/components/test/CountdownWarningModal.test.tsx` - Unit tests for CountdownWarningModal
- `src/hooks/test/useTimerExpiry.test.ts` - Unit tests for timer expiry hook

### Notes

- Unit tests should typically be placed alongside the code files they are testing
- Use `npx jest [optional/path/to/test/file]` to run tests
- Existing `autoSubmitDisconnectedStudents` utility in `src/utils/monitor/` can be leveraged for FR-D1 to FR-D5
- Session already has `status`, `testId`, `startTime` fields that will be preserved during `completeBaseTest()`

---

## Tasks

- [x] **1.0 Student Timer Expiry UI & Flow (Phase 1)** ✅
  - Implement the 5-second grace period overlay, input locking, and skill-based redirect logic for students when their timer reaches zero
  - Covers: FR-S1, FR-S2, FR-S3, FR-S4, FR-S5, FR-S6, FR-S7, FR-S8
  
  - [x] **1.1** Create `TimeUpOverlay.tsx` component in `src/components/test/` ✅
    - Full-screen overlay with "⏰ Time's Up! Submitting your answers..." message
    - 5-second countdown progress bar (animated)
    - "Your work is being saved automatically. Please do not close this page." text
    - Props: `onComplete: () => void`, `countdownSeconds?: number` (default 5)
    - Use glass-effect styling consistent with existing modals
  
  - [x] **1.2** Create `useTimerExpiry.ts` hook in `src/hooks/test/` ✅
    - Manage grace period countdown state: `isGracePeriodActive`, `gracePeriodRemaining`
    - Accept `onGracePeriodStart`, `onGracePeriodEnd` callbacks
    - Accept `gracePeriodDuration` (default 5 seconds)
    - Export `triggerGracePeriod()` function to initiate the countdown
    - Handle cleanup on unmount
    - Also includes teacher-side: `isCountdownWarningActive`, `triggerCountdownWarning()`, `cancelCountdown()`, `endNow()`
  
  - [x] **1.3** Modify `useTestTimer.ts` to integrate grace period ✅
    - Import and use `useTimerExpiry` hook
    - When `remaining <= 0`, instead of calling `onTimeUp()` directly:
      1. Call `triggerGracePeriod()`
      2. Return `{ showTimeUpOverlay: true }` in hook return value
    - After grace period ends, call `onTimeUp()`
    - Export new return value: `showTimeUpOverlay: boolean`
    - Also added: `isInExtraTime`, `gracePeriodRemaining`, `enableGracePeriod`, `onGracePeriodStart` props
  
  - [x] **1.4** Modify `useTestSubmission.ts` to add completion flags ✅
    - After successful submission, update Firebase with:
      - `hasCompletedTest: true`
      - `completedAt: serverTimestamp()`
      - `submittedBy: 'system-timeout' | 'student'`
    - Add `isLocked` state that becomes `true` during grace period
    - Export `lockInputs()` function for use during grace period
  
  - [x] **1.5** Implement skill-based redirect logic in `useTestSubmission.ts` ✅
    - Added `skill` field to `TestData` interface
    - Imported `useNavigate` from react-router-dom
    - After successful submission:
      - If `testSkill === 'Listening'` or `testSkill === 'Reading'`: navigate to `/student/results/${sessionCode}`
      - If `testSkill === 'Writing'`: navigate to `/submission-complete` with state (sessionCode, testId, studentName)
      - Fallback: show alert for unknown skills
  
  - [x] **1.6** Integrate `TimeUpOverlay` in `ListeningTestPage.tsx` ✅
    - Imported `TimeUpOverlay` component
    - Destructured `showTimeUpOverlay` and `gracePeriodRemaining` from `useTestTimer`
    - Destructured `isLocked` and `lockInputs` from `useTestSubmission`
    - Conditionally render overlay when `showTimeUpOverlay` is `true`
    - Passed `onComplete` callback (logs completion message)
    - Added `disabled={isLocked}` prop to `ListeningImageModeDisplay` and `ListeningQuestionDisplay`
    - Note: Components don't currently accept `disabled` prop - will need component updates in future task
  
  - [x] **1.7** Integrate `TimeUpOverlay` in `ReadingTestPage.tsx` ✅
    - Imported `TimeUpOverlay` component
    - Destructured `showTimeUpOverlay`, `gracePeriodRemaining`, `isInExtraTime` from `useTestTimer`
    - Destructured `isLocked` and `lockInputs` from `useTestSubmission`
    - Conditionally render overlay when `showTimeUpOverlay` is `true`
    - Passed `onComplete` callback (logs completion message)
    - Updated `onAnswerChange` to disable when `isLocked` is true: `(testSubmitted || isLocked) ? () => {} : handleAnswerChange`
    - Input locking applies to all question types through the callback guard
  
  - [x] **1.8** Integrate `TimeUpOverlay` in `StudentTestPage.tsx` ✅
    - Imported `TimeUpOverlay` component
    - Destructured `showTimeUpOverlay`, `gracePeriodRemaining`, `isInExtraTime` from `useTestTimer`
    - Destructured `isLocked` and `lockInputs` from `useTestSubmission`
    - Conditionally render overlay when `showTimeUpOverlay` is `true`
    - Passed `onComplete` callback (logs completion message)
    - Updated `onAnswerChange` to disable when `isLocked` is true: `(testSubmitted || isLocked) ? () => {} : handleAnswerChange`
    - Handles both session-based and other test modes (uses same IELTSQuestionsPanel component)

- [x] **2.0 Teacher Timer Expiry UI & Controls (Phase 2)** ✅
  - Implement the 10-second countdown warning modal, cancel/end-now buttons, and automatic `completeBaseTest()` trigger for teachers
  - Covers: FR-T1, FR-T2, FR-T3, FR-T4
  
  - [x] **2.1** Create `CountdownWarningModal.tsx` component in `src/components/test/` ✅
    - Modal with countdown display: "⏰ Test ending in X seconds..."
    - Message: "All base students will be submitted and redirected to results."
    - Info about accommodated students: "X students have extra time and will continue after this countdown."
    - Two buttons: [Cancel Countdown] and [End Now]
    - Props: `countdownSeconds`, `accommodatedCount`, `onCancel`, `onEndNow`, `onCountdownComplete`
    - Auto-closes and calls `onCountdownComplete` when countdown reaches 0
    - Features: Animated progress bar, gradient background, slide-in animation
  
  - [x] **2.2** Create teacher-side timer expiry hook in `useTimerExpiry.ts` ✅
    - Already implemented in Task 1.2 alongside student grace period logic
    - Teacher-specific logic includes:
      - `isCountdownWarningActive` - boolean state for showing countdown modal
      - `countdownWarningRemaining` - remaining seconds in countdown
      - `triggerCountdownWarning(initialSeconds?)` - starts the countdown warning
      - `cancelCountdown()` - cancels countdown and calls `onWarningCancel` callback
      - `endNow()` - triggers immediate completion via `onEndNow` callback
    - Accepts `warningThreshold` option (default 10 seconds)
    - Accepts callbacks: `onWarningStart`, `onWarningCancel`, `onEndNow`
  
  - [x] **2.3** Modify `TeacherTestMonitorPage.tsx` to detect 10-second threshold ✅
    - Integrated in Task 2.4 - timer detection logic added directly in monitor page
    - Added `useEffect` to monitor `timeRemaining` and trigger countdown at 10 seconds
    - Calculates time remaining from session startTime, duration, and paused duration
    - Triggers `triggerCountdownWarning(remainingSeconds)` when threshold is reached
  
  - [x] **2.4** Integrate `CountdownWarningModal` in `TeacherTestMonitorPage.tsx` ✅
    - Imported `CountdownWarningModal` and `useTimerExpiry` hook
    - Added timer monitoring logic in `useEffect` to detect 10-second threshold
    - Destructured `completeBaseTest` and `endFullSession` from `useMonitorControls`
    - Integrated `useTimerExpiry` with callbacks:
      - `onWarningCancel`: Pauses the test via `pauseTest()`
      - `onEndNow`: Calls `completeBaseTest()` immediately
      - `onCountdownComplete`: Auto-calls `completeBaseTest()` when countdown reaches 0
    - Conditionally renders modal when `isCountdownWarningActive` is true
    - Passes all required props: `countdownSeconds`, `accommodatedCount`, callbacks
  
  - [x] **2.5** Calculate accommodated student count for modal display ✅
    - Created `accommodatedStudents` memoized calculation using `useMemo`
    - Filters `session.players` for students with `extraTime > 0` and `!hasCompletedTest`
    - Returns array with student `id`, `name`, and `extraTime`
    - Derived `accommodatedCount` from array length
    - Passed to `CountdownWarningModal` to display accommodation info

- [x] **3.0 Base Test Completion Logic (Phase 2)** ✅
  - Split existing `endTest()` into `completeBaseTest()` (partial) and `endFullSession()` (full cleanup), implementing proper session lifecycle
  - Covers: FR-T5, FR-T6, FR-L1, FR-L2, FR-L3, FR-L4
  
  - [x] **3.1** Create `completeBaseTest()` function in `useMonitorControls.ts` ✅
    - Copy logic from `endTest()` but DO NOT:
      - Set `status: 'waiting'`
      - Clear `testId`
      - Navigate teacher away
    - DO:
      - Submit all base students (those without `extraTime` accommodation)
      - Set `hasCompletedTest: true` for each base student
      - Set session flag: `baseTimeExpired: true`, `baseTimeExpiredAt: serverTimestamp()`
      - Log completion for each student
    - Return: `{ submittedCount: number, accommodatedRemaining: number }`
  
  - [x] **3.2** Modify existing `endTest()` to become `endFullSession()` ✅
    - Rename internally but keep export name for backwards compatibility
    - Add check: if `baseTimeExpired` is already `true`, skip resubmitting base students
    - Submit remaining accommodated students who haven't completed
    - Set `status: 'waiting'`
    - Clear test-specific data: `testId`, `startTime`, `players/*/answers`, `players/*/hasSubmitted`
    - Clear PRD-0019 flags: `baseTimeExpired`, `hasCompletedTest`, `completedAt`, `submittedBy`
    - Keep player entries but clear their test data (for session reuse)
    - Navigate teacher to results dashboard (if redirectToResults=true) or lobby
  
  - [x] **3.3** Add `endFullSession()` as separate export in `useMonitorControls.ts` ✅
    - Already exported in return statement
    - Accepts optional `redirectToResults: boolean` (default false)
    - Accepts optional `skipConfirmation: boolean` (default false)
    - If redirecting, navigate to `/teacher/results/${sessionCode}` or appropriate dashboard
  
  - [x] **3.4** Update Firebase session schema types ✅
    - Added to `PlayerData` interface (in `utils/monitor/studentDataTransformer.ts`):
      - `hasCompletedTest?: boolean`
      - `completedAt?: number | null`
      - `submittedBy?: 'system-timeout' | 'student' | 'teacher-ended'`
    - Added to `TestSession` interface (in `hooks/monitor/useMonitorSession.ts`):
      - `baseTimeExpired?: boolean`
      - `baseTimeExpiredAt?: number | null`
  
  - [x] **3.5** Update `MonitorControlsResult` interface ✅
    - Already includes: `completeBaseTest: () => Promise<{ submittedCount: number, accommodatedRemaining: number }>`
    - Already includes: `endFullSession: (redirectToResults?: boolean) => Promise<void>`
    - Kept existing `endTest` for backwards compatibility (alias to `endFullSession`)

- [x] **4.0 Accommodation Student Flow (Phase 3)** ✅
  - Implement individual timer calculations for accommodated students, extra time banners, and teacher visibility of remaining accommodated students
  - Covers: FR-A1, FR-A2, FR-A3, FR-T7, FR-T8, FR-T9
  
  - [x] **4.1** Create `AccommodationStatusBar.tsx` component in `src/components/test/` ✅
    - Sticky bar displayed after base time expires
    - Content: "⏱️ Base time: ENDED | 🧑‍🎓 X students with extra time | Max remaining: Y:ZZ"
    - [View Accommodated Students] button to filter/highlight cards
    - Props: `accommodatedStudents`, `maxTimeRemaining`, `onViewStudents`
    - Uses amber/warning color scheme with gradient background
    - Slide-down animation on mount
  
  - [x] **4.2** Integrate `AccommodationStatusBar` in `TeacherTestMonitorPage.tsx` ✅
    - Shows bar when `session?.baseTimeExpired === true` and `accommodatedCount > 0`
    - Enhanced `accommodatedStudents` calculation to include `extraTimeRemaining`
    - Calculates `extraTimeRemaining` as: `baseEndTime + extraTime - now`
    - Calculates `maxTimeRemaining` using `Math.max()` across all accommodated students
    - Positioned bar below control bar, above audio progress panel
    - Passes `onViewStudents` callback (TODO: implement filter logic)
  
  - [x] **4.3** Add extra time badge to `StudentProgressCard.tsx` ✅
    - Added `baseTimeExpired` and `extraTimeRemaining` props to interface
    - Amber border (3px solid #f59e0b) when student has extra time and base time expired
    - Enhanced box shadow with amber glow effect
    - Extra time remaining badge with countdown timer (MM:SS format)
    - Badge shows: "⏰ Extra Time" with remaining time display
    - Positioned before "Click to view details" hint
    - Updated `TeacherTestMonitorPage` to calculate and pass `extraTimeRemaining` for each student
  
  - [x] **4.4** Modify `useTestTimer.ts` to handle accommodation display ✅
    - Already implemented in Task 1.3
    - When `extraTime > 0` and base time has expired (calculated internally):
      - Sets `isInExtraTime: true`
      - Exports this flag for UI display
    - Returns: `isInExtraTime: boolean`
  
  - [x] **4.5** Create student extra time banner component or section ✅
    - Created `ExtraTimeBanner.tsx` component
    - Shows banner in test page header: "⏰ Base time ended. You have X:XX extra time remaining."
    - Integrated in `ListeningTestPage.tsx`
    - Integrated in `ReadingTestPage.tsx`
    - Integrated in `StudentTestPage.tsx`
  
  - [x] **4.6** Ensure all teacher controls remain functional after base time expires ✅
    - Updated `TeacherTestControlBar.tsx` to handle `baseTimeExpired` state
    - Added `baseTimeExpired` flag to `session` interface
    - Updated status color to Amber when in extra time
    - Updated timer display to show "0:00" and "X remaining" when base time expired
    - Controls (Pause/Resume, End) remain active as status is still 'in-progress'
  
  - [x] **4.7** Calculate and broadcast individual student time remaining ✅
    - Calculated client-side in `TeacherTestMonitorPage.tsx` (Task 4.2)
    - Formula: `baseEndTime + extraTime - Date.now()`
    - Passed to `StudentProgressCard` via `extraTimeRemaining` prop (Task 4.3)
    - Displayed on student card with countdown (Task 4.3) and in status bar (Task 4.1)

- [ ] **5.0 Disconnected Student & Final Redirect (Phase 4)**
  - Enhance disconnected student handling with incomplete detection, and implement teacher auto-redirect when all students (including accommodations) complete
  - Covers: FR-D1, FR-D2, FR-D3, FR-D4, FR-D5, FR-T10
  
  - [x] **5.1** Enhance `autoSubmitDisconnectedStudents()` in `src/utils/monitor/` ✅
    - Updated `autoSubmitDisconnected.ts` to accept `totalQuestions`
    - Integrated `checkSubmissionCompleteness()` for accurate counting
    - Updates Firebase with: `isIncomplete`, `answeredCount`, `totalQuestions`, `submittedBy: 'system-timeout'`
    - Logs success/failure counts
  
  - [x] **5.2** Create `checkSubmissionCompleteness()` utility function ✅
    - Implemented in `src/utils/monitor/autoSubmitDisconnected.ts` (exported)
    - Input: `answers`, `totalQuestions`
    - Output: `{ answeredCount, isComplete, incompleteCount }`
    - Counts non-null/undefined answers only
  
  - [x] **5.3** Integrate completeness check in `completeBaseTest()` ✅
    - Updated `useMonitorControls.ts` to accept `testData`
    - Passes `totalQuestions` to `autoSubmitDisconnectedStudents`
    - Submissions are marked with `isIncomplete` and correct `answeredCount`
  
  - [x] **5.4** Implement end-when-all-complete logic ✅
    - In `TeacherTestMonitorPage.tsx`:
      - Monitor `baseTimeExpired` && `accommodatedCount === 0`
      - If true, call `endFullSession(true, true)` (redirect=true, confirm=false)
    - Updated `endFullSession` to support skipping confirmation
    - Redirects teacher to results when everyone is donesCompletedTest === true);
        if (session?.baseTimeExpired && allCompleted) {
          endFullSession(true); // Redirect to results
        }
      }, [session?.players, session?.baseTimeExpired]);
      ```
  
  - [x] **5.5** Create results dashboard route and ensure it exists ✅
    - `TeacherTestResultsPage.tsx` already existed
    - Updated `useMonitorControls.ts` to save `session.lastTestId`
    - Updated `TeacherTestResultsPage.tsx` to fallback to `lastTestId` if active `testId` is missing
    - Ensures results load even after session is reset to 'waiting'
  
  - [x] **5.6** Add "All Complete" notification before redirect ✅
    - Added to `TeacherTestMonitorPage.tsx`
    - Uses Mantine `notifications.show`
    - 2-second delay before calling `endFullSession`
    - Prevents abrupt transitions
    
- [ ] **6.0 Re-entry Prevention & Edge Cases (Phase 4)**
  - Implement prevention of completed students rejoining tests, browser refresh handling, and Writing skill submission confirmation page
  - Covers: FR-S5, FR-S8
  
  - [ ] **6.1** Create `SubmissionCompletePage.tsx` in `src/pages/`
    - Display for Writing test students after auto-submission
    - Content: "✅ Your work has been submitted. Awaiting teacher feedback."
    - Show submitted essay preview (if available from state/session)
    - "Return to Dashboard" button
    - Route: `/submission-complete`
  
  - [ ] **6.2** Add route for `SubmissionCompletePage` in `App.jsx`
    - Add protected route: `/submission-complete`
    - Require student authentication
  
  - [ ] **6.3** Implement re-entry prevention in test pages
    - In `ListeningTestPage.tsx`, `ReadingTestPage.tsx`, `StudentTestPage.tsx`:
      - On mount, check if `session.players[playerId].hasCompletedTest === true`
      - If true, redirect to:
        - Results page (Listening/Reading)
        - Submission complete page (Writing)
      - Show toast: "You have already completed this test."
  
  - [ ] **6.4** Add re-entry prevention in `navigationService.ts` (or route guard)
    - Create utility function: `checkTestCompletion(sessionCode, playerId)`
    - Returns: `{ completed: boolean, skill: string }`
    - Use in route guards or page mount effects
  
  - [ ] **6.5** Handle browser refresh during grace period
    - In `useTimerExpiry.ts`, persist grace period state to sessionStorage:
      - `gracePeriodStartTime`, `gracePeriodDuration`
    - On page reload, check sessionStorage:
      - If grace period was active and not expired, resume overlay
      - If grace period expired, trigger submission immediately
    - Clear sessionStorage after submission complete
  
  - [ ] **6.6** Handle browser refresh after submission but before redirect
    - In test pages, check on mount:
      - If `hasCompletedTest === true` but still on test page → redirect
    - Store redirect target in sessionStorage before refresh
  
  - [ ] **6.7** Add "Leaving Page" warning during test
    - Use `beforeunload` event to warn students:
      - "Are you sure you want to leave? Your progress will be saved, but you should complete the test."
    - Disable warning after test is submitted

---

## Implementation Order Recommendation

1. **Start with Task 1.1-1.4** (Core student functionality)
2. **Then Task 3.1-3.5** (Backend logic split)
3. **Then Task 1.5-1.8** (Complete student integration)
4. **Then Task 2.1-2.5** (Teacher UI)
5. **Then Task 4.1-4.7** (Accommodations)
6. **Then Task 5.1-5.6** (Edge cases & completion)
7. **Finally Task 6.1-6.7** (Polish & prevention)

## Estimated Effort

| Task | Sub-tasks | Estimated Hours |
|------|-----------|-----------------|
| 1.0 | 8 | 6-8 |
| 2.0 | 5 | 4-5 |
| 3.0 | 5 | 4-5 |
| 4.0 | 7 | 5-6 |
| 5.0 | 6 | 4-5 |
| 6.0 | 7 | 4-5 |
| **Total** | **38** | **27-34 hours** |

---

*Generated: 2026-02-04*
*Based on: PRD-0019 Test Duration End Flow*
