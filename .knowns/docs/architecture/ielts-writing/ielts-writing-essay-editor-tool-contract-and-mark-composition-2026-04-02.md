---
title: IELTS Writing Essay Editor Tool Contract And Mark Composition 2026-04-02
description: Architecture note for the essay-editor tool layer in teacher IELTS Writing grading, covering read-only behavior, selection anchoring, comment identity, and the remaining overlapping-mark composition boundary.
createdAt: '2026-04-02T09:51:04.708Z'
updatedAt: '2026-04-05T18:43:29.960Z'
tags:
  - architecture
  - ielts
  - writing
  - grading
  - essay-editor
  - tools
  - composition
---

# IELTS Writing Essay Editor Tool Contract And Mark Composition

## Purpose

This note isolates the runtime contract for the left-column essay editor inside teacher IELTS Writing grading.

It exists because the editor has two distinct responsibility layers:
- tool affordances and command routing
- mark composition rules when multiple tools touch the same text

The 2026-04-02 hardening work stabilized tool routing first and then made correction overlap rules explicit.

## Tool Surface

The essay editor currently exposes these tool surfaces:
- `Marked` / `Original` view toggle
- toolbar actions: highlight, comment, strikethrough, correction, text color, undo, redo
- bubble menu actions: highlight, comment, strikethrough, correction
- inline comment-mark click / hover behavior
- inline correction-mark click behavior
- gutter-dot navigation for saved comments
- keyboard shortcuts for highlight and comment
- external queued commands from `WritingGradingPage`:
  - quick comment
  - correction apply / remove
  - comment-mark apply / remove

## Stable Tool Contract

### Read-only means no mutations

- `readOnly` is not just a visual state.
- When `readOnly` is true, no essay-editor tool may mutate markup.
- This applies to:
  - toolbar clicks
  - bubble-menu clicks
  - keyboard shortcuts
  - queued external commands
- The editor may still support viewing, hovering, and comment/correction inspection in read-only mode.

### Selection-driven tools need stable ranges

- Selection-dependent tools must act on an explicit selection snapshot, not on whichever selection happens to exist later.
- Quick comments must carry:
  - `taskNumber`
  - `from`
  - `to`
  - `selectedText`
  - `preset`
  - `nonce`
- `WritingGradingPage` owns the authoritative current selection snapshot for dialog-driven actions.
- If no valid essay selection exists, quick-comment execution must be rejected before command dispatch.

### Task scoping still applies

- Every queued command remains task-scoped.
- A queued command for another task must be ignored.
- Task switches and source reloads clear selection-driven transient command state.

## Tool-Specific Rules

### View toggle

- `Marked` is the only mode where annotation tools may execute.
- `Original` is display-only and must clear active selection-driven overlays.

### Highlight

- Highlight is a mark-only mutation.
- Reusing the last chosen highlight color is valid.
- A fully highlighted selection toggles highlight off.
- Highlight must not be applied to a selection that already contains a correction mark.
- In read-only mode, highlight controls must be disabled and shortcuts ignored.

### Comment

- Comment creation is selection-bound.
- One text slice may hold at most one `commentMark`.
- Removing a comment mark must target the exact `commentId`, not strip all comment marks from the range.
- Click and hover routing depend on that one-mark-per-slice invariant.
- New comment marks must not be created on top of a correction mark.

### Quick comment

- Quick comments are comment creation with a preset payload.
- They share the same exact range/identity constraints as manual comments.
- Quick comments must never drift to a newer selection after the teacher opens the preset dialog.
- Quick comments must be rejected when the anchored range already contains a correction mark.

### Strikethrough

- Strikethrough is allowed as a mark-only mutation.
- Strikethrough may overlap with highlight, comment, and text color.
- Strikethrough must not be applied to a selection that already contains a correction mark.

### Correction

- Correction creation is selection-bound.
- A new correction must not be created on a range that already contains a comment mark or another correction mark.
- Applying a correction strips presentation marks from the selected range before the correction mark is written:
  - highlight
  - strikethrough
  - text color / `textStyle`
- Removing a correction removes only correction metadata and visible replacement rendering, never the student's original text.
- Clicking a rendered correction mark must reopen correction editing using the stored range and correction text.
- If an older document still contains both comment and correction marks on the same text, click routing must prefer correction editing over comment-click behavior.

### Text color

- Text color is selection-bound.
- `Default` means clear the color mark, not write a literal `inherit` value into the document.
- Text color is toolbar-only today; the bubble menu intentionally does not provide an active color picker.
- Text color must not be applied to a selection that already contains a correction mark.

### Undo / redo

- Undo and redo operate on mark history only because the editor is in marks-only mode.
- In editable `marked` mode, undo and redo remain mounted as persistent toolbar controls even when no history is available.
- Unavailable undo/redo state must be expressed as `disabled`, not by removing the controls from the sticky toolbar.
- The persistent toolbar must use self-contained SVG or React icon components with accessible labels; it must not depend on font-ligature icon families that can degrade into visible text when the font is absent.
- In read-only mode, the persistent essay toolbar is not interactive and undo/redo are not exposed as actionable controls.
## Accessibility And Input Semantics

- Toolbar buttons must remain keyboard-activatable.
- Preventing editor blur on mouse interaction must not remove standard button click activation.
- Keyboard shortcuts must only fire when the active selection belongs to the essay editor surface.

## Mark Composition Policy

The current composition policy is:
- correction is the dominant inline annotation
- new correction overlaps with comment or correction are blocked
- new highlight, comment, strikethrough, and text-color mutations are blocked on selections that already contain a correction
- correction strips visual formatting marks before it is applied so the replacement rendering owns the slice cleanly
- comment, highlight, strikethrough, and text color may still overlap with one another when no correction is involved

The main residual risk is legacy content that already contains older overlap combinations. Those ranges should remain readable, and correction interaction must keep winning over comment click routing.

## Related Documents

- @doc/architecture/ielts-writing/ielts-writing-grading-editor-state-and-compatibility-2026-04-02
- @doc/specs/ielts-writing-grading-editor-finalization-2026-03-30
- @doc/architecture/scheme/ielts-writing-current-state-scheme


## 2026-04-02 follow-up: external focus command

The essay editor now accepts an additional page-owned command for suggestion navigation.

Rules:
- the command is task-scoped and must include `taskNumber`, `from`, `to`, and `nonce`
- it selects and scrolls the anchored essay range into view
- it does not add, remove, or rewrite any marks by itself
- it exists to let the Suggestions tab focus the exact text slice before the teacher decides whether to inject a comment or correction


## 2026-04-04 follow-up: controlled view mode, shared comment highlight, and legacy correction identity

### Controlled view-mode ownership
- `WritingGradingPage` is the sole owner of `Marked` / `Original` state.
- `EssayEditor` must never force the parent back to `marked` on mount or task change.
- Task changes may clear local overlay state, but they must not override the page-owned view toggle.

### Shared comment highlight contract
- Comment marks now render with one shared yellow highlight treatment instead of per-comment highlight colors.
- The same yellow is used for the essay mark and the gutter dot so the left-rail affordance matches the inline mark.
- Comment category colors still belong to sidebar labels, presets, and categorization UI; they are no longer the inline highlight source.

### Gutter-dot selector boundary
- Gutter dots must not reuse `data-comment-id`.
- Anchor measurement and essay-click routing depend on `data-comment-id` belonging only to real essay comment marks.
- Gutter dots therefore use a dedicated identifier so page-side anchor-position queries never self-target the gutter element.

### Legacy correction identity in review mode
- Older saved correction marks may lack `data-correction-id`.
- The editor must derive a deterministic fallback correction id from the resolved range when needed.
- That fallback id must be usable for review-mode focus, hover sync, and comment-tab linking even before the mark is rewritten by a newer save.
- Review-mode correction clicks should therefore participate in the same sidebar-focus path as current corrections, not degrade into essay-only behavior.

## 2026-04-04 follow-up: current teacher tool surfaces after toolbar redesign

### Current persistent editor controls

- The sticky top editor bar is the persistent tool surface inside the essay area.
- Supported persistent actions are `undo`, `redo`, `comment`, and `correction`.
- These four controls must render as self-contained SVG or React icon buttons with accessible labels; the grading editor must not rely on unloaded font-ligature icon families for core controls.
- In editable `marked` mode, the four-button toolbar must stay visible across task switches and source rehydration. Command availability may disable `undo` or `redo`, but it must not make the buttons disappear.
- `Marked` / `Original` stays page-owned outside the editor chrome.
- Quick comments remain a separate visible trigger and are not part of the sticky editor bar.
### Current bubble-menu scope
- The bubble menu is now limited to selection-bound inline actions.
- Supported bubble actions are `comment`, `correction`, and `strikethrough`.
- Manual `highlight` and manual `text color` authoring are intentionally removed from the teacher workflow.

### Comments-tab interaction contract
- Saved comments and saved corrections must both materialize as first-class items in the `Comments` tab.
- Clicking either a comment mark or a correction mark from the essay must open or focus the matching sidebar item.
- Sidebar edit and delete actions for corrections must route back through the same correction editing and removal flow as the editor surface.

## 2026-04-05 follow-up: correction flow separated from the comments rail

- Correction interaction is no longer routed through the `Comments` tab.
- Clicking a correction mark in the essay reopens correction editing only; it does not force-open the comment rail.
- The correction popup may optionally create a normal comment anchored to the same selected source text.
- `Comments` remains comment-only. Corrections no longer materialize as first-class comment-rail cards.
- Same-range `commentMark` + `correctionMark` is now an intentional supported state:
  - correction click routing still wins inside the essay surface
  - the comment remains accessible through the comment rail and gutter-dot navigation
  - correction application still strips highlight, strikethrough, and text-color marks, but it no longer blocks or removes comment marks on the same slice
- Quick comments and manual comments may be applied to corrected text because comment interaction is now independent from correction-tab routing.

## 2026-04-05 second follow-up: correction/comment overlap ownership and essay overlay mounting

- The piggyback comment created from the correction popup still persists as a normal `GradingComment` on the original source range; no range remapping or correction-owned note model was introduced in this pass.
- The underlying bug was mark composition, not comment range data. `correctionMark` now remains the dominant outer mark when a correction overlaps a comment mark, so the comment highlight/anchor applies only to the original selected text and not to the rendered replacement text.
- Essay-side hover tooltip and bubble-menu overlays now follow the same architectural rule as `CorrectionPopup`: they mount through a body portal and use viewport-fixed positioning. This keeps annotation overlays free of left-column/editor subtree clipping semantics instead of relying on local container overflow changes.

## 2026-04-05 third follow-up: tooltip attachment heuristic

- Escaping the essay subtree was not sufficient by itself; hover tooltip placement now derives from the hovered mark rectangle rather than defaulting to `below/above + markRect.left`.
- The essay comment tooltip now chooses the nearest intelligible attachment side in this order: right, left, bottom, then top, while still clamping to the viewport.
- Tooltip rendering now includes explicit placement state so the UI can show a directional attachment cue (`data-placement`), making the hovered comment and the overlay legible as one interaction.

## 2026-04-06 follow-up: pending comment composer joins the anchored rail

- Manual comment creation from the essay no longer opens a footer-style composer appended after saved comments.
- The editor now preserves the selected text's viewport anchor top when the comment action is triggered.
- The pending comment composer is treated as a first-class comment-rail item with the same vertical alignment contract as a saved comment header.
- The active rail target is now resolved in this order: focused saved comment first, otherwise the pending draft composer.
- Rail ordering is now canonical essay order from comment ranges (`from`, then `to`) instead of mixing measured pixel offsets with document positions.
- This keeps click-on-highlight behavior intact while making new comment creation stay parallel to the selected essay text.

## 2026-04-06 fourth follow-up: pending comment draft stays local to the reader

- Opening a new pending comment must never drag the browser viewport toward the right rail.
- The right-side `Comments` rail now owns its own reveal behavior:
  - alignment still uses the selected essay anchor when that geometry exists
  - fallback reveal happens by scrolling the rail viewport itself, never via `scrollIntoView()` on the page
- `CommentComposer` autofocus is now explicitly non-scrolling so keyboard readiness does not move the page away from the selected essay text.
- Pending comment state is now visible in the essay before save through a transient preview decoration on the selected source range.
- That preview is not a persisted `commentMark`:
  - it exists only while a pending draft is open
  - it is removed on save, cancel, task switch, or mode changes that clear the pending draft
- The preview styling is intentionally lighter than a saved comment:
  - subtle dotted underline
  - soft glow/blur treatment
  - applied to the original selected text only
- Published result readers now share the same local-rail reveal rule for feedback selection so cross-column alignment remains consistent without page-level scroll jumps.
