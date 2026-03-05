---
id: cijjj3
title: Create useExternalPastePrevention.ts — paste/drop blocking hook
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-3
  - hook
  - student
  - security
  - paste-prevention
  - new-file
createdAt: '2026-02-27T20:03:11.111Z'
updatedAt: '2026-02-27T23:02:08.115Z'
timeSpent: 30
parent: fbtwz4
---
# Create useExternalPastePrevention.ts — paste/drop blocking hook

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create useExternalPastePrevention.ts  returns pasteAttemptCount and attachToTextarea function. Copy/cut sets lastInternalCopy. Paste checks against lastInternalCopy within 60s. Drop always blocked. Input monitoring for >10 char insertions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Returns pasteAttemptCount and attachToTextarea
- [x] #2 Internal copy/paste allowed
- [x] #3 External paste blocked with toast
- [x] #4 Drop events blocked
- [x] #5 attachToTextarea returns cleanup function
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/hooks/useExternalPastePrevention.ts 2. Track lastInternalCopy on copy/cut 3. Paste handler: compare clipboard to lastInternalCopy 4. Drop handler: preventDefault 5. Input monitoring: >10 chars without copy flag 6. Return cleanup function from attachToTextarea
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
60s window for internal copy. >10 char threshold for IME compatibility. Best-effort ~95%. pasteAttemptCount stored in submission. Used by both live session and solo practice.

All ACs verified. useExternalPastePrevention.ts fully implemented: returns {pasteAttemptCount, attachToTextarea}. Internal copy/paste tracked via lastInternalCopyRef with 60s window. External paste blocked with red toast + counter increment. Drop events blocked with amber toast. attachToTextarea returns cleanup function removing all listeners. No TS errors.
<!-- SECTION:NOTES:END -->

