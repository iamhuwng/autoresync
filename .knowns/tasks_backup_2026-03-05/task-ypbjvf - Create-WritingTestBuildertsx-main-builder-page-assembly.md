---
id: ypbjvf
title: Create WritingTestBuilder.tsx — main builder page assembly
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-2
  - page
  - teacher
  - builder
  - new-file
  - gap-06
  - gap-07
  - safety-rule-6
createdAt: '2026-02-27T20:03:01.551Z'
updatedAt: '2026-02-27T22:25:57.061Z'
timeSpent: 0
parent: hf16fy
---
# Create WritingTestBuilder.tsx — main builder page assembly

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingTestBuilder.tsx main page. GAP-07: useParams draftId. GAP-06: auto-save debounce with useRef not useState. Task panels shown/hidden by format using display:none CSS. Edit mode loads draft on mount.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Uses useParams for draftId (GAP-07)
- [ ] #2 Auto-save uses useRef not useState (GAP-06)
- [ ] #3 Hidden panels use display:none not unmount
- [ ] #4 Edit mode loads draft on mount
- [ ] #5 Save status indicator shown
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/pages/WritingTestBuilder.tsx + CSS 2. Get draftId from useParams 3. Layout: header + metadata + tasks + validation 4. Format-based visibility via display:none 5. Auto-save with useRef timer 6. Edit mode: load draft on mount 7. Wire publish button
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-06: useRef for timer  Safety Rule 6. GAP-07: param is draftId. Hidden panels preserve state. Save status: idle/saving/saved/error.
<!-- SECTION:NOTES:END -->

