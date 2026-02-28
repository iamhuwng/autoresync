---
id: 15ujyy
title: Create AnnotationToolbar.tsx — text annotation tools
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - component
  - teacher
  - grading
  - annotations
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:03:33.599Z'
updatedAt: '2026-02-27T22:30:12.247Z'
timeSpent: 0
parent: jtjism
---
# Create AnnotationToolbar.tsx — text annotation tools

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create AnnotationToolbar.tsx  floating toolbar on text selection in essay. Tools: highlight, comment, strikethrough, correction, text color with category-based colors. Custom categories from writingAnnotationService. Creates annotation with startOffset, endOffset, type, color, categoryId.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Floating toolbar on text selection
- [ ] #2 5 annotation types supported
- [ ] #3 Custom categories loaded
- [ ] #4 Creates annotation with offset positions
- [ ] #5 Hides on deselection
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-grading/AnnotationToolbar.tsx + CSS 2. Detect text selection via window.getSelection 3. Position toolbar near selection 4. Render tool buttons 5. Load custom categories 6. Create annotation on click 7. Hide on deselection
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Offsets are character positions in plain text. Multiple annotations can overlap. Comment has additional text field. Categories from annotationService.
<!-- SECTION:NOTES:END -->

