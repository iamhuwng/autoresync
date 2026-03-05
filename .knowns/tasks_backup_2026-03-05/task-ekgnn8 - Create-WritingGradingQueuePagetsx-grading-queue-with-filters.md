---
id: ekgnn8
title: Create WritingGradingQueuePage.tsx — grading queue with filters
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - page
  - teacher
  - grading
  - queue
  - new-file
  - gap-04
  - no-mantine
createdAt: '2026-02-27T20:03:30.635Z'
updatedAt: '2026-02-27T22:29:40.107Z'
timeSpent: 0
parent: jtjism
---
# Create WritingGradingQueuePage.tsx — grading queue with filters

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingGradingQueuePage.tsx  table with Student Name, Test Title, Source, Task Count, Submitted At, Status badge, Word Count. GAP-04: getPendingSubmissions with single Firestore where + client filter. Click row navigates to grading detail.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Table with all required columns
- [ ] #2 GAP-04: single Firestore where + client filter
- [ ] #3 Client-side filters for source, status, class, date
- [ ] #4 Row click navigates to grading detail
- [ ] #5 Status badges with correct colors
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/pages/WritingGradingQueuePage.tsx + CSS 2. Fetch via getPendingSubmissions 3. Build filter state 4. Render table with columns 5. Row click navigation 6. Style status badges
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-04: single .where for markingStatus, client-side filter for teacher. Source from context.type. Badge: pending=orange, graded=green. Safety Rule 1: navigate via routes.ts.
<!-- SECTION:NOTES:END -->

