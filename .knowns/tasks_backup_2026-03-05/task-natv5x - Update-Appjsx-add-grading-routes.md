---
id: natv5x
title: Update App.jsx — add grading routes
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - routing
  - modify-file
  - safety-rule-1
createdAt: '2026-02-27T20:03:45.237Z'
updatedAt: '2026-02-27T22:31:33.711Z'
timeSpent: 0
parent: jtjism
---
# Update App.jsx — add grading routes

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update App.jsx  add lazy imports and routes for WritingGradingQueuePage and WritingGradingPage. Both wrapped in PrivateRoute with teacher role and ErrorBoundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Lazy imports for both pages
- [ ] #2 Queue and detail routes registered
- [ ] #3 PrivateRoute with teacher role
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add lazy imports 2. Add queue route 3. Add detail route with :submissionId 4. Wrap with PrivateRoute + ErrorBoundary
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Safety Rule 1: paths match routes.ts. Placed after existing teacher routes.
<!-- SECTION:NOTES:END -->

