---
id: s8qlkz
title: Decompose parseThcsTextDirect into sub-functions
status: done
priority: medium
labels:
  - from-spec
  - refactor
createdAt: '2026-03-04T04:06:52.065Z'
updatedAt: '2026-03-04T10:38:40.783Z'
timeSpent: 0
spec: specs/thcs-parser-decomposition
fulfills:
  - AC-4
---
# Decompose parseThcsTextDirect into sub-functions

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
FR-3: Break the 460-line `parseThcsTextDirect` (L1213-1676) into focused sub-functions. Extract at minimum:
- `splitContentFromAnswerKey(lines)` — Stage 2: finds answer key boundary
- `splitIntoSections(contentLines)` — Stage 4: PART/sub-section detection
- `parseQuestionsInSection(section, lines)` — Stage 5: MCQ/writing/fill-in question parsing
- `assemblePassages(sections)` — Stage 6: passage text extraction

The main `parseThcsTextDirect` function should become a ≤80-line orchestrator. All sub-functions remain in the same file.

Depends on Tasks 1-4 being complete so line counts are stable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extract splitContentFromAnswerKey sub-function
- [ ] #2 Extract splitIntoSections sub-function
- [ ] #3 Extract parseQuestionsInSection sub-function
- [ ] #4 Extract assemblePassages sub-function (or equivalent)
- [ ] #5 parseThcsTextDirect is ≤80 lines orchestrator
- [ ] #6 All sub-functions are independently callable (no hidden state)
- [ ] #7 Parser output identical to pre-decomposition
- [ ] #8 npx tsc --noEmit passes cleanly
- [ ] #9 1,2,3,4,5,6,7,8
<!-- AC:END -->

