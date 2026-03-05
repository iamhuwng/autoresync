---
id: 977jsb
title: Fix reconciliation matching — Q# range overlap
status: done
priority: high
labels:
  - from-spec
  - refactor
createdAt: '2026-03-04T04:06:49.903Z'
updatedAt: '2026-03-04T10:20:18.722Z'
timeSpent: 0
spec: specs/thcs-parser-decomposition
fulfills:
  - AC-8
---
# Fix reconciliation matching — Q# range overlap

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
FR-5: Replace fragile section name equality matching (`s.name === regexSection.name`, L904) with question-number range overlap. Build a mapping of regex section → AI section by comparing which question numbers they each contain, instead of relying on name strings matching exactly. This prevents silent question drops when AI and regex produce different section names for the same content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Replace s.name === regexSection.name with Q# range overlap logic
- [ ] #2 Build regex→AI section map using question number set intersection
- [ ] #3 Verify empty regex sections still fall back correctly
- [ ] #4 Verify ≥80% threshold check still applies
- [ ] #5 npx tsc --noEmit passes cleanly
- [ ] #6 1,2,3,4,5
<!-- AC:END -->

