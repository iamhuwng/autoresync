---
id: rkow2c
title: Update StudentPracticePage.tsx — add Writing branch
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-7
  - routing
  - modify-file
  - safety-rule-8
  - gap-13
  - no-mantine
createdAt: '2026-02-27T20:04:01.625Z'
updatedAt: '2026-02-28T02:58:49.984Z'
timeSpent: 118
parent: 6emz0n
---
# Update StudentPracticePage.tsx — add Writing branch

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update StudentPracticePage.tsx  add case Writing that renders WritingPracticeView. Lazy import. Suspense with CSS spinner (no Mantine/LoadingState). Follow existing skill routing pattern.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Writing case renders WritingPracticeView
- [x] #2 Lazy import with CSS spinner
- [x] #3 Existing skill cases preserved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add lazy import 2. Add Writing case 3. Wrap in Suspense with CSS spinner 4. Pass testData and materialId 5. Preserve existing cases
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow existing skill case pattern. GAP-13: no Mantine in Suspense. Safety Rule 8: must be rendered.

Implemented 2026-02-28: Added Writing branch to StudentPracticePage. Reads skill field from RTDB alongside testType. When IELTS+Writing detected, loads full test data and renders WritingPracticeView via lazy import with Suspense + CSS spinner. Existing IELTS/THCS branches preserved. Zero TS errors.
<!-- SECTION:NOTES:END -->

