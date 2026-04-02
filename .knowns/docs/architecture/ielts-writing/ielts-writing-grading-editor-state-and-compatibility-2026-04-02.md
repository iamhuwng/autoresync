---
title: IELTS Writing Grading Editor State And Compatibility 2026-04-02
description: Architecture note for the 2026-04-02 stabilization pass covering task normalization, editor rehydration, draft/lock workflow, and RTDB compatibility metadata for teacher IELTS Writing grading.
createdAt: '2026-04-02T07:17:57.239Z'
updatedAt: '2026-04-02T07:18:56.325Z'
tags:
  - architecture
  - ielts
  - writing
  - grading
  - editor
  - compatibility
---

# IELTS Writing Grading Editor State And Compatibility 2026-04-02

## Purpose

This note records the runtime contract restored by the 2026-04-02 stabilization pass for teacher IELTS Writing grading.

It covers the previously unstable areas:
- task normalization
- task-switch editor rehydration
- pending comment drafts and unsaved-work detection
- leave / regrade / draft-takeover dialogs
- session-aware lock ownership
- RTDB compatibility metadata and degraded fallback reconstruction

## Problem Cluster Addressed

The grading feature had drift in three coupled layers:
- page state assumed Task 1 existed and treated missing active task state as fatal
- editor instances cached task-local content across task switches and reloads
- compatibility readers and legacy feedback services still depended too heavily on ambiguous teacher-label fields

Those defects interacted badly because stale task-local editor state could be saved into the wrong task while compatibility readers simultaneously reconstructed the wrong format or teacher identity downstream.

## Current Runtime Contract

### Task normalization
- The grading page must choose its active task from the real submission tasks.
- `task2-only` submissions are first-class inputs and must open directly into Task 2.
- Source reloads and version-conflict reloads may preserve the current task only if that task still exists.

### Hard rehydration boundary
- Task switching and grading-source reload are hard boundaries.
- Both `EssayEditor` and `TabbedFeedbackEditor` must reload from incoming props on that boundary.
- Task-scoped transient state must be cleared on that boundary:
  - focused / hovered comment state
  - anchor positions
  - queued quick-comment commands
  - queued correction commands
  - queued comment-mark mutation commands
  - correction popup state

### Essay editor contract
- The essay editor is task-scoped.
- Incoming `initialContent` / `originalEssayText` changes must rehydrate the TipTap document.
- Queued commands include `taskNumber` and must be ignored if they target another task.
- Clicking an existing correction mark in edit mode must reopen correction editing.
- Removing a correction removes only the correction mark, never the student's original essay text.

### Feedback editor contract
- The feedback editor must rebuild its per-tab cache from incoming `feedback` props.
- Real task changes reset the active tab to `taskSummary`.
- Same-task reloads keep the current tab but replace its content from props.

## Draft, Leave, And Save Safety

### Pending comment drafts
- Open comment composers are unsaved grading work.
- Pending comment drafts are persisted per task in the grading draft payload.
- Unsaved-work detection must include pending comment drafts in addition to the ordinary dirty flag.

### Save safety
- Autosave and manual save share the same draft payload builder.
- Save completion must always clear `saving` in a `finally` path.
- Save failure must preserve editability and unsaved state.
- Version conflicts must reload the latest grading state rather than silently overwriting another version.

### Dialog-driven destructive flows
- Leaving with unsaved work must offer save, discard, and cancel.
- Regrading requires an explicit reason.
- Discarding another teacher's private draft requires an explicit takeover reason.
- Browser-native confirm/prompt dialogs are no longer the acceptable contract for these workflows.

## Lock Ownership Contract

- Lock ownership is session-aware.
- `teacherId + sessionId` is the real ownership identity.
- Another tab or browser session for the same teacher is still a lock conflict.
- Lock renewal failure demotes the page back to review/read-only assumptions until editing is reacquired.

## Compatibility And Result-Reader Contract

### Canonical vs compatibility data
- Firestore `writing_submissions/{submissionId}` remains canonical.
- `publishedGrading` is the canonical published artifact.
- RTDB `test_results` remains a compatibility and discoverability layer.

### Explicit teacher metadata
Published Writing compatibility projections now write explicit teacher identity fields:
- `feedbackUpdatedByTeacherId`
- `feedbackUpdatedByTeacherName`

Readers should prefer those explicit fields and use legacy `feedbackUpdatedBy` only as fallback.

### Fallback reconstruction
- Degraded fallback reconstruction must preserve the real surviving task number.
- A single surviving Task 2 snapshot reconstructs as `task2-only`, not `task1-only`.

## Cross-feature implications

- Writing result surfaces, shared saved-result components, and legacy feedback services now need to preserve both explicit teacher identity and compatibility aliases.
- Notification-triggering saves should remain explicit workflow events, not side effects of every low-level write.
- Any future refactor that reuses editor instances across tasks must preserve the hard task-boundary rehydration rule.

## Related docs
- @doc/specs/ielts-writing-grading-editor-finalization-2026-03-30
- @doc/architecture/scheme/ielts-writing-current-state-scheme
- @doc/specs/ielts-writing-result-surfaces-2026-03-30
- @doc/architecture/architecture-ielts-writing-grading-submit-compatibility-audit-2026-03-29
