---
id: kttjez
title: Fix preCleanText Marker Preservation
status: done
priority: high
labels:
  - from-spec-v2
  - foundation
createdAt: '2026-03-04T22:45:42.564Z'
updatedAt: '2026-03-04T23:16:34.505Z'
timeSpent: 1476
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-2
order: 1
---
# Fix preCleanText Marker Preservation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the `**` stripping regex on lines 405-406 in `thcsDocumentParser.service.ts`. Preserve `**bold**`, `__underline__`, and `{{}}` markers through pre-clean. This is a confirmed active bug — the `preCleanText` function currently destroys formatting markers that the external prompt specifically asks the AI to preserve.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **bold** markers pass through preCleanText unchanged
- [x] #2 __underline__ markers pass through unchanged
- [x] #3 {{}} markers pass through unchanged
- [x] #4 Unit test covers all 3 marker types
- [x] #5 Order: 1 (start here)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### 1. Fix `preCleanText()` (line 395-396)
- Remove `.replace(/\\*\\*(.*?)\\*\\*/g, '$1')` (line 395) — destroys **bold**
- Remove `.replace(/\\*(.*?)\\*/g, '$1')` (line 396) — destroys *italic*
- Keep all other cleaning rules (cite markers, markdown headers, whitespace normalization)

### 2. Fix `parseThcsTextRegex()` fallback (line 792-793)
- Same two regexes duplicated here — remove both
- Keep other cleaning rules (cite, headers, table rows, horizontal rules)

### 3. Verify no other stripping
- `__underline__` — NOT stripped anywhere (confirmed) ✅
- `{{}}` — NOT stripped anywhere (confirmed) ✅

### 4. Create unit test
- Create `src/services/test-creation/thcsDocumentParser.service.test.ts`
- Test: `**bold**` passes through `preCleanText` unchanged
- Test: `__underline__` passes through unchanged
- Test: `{{target_word}}` passes through unchanged
- Test: cite markers ARE still stripped
- Test: markdown headers ARE still stripped
- Test: triple+ newlines ARE still normalized

### Files changed
- `src/services/test-creation/thcsDocumentParser.service.ts` (lines 395-396, 792-793)
- `src/services/test-creation/thcsDocumentParser.service.test.ts` (NEW)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Removed 2 regex lines from `preCleanText()` (line 395-396): `**bold**` and `*italic*` stripping
- Removed same 2 lines from `parseThcsTextRegex()` fallback (line 792-793)
- Added explanatory comments noting markers are intentionally preserved (AC-2)
- Created unit test with 13 cases: 6 marker preservation + 5 cleaning verification + 2 edge cases
- All tests pass (vitest, 4ms)
<!-- SECTION:NOTES:END -->

