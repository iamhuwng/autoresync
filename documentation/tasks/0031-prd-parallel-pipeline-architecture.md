# PRD-0031: Parallel Pipeline Architecture for THCS Test Parsing

**Status:** Draft  
**Author:** AI Assistant + User  
**Created:** 2026-03-05  
**Feature Area:** Test Creation → AI Parsing  
**Priority:** P0 — Critical (this redesign fixes root-cause architectural flaws)

---

## 1. Introduction / Overview

The THCS test parsing pipeline transforms text output from an external AI (Gemini/ChatGPT reading a PDF) into a structured `ParsedTest` object that powers the test editor and student renderer. The current implementation uses a **serial waterfall** architecture where text flows through 11 sequential steps — two AI passes plus 9 deterministic transforms. This design has 5 confirmed architectural flaws:

1. The Code Validator receives AI-processed output (not the original text), so it cannot catch issues the AI *introduced*
2. There is no iteration loop — if the first AI pass produces bad output, one repair attempt is made but no re-validation cycle exists
3. The Internal AI runs on 100% of inputs even when text is already well-structured (wasting 3-20s)
4. Compromise runs before repair (operating on messy text)
5. The `preCleanText()` function strips `**bold**` markers — destroying formatting the external prompt explicitly captured

This PRD specifies a **parallel peer-validation architecture** where the Internal AI and Code Validator independently assess the same original text, cross-validate their findings, and iterate until the text is regex-ready — or gracefully degrade with warnings.

### Problem Statement

Teachers paste AI-extracted test text into the system. The current serial pipeline can silently lose formatting, misclassify types, and produce low-quality parse results with no recovery path. The root cause is architectural: each step operates on the *previous step's output* instead of independently assessing the original input.

### Solution

A three-layer parallel architecture:
- **Layer 0 (External AI — "The Brain")**: Extracts text from PDF, classifies types, marks visual formatting. This is the teacher's step — they paste the result into our system.
- **Layer 2+3 (Internal AI + Code Validator — "Parallel Peers")**: Both independently assess the *same original text* from Layer 0. They compare confidence scores and cross-validate. If issues exist, a crossfix loop runs where Code tells AI what's wrong and AI fixes it.
- **Layer 4 (Engine — "The Grunt")**: Deterministic regex parser + post-processing. Takes the validated text and transforms it into the `ParsedTest` data model.

---

## 2. Goals

| ID | Goal | Metric |
|----|------|--------|
| G1 | Parse accuracy | ≥ 95% of tests parsed correctly without manual teacher edits |
| G2 | Formatting preservation | **bold**, __underline__, {{markers}} survive from Step 0 output to student renderer with zero loss |
| G3 | Latency (clean input) | < 5 seconds when both AI and Code agree at ≥ 70% confidence |
| G4 | Latency (crossfix needed) | < 25 seconds for inputs requiring up to 3 crossfix rounds |
| G5 | Zero silent failures | Every parse outcome produces either a valid result or an explicit, actionable error/warning |
| G6 | No regression | All existing successfully-parsed test formats continue to parse correctly |

---

## 3. User Stories

**US-1:** As a teacher, I want to paste my Step 0 output and get an accurate parse within 5 seconds, so that I don't waste time waiting or manually fixing results.

**US-2:** As a teacher, I want bold and underlined words in reading passages to appear correctly in the student view, so that vocabulary and grammar focus words are visible during the test.

**US-3:** As a teacher, I want the system to refuse to parse garbage input with a clear message, so that I know to use the Step 0 prompt when I forget.

**US-4:** As a teacher, I want to see warnings about AI-inferred answers (highlighted differently), so that I can verify them before publishing.

**US-5:** As a teacher, I want the system to attempt to convert unsupported question types (matching, true/false) into supported formats, so that I don't have to rewrite them manually — but I want to see which sections were converted so I can review.

---

## 4. Architecture Overview

### 4.1. The Complete Pipeline Flow

```
┌──────────────────────────────────────────────────────────┐
│  STEP 0: External AI (Gemini/ChatGPT — teacher-facing)   │
│  Reads PDF → produces structured text with markers       │
│  Output: text with TITLE:, [TYPE:], PASSAGE:, {{}},      │
│          **bold**, __underline__, ANSWER KEY, etc.        │
└────────────────────────┬─────────────────────────────────┘
                         │ Teacher pastes into textarea
                         ↓
┌──────────────────────────────────────────────────────────┐
│  STEP 1: Gate Check (is this Step 0 output?)             │
│  Check: has TITLE: OR GRADE: OR any [TYPE:] tag          │
│  AND has at least 1 section header (Roman numeral/Part)  │
│  ├── FAIL → Hard block: "Please use Step 0 Copy Prompt"  │
│  └── PASS → continue                                    │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  STEP 1.5: Pre-Clean (preserve markers!)                 │
│  Strip: citation brackets [1] 【12†】, heading ###/---   │
│  PRESERVE: **bold**, __underline__, {{}}, [TYPE:],       │
│            [WORD BANK:], PASSAGE:, (N điểm), =>          │
└────────────────────────┬─────────────────────────────────┘
                         │
                    cleaned text
                         │
          ┌──────────────┴──────────────┐
          ↓                             ↓
┌─────────────────────┐    ┌──────────────────────────┐
│ STEP 2: Internal AI │    │ STEP 3: Code Validator   │
│ "The Janitor"       │    │ (deterministic regex)    │
│                     │    │                          │
│ Receives:           │    │ Receives:                │
│  • cleaned text     │    │  • SAME cleaned text     │
│                     │    │                          │
│ Does:               │    │ Does:                    │
│  • Restructure for  │    │  • Check ALL ingredient  │
│    regex fitness     │    │    existence (16 checks) │
│  • Split merged Qs  │    │  • Count sections/Qs/As  │
│  • Expand compressed│    │  • Validate [TYPE:] tags │
│    answer keys       │    │  • Check marker presence │
│  • Add missing Q    │    │  • Detect unsupported    │
│    prefixes          │    │    types                 │
│  • Infer answers    │    │                          │
│    if missing        │    │ Returns:                 │
│                     │    │  • formatConfidence (0-100│
│ Returns:            │    │  • issues[] with codes   │
│  • restructuredText │    │  • unsupportedTypes[]    │
│  • confidence (0-100│    │  • stats {}              │
│  • stats {}         │    │                          │
│  • hasInferredAns   │    │                          │
└────────┬────────────┘    └────────────┬─────────────┘
         │                              │
         └──────────┬───────────────────┘
                    ↓
┌──────────────────────────────────────────────────────────┐
│  STEP 4: Decision Tree                                   │
│                                                          │
│  Let A = AI confidence, C = Code confidence              │
│  Let EQUAL = |A - C| ≤ 10                                │
│                                                          │
│  IF A > C (AI more confident, gap > 10):                 │
│     → Use AI's restructured text                         │
│     → Continue to Engine (STEP 6)                        │
│                                                          │
│  IF C > A (Code more confident, gap > 10):               │
│     → Auto recheck: run Crossfix Loop (STEP 5)           │
│                                                          │
│  IF EQUAL AND both > 70:                                 │
│     → Use AI's restructured text                         │
│     → Continue to Engine (STEP 6)                        │
│                                                          │
│  IF EQUAL AND both ≤ 70:                                 │
│     → Auto recheck: run Crossfix Loop (STEP 5)           │
│                                                          │
│  SPECIAL: If AI call failed entirely (network/key error):│
│     → IF Code confidence ≥ 70:                           │
│         Use original cleaned text → Engine directly      │
│     → IF Code confidence < 70:                           │
│         Run Crossfix with Code issues only → Engine      │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  STEP 5: Crossfix Loop (max 3 rounds)                    │
│                                                          │
│  Gold practice: "Code finds errors, AI fixes them."      │
│  (ACL 2024: LLMs correct well when error location given) │
│                                                          │
│  Round N:                                                │
│    1. Code Validator produces issue report:               │
│       • Specific issue codes (MERGED_QUESTIONS, etc.)    │
│       • Line ranges where issues occur                   │
│       • Section text snippets                            │
│    2. Prompt Builder assembles targeted repair prompt:    │
│       • Only fragments for detected issues               │
│       • Includes ORIGINAL text for cross-reference       │
│       • Includes AI's PREVIOUS attempt                   │
│    3. Internal AI receives prompt → produces fixed text  │
│    4. Code re-validates fixed text                       │
│    5. Compare: fewer issues = better? Keep best version  │
│       • If fixed text is WORSE → keep previous best      │
│       • If fixed text is BETTER → use as new base        │
│    6. If confidence ≥ 70 → exit loop → Engine            │
│       If round < 3 → continue loop                       │
│       If round = 3 → use best-so-far + warning           │
│                                                          │
│  After loop exits:                                       │
│    → Check for unsupported types → Compromise (STEP 5b)  │
│    → Then → Engine (STEP 6)                              │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  STEP 5b: Compromise (AFTER crossfix, not before)        │
│                                                          │
│  Triggers: Code Validator detected unsupported types     │
│                                                          │
│  For each unsupported section:                           │
│    1. Try PRIMARY conversion strategy:                   │
│       • matching → mcq-vocabulary                        │
│       • true-false → mcq-grammar (A.True B.False ...)    │
│       • fill-in-no-options → verb-form                   │
│    2. Engine tries to parse converted text               │
│    3. If engine FAILS → try ALTERNATE strategy:          │
│       • matching → verb-form (fill-in fallback)          │
│       • true-false → closest-meaning                     │
│       • fill-in-no-options → mcq-grammar                 │
│    4. If BOTH fail → Raw Text Fallback:                   │
│       • Mark section type as 'raw-text-fallback'         │
│       • Store original raw text in section               │
│       • Tag with [MANUAL-REVIEW]                         │
│       • Student view: display raw text as-is +           │
│         text input field for each question               │
│       • Answer check: string comparison (trimmed,        │
│         case-insensitive) against correct value           │
│       • Live view / Preview: same raw text display       │
│    5. Tag converted sections: [COMPROMISED: X → Y]       │
│                                                          │
│  Skipped types (no conversion possible):                 │
│    • listening, speaking, essay → skip + teacher warning │
│                                                          │
│  Per-section text slicing: AI gets ONLY the relevant     │
│  section, not the entire document (prevents cross-section│
│  mutations). Merge back with reverse-order splicing.     │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  STEP 6: Regex Engine ("The Grunt")                      │
│                                                          │
│  Deterministic text → ParsedTest transformation:         │
│                                                          │
│  6a. PARSE STRUCTURE                                     │
│    • Regex: TITLE/GRADE/DURATION/EXAM TYPE metadata      │
│    • Regex: Section headers + [TYPE:] tags                │
│    • Regex: Question N. + options A./B./C./D.            │
│    • Regex: PASSAGE: blocks                              │
│    • Regex: ANSWER KEY section                           │
│                                                          │
│  6b. TYPE FINALIZATION                                   │
│    • extractExplicitTypeTag (from [TYPE:]) → 99% conf   │
│    • Fallback: INSTRUCTION_TYPE_MAP (26 patterns)        │
│    • Correction: reclassifyByContent (6 patterns)        │
│                                                          │
│  6c. MARKER CONVERSION                                   │
│    • {{phoneme}} → optionUnderlines (pronunciation)      │
│    • {{error}} → underlinedParts (error-identification)  │
│    • {{target_word}} → underlinedParts (synonym/antonym) │
│    • **bold** → preserved in passage.content             │
│    • __underline__ → preserved in passage.content        │
│    • (verb)/(WORD) → kept in questionText for renderer   │
│    • => → split into originalSentence + sentenceStarter  │
│    • (N)______ → ___(N)___ cloze blank format            │
│    • [WORD BANK: ...] → wordBank[] + blankMapping        │
│                                                          │
│  6d. DATA MODEL TRANSFORMATION                           │
│    • ANSWER KEY → per-question correctAnswer             │
│    • Point allocation (N điểm) → section.totalPoints     │
│    • Layout: reading sections → two-column, else single  │
│    • Passage: content + title + wordCount                │
│    • Sentence arrangement: newlines before A./B./C.      │
│    • UUID generation for all entities                    │
│                                                          │
│  6e. INSTRUCTION REPLACEMENT                             │
│    • type slug → ALL_INSTRUCTION_TEMPLATES[slug]         │
│    • Canonical English instruction for each type         │
│    • Only replaces if !isCustomInstruction               │
│                                                          │
│  6f. CURRICULUM ORDERING                                 │
│    • Pronunciation → Stress → Grammar/Vocab →            │
│      Fill-in → Reading → Writing                         │
│    • Unknown types preserve original relative order      │
│                                                          │
│  6g. TAG STRIPPING                                       │
│    • Remove all pipeline-internal tags from display text │
│    • [TYPE:], [STATS:], [AI-INFERRED], [UNCERTAIN],      │
│      [COMPROMISED:], [WORD BANK:], (N điểm),            │
│      [AI-GENERATED], [MANUAL-REVIEW]                     │
│    • KEEP **bold** and __underline__ (renderer consumes) │
│                                                          │
│  6h. POST-PARSE VALIDATION                               │
│    • Zero questions → error                              │
│    • Numbering gaps → warning                            │
│    • Missing answers → warning                           │
│    • Reading without passage → warning                   │
│    • Cloze without blanks → warning                      │
│    • Writing without => → warning                        │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  STEP 7: Parse Review Panel                              │
│                                                          │
│  Shows teacher:                                          │
│    • All sections with question counts and types         │
│    • Confidence score                                    │
│    • Warnings (yellow) and errors (red)                  │
│    • AI-inferred answers highlighted in yellow:          │
│      "These answers were inferred by AI — please verify" │
│    • Compromised sections highlighted in orange:         │
│      "[COMPROMISED: matching → mcq-vocabulary]"          │
│    • Manual-review sections highlighted in orange:       │
│      "This section could not be auto-converted"          │
│    • "Proceed" button → draft editor                     │
└──────────────────────────────────────────────────────────┘
```

### 4.2. Decision Tree as Pseudocode

```typescript
// STEP 4: Decision logic
function decideNextStep(
    aiResult: Pass1Result | null,  // null if AI call failed
    codeReport: ValidationReport,
): 'engine' | 'crossfix' {
    // AI call failed entirely
    if (aiResult === null) {
        // Fall back to Code Validator only
        if (codeReport.formatConfidence >= 70) {
            // Code says the original text is good enough
            return 'engine';  // parse original cleaned text directly
        }
        return 'crossfix';  // try to fix with whatever we have
    }

    const A = aiResult.confidence;
    const C = codeReport.formatConfidence;
    const gap = Math.abs(A - C);
    const isEqual = gap <= 10;

    if (!isEqual && A > C) {
        // AI is more confident → trust AI's restructured text
        // Use aiResult.restructuredText
        return 'engine';
    }

    if (!isEqual && C > A) {
        // Code is more confident → AI's output is suspect
        // Code's issues likely point to real problems
        return 'crossfix';
    }

    if (isEqual && A > 70 && C > 70) {
        // Both agree it's good → proceed
        // Use aiResult.restructuredText
        return 'engine';
    }

    // Both agree it's BAD (≤ 70), or equal and low
    return 'crossfix';
}
```

### 4.3. Which Text Goes to Engine

| Scenario | Text sent to Engine |
|----------|---------------------|
| AI confident, Code agrees → engine | AI's restructured text |
| Both agree > 70 → engine | AI's restructured text |
| AI call failed, Code ≥ 70 → engine | Original cleaned text (pre-AI) |
| After crossfix loop → engine | Best-so-far text from loop |
| After compromise → engine | Post-compromise merged text |

---

## 5. Functional Requirements

### FR-1: Gate Check (Step 0 Output Detection)

**New module.** Before any processing, verify the pasted text came from Step 0.

**Detection criteria (must satisfy at least ONE of group A AND at least ONE of group B):**

Group A (metadata markers — at least 1):
- `TITLE:` on a line
- `GRADE:` on a line
- `EXAM TYPE:` on a line

Group B (structural markers — at least 1):
- A section header matching `/^(?:I{1,3}|IV|V|VI{0,3}|IX|X{0,3})\.\s+/i` or `/^(?:Part|Section|Exercise)\s+/i`
- A `[TYPE: xxx]` tag anywhere in the text

**If detection fails:**
- Show hard block error: *"This text doesn't appear to be Step 0 output. Please use the Copy Prompt button in the test creation wizard to get the extraction prompt, paste it into Gemini or ChatGPT along with your test images, then paste the AI's output here."*
- Do NOT allow parsing to continue.
- Do NOT show a "proceed anyway" option.

**Implementation:** New function `isStep0Output(text: string): boolean` in the pipeline entry point.

---

### FR-2: Pre-Clean Fix (Status: Partially Done)

**Existing file:** `thcsDocumentParser.service.ts` → `preCleanText()`

The `**bold**` stripping bug on lines 405-406 has already been fixed. This FR confirms the following markers MUST be preserved by preCleanText:

| Marker | Example | Purpose |
|--------|---------|---------|
| `**bold**` | `**entrenched**` | Vocabulary words in passages |
| `__underline__` | `__The boy ran home.__` | Tested sentences in passages |
| `{{braces}}` | `{{pro.nun.ci.a.tion}}` | Pronunciation underlines, error ID, synonym/antonym target words, word references |
| `[TYPE: xxx]` | `[TYPE: pronunciation]` | Section type classification |
| `[WORD BANK: ...]` | `[WORD BANK: go / come / make]` | Cloze wordbank words |
| `[AI-INFERRED]` | `1. B [AI-INFERRED]` | AI-guessed answer flag |
| `[COMPROMISED: ...]` | `[COMPROMISED: matching → mcq-vocabulary]` | Compromise conversion flag |
| `[UNCERTAIN]` | `[UNCERTAIN]` | Low-confidence content |
| `[STATS: ...]` | `[STATS: 40 questions, 40 answers, 5 sections]` | Pass 1 statistics |
| `[CONFIDENCE: N]` | `[CONFIDENCE: 85]` | AI self-assessed confidence |
| `(N điểm)` | `(2 điểm)` | Point allocation |
| `(verb)` / `(WORD)` | `______ (play)` / `______ (POLLUTE)` | Verb-form / word-form brackets |
| `=>` / `→` / `➜` / `⇒` | `=> He asked...` | Sentence rewrite separator |
| `(N)______` / `______` | `(36)______` | Cloze blanks (numbered and unnumbered) |
| `PASSAGE:` | `PASSAGE:\nText...` | Passage text delimiter |
| `ANSWER KEY` / `ĐÁP ÁN` | `ANSWER KEY\n1. B` | Answer key header |
| `TITLE:` / `GRADE:` / `DURATION:` / `EXAM TYPE:` | `TITLE: Test Name` | Metadata tags |
| `Question N.` | `Question 1.` | Question prefix |
| `[MANUAL-REVIEW]` | `[MANUAL-REVIEW]` | Compromise failure flag (new) |

**Status:** `**bold**` fix is DONE. Verify all other markers are protected. Add `[MANUAL-REVIEW]` to the preservation list.

---

### FR-3: Parallel Assessment (Steps 2 + 3)

**Architecture change.** Replace the current serial flow (Pass 1 → Validation) with true parallel execution.

**Implementation:**
```typescript
// Both receive the SAME cleaned text
const [aiResult, codeReport] = await Promise.all([
    executePass1(cleaned, retrySession, callInternalAI),
    // Code validator is synchronous but wrapped in Promise for Promise.all
    Promise.resolve(validateOriginalText(cleaned)),
]);
```

**Critical:** The Code Validator currently validates *restructured* text (Pass 1 output). For the parallel architecture, it must validate the *original cleaned text*. This means:

- **Keep the existing `validateRestructuredText()`** — it will be reused in the crossfix loop to validate AI-repaired text
- **Create a new `validateOriginalText()`** — runs the same 16 checks but on the original Step 0 output. The checks are the same; the input is different.
- Both functions share the same detection logic (they check the same markers/patterns), they just operate on different text inputs.

**FR-3a: Code Validator checks on original text (all 16):**

1. `MERGED_QUESTIONS` — Multiple questions on same line
2. `MISSING_Q_PREFIX` — Questions don't start with "Question N."
3. `OPTIONS_INLINE` — Options A./B./C./D. on same line as question
4. `COMPRESSED_ANSWER_KEY` — "1-5: BACDC" format
5. `NUMBERING_GAP` — Non-sequential question numbers
6. `SECTION_NO_QUESTIONS` — Section header with 0 questions inside
7. `AMBIGUOUS_SECTION_SPLIT` — One section has both MCQ and fill-in
8. `MISSING_TYPE_TAG` — Section header without [TYPE:] tag
9. `TYPE_CONTENT_MISMATCH` — [TYPE:] tag doesn't match content patterns
10. `MISSING_PASSAGE_BLOCK` — Reading section without PASSAGE: delimiter
11. `PASSAGE_NO_PARAGRAPHS` — Long passage as single block (no `\n\n`)
12. `MISSING_ANSWER_KEY` — No ANSWER KEY section found
13. `MISSING_ARROW` — Rewrite questions without => separator
14. `MISSING_BRACKETS` — Verb-form/word-form missing (verb)/(WORD)
15. `WORD_BANK_NOT_TAGGED` — Word bank exists but not in [WORD BANK:] format
16. `MISSING_MARKERS` — Pronunciation/error-ID section without {{}} markers

**FR-3b: Code Validator also checks:**
- Type tag validity: every `[TYPE: xxx]` maps to one of 20 supported slugs
- Quantity cross-check: question count ≈ answer key entry count
- Section completeness: each section has instruction + ≥ 1 question
- Marker presence for type: pronunciation sections have `{{}}`, reading sections have `PASSAGE:`, rewrite sections have `=>`

---

### FR-4: Decision Tree (Step 4)

**Implement as described in Section 4.2 pseudocode.**

- The `EQUAL` threshold is `|A - C| ≤ 10`
- When decision is `'engine'` and AI result exists → use `aiResult.restructuredText`
- When decision is `'engine'` and AI result is null → use original `cleaned` text
- When decision is `'crossfix'` → proceed to Step 5

---

### FR-5: Crossfix Loop (Step 5)

**Architecture change.** Replace the current one-shot Pass 2 with an iterative loop.

**Loop pseudocode:**
```typescript
let bestText = aiResult?.restructuredText ?? cleaned;
let bestIssueCount = Infinity;
let bestReport = codeReport;

for (let round = 0; round < 3; round++) {
    // 1. Code produces issue report on current bestText
    const report = validateRestructuredText(bestText, cleaned, aiConfidence);

    // 2. If good enough, exit
    if (report.formatConfidence >= 70 && report.issues.length === 0) {
        break;
    }

    // 3. Build targeted repair prompt from issues
    const repairPrompt = buildRepairPrompt(
        report.issues.map(i => i.code),
        cleaned,      // ORIGINAL for cross-reference
        bestText,      // AI's current attempt
    );

    // 4. AI fixes specific issues
    const fixed = await callInternalAI(systemMessage, repairPrompt);
    if (!fixed) break;  // AI call failed, use bestText

    // 5. Parse response (extract fixed text + reasoning log)
    const parsed = parseAIRepairResponse(fixed);

    // 6. Re-validate
    const newReport = validateRestructuredText(parsed.fixedText, cleaned, aiConfidence);

    // 7. Better or worse?
    if (newReport.issues.length < bestIssueCount) {
        bestText = parsed.fixedText;
        bestIssueCount = newReport.issues.length;
        bestReport = newReport;
    }
    // If worse → keep previous best, try next round with escalated model
}

// After loop: bestText goes to compromise check, then engine
```

**Key details:**
- Each round uses the retry manager's escalation chain (Groq → Gemini Flash → next round)
- The prompt includes BOTH the original text AND the AI's previous attempt
- The prompt builder assembles ONLY fragments for detected issues (not all 16)
- Reasoning log is captured for diagnostics
- If round 3 exhausts without reaching 70% confidence → use best-so-far + warning: *"Parse confidence is low ({N}%). Please review carefully."*

---

### FR-6: Compromise Step (Step 5b — AFTER crossfix)

**Architecture change.** Move compromise to AFTER the crossfix loop, not before.

**Current (wrong) order:** Compromise → Repair  
**Correct order:** Crossfix loop → Compromise → Engine

**Rationale:** Compromise should operate on the cleanest possible text. Running it before repair means it converts messy text, leading to worse conversions.

**Conversion strategies (2 per unsupported type):**

| Unsupported Type | Primary Strategy | Alternate Strategy |
|------------------|------------------|--------------------|
| `matching` | → `mcq-vocabulary` | → `verb-form` |
| `true-false` | → `mcq-grammar` (A.True B.False C.Not Given) | → `closest-meaning` |
| `fill-in-no-options` | → `verb-form` | → `mcq-grammar` |
| `translation` | → `sentence-rewrite` | → skip + warning |
| `listening` | → skip + warning | — |
| `speaking` | → skip + warning | — |
| `essay` | → skip + warning | — |

**Failure cascade:**
1. Try primary strategy → engine parses converted text
2. If engine fails → try alternate strategy → engine parses
3. If both fail → **Raw Text Fallback** (see FR-12):
   - Set section type to `raw-text-fallback`
   - Store the original raw section text in `section.rawText`
   - Tag with `[MANUAL-REVIEW]`
   - Student view renders the raw text as-is with a text input field per question
   - Answer checking uses trimmed, case-insensitive string comparison against `correctAnswer`
   - Parse Review Panel shows section in orange: *"This section uses raw text display — students type answers manually"*

**Per-section text slicing (retain from current implementation):**
- AI receives ONLY the relevant section text, not the entire document
- Prevents cross-section mutations
- Merge back into full text using reverse-index-order splicing (preserves line offsets)

---

### FR-7: External Prompt Reassessment (Step 0)

**File:** `thcs-pdf-extraction-prompt.txt` (193 lines)

**Status: 7 issues found.** The prompt covers 10 of 20 types with extraction rules. 6 types have zero guidance. Several rules are ambiguous or dangerous.

**What's currently correct (no changes needed):**
- Section 1: METADATA tags (TITLE, GRADE, DURATION, EXAM TYPE) ✅
- Section 2: Copy section names exactly + append [TYPE:] tag ✅
- Section 4: Instruction text extraction ✅
- Section 5: Question format (Question N. + options on own lines) ✅
- Section 7: Answer key format ✅
- Section 8: General rules (mostly) ✅

**Issue 1: DANGEROUS type default (line 45)** `CRITICAL`

Current: `If the section does not match any type, use [TYPE: mcq-grammar] as default.`

**Problem:** The engine's type classifier gives `[TYPE:]` tags **99% confidence** (Phase 0 authority). When the external AI slaps `mcq-grammar` on an unknown section, the engine trusts it blindly. The engine's fallback classification (regex pattern matching, instruction text analysis) never fires. This causes misclassification of sentence-arrangement, dialogue-response, and closest-meaning sections.

**Fix:** Replace line 45 with:
```
If the section does not match any type above, OMIT the [TYPE:] tag entirely.
Write only the section header without any tag. The downstream engine will classify it.
Do NOT guess — an absent tag is better than a wrong tag.
```

**Issue 2: 6 types MISSING extraction rules in Section 6** `HIGH`

The slug table (Section 3, lines 22-43) lists 20 types. Section 6 (lines 71-164) provides per-type extraction rules for only 14 of them (counting shared rules). 6 types have **zero extraction guidance**:

| Missing Type | Why It Matters | Add This Rule |
|-------------|----------------|---------------|
| `sentence-arrangement` | Very common in THCS. Without guidance, AI formats scrambled words incorrectly | Add: "Question text = the scrambled words/phrases separated by slashes. Options = full reordered sentences (A./B./C./D.)" |
| `dialogue-response` | Common in grade 6-8. AI may merge the dialogue context with options | Add: "Extract the dialogue exchange verbatim as the question text. Options are the response choices." |
| `closest-meaning` | Common in grade 9-10. AI may confuse with synonym-mcq | Add: "Question text = the full sentence. Options = alternative sentences with closest meaning. Do NOT use {{}} markers (no target word)." |
| `mcq-grammar` | Most common type but no explicit format rule | Add: "Standard MCQ format. Keep blanks as 6 underscores (______). No special markers." |
| `mcq-vocabulary` | Same format as mcq-grammar but distinct type | Add: "Same format as mcq-grammar. Type tag differentiates vocabulary focus from grammar focus." |
| `mcq-sign-notice` | Runs on short texts (signs, notices). AI may not include the sign text properly | Add: "Include the sign/notice text as a PASSAGE: block before the questions, same as reading-announcement." |

**Fix:** Add a subsection in Section 6 for each missing type with format example and clear guidance.

**Issue 3: reading-announcement missing explicit PASSAGE: example (line 101-103)** `MEDIUM`

Current: Lines 101-103 mention `reading-announcement` together with `reading-comprehension` but the example (lines 106-117) only shows `reading-comprehension`. The `reading-announcement` format is implied but never explicitly demonstrated.

**Problem:** The Code Validator checks for `PASSAGE:` delimiter in reading sections. If the external AI doesn't include `PASSAGE:` for announcements, the validator flags `MISSING_PASSAGE_BLOCK`.

**Fix:** Add an explicit reading-announcement example:
```
READING-ANNOUNCEMENT:
Use reading-announcement for SHORT texts (notices, ads, letters, timetables, signs).

  VII. READING [TYPE: reading-announcement]
  Read the following advertisement and answer the questions.

  PASSAGE:
  *** SUMMER ENGLISH CAMP 2026 ***
  Dates: July 15 - August 10
  Location: Youth Cultural Center, Ho Chi Minh City
  Fee: 2,500,000 VND (includes materials and lunch)

  Question 20. How long does the summer camp last?
  A. About 4 weeks
  ...
```

**Issue 4: No guidance for 3-option MCQs (line 64-65)** `LOW`

Current: Section 5 rules assume 4 options (A/B/C/D) always. But some THCS tests (especially grade 6-7) use only 3 options (A/B/C).

**Fix:** Add to Section 5 rules:
```
- If a question has only 3 options (A, B, C), extract all three. Do NOT fabricate a 4th option.
```

**Issue 5: No multi-page passage handling (line 186)** `LOW`

Current: Line 186 handles options cut across pages, but large reading passages that span 2+ pages have no explicit guidance.

**Fix:** Add to Section 8:
```
- If a reading passage spans multiple pages, combine it into ONE continuous PASSAGE: block
```

**Issue 6: Vague figure/image placement (line 187)** `LOW`

Current: `write: [Figure: description of the image]` but doesn't say WHERE to place this tag relative to the question.

**Fix:** Clarify:
```
- If a question references an image/figure: write [Figure: description] on its own line
  immediately above the question that references it.
```

**Issue 7: mcq-sign-notice should use PASSAGE: like reading-announcement** `MEDIUM`

The slug table says `mcq-sign-notice` is for "Sign, notice, or advertisement interpretation MCQ." This is functionally identical to `reading-announcement` but there's no extraction rule telling the AI to include the sign/notice text as a `PASSAGE:` block. Without this, the sign text may appear as part of the instruction or question text, which breaks the renderer.

**Fix:** Already addressed in Issue 2 table above — add explicit rule.

**Net impact:** Substantial changes. 1 critical fix, 6 new extraction rules, 4 structural clarifications, multiple type-identification hints. Total ~80 new lines added to the prompt.

**Issue 8: Compact answer key CONFLICTS with Code Validator** `MEDIUM`

Current (line 174-176): `Alternative compact format (also accepted): 1.B  2.C  3.D  4.C  5.D`

**Problem:** The Code Validator flags `COMPRESSED_ANSWER_KEY` when it encounters `1-5: BACDC` format. But the prompt also accepts `1.B  2.C  3.D` on one line. While this isn't the `1-5: BACDC` compressed format, it's still less explicit than one-per-line. The crossfix loop wastes a round expanding this format that the prompt explicitly told the AI was acceptable.

**Fix:** Remove the "Alternative compact format" guidance. Change to:
```
ALWAYS use one answer per line. Do NOT put multiple answers on one line.
```

**Issue 9: No type-identification HINTS in slug table** `HIGH`

The slug table (Section 3) has a "Use when" column — but it describes the *question type*, not the **instruction text indicators** the AI should look for. The external AI reads the PDF instruction text (e.g., "Mark the letter A, B, C, or D to indicate the sentence closest in meaning") and must map it to a slug. Without explicit mapping from **common Vietnamese/English instruction patterns → type slug**, the AI guesses wrong.

**Fix:** Add a Section 3b: "Common instruction text → Type mapping":

```
=== 3b. INSTRUCTION PATTERN → TYPE MAPPING ===
Use these instruction text patterns to identify the correct [TYPE:] tag:

INSTRUCTION CONTAINS                          → TYPE TAG
"underlined part differs in pronunciation"    → pronunciation
"primary stress" / "stressed differently"     → word-stress
"Choose the best answer" (generic grammar)    → mcq-grammar
"Choose the word/phrase" (vocabulary focus)    → mcq-vocabulary
"sign" / "notice" / "advertisement" / "biển"  → mcq-sign-notice
"suitable response" / "dialogue" / "exchange" → dialogue-response
"Read the passage" / "đọc hiểu"             → reading-comprehension
"announcement" / "notice" / "advertisement"   → reading-announcement
"closest in meaning to the sentence"          → closest-meaning
"opposite in meaning" / "trái nghĩa"        → antonym-mcq
"closest in meaning" (to a WORD, not sentence)→ synonym-mcq
"error" / "needs correction" / "tìm lỗi"    → error-identification
"Put in correct order" / "arrange" / "sắp xếp"→ sentence-arrangement
"sentence from cues" / "given words"          → sentence-arrangement
"correct form of the verb" / "chia động từ"  → verb-form
"correct form of the word" (CAPITAL letters)  → word-form
"Rewrite" / "viết lại" (no keyword given)    → sentence-rewrite
"Rewrite using the word given" / "keyword"    → sentence-rewrite-keyword
"word bank" / "words in the box"              → reading-cloze-wordbank
"blank" + passage + numbered gaps             → reading-cloze-mcq
"refers to" / "pronoun" / "the word X refers" → word-reference
```

**Issue 10: Mixed-content sections not handled** `MEDIUM`

The prompt has no guidance for what the AI should do when a single section in the PDF contains mixed question types. For example:
- Part III: starts with 5 MCQ grammar questions, then switches to 5 fill-in questions
- Vietnamese tests often bundle different skills under one Roman numeral

**Problem:** The Code Validator checks for `AMBIGUOUS_SECTION_SPLIT`. If the AI doesn't split these, the engine assigns one type to the whole section, leading to misparse for half the questions.

**Fix:** Add to Section 2:
```
If a section contains questions of DIFFERENT types (e.g., both MCQ and fill-in-the-blank),
split it into sub-sections. Use the section name with a suffix:
  III. LANGUAGE (a) [TYPE: mcq-grammar]
  ...MCQ questions...
  III. LANGUAGE (b) [TYPE: verb-form]
  ...fill-in questions...
```

**Issue 11: Content-based indicators not taught** `MEDIUM`

The engine has a `reclassifyByContent()` phase (6 patterns) that corrects misclassified types by examining content patterns. But this is a rescue mechanism — the prompt should prevent the misclassification in the first place by teaching the AI these content patterns:

| Content Pattern | What It Indicates | Prompt Should Say |
|-----------------|-------------------|-------------------|
| Options like `a-b-c-d-e`, `b-a-c-e-d` | sentence-arrangement (ordering) | "If options look like ordering sequences (e.g., a-b-c-d), this is sentence-arrangement" |
| Question text has `word / word / word` (3+ segments separated by `/`) | sentence-arrangement (cues) | "If the question text is fragmented words separated by slashes, this is sentence-arrangement" |
| Options are full sentences (5+ words each) under a "synonym/meaning" instruction | closest-meaning, NOT synonym-mcq | "If options are full sentences, use closest-meaning. If options are single words, use synonym-mcq" |
| Section has PASSAGE: + comprehension questions (who/what/where/when) | reading-comprehension | Already covered ✅ |
| Instruction says "rewrite" but questions have 4 MCQ options with A-D answers | closest-meaning, NOT sentence-rewrite | "If the section has MCQ options (A/B/C/D) with paraphrased sentences, use closest-meaning even if the instruction says 'rewrite'" |
| Instruction says "cloze" but passage has [WORD BANK:] | reading-cloze-wordbank, NOT reading-cloze-mcq | "If there is a word bank, ALWAYS use reading-cloze-wordbank regardless of whether there are also MCQ options" |

**Fix:** Add the differentiators from the table above to the slug table descriptions and Section 6 extraction rules.


---

### FR-8: No Circuit Breaker — Key Cooldown Only

**Architecture change.** Remove the per-session circuit breaker (`MAX_TOTAL_AI_CALLS_PER_SESSION = 5`). Rely on the existing key cooldown system instead.

**Rationale:** The project has multiple API keys per provider. The key cooldown system (implemented in `ai-api-key-management`) already handles:
- Benching rate-limited keys based on provider-specific recovery times
- Rotating to the next available key
- Falling back across providers (Groq → Gemini)

**What changes:**
- Remove `createRetrySession(5)` call
- Remove `retrySession.totalCalls` checks
- The retry chain still has a natural bound: max 3 crossfix rounds × 1 call each + 1 Pass 1 call + up to 3 compromise calls = ~7 calls maximum per parse
- If ALL keys are exhausted, the key cooldown system returns null → pipeline uses best-so-far text

---

### FR-9: AI-Inferred Answer Flagging

**Status: Already implemented.** Confirm preservation.

- Internal AI marks inferred answers with `[AI-INFERRED]` tag
- Engine's `consumeAITags()` extracts these and sets `answerSource: 'ai-inferred'`
- Parse Review Panel shows these answers highlighted in yellow
- Teacher must verify before publishing

---

### FR-10: Reasoning Log Capture

**Status: Already implemented.** Confirm preservation.

- AI returns `--- FIXED TEXT ---` and `--- REASONING LOG ---` sections
- `parseAIRepairResponse()` extracts both
- Reasoning entries (ISSUE/ACTION/REASONING/CONFIDENCE) are logged
- Available in diagnostics panel

---

### FR-11: Engine Enhancements

**Status: Already implemented in `thcs-engine-enhancements.ts`.** Confirm preservation of:

1. `consumeAITags()` — extract [AI-INFERRED], [UNCERTAIN], [COMPROMISED]
2. `applyPointAllocation()` — (N điểm) → per-section points
3. `replaceInstructions()` — type slug → canonical English template
4. `sortSectionsByCurriculum()` — Vietnamese exam convention ordering
5. `stripDisplayTags()` — remove all pipeline-internal tags from display
6. `validateParsedOutput()` — post-parse quality checks → warnings

**New addition:** Add `[MANUAL-REVIEW]` to the `PIPELINE_TAGS` array for stripping.

---

### FR-12: Raw Text Fallback Renderer (Compromise Failure Path)

**New component.** When both compromise strategies fail for a section, the section is rendered using a universal raw-text fallback instead of being dropped or dead-ending.

**Data model addition:**
```typescript
// Add to THCSSection type
interface THCSSection {
    // ...existing fields...
    rawText?: string;           // Original raw section text (only set for raw-text-fallback)
    isRawTextFallback?: boolean; // True when this section failed compromise
}
```

**How it works:**

1. **Pipeline side:** When compromise step 3 triggers (both strategies failed):
   - Set `section.isRawTextFallback = true`
   - Set `section.rawText = originalSectionText` (the raw text of just that section)
   - Set `section.defaultQuestionType = 'raw-text-fallback'` (new type slug)
   - Parse whatever questions are extractable from the raw text (best-effort regex)
   - For each extracted question, set `correctAnswer` from the answer key if available
   - If no questions extractable, create 1 question per line that looks like a question

2. **Live View / Preview (teacher-facing):**
   - Display the raw text content as-is inside a bordered container
   - Show an orange banner: *"This section could not be auto-converted. Students will see the raw text and type their answers."*
   - Teacher can still edit the raw text in the editor

3. **Student View:**
   - Display the raw section text as formatted pre-text (preserve line breaks, spacing)
   - For each question in the section: render a text input field (`<input type="text" />`) below the question text
   - Student types their answer into the text field
   - Style: consistent with the existing THCS student view design (see `student-view-design` skill)

4. **Answer Checking:**
   - Compare student's input against `correctAnswer` using:
     ```typescript
     function checkRawTextAnswer(studentAnswer: string, correctAnswer: string): boolean {
         const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
         return normalize(studentAnswer) === normalize(correctAnswer);
     }
     ```
   - Trimmed, case-insensitive, whitespace-normalized comparison
   - If `correctAnswer` is empty or `'?'` → mark as "teacher will grade manually" (no auto-check)

5. **Component:** `THCSRawTextFallback.tsx`
   - Props: `section: THCSSection`, `onAnswerChange: (questionId, answer) => void`
   - Renders raw text + input fields
   - No Mantine components (per Rule 15)

---

## 6. Non-Goals (Out of Scope)

1. **New question type support** — This PRD does NOT add new supported types. It only improves parsing of the existing 20 types and compromises unsupported ones.
2. **Student view rearchitecture** — No changes to existing renderers. The only addition is a new `RawTextFallback` renderer for compromise-failed sections (FR-12).
3. **External AI API calls from our system** — Step 0 is teacher-facing (manual paste). We do NOT call Gemini/ChatGPT automatically for Step 0 extraction. (External retry in Step 5 calls our own internal AI, not the teacher's external AI.)
4. **Teacher comparison table** — Originally discussed but removed. The pipeline is fully automated; teachers see only the final Parse Review Panel.
5. **Vietnamese language handling in the engine** — Step 0 external AI handles Vietnamese recognition. Internal AI handles multilingual text. Engine replaces instructions with canonical English templates. No Vietnamese-specific regex needed.
6. **Mantine components** — Per project Rule 15, no Mantine imports anywhere.

---

## 7. Technical Considerations

### 7.1. File Structure

| File | Action | Purpose |
|------|--------|---------|
| `thcsDocumentParser.service.ts` | **MODIFY** | Rewrite `parseThcsText()` with parallel architecture + new decision tree |
| `thcs-text-validator.ts` | **MODIFY** | Add `validateOriginalText()` function (shares detection logic with existing `validateRestructuredText()`) |
| `thcs-pass1-restructure.ts` | **KEEP** | Internal AI Pass 1 — no changes needed |
| `thcs-pass2-repair.ts` | **REWRITE** | Replace one-shot repair with crossfix loop orchestration |
| `thcs-compromise-step.ts` | **MODIFY** | Add alternate conversion strategies per type + [MANUAL-REVIEW] fallback |
| `thcs-prompt-builder.ts` | **KEEP** | Fragment registry + builders — no changes needed |
| `thcs-retry-manager.ts` | **MODIFY** | Remove circuit breaker; keep retry chain escalation |
| `thcs-engine-enhancements.ts` | **MODIFY** | Add [MANUAL-REVIEW] to PIPELINE_TAGS |
| `thcs-external-retry.ts` | **DELETE or KEEP** | External retry module — assess if still needed with new crossfix loop |
| `thcs-pdf-extraction-prompt.txt` | **MINOR MODIFY** | Line 45 default type note + [MANUAL-REVIEW] awareness |
| `thcs-diagnostic-log.ts` | **KEEP** | Diagnostic logging — no changes needed |

### 7.2. Dependencies

- No new npm packages required
- Existing dependencies: `groq-sdk`, `@google/generative-ai`
- AI key management: existing `ai-api-key-management` system

### 7.3. Integration Points

The pipeline entry point is `parseThcsText()` in `thcsDocumentParser.service.ts`. It is called from `THCSSetupStep.tsx` (line 496). The output interface `ParsedTest` does NOT change — downstream consumers (draft converter, editor, renderer) are unaffected.

### 7.4. Testing Strategy

**Unit tests (per module):**
- `thcs-text-validator.test.ts` — add tests for `validateOriginalText()`
- `thcs-pass2-repair.test.ts` — rewrite for crossfix loop (3 rounds, better/worse comparison)
- `thcs-compromise-step.test.ts` — add alternate strategy tests + raw-text-fallback
- Gate check: test `isStep0Output()` with valid/invalid inputs
- `THCSRawTextFallback.test.tsx` — render raw text, input fields, answer checking

**Integration test:**
- `paste-parse-regression.test.ts` — existing regression test must pass unchanged (no regression)
- Add new test case: well-structured input → both AI and Code agree → auto-proceed (fast path)
- Add new test case: messy input → crossfix loop runs → improves confidence

**Edge case tests:**
- AI call fails entirely → Code fallback
- Crossfix makes text worse → keeps previous best
- Both strategies fail in compromise → raw-text-fallback renderer with text input
- Input lacks Step 0 markers → hard block
- Input is too short (< 50 chars) → existing error preserved

---

## 8. Complete Marker Inventory (19 markers)

This is the definitive list of markers that flow through the pipeline. Each marker has a **producer** (who creates it), a **consumer** (who reads it), and a **lifecycle** (when it's stripped).

| # | Marker | Example | Producer | Consumer | Stripped By |
|---|--------|---------|----------|----------|-------------|
| 1 | `**bold**` | `**entrenched**` | Step 0 (external AI) | PassageContent renderer | NEVER (renderer consumes) |
| 2 | `__underline__` | `__He ran home.__` | Step 0 | PassageContent renderer | NEVER (renderer consumes) |
| 3 | `{{braces}}` | `{{a}}ccept` | Step 0 | Draft converter → optionUnderlines | Draft converter strips |
| 4 | `[TYPE: xxx]` | `[TYPE: pronunciation]` | Step 0 | Type classifier (extractExplicitTypeTag) | stripDisplayTags |
| 5 | `[WORD BANK: ...]` | `[WORD BANK: go / come]` | Step 0 | Draft converter → wordBank[] | stripDisplayTags |
| 6 | `(N điểm)` | `(2 điểm)` | Step 0 | Engine → applyPointAllocation | stripDisplayTags |
| 7 | `PASSAGE:` | `PASSAGE:\nText...` | Step 0 | Regex engine → passageText | Consumed during parse |
| 8 | `ANSWER KEY` | `ANSWER KEY\n1. B` | Step 0 | Regex engine → answerKey | Consumed during parse |
| 9 | `TITLE:` / `GRADE:` / etc. | `TITLE: Test 1` | Step 0 | Metadata override | Consumed during parse |
| 10 | `Question N.` | `Question 1.` | Step 0 | Regex engine → questions[] | Consumed during parse |
| 11 | `(verb)` / `(WORD)` | `______ (play)` | Step 0 | Draft converter → questionText | Preserved for renderer |
| 12 | `=>` / `→` / `➜` / `⇒` | `=> He asked...` | Step 0 | Draft converter → originalSentence + sentenceStarter | Consumed during split |
| 13 | `(N)______` / `______` | `(36)______` | Step 0 | Draft converter → ___(N)___ blanks | Transformed during parse |
| 14 | `[CONFIDENCE: N]` | `[CONFIDENCE: 85]` | Pass 1 (internal AI) | parsePass1Response → confidence | Stripped by parser |
| 15 | `[STATS: ...]` | `[STATS: 40 questions...]` | Pass 1 | parsePass1Response → stats | stripDisplayTags |
| 16 | `[AI-INFERRED]` | `1. B [AI-INFERRED]` | Pass 1 | consumeAITags → answerSource | stripDisplayTags |
| 17 | `[UNCERTAIN]` | `[UNCERTAIN]` | Pass 1 / Pass 2 | consumeAITags → uncertainCount | stripDisplayTags |
| 18 | `[COMPROMISED: ...]` | `[COMPROMISED: matching → mcq]` | Compromise step | consumeAITags → compromisedSections | stripDisplayTags |
| 19 | `[MANUAL-REVIEW]` | `[MANUAL-REVIEW]` | Compromise step (NEW) | Pipeline → sets `isRawTextFallback=true`, Parse Review Panel → orange highlight, Student view → raw text + text input | stripDisplayTags |

---

## 9. Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Parse accuracy (first attempt) | ~80% | ≥ 95% | Regression test pass rate + teacher edit count |
| Formatting preservation | Broken (bold stripped) | 100% | Automated test: marker presence in ParsedTest |
| Clean-input latency | 5-20s (always runs AI) | < 5s | Console timer in parseThcsText |
| Crossfix-needed latency | N/A (no crossfix) | < 25s | Console timer |
| Silent failures | Unknown count | 0 | Every parse produces result OR error — no empty returns |

---

## 10. Open Questions

None. All clarifying questions have been resolved through the design conversation.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **Step 0** | The external AI (Gemini/ChatGPT) that reads the PDF and produces structured text. Teacher-facing. |
| **Pre-clean** | The `preCleanText()` function that strips citation brackets and heading artifacts while preserving markers. |
| **Pass 1** | The Internal AI's initial restructure pass (The Janitor). |
| **Code Validator** | The deterministic regex-based validation module. |
| **Crossfix loop** | The iterative repair cycle: Code finds issues → AI fixes → Code re-validates → repeat. |
| **Compromise** | Converting an unsupported question type into the closest supported format. |
| **Engine** | The deterministic regex parser + post-processing pipeline (The Grunt). |
| **ParsedTest** | The output data model: `{ metadata, sections[], answerKey, warnings[] }`. |
| **Marker** | A text pattern (e.g., `**bold**`, `[TYPE: xxx]`) that carries pipeline-internal data. |
| **[MANUAL-REVIEW]** | Flag indicating a section that failed automatic compromise. Triggers the raw-text-fallback renderer: students see the raw text and type answers into text fields. |
| **Raw Text Fallback** | A universal fallback renderer for sections where both compromise strategies failed. Displays raw text + text input fields for student answers. |
