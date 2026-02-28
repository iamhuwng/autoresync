---
id: 3fvz39
title: 'Implement publish flow — validation, R2 image move, publish'
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-2
  - feature
  - teacher
  - builder
  - publish
  - r2-storage
createdAt: '2026-02-27T20:03:02.886Z'
updatedAt: '2026-02-27T22:26:21.374Z'
timeSpent: 0
parent: hf16fy
---
# Implement publish flow — validation, R2 image move, publish

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement publish flow in WritingTestBuilder: validate, move R2 temp images to permanent via r2StorageService.moveToPermanent, strip _imageKey, call publishWritingTest, show success dialog with 3 navigation options.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Validation blocks on errors, confirms on warnings
- [ ] #2 R2 temp images moved to permanent
- [ ] #3 _imageKey stripped before publish
- [ ] #4 Success dialog with 3 navigation options
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add publish handler 2. Run validation 3. Move R2 temp images to permanent 4. Strip _imageKey 5. Call publishWritingTest 6. Show success dialog
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
R2 temp to permanent is atomic per file. _imageKey is UI-only, never persisted. Success dialog: Start Session, Assign Homework, Go to Test List.
<!-- SECTION:NOTES:END -->

