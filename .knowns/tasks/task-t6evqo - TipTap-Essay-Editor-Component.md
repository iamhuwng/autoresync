---
id: t6evqo
title: TipTap Essay Editor Component
status: done
priority: high
labels:
  - phase-1
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:43:56.129Z'
updatedAt: '2026-04-02T10:05:32.563Z'
timeSpent: 5013
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-1
  - AC-2
  - AC-3
  - AC-4
  - AC-8
  - AC-16
  - AC-24
  - AC-29
---
# TipTap Essay Editor Component

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build EssayEditor.tsx \u2014 the main left-column component. TipTap editor with all extensions (StarterKit+History, Highlight multicolor, TextStyle+Color, Underline, BubbleMenu, Placeholder, custom commentMark, correctionMark, marks-only plugin). Fixed toolbar at top. BubbleMenu near selection with annotation buttons only. Left margin gutter with colored SVG dots for comment lines. Original/Marked toggle. Metadata bar. Keyboard shortcuts. See @doc/specs/grading-editor-redesign FR-GROUP-1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TipTap editor renders student essay in marks-only mode (text locked, only marks allowed)
- [x] #2 Fixed toolbar above editor: Highlight (6-color dropdown 🟡🟢🟣🟣🟠🔴), Comment, Strikethrough, Correction, Text Color, Undo, Redo
- [x] #3 BubbleMenu appears near text selection with annotation buttons ONLY (Highlight, Comment, Strikethrough, Correction, Text Color) — no Bold/Italic
- [x] #4 6 preset highlight colors available via dropdown — button applies last-used color, dropdown arrow shows options
- [x] #5 Left gutter shows colored SVG circle dots for lines with comment marks — visible regardless of active right-panel tab
- [x] #6 Original/Marked toggle: Original shows read-only div with plain student text; Marked shows TipTap editor
- [x] #7 When Original is active, emit event/callback to disable Comments tab on right panel
- [x] #8 Gutter dot click emits callback to focus the corresponding comment
- [x] #9 Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y redo, Ctrl+Shift+H highlight, Ctrl+Shift+M comment, Escape dismiss
- [x] #10 Metadata bar below editor: word count + writing time
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Log

### EssayEditor.tsx created (555 lines)
Full component with:
- TipTap useEditor setup with StarterKit, Highlight (multicolor), TextStyle, Color, Placeholder, CommentMark, CorrectionMark, MarksOnlyMode
- Fixed toolbar: Highlight (split button + 6-color dropdown), Comment, Strikethrough, Correction, Text Color (7-color dropdown), Undo, Redo
- Custom floating bubble menu (replaced TipTap BubbleMenu component removed in v3.20) — positions near text selection using coordsAtPos, uses onMouseDown to prevent blur
- Left gutter with colored SVG dots from commentPositions prop
- Original/Marked toggle with onViewModeChange callback
- Comment mark click handling via handleClick editorProp
- Focused/hovered comment class management via useEffect + DOM queries
- Keyboard shortcuts: Ctrl+Shift+H (highlight), Ctrl+Shift+M (comment)
- Metadata bar: word count + writing time
- convertTextToTipTapJson helper for initial content

### EssayEditor.css created
- View toggle styling (blue active state)
- Toolbar buttons, dropdowns, separators
- Editor container with gutter space
- ProseMirror typography (Georgia serif, 1.8 line-height)
- Original view styling
- Metadata bar
- Dark bubble menu with hover states

### TipTap v3.20 compatibility notes
- BubbleMenu React component removed from @tiptap/react in v3.20 → built custom floating div
- TextStyle + Color now both exported from @tiptap/extension-text-style
- Highlight multicolor works via `Highlight.configure({ multicolor: true })`

### Build: Zero new TS errors"
2026-04-02 follow-up stabilization: EssayEditor is now task-scoped for command replay and content rehydration; queued quick comments/corrections/comment-mark mutations require taskNumber and are ignored when stale; correction-mark clicks reopen editing again; correction removal preserves original student text; added regression tests for correction replay, task rehydration, and stale-command rejection.

2026-04-02 essay-tool hardening pass: enforced true read-only behavior in EssayEditor tool affordances, anchored quick-comment replay to explicit selection snapshots from the page, changed text-color Default to clear color marks instead of writing `inherit`, enabled keyboard/click activation parity on toolbar buttons, and constrained comment marks to one mark per text slice with exact-id removal during replay.
2026-04-02: Added the essay-editor tool-contract architecture note to repo docs and Knowns, validated the linked IELTS writing architecture/spec docs, and prepared a narrow commit for the first hardening pass before starting the overlapping-mark composition pass.
2026-04-02 second pass: made correction the dominant composition mark in EssayEditor. New correction creation now refuses ranges that already carry comment/correction marks; new highlight/comment/strikethrough/text-color actions refuse corrected ranges; correction apply strips highlight/strike/textStyle before persisting; and legacy correction+comment overlap now routes clicks to correction editing first. Added DOM-level regression tests for correction-vs-formatting cleanup, comment+highlight coexistence, and correction-click precedence on old overlapping content.
<!-- SECTION:NOTES:END -->

