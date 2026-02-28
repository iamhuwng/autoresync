---
id: 2l06ua
title: Create ielts-writing.types.ts — all Writing interfaces from PRD §4.1
status: done
priority: medium
labels:
  - prd-0030
  - ielts-writing
  - phase-1
  - types
  - data-model
  - new-file
createdAt: '2026-02-27T20:02:42.442Z'
updatedAt: '2026-02-27T22:23:48.125Z'
timeSpent: 0
parent: u64tmq
---
# Create ielts-writing.types.ts — all Writing interfaces from PRD §4.1

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create src/types/ielts-writing.types.ts with all interfaces from PRD 4.1.1 and 4.1.2. Import MaterialSoloConfig from solo.types.ts. Copy exact definitions  do NOT modify field names or types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 File at src/types/ielts-writing.types.ts
- [ ] #2 All type/interface names match PRD exactly
- [ ] #3 MaterialSoloConfig imported from solo.types
- [ ] #4 WritingSubmission self-contained with embedded prompts
- [ ] #5 Criteria scores typed as whole numbers 0-9
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create file 2. Add WritingTask1Type, WritingTask2Type unions 3. Add WritingTask, WritingTestFormat, WritingTestMetadata, IELTSWritingTest, WritingTestDraft 4. Add WritingSubmission, WritingSubmissionTask 5. Add WritingGradingResult, WritingTaskGradingResult 6. Add WritingAnnotation, AnnotationCategory, WritingGradingAudit 7. Export all
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Type foundation  all files import from here. Task 1 uses TA, Task 2 uses TR  different criteria names. WritingSubmission is self-contained with embedded task prompts. Criteria scores are whole numbers 0-9 only. AnnotationCategory stored at users/teacherId/settings/writingAnnotationCategories.
<!-- SECTION:NOTES:END -->

