# PRD-0036 Anti-Cheat Observability Contract

This document records how the anti-cheat system now feeds the PRD-0037 reporting and observability pipeline.

It complements, but does not replace:

- [0036-anti-cheat-runtime-contracts.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0036-anti-cheat-runtime-contracts.md)
- [0036-anti-cheat-production-closeout.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0036-anti-cheat-production-closeout.md)

The runtime-contract document describes RTDB nodes, control fields, and cleanup rules. This document describes the reporting feature id, emitted action names, shared metadata envelope, and what later AI/debug analysis can safely rely on.

## 1. Goal

The anti-cheat system already persisted integrity data in its own operational stores:

- RTDB session integrity snapshots under `game_sessions/.../integrity`
- homework integrity summaries in homework submissions

That was useful for the product workflow, but weak for diagnosis. The reporting pipeline now receives a second, summarized telemetry stream so later analysis can answer questions like:

- Which student surface initialized anti-cheat and with what preset?
- Which violations were counted versus only logged as signals?
- Did the client escalate warnings before auto-submit?
- Did the session flush logs because of manual submit, teacher refresh, or force-submit?
- Did homework entry get blocked because attempts were nullified, exhausted, or already submitted?
- Did integrity persistence succeed or fail at submit time?

## 2. Registry Contract

The reporting pipeline now has a dedicated feature entry in [featureRegistry.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/config/featureRegistry.ts):

- `FEATURE_IDS.antiCheat`
- feature id: `antiCheat`

This feature intentionally has no route ownership. Most anti-cheat telemetry is emitted by hooks and services, not by route-level button clicks.

### Registered Actions

- `initializeProtection`
- `restoreIntegrityState`
- `recordViolation`
- `recordSignal`
- `escalateWarning`
- `triggerAutoSubmit`
- `flushIntegrityLogs`
- `persistIntegritySnapshot`
- `persistSessionIntegrity`
- `persistHomeworkIntegrity`
- `handleTeacherForceSubmit`
- `blockHomeworkEntry`

## 3. Shared Telemetry Adapter

All anti-cheat reporting-pipeline writes should go through [antiCheatReporting.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/services/antiCheatReporting.ts).

This adapter exists for three reasons:

1. It keeps the emitted feature id consistent.
2. It normalizes high-signal metadata so AI/debug analysis is stable across surfaces.
3. It prevents anti-cheat hooks from pushing raw answer-bearing or student-sensitive payloads into the reporting pipeline by accident.

## 4. Shared Context Envelope

Every anti-cheat report emitted through the adapter can carry this context:

- `context`: `session`, `homework`, or `solo`
- `surface`: stable surface label chosen by the mounting flow
- `sessionCode`
- `studentId`
- `testId`
- `homeworkId`
- `submissionId`

### Current Surface Labels In Use

- `student_test`
- `reading_test`
- `listening_test`
- `student_quiz`
- `ielts_homework`
- `thcs_homework`

Other values can exist later, but new surfaces should keep the label stable over time because downstream reporting and AI analysis will group by it.

## 5. Metadata Families

The adapter intentionally summarizes data into reusable shapes.

### 5.1 Config Summary

Produced by `summarizeAntiCheatConfig(...)`.

Fields include:

- `antiCheatEnabled`
- `preset`
- `detectTabSwitch`
- `detectCopyPaste`
- `detectRightClick`
- `detectFullscreenExit`
- `detectKeyboardShortcuts`
- `enableStudentWarnings`
- `enableAutoSubmit`
- `autoSubmitThreshold`
- `requireFullscreen`
- `shuffleQuestions`
- `shuffleOptions`
- `nullifyRemainingAttempts`

### 5.2 Event Summary

Produced by `summarizeIntegrityEvent(...)`.

Fields include:

- `eventType`
- `counted`
- `withinGrace`
- `durationMs`
- `details`

This is deliberately a summary of one event, not the full session event log.

### 5.3 Snapshot Summary

Produced by `summarizeIntegritySnapshot(...)`.

Fields include:

- `violationCount`
- `totalEvents`
- `tabSwitchCount`
- `totalTimeAwayMs`
- `copyAttempts`
- `pasteAttempts`
- `rightClickAttempts`
- `fullscreenExitCount`
- `keyboardShortcutAttempts`
- `forceSubmitted`
- `forceSubmittedBy`
- `riskLevel`

### 5.4 Error Summary

Produced by `summarizeError(...)`.

Fields include:

- `errorName`
- `errorMessage`

## 6. Emission Points

### 6.1 `useTestIntegrity.ts`

This is the main runtime source of anti-cheat telemetry.

It emits:

- `initializeProtection`
  - when anti-cheat becomes active for a surface
  - includes config summary
- `restoreIntegrityState`
  - when crash-recovery/sessionStorage state is restored
  - includes recovered event and violation counts
- `recordViolation`
  - when a counted integrity violation is added
  - includes event summary plus current violation totals
- `recordSignal`
  - when a non-counted but relevant signal is recorded
  - currently used for events like page reload or devtools-style resize
- `escalateWarning`
  - when the student warning state moves from none to toast/escalated/final
- `triggerAutoSubmit`
  - when the configured threshold is crossed
- `persistIntegritySnapshot`
  - for periodic/session RTDB writes
  - includes `stage` such as `immediate` or `batch`
  - includes `status`
- `flushIntegrityLogs`
  - when final/log-forcing flush happens
  - includes `trigger` such as `manual_submit`, `auto_submit`, `teacher_refresh`, `teacher_force_submit`, or homework submit reasons
  - includes `persistenceTarget`
  - includes `status`

### 6.2 `useTestCompletionCheck.ts`

This hook emits teacher/homework gate telemetry:

- `handleTeacherForceSubmit`
  - when the student client detects that a teacher-triggered submission must happen
- `blockHomeworkEntry`
  - when homework entry is denied because the submission is missing, already submitted, attempts are exhausted, or attempts were nullified

### 6.3 `useTestSubmission.ts`

This hook emits:

- `persistSessionIntegrity`
  - after the session submission path persists the final integrity report
  - includes `status`
  - includes `submissionMode`: `manual`, `system`, or `teacher`
  - includes integrity snapshot summary

### 6.4 `useSoloSubmission.ts` and THCS Homework Submission

Homework completion emits:

- `persistHomeworkIntegrity`
  - when homework integrity summary persistence succeeds or fails
  - includes `status`
  - includes `attemptsNullified`
  - includes integrity snapshot summary

IELTS homework uses [useSoloSubmission.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts). THCS homework emits the same action from [THCSPracticeView.tsx](/C:/Users/The%20Lord/Desktop/luyentap/src/components/practice/THCSPracticeView.tsx) around its homework submission write.

## 7. What The Reporting Pipeline Intentionally Does Not Store

The reporting stream is meant for diagnosis and pattern analysis, not for replacing the operational integrity record.

It intentionally does not send:

- the full `events[]` array from session integrity reports
- answer keys
- full question payloads
- passage text
- raw student answers
- copied text content
- full sessionStorage state

If detailed forensic review is needed, use the operational integrity data in RTDB/Firestore. The reporting pipeline is the searchable, summarized layer.

## 8. How To Use This Data Later

For AI-assisted diagnosis, the most useful joins are:

- `featureId = antiCheat`
- group by `sessionCode` or `homeworkId`
- then segment by `studentId`
- then order by report timestamp

That lets you reconstruct a high-signal anti-cheat lifecycle:

1. protection initialized
2. violations/signals accumulated
3. warnings escalated or not
4. auto-submit triggered or not
5. logs flushed because of which trigger
6. final integrity persistence succeeded or failed
7. homework entry blocked or teacher force-submit detected

For broader incident analysis, correlate anti-cheat telemetry with:

- `liveSessions` reports for teacher monitor actions
- `results` reports for integrity-panel review activity
- `homework` reports for assignment/review context

## 9. Maintenance Rules

When extending anti-cheat later:

1. Add any new action name to [featureRegistry.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/config/featureRegistry.ts).
2. Emit new runtime telemetry through [antiCheatReporting.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/services/antiCheatReporting.ts), not ad hoc `reportingService.trackAction(...)` calls.
3. Pass a stable `surface` label from the mounting page or flow.
4. Keep metadata high-signal and compact. Do not attach full operational payloads.
5. If the change affects teacher-facing clicks or page-level actions too, keep the existing route-owned features updated in addition to the `antiCheat` feature.

## 10. Related Files

- [featureRegistry.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/config/featureRegistry.ts)
- [antiCheatReporting.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/services/antiCheatReporting.ts)
- [useTestIntegrity.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestIntegrity.ts)
- [useTestCompletionCheck.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestCompletionCheck.ts)
- [useTestSubmission.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestSubmission.ts)
- [useSoloSubmission.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts)
- [IELTSPracticeView.tsx](/C:/Users/The%20Lord/Desktop/luyentap/src/components/practice/IELTSPracticeView.tsx)
- [THCSPracticeView.tsx](/C:/Users/The%20Lord/Desktop/luyentap/src/components/practice/THCSPracticeView.tsx)
- [StudentTestPage.tsx](/C:/Users/The%20Lord/Desktop/luyentap/src/pages/StudentTestPage.tsx)
- [ReadingTestPage.tsx](/C:/Users/The%20Lord/Desktop/luyentap/src/skills/reading/components/ReadingTestPage.tsx)
- [ListeningTestPage.tsx](/C:/Users/The%20Lord/Desktop/luyentap/src/skills/listening/components/ListeningTestPage.tsx)
- [StudentQuizPageNew.jsx](/C:/Users/The%20Lord/Desktop/luyentap/src/pages/StudentQuizPageNew.jsx)
