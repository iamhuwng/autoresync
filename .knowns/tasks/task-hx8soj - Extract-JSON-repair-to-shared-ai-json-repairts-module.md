---
id: hx8soj
title: Extract JSON repair to shared ai-json-repair.ts module
status: done
priority: medium
labels:
  - from-spec
  - refactor
createdAt: '2026-03-04T04:06:41.049Z'
updatedAt: '2026-03-04T10:14:21.948Z'
timeSpent: 0
spec: specs/thcs-parser-decomposition
fulfills:
  - AC-2
  - AC-3
---
# Extract JSON repair to shared ai-json-repair.ts module

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
FR-2: Extract `sanitizeJsonControlChars`, `aggressiveJsonRepair`, `repairTruncatedJson`, `extractJSON` from `thcsDocumentParser.service.ts` (L448-637) into a new `src/services/test-creation/ai-json-repair.ts`. Update both `thcsDocumentParser.service.ts` and `groq.provider.ts` to import from the shared module instead of maintaining duplicate implementations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Create src/services/test-creation/ai-json-repair.ts with 4 exported functions
- [ ] #2 Replace inline definitions in thcsDocumentParser.service.ts with imports
- [ ] #3 Replace inline definitions in groq.provider.ts with imports
- [ ] #4 Verify both THCS and IELTS parsing produce identical results
- [ ] #5 npx tsc --noEmit passes cleanly
- [ ] #6 1,2,3,5
<!-- AC:END -->

