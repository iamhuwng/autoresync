---
id: 71xjnx
title: Create ieltsWritingBandCalculator.ts — band score calculation utilities
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-1
  - utils
  - band-calculator
  - new-file
createdAt: '2026-02-27T20:02:43.801Z'
updatedAt: '2026-02-27T22:23:54.406Z'
timeSpent: 0
parent: u64tmq
---
# Create ieltsWritingBandCalculator.ts — band score calculation utilities

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create src/utils/ieltsWritingBandCalculator.ts with 4 functions: roundDownToHalf, roundOverallBand, calculateTaskBand, calculateOverallBand. Implements exact IELTS rounding rules from PRD 4.1.3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 File at src/utils/ieltsWritingBandCalculator.ts
- [ ] #2 roundDownToHalf rounds DOWN to nearest 0.5
- [ ] #3 roundOverallBand rounds UP from remainder >=0.25
- [ ] #4 calculateTaskBand averages 4 criteria then rounds down
- [ ] #5 calculateOverallBand uses 1/3 + 2/3 weighting for full test
- [ ] #6 Voided tasks filtered out before calculation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create file 2. roundDownToHalf: Math.floor(value*2)/2 3. roundOverallBand: remainder >=0.25 rounds up 4. calculateTaskBand: avg 4 criteria, apply roundDownToHalf 5. calculateOverallBand: weighted avg for full test 6. Handle voided tasks 7. JSDoc all functions
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Per-task: round DOWN (6.25->6.0). Overall: round UP from >=0.25 (6.25->6.5). Task 1 uses TA field, Task 2 uses TR field. All tasks voided = returns 0.
<!-- SECTION:NOTES:END -->

