---
id: uogvtt
title: Update TestPageRouter.tsx — add Writing case with lazy import
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - routing
  - modify-file
  - gap-13
  - safety-rule-8
  - no-mantine
createdAt: '2026-02-27T20:03:20.293Z'
updatedAt: '2026-02-27T23:25:30.224Z'
timeSpent: 44
parent: fbtwz4
---
# Update TestPageRouter.tsx — add Writing case with lazy import

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update TestPageRouter.tsx  add case Writing with lazy import. Fetch test from RTDB tests/testId (same as THCS pattern). GAP-13: Suspense fallback uses pure CSS spinner  NOT Mantine Center/Loader or LoadingState component.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Lazy import for WritingTestPage
- [x] #2 Case Writing fetches from RTDB
- [x] #3 Suspense fallback uses pure CSS spinner
- [x] #4 Does NOT use LoadingState component
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add lazy import for WritingTestPage 2. Add case Writing 3. Fetch from RTDB 4. Wrap in Suspense with CSS spinner 5. Pass testData and sessionCode props
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GAP-13: Mantine ban absolute  even LoadingState wraps Mantine. Use pure CSS spinner pattern already used in 3+ places. THCS pattern at line ~86.

All ACs verified. TestPageRouter.tsx has: lazy import for WritingTestPage (L26), case 'Writing' fetches full test from RTDB tests/{testId} (L118-124), Suspense fallback uses pure CSS spinner with @keyframes spin (L196-201, GAP-13 compliant), does NOT use LoadingState or Mantine for the Writing case. Note: existing loading/error/THCS states still use Mantine Center/Loader  separate cleanup task.
<!-- SECTION:NOTES:END -->

