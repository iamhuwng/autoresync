---
id: 5nz744
title: Align pending comment composer with selected essay text
status: done
priority: high
labels:
  - bugfix
  - ielts-writing
  - comments
  - alignment
createdAt: '2026-04-05T17:06:03.683Z'
updatedAt: '2026-04-05T17:23:35.300Z'
timeSpent: 976
assignee: '@me'
---
# Align pending comment composer with selected essay text

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bring new comment creation onto the same comment-rail alignment contract as saved comments in the IELTS writing grading editor. The pending composer should open in Comments, stay parallel to the selected essay text, and participate in essay-order positioning instead of being appended and only scrolled into view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening a new comment from essay selection forces the Comments tab and aligns the pending composer parallel to the selected text
- [x] #2 The pending composer participates in essay-order positioning instead of always appending after saved comments
- [x] #3 Saved-comment focus alignment and existing draft safety rules continue to work without regression
- [x] #4 Targeted tests cover pending-composer alignment and ordering behavior
- [x] #5 Docs record the pending-composer rail contract if the interaction contract changes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the pending comment draft path so comment creation preserves the selected text's viewport anchor geometry when the comment action is triggered from the essay.
2. Refactor the Comments rail so a pending composer is treated as an ordered anchored rail item, not a footer block, and uses the same vertical alignment contract as focused saved comments.
3. Keep the existing click-on-comment-text behavior intact: force-open the Comments tab when needed and align the matching saved comment card against the essay anchor.
4. Add targeted tests for pending composer alignment/order plus saved-comment focus regression coverage.
5. Update the IELTS writing architecture docs and Knowns records if this changes the documented contract, then run task validation before closing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the pending-comment structural fix in the grading editor. The editor now preserves selection anchor viewport geometry when opening a new comment, pending drafts carry that anchor in draft state, and the Comments sidebar treats the pending composer as a first-class rail item ordered by canonical essay range instead of a footer block. Added targeted regression coverage in CommentSidebar.test.tsx and verified with targeted Vitest, UTF-8 checks, and a full production build.
<!-- SECTION:NOTES:END -->

