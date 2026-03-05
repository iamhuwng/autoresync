---
id: ojiaca
title: Fix submit button mobile rendering
status: done
priority: high
labels:
  - prd-0030
  - ielts-writing
  - mobile
  - bug-fix
createdAt: '2026-02-28T17:01:14.587Z'
updatedAt: '2026-02-28T17:06:44.656Z'
timeSpent: 170
assignee: '@me'
---
# Fix submit button mobile rendering

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CSS `.wtp-submit-btn-header span { display: none }` targets a `<span>` that doesn't exist in the JSX. The button renders `📤 Submit Test` as a single text node, so the text is never hidden on mobile. Need to wrap text in `<span>` and keep only the icon visible on mobile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 "Submit Test" text wrapped in <span> in WritingTestPage.tsx
- [x] #2 On mobile (<768px), only the 📤 icon visible, text hidden
- [x] #3 Button still functional (click triggers submit modal)
- [x] #4 Desktop view unchanged (icon + text both visible)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Edit WritingTestPage.tsx line ~285: wrap button text in `<span>` so CSS can target it
2. Verify existing CSS `.wtp-submit-btn-header span { display: none }` now works
3. Test desktop (text + icon visible) and mobile (icon only)

Files: `src/components/writing-student/WritingTestPage.tsx` (line 285)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
✅ Wrapped button text in <span> at line 285. CSS rule `.wtp-submit-btn-header span { display: none }` now correctly targets the text. Icon emoji rendered outside span so it stays visible on mobile.
<!-- SECTION:NOTES:END -->

