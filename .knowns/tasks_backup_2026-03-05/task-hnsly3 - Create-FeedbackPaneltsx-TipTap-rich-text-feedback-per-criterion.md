---
id: hnsly3
title: Create FeedbackPanel.tsx — TipTap rich text feedback per criterion
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - component
  - teacher
  - grading
  - feedback
  - tiptap
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:03:36.537Z'
updatedAt: '2026-02-27T22:30:21.609Z'
timeSpent: 0
parent: jtjism
---
# Create FeedbackPanel.tsx — TipTap rich text feedback per criterion

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create FeedbackPanel.tsx  TipTap rich text editor for per-criterion feedback. Extensions: StarterKit, Color, TextStyle, Highlight, Underline. Toolbar: bold, italic, underline, lists, highlight, text color. Content stored as HTML string.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TipTap editor with all extensions
- [ ] #2 Toolbar with all formatting options
- [ ] #3 Content returned as HTML string
- [ ] #4 One instance per criterion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-grading/FeedbackPanel.tsx + CSS 2. Initialize TipTap with extensions 3. Build toolbar 4. Wire onChange 5. Handle initial value
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TipTap ONLY here for teacher feedback. HTML stored in Firestore as-is. One instance per criterion plus general feedback.
<!-- SECTION:NOTES:END -->

