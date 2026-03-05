---
id: e75n4p
title: Update App.jsx — add WritingTestBuilder routes
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-2
  - routing
  - modify-file
  - safety-rule-1
  - safety-rule-8
createdAt: '2026-02-27T20:03:04.325Z'
updatedAt: '2026-02-27T22:26:24.422Z'
timeSpent: 0
parent: hf16fy
---
# Update App.jsx — add WritingTestBuilder routes

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update App.jsx  add lazy import for WritingTestBuilder and 2 routes (create + edit) wrapped in PrivateRoute allowedRoles teacher and ErrorBoundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Lazy import added
- [ ] #2 Create and edit routes registered
- [ ] #3 PrivateRoute with teacher role
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add lazy import 2. Add create route 3. Add edit route with :draftId 4. Wrap with PrivateRoute + ErrorBoundary
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Safety Rule 1: paths match routes.ts. Use PrivateRoute  NOT TeacherGuard. Safety Rule 8: component must be rendered.
<!-- SECTION:NOTES:END -->

