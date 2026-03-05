---
id: zvb73g
title: Consolidate reclassification into classifier module
status: done
priority: high
labels:
  - from-spec
  - refactor
createdAt: '2026-03-04T04:06:45.349Z'
updatedAt: '2026-03-04T10:31:24.762Z'
timeSpent: 0
spec: specs/thcs-parser-decomposition
fulfills:
  - AC-5
  - AC-6
  - AC-7
---
# Consolidate reclassification into classifier module

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
FR-4: Eliminate the 5-site classification problem.

1. Strip ALL type logic from `validateAIResult()` — make it a pure structure normalizer (remove `extractExplicitTypeTag` call at L670, sentence-rewrite→closest-meaning check at L692-706, word-bank reclassification at L711-726)
2. Move the 2 reclassification patterns into `reclassifyByContent()` as Patterns 5-6
3. Downgrade converter safety net (converter L80-95) to `console.warn()` only — no mutation
4. Ensure AI path calls `classifyQuestionTypes()` + `reclassifyByContent()` after `validateAIResult()`
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Remove extractExplicitTypeTag call from validateAIResult (L670)
- [ ] #2 Remove sentence-rewrite→closest-meaning check from validateAIResult (L692-706)
- [ ] #3 Remove word-bank reclassification from validateAIResult (L711-726)
- [ ] #4 Add Pattern 5 to reclassifyByContent: sentence-rewrite + MCQ options → closest-meaning
- [ ] #5 Add Pattern 6 to reclassifyByContent: cloze-mcq + word bank → reading-cloze-wordbank
- [ ] #6 Downgrade converter safety net to console.warn only (no type mutation)
- [ ] #7 Add classifyQuestionTypes() + reclassifyByContent() call after validateAIResult in AI path
- [ ] #8 npx tsc --noEmit passes cleanly
- [ ] #9 1,2,3,4,5,6,7,8
<!-- AC:END -->

