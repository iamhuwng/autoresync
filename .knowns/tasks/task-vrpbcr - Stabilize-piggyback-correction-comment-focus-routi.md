---
id: vrpbcr
title: Stabilize piggyback correction comment focus routing
status: done
priority: high
labels:
  - bug
  - ielts-writing
  - grading
  - comments
createdAt: '2026-04-06T09:07:31.070Z'
updatedAt: '2026-04-06T09:12:47.463Z'
timeSpent: 249
---
# Stabilize piggyback correction comment focus routing

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix the teacher IELTS writing grading flow where comments created from the correction popup do not behave like normal comment-rail items when clicked on the original selected text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Inspected the piggyback correction-comment flow and found duplicated comment-focus logic in WritingGradingPage. Consolidated essay click, gutter click, and sidebar focus into one canonical focusCommentInRail helper that resolves the anchor snapshot consistently and dismisses an open correction popup when the teacher switches into comment-rail interaction. Added a page-level regression test that opens the correction popup, clicks the piggyback comment path, and verifies the comment rail receives focus with the captured anchor while the correction popup closes.
No root architecture amendment was needed because the existing IELTS writing contracts already define piggyback comments as normal comment-rail items and keep correction interaction separate from comment-rail routing. This pass brings the page orchestration back into alignment with that existing contract.
Updated the root IELTS writing grading compatibility note and the matching Knowns architecture record to document the canonical piggyback comment focus transition after correction-created comments are clicked from the essay.
<!-- SECTION:NOTES:END -->

