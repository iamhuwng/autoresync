---
id: ntpo2o
title: Create annotationRenderer.ts + AnnotatedEssayRenderer.tsx — shared rendering
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - component
  - utils
  - teacher
  - grading
  - annotations
  - new-file
  - shared
createdAt: '2026-02-27T20:03:35.148Z'
updatedAt: '2026-02-27T22:30:18.510Z'
timeSpent: 0
parent: jtjism
---
# Create annotationRenderer.ts + AnnotatedEssayRenderer.tsx — shared rendering

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create annotationRenderer.ts utility and AnnotatedEssayRenderer.tsx component. Renderer: plain text + annotations array produces styled HTML spans. Handles overlapping annotations by splitting at boundaries. Click annotation shows details.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Boundary splitting handles overlapping annotations
- [ ] #2 Each annotation type styled correctly
- [ ] #3 Click on annotation shows details
- [ ] #4 Supports text selection for new annotations
- [ ] #5 Shared between grading and results views
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/utils/annotationRenderer.ts 2. Boundary splitting: collect offsets, sort, create segments 3. Create src/components/writing-grading/AnnotatedEssayRenderer.tsx 4. Render styled spans 5. Click handlers for details 6. Selection support for new annotations
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Boundary splitting: collect unique offsets, sort, create segments between pairs. Used in BOTH grading (editable) and results (read-only). Strikethrough=line-through, Highlight=yellow bg.
<!-- SECTION:NOTES:END -->

