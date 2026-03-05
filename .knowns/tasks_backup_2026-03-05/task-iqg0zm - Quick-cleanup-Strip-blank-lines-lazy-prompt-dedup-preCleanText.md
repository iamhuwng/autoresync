---
id: iqg0zm
title: 'Quick cleanup — Strip blank lines, lazy prompt, dedup preCleanText'
status: done
priority: medium
labels:
  - from-spec
  - refactor
createdAt: '2026-03-04T04:06:34.232Z'
updatedAt: '2026-03-04T15:43:00.074Z'
timeSpent: 41683
assignee: '@me'
spec: specs/thcs-parser-decomposition
fulfills:
  - AC-1
  - AC-12
  - AC-13
---
# Quick cleanup — Strip blank lines, lazy prompt, dedup preCleanText

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three zero-risk cosmetic/minor fixes to the main parser file.

- **FR-1**: Strip ~130 double-blank-line runs from `parseThcsDocument` (L158-434)
- **FR-7**: Move `THCS_AI_PROMPT` import from module scope to dynamic `import()` inside `parseThcsText`
- **FR-6**: Add `alreadyCleaned` parameter to `parseThcsTextDirect` so the paste-text reconciliation path skips redundant `preCleanText()`
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Remove all double-blank-line runs from parseThcsDocument (L158-434)
- [x] #2 Move THCS_AI_PROMPT to dynamic import() inside parseThcsText
- [x] #3 Add alreadyCleaned parameter to parseThcsTextDirect, skip preCleanText when true
- [x] #4 Update parseThcsText reconciliation call to pass alreadyCleaned: true
- [x] #5 npx tsc --noEmit passes cleanly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. **FR-1: Strip blank lines** from parseThcsDocument (L158-434)
   - Collapse consecutive blank lines to max 1
   - ~270 lines → ~140 lines

2. **FR-7: Lazy-load AI prompt** (L446)
   - Remove static `import THCS_AI_PROMPT from './thcs-ai-extraction-prompt.txt?raw'`
   - Add dynamic `const { default: THCS_AI_PROMPT } = await import('./thcs-ai-extraction-prompt.txt?raw')` inside parseThcsText before L824

3. **FR-6: Deduplicate preCleanText** (L1221-1230)
   - Add `alreadyCleaned?: boolean` parameter to parseThcsTextDirect
   - When true, skip preCleanText call and use rawText directly
   - Update reconciliation call in parseThcsText L885 to pass cleaned text + alreadyCleaned: true

4. **Verify**: npx tsc --noEmit passes
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-03-04)

### AC1: Strip blank lines ✅
- Removed 8 double-blank-line runs from thcsDocumentParser.service.ts
- File reduced from 846 → 838 lines
- Verified: 0 consecutive blank lines remaining

### AC2: Lazy AI prompt import ✅
- Already implemented in prior session (line 438 uses dynamic `await import()`)
- No changes needed

### AC3: alreadyCleaned parameter ✅
- Already implemented in prior session on `parseThcsTextRegex` (line 773)
- Note: `parseThcsTextDirect` from original spec doesn't exist; the actual function is `parseThcsTextRegex` which already has the parameter

### AC4: Reconciliation passes alreadyCleaned ✅
- Already implemented — both fallback (line 471) and reconciliation (line 480) pass `alreadyCleaned: true`

### AC5: tsc --noEmit ✅
- No TypeScript errors in thcsDocumentParser.service.ts
- Pre-existing errors in other files (AccessControlWrapper, ProfilePage, invitationService) are unrelated
<!-- SECTION:NOTES:END -->

