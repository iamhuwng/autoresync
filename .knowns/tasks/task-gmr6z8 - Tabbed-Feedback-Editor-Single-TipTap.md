---
id: gmr6z8
title: Tabbed Feedback Editor (Single TipTap)
status: done
priority: medium
labels:
  - phase-1
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:45:21.893Z'
updatedAt: '2026-03-01T07:59:29.235Z'
timeSpent: 128
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-22
---
# Tabbed Feedback Editor (Single TipTap)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite FeedbackPanel.tsx. Replace 5 separate TipTap editors with 1 tabbed TipTap editor. Tab pills: [Overall] [TA/TR] [CC] [LR] [GRA]. Toolbar: B, I, U, bullet list, numbered list, undo, redo. Content preserved on tab switch via state object {overall, ta, cc, lr, gra} stored as HTML. Dynamic TA/TR label based on task number. See @doc/specs/grading-editor-redesign FR-60 through FR-65.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Single TipTap editor instance with 5 tab pills above it: [Overall] [TA/TR] [CC] [LR] [GRA]
- [x] #2 Active tab: filled blue (#3b82f6) bg + white text. Inactive: gray (#9ca3af) outline
- [x] #3 Toolbar: Bold, Italic, Underline, Bullet List, Numbered List, Undo, Redo
- [x] #4 Content preserved when switching tabs — stored as {overall:string, ta:string, cc:string, lr:string, gra:string} HTML strings
- [x] #5 Editor area min-height: 180px with comfortable typography
- [x] #6 Placeholder text: 'Write your {criterionName} feedback for Task {taskNumber}...'
- [x] #7 First criterion tab label dynamically shows TA (Task 1) or TR (Task 2)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Log

### TabbedFeedbackEditor.tsx (190 lines)
- Single TipTap editor with 5 tab pills: Overall, TA/TR, CC, LR, GRA
- Tab switching: saves current content to ref → sets new tab → loads new content
- Toolbar: Bold, Italic, Underline, Bullet List, Numbered List, Undo, Redo
- Active states on toolbar buttons
- Dynamic TA→TR label based on taskNumber
- Dynamic placeholder via data-attribute on editor element
- StarterKit configured with heading/codeBlock/code/blockquote/hr disabled
- Underline extension added
- Content preserved via contentRef (FeedbackContent object)
- onChange fires on every update with full FeedbackContent

### TabbedFeedbackEditor.css
- Tab pills: gray outline (inactive), blue filled (active), 16px radius
- Toolbar: 28px buttons, active state with e2e8f0 bg, separators
- Editor content: 180px min-height, 14px/1.7 typography
- Placeholder styling via CSS ::before pseudo-element

### Build: Zero new TS errors"
<!-- SECTION:NOTES:END -->

