# SOP: Debugging Quiz Auto-Advancement

This document outlines the steps taken to debug the auto-advancement feature in the teacher's quiz view.

## 1. Initial Problem

The teacher's quiz view was stuck in a redirect loop between the question and feedback pages. The `onTimeUp` event was not firing, preventing the quiz from automatically advancing to the next question.

## 2. Timer Fix in `useSynchronizedTimer.js`

**Problem:** The timer was stuck because the `now` variable was not being updated inside the `setInterval` callback.

**Fix:** Moved the `now` variable declaration inside the `setInterval` callback to ensure it gets the current time on each tick.

## 3. Paused Timer Fix in `TeacherQuizPage.jsx`

**Problem:** The timer for a new question was starting in a paused state and was not being automatically resumed.

**Fix:** Added a `useEffect` hook to `TeacherQuizPage.jsx` to automatically resume the timer when the component mounts.

## 4. Auto-Advancement Fixes in `TeacherFeedbackPage.jsx`

**Problem:** The application gets stuck on the `TeacherFeedbackPage` and does not automatically advance to the next question after the 5-second feedback period.

**Attempts:**

1.  **Modified `useEffect` hook:** Tried various modifications to the `useEffect` hook that handles the auto-advance logic, including changing the dependency array.
2.  **Added Log Statements:** Added `console.log` statements to the `useEffect` hook and the `handleAutoAdvance` function to debug the issue.
3.  **Created New `useEffect` Hook:** Created a new `useEffect` hook that is triggered only when `gameSession.status` changes to `feedback`.

## 5. New Bug and Paused Timer Investigation

A new bug was reported with the following symptoms:

*   The first correct answer for the first question is marked as correct.
*   Subsequent correct answers for the same question are marked as incorrect.
*   When jumping to a new question (e.g., question 6 or 10), the first correct answer is marked as correct, and subsequent correct answers are marked as incorrect.
*   A student who chose the correct answer is sometimes listed under "No Answer" on the feedback screen.

**Investigation:**

1.  **`onTimeUp` not being called:** Through testing and logging, it was discovered that the `onTimeUp` function in `TeacherQuizPage.jsx` was not being called.
2.  **Tracing `onTimeUp`:** The `onTimeUp` prop was traced from `TeacherQuizPage.jsx` down to the `useSynchronizedTimer.js` hook.
3.  **Syntax Error:** A syntax error was introduced in `useSynchronizedTimer.js` while adding a log statement, which was subsequently fixed.
4.  **Timer is paused:** The user provided the `timer` object from Firebase, which shows that the timer is being created in a paused state (`isPaused: true`).
5.  **Paused timer creation:** It was found that in `TeacherQuizPage.jsx`, the `handleNextQuestion`, `handlePreviousQuestion`, and `handleJumpToQuestion` functions all create a paused timer.

## 6. Timer Creation Fix

**Problem:** The timer was being created in a paused state when the quiz was started and when navigating between questions.

**Fix:**

*   **`TeacherWaitingRoomPage.jsx`:** Modified the `handleStartQuiz` function to create a timer that is not paused.
*   **`TeacherQuizPage.jsx`:** Modified the `handleNextQuestion`, `handlePreviousQuestion`, and `handleJumpToQuestion` functions to create a timer that is not paused.

## 7. Current Status

The timer issue is resolved. The next step is to investigate the "New Bug" described in section 5, where subsequent correct answers are marked as incorrect.