---
id: ujov0v
title: Create WritingEditor.tsx — plain textarea with word counter
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - component
  - student
  - editor
  - new-file
  - no-mantine
  - gap-09
createdAt: '2026-02-27T20:03:09.745Z'
updatedAt: '2026-02-27T22:58:51.224Z'
timeSpent: 94
parent: fbtwz4
---
# Create WritingEditor.tsx — plain textarea with word counter

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingEditor.tsx  plain textarea with spellCheck=false, min-height 400px, Inter 16px, line-height 1.8. Live word counter via regex. GAP-09: paste prevention hook must be called inside useEffect, return attachToTextarea directly as cleanup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Plain textarea with spellCheck=false
- [x] #2 Word counter using regex split
- [x] #3 GAP-09: attachToTextarea called inside useEffect
- [x] #4 Min-height 400px, Inter 16px, line-height 1.8
- [x] #5 Disabled state when disabled prop is true
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-student/WritingEditor.tsx + CSS 2. Render textarea with spellCheck=false 3. Add word counter 4. Wire paste prevention in useEffect (GAP-09) 5. Style with Inter font
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-09 CRITICAL: attachToTextarea MUST be in useEffect. Return value IS the cleanup. No format buttons. Undo/redo via native Ctrl+Z.

All ACs verified against existing implementation. WritingEditor.tsx already fully implemented with: plain textarea (spellCheck=false), word counter using regex split, paste prevention via useEffect with attachToTextarea (GAP-09 compliant), min-height 400px + Inter 16px + line-height 1.8 in CSS, disabled state support. No TS errors.
<!-- SECTION:NOTES:END -->

