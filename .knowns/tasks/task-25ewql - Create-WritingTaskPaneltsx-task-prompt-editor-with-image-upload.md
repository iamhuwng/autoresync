---
id: 25ewql
title: Create WritingTaskPanel.tsx — task prompt editor with image upload
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-2
  - component
  - teacher
  - builder
  - new-file
  - r2-storage
  - no-mantine
createdAt: '2026-02-27T20:02:58.880Z'
updatedAt: '2026-02-27T22:25:43.273Z'
timeSpent: 0
parent: hf16fy
---
# Create WritingTaskPanel.tsx — task prompt editor with image upload

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create WritingTaskPanel.tsx  task type dropdown, prompt textarea with 2000 char counter, image upload for Task 1 only via r2StorageService.uploadImage, URL paste option, word minimum defaults (150/250), model answer section. NEVER use Firebase Storage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Image upload via r2StorageService only
- [ ] #2 Prompt textarea limited to 2000 chars with counter
- [ ] #3 Image section only for Task 1
- [ ] #4 Word min defaults: 150 Task1, 250 Task2
- [ ] #5 Model answer with visibility checkbox
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/components/writing-builder/WritingTaskPanel.tsx 2. Task type dropdown 3. Prompt textarea with counter 4. Image section for Task 1 only 5. R2 upload via r2StorageService 6. Word min defaults: 150 Task1, 250 Task2 7. Model answer + visibility checkbox
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CRITICAL: import r2StorageService from services/r2Storage  NOT imageUploadService. _imageKey is UI-only, stripped on publish. Task 2 has NO image upload.
<!-- SECTION:NOTES:END -->

