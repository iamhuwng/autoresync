# IELTS Writing Grading Editor State And Compatibility

## Purpose

This document records the current runtime contract for the teacher IELTS Writing grading editor after the 2026-04-02 stabilization pass.

It focuses on the parts that were previously brittle:
- task normalization and task switching
- editor rehydration boundaries
- pending comment drafts and unsaved-work detection
- leave, regrade, and draft-takeover dialogs
- lock ownership and lock-loss behavior
- compatibility metadata written to `test_results`

## Core Runtime Rules

### Task Normalization

- `WritingGradingPage` must derive its initial active task from the actual submission tasks, not from a hard-coded Task 1 assumption.
- `task2-only` submissions must open directly into Task 2.
- any source reload, reset, or version-conflict reload must preserve the active task only if that task still exists in the current submission.

### Task-Bound Editor Rehydration

- changing task or reloading grading state is a hard editor boundary
- the essay editor and feedback editor must both reload from incoming props when that boundary is crossed
- task-bound transient UI state must be cleared on that boundary:
  - focused / hovered comments
  - anchor positions
  - queued quick-comment commands
  - queued correction commands
  - queued comment-mark mutations
  - correction popup state
- task switching must not leak Task 1 essay markup or feedback into Task 2, or vice versa

### Essay Editor Contract

- `EssayEditor` is task-scoped even when React reuses the page component
- incoming `initialContent` / `originalEssayText` changes must rehydrate the TipTap instance
- queued commands must include `taskNumber` and be ignored when they target another task
- selection-driven quick comments must carry an explicit `from` / `to` / `selectedText` snapshot from the page, not depend on whatever selection is live later
- correction-mark clicks must reopen correction editing without requiring a native reselection
- correction deletion removes only the mark metadata, never the student's original text
- `readOnly` disables tool mutations from toolbar, bubble menu, shortcuts, and queued command replay
- one text slice may hold at most one comment mark, and comment removal must target the exact `commentId`
- text-color `Default` clears the color mark instead of persisting a literal `inherit` value
- toolbar controls must remain keyboard-activatable while still preventing editor blur on pointer interaction
- correction is the dominant composition mark:
  - new corrections are blocked on ranges that already contain comment/correction marks
  - new highlight/comment/strikethrough/text-color mutations are blocked on ranges that already contain a correction mark
  - correction application strips highlight, strike, and text-color marks before persisting the correction mark
  - legacy correction+comment overlap remains readable, but correction click handling wins over comment click routing

### Feedback Editor Contract

- `TabbedFeedbackEditor` must rebuild its internal per-tab cache from incoming `feedback`
- real task changes reset the active tab to `taskSummary`
- same-task source reloads must keep the current tab but replace the tab content from props

## Draft And Unsaved-Work Rules

### Pending Comment Drafts

- open comment composers are unsaved grading state
- pending comment drafts are stored per task inside the grading draft payload
- unsaved-work detection must include both:
  - normal dirty grading state
  - pending comment draft state that differs from the last saved draft signature

### Save Safety

- autosave and manual save must both use the same draft builder
- save completion must always clear `saving` in a `finally` path
- save failures must preserve editability and dirty state
- version conflicts must reload the latest grading source instead of silently overwriting it

### Leave / Regrade / Takeover

- the grading page must use explicit in-app dialogs for destructive workflow decisions
- leaving with unsaved work supports exactly three outcomes:
  - `Save Draft and Leave`
  - `Discard and Leave`
  - `Cancel`
- regrading a published submission requires a regrade reason
- discarding another teacher's private draft requires a takeover reason

## Lock And Ownership Rules

- grading locks are session-aware, not just teacher-aware
- `teacherId + sessionId` is the real ownership identity
- the same teacher in another tab or browser session is a lock conflict, not implicit ownership
- heartbeat / renewal failure must return the page to review mode and block further editing assumptions

## Compatibility Result Metadata

### Canonical

- Firestore `writing_submissions/{submissionId}` remains the canonical grading source
- `publishedGrading` is the canonical published artifact
- `gradingDraft` remains the canonical unpublished teacher draft

### Compatibility Projection

- RTDB `test_results` still carries Writing result discovery and compatibility metadata
- published compatibility writes must include explicit teacher metadata:
  - `feedbackUpdatedByTeacherId`
  - `feedbackUpdatedByTeacherName`
- legacy label-style fields remain readable for backward compatibility but are no longer the only source of truth

### Fallback Result Reconstruction

- degraded fallback reconstruction must preserve the real surviving task number
- a single surviving Task 2 result must reconstruct as `task2-only`, not `task1-only`

## Reader Expectations

- student and teacher result readers should prefer explicit teacher ID/name metadata when available
- legacy compatibility labels are fallback-only
- notification-triggering feedback saves should remain explicit and not fire on every incremental write burst

## Related Documents

- `README.md`
- `lifecycle-and-surfaces.md`
- `contracts-and-governance.md`
- `essay-editor-tool-contract-and-mark-composition.md`
- `../../../.knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md`
- `../../../.knowns/docs/architecture/scheme/ielts-writing-current-state-scheme.md`
