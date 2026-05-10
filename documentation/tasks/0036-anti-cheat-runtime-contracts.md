# PRD-0036 Anti-Cheat Runtime Contracts

This document records the implementation-level contracts that exist in code after the PRD-0036 production reset.

It is intentionally more concrete than the PRD. The PRD describes product behavior. This file describes the runtime data nodes, coordination fields, and cleanup rules that the current implementation depends on.

For the reporting-pipeline side of the feature, see [0036-anti-cheat-observability-contract.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0036-anti-cheat-observability-contract.md).

## 1. Why This Document Exists

Several anti-cheat behaviors required implementation details that were not written as first-class contracts in the original PRD or the production-reset task list:

- student-safe RTDB payload nodes for answer-key separation
- session-scoped cached payloads for live test delivery
- teacher-to-student coordination timestamps for refresh/reset flows
- explicit cleanup rules for ending a live session

These details matter for maintenance, rollout, debugging, and future refactors.

## 2. Student-Safe Payload Nodes

### 2.1 `student_safe_tests/{testId}`

**Purpose**

Stores the student-facing sanitized copy of a test. This copy is safe for rendering because the question objects do not include answer keys.

**Why it exists**

PRD-0036 requires answer-key separation: the initial student payload must not expose the grading answers. The implementation achieves that by creating a dedicated sanitized RTDB node instead of reading directly from `tests/{testId}` on student pages.

**Writer**

- [testStorage.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/services/testStorage.ts)
  - `saveTestToFirebase()`
  - `updateTestInFirebase()`
  - `deleteTestFromFirebase()`
- [TestEditor.tsx](/C:/Users/The%20Lord/Desktop/luyentap/src/components/TestEditor.tsx)
  - Teacher Lobby / material-card edit modal save

**Reader**

- [useSoloTestData.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloTestData.ts)

**Data shape**

- Same overall test structure as the normal test object
- `questions` are sanitized through `stripAnswerKeys(...)`
- render metadata is preserved, including `displayMode`, `audioSections`, `questionImages`, and per-image `questionRange`
- used for solo, homework, and stale live-session fallback delivery

**Operational rule**

Normal test save/update paths must write `tests/{testId}` and `student_safe_tests/{testId}` in the same root update. Do not rely on a later manual refresh or Firebase CLI repair after teacher edits.

`refreshStudentSafeTestData(testId)` remains a repair-only helper for incident recovery or legacy migration. It is not the foundation for Teacher Lobby edit-modal saves.

Detailed projection contract:
- [student-test-delivery-projections.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/architecture/student-test-delivery-projections.md)

### 2.2 `session_test_payloads/{sessionCode}`

**Purpose**

Stores the student-safe rendered payload prepared for one live session. This prevents the student live-session pages from loading the full grading object directly.

**Writer**

- [useMonitorControls.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/monitor/useMonitorControls.ts)
  - `startTest()` calls `cacheSessionStudentSafeTestData(...)`
- [testStorage.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/services/testStorage.ts)
  - `cacheSessionStudentSafeTestData()`

**Reader**

- [useTestData.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestData.ts)

**Lifecycle**

1. Teacher starts a session.
2. The monitor prepares and writes the sanitized session payload.
3. Student session pages read `session_test_payloads/{sessionCode}`.
4. When the session is ended and cleaned up, the payload is removed.

**Freshness rule**

`getSessionStudentSafeTestData(sessionCode, testId)` may return the current global `student_safe_tests/{testId}` payload instead of the cached session payload when:

- the session payload is missing
- the session payload points at a different test
- `student_safe_tests/{testId}.updatedAt` is newer than the cached session payload timestamp

This keeps teacher edits visible on new student loads or reloads after a session payload was primed.

**Cleanup**

- [useMonitorControls.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/monitor/useMonitorControls.ts)
  - `endFullSession()` clears `session_test_payloads/{sessionCode}`

## 3. Teacher-To-Student Coordination Fields

These fields are implementation-level coordination signals in RTDB.

### 3.1 `game_sessions/{sessionCode}/integrityRefreshRequestedAt`

**Purpose**

Signals that student clients should immediately flush buffered integrity logs instead of waiting for the normal background timing.

**Writer**

- [sessionStudentControlService.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/services/sessionStudentControlService.ts)
  - `requestIntegrityLogRefresh()`

**Reader chain**

1. [useTestSession.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestSession.ts) subscribes to the session and exposes `integrityRefreshRequestedAt`
2. Student test pages pass that timestamp into [useIntegrityRefreshRequest.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useIntegrityRefreshRequest.ts)
3. `useIntegrityRefreshRequest()` compares timestamps and triggers a flush callback only when the timestamp increases

**Contract**

- This field is a monotonic timestamp signal
- A repeated or older timestamp is ignored
- `null` means no active refresh request

### 3.2 `game_sessions/{sessionCode}/players/{playerId}/submissionResetAt`

**Purpose**

Signals that the teacher has reset a student submission and that the client should allow the student back into the active session flow.

**Writer**

- [sessionStudentControlService.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/services/sessionStudentControlService.ts)
  - `resetStudentSessionSubmission()`

**Reader**

- [StudentWaitingRoomPage.jsx](/C:/Users/The%20Lord/Desktop/luyentap/src/pages/StudentWaitingRoomPage.jsx)

**Contract**

- This field is a monotonic timestamp signal
- When the waiting room sees a newer `submissionResetAt`, it clears the “already completed” local guard and resumes the active test or quiz if the session is still in progress

### 3.3 `game_sessions/{sessionCode}/players/{playerId}/forceSubmitRequestedAt`

**Purpose**

Records the timestamp when the teacher explicitly requested a force-submit for a student.

**Writer**

- [sessionStudentControlService.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/services/sessionStudentControlService.ts)
  - `requestTeacherForceSubmit()`

**Important clarification**

This field is **not** the primary student-side trigger for submission.

The actual student-side force-submit behavior is driven by:

- `hasCompletedTest === true`
- `forceSubmittedBy === 'teacher'`
- the student not already having a persisted submission

That logic lives in [useTestCompletionCheck.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestCompletionCheck.ts), which calls `onForceSubmit('teacher')` when those conditions are true.

**Practical meaning**

`forceSubmitRequestedAt` is best treated as:

- an audit/debug timestamp
- an explicit marker that the teacher initiated the action

It should not be treated as the single source of truth for client submission behavior.

## 4. Session Cleanup Rules

Live anti-cheat now depends on specific cleanup behavior when a session ends.

### 4.1 Session-Level Cleanup

When [useMonitorControls.ts](/C:/Users/The%20Lord/Desktop/luyentap/src/hooks/monitor/useMonitorControls.ts) runs `endFullSession()` it clears:

- `status` back to `waiting`
- session timing fields
- `integrityRefreshRequestedAt`
- `session_test_payloads/{sessionCode}`

### 4.2 Player-Level Cleanup

The implementation intentionally delays full player cleanup for a few seconds after session end so student clients can:

1. detect that the test content is gone
2. redirect into the waiting room
3. still see the flags needed to open results or exit cleanly

After that delay, the teacher monitor cleanup clears anti-cheat/session-specific player fields such as:

- `hasCompletedTest`
- `completedAt`
- `submittedBy`
- `forceSubmittedBy`
- `forceSubmitRequestedAt`
- `submissionResetAt`
- `latestResultId`

### 4.3 Fields Intentionally Preserved

The session cleanup preserves some historical fields so students can still find results after the active test is gone:

- `lastTestId`
- `lastTestSessionCode`
- `lastTestEndedAt`

Those are not anti-cheat-specific, but they matter when reasoning about why cleanup does not remove everything immediately.

## 5. Rules Deployment Contract

The anti-cheat production reset depends on updated RTDB rules in [database.rules.json](/C:/Users/The%20Lord/Desktop/luyentap/database.rules.json).

The critical additive nodes are:

- `student_safe_tests`
- `session_test_payloads`
- existing `game_sessions` access for session coordination and integrity writes

**Operational rule**

Do not deploy the frontend without deploying the matching rules. The anti-cheat feature can appear broken even when the code is correct if these nodes are blocked by RTDB permissions.

## 6. Maintenance Guidance

If this system is changed later, verify these questions explicitly:

1. Does the student-facing loader still avoid direct dependence on answer-bearing question state?
2. If a new session surface is added, does it consume `integrityRefreshRequestedAt` and the force-submit path correctly?
3. If teacher reset behavior changes, does `submissionResetAt` still resume the waiting-room flow correctly?
4. If test save/update flows are refactored, are `student_safe_tests/{testId}` payloads still regenerated in the same root write as canonical changes?
5. If session end/cleanup changes, is `session_test_payloads/{sessionCode}` still removed and are anti-cheat coordination fields still reset?
6. If live-session loaders are refactored, do they still fall back to current `student_safe_tests/{testId}` when the cached session payload is stale?

## 7. Related References

- [0036-prd-anti-cheating-system.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0036-prd-anti-cheating-system.md)
- [tasks-0036-prd-anti-cheating-system-production-reset.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/tasks-0036-prd-anti-cheating-system-production-reset.md)
- [0036-anti-cheat-production-closeout.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0036-anti-cheat-production-closeout.md)
- [0036-anti-cheat-observability-contract.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0036-anti-cheat-observability-contract.md)
- [student-test-delivery-projections.md](/C:/Users/The%20Lord/Desktop/luyentap/documentation/architecture/student-test-delivery-projections.md)
