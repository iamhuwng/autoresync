---
id: wei3uc
title: Build Adaptive Prompt Builder
status: done
priority: high
labels:
  - from-spec-v2
  - core-module
createdAt: '2026-03-04T22:45:57.097Z'
updatedAt: '2026-03-05T01:57:50.446Z'
timeSpent: 1111
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-4
  - AC-5
  - AC-6
  - AC-7
  - AC-10
order: 4
---
# Build Adaptive Prompt Builder

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create `thcs-prompt-builder.ts` with: Fragment Registry (16 repair + 8 compromise templates), `buildRepairPrompt()` (assembles from relevant fragments + both texts + reasoning format), `buildCompromisePrompt()` (type-specific + originalInput + cross-reference), `parseAIRepairResponse()` (flexible delimiters, 5-field reasoning entries). Fragment version hashing for audit. `RepairAuditEntry` logging.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fragment registry: 16 repair + 8 compromise (instruction/example/constraint/priority)
- [x] #2 buildRepairPrompt() selects only relevant fragments, injects both texts
- [x] #3 buildCompromisePrompt() injects originalInput + cross-reference block
- [x] #4 parseAIRepairResponse() handles 4 delimiter patterns, 5 fields per entry
- [x] #5 Missing reasoning handled gracefully (entire response = fixed text)
- [x] #6 Fragment version hash computed and logged
- [x] #7 RepairAuditEntry logged per AI call
- [x] #8 Order: 1 (no dependencies)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### New file
`src/services/test-creation/thcs-prompt-builder.ts`

### Architecture
Three main sections: **Fragment Registry** (data), **Prompt Builders** (assembly), **Response Parsers** (extraction). Plus audit logging types.

---

### Section 1: Types & Interfaces

```typescript
// Issue codes from FR-3 (16 total)
type IssueCode =
  | 'MERGED_QUESTIONS' | 'MISSING_Q_PREFIX' | 'OPTIONS_INLINE'
  | 'COMPRESSED_ANSWER_KEY' | 'MISSING_ANSWER_KEY' | 'MISSING_TYPE_TAG'
  | 'TYPE_CONTENT_MISMATCH' | 'MISSING_PASSAGE_BLOCK' | 'PASSAGE_NO_PARAGRAPHS'
  | 'SECTION_NO_QUESTIONS' | 'AMBIGUOUS_SECTION_SPLIT' | 'NUMBERING_GAP'
  | 'BLANK_FORMAT_WRONG' | 'MISSING_BRACKETS' | 'MISSING_ARROW'
  | 'WORD_BANK_NOT_TAGGED';

// Unsupported types from FR-10 (7 compromisable + picture-description variant = 8)
type CompromiseRoute =
  | 'matching' | 'true-false' | 'translation' | 'matching-headings'
  | 'gap-fill-open' | 'word-ordering' | 'picture-description-mcq'
  | 'picture-description-open';

// Fragment shape
interface RepairFragment {
  issueCode: IssueCode;
  priority: number;           // 1-5 (1 = highest, fix first)
  instruction: string;        // What the AI should do
  example: string;            // Before/after example
  constraint: string;         // What NOT to do
}

interface CompromiseTemplate {
  sourceType: CompromiseRoute;
  targetType: string;         // THCSQuestionType slug to convert to
  instruction: string;        // How to convert
  example: string;            // Before/after
  constraint: string;         // What to preserve/avoid
  preserveFields: string[];   // Fields to keep from original
}

// Reasoning log entry (5 fields per FR-7)
interface ReasoningEntry {
  issueCode: string;
  action: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  originalRef: string;
}

// Parsed repair response
interface ParsedRepairResponse {
  fixedText: string;
  reasoningLog: ReasoningEntry[];
}

// Parsed compromise response
interface ParsedCompromiseResponse {
  convertedText: string;
  reasoning: {
    originalType: string;
    convertedType: string;
    preserved: string;
    lost: string;
    confidence: string;
    teacherNotes: string;
  };
}

// Audit entry (FR-9)
interface RepairAuditEntry {
  timestamp: number;
  model: string;
  temperature: number;
  fragmentHash: string;
  issueCodes: IssueCode[];
  resultConfidence: number;
  reasoningLog: ReasoningEntry[];
  hadUncertain: boolean;
}
```

---

### Section 2: Fragment Registry (FR-4)

#### `REPAIR_FRAGMENTS: Record<IssueCode, RepairFragment>`
16 entries, one per issue code. Each contains:
- **priority**: determines assembly order in prompt (structural issues first)
- **instruction**: 1-3 sentence AI instruction for THIS specific fix
- **example**: concrete before→after showing the fix
- **constraint**: guardrail (e.g., "Do NOT change question text")

Priority groups:
1. Structure (P1): MERGED_QUESTIONS, MISSING_Q_PREFIX, OPTIONS_INLINE, AMBIGUOUS_SECTION_SPLIT
2. Answer key (P2): COMPRESSED_ANSWER_KEY, MISSING_ANSWER_KEY
3. Type/tag (P3): MISSING_TYPE_TAG, TYPE_CONTENT_MISMATCH
4. Reading (P3): MISSING_PASSAGE_BLOCK, PASSAGE_NO_PARAGRAPHS
5. Numbering (P4): NUMBERING_GAP, SECTION_NO_QUESTIONS
6. Format (P5): BLANK_FORMAT_WRONG, MISSING_BRACKETS, MISSING_ARROW, WORD_BANK_NOT_TAGGED

#### `COMPROMISE_TEMPLATES: Record<CompromiseRoute, CompromiseTemplate>`
8 entries mapping FR-10 routes:
1. matching → mcq-vocabulary
2. true-false → reading-comprehension
3. translation → sentence-rewrite
4. matching-headings → reading-comprehension
5. gap-fill-open → verb-form (or word-form)
6. word-ordering → sentence-arrangement
7. picture-description-mcq → mcq-sign-notice
8. picture-description-open → skip (with template to explain WHY)

---

### Section 3: Prompt Builders

#### `buildRepairPrompt(issues, originalInput, processedText): string` (FR-5)
1. Filter `REPAIR_FRAGMENTS` to only those matching `issues[].issueCode`
2. Sort by priority (ascending = most important first)
3. Assemble prompt:
   ```
   You are repairing a Vietnamese THCS English test document. Fix ONLY the issues listed below.

   === ORIGINAL TEXT (from teacher) ===
   {originalInput}

   === PROCESSED TEXT (current state) ===
   {processedText}

   === ISSUES TO FIX ===
   [For each fragment: numbered instruction + example + constraint]

   === OUTPUT FORMAT ===
   --- FIXED TEXT ---
   [Your corrected version of the PROCESSED TEXT]

   --- REASONING LOG ---
   [For each fix:
   ISSUE: {issueCode}
   ACTION: {what you changed}
   REASONING: {why, referencing original vs processed}
   CONFIDENCE: {high/medium/low}
   ORIGINAL_REF: {quote from original input}
   ]
   ```
4. Compute fragment hash for audit

#### `buildCompromisePrompt(sourceType, targetType, sectionText, originalInput): string` (FR-6)
1. Look up `COMPROMISE_TEMPLATES[sourceType]`
2. Assemble prompt:
   ```
   Convert this {sourceType} section into {targetType} format for a Vietnamese THCS English test.

   === ORIGINAL INPUT (teacher version) ===
   {originalInput}

   === SECTION TO CONVERT ===
   {sectionText}

   === CONVERSION RULES ===
   {template.instruction}

   === EXAMPLE ===
   {template.example}

   === CONSTRAINTS ===
   {template.constraint}
   Fields to preserve: {template.preserveFields}

   === OUTPUT FORMAT ===
   [COMPROMISED: {sourceType} → {targetType}]
   [Converted section text]

   --- REASONING ---
   ORIGINAL_TYPE: {sourceType}
   CONVERTED_TYPE: {targetType}
   PRESERVED: {what was kept}
   LOST: {what was adapted/dropped}
   CONFIDENCE: {high/medium/low}
   TEACHER_NOTES: {suggestions for teacher review}
   ```

---

### Section 4: Response Parsers (FR-7)

#### `parseAIRepairResponse(rawResponse: string): ParsedRepairResponse`
1. Try splitting on delimiter patterns (in order):
   - `--- FIXED TEXT ---` / `--- REASONING LOG ---`
   - `=== FIXED TEXT ===` / `=== REASONING LOG ===`
   - `### FIXED TEXT` / `### REASONING LOG`
   - `FIXED TEXT:` / `REASONING LOG:` (bare labels)
2. If no delimiter found → treat entire response as `fixedText`, empty `reasoningLog`
3. Parse reasoning section: split on `ISSUE:` markers, extract 5 fields per entry
4. Handle partial entries gracefully (fill missing fields with defaults)

#### `parseCompromiseResponse(rawResponse: string): ParsedCompromiseResponse`
1. Extract `[COMPROMISED: old → new]` tag
2. Split on `--- REASONING ---` (4 patterns)
3. Parse 6 reasoning fields (originalType, convertedType, preserved, lost, confidence, teacherNotes)
4. If parsing fails → return raw text as `convertedText`, empty reasoning

---

### Section 5: Fragment Hashing (FR-9)

#### `computeFragmentHash(issueCodes: IssueCode[]): string`
1. Sort issue codes alphabetically (deterministic)
2. For each code, get the fragment's instruction text
3. Concatenate sorted: `code:instruction` pairs
4. Hash with simple djb2 or similar (no crypto dependency needed — this is for audit deduplication, not security)
5. Return hex string

#### `createAuditEntry(model, temperature, issueCodes, fragmentHash, confidence, reasoningLog): RepairAuditEntry`
Factory function for audit entries.

---

### Files changed
- `src/services/test-creation/thcs-prompt-builder.ts` (NEW — ~350-400 lines)

### Dependencies
- None (pure data + string assembly + parsing)

### Consumed by
- Task `pqr0rq` (Pass 2 Repair) — calls `buildRepairPrompt`, `parseAIRepairResponse`, `createAuditEntry`
- Task `78pz92` (Compromise) — calls `buildCompromisePrompt`, `parseCompromiseResponse`
- Task `8085zl` (Integration) — reads audit entries for review panel
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Created `thcs-prompt-builder.ts` (~330 lines)
- Fragment Registry: 16 repair fragments (P1-P5 priority), 8 compromise templates
- buildRepairPrompt: filters by issue codes, sorts by priority, injects both texts + output format
- buildCompromisePrompt: type-specific conversion, skip handling for picture-description-open
- parseAIRepairResponse: 4 delimiter patterns, 5-field reasoning entries, graceful fallback
- parseCompromiseResponse: 4 delimiter patterns, 6-field reasoning
- djb2 fragment hashing (8-char hex, order-independent, deterministic)
- createAuditEntry factory with hadUncertain detection
- 26 unit tests passing (thcs-prompt-builder.test.ts)
- Zero TypeScript errors
<!-- SECTION:NOTES:END -->

