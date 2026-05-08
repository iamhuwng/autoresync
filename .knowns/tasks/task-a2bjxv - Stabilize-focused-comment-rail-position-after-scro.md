---
id: a2bjxv
title: Stabilize focused comment rail position after scroll
status: done
priority: high
labels:
  - ielts-writing
  - grading
  - comments
  - stability
createdAt: '2026-04-06T08:21:01.459Z'
updatedAt: '2026-04-06T08:24:19.992Z'
timeSpent: 92
---
# Stabilize focused comment rail position after scroll

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Freeze focused comment rail alignment to the captured anchor at focus time so the Comments rail does not keep moving when the essay/page scrolls without a new comment interaction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Focused comment rail alignment is captured once at focus time and does not drift when anchor positions refresh due to scroll.
- [x] #2 Sidebar-origin comment focus captures the current anchor snapshot instead of falling back to live anchor updates.
- [x] #3 Regression coverage proves a focused comment keeps the same rail transform after anchorPositions change without a new focus action.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced the likely root cause in code: CommentSidebar still accepts live anchor fallback for a focused comment, and WritingGradingPage clears the focused anchor snapshot on sidebar focus. This allows subsequent anchor refresh to move the rail again even though the user has not selected another comment.
Implemented a root-cause fix for drifting comment-rail movement after focus. WritingGradingPage now captures the current comment anchor viewport top when a comment is focused from the sidebar instead of clearing the snapshot, and CommentSidebar now treats focusedCommentAnchorViewportTop as the sole source of truth for an already-focused comment instead of falling back to live anchorPositions updates. Added a regression test that rerenders the sidebar with changed anchorPositions while keeping the same focused comment and captured anchor, proving the rail transform remains stable.
Updated the root IELTS writing grading architecture note and the matching Knowns architecture doc to record the focused-comment rail stability contract: once a comment is focused, its rail alignment anchor is a captured snapshot and must not drift under ordinary scroll until the teacher focuses another item.
<!-- SECTION:NOTES:END -->

