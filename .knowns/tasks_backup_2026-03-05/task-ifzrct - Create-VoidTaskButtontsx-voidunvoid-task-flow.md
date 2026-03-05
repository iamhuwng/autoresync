---
id: ifzrct
title: Create VoidTaskButton.tsx — void/unvoid task flow
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-5
  - component
  - teacher
  - grading
  - void
  - new-file
  - no-mantine
createdAt: '2026-02-27T20:03:39.351Z'
updatedAt: '2026-02-27T22:30:52.195Z'
timeSpent: 0
parent: jtjism
---
# Create VoidTaskButton.tsx — void/unvoid task flow

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create VoidTaskButton.tsx  toggle button for voiding/unvoiding a task. Confirmation dialog on void with clear message. No confirmation on unvoid. Voided tasks excluded from band calculation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Toggle between Void and Unvoid
- [ ] #2 Confirmation dialog on void action
- [ ] #3 No confirmation on unvoid
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create component 2. Render toggle based on isVoided 3. Add confirmation for void 4. Call onToggle
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Voided tasks: scores stored but excluded from calculation. Displayed as VOIDED in results. Dont count toward total test count in academic record.
<!-- SECTION:NOTES:END -->

