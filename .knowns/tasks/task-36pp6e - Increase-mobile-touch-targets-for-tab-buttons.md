---
id: 36pp6e
title: Increase mobile touch targets for tab buttons
status: done
priority: low
labels:
  - prd-0030
  - ielts-writing
  - mobile
  - accessibility
createdAt: '2026-02-28T17:01:16.220Z'
updatedAt: '2026-02-28T17:06:57.499Z'
timeSpent: 0
assignee: '@me'
---
# Increase mobile touch targets for tab buttons

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tab buttons currently have `8px 16px` padding on mobile, giving ~36px touch height. Apple HIG recommends minimum 44px touch targets. Increase padding to meet accessibility standards. Affects both WritingTestPage and WritingPracticeView tabs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tab buttons have ≥44px touch height on mobile
- [x] #2 Visual appearance still clean (no oversized look)
- [x] #3 Both WritingTestPage and WritingPracticeView tabs updated
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update `.wtp-tab` mobile padding to `12px 16px` (gives ~44px height)
2. Update `.wpv-tab` mobile padding similarly
3. Test on mobile viewport to verify touch targets

Files: `src/components/writing-student/WritingTestPage.css`, `src/components/writing-practice/WritingPracticeView.css`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
✅ Updated `.wtp-tab` and `.wpv-tab` in mobile media query: padding 12px 16px + min-height 44px + display flex + align-items center. Landscape override reduces to 32px min-height since landscape has less vertical space.
<!-- SECTION:NOTES:END -->

