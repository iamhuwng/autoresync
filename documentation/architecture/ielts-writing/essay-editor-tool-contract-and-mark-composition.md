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
- In read-only mode, undo and redo controls must be disabled.

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

- `README.md`
- `grading-editor-state-and-compatibility.md`
- `contracts-and-governance.md`
- `../../../.knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md`
## 2026-04-03 Amendment - Internal Suggestion Range Focus

The essay editor still supports non-mutating internal range focus for suggestion approval flows, but that focus is no longer exposed as a separate user action in the review modal.

Internal-focus rules:
- internal focus commands remain navigation-only and must never add, edit, or remove annotation marks by themselves
- a focus command carries the exact task-scoped `from` / `to` range resolved from the suggestion cache
- executing a focus command may select and scroll the anchored range into view before the grading page applies an approved suggestion
- a focus command for another task must be ignored
- read-only mode may still honor internal focus commands because they are viewing actions, not mutations

Interaction boundary:
- suggestion-driven focus is now an implementation detail of direct approval flows
- the review modal no longer exposes a dedicated `Focus in Essay` button
- approved suggestions must still route through the existing saved-comment or correction-application infrastructure instead of writing editor marks directly from the modal

## 2026-04-04 Follow-up - Controlled View Mode, Shared Comment Highlight, And Legacy Correction Identity

### Controlled View-Mode Ownership
- `WritingGradingPage` is the sole owner of `Marked` / `Original` state.
- `EssayEditor` must never force the parent back to `marked` on mount or task change.
- Task changes may clear local overlay state, but they must not override the page-owned view toggle.

### Shared Comment Highlight Contract
- Comment marks now render with one shared yellow highlight treatment instead of per-comment highlight colors.
- The same yellow is used for the essay mark and the gutter dot so the left-rail affordance matches the inline mark.
- Comment category colors still belong to sidebar labels, presets, and categorization UI; they are no longer the inline highlight source.

### Gutter-Dot Selector Boundary
- Gutter dots must not reuse `data-comment-id`.
- Anchor measurement and essay-click routing depend on `data-comment-id` belonging only to real essay comment marks.
- Gutter dots therefore use a dedicated identifier so page-side anchor-position queries never self-target the gutter element.

### Legacy Correction Identity In Review Mode
- Older saved correction marks may lack `data-correction-id`.
- The editor must derive a deterministic fallback correction id from the resolved range when needed.
- That fallback id must be usable for review-mode focus, hover sync, and comment-tab linking even before the mark is rewritten by a newer save.
- Review-mode correction clicks should therefore participate in the same sidebar-focus path as current corrections, not degrade into essay-only behavior.

## 2026-04-04 Follow-up - Current Teacher Tool Surfaces After Toolbar Redesign

### Current Persistent Editor Controls
- The sticky top editor bar is now the persistent tool surface inside the essay area.
- Supported persistent actions are `undo`, `redo`, `comment`, and `correction`.
- `Marked` / `Original` stays page-owned outside the editor chrome.
- Quick comments remain a separate visible trigger and are not part of the sticky editor bar.

### Current Bubble-Menu Scope
- The bubble menu is now limited to selection-bound inline actions.
- Supported bubble actions are `comment`, `correction`, and `strikethrough`.
- Manual `highlight` and manual `text color` authoring are intentionally removed from the teacher workflow.

### Comments-Tab Interaction Contract
- Saved comments and saved corrections must both materialize as first-class items in the `Comments` tab.
- Clicking either a comment mark or a correction mark from the essay must open or focus the matching sidebar item.
- Sidebar edit and delete actions for corrections must route back through the same correction editing and removal flow as the editor surface.
