---
id: l0x7tz
title: Fix comment editor list formatting regression
status: done
priority: high
labels:
  - bugfix
  - ielts-writing
  - writing-grading
  - feedback-editor
createdAt: '2026-04-05T07:33:47.026Z'
updatedAt: '2026-04-05T07:46:34.668Z'
timeSpent: 750
---
# Fix comment editor list formatting regression

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore working bullet and numbered list toggles in the IELTS writing grading comment editor, verify with targeted tests, and update records as needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User clarified the broken list controls are in the comment editor, not the feedback editor. Redirecting investigation to CommentComposer.
Investigation found that TabbedFeedbackEditor still has local bullet-list coverage and explicit list-marker CSS, but the live grading page also renders feedback through `RichContent` in review mode without corresponding `.wgp-rich-copy` list styling. The current toolbar preserves selection only on `mousedown`, so pointer-input selection loss remains a plausible live-path regression even though the component-level bullet-list test still passes.
Patched CommentComposer to preserve editor selection on toolbar mousedown, added explicit list styling for comment-editor `ul`/`ol`/`li`, and added focused regression tests for bullet and numbered list toggles under controlled rerender.
Focused comment-editor regression fix implemented in CommentComposer. Toolbar buttons now preserve the editor selection on mousedown before applying list/formatting commands, the composer CSS explicitly renders `ul`/`ol` markers, and new CommentComposer tests cover both bullet and ordered list persistence under controlled rerender.
Verification completed successfully. `cmd /c npx vitest run src/components/writing-grading/CommentComposer.test.tsx --reporter=basic`, `cmd /c npm run check:utf8 -- src/components/writing-grading/CommentComposer.tsx src/components/writing-grading/CommentComposer.css src/components/writing-grading/CommentComposer.test.tsx`, and `cmd /c npm run build` all passed after the comment-editor fix.
<!-- SECTION:NOTES:END -->

