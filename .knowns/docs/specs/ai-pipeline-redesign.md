---
title: AI Pipeline Redesign
createdAt: '2026-03-04T21:03:46.053Z'
updatedAt: '2026-03-04T22:38:01.913Z'
description: >-
  Specification for redesigning the THCS test parsing pipeline to a three-layer
  architecture with adaptive prompting
tags:
  - spec
  - draft
  - ai-pipeline
  - thcs
---
## Overview

Redesign the THCS test parsing pipeline from the current 11-step double-AI architecture into a lean, three-layer system: **External AI** (teacher-facing, PDF→text extraction + markers), **Internal AI** (text normalization + targeted repair), and **Engine** (deterministic regex parsing + data model transformation).

The core innovation is an **adaptive prompt builder** that dynamically assembles repair/compromise prompts from a fragment registry based on specific issues detected by code validation — cross-referencing the original teacher input for accuracy.

### Goals
- **Accuracy**: Preserve all formatting markers (`**bold**`, `__underline__`, `{{phoneme}}`, `[WORD BANK:]`) through the entire pipeline
- **Efficiency**: Minimize AI calls (≤5 per session) using code-first validation with AI-only-when-needed repair
- **Robustness**: Handle unsupported question types via compromise, retry failures via model escalation, and always degrade gracefully to teacher review
- **Auditability**: Every AI decision includes structured reasoning logs for diagnostics and teacher review

### Scope
- External prompt redesign (Step 0) with per-type extraction rules
- Pre-clean bug fix (preserve `**bold**` markers)
- Internal AI Pass 1 — static restructure prompt for messy input
- Code validation module (format confidence scoring, 16 issue codes)
- Adaptive prompt builder (fragment registry + 2 builders)
- Reasoning log parser
- Retry escalation with circuit breaker + better/worse comparison
- Compromise step for unsupported types (8 compromise templates + 4 uncompromisable skips)
- Confidence comparison warning (AI vs Code disagreement)
- Migration of existing band-aid steps (validateAIResult, reconciliation, metadata override)
- Integration with existing Parse Review Panel
### Out of Scope
- External AI selection UI (teacher already uses ChatGPT/Gemini manually for Step 0; the automated retry in FR-15 uses the project's own API keys)
- New question type support (only compromise existing unsupported types)
- Student view changes (rendering already supports markers)

---
## Requirements

### Functional Requirements

- FR-1: **External Prompt Redesign** — Modify the teacher-facing extraction prompt:
  - FR-1a: Add `[TYPE: xxx]` codename tags using the 20 supported type slugs. Each section header line must include one tag.
  - FR-1b: Remove the 18-line section name lookup table. Replace with "Copy the section name EXACTLY as written in the original document."
  - FR-1c: Remove the blanket markdown ban ("Do NOT add markdown formatting"). Replace with targeted formatting rules.
  - FR-1d: Add `{{target_word}}` convention for synonym/antonym questions — reuse existing `{{}}` markers for the tested vocabulary word in question text.
  - FR-1e: Add `[WORD BANK: word1 / word2 / word3]` instruction for cloze-wordbank sections (visual box element from PDF).
  - FR-1f: Add point allocation copy instruction: if visible in PDF, include `(N điểm)` on the section header line.
  - FR-1g: Add per-type extraction rules specifying exactly what formatting each type demands:

    | Type slug | Required extraction markers |
    |---|---|
    | `pronunciation` | `{{underlined_letters}}` in each option |
    | `error-identification` | `{{underlined_word_or_phrase}}` in each option |
    | `synonym-mcq` / `antonym-mcq` | `{{tested_word}}` in question text |
    | `reading-comprehension` | `**bold**` vocabulary words + `__underline__` sentences in PASSAGE: block |
    | `reading-cloze-mcq` / `reading-cloze-wordbank` | `(N)______` numbered blanks in PASSAGE: block |
    | `reading-cloze-wordbank` | `[WORD BANK: word1 / word2 / ...]` after section header |
    | `sentence-rewrite` / `sentence-rewrite-keyword` | `=>` separator between original sentence and rewrite starter |
    | `verb-form` / `word-form` | `(verb)` or `(WORD)` brackets within blanks |
    | `reading-announcement` | Same as `reading-comprehension` but for short notices/ads |
    | All other MCQ types | Standard `Question N.` + `A. / B. / C. / D.` formatting |

  - FR-1h: Add `reading-announcement` distinction — short notices/ads use `[TYPE: reading-announcement]` vs long articles using `[TYPE: reading-comprehension]`.
- FR-2: **Pre-Clean Fix** — `preCleanText()` must preserve `**bold**`, `__underline__`, and `{{}}` markers instead of stripping them. Implementation note: `**bold**` stripping is a confirmed active bug (lines 405-406 in current code). `__underline__` is not currently stripped but must remain protected. `{{}}` is not currently stripped.
- FR-3: **Code Validation Module (Post-Pass 1)** — Scan the restructured text AFTER Pass 1 to produce a `ValidationReport` with: `formatConfidence` (0-100), `issues[]` (16 issue codes with section text + line ranges), `unsupportedTypes[]`, and `stats` (section/question/answer/typeTag counts). Must also carry `originalInput` and `processedText`. This determines whether Pass 2 (repair), Compromise, or External Retry are needed. The 16 issue codes are:
  - `MERGED_QUESTIONS` — Multiple questions on same line
  - `MISSING_Q_PREFIX` — Questions don't start with "Question N."
  - `OPTIONS_INLINE` — Options on same line as question text
  - `COMPRESSED_ANSWER_KEY` — "1-5: BACDC" format
  - `MISSING_ANSWER_KEY` — No answer key section found
  - `MISSING_TYPE_TAG` — Section has no [TYPE:] tag
  - `TYPE_CONTENT_MISMATCH` — [TYPE:] tag doesn't match content pattern
  - `MISSING_PASSAGE_BLOCK` — Reading section without PASSAGE: delimiter
  - `PASSAGE_NO_PARAGRAPHS` — Passage is one block (no paragraph breaks)
  - `SECTION_NO_QUESTIONS` — Section header but 0 questions parsed
  - `AMBIGUOUS_SECTION_SPLIT` — One section header covers two different types
  - `NUMBERING_GAP` — Question numbers have unexpected gaps
  - `BLANK_FORMAT_WRONG` — Blanks not using ______ format
  - `MISSING_BRACKETS` — verb-form/word-form missing (verb)/(WORD) brackets
  - `MISSING_ARROW` — Rewrite questions missing => separator
  - `WORD_BANK_NOT_TAGGED` — Word bank exists but not in [WORD BANK:] format
- FR-4: **Fragment Registry** — Store 16 repair fragments (`REPAIR_FRAGMENTS`, one per issue code above) and 8 compromise templates (`COMPROMISE_TEMPLATES`, one per compromise route in FR-10) with priority, instruction template, example, and constraint fields.
- FR-5: **Repair Prompt Builder** (`buildRepairPrompt`) — Dynamically assemble a prompt from relevant fragments + both original and processed text + reasoning format instructions. Output must request `--- FIXED TEXT ---` and `--- REASONING LOG ---` sections.
- FR-6: **Compromise Prompt Builder** (`buildCompromisePrompt`) — Generate type-specific adaptation prompts. Must be explicitly injected with the raw `originalInput` string (same as FR-5) to enable cross-referencing during type conversion. Tag output with `[COMPROMISED: old → new]`. Include compromise reasoning format requesting: original type, converted type, what was preserved, what was lost/adapted, confidence, and teacher notes.
- FR-7: **Reasoning Log Parser** — Parse AI response into `{ fixedText, reasoningLog[] }` with flexible delimiter matching (4 patterns: `---`, `===`, `###`, bare label). Each `ReasoningEntry` must extract 5 structured fields: `issueCode` (what was fixed), `action` (what changed), `reasoning` (why, referencing original vs processed), `confidence` (high/medium/low), and `originalRef` (quote from original input). Handle missing reasoning gracefully (treat entire response as fixed text). Parse compromise responses into `{ convertedText, reasoning }`.
- FR-8: **Retry Escalation (Internal)** — Repair: Groq llama (temp 0.1) → Gemini Flash (temp 0.2) → teacher. Compromise: Flash (temp 0.15) → Flash (temp 0.3) → skip with warning. Circuit breaker at 5 total AI calls per session. On each retry: if result is BETTER (fewer issues), use as new base and continue; if WORSE or same, keep previous result and escalate model.
- FR-9: **Fragment Version Hashing** — Compute deterministic hash of fragments used per prompt. Log `RepairAuditEntry` with timestamp, model, temperature, fragmentHash, issueCodes, resultConfidence, reasoningLog, hadUncertain.
- FR-10: **Unsupported Type Detection & Compromise Routing** — Code patterns to detect unsupported types and route to compromise or skip:
  - `matching` (column A/B) → compromise to `mcq-vocabulary`
  - `true-false` → compromise to `reading-comprehension` (A.True B.False C.Not Given)
  - `translation` (VN→EN/EN→VN) → compromise to `sentence-rewrite`
  - `matching-headings` (paragraphs to headings) → compromise to `reading-comprehension`
  - `gap-fill-open` (no word bank/brackets) → compromise to `verb-form` or `word-form` using answer key
  - `word-ordering` → compromise to `sentence-arrangement` if has labeled options
  - `picture-description` → compromise to `mcq-sign-notice` if has options, skip if open-ended
  - `listening`, `speaking`, `essay`, `composition` → SKIP with teacher warning (uncompromisable)
- FR-11: **Integration** — Wire the new pipeline into `parseThcsText()` replacing the current internal AI call. Preserve the existing `ParsedTest` output interface. Feed reasoning logs + compromise flags + audit entries to the Parse Review Panel.
- FR-12: **Internal AI Pass 1 (Restructure + Confidence Assessment)** — Static prompt (~20 lines) that assesses external AI output quality and normalizes text structure. **Always runs** on every input, and runs on near-raw text (post-preClean only, before any regex/code processing). This is critical because Step 0 only adds markers and tags — the base text remains almost as primitive as the original PDF extraction. The internal AI must see this near-raw text to independently judge whether the external AI's analysis is reliable. If regex ran first, the AI would be evaluating processed text and its confidence assessment would be unreliable. Tasks:
  1. Assess quality/confidence of the external AI's output (are sections plausible? are type tags reasonable? does structure make sense for a Vietnamese test?)
  2. Split merged questions onto separate lines
  3. Add missing "Question N." prefixes
  4. Expand compressed answer keys
  5. Insert missing line breaks between sections (including splitting ambiguous sections where one header covers two different exercise types, if detectable from content patterns)
  6. Produce a stats comment at end: `[STATS: X questions, Y answers, Z sections]` for code validation cross-check
  7. If answer key is entirely missing, attempt to infer answers from context and mark each with `[AI-INFERRED]`
  **Does NOT replace instruction texts** — instruction unification is delegated to the Engine (FR-17) as a deterministic lookup to avoid hallucination. Preserves all markers and content. Outputs plain text (not JSON).
- FR-13: **Confidence Comparison Warning** — When the difference between the Internal AI's self-reported confidence and the code validation's `formatConfidence` exceeds 25 points, display a warning to the teacher: "The AI and our system disagree on output quality."
- FR-14: **AI Tag Consumption** — The pipeline emits and consumes inline AI-generated tags. Tag emitter→consumer mapping:
  - `[AI-INFERRED]` — **Emitted by:** Pass 1 (FR-12, when answer key is missing). **Consumed by:** Regex Engine → sets `answerSource: 'ai-inferred'` on the corresponding question object.
  - `[UNCERTAIN]` — **Emitted by:** Pass 2 repair prompt (FR-5, when content is wrong in both original and processed text). **Consumed by:** Regex Engine → adds to the section's `warnings[]` array with the tagged content.
  - `[COMPROMISED: old → new]` — **Emitted by:** Compromise prompt (FR-6). **Consumed by:** Regex Engine → sets `compromised: true` with `originalType` and `convertedType` fields on the section object.
  - All tags must be stripped from display text after consumption. The Parse Review Panel reads these flags from the `ParsedTest` payload to render visual indicators (AC-12).
- FR-15: **Automated External API Retry** — When `formatConfidence` remains below 50 after all internal passes (Pass 1 + Pass 2), the system automatically calls the external AI API (Gemini/GPT) with the original teacher-pasted text + a structured audit log detailing the specific issues found. This is a different API, prompt structure, and termination logic from the internal retry chain (FR-8). Max 3 automated retries. The audit log must include: issue codes found, sections that failed to parse, question count mismatches, and specific formatting problems. Each retry response re-enters the pipeline at the pre-clean step.
- FR-16: **Engine Section Ordering** — After parsing, the Engine must sort sections by standard Vietnamese curriculum order before producing the final `ParsedTest` output:
  1. Pronunciation
  2. Word Stress
  3. Grammar / Vocabulary MCQ
  4. Fill-in (verb-form, word-form, cloze)
  5. Reading (announcement, comprehension, cloze)
  6. Writing (rewrite, sentence-arrangement)
  If a section's type has no standard curriculum position, preserve its original order relative to other unmatched sections.
- FR-17: **Engine Marker Conversion & Instruction Replacement** — The Regex Engine must convert inline text markers into `ParsedTest` data model fields AND replace instruction texts with canonical templates:
  - **Instruction replacement:** After type finalization, look up the finalized type slug in `INSTRUCTION_TEMPLATES` and replace the original instruction text with the canonical template. This is a deterministic string lookup — no AI needed. Avoids hallucination risk that would exist if the AI rewrote instructions.
  - `{{phoneme}}` in pronunciation options → `optionUnderlines` array (existing behavior, must be preserved)
  - `{{error}}` in error-identification options → `underlinedParts` array (existing behavior)
  - `{{target_word}}` in synonym/antonym question text → `underlinedParts` on the question object (NEW: maps the marker added by FR-1d)
  - `**bold**` in passage text → preserved as-is for `PassageContent` renderer (not converted to data model field)
  - `__underline__` in passage text → preserved as-is for `PassageContent` renderer
  - `(N)______` numbered blanks in cloze passages → blank numbering data for cloze question mapping
  All markers must be stripped from display text AFTER conversion to data model fields (except `**bold**` and `__underline__` which are consumed by the renderer directly).
- FR-18: **Engine Data Extraction** — The Regex Engine must extract and transform structured data tags into `ParsedTest` fields:
  - `[WORD BANK: word1 / word2 / word3]` from section text → populate `wordBank` array on the section object and generate `blankMapping` entries for `reading-cloze-wordbank` questions
  - `(N điểm)` from section header lines → parse numeric value as section point allocation. Use for per-question point calculation (section points ÷ question count). Fall back to `10 ÷ totalQuestions` if no point tag is present.
  - `[TYPE: xxx]` tags → already covered by `extractExplicitTypeTag` in type classifier, but must be stripped from display text after extraction
- FR-19: **Engine Post-Parse Validation** — After the Regex Engine produces a `ParsedTest`, run post-parse quality checks before returning to the caller:
  - Total question count > 0 (fail if no questions parsed)
  - Sequential numbering check (warn on unexpected gaps in question numbers)
  - Answer coverage check (warn on questions with no `correctAnswer` and no `answerSource: 'ai-inferred'`)
  - Type-specific validation: reading sections must have non-empty `passage.content`, cloze sections must have numbered blanks, writing sections must have `=>` separator
  - Generate `warnings[]` array for teacher review in the Parse Review Panel
  This is a SEPARATE step from FR-3 (post-Pass 1 format check). FR-3 checks the RESTRUCTURED TEXT after Pass 1. FR-19 checks the PARSED RESULT after the engine has produced its output.
### Non-Functional Requirements

- NFR-1: **Performance** — Code validation + regex parsing must complete in <500ms. AI calls are the only slow step.
- NFR-2: **Cost** — Maximum 5 internal AI calls per parse session (circuit breaker). Groq calls preferred first (free tier).
- NFR-3: **Resilience** — Pipeline must never crash on malformed AI output. All parsers degrade gracefully.
- NFR-4: **Maintainability** — Fragment registry is a single file. Adding a new issue type = adding one object to the registry.
- NFR-5: **Backward Compatibility** — `ParsedTest` interface unchanged. Existing consumers (draft converter, review panel) work without modification.

---

## Acceptance Criteria

- [x] AC-1: External prompt includes `[TYPE: xxx]` instructions with all 20 codenames, removes the section name lookup table, removes the markdown ban, and includes per-type formatting requirements matching the FR-1g table.
- [x] AC-2: `preCleanText()` preserves `**bold**`, `__underline__`, and `{{}}` markers — verified by unit test. Specifically: the `**` stripping regex on lines 405-406 must be removed or scoped to non-passage text.
- [x] AC-3: Code validation module (post-Pass 1) produces a `ValidationReport` for the restructured text with all required fields populated. All 16 issue codes are detectable. This runs AFTER Pass 1 and determines whether Pass 2 (repair), Compromise, or External Retry are needed.
- [x] AC-4: Fragment registry contains all 16 repair fragments (one per issue code) and all 8 compromise templates (one per compromise route), each with instruction/example/constraint.
- [x] AC-5: `buildRepairPrompt()` generates a prompt containing ONLY fragments relevant to the detected issues, with both original and processed text.
- [x] AC-6: `buildCompromisePrompt()` generates type-specific prompts with `originalInput` injected, cross-reference block, and compromise reasoning format.
- [x] AC-7: `parseAIRepairResponse()` correctly splits fixed text from reasoning log using flexible delimiters, extracts all 5 fields per entry (issueCode, action, reasoning, confidence, originalRef), and handles missing reasoning gracefully.
- [x] AC-8: Internal retry escalation follows the configured model/temperature progression, applies better/worse comparison between retries, and respects the 5-call circuit breaker.
- [x] AC-9: All unsupported types are detected and routed correctly: matching, true-false, translation, matching-headings, gap-fill-open → compromise. Listening, speaking, essay → skip with warnings.
- [x] AC-10: `RepairAuditEntry` is logged for every AI call with fragmentHash, model, confidence, and reasoning.
- [x] AC-11: The full pipeline produces a valid `ParsedTest` output identical in structure to the current system — existing consumers work unchanged.
- [x] AC-12: Parse Review Panel displays: AI-inferred answers (yellow), compromised sections (orange), uncertain fixes (warning icon), and reasoning logs (expandable).
- [x] AC-13: Pass 1 **always runs** on every input and runs on near-raw text (post-preClean only, before any regex/code processing). It performs: confidence assessment of external AI output quality, split merged Qs, add Q prefixes, expand answer keys, insert line breaks (including section splitting for ambiguous headers), produce stats comment, and infer missing answers with `[AI-INFERRED]` tags. Pass 1 does NOT replace instruction texts — instruction unification is delegated to the Engine (FR-17) as a deterministic lookup.
- [x] AC-14: When code validation confidence and AI self-reported confidence disagree by > 25 points, a teacher-visible warning is displayed.
- [x] AC-15: Regex Engine correctly consumes `[AI-INFERRED]`, `[UNCERTAIN]`, and `[COMPROMISED]` tags from text, maps them to `ParsedTest` data model fields (`answerSource`, `warnings[]`, `compromised`), and strips the tags from display text. Each tag is only emitted by its designated layer (Pass 1, Pass 2, Compromise respectively).
- [x] AC-16: When `formatConfidence` remains below 50 after all internal passes, the system automatically calls the external AI API (Gemini/GPT) with the original text + structured audit log. Max 3 retries. Each retry re-enters the pipeline at pre-clean. If all 3 retries fail, escalate to teacher with full audit log.
- [x] AC-17: Engine sorts output sections by standard curriculum order (Pronunciation → Stress → Grammar/Vocab → Fill-in → Reading → Writing). Sections with no standard match preserve their original relative order.
- [x] AC-18: Engine correctly converts all inline markers to data model fields: `{{phoneme}}` → `optionUnderlines`, `{{error}}` → `underlinedParts`, `{{target_word}}` → `underlinedParts`, `(N)______` → cloze blank numbering. `**bold**` and `__underline__` markers in passages are preserved as-is for the renderer. All converted markers are stripped from display text. Engine replaces instruction texts with canonical `INSTRUCTION_TEMPLATES` values after type finalization (deterministic lookup, no AI).
- [x] AC-19: Engine extracts `[WORD BANK:]` tags into `wordBank` array + `blankMapping` entries. Engine extracts `(N điểm)` tags into per-section point allocation (falling back to `10 ÷ totalQuestions`). Both tags are stripped from display text after extraction.
- [x] AC-20: Post-parse validation catches: zero questions (error), numbering gaps (warning), missing answers without AI-inferred flag (warning), reading sections without passage content (warning), cloze without numbered blanks (warning), writing without `=>` (warning). All warnings appear in the Parse Review Panel.
## Scenarios

### Scenario 1: Clean Input (Happy Path)
**Given** teacher pastes well-formatted external AI output with `[TYPE:]` tags and answer key
**When** code validation scores formatConfidence ≥ 80
**Then** skip all AI calls (both Pass 1 and Pass 2), go straight to regex parsing, produce `ParsedTest` in <500ms

### Scenario 2: Messy Input (Fix Path)
**Given** teacher pastes text with merged questions and compressed answer key
**When** code validation finds MERGED_QUESTIONS + COMPRESSED_ANSWER_KEY issues
**Then** build repair prompt with only those 2 fragments + original text → Internal AI fixes → re-validate → if confidence ≥ 80, proceed to regex

### Scenario 3: Unsupported Type (Compromise Path)
**Given** text contains a True/False section
**When** code validation detects unsupported type "true-false"
**Then** build compromise prompt for true-false → reading-comprehension conversion → tag `[COMPROMISED]` → highlight orange in review panel

### Scenario 4: Persistent Failure (Escalation Path)
**Given** first repair attempt (Groq llama, temp 0.1) produces worse result
**When** re-validation shows no improvement or worse confidence
**Then** keep previous (better) result, retry with Gemini Flash (temp 0.2) → if still failing, show teacher warning with audit log containing both attempts' reasoning

### Scenario 5: Circuit Breaker
**Given** 3 repair calls + 2 compromise calls already made (total = 5)
**When** another unsupported section is detected
**Then** skip the section with warning "AI call limit reached" instead of making a 6th call. **Fallback guarantee:** the pipeline returns the best-known intermediate text state (from the most successful prior attempt), tags it with all accumulated warnings, and passes it to the Regex Engine for best-effort parsing. The pipeline must never throw a fatal error at this stage.

### Scenario 6: Missing Answer Key
**Given** text has no ANSWER KEY section
**When** code validation flags MISSING_ANSWER_KEY
**Then** Pass 1 attempts to infer answers with `[AI-INFERRED]` tags → Regex Engine parses the tags into `answerSource: 'ai-inferred'` → Parse Review Panel highlights them yellow for teacher confirmation

### Scenario 7: Uncompromisable Type
**Given** text contains a Listening section
**When** code validation detects unsupported type "listening" (in UNCOMPROMISABLE_TYPES)
**Then** skip section without AI call, add warning "Listening sections cannot be converted for this platform"

### Scenario 8: Poorly Structured Input (Pass 1 Restructure)
**Given** teacher pastes text where questions are merged, answer key is compressed, but content is complete
**When** initial format check scores confidence < 80
**Then** Pass 1 runs with the static restructure prompt (split merged Qs, expand answer keys, unify instructions to canonical templates, insert line breaks, produce stats comment) → produces cleaned text → code validation re-scores → if confidence ≥ 80, proceed to regex without Pass 2

### Scenario 9: Confidence Disagreement
**Given** Internal AI self-reports 90% confidence but code validation scores only 55%
**When** the difference exceeds 25 points
**Then** display warning "The AI and our system disagree on output quality" in the Parse Review Panel and log the disagreement in audit

### Scenario 10: Automated External Retry
**Given** teacher pastes text that remains severely malformed after Pass 1 + Pass 2
**When** formatConfidence stays below 50 after all internal passes
**Then** system automatically calls the external AI API (Gemini/GPT) with the original teacher-pasted text + structured audit log listing specific issues (e.g., "Section III: 0 questions parsed, answer key format not recognized"). The retry response re-enters the pipeline at pre-clean. Max 3 automated retries. If all 3 fail, escalate to teacher with full audit log and a message: "The AI could not produce valid output after 3 attempts. Please review the issues below and try again."
## Technical Notes

### Architecture

```
Teacher paste → preClean (minimal noise removal)
                    ↓
                Internal AI Pass 1 (ALWAYS runs, sees near-raw text):
                    │ Assess external AI confidence
                    │ Restructure: split merged Qs, expand answer keys,
                    │ insert line breaks, split ambiguous sections,
                    │ produce stats, infer missing answers
                    │ Does NOT replace instructions (delegated to Engine)
                    ↓
                Code Validation (post-Pass 1)
                    │
                    ├─→ Repair Path (issues found that regex can't handle)
                    │   └→ buildRepairPrompt → AI → parse → re-validate
                    │      └→ Better? Use new. Worse? Keep old, escalate.
                    │
                    ├─→ Compromise Path (unsupported types)
                    │   └→ buildCompromisePrompt → AI → parse → tag
                    │
                    └─→ External Retry (conf < 50 after all passes)
                        └→ Call external AI API (Gemini/GPT) with
                           original text + audit log → max 3 retries
                           → re-enters at preClean
                           └→ All 3 fail? Escalate to teacher.

Engine (after successful validation):
  1. Regex parse structure → ParsedTest
  2. Type finalization ([TYPE:] tag → fallback → content correction)
  3. Instruction replacement (type slug → INSTRUCTION_TEMPLATES lookup)
  4. Section ordering (curriculum order)
  5. Marker conversion ({{}} → optionUnderlines, **bold** → preserved, etc.)
  6. Data model transformation (answer key, writing fields, passage, layout, points)
  7. Post-parse validation + warnings
```

> **Why Pass 1 runs before any code/regex processing:** Step 0 (external AI) adds markers and tags to the text, but the base text remains almost as primitive as the original PDF extraction. The internal AI must see this near-raw text to independently assess whether the external AI's analysis is reliable. If regex runs first and restructures the text, the AI would be evaluating our code's work, not the external AI's work — making the confidence assessment unreliable.

> **Why instruction replacement is in the Engine, not Pass 1:** Instruction replacement is a deterministic lookup (`type slug → INSTRUCTION_TEMPLATES[slug]`). Having the AI rewrite instruction text risks hallucination. The Engine does this perfectly with zero cost and zero risk.

> **Layer role constraint (D5):** The Internal AI is "THE JANITOR" — it normalizes text so regex can parse it. It must never produce JSON, never classify types, and never be extended back toward the old 97-line "parse everything" prompt. Classification is the engine's job.
### Design Rationale

**Core principle — division of labor:**
```
External AI:  UNDERSTAND (classify) + SEE (format markers) + EXTRACT (verbatim text)
Internal AI:  CLEAN (restructure) + REPAIR (fix flagged issues) + COMPROMISE (adapt unsupported)
Engine:       PARSE (regex structure) + VALIDATE (type fallback) + TRANSFORM (data model)
```
Each layer does what it's uniquely suited for. The external AI has visual PDF context and Vietnamese language understanding — it classifies. The engine has deterministic regex patterns and the type slug list — it validates and transforms. The internal AI only fires when the text is too messy for regex.

The "code-finds, AI-fixes" architecture is grounded in ACL 2024 research showing LLMs are good at *correcting* errors when error locations are explicitly provided, but poor at *finding* their own errors. Our design leverages this by using deterministic code validation to FIND issues and targeted AI prompts to FIX them. See `standards_assessment.md` for the full 8-standard evaluation.

The decision to have the external AI classify (via `[TYPE:]` tags) rather than removing classification entirely is justified by analysis showing the external AI outperforms the regex classifier on edge cases: generic "Choose the best answer" instructions, non-standard Vietnamese phrasings, mixed-type sections, and unlabeled sections like "Part B". The engine's regex classifier acts as a VALIDATION FALLBACK — if the tag is valid, use it at 100% confidence; if missing or invalid, fall back to the existing instruction-based classifier at 75-93% confidence. Zero regression risk. See `prompt_workload_analysis.md` for the full per-type breakdown.
### Migration Notes: Existing Band-Aid Steps

The current pipeline has 3 steps (validateAIResult, section reconciliation, metadata override) that exist solely to fix the old internal AI's unreliable output. Under the new architecture:

- **validateAIResult (Step 4):** Type normalization (`TYPE_FIX_MAP`) becomes unnecessary if external prompt emits correct `[TYPE:]` tags; phantom ANSWER KEY filtering stays as a safety check; passage extraction from Q#0 becomes unnecessary (regex parser handles PASSAGE: blocks directly).
- **Section Reconciliation (Step 5):** Question-number overlap matching becomes unnecessary since the regex parser handles section detection deterministically. The answer key recovery logic moves into the engine's post-processing step.
- **Metadata Override (Step 6):** `TITLE:/GRADE:/DURATION:/EXAM TYPE:` tag scanning stays — it's cheap and provides a valuable safety net even with the new pipeline.

**Decision:** Steps 4 and 5 should be simplified/removed during integration. Step 6 is kept as a lightweight safety net.

### Key Files
- `thcs-pdf-extraction-prompt.txt` — External prompt (Step 0)
- `thcsDocumentParser.service.ts` — Main pipeline (preClean, parseThcsText)
- `thcs-type-classifier.ts` — Type classification (INSTRUCTION_TYPE_MAP, reclassifyByContent)
- NEW: `thcs-text-validator.ts` — Code validation module (16 issue codes, format confidence scoring)
- NEW: `thcs-prompt-builder.ts` — Fragment registry + builders + parsers
- NEW: `thcs-retry-manager.ts` — Escalation config + circuit breaker + audit logging

### Dependencies
- `groq-sdk` (existing) — Groq API calls
- `@google/generative-ai` (existing) — Gemini API calls
- No new dependencies required

### Reference Documents (in conversation artifacts)
- `pipeline_redesign_spec.md` — Full 6-part architecture (Part 1 contains the regex engine input specification — 40+ ingredients the validation module must check)
- `adaptive_prompt_builder.md` — Fragment registry + builders + parsers + escalation (full TypeScript design)
- `standards_assessment.md` — Research validation (8 standards, 3 gap fixes, ACL 2024 research)
- `pipeline_deep_assessment.md` — Per-step analysis of current pipeline (11 steps, band-aid identification)
- `prompt_workload_analysis.md` — Per-type detection accuracy data + external AI workload division
- `three_layer_division.md` — Three-layer role assignment + proposed internal AI prompt
## Design Decisions (Resolved)

- **D1:** Pass 1 (restructure) uses a **static prompt**, not adaptive. Pass 1 **always runs** on every input — the internal AI is the one that determines whether text is regex-ready because it has access to unified format templates and understands what well-structured text looks like. Test texts come from various teachers with different formatting conventions, so the restructure step is always necessary. Only Pass 2 (repair) uses the adaptive fragment system.
- **D2:** When formatConfidence remains **below 50** after all internal passes (Pass 1 + Pass 2), the system escalates to automated external retry.
- **D3:** Fragment registry is stored as **TypeScript constants** (not JSON/YAML). Simpler for our team size and allows type-checking. Version hashing provides traceability.
- **D4:** External prompt **removes the section name lookup table**. The AI copies section names verbatim from the PDF and adds a `[TYPE: xxx]` tag instead of renaming sections. This reduces hallucination risk and AI cognitive load.
- **D5:** Internal AI is a **text normalizer only** — it must never produce JSON and must never make classification decisions. Its role is "THE JANITOR": clean text so the regex engine can parse it deterministically. This constraint prevents scope creep back toward the old 97-line "parse everything into JSON" prompt.
- **D6:** When formatConfidence < 50 after internal passes, the system uses **automated external API retry (Q1=B)**. The system calls Gemini/GPT directly with original text + audit log. No teacher involvement in the retry loop. Max 3 retries. This uses the project's own API keys, not the teacher's external AI session.
- **D7:** AI-inferred answers are **flagged yellow for teacher confirmation (Q2=B)**. Answers generated by the AI when the answer key is missing are tagged `answerSource: 'ai-inferred'` and displayed with yellow highlighting in the Parse Review Panel. Teachers must verify before publishing.
- **D8:** `reading-announcement` vs `reading-comprehension` distinction is **analytics-only**. Both use the same renderer and two-column layout. Misclassification between them has zero impact on student experience — it only affects analytics categorization. A word-count heuristic (< 120 words) handles ~90% of cases.
- **D9:** The **labor split principle**: External AI handles understanding/classification/extraction (the hard cognitive work). Internal AI handles cleaning/restructuring/compromise (the janitor work). Engine handles parsing/validation/transformation (the deterministic grunt work). Each layer does what it is uniquely best at.
- **D10:** **Instruction replacement is Engine work, not AI work.** Replacing messy instruction text with canonical `INSTRUCTION_TEMPLATES` values is a deterministic lookup (`type slug → template string`). Having the AI rewrite instructions risks hallucination. The Engine does this after type finalization with zero cost and zero risk. This also lightens the internal AI's prompt, keeping it focused on restructuring and confidence assessment.
- **D11:** **Pass 1 runs on near-raw text (post-preClean only).** Step 0 only adds markers and tags — the base text remains almost as primitive as the original PDF extraction. The internal AI must see this near-raw text to independently assess whether the external AI's analysis is reliable. If regex/code processed the text first, the AI would be evaluating our code's work instead of the external AI's work, making its confidence assessment unreliable.
## Open Questions

- [ ] Q1: Should the compromise for "matching" type also consider adding native matching question support in a future iteration?
- [ ] Q2: The `word-reference` type exists for analytics but has zero rendering difference from `reading-comprehension`. Should it remain in the 20-type codename list or be treated as a sub-type?
- [ ] Q3: The dual passage format (flat `passageTitle/passageContent` + nested `passage { content, title }`) is a known maintenance risk. Should we unify them as part of this redesign or defer to a separate cleanup task?
