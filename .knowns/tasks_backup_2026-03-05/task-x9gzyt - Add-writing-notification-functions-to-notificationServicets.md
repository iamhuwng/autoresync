---
id: x9gzyt
title: Add writing notification functions to notificationService.ts
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-8
  - services
  - notifications
  - modify-file
  - safety-rule-11
createdAt: '2026-02-27T20:04:09.418Z'
updatedAt: '2026-02-28T03:17:55.132Z'
timeSpent: 69
parent: ekte9h
---
# Add writing notification functions to notificationService.ts

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add 5 writing notification functions to notificationService.ts: notifyWritingSubmitted, notifyWritingGraded, notifyWritingPartiallyGraded, notifyWritingReopened, notifyWritingReGraded. ALL wrapped in withRestoreGuard. Follow existing notification patterns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 5 notification functions added
- [x] #2 All wrapped in withRestoreGuard
- [x] #3 Follow existing notification patterns
- [x] #4 Correct notification messages
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Open notificationService.ts 2. Study existing patterns 3. Add 5 new functions 4. Wrap each in withRestoreGuard 5. Export all
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Safety Rule 11: withRestoreGuard on ALL notification writes. Notifications to correct RTDB paths. notifyWritingPartiallyGraded for single-task graded in full test.

Implemented 2026-02-28: Added 5 writing notification functions to notificationService.ts. All use createNotification (already withRestoreGuard). Functions: notifyWritingSubmitted, notifyWritingGraded, notifyWritingPartiallyGraded, notifyWritingReopened, notifyWritingReGraded. All follow existing notification patterns with proper messages, metadata, and links.
<!-- SECTION:NOTES:END -->

