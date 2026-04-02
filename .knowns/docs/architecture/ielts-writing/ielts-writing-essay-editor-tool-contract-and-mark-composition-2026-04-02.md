---
title: IELTS Writing Essay Editor Tool Contract And Mark Composition 2026-04-02
description: Architecture note for the essay-editor tool layer in teacher IELTS Writing grading, covering read-only behavior, selection anchoring, comment identity, and the remaining overlapping-mark composition boundary.
createdAt: '2026-04-02T09:51:04.708Z'
updatedAt: '2026-04-02T09:52:57.156Z'
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

The 2026-04-02 hardening pass stabilized the first layer. Future work on overlapping mark semantics should treat this document as the starting contract.

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
- In read-only mode, highlight controls must be disabled and shortcuts ignored.

### Comment

- Comment creation is selection-bound.
- One text slice may hold at most one `commentMark`.
- Removing a comment mark must target the exact `commentId`, not strip all comment marks from the range.
- Click and hover routing depend on that one-mark-per-slice invariant.

### Quick comment

- Quick comments are comment creation with a preset payload.
- They share the same exact range/identity constraints as manual comments.
- Quick comments must never drift to a newer selection after the teacher opens the preset dialog.

### Strikethrough

- Strikethrough is allowed as a mark-only mutation.
- Its composition with correction and comment marks is still a separate concern and must be tested explicitly.

### Correction

- Correction creation is selection-bound.
- Removing a correction removes only correction metadata and visible replacement rendering, never the student's original text.
- Clicking a rendered correction mark must reopen correction editing using the stored range and correction text.

### Text color

- Text color is selection-bound.
- `Default` means clear the color mark, not write a literal `inherit` value into the document.
- Text color is toolbar-only today; the bubble menu intentionally does not provide an active color picker.

### Undo / redo

- Undo and redo operate on mark history only because the editor is in marks-only mode.
- In read-only mode, undo and redo controls must be disabled.

## Accessibility And Input Semantics

- Toolbar buttons must remain keyboard-activatable.
- Preventing editor blur on mouse interaction must not remove standard button click activation.
- Keyboard shortcuts must only fire when the active selection belongs to the essay editor surface.

## Mark Composition Boundary

The hardening pass does not fully settle overlapping-mark semantics.

The remaining second-pass scope is:
- correction + strikethrough overlap behavior
- correction + text-color overlap behavior
- correction + highlight overlap behavior
- comment + correction overlap behavior
- comment + highlight overlap behavior after the one-mark-per-slice rule
- how rendered replacement text should inherit or reject other visual marks

Any work in that area must preserve the stable tool contract above.

## Related Documents

- @doc/architecture/ielts-writing/ielts-writing-grading-editor-state-and-compatibility-2026-04-02
- @doc/specs/ielts-writing-grading-editor-finalization-2026-03-30
- @doc/architecture/scheme/ielts-writing-current-state-scheme
