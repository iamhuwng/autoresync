---
id: yyockc
title: Create ieltsWritingBandCalculator.test.ts — unit tests for band calculator
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-1
  - tests
  - band-calculator
  - new-file
createdAt: '2026-02-27T20:02:45.129Z'
updatedAt: '2026-02-27T22:23:57.611Z'
timeSpent: 0
parent: u64tmq
---
# Create ieltsWritingBandCalculator.test.ts — unit tests for band calculator

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create src/utils/ieltsWritingBandCalculator.test.ts covering roundDownToHalf, roundOverallBand, calculateTaskBand, calculateOverallBand with edge cases including voided tasks, single-task format, and partial grading.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tests for roundDownToHalf with 5 cases
- [ ] #2 Tests for roundOverallBand with 4 cases
- [ ] #3 Tests for calculateTaskBand with sample scores
- [ ] #4 Tests for voided task exclusion
- [ ] #5 Tests for all-tasks-voided returns 0
- [ ] #6 All tests pass via npx jest
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create test file 2. Tests for roundDownToHalf: 6.25->6.0, 6.5->6.5, 6.75->6.5 3. Tests for roundOverallBand: 6.25->6.5, 6.24->6.0 4. Tests for calculateTaskBand with sample scores 5. Tests for calculateOverallBand full test 6. Tests for voided tasks and edge cases 7. Run npx jest
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Unit tests placed alongside source file. Run with npx jest path. These validate IELTS-official rounding rules.
<!-- SECTION:NOTES:END -->

