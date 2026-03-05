---
id: 7ghrg1
title: Update TestBuilderRouter.tsx — enable Writing skill
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-2
  - routing
  - modify-file
  - safety-rule-8
createdAt: '2026-02-27T20:03:05.642Z'
updatedAt: '2026-02-27T22:26:33.461Z'
timeSpent: 0
parent: hf16fy
---
# Update TestBuilderRouter.tsx — enable Writing skill

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update TestBuilderRouter.tsx  set Writing in skillAvailability to available:true, component:WritingTestBuilder, status:production. Add lazy import.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Writing skill set to available:true
- [ ] #2 Component and status configured
- [ ] #3 Writing tests creatable via skill selection
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add lazy import 2. Update skillAvailability for Writing 3. Verify rendering
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Safety Rule 8: component must be imported AND rendered. Follow existing skill entry pattern.
<!-- SECTION:NOTES:END -->

