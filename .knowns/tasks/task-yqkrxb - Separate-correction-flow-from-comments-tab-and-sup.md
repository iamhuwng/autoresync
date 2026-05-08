---
id: yqkrxb
title: Separate correction flow from comments tab and support optional piggyback comment
status: done
priority: high
labels:
  - bugfix
  - ielts-writing
  - grading
  - annotations
createdAt: '2026-04-05T10:43:18.901Z'
updatedAt: '2026-04-05T13:54:04.981Z'
timeSpent: 3074
---
# Separate correction flow from comments tab and support optional piggyback comment

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refactor the IELTS writing grading editor so corrections no longer appear in or route through the Comments tab. Extend the correction popup to optionally create a normal comment anchored to the same selected text while preserving correction strikethrough/replacement behavior. Update tests and docs for the new interaction contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Corrections no longer render in or route through the Comments tab/sidebar
- [x] #2 Correction popup can optionally create a normal comment anchored to the same selected text when applying a correction
- [x] #3 Teachers can edit an existing correction even when the corrected range also has a comment mark
- [x] #4 Comment focus/highlight state and correction focus/highlight state are separated in the grading page/editor
- [x] #5 Targeted tests cover correction/comment overlap and the removal of correction-sidebar coupling
- [x] #6 Architecture docs are updated to reflect the new correction-vs-comment interaction contract
- [x] #7 Piggyback comments created from the correction popup anchor only the originally selected source text and never expand across the replacement text
- [x] #8 Correction/comment popups render outside the essay column clipping boundary and position freely relative to the viewport
- [x] #9 Comment hover tooltips position adjacent to the hovered annotation in a way that is visually and logically attributable to that comment
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Refactor comment sidebar and page focus state so corrections stop sharing the comment rail and comment-focused identity.
2. Extend the correction popup/page apply flow to accept an optional piggyback comment anchored to the selected source text.
3. Relax correction selection/apply guards so correction marks can coexist with comment marks on the same range.
4. Update targeted editor/sidebar tests for overlap behavior and removed correction-tab coupling.
5. Update architecture docs and task notes, then verify with targeted Vitest and a production build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the correction/comment interaction split in the IELTS Writing grading editor.

Code changes:
- Removed correction items from the Comments sidebar/cards so the rail is comment-only again.
- Added an optional piggyback comment field to the correction popup.
- Allowed same-range comment and correction marks to coexist intentionally.
- Split comment focus and correction focus in the page/editor so correction clicks no longer route through the Comments tab.
- Updated targeted editor/sidebar tests for overlap behavior and removed correction-rail coupling.
- Updated architecture docs to record the 2026-04-05 follow-up contract.

Verification:
- cmd /c npx vitest run src/components/writing-grading/EssayEditor.test.tsx --reporter=basic
- cmd /c npx vitest run src/components/writing-grading/CommentSidebar.test.tsx --reporter=basic
- cmd /c npm run check:utf8 -- src/components/writing-grading/CommentCard.tsx src/components/writing-grading/CommentSidebar.tsx src/components/writing-grading/CommentSidebar.test.tsx src/components/writing-grading/CorrectionPopup.tsx src/components/writing-grading/CorrectionPopup.css src/components/writing-grading/EssayEditor.tsx src/components/writing-grading/EssayEditor.test.tsx src/pages/WritingGradingPage.tsx
- cmd /c npm run build
Reopened: user clarified that the optional comment must anchor only the original selected text, and the comment popup/tooltip must escape essay-column visual clipping.
Follow-up fix after review: corrected the structural root causes rather than patching surface symptoms.
- The piggyback comment range model was left intact because persisted `anchorText/from/to` already points at the original source slice.
- Fixed the real overlap bug by making correction the dominant outer mark when comment and correction overlap, so comment styling no longer wraps the rendered replacement text.
- Moved essay hover/bubble overlays onto the same body-portal architecture already used by CorrectionPopup instead of trying to loosen card/editor overflow.

Verification follow-up:
- cmd /c npx vitest run src/components/writing-grading/EssayEditor.test.tsx --reporter=basic
- cmd /c npm run check:utf8 -- src/components/writing-grading/extensions/correctionMark.ts src/components/writing-grading/EssayEditor.tsx src/components/writing-grading/EssayEditor.test.tsx
- cmd /c npm run build
Reopened: mounting is fixed, but tooltip placement still feels detached from the hovered comment. Need a better positioning contract.
Tooltip placement follow-up:
- Reworked the essay comment hover tooltip heuristic so it chooses the nearest side-adjacent placement (right, left, bottom, top) from the hovered mark rectangle instead of a fixed left-aligned above/below rule.
- Added explicit placement state and tooltip attachment cues so the overlay reads as belonging to the hovered comment.

Verification follow-up:
- cmd /c npx vitest run src/components/writing-grading/EssayEditor.test.tsx
- cmd /c npm run check:utf8 -- src/components/writing-grading/EssayEditor.tsx src/components/writing-grading/EssayEditor.css src/components/writing-grading/EssayEditor.test.tsx
- cmd /c npm run build

Final documentation follow-up:
- Updated root architecture docs in `documentation/architecture/ielts-writing/contracts-and-governance.md`, `documentation/architecture/ielts-writing/essay-editor-tool-contract-and-mark-composition.md`, and `documentation/architecture/ielts-writing/grading-editor-state-and-compatibility.md` so the repo-level architecture notes match the final correction/comment separation, overlap ownership, and tooltip attachment contract.

Packaging follow-up:
- Prepared a selective git commit containing only the writing-grading code, root architecture docs, and matching Knowns records for this correction/comment decoupling change set.
<!-- SECTION:NOTES:END -->

