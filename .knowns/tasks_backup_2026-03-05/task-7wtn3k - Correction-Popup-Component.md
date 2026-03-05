---
id: 7wtn3k
title: Correction Popup Component
status: done
priority: medium
labels:
  - phase-1
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:44:16.348Z'
updatedAt: '2026-03-01T07:48:34.297Z'
timeSpent: 84
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-6
---
# Correction Popup Component

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build CorrectionPopup.tsx \u2014 small inline popup near text selection for entering correction text. Appears when teacher clicks Correction in toolbar/BubbleMenu. Input field 'Correct to:' + Apply button + close. Positioned near selection. Enter submits, Escape dismisses. Creates correctionMark on the selected text. See @doc/specs/grading-editor-redesign FR-9, FR-10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Popup appears near selected text when Correction is clicked in toolbar or BubbleMenu
- [x] #2 Input field labeled 'Correct to:' with Apply button and ✕ close button
- [x] #3 Enter key submits correction, Escape dismisses without applying
- [x] #4 Clicking Apply creates correctionMark: strikethrough + → + green correction text inline
- [x] #5 Click outside popup dismisses without applying
- [x] #6 Popup positioned below selection (or above if no space below)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Log

### CorrectionPopup.tsx created (156 lines)
- Absolutely positioned popup with position prop from parent
- Input with autofocus on open, auto-clear on re-open
- Live preview: shows strikethrough original → green correction in real-time as you type
- Enter submits, Escape dismisses
- Click-outside detection with 50ms delay to avoid capturing triggering click
- Close button in header
- Apply button disabled when input empty
- All interactive elements have unique IDs

### CorrectionPopup.css created
- Floating card with 10px radius, 8px shadow, slide-in animation
- Preview area with f8fafc background
- Blue-focused input, green Apply button
- Responsive to content length via flex-wrap

### Integration notes
- Parent (EssayEditor → WritingGradingModal) manages isOpen state
- Parent receives onApply(correctionText) → calls editor.chain().setCorrectionMark({ correctionText }).run()
- Position calculated from editor coordsAtPos in parent

### Build: Zero new TS errors"
<!-- SECTION:NOTES:END -->

