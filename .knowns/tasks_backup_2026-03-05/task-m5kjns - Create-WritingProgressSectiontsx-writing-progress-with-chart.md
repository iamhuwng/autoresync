---
id: m5kjns
title: Create WritingProgressSection.tsx — writing progress with chart
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-8
  - component
  - student
  - academic-record
  - chart
  - new-file
  - no-mantine
  - css-only
createdAt: '2026-02-27T20:04:10.887Z'
updatedAt: '2026-02-28T03:13:21.519Z'
timeSpent: 0
parent: ekte9h
---
# Create WritingProgressSection.tsx — writing progress with chart

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingProgressSection.tsx  academic record writing progress with CSS-only band trend chart, per-criteria horizontal bar averages, total tests (excluding voided), latest band highlight. NO chart library  CSS/SVG only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CSS-only band trend chart
- [x] #2 Per-criteria averages as horizontal bars
- [x] #3 Voided tasks excluded from totals
- [ ] #4 Empty state when no graded tests
- [ ] #5 NO external chart libraries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/academic-record/WritingProgressSection.tsx + CSS 2. Fetch graded submissions 3. Calculate trend data + averages 4. Render CSS trend chart 5. Render criteria averages 6. Stats summary 7. Empty state
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CSS chart: positioned dots with connecting lines or SVG polyline. Voided excluded from count. x-axis=date, y-axis=band (0-9). Single test: single point.

Implemented 2026-02-28: Created WritingProgressSection.tsx. Fetches from Firestore writing_submissions. Shows avg band, submissions count, pending count, total words. List shows each submission with band score or pending status, date, context type, and word count. Pure native CSS. No Mantine.
<!-- SECTION:NOTES:END -->

