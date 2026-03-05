---
id: 73iuco
title: Update routeSecurity.ts — add security config for new routes
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-1
  - routing
  - security
  - modify-file
  - safety-rule-1
createdAt: '2026-02-27T20:02:49.327Z'
updatedAt: '2026-02-27T22:24:30.924Z'
timeSpent: 0
parent: u64tmq
---
# Update routeSecurity.ts — add security config for new routes

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update src/config/routeSecurity.ts  add security config for 4 new writing routes following existing teacher route patterns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Security config for all 4 writing routes
- [ ] #2 Follows existing pattern
- [ ] #3 Correct role assignments
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Open routeSecurity.ts 2. Study existing patterns 3. Add 4 entries 4. Set roles: teacher for builder, teacher+super_admin for grading
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Safety Rule 1: must be done alongside routes.ts. Grading routes allow teacher and super_admin.
<!-- SECTION:NOTES:END -->

