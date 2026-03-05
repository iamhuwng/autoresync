---
id: q6lxtq
title: Implement Internal AI Pass 1 (Restructure + Confidence Assessment)
status: done
priority: high
labels:
  - from-spec-v2
  - pipeline
createdAt: '2026-03-04T22:46:13.541Z'
updatedAt: '2026-03-05T01:08:46.394Z'
timeSpent: 676
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-13
order: 6
---
# Implement Internal AI Pass 1 (Restructure + Confidence Assessment)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Static ~20-line prompt for text restructuring AND confidence assessment. **Always runs** on every input. Runs on **near-raw text** (post-preClean only, before any regex/code processing) so the AI can independently assess external AI output quality. Tasks: (1) assess confidence, (2) split merged Qs, (3) add Q prefixes, (4) expand answer keys, (5) insert line breaks + section splitting, (6) produce stats `[STATS:]`, (7) infer missing answers `[AI-INFERRED]`. Does NOT replace instructions (Engine job, D10). Depends on @task-kttjez (pre-clean fix), @task-vu13lx (external prompt).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Always runs on every input (no skip/fast-path logic)
- [x] #2 Runs on near-raw text (post-preClean, before any regex)
- [x] #3 Confidence assessment of external AI output included
- [x] #4 All 6 restructuring tasks implemented (split, prefix, expand, linebreaks, stats, infer)
- [x] #5 Missing answers inferred with [AI-INFERRED] tags
- [x] #6 Stats comment [STATS: X questions, Y answers, Z sections] appended
- [x] #7 Does NOT contain instruction replacement logic (Engine job)
- [x] #8 Outputs plain text (not JSON)
- [x] #9 All markers preserved through restructure
- [x] #10 Order: 2 (depends on T1 kttjez + T2 vu13lx)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### New file
`src/services/test-creation/thcs-pass1-restructure.ts`

### What Pass 1 IS
A **static prompt** (~20 lines) sent to the internal AI (Groq llama) that:
1. Assesses the external AI's output quality/confidence
2. Normalizes the text structure for the regex engine
3. Outputs **plain text** (NOT JSON) — the restructured version of the input

### What Pass 1 is NOT
- NOT a JSON parser (that's the current `callGroqDirect`)
- NOT an instruction replacer (that's the Engine, task `4f54n5`)
- NOT a classifier (that's the classifier module)

### Position in pipeline
```
Teacher pastes text (external AI output)
  → preCleanText() (task kttjez)
  → *** Pass 1 (this task) ***
  → Code Validation (task 9vafnp)
  → Pass 2 Repair if needed (task pqr0rq)
  → Regex Engine parse
  → Engine Enhancements (task 4f54n5)
  → Draft Converter
```

### Architecture

#### The Prompt (static, ~25 lines)
```
You are normalizing a Vietnamese THCS English test document that was extracted by another AI.
Your job is to RESTRUCTURE the text so a regex parser can process it reliably.

INPUT ASSESSMENT (do this first):
- Rate the quality of this AI extraction: [CONFIDENCE: N] (0-100)
- Consider: Are sections properly separated? Do question numbers exist? Are type tags present? Does structure make sense for a Vietnamese English test?

RESTRUCTURING TASKS (apply ALL that are needed):
1. SPLIT merged questions: If two questions appear on the same line, split them onto separate lines
2. ADD missing prefixes: Every question should start with "Question N." format
3. EXPAND compressed answer keys: Convert "1-5: BACDC" into "1. B
2. A
3. C
4. D
5. C"
4. INSERT line breaks: Ensure blank lines between sections, between questions, between options
5. SPLIT ambiguous sections: If one section header covers two DIFFERENT exercise types (detectable from content patterns like MCQ mixed with fill-in), split into two separate sections with appropriate headers
6. PRODUCE stats: At the very end, append: [STATS: X questions, Y answers, Z sections]
7. INFER missing answers: If NO answer key section exists at all, attempt to infer from context and mark each with [AI-INFERRED] (e.g., "1. B [AI-INFERRED]")

CRITICAL RULES:
- Output PLAIN TEXT only (not JSON, not markdown)
- PRESERVE all markers: **bold**, __underline__, {{braces}}, [TYPE: xxx], [WORD BANK: ...]
- PRESERVE all Vietnamese diacritics exactly
- Do NOT replace instruction texts — leave them as-is
- Do NOT change question text content — only structural formatting
- Do NOT reorder sections or questions
- Keep your [CONFIDENCE: N] assessment on the FIRST line of output
```

#### Module Functions

##### `buildPass1Prompt(nearRawText: string): string`
- Appends the static prompt + the input text
- Simple string concatenation (no dynamic fragments — this is a static prompt)

##### `parsePass1Response(response: string): Pass1Result`
```typescript
interface Pass1Result {
  confidence: number;           // 0-100 from [CONFIDENCE: N]
  restructuredText: string;     // The cleaned output text
  stats: {
    questions: number;
    answers: number;
    sections: number;
  } | null;                     // Parsed from [STATS: ...] if present
  hasInferredAnswers: boolean;  // true if [AI-INFERRED] tags found
}
```
- Extract `[CONFIDENCE: N]` from first line → `confidence`
- Extract `[STATS: X questions, Y answers, Z sections]` from last line → `stats`
- Detect `[AI-INFERRED]` presence → `hasInferredAnswers`
- Everything between confidence and stats → `restructuredText`

##### `executePass1(nearRawText: string, session: RetrySession): Promise<Pass1Result>`
Main orchestrator:
1. Build prompt via `buildPass1Prompt(nearRawText)`
2. Call AI (Groq llama, temp 0.1) — uses retry manager session for call counting
3. Parse response via `parsePass1Response()`
4. If AI fails → return fallback result: `{ confidence: 0, restructuredText: nearRawText, stats: null, hasInferredAnswers: false }`
5. Never crashes — gracefully degrades

##### AI Call Implementation
- Uses the same `callGroqDirect` / `callGeminiDirect` pattern from the existing parser
- BUT with a different prompt and expecting **plain text** response (not JSON)
- System message: `"You are a text restructuring assistant. Output plain text only."`
- Temperature: 0.1 (low creativity — we want faithful restructuring)
- Max tokens: 8192 (same as existing)

### Key Design Decisions

1. **Always runs** — no conditional skip. Even clean text benefits from the confidence assessment.
2. **Near-raw text** — receives output of `preCleanText()` ONLY. No regex has touched it yet. This ensures the AI assesses the external AI's output independently.
3. **Plain text output** — the restructured text goes BACK into the pipeline as text, to be processed by the code validator and regex engine.
4. **Static prompt** — unlike the adaptive prompt builder (task `wei3uc`), Pass 1 uses the SAME prompt every time. No fragment selection needed.
5. **Graceful degradation** — if the AI call fails entirely, Pass 1 returns the original text unchanged with `confidence: 0`. The pipeline continues with whatever it has.

### Integration point (future — task `8085zl`)
In `parseThcsText()`:
```
const cleaned = preCleanText(rawText);
// NEW: Pass 1 — always runs
const pass1 = await executePass1(cleaned, retrySession);
// Pass result to code validator (task 9vafnp)
// Use pass1.restructuredText for all subsequent processing
```

### Files changed
- `src/services/test-creation/thcs-pass1-restructure.ts` (NEW — ~100 lines)

### Dependencies
- `thcs-retry-manager.ts` (task `0yg6fx`) — for `RetrySession` type (call counting)
- Uses existing `callGroqDirect`/`callGeminiDirect` patterns (but adapted for plain text response)

### Consumed by
- Task `9vafnp` (Code Validation) — receives `Pass1Result.restructuredText` + `confidence`
- Task `8085zl` (Integration) — calls `executePass1()` in the main pipeline
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Created `thcs-pass1-restructure.ts` (~155 lines)
- Exports: `buildPass1Prompt`, `getPass1SystemMessage`, `parsePass1Response`, `executePass1`, `Pass1Result`
- Static prompt (~25 lines) covers: confidence assessment, 7 restructuring tasks, critical rules for marker preservation
- Response parser extracts [CONFIDENCE: N], [STATS: X questions, Y answers, Z sections], [AI-INFERRED] detection
- Orchestrator uses callAI callback (system+prompt → plain text), respects circuit breaker, graceful degradation on failure
- 19 unit tests passing (thcs-pass1-restructure.test.ts)
- Zero TypeScript errors
<!-- SECTION:NOTES:END -->

