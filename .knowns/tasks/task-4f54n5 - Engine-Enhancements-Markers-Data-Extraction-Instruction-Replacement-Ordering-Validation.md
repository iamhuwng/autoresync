---
id: 4f54n5
title: >-
  Engine Enhancements: Markers, Data Extraction, Instruction Replacement,
  Ordering, Validation
status: done
priority: medium
labels:
  - from-spec-v2
  - engine
createdAt: '2026-03-04T22:45:57.351Z'
updatedAt: '2026-03-05T02:13:12.196Z'
timeSpent: 1034
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-15
  - AC-17
  - AC-18
  - AC-19
  - AC-20
order: 5
---
# Engine Enhancements: Markers, Data Extraction, Instruction Replacement, Ordering, Validation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
5 engine capabilities: (1) marker conversion for `{{target_word}}` → `underlinedParts` + verify existing, (2) `[WORD BANK:]` → `wordBank`/`blankMapping` and `(N điểm)` → point allocation, (3) instruction replacement — type slug → `INSTRUCTION_TEMPLATES` lookup (deterministic, no AI), (4) section ordering by Vietnamese curriculum, (5) post-parse validation + `warnings[]`. Also: AI tag consumption (`[AI-INFERRED]`, `[UNCERTAIN]`, `[COMPROMISED]`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 {{target_word}} → underlinedParts on question object
- [x] #2 {{phoneme}} → optionUnderlines (verify existing)
- [x] #3 {{error}} → underlinedParts (verify existing)
- [x] #4 [WORD BANK:] → wordBank array + blankMapping
- [x] #5 (N điểm) → per-section point allocation (fallback: 10/total)
- [x] #6 Instruction replacement: type slug → INSTRUCTION_TEMPLATES after type finalization
- [x] #7 Section ordering by curriculum (Pronunciation→Stress→Grammar→Fill-in→Reading→Writing)
- [x] #8 Post-parse validation: 0 Qs error, numbering gaps, answer coverage, passage, cloze, writing
- [x] #9 [AI-INFERRED]/[UNCERTAIN]/[COMPROMISED] tag consumption → data model fields
- [x] #10 All tags stripped from display text after consumption
- [x] #11 Order: 1 (no dependencies)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Existing vs New Assessment

The `thcs-draft-converter.ts` (592 lines) already handles:
- ✅ `{{phoneme}}` → `optionUnderlines` (line 132-139) — AC-2 verify
- ✅ `{{error}}` → `underlinedParts` (line 144-151) — AC-3 verify
- ✅ `{{target_word}}` → `underlinedParts` for synonym/antonym (line 156-161) — AC-1 verify
- ✅ `[WORD BANK:]` → `wordBank`/`blankMapping` (line 324-399) — AC-4 verify
- ✅ `(N)______` blanks → cloze mapping (line 353-371)

Missing (all NEW code to add):
- ❌ `(N điểm)` point extraction — AC-5
- ❌ Instruction replacement — AC-6
- ❌ Section ordering — AC-7
- ❌ Post-parse validation — AC-8
- ❌ AI tag consumption — AC-9
- ❌ Tag stripping — AC-10

### Architecture Decision
Rather than bloating `thcs-draft-converter.ts` further, create a **new engine enhancement module** that runs as post-processing steps. The converter already does the ParsedTest→THCSDraft mapping; the enhancements operate on the *input* (ParsedTest) before conversion and on the *output* (THCSDraft) after.

### New file
`src/services/test-creation/thcs-engine-enhancements.ts`

### Functions

#### 1. `extractPointAllocation(sectionName: string): number | null` (FR-18)
- Regex: `/\((\d+(?:\.\d+)?)\s*điểm\)/i`
- Returns numeric value or null
- Also strips the tag from the section name for display

#### 2. `applyPointAllocation(sections, totalQuestions): void` (FR-18)
- For each section: check `extractPointAllocation(section.name)`
- If found: use that for section points, calculate per-question: `sectionPoints / questionCount`
- If NOT found: fall back to `10 / totalQuestions` (existing behavior)
- Modifies sections in-place

#### 3. `replaceInstructions(sections): void` (FR-17)
- For each section: look up `ALL_INSTRUCTION_TEMPLATES[section.defaultQuestionType]`
- If match found AND `section.isCustomInstruction === false`: replace `instructionText`
- Skip if teacher has customized the instruction
- Import `ALL_INSTRUCTION_TEMPLATES` from `thcs-test.types.ts`

#### 4. `sortSectionsByCurriculum(sections): typeof sections` (FR-16)
- Define curriculum order map:
  ```typescript
  const CURRICULUM_ORDER: Record<string, number> = {
    'pronunciation': 1,
    'word-stress': 2,
    'mcq-grammar': 3,
    'mcq-vocabulary': 3,
    'mcq-sign-notice': 3,
    'dialogue-response': 3,
    'verb-form': 4,
    'word-form': 4,
    'reading-cloze-wordbank': 4,
    'reading-announcement': 5,
    'reading-comprehension': 5,
    'reading-cloze-mcq': 5,
    'sentence-arrangement': 6,
    'closest-meaning': 6,
    'sentence-rewrite': 6,
    'sentence-rewrite-keyword': 6,
    'error-identification': 3,
    'synonym-mcq': 3,
    'antonym-mcq': 3,
    'word-reference': 5,
  };
  ```
- Stable sort: sections with curriculum position sort by that; sections without preserve original relative order
- Returns new sorted array (does not mutate)

#### 5. `consumeAITags(sections): AITagConsumptionResult` (FR-14)
- Scan all question texts, options, passage content for:
  - `[AI-INFERRED]` → set `answerSource: 'ai-inferred'` on question, strip tag
  - `[UNCERTAIN]` → add to section's `warnings[]`, strip tag
  - `[COMPROMISED: old → new]` → set `compromised: true`, `originalType`, `convertedType` on section, strip tag
- Returns `{ inferredCount, uncertainCount, compromisedSections[] }` for diagnostics

#### 6. `stripDisplayTags(sections): void` (FR-14, FR-17)
- Final pass: remove any remaining `[TYPE: ...]`, `[STATS: ...]`, `[AI-INFERRED]`, `[UNCERTAIN]`, `[COMPROMISED: ...]` tags from ALL text fields
- Also strip `(N điểm)` from section name display text
- Ensures no pipeline-internal markers leak to the student/teacher UI

#### 7. `validateParsedOutput(result): PostParseWarning[]` (FR-19)
- Returns array of warnings (not errors — pipeline should not crash):
  ```typescript
  interface PostParseWarning {
    severity: 'error' | 'warning';
    code: string;
    message: string;
    sectionIndex?: number;
    questionNumber?: number;
  }
  ```
- Checks:
  - `ZERO_QUESTIONS`: total questions = 0 → error
  - `NUMBERING_GAP`: unexpected gaps in sequential question numbers → warning
  - `MISSING_ANSWER`: question has no correctAnswer AND no answerSource:'ai-inferred' → warning
  - `READING_NO_PASSAGE`: reading section has empty passage.content → warning
  - `CLOZE_NO_BLANKS`: cloze section has no numbered blanks → warning
  - `WRITING_NO_ARROW`: writing question has no originalSentence or sentenceStarter → warning

#### 8. `runEngineEnhancements(sections, totalQuestions)` — Orchestrator
Runs all enhancements in correct order:
1. `consumeAITags(sections)` — extract tags before any other processing
2. `applyPointAllocation(sections, totalQuestions)` — must run before instruction replacement
3. `replaceInstructions(sections)` — after type finalization
4. `sortSectionsByCurriculum(sections)` — reorder
5. `stripDisplayTags(sections)` — final cleanup
6. `validateParsedOutput(result)` — quality check
Returns `{ sections, warnings, tagStats }`.

### Integration point
Called from `convertParsedToThcsDraft()` — after the existing conversion logic, before returning. The orchestrator receives the converted sections and applies enhancements.

### Existing code changes
- `thcs-draft-converter.ts` line 579-590: Add call to `runEngineEnhancements()` before return
- Verify existing marker conversion (AC-1,2,3) still works — add inline comments noting "verified per AC-X"

### Files changed
- `src/services/test-creation/thcs-engine-enhancements.ts` (NEW — ~250 lines)
- `src/services/test-creation/thcs-draft-converter.ts` (minor — add orchestrator call + type imports)

### Dependencies
- `ALL_INSTRUCTION_TEMPLATES` from `thcs-test.types.ts` (existing export)
- No new external dependencies
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Created `thcs-engine-enhancements.ts` (~408 lines)
- ACs 1-4 (marker conversion): Verified existing in thcs-draft-converter.ts lines 132-399
  - AC-1: {{target_word}} → underlinedParts (line 156-161) ✓
  - AC-2: {{phoneme}} → optionUnderlines (line 132-139) ✓
  - AC-3: {{error}} → underlinedParts (line 144-151) ✓
  - AC-4: [WORD BANK:] → wordBank/blankMapping (line 324-399) ✓
- ACs 5-10 (new code):
  - AC-5: (N điểm) → extractPointAllocation() + applyPointAllocation()
  - AC-6: replaceInstructions() using ALL_INSTRUCTION_TEMPLATES lookup
  - AC-7: sortSectionsByCurriculum() with 20-type CURRICULUM_ORDER map
  - AC-8: validateParsedOutput() with 6 check types (ZERO_QUESTIONS, NUMBERING_GAP, MISSING_ANSWER, READING_NO_PASSAGE, CLOZE_NO_BLANKS, WRITING_NO_ARROW)
  - AC-9: consumeAITags() for [AI-INFERRED]/[UNCERTAIN]/[COMPROMISED]
  - AC-10: stripDisplayTags() with 8 pipeline-internal tag patterns
- Orchestrator: runEngineEnhancements() runs all 7 steps in correct order
- 24 unit tests passing
- Zero TypeScript errors
<!-- SECTION:NOTES:END -->

