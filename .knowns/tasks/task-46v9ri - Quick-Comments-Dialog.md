---
id: 46v9ri
title: Quick Comments Dialog
status: done
priority: medium
labels:
  - phase-1
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:44:58.194Z'
updatedAt: '2026-03-29T20:17:34.756Z'
timeSpent: 179
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-9
  - AC-10
---
# Quick Comments Dialog

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build QuickCommentsDialog.tsx \u2014 speech-bubble dialog from FAB button. Categorized preset chips (GRA, LR, CC, TA/TR dynamic based on task). Click preset \u2192 auto-create comment mark + card on selected text. Custom preset creation inline. localStorage persistence. Selection validation. See @doc/specs/grading-editor-redesign FR-19 through FR-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 FAB button (💬 SVG icon) in bottom-right of essay panel
- [x] #2 Speech-bubble dialog opens on click with tail pointing to FAB
- [x] #3 If no text selected: show tooltip 'Select text first, then use Quick Comments' — dialog does NOT open
- [x] #4 Presets organized by 4 categories with colored headers: GRA (red), LR (orange), CC (green), TA/TR (blue)
- [x] #5 Category abbreviation dynamically uses TA (Task 1) or TR (Task 2) based on active task
- [x] #6 Default presets: GRA (Subject-verb agreement, Wrong tense, Article error, Run-on sentence, Fragment), LR (Word choice, Repetitive vocabulary, Informal register, Spelling error), CC (Needs transition word, Weak paragraph structure, Unclear reference), TA/TR (Off-topic, Doesn't address the prompt, Missing key info)
- [x] #7 Clicking a preset creates commentMark on selected text + creates GradingComment object with preset text and category
- [x] #8 '➕ Create new preset' inline input with category dropdown and Add button inside the dialog
- [x] #9 Default presets (isDefault:true) cannot be deleted; custom presets can be deleted
- [x] #10 Presets stored in localStorage at kahoot_quick_comment_presets
- [x] #11 Dialog dismissal (click outside or Escape) preserves the text selection in the editor
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Log

### QuickCommentsDialog.tsx (330 lines)
- FAB button with gradient (blue→indigo), SVG chat bubble icon
- Tooltip on click without selection: 'Select text first, then use Quick Comments' (auto-dismiss 2.5s)
- Speech-bubble dialog with CSS tail pointing to FAB
- 15 default presets across 4 categories: GRA(5), LR(4), CC(3), TA(3)
- Dynamic TA→TR swap for Task 2
- Preset chips with click handler → calls onSelectPreset
- Custom preset deletion (✕ on non-default chips)
- '➕ Create new preset' inline: input + category dropdown + Add button
- localStorage persistence at kahoot_quick_comment_presets (stores only custom presets)
- Click-outside + Escape dismissal
- Grouped display ordered: TA/TR → CC → LR → GRA

### QuickCommentsDialog.css
- FAB: 44px circle, gradient, scale hover/active
- Tooltip: dark background, tail arrow, fade-in animation
- Dialog: 320px wide, 12px radius, slide-up animation, speech-bubble tail
- Category groups with colored left border + dot
- Chips: rounded pill shape with hover state, ✕ on custom
- Add row: input + select + button inline

### Build: Zero new TS errors (fixed one ! assertion)"

2026-03-30 note: Historical implementation task only. The finalized teacher writing grading editor interaction contract now lives in @doc/specs/ielts-writing-grading-editor-finalization-2026-03-30. Quick comment behavior must now stay consistent with the finalized comment-ordering and linking rules.
<!-- SECTION:NOTES:END -->

