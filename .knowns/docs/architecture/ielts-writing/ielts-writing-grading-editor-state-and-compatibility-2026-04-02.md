---
title: IELTS Writing Grading Editor State And Compatibility 2026-04-02
description: Architecture note for the 2026-04-02 stabilization pass covering task normalization, editor rehydration, draft/lock workflow, and RTDB compatibility metadata for teacher IELTS Writing grading.
createdAt: '2026-04-02T07:17:57.239Z'
updatedAt: '2026-04-05T17:23:16.300Z'
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

### Essay Editor Contract

- `EssayEditor` is task-scoped even when React reuses the page component.
- incoming `initialContent` / `originalEssayText` changes must rehydrate the TipTap instance.
- queued commands must include `taskNumber` and be ignored when they target another task.
- selection-driven quick comments must carry an explicit `from` / `to` / `selectedText` snapshot from the page, not depend on whatever selection is live later.
- correction-mark clicks must reopen correction editing without requiring a native reselection.
- correction deletion removes only the mark metadata, never the student's original text.
- `readOnly` disables tool mutations from toolbar, bubble menu, shortcuts, and queued command replay.
- toolbar presence is controlled by editor interactivity: the persistent essay toolbar is available only in editable `marked` mode, not by whether a specific command currently has history or selection state.
- the four persistent essay controls (`undo`, `redo`, `comment`, `correction`) must survive task switches and source rehydration unchanged.
- one text slice may hold at most one comment mark, and comment removal must target the exact `commentId`.
- text-color `Default` clears the color mark instead of persisting a literal `inherit` value.
- toolbar controls must remain keyboard-activatable while still preventing editor blur on pointer interaction.
- core toolbar icons must use self-contained SVG or React icon components with accessible labels instead of font-ligature icon families.
- correction is the dominant composition mark:
  - new corrections are blocked on ranges that already contain comment/correction marks
  - new highlight/comment/strikethrough/text-color mutations are blocked on ranges that already contain a correction mark
  - correction application strips highlight, strike, and text-color marks before persisting the correction mark
  - legacy correction+comment overlap remains readable, but correction click handling wins over comment click routing
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


## 2026-04-02 follow-up: essay editor tool contract

The essay editor tool layer now has its own explicit contract:
- `readOnly` blocks toolbar, bubble-menu, shortcut, and queued-command mutations
- quick comments replay against a page-owned selection snapshot (`from`, `to`, `selectedText`), not a later live selection
- one text slice may hold at most one `commentMark`, and comment removal must target the exact `commentId`
- text-color `Default` clears the color mark instead of persisting a literal `inherit` value
- toolbar controls must stay keyboard-activatable while still preventing pointer-triggered editor blur

The remaining second-pass scope is now isolated to overlapping mark composition rather than basic command routing.

Related doc:
- @doc/architecture/ielts-writing/ielts-writing-essay-editor-tool-contract-and-mark-composition-2026-04-02


## 2026-04-02 second pass: explicit mark composition policy

The essay editor now enforces a concrete overlap policy instead of leaving correction combinations to TipTap defaults:
- correction is the dominant inline mark
- new correction application is blocked on ranges that already contain `commentMark` or `correctionMark`
- new highlight, comment, strikethrough, and text-color actions are blocked on selections that already contain `correctionMark`
- correction apply strips `highlight`, `strike`, and `textStyle` before persisting the correction mark
- older correction+comment combinations remain readable, but correction clicks win over comment-click routing

Related doc:
- @doc/architecture/ielts-writing/ielts-writing-essay-editor-tool-contract-and-mark-composition-2026-04-02


## 2026-04-02 follow-up: feedback editor list-tool stability

`TabbedFeedbackEditor` now has an additional controlled-editor invariant:
- same-value controlled `feedback` updates must not re-run `setContent(...)`
- bullet and ordered list formatting must survive the `onChange -> parent rerender -> feedback prop` loop
- toolbar buttons must preserve editor selection on `mousedown` so list toggles act on the intended block instead of blurring first

This keeps the feedback editor list tools stable while preserving the task/tab rehydration rules already documented above.


## 2026-04-02 follow-up: AI suggestions cache and injection contract

The grading editor now owns a teacher-only AI helper layer that sits beside the manual grading workflow rather than inside it.

Runtime rules:
- suggestions generate on first teacher open and warm all submitted tasks in one pass
- later opens reuse the persisted cache unless the teacher explicitly requests `Reload Suggestions`
- cache state lives in Firestore `writing_grading_ai_cache/{submissionId}` and is private to assigned teachers
- suggestion generation failure is persisted as `failed` state rather than silently retried on every load

Editor-state rules:
- the right rail now has a fourth tab, `Suggestions`
- suggestion cards may focus an anchored essay range without mutating markup
- comment suggestion injection creates a normal pending comment draft and reuses the existing composer save path
- correction suggestion injection opens the existing correction popup and still requires teacher confirmation
- suggestion injection must never write directly into `publishedGrading`

Normalization rules:
- AI returns sentence-bound anchors, not trusted raw offsets
- the client resolves `from` / `to` locally from `sentenceIndex + anchorText`
- duplicate, overlapping, and ambiguous anchors are dropped before persistence

Related doc:
- @doc/architecture/ielts-writing/ielts-writing-ai-suggestions-and-injection-2026-04-02


## 2026-04-04 follow-up: review correction linking and comment-rail identity

### Parent-owned view mode remains authoritative
- `editorViewMode` is page state owned by `WritingGradingPage`.
- Editor remounts, task changes, and source rehydration must not silently push the page back to `marked` after the teacher selects `original`.

### Review-mode correction linking
- Corrections shown in review mode must behave as first-class comment-tab items.
- Clicking a correction mark in the essay must force-open `Comments`, focus the matching sidebar item, and preserve visible linkage even when the correction originated from older saved markup.
- Sidebar correction items therefore depend on correction identity derived from the rendered editor surface, not only on newly persisted ids.

### Comment-anchor measurement boundary
- Page-side anchor measurement must target essay marks only.
- Gutter dots are navigational affordances and must not share the same selector identity as essay comment marks, otherwise anchor-position reads can target the dot itself and corrupt the left-rail alignment state.

### Shared comment highlight compatibility
- New and legacy comments now converge on one shared yellow highlight treatment at render time.
- Persisted legacy `comment.color` data may still exist for compatibility, but runtime rendering and gutter-dot affordances should normalize to the shared yellow comment highlight.

## 2026-04-04 follow-up: current annotation workflow surfaces

### Supported teacher tool model

- The grading page now uses a hybrid annotation model instead of the older full toolbar.
- Persistent essay controls live in the sticky editor bar: `undo`, `redo`, `comment`, and `correction`.
- The persistent four-button toolbar is owned by editable `marked` mode. Task rehydration, task switching, and command availability may disable individual actions but must not remove the toolbar surface.
- Core persistent controls must render with self-contained SVG or React icons plus accessible labels; they must not rely on font-ligature icon families that can degrade into visible text.
- Range-local controls live in the bubble menu: `comment`, `correction`, and optional `strikethrough`.
- Manual `highlight` and manual `text color` creation are no longer part of the active teacher authoring workflow.
### Comment and correction parity in the sidebar
- The `Comments` tab is the shared review surface for both comment annotations and correction annotations.
- Focus, hover, edit, and delete flows must work when initiated from either the essay surface or the sidebar item.
- Review-mode interaction must preserve this parity for both current and legacy saved markup.

## 2026-04-05 follow-up: correction/comment interaction split

- `Comments` tab is now comment-only. Correction cards and correction edit/delete actions no longer live in the comment rail.
- Page/editor focus is split:
  - comment focus remains rail-linked state
  - correction focus is separate editor-local/page-local state used only for correction interaction
- The correction popup can piggyback-create a normal comment on the same selected source range without auto-switching the right rail to `Comments`.
- This pass keeps the persisted schema unchanged:
  - comments remain first-class records in `WritingTaskMarkupState.comments`
  - corrections remain markup-derived from `markedContent`
- Legacy overlapping correction/comment markup remains supported, but the overlap is no longer modeled as shared sidebar identity.

## 2026-04-05 second follow-up: piggyback comment ownership and overlay escape

- Piggyback comments created from the correction popup remain first-class entries in `WritingTaskMarkupState.comments` with the original selected source range as their persisted anchor.
- Same-range correction + comment is still supported, but the render contract is now explicit: correction owns the outer visual wrapper, while the comment mark remains scoped to the original source text slice.
- Teacher essay overlays are no longer mounted inside the essay subtree. Hover comment tooltips and selection bubble menus now escape through a body portal, matching the correction popup's viewport-overlay architecture.

## 2026-04-05 third follow-up: comment tooltip adjacency

- Teacher essay hover tooltips now use anchor-aware side placement instead of a fixed left-aligned above/below heuristic.
- This is a runtime interaction contract change only; persisted comment anchors remain unchanged.
- The goal of the new heuristic is attribution clarity: the tooltip should read as attached to the hovered annotation, not merely remain visible inside the viewport.

## 2026-04-06 follow-up: pending draft anchor geometry and rail ordering

- `WritingPendingCommentDraft` now carries optional `anchorViewportTop` geometry so an unsaved comment draft has a positioning source of truth.
- The `Comments` rail no longer treats a pending draft as a footer-only block with `scrollIntoView()` as its primary positioning behavior.
- Pending drafts participate in the same ordered rail model as saved comments and are inserted by canonical essay range order.
- Saved-comment focus alignment remains the dominant behavior when a saved comment is actively selected; otherwise the pending draft drives rail alignment.
- Older persisted drafts without `anchorViewportTop` remain compatible and fall back to ordinary in-rail rendering without precise cross-column alignment until a new anchor is captured.
