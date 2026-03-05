---
id: faw3f0
title: Add landscape-safe textarea constraints
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - mobile
  - css
createdAt: '2026-02-28T17:01:15.927Z'
updatedAt: '2026-02-28T17:06:51.248Z'
timeSpent: 0
assignee: '@me'
---
# Add landscape-safe textarea constraints

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On landscape mobile (e.g., 667×375), the 300px `min-height` textarea + header (48px) + tabs (40px) + word counter (30px) = 418px, which overflows a 375px viewport. Need a landscape media query to reduce textarea min-height and ensure no overflow. Also adjust mobile prompt overlay `max-height` for landscape.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Textarea usable on landscape phone viewports (375px height)
- [x] #2 No content overflow or double scrollbar on landscape
- [x] #3 Mobile prompt overlay max-height adjusted for landscape
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `@media (max-height: 500px) and (orientation: landscape)` query to WritingTestPage.css
2. Reduce `.wtp-editor-textarea { min-height }` to ~150px in landscape
3. Adjust `.wtp-prompt-mobile-content { max-height }` to 50vh in landscape
4. Add same landscape handling to WritingPracticeView.css

Files: `src/components/writing-student/WritingTestPage.css`, `src/components/writing-practice/WritingPracticeView.css`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
✅ Added `@media (max-width: 900px) and (max-height: 500px) and (orientation: landscape)` to both WritingTestPage.css and WritingPracticeView.css. Textarea min-height reduced to 120px, header shrunk to 40px, prompt overlay max-height set to 50vh.
<!-- SECTION:NOTES:END -->

