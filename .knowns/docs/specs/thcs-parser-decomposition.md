---
title: THCS Parser Decomposition
createdAt: '2026-03-04T03:45:48.896Z'
updatedAt: '2026-03-04T04:07:16.167Z'
description: >-
  Specification for decomposing thcsDocumentParser.service.ts into focused
  modules, consolidating redundant reclassification logic, extracting shared
  JSON repair utilities, and improving reconciliation accuracy.
tags:
  - spec
  - approved
---
## Overview

After extracting the type classifier (261 lines) and draft converter (593 lines) from the original 2,984-line monolith, `thcsDocumentParser.service.ts` is now 1,896 lines with 30 functions — still too large and with structural issues identified in the pipeline assessment.

This spec addresses ALL identified issues from the pipeline assessment:
- **2 Critical Issues** (C1: parseThcsTextDirect too large, C2: fragile reconciliation matching)
- **5 Medium Issues** (M1-M5: duplicate reclassification, duplicate extractJSON, blank line inflation, double preCleanText, module-scope prompt)
- **4 Opportunities** (O1-O4: extract sub-functions, shared JSON repair, consolidate reclassification, strip blank lines)
- **Redundancy Resolution**: 5-site classification problem → consolidated into 2 authoritative functions in the classifier module

**7 Functional Requirements** (FR-1 through FR-7) covering all issues:

| FR | Assessment Items | Summary |
|----|-----------------|---------|
| FR-1 | M3, O4 | Strip blank lines from parseThcsDocument |
| FR-2 | M2, O2 | Extract JSON repair to shared module |
| FR-3 | C1, O1 | Decompose parseThcsTextDirect into sub-functions |
| FR-4 | M1, O3, Redundancy §4 | Consolidate ALL reclassification into classifier |
| FR-5 | C2 | Fix reconciliation matching (Q# overlap) |
| FR-6 | M4 | Deduplicate preCleanText call |
| FR-7 | M5 | Lazy-load AI prompt |

**Scope**: Internal refactoring only. No external API changes, no new features, no UI changes. All 3 consumer imports (`THCSDocumentUpload`, `THCSSetupStep`, `THCSTestEditorPage`) remain unchanged.
## Source Files

| File | Role | Current Lines |
|------|------|:---:|
| `src/services/test-creation/thcsDocumentParser.service.ts` | Main parser, AI pipeline, orchestration | 1,896 |
| `src/services/test-creation/thcs-type-classifier.ts` | Instruction-to-type classification (Layer 2) | 261 |
| `src/services/test-creation/thcs-draft-converter.ts` | ParsedTest → THCSDraft conversion | 593 |
| `src/services/ai/groq.provider.ts` | Has duplicate `extractJSON` implementation | ~1,700 |

### New files to create:
| File | Purpose |
|------|---------|
| `src/services/test-creation/ai-json-repair.ts` | Shared JSON repair utilities (P1) |

## Requirements

### Functional Requirements

- FR-1: **Strip blank lines** from `parseThcsDocument` function (L158-434). The function has ~130 blank lines from a copy-paste artifact, inflating it to ~270 lines when it should be ~140.
- FR-2: **Extract JSON repair utilities** (`sanitizeJsonControlChars`, `aggressiveJsonRepair`, `repairTruncatedJson`, `extractJSON`) into a shared `ai-json-repair.ts` module. Both `thcsDocumentParser.service.ts` and `groq.provider.ts` should import from this shared module instead of maintaining duplicate implementations.
- FR-3: **Decompose `parseThcsTextDirect`** (currently ~460 lines, L1213-1676) into focused sub-functions:
  - `splitContentFromAnswerKey(lines)` — Stage 2: finds answer key boundary
  - `splitIntoSections(contentLines)` — Stage 4: PART/sub-section detection
  - `parseQuestionsInSection(section, lines)` — Stage 5: MCQ/writing/fill-in question parsing
  - `assemblePassages(sections)` — Stage 6: passage text extraction
  - The main `parseThcsTextDirect` function should become a ~50-line orchestrator calling these sub-functions.
- FR-4: **Consolidate ALL type reclassification into the classifier module** — Eliminate the 5-site classification problem by establishing a single flow:
  - **`validateAIResult()`** becomes a **pure structure normalizer** — ONLY normalizes fields, fills defaults, normalizes answer key. NO type logic (remove the `extractExplicitTypeTag` call at L670, the sentence-rewrite→closest-meaning check at L692-706, and the word-bank reclassification at L711-726).
  - **`classifyQuestionTypes()`** in classifier module becomes the **sole authority** for type assignment. It already handles Phase 0 (`[TYPE:xxx]` tags), Phase 1 (instruction regex), Phase 2 (combined text).
  - **`reclassifyByContent()`** in classifier module absorbs the reclassification patterns currently duplicated in `validateAIResult()`:
    - Pattern 5 (NEW): sentence-rewrite with 4 MCQ options + A-D answer → closest-meaning
    - Pattern 6 (NEW): reading-cloze-mcq with word-bank instruction/passage → reading-cloze-wordbank (strip hallucinated options)
  - **`convertParsedToThcsDraft()`** safety net at converter L80-95: downgrade to `console.warn()` only (log but don't reclassify). The classifier already handles it.
  - **Result**: Classification happens at exactly 2 sites: `classifyQuestionTypes()` + `reclassifyByContent()`, both in the classifier module.
- FR-5: **Improve reconciliation matching** — Replace section name equality matching (`s.name === regexSection.name`, L904) with question-number range overlap matching. This prevents silent question drops when AI and regex produce different section names for the same content.
- FR-6: **Deduplicate `preCleanText` call** — In the paste-text path, `preCleanText()` is called once in `parseThcsText` (L812) before AI, then again inside `parseThcsTextDirect` (L1230) during reconciliation. Since the cleaning is idempotent, the second call is wasted work. Solution: `parseThcsTextDirect` should accept an optional `alreadyCleaned` parameter, or `preCleanText` should be a no-op on already-cleaned text (add a sentinel marker).
- FR-7: **Lazy-load AI prompt** — The AI prompt is currently loaded at module scope (`import THCS_AI_PROMPT from '...?raw'` at L447) but only used by `parseThcsText`. Move the import inside `parseThcsText` using dynamic `import()` to avoid bundling it when only the file-upload path is used.
### Non-Functional Requirements

- NFR-1: **Zero breaking changes** — All 3 consumer imports must work identically before and after.
- NFR-2: No new npm dependencies.
- NFR-3: TypeScript must compile cleanly (no new errors introduced).
- NFR-4: Target main file size: ≤1,200 lines after all extractions (currently 1,896).
- NFR-5: Each extracted sub-function should be independently unit-testable.

## Acceptance Criteria

- [x] AC-1: `parseThcsDocument` function has no double-blank-line runs (≤1 blank line between code blocks).
- [x] AC-2: `ai-json-repair.ts` exists and exports `sanitizeJsonControlChars`, `aggressiveJsonRepair`, `repairTruncatedJson`, `extractJSON`.
- [x] AC-3: Both `thcsDocumentParser.service.ts` and `groq.provider.ts` import JSON repair utilities from `ai-json-repair.ts` instead of defining their own.
- [x] AC-4: `parseThcsTextDirect` is ≤80 lines and calls at least 3 extracted sub-functions.
- [x] AC-5: `validateAIResult()` contains ZERO type classification or reclassification logic — no calls to `extractExplicitTypeTag`, no sentence-rewrite→closest-meaning checks, no word-bank reclassification.
- [x] AC-6: `reclassifyByContent()` in `thcs-type-classifier.ts` contains ≥6 patterns, including the 2 patterns migrated from `validateAIResult` (MCQ-on-writing → closest-meaning, word-bank → reading-cloze-wordbank).
- [x] AC-7: `convertParsedToThcsDraft()` safety net at L80-95 only logs a `console.warn()` and does NOT mutate `effectiveType`.
- [x] AC-8: Reconciliation matching in `parseThcsText` uses question-number range overlap instead of `s.name ===` equality.
- [x] AC-9: `thcsDocumentParser.service.ts` is ≤1,200 lines total.
- [x] AC-10: `npx tsc --noEmit` produces no new TypeScript errors in the 3 parser files + shared module.
- [x] AC-11: All 3 external consumer imports (`THCSDocumentUpload`, `THCSSetupStep`, `THCSTestEditorPage`) remain unchanged and functional.
- [x] AC-12: `preCleanText` is called exactly once per parse operation in the paste-text path (not twice).
- [x] AC-13: `THCS_AI_PROMPT` is NOT imported at module scope; it is loaded lazily inside `parseThcsText` only when needed.
## Scenarios

### Scenario 1: JSON Repair Shared Module (FR-2)
**Given** a malformed AI JSON response with control characters, truncated brackets, and trailing commas
**When** `extractJSON()` from `ai-json-repair.ts` processes it
**Then** it produces the same output as the current inline `extractJSON()` in `thcsDocumentParser.service.ts`

### Scenario 2: Decomposed `parseThcsTextDirect` (FR-3)
**Given** a raw Vietnamese THCS test with PART A (phonetics), PART B (grammar, reading), PART C (writing), and an answer key
**When** `parseThcsTextDirect(rawText)` is called
**Then** it produces the same `ParsedTest` output as before the decomposition (identical sections, questions, answer key, warnings)

### Scenario 3: Consolidated Reclassification — Single Authority (FR-4)
**Given** an AI result with a section classified as `sentence-rewrite` but all questions have 4 MCQ options and A-D answers
**When** the result passes through `validateAIResult()` → `classifyQuestionTypes()` → `reclassifyByContent()` → converter
**Then** `validateAIResult()` does NOT change the type (pure normalizer), `reclassifyByContent()` reclassifies to `closest-meaning` (sole authority), and the converter only logs a warning if it still sees a mismatch (no mutation)

### Scenario 4: Consolidated Reclassification — Word Bank (FR-4)
**Given** an AI result with a section classified as `reading-cloze-mcq` but the instruction text mentions "word(s) in the box"
**When** the result passes through `validateAIResult()` → `classifyQuestionTypes()` → `reclassifyByContent()`
**Then** `validateAIResult()` does NOT reclassify (pure normalizer), `reclassifyByContent()` detects the word-bank pattern and reclassifies to `reading-cloze-wordbank`, stripping hallucinated MCQ options

### Scenario 5: Improved Reconciliation Matching (FR-5)
**Given** an AI section named "PHONETICS" and a regex section named "Part A: PHONETICS" both containing questions 1-2
**When** the reconciliation step runs in `parseThcsText`
**Then** the sections are correctly matched by question number overlap, not by name equality, and questions 1-2 are included in the reconciled output

## Technical Notes

### Redundancy Resolution Map

The assessment identified classification logic scattered across 5 sites. Here's the exact resolution:

| Classification Site | Current Location | After Refactoring |
|---|---|---|
| Site 1: AI `[TYPE:xxx]` tags | AI prompt output | Unchanged (source of truth from AI) |
| Site 2: `extractExplicitTypeTag()` in `validateAIResult` | L670 | **REMOVED** — classifier Phase 0 handles this |
| Site 3: sentence-rewrite→closest-meaning in `validateAIResult` | L692-706 | **MOVED** to `reclassifyByContent()` Pattern 5 |
| Site 3: word-bank reclassification in `validateAIResult` | L711-726 | **MOVED** to `reclassifyByContent()` Pattern 6 |
| Site 4: `classifyQuestionTypes()` | classifier module | Unchanged (sole authority for Phase 0/1/2) |
| Site 5: `reclassifyByContent()` | classifier module | **EXPANDED** with Patterns 5-6 from validateAIResult |
| Safety net: converter L80-95 | `convertParsedToThcsDraft` | **DOWNGRADED** to `console.warn()` only |

**After refactoring**: All type logic flows through exactly 2 functions in `thcs-type-classifier.ts`:
1. `classifyQuestionTypes()` — initial classification (tags, regex)
2. `reclassifyByContent()` — content-based correction (6+ patterns)

### Medium Issues Resolution

| Issue | Solution |
|---|---|
| M1: Duplicate reclassification | FR-4: consolidate into classifier module |
| M2: Duplicate extractJSON | FR-2: shared `ai-json-repair.ts` |
| M3: Excessive blank lines | FR-1: strip from parseThcsDocument |
| M4: preCleanText double call | FR-6: skip cleaning on already-clean input |
| M5: Module-scope AI prompt | FR-7: lazy import inside parseThcsText |

### Files to modify:
1. **`thcsDocumentParser.service.ts`** — FR-1 (strip blanks), FR-2 (extract JSON repair), FR-3 (decompose parseThcsTextDirect), FR-4 (strip type logic from validateAIResult), FR-5 (fix reconciliation), FR-6 (deduplicate preCleanText), FR-7 (lazy AI prompt)
2. **`groq.provider.ts`** — FR-2: replace inline JSON repair with import from shared module
3. **`thcs-type-classifier.ts`** — FR-4: add Patterns 5-6 to `reclassifyByContent()`, accept `instructionText` parameter for word-bank detection
4. **`thcs-draft-converter.ts`** — FR-4: downgrade safety-net reclassification to warning-only
5. **`ai-json-repair.ts`** *(new)* — FR-2: shared JSON repair utilities

### Integration Safety Rules triggered:
- **Rule #15**: No Mantine imports (N/A — no UI changes)
- **Rule #17**: Producer-Consumer Contract — `reclassifyByContent` expanding its patterns changes when `ParsedSection.detectedType` gets modified. All downstream consumers (converter, renderer) must still handle the same set of types.

### Recommended implementation order:
1. FR-1 (P0): Strip blank lines — 5 min, zero risk
2. FR-7 (P0): Lazy AI prompt — 5 min, zero risk
3. FR-6 (P0): Deduplicate preCleanText — 10 min, zero risk
4. FR-2 (P1): Extract JSON repair — 30 min, low risk
5. FR-4 (P3): Consolidate reclassification — 45 min, medium risk
6. FR-5 (P4): Fix reconciliation matching — 1 hr, medium risk
7. FR-3 (P2): Decompose parseThcsTextDirect — 1-2 hr, highest risk (largest change)
### Scenario 7: Lazy AI Prompt Loading (FR-7)
**Given** a file upload via `parseThcsDocument(file)`
**When** the module is loaded
**Then** the THCS AI prompt text is NOT loaded into memory (it's only needed for the paste-text path via `parseThcsText`)

### Scenario 8: Regression — File Upload Path (all FRs)
**Given** a .txt file containing a complete THCS test
**When** `parseThcsDocument(file)` is called
**Then** the output `ParsedTest` is identical to the pre-refactoring output (same sections, types, confidences, answers)
## Technical Notes

### Files to modify:
1. **`thcsDocumentParser.service.ts`** — Strip blank lines (FR-1), extract JSON repair (FR-2), decompose `parseThcsTextDirect` (FR-3), consolidate reclassification (FR-4), improve reconciliation (FR-5)
2. **`groq.provider.ts`** — Replace inline JSON repair with import from shared module (FR-2)
3. **`thcs-type-classifier.ts`** — Add consolidated reclassification patterns from `validateAIResult` (FR-4)
4. **`thcs-draft-converter.ts`** — Remove or downgrade safety-net reclassification to warning-only (FR-4)
5. **`ai-json-repair.ts`** *(new)* — Shared JSON repair utilities (FR-2)

### Integration Safety Rules triggered:
- **Rule #15**: No Mantine imports (N/A — no UI changes)
- **Rule #17**: Producer-Consumer Contract — changing `reclassifyByContent` behavior may affect downstream consumers of `ParsedSection.detectedType`

### Recommended implementation order:
1. P0 (FR-1): Strip blank lines — 5 min, zero risk
2. P1 (FR-2): Extract JSON repair — 30 min, low risk
3. P3 (FR-4): Consolidate reclassification — 45 min, medium risk
4. P4 (FR-5): Fix reconciliation matching — 1 hr, medium risk
5. P2 (FR-3): Decompose `parseThcsTextDirect` — 1-2 hr, highest risk (largest change)

## Open Questions

- [ ] Should `preCleanText` be extracted to its own utility file or kept in the main parser? It's only 14 lines but called from 2 entry points. (Leaning: keep inline — too small to justify a file.)
- [ ] Should `reclassifyByContent()` need the full section's `instructionText` to detect word-bank patterns (currently in `validateAIResult` it reads `s.instructionText`)? If so, the function signature needs to change from `(sections)` to also pass instruction context. (Leaning: it already receives `ParsedSection[]` which includes `instructionText` — no signature change needed.)
- [ ] When decomposing `parseThcsTextDirect` (FR-3), should the sub-functions be module-level functions or class methods? (Leaning: module-level, consistent with current codebase style.)
