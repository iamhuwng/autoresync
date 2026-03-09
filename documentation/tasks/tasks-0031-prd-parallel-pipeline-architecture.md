# Task List: PRD-0031 — Parallel Pipeline Architecture

**PRD:** [0031-prd-parallel-pipeline-architecture.md](./0031-prd-parallel-pipeline-architecture.md)
**Generated:** 2026-03-05

---

## Relevant Files

### Pipeline Core (src/services/test-creation/)
- `thcsDocumentParser.service.ts` — Main orchestrator. **MODIFY**: rewrite `parseThcsText()` with parallel architecture + gate check + decision tree
- `thcs-text-validator.ts` — Code Validator. **MODIFY**: add `validateOriginalText()` for parallel assessment
- `thcs-pass1-restructure.ts` — Internal AI Pass 1. **MODIFY**: remove internal circuit breaker check (lines 171-174)
- `thcs-pass2-repair.ts` — Repair module. **REWRITE**: replace one-shot repair with crossfix loop (3 rounds)
- `thcs-compromise-step.ts` — Compromise. **MODIFY**: add alternate strategies + raw-text-fallback cascade
- `thcs-prompt-builder.ts` — Fragment builder. **MODIFY**: add 3 alternate compromise templates (matching-alt, true-false-alt, gap-fill-alt)
- `thcs-retry-manager.ts` — Retry logic. **MODIFY**: remove circuit breaker, keep retry chain escalation
- `thcs-engine-enhancements.ts` — Post-parse. **MODIFY**: add `[MANUAL-REVIEW]` + `[CONFIDENCE:]` to PIPELINE_TAGS
- `thcs-external-retry.ts` — External retry. **REMOVE**: replaced by crossfix loop. Remove call from orchestrator.
- `thcs-type-classifier.ts` — Type classifier. **KEEP**: no changes (engine-side classification already works)
- `thcs-diagnostic-log.ts` — Logging. **KEEP**: no changes needed

### External Prompt
- `thcs-pdf-extraction-prompt.txt` — Step 0 prompt. **MODIFY**: 11 issues to fix (see FR-7)

### Data Types
- `types/thcs-test.types.ts` — Type definitions. **MODIFY**: add `rawText`, `isRawTextFallback` to THCSSection; add `'raw-text-fallback'` to THCSQuestionType

### Existing Tests
- `thcsDocumentParser.service.test.ts` — Orchestrator tests. **MODIFY**: update for new parallel flow
- `thcs-text-validator.test.ts` — Validator tests. **MODIFY**: add tests for `validateOriginalText()`
- `thcs-pass2-repair.test.ts` — Repair tests. **REWRITE**: test crossfix loop (3 rounds, better/worse)
- `thcs-compromise-step.test.ts` — Compromise tests. **MODIFY**: add alternate strategy + fallback tests
- `thcs-retry-manager.test.ts` — Retry tests. **MODIFY**: remove circuit breaker tests
- `thcs-engine-enhancements.test.ts` — Engine tests. **MODIFY**: add `[MANUAL-REVIEW]` tag test
- `thcs-external-retry.test.ts` — External retry tests. **ASSESS**: may be removed

### New Files to Create
- `components/thcs-student/THCSRawTextFallback.tsx` — Raw text fallback renderer (student view)
- `components/thcs-student/THCSRawTextFallback.test.tsx` — Tests for raw text fallback

### Editor / Review Panel
- `components/thcs-editor/THCSParseReviewPanel.tsx` — **MODIFY**: add raw-text-fallback orange banner
- `components/thcs-editor/THCSSectionBlock.tsx` — **MODIFY**: render raw-text-fallback in editor view

### Student Renderer
- `components/thcs-student/THCSTestLayout.tsx` — **MODIFY**: route `raw-text-fallback` sections to `THCSRawTextFallback` component (section-level routing, NOT question-level)

### Auto-Marking
- `services/thcsAutoMarking.service.ts` — **MODIFY**: add `checkRawTextAnswer()` for raw-text-fallback grading

### Notes
- Unit tests should be placed alongside the code files they are testing
- Use `npx vitest run [optional/path]` to run tests
- NO Mantine components in any new or modified files (Rule 15)
- All new student-facing components must follow the `student-view-design` skill for styling
- **⚠️ LINE NUMBERS**: All line numbers in this task list are approximate and based on the codebase at generation time. Earlier tasks may shift line numbers for later tasks. Always **use the function/variable name** to locate the correct insertion point, not the line number alone.

---

## Tasks

- [x] 1.0 Update External Prompt — Fix All 11 FR-7 Issues in `thcs-pdf-extraction-prompt.txt`
  - [x] 1.1 **Issue 1 (CRITICAL): Remove dangerous type default.**
    - Open `src/services/test-creation/thcs-pdf-extraction-prompt.txt`
    - Go to line 45. Current text: `If the section does not match any type, use [TYPE: mcq-grammar] as default.`
    - Replace the ENTIRE line 45 with these 3 lines:
      ```
      If the section does not match any type above, OMIT the [TYPE:] tag entirely.
      Write only the section header without any tag. The downstream engine will classify it.
      Do NOT guess — an absent tag is better than a wrong tag.
      ```
    - **WHY**: When [TYPE: mcq-grammar] is stamped on an unknown section, the engine trusts it at 99% confidence and never runs its own classification. This is the root cause of misclassification bugs.
    - **VERIFY**: Search for the old text "use [TYPE: mcq-grammar] as default" — it must NOT exist in the file after this change.

  - [x] 1.2 **Issue 2 (HIGH): Add 6 missing extraction rules to Section 6.**
    - Go to line 164 (after `SENTENCE-REWRITE / SENTENCE-REWRITE-KEYWORD` section, before `=== 7. ANSWER KEY ===`)
    - Insert the following 6 new rule blocks BEFORE the `=== 7. ANSWER KEY ===` line. Copy them EXACTLY:
      ```
      SENTENCE-ARRANGEMENT:
      Question text = the scrambled words/phrases. Options = full reordered sentences.
        V. ARRANGE THE WORDS [TYPE: sentence-arrangement]
        Put the words in the correct order to make a meaningful sentence.

        Question 21. school / every day / goes / She / to
        A. She goes to school every day.
        B. She to school goes every day.
        C. Every day she goes to school.
        D. Goes she to school every day.

      If options look like ordering sequences (e.g., a-b-c-d-e, c-a-d-b-e), this is also sentence-arrangement.
      If the question text is fragmented words separated by slashes (/), this is sentence-arrangement.

      DIALOGUE-RESPONSE:
      Extract the dialogue exchange verbatim as the question text. Options are the response choices.
        VI. COMMUNICATION [TYPE: dialogue-response]
        Choose the most suitable response to complete each exchange.

        Question 25. "Would you like to go to the cinema tonight?" - "______"
        A. Yes, I'd love to.
        B. No, I don't like it.
        C. Yes, please do.
        D. That's right.

      CLOSEST-MEANING:
      Question text = the full original sentence. Options = alternative sentences with closest meaning.
      Do NOT use {{}} markers (there is no single target word).
      If options are full sentences (5+ words each), use closest-meaning.
      If options are single words, use synonym-mcq instead.
        VIII. SENTENCE TRANSFORMATION [TYPE: closest-meaning]
        Choose the sentence closest in meaning to the given one.

        Question 30. "You should study harder," the teacher said to me.
        A. The teacher advised me to study harder.
        B. The teacher told me study harder.
        C. The teacher said me to study harder.
        D. The teacher asked me study harder.

      If the instruction says "rewrite" but questions have 4 MCQ options (A/B/C/D) with paraphrased sentences, use closest-meaning, NOT sentence-rewrite.

      MCQ-GRAMMAR / MCQ-VOCABULARY:
      Standard MCQ format. Keep blanks as 6 underscores (______). No special markers needed.
      Use mcq-grammar for grammar focus (tense, preposition, conjunction, etc.).
      Use mcq-vocabulary for vocabulary focus (word meaning, phrasal verb, collocation).
        II. GRAMMAR [TYPE: mcq-grammar]
        Choose the best answer.

        Question 5. She ______ to school every day.
        A. go
        B. goes
        C. going
        D. gone

      MCQ-SIGN-NOTICE:
      Include the sign/notice text as a PASSAGE: block before the questions, same as reading-announcement.
        IV. SIGNS AND NOTICES [TYPE: mcq-sign-notice]
        Read the following sign and choose the correct answer.

        PASSAGE:
        NO PARKING — Violators will be towed

        Question 15. What does the sign mean?
        A. You can park here.
        B. You cannot park here.
        C. You can park here for a short time.
        D. Parking is free here.
      ```
    - **VERIFY**: Count the Section 6 rule headings — there should now be 16 headings (10 existing + 6 new).

  - [x] 1.3 **Issue 3 (MEDIUM): Add explicit reading-announcement PASSAGE: example.**
    - Go to line 101-103 where `READING-COMPREHENSION / READING-ANNOUNCEMENT:` is defined.
    - After the existing reading-comprehension example (after line 117 `A. ...`), add:
      ```

      READING-ANNOUNCEMENT example (SHORT texts: notices, ads, letters, timetables):
        VII. READING [TYPE: reading-announcement]
        Read the following advertisement and answer the questions.

        PASSAGE:
        *** SUMMER ENGLISH CAMP 2026 ***
        Dates: July 15 - August 10
        Location: Youth Cultural Center, Ho Chi Minh City
        Fee: 2,500,000 VND (includes materials and lunch)

        Question 20. How long does the summer camp last?
        A. About 4 weeks
        B. About 3 weeks
        C. About 2 weeks
        D. About 1 month
      ```
    - **VERIFY**: The word `reading-announcement` now appears in BOTH the rule heading AND an example block.

  - [x] 1.4 **Issue 4 (LOW): Add 3-option MCQ guidance.**
    - Go to line 69 (after `- Keep all Vietnamese diacritics exactly as shown` in Section 5 RULES).
    - Add this new rule line:
      ```
      - If a question has only 3 options (A, B, C), extract all three. Do NOT fabricate a 4th option.
      ```
    - **VERIFY**: The line exists and is inside the RULES block of Section 5.

  - [x] 1.5 **Issue 5+6 (LOW): Add multi-page passage and figure placement rules.**
    - Go to line 187 in Section 8 (GENERAL RULES), after `[Figure: description of the image]`.
    - Replace that figure line and add the passage rule. The final lines should read:
      ```
      - If an image/figure is referenced, write [Figure: description] on its own line immediately above the question that references it
      - If a reading passage spans multiple pages, combine it into ONE continuous PASSAGE: block
      ```
    - **VERIFY**: Both lines exist in Section 8.

  - [x] 1.6 **Issue 8 (MEDIUM): Remove compact answer key format.**
    - Go to lines 174-176 in Section 7. Current text:
      ```
      Alternative compact format (also accepted):
      ANSWER KEY
      1.B  2.C  3.D  4.C  5.D
      ```
    - DELETE those 3 lines entirely. Replace with:
      ```
      ALWAYS use one answer per line. Do NOT put multiple answers on one line.
      ```
    - **VERIFY**: The phrase "compact format" does NOT exist in the file. The phrase "one answer per line" appears.

  - [x] 1.7 **Issue 9 (HIGH): Add Section 3b — Instruction Pattern → Type Mapping.**
    - Go to line 45 area (after the fixed default type rule from subtask 1.1, before `=== 4. INSTRUCTION TEXT ===`).
    - Insert a new section:
      ```
      === 3b. INSTRUCTION PATTERN → TYPE MAPPING ===
      Use these instruction text patterns to identify the correct [TYPE:] tag:

      INSTRUCTION CONTAINS                              → TYPE TAG
      "underlined part differs in pronunciation"         → pronunciation
      "primary stress" / "stressed differently"          → word-stress
      "Choose the best answer" (generic grammar)         → mcq-grammar
      "Choose the word/phrase" (vocabulary focus)         → mcq-vocabulary
      "sign" / "notice" / "advertisement" / "biển báo"  → mcq-sign-notice
      "suitable response" / "dialogue" / "exchange"      → dialogue-response
      "Read the passage" / "đọc hiểu"                  → reading-comprehension
      "announcement" / "notice" / "advertisement"        → reading-announcement
      "closest in meaning to the sentence"               → closest-meaning
      "opposite in meaning" / "trái nghĩa"             → antonym-mcq
      "closest in meaning" (to a WORD, not sentence)     → synonym-mcq
      "error" / "needs correction" / "tìm lỗi"         → error-identification
      "Put in correct order" / "arrange" / "sắp xếp"   → sentence-arrangement
      "sentence from cues" / "given words"               → sentence-arrangement
      "correct form of the verb" / "chia động từ"       → verb-form
      "correct form of the word" (CAPITAL letters)       → word-form
      "Rewrite" / "viết lại" (no keyword given)         → sentence-rewrite
      "Rewrite using the word given" / "keyword"         → sentence-rewrite-keyword
      "word bank" / "words in the box"                   → reading-cloze-wordbank
      "blank" + passage + numbered gaps                  → reading-cloze-mcq
      "refers to" / "pronoun" / "the word X refers to"   → word-reference
      ```
    - **VERIFY**: Count the mapping lines — there should be exactly 21 rows (including the 2 sentence-arrangement rows).

  - [x] 1.8 **Issue 10 (MEDIUM): Add mixed-content section splitting guidance.**
    - Go to Section 2 (around line 12-14, after `Append a [TYPE: xxx] tag at the END of each section header line.`)
    - Add after the existing rules:
      ```
      If a section contains questions of DIFFERENT types (e.g., both MCQ and fill-in-the-blank),
      split it into sub-sections. Use the section name with a suffix:
        III. LANGUAGE (a) [TYPE: mcq-grammar]
        ...MCQ questions...
        III. LANGUAGE (b) [TYPE: verb-form]
        ...fill-in questions...
      ```
    - **VERIFY**: The phrase "split it into sub-sections" exists in the file.

  - [x] 1.9 **Issue 11 (MEDIUM): Add content-based differentiator warnings.**
    - At the END of the new Section 3b (from subtask 1.7), append these differentiator notes:
      ```

      IMPORTANT DIFFERENTIATORS — read carefully:
      - synonym-mcq vs closest-meaning: If options are SINGLE WORDS → synonym-mcq. If options are FULL SENTENCES → closest-meaning.
      - reading-cloze-mcq vs reading-cloze-wordbank: If there is a word bank → ALWAYS use reading-cloze-wordbank, even if MCQ options also exist.
      - sentence-rewrite vs closest-meaning: If questions have 4 MCQ options (A/B/C/D) → closest-meaning, even if instruction says "rewrite".
      ```
    - **VERIFY**: The phrase "IMPORTANT DIFFERENTIATORS" exists in the file.

  - [x] 1.10 **Final verification of all prompt changes.**
    - Open the completed `thcs-pdf-extraction-prompt.txt`.
    - Verify the following are ALL true:
      - [x] The phrase "mcq-grammar] as default" does NOT exist
      - [x] Section 3b exists between Section 3 and Section 4
      - [x] "IMPORTANT DIFFERENTIATORS" section exists
      - [x] 6 new extraction rule blocks exist in Section 6 (SENTENCE-ARRANGEMENT, DIALOGUE-RESPONSE, CLOSEST-MEANING, MCQ-GRAMMAR/MCQ-VOCABULARY, MCQ-SIGN-NOTICE)
      - [x] reading-announcement has its own PASSAGE: example
      - [x] "3 options" guidance exists in Section 5
      - [x] "compact format" does NOT exist in Section 7
      - [x] "split it into sub-sections" exists in Section 2
      - [x] Multi-page passage rule exists in Section 8
      - [x] Figure placement rule says "immediately above the question"
    - **Acceptance Criteria for Task 1.0**: Paste the updated prompt into Gemini or ChatGPT with a sample THCS test image. Verify the AI output contains: `TITLE:`, `GRADE:`, `EXAM TYPE:`, at least 3 `[TYPE:]` tags, and an `ANSWER KEY` section with one answer per line. If any of these are absent, revisit the prompt and fix.

- [x] 2.0 Gate Check + Pre-Clean Fix (FR-1 + FR-2)
  - [x] 2.1 **Create `isStep0Output()` function in `thcsDocumentParser.service.ts`.**
    - Add this function ABOVE `parseThcsText()` (around line 362, before the parseThcsText function):
      ```typescript
      /**
       * Gate Check (FR-1): Verify pasted text came from Step 0.
       * Must satisfy at least ONE of Group A AND at least ONE of Group B.
       *
       * Group A (metadata markers): TITLE: | GRADE: | EXAM TYPE:
       * Group B (structural markers): section header (Roman numeral/Part) | [TYPE: xxx] tag
       */
      function isStep0Output(text: string): boolean {
          // Group A: at least one metadata marker
          const hasGroupA =
              /^TITLE:/m.test(text) ||
              /^GRADE:/m.test(text) ||
              /^EXAM\s+TYPE:/m.test(text);

          // Group B: at least one structural marker
          const hasGroupB =
              /^(?:I{1,3}|IV|V|VI{0,3}|IX|X{0,3})\.\s+/im.test(text) ||
              /^(?:Part|Section|Exercise)\s+/im.test(text) ||
              /\[TYPE:\s*[a-z][a-z0-9-]*\s*\]/i.test(text);

          return hasGroupA && hasGroupB;
      }
      ```
    - **DO NOT** export this function — it is internal to the parser module.
    - **VERIFY**: The function exists, is NOT exported, and is above `parseThcsText()`.

  - [x] 2.2 **Add gate check call at the start of `parseThcsText()`.**
    - Inside `parseThcsText()`, find the first line of logic after the function signature (currently around line 376 where `const startTime = Date.now()` is).
    - ADD these lines BEFORE any existing logic:
      ```typescript
      // ── FR-1: Gate Check ──
      if (!isStep0Output(rawText)) {
          return {
              success: false,
              error: "This text doesn't appear to be Step 0 output. Please use the Copy Prompt button in the test creation wizard to get the extraction prompt, paste it into Gemini or ChatGPT along with your test images, then paste the AI's output here.",
          };
      }
      ```
    - **VERIFY**: The gate check runs BEFORE `preCleanText()` and BEFORE any progress callback.

  - [x] 2.3 **Verify `preCleanText()` preserves all 19 markers from PRD §8.**
    - Open `thcsDocumentParser.service.ts`, go to `preCleanText()` (lines 348-361).
    - Read every regex replacement in the function.
    - For each of the 19 markers listed in PRD §8 (Table in lines 918-938), verify the marker is NOT matched by any stripping regex.
    - Pay special attention to:
      - `**bold**` — must NOT be stripped (was a previous bug, confirm fix is present)
      - `__underline__` — must NOT be stripped
      - `[MANUAL-REVIEW]` — must NOT be stripped (new marker)
    - If `[MANUAL-REVIEW]` is matched by any existing regex, add an exclusion.
    - **VERIFY**: Run a mental test — pass `"TITLE: Test\n[TYPE: pronunciation]\n**bold** and __underline__ and {{braces}} and [MANUAL-REVIEW]"` through preCleanText. All markers must survive.

  - [x] 2.4 **Add `[MANUAL-REVIEW]` to marker preservation if needed.**
    - Check if `preCleanText()` has a regex that strips square-bracket patterns generally (e.g., `/\[.*?\]/g`).
    - If it does, add a negative lookahead to exclude pipeline markers: `[TYPE:`, `[WORD BANK:`, `[AI-INFERRED]`, `[COMPROMISED:`, `[UNCERTAIN]`, `[STATS:`, `[CONFIDENCE:`, `[MANUAL-REVIEW]`, `[AI-GENERATED]`.
    - If no such general regex exists, no change is needed.
    - **VERIFY**: The string `[MANUAL-REVIEW]` survives preCleanText.

- [x] 3.0 Parallel Assessment Architecture (FR-3 + FR-4)
  - [x] 3.1 **Create `validateOriginalText()` in `thcs-text-validator.ts`.**
    - Open `thcs-text-validator.ts`.
    - Find the existing `validateRestructuredText()` function.
    - Create a NEW function `validateOriginalText()` with this signature:
      ```typescript
      export function validateOriginalText(
          originalText: string,
      ): ValidationReport {
          // Run the same 16 checks as validateRestructuredText,
          // but on the original text (not AI-processed text).
          // The checks array, confidence calculation, and unsupportedTypes
          // detection are identical — only the input differs.
          //
          // Call the shared internal detection functions.
          // Set processedText = originalText (no AI processing happened).
          // Set originalInput = originalText (same text).
      }
      ```
    - The function MUST return the same `ValidationReport` interface as `validateRestructuredText()`.
    - Internally, extract the shared check logic into a private helper `runValidationChecks(text: string)` that both `validateOriginalText()` and `validateRestructuredText()` call. This avoids duplicating the 16 check implementations.
    - **DO NOT** duplicate the 16 check implementations — share them via the helper.
    - **VERIFY**: Both `validateOriginalText` and `validateRestructuredText` exist, are exported, and return `ValidationReport`.

   - [x] 3.1b **Implement `MISSING_MARKERS` detector in `thcs-text-validator.ts` (new check #17).**
     - This issue code does NOT exist yet. You must create it.
     - Add `'MISSING_MARKERS'` to the `IssueCode` union (line 18-24).
     - Create function `detectMissingMarkers(lines: string[], sections: SectionBoundary[]): ValidationIssue[]`:
       ```typescript
       // Pronunciation sections MUST have {{}} markers
       // Error-identification sections MUST have {{}} markers
       export function detectMissingMarkers(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
           const issues: ValidationIssue[] = [];
           const markerTypes = ['pronunciation', 'word-stress', 'error-identification'];
           for (let si = 0; si < sections.length; si++) {
               const sec = sections[si];
               if (!sec.typeTag || !markerTypes.includes(sec.typeTag)) continue;
               let hasMarker = false;
               for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
                   if (/\{\{[^}]+\}\}/.test(lines[i])) { hasMarker = true; break; }
               }
               if (!hasMarker) {
                   issues.push(createIssue('MISSING_MARKERS', 'major', si,
                       [sec.headerLine, sec.headerLine], sec.headerText,
                       `${sec.typeTag} section missing {{}} markers for target words`));
               }
           }
           return issues;
       }
       ```
     - Add `...detectMissingMarkers(lines, sections),` to the `issues` array in `validateRestructuredText()` (after line 587, before the `]` closing bracket).
     - **VERIFY**: `MISSING_MARKERS` appears in the `IssueCode` union AND in the issues array construction.

  - [x] 3.2 **Write tests for `validateOriginalText()` in `thcs-text-validator.test.ts`.**
    - Add a new `describe('validateOriginalText')` block.
    - Test cases:
      - Well-structured Step 0 output → formatConfidence ≥ 80, zero issues
      - Text with merged questions → `MERGED_QUESTIONS` issue detected
      - Text with missing [TYPE:] tags → `MISSING_TYPE_TAG` issue detected
      - Text missing ANSWER KEY → `MISSING_ANSWER_KEY` issue detected
      - Text with reading section but no PASSAGE: → `MISSING_PASSAGE_BLOCK` detected
      - Text with pronunciation section `[TYPE: pronunciation]` but no `{{}}` markers → `MISSING_MARKERS` detected (uses the new check from subtask 3.1b)
    - **VERIFY**: All tests pass with `npx vitest run thcs-text-validator.test.ts`.

  - [x] 3.3 **Rewrite `parseThcsText()` to use `Promise.all` for parallel assessment.**
    - **PREREQUISITE**: Task 6.1 must be completed FIRST (removes circuit breaker from pass1).
    - In `thcsDocumentParser.service.ts`, inside `parseThcsText()`, find where Pass 1 is currently called (around line 405-420).
    - Replace the sequential flow with:
      ```typescript
      // ── FR-3: Parallel Assessment ──
      onProgress?.({ stage: 'ai-polish', percent: 20, message: 'Analyzing text (AI + Code in parallel)...' });

      const [aiResult, codeReport] = await Promise.all([
          executePass1(cleaned, createRetrySession(), callInternalAI).catch((err) => {
              console.warn('[parseThcsText] Pass 1 AI call failed:', err);
              return null; // AI failure is handled by decision tree
          }),
          Promise.resolve(validateOriginalText(cleaned)),
      ]);
      ```
    - **CRITICAL**: `executePass1()` takes 3 arguments: `(text, retrySession, callAI)`. The current codebase at line 158 of `thcs-pass1-restructure.ts` has this signature:
      ```typescript
      export async function executePass1(
          nearRawText: string,
          session: RetrySession,
          callAI: (systemMessage: string, prompt: string) => Promise<string | null>,
      ): Promise<Pass1Result>
      ```
      You MUST pass `createRetrySession()` as the second argument. After task 6.1 removes the circuit breaker, the session is just a tracking object.
    - Import `validateOriginalText` from `'./thcs-text-validator'` at the top of the file.
    - **NOTE**: The single `onProgress` call before `Promise.all` covers BOTH the AI call and the code validator. `validateOriginalText()` is synchronous (returns instantly) so it completes before the AI call. You do NOT need a separate progress update for it.
    - **VERIFY**: Both calls execute in parallel. `executePass1` receives 3 args. If AI fails, `aiResult` is `null` (not an exception).

  - [x] 3.4 **Implement Decision Tree (FR-4) in `parseThcsText()`.**
    - After the `Promise.all` call from subtask 3.3, add the decision tree logic.
    - Copy this EXACTLY from PRD §4.2 pseudocode:
      ```typescript
      // ── FR-4: Decision Tree ──
      type NextStep = 'engine' | 'crossfix';
      let textForEngine: string;
      let decision: NextStep;

      if (aiResult === null) {
          // AI call failed entirely
          if (codeReport.formatConfidence >= 70) {
              decision = 'engine';
              textForEngine = cleaned;
          } else {
              decision = 'crossfix';
              textForEngine = cleaned;
          }
      } else {
          const A = aiResult.confidence;
          const C = codeReport.formatConfidence;
          const gap = Math.abs(A - C);
          const isEqual = gap <= 10;

          if (!isEqual && A > C) {
              decision = 'engine';
              textForEngine = aiResult.restructuredText;
          } else if (!isEqual && C > A) {
              decision = 'crossfix';
              textForEngine = aiResult.restructuredText;
          } else if (isEqual && A > 70 && C > 70) {
              decision = 'engine';
              textForEngine = aiResult.restructuredText;
          } else {
              decision = 'crossfix';
              textForEngine = aiResult?.restructuredText ?? cleaned;
          }
      }
      ```
    - **VERIFY**: The decision tree matches PRD §4.2 exactly. All 5 branches are covered.

  - [x] 3.5 **Wire decision tree to downstream steps and remove old sequential flow.**
    - After the decision tree, add the routing logic:
      - If `decision === 'engine'`: skip crossfix, go directly to compromise check → engine.
      - If `decision === 'crossfix'`: call the crossfix loop (Task 4.0), then compromise check → engine.
    - **DELETE the old sequential flow**. The old code is everything between the `callInternalAI` callback creation (which you will KEEP and reuse) and `// --- Stage 5: Regex Engine Parse ---`. Specifically:
      - **DELETE**: The old `const retrySession = createRetrySession(5);` line (replaced by `createRetrySession()` inside `Promise.all`)
      - **DELETE**: The old `const pass1: Pass1Result = await executePass1(...)` call (replaced by `Promise.all`)
      - **DELETE**: The old `const validationReport = validateRestructuredText(...)` call (replaced by `codeReport`)
      - **DELETE**: The entire old Stage 4 branching block (compromise 4a, repair 4b, external retry 4c) — from `// --- Stage 4: Branch Decision ---` through the end of the external retry block
      - **KEEP**: The `callInternalAI` closure (reused by `Promise.all`)
      - **KEEP**: Everything from `// --- Stage 5: Regex Engine Parse ---` onward
    - **CRITICAL — Compromise runs for BOTH paths**: After the decision tree + optional crossfix, run the compromise step on `textForEngine` regardless of which path was taken. Compromise handles unsupported types that crossfix doesn’t address. The new flow is:
      ```
      gate → clean → callInternalAI closure → Promise.all(AI, Code) → decision tree
        → if crossfix: executeCrossfixLoop() → update textForEngine
        → [BOTH PATHS]: run compromise on textForEngine → update textForEngine
        → Stage 5: regex engine on textForEngine
      ```
    - **VERIFY**: The flow is: gate → clean → parallel(AI, Code) → decision → (crossfix?) → compromise → engine. No remnant of old Stage 4 exists.

  - [x] 3.6 **Remove `executeExternalRetry()` from the orchestrator.**
    - In `thcsDocumentParser.service.ts`, find the import of `executeExternalRetry` from `'./thcs-external-retry'` (line 19 area). **DELETE** that import line.
    - Find the call to `executeExternalRetry()` (around line 495-510). **DELETE** the entire external retry block.
    - The crossfix loop (Task 4.0) replaces external retry. After crossfix, flow goes to compromise → engine.
    - Do NOT delete `thcs-external-retry.ts` itself — just remove it from the orchestrator.
    - **VERIFY**: `grep 'executeExternalRetry' thcsDocumentParser.service.ts` returns zero results.

  - [x] 3.7 **Update all imports in `thcsDocumentParser.service.ts`.**
    - After all subtasks in 3.x are done, verify imports are correct:
      - **ADD**: `import { validateOriginalText } from './thcs-text-validator';`
      - **ADD**: `import type { AICallFn } from './thcs-pass2-repair';` (needed for crossfix callback typing)
      - **CHANGE**: `import { executePass2Repair } from './thcs-pass2-repair'` → `import { executeCrossfixLoop } from './thcs-pass2-repair'`
      - **REMOVE**: `import { executeExternalRetry } from './thcs-external-retry'`
      - **KEEP**: all other existing imports (executePass1, executeCompromiseStep, etc.)
    - **⚠️ ORDERING**: Task 6.2 changes `createRetrySession(5)` to `createRetrySession()`. If you do Task 3 before Task 6, the old `createRetrySession(5)` still appears. That’s OK — you’ll delete the old call in Task 3.5 and the new `Promise.all` uses `createRetrySession()` directly. Just be aware both changes target the same area.
    - **VERIFY**: No unused imports. No TypeScript import errors.

- [x] 4.0 Crossfix Loop — Rewrite `thcs-pass2-repair.ts` (FR-5)
  - [x] 4.1 **Rewrite `executePass2Repair()` to implement the crossfix loop.**
    - Open `thcs-pass2-repair.ts`.
    - Replace the current `executePass2Repair()` implementation with the crossfix loop from PRD §FR-5.
    - New signature:
      ```typescript
      export async function executeCrossfixLoop(
          initialText: string,        // bestText to start with (AI's restructuredText or cleaned)
          originalText: string,        // Original cleaned text (for cross-reference in prompts)
          aiConfidence: number,        // From Pass 1 (or 0 if AI failed)
          callAI: AICallFn,           // AI callback
      ): Promise<CrossfixResult>
      ```
    - New return type:
      ```typescript
      export interface CrossfixResult {
          bestText: string;
          wasRepaired: boolean;
          finalReport: ValidationReport;
          auditLog: RepairAuditEntry[];
          reasoningLog: ReasoningEntry[];
          roundsExecuted: number;
          confidenceWarning: string | null;
      }
      ```
    - **KEY CHANGE**: The new function does NOT use `RetrySession` or `executeRetryChain`. Instead, it has its own 3-round loop where each round calls `callAI` directly.
    - **VERIFY**: The function has a `for` loop with `round < 3`, uses `validateRestructuredText()` inside each round, and keeps track of `bestText` / `bestIssueCount`.

  - [x] 4.2 **Implement the 3-round crossfix loop body.**
    - Inside `executeCrossfixLoop()`, implement this exact loop:
      ```typescript
      const MAX_ROUNDS = 3;
      let bestText = initialText;
      let bestIssueCount = Infinity;
      let bestReport: ValidationReport | null = null;
      const auditLog: RepairAuditEntry[] = [];
      const allReasoning: ReasoningEntry[] = [];

      for (let round = 0; round < MAX_ROUNDS; round++) {
          // 1. Validate current bestText
          const report = validateRestructuredText(bestText, originalText, aiConfidence);
          if (bestReport === null) bestReport = report;

          // 2. Exit if good enough
          if (report.formatConfidence >= 70 && report.issues.length === 0) {
              bestReport = report;
              break;
          }

          // 3. Build targeted repair prompt
          const issueCodes = report.issues.map(i => i.code);
          const repairPrompt = buildRepairPrompt(issueCodes, originalText, bestText);

          // 4. AI fixes
          const rawResponse = await callAI(
              'You are an expert at fixing Vietnamese THCS English test formatting.',
              repairPrompt,
              // Use escalating config per round:
              // Round 0: Groq llama 0.1, Round 1: Gemini Flash 0.2, Round 2: Gemini Flash 0.3
              CROSSFIX_STEPS[round]!,
          );
          if (!rawResponse) break; // AI failed, use bestText

          // 5. Parse response
          const parsed = parseAIRepairResponse(rawResponse);
          allReasoning.push(...parsed.reasoningLog);

          // 6. Re-validate fixed text
          const newReport = validateRestructuredText(parsed.fixedText, originalText, aiConfidence);

          // 7. Better or worse?
          if (newReport.issues.length < bestIssueCount || bestIssueCount === Infinity) {
              bestText = parsed.fixedText;
              bestIssueCount = newReport.issues.length;
              bestReport = newReport;
          }
          // If worse: keep previous best, continue to next round

          // 8. Log audit
          auditLog.push(createAuditEntry(
              `crossfix-round-${round}`,
              CROSSFIX_STEPS[round]!.temperature,
              issueCodes,
              newReport.formatConfidence,
              parsed.reasoningLog,
          ));
      }
      ```
    - Define `CROSSFIX_STEPS` at the top of the file:
      ```typescript
      const CROSSFIX_STEPS: RetryStep[] = [
          { provider: 'groq', model: 'llama-3.3-70b-versatile', temperature: 0.1 },
          { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
          { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.3 },
      ];
      ```
    - **NOTE on `callAI` arguments**: The first argument (system message) is a hardcoded string. The second argument (prompt) comes from `buildRepairPrompt()`. The third argument (step) comes from `CROSSFIX_STEPS[round]` — this controls which AI model and temperature is used for each round. The crossfix loop does NOT use `executeRetryChain()` — it manages its own 3-round sequence directly.
    - **VERIFY**: Loop runs max 3 times. Each round uses escalating model/temperature. bestText is only updated if the new version has FEWER issues.

  - [x] 4.3 **Update imports and preserve shared exports in `thcs-pass2-repair.ts`.**
    - Remove the import of `executeRetryChain`, `REPAIR_CHAIN` from `thcs-retry-manager`.
    - Keep the import of `RetryStep` type (used for CROSSFIX_STEPS).
    - Keep imports of `validateRestructuredText` from `thcs-text-validator`.
    - Keep imports of `buildRepairPrompt`, `parseAIRepairResponse`, `createAuditEntry` from `thcs-prompt-builder`.
    - **IMPORTANT**: Keep the existing `AICallFn` type EXPORT (line 36). Other files import it — including `thcsDocumentParser.service.ts` (via Task 3.7 import added above).
    - **NOTE**: `AICallFn` is defined in the SAME FILE as `executeCrossfixLoop`, so the crossfix function does NOT need to import it. Only external consumers (the orchestrator) import it.
    - **IMPORTANT**: Keep `checkConfidenceDisagreement()` function (lines 40-53). The crossfix loop's return value includes `confidenceWarning` — call `checkConfidenceDisagreement(aiConfidence, bestReport.formatConfidence)` to compute it before returning.
    - **VERIFY**: No unused imports. No import of `RetrySession`. `AICallFn` is still exported. `checkConfidenceDisagreement` is still exported.

  - [x] 4.4 **Create `repairCallAI` callback and wire `executeCrossfixLoop()` in orchestrator.**
    - In `thcsDocumentParser.service.ts`, inside `parseThcsText()`, **BEFORE** the decision tree block, create the `repairCallAI` callback. This tells the crossfix loop how to call AI:
      ```typescript
      // Build the AI callback for crossfix loop
      // Mirrors the existing callInternalAI pattern but typed as AICallFn (includes RetryStep)
      const repairCallAI: AICallFn = async (system, prompt, step) => {
          if (step.provider === 'gemini') {
              return callGeminiDirectPlainText(prompt, system, step.model);
          }
          return callGroqDirectPlainText(prompt, system, step.model, step.temperature);
      };
      ```
    - **NOTE**: `AICallFn` is imported from `'./thcs-pass2-repair'` (added in Task 3.7). `callGeminiDirectPlainText` and `callGroqDirectPlainText` are already imported at the top of the orchestrator.
    - Then, in the `decision === 'crossfix'` branch:
      ```typescript
      if (decision === 'crossfix') {
          onProgress?.({ stage: 'ai-polish', percent: 40, message: 'Crossfix loop — repairing issues...' });

          const crossfixResult = await executeCrossfixLoop(
              textForEngine,
              cleaned,
              aiResult?.confidence ?? 0,
              repairCallAI,
          );

          textForEngine = crossfixResult.bestText;
          // Store audit log and reasoning for diagnostics
          // (wire into PipelineDebug)
      }
      ```
    - Update the import to use `executeCrossfixLoop` instead of `executePass2Repair` (already done in Task 3.7).
    - **VERIFY**: The `repairCallAI` callback exists BEFORE the decision tree. The crossfix loop is called ONLY when `decision === 'crossfix'`. `repairCallAI` receives `(system, prompt, step)` matching `AICallFn` signature.

  - [x] 4.5 **Write tests for crossfix loop in `thcs-pass2-repair.test.ts`.**
    - Rewrite the test file. New test cases:
      - Input with 3 issues → mock AI fixing 1 per round → after 3 rounds, 0 issues (success)
      - Input with issues → AI returns worse text → bestText stays the same
      - Input already at confidence ≥ 70 with 0 issues → exits immediately (0 rounds executed)
      - AI call fails on round 1 → exits with bestText from round 0
      - Three rounds all produce same issue count → exits with first bestText
    - **VERIFY**: All tests pass.

- [x] 5.0 Compromise Overhaul + Raw Text Fallback (FR-6 + FR-12)
  - [x] 5.1 **Move compromise to AFTER crossfix in `parseThcsText()`.**
    - In `thcsDocumentParser.service.ts`, find where `executeCompromiseStep()` is currently called.
    - Move it to AFTER the crossfix loop result (or after the engine decision if no crossfix needed).
    - The flow must be: decision tree → (crossfix?) → compromise → engine.
    - **VERIFY**: `executeCompromiseStep()` is called AFTER `executeCrossfixLoop()` completes, never before.

  - [x] 5.2 **Add alternate conversion strategies to `thcs-compromise-step.ts`.**
    - In `executeCompromiseStep()`, after a primary strategy fails (chainResult.bestResult is null), add a second attempt using the alternate strategy.
    - Add the alternate strategy map:
      ```typescript
      const ALTERNATE_ROUTES: Partial<Record<CompromiseRoute, CompromiseRoute>> = {
          'matching': 'matching-alt',      // → verb-form (fill-in fallback)
          'true-false': 'true-false-alt',  // → closest-meaning
          'gap-fill-open': 'gap-fill-alt', // → mcq-grammar
          'translation': 'translation-alt', // → sentence-rewrite
          'word-ordering': 'word-ordering-alt', // → sentence-arrangement (just re-tag)
      };
      ```
    - **STEP 1 (TYPE SYSTEM)**: In `thcs-prompt-builder.ts`, expand the `CompromiseRoute` union (line 25-28). The existing union only has primary routes. You MUST add the alternate routes:
      ```typescript
      export type CompromiseRoute =
          | 'matching' | 'true-false' | 'translation' | 'matching-headings'
          | 'gap-fill-open' | 'word-ordering' | 'picture-description-mcq'
          | 'picture-description-open'
          // Alternate routes (FR-11 Task 5.2)
          | 'matching-alt' | 'true-false-alt' | 'gap-fill-alt'
          | 'translation-alt' | 'word-ordering-alt';
      ```
    - **STEP 2 (TEMPLATES)**: Add corresponding templates to `COMPROMISE_TEMPLATES` in `thcs-prompt-builder.ts`. Each entry needs `targetType`, `instruction`, `example`, `constraint`, and `preserveFields` fields. Add these 5 entries:
      ```typescript
      'matching-alt': {
          targetType: 'verb-form',
          instruction: 'Convert this matching exercise into fill-in-the-blank questions. Each matched pair becomes one question where the student fills in the matching item.',
          example: 'Original: 1. library - A. a place to borrow books\nConverted: 1. A ______ is a place to borrow books. (library)',
          constraint: 'Preserve ALL original content items. Do not invent new vocabulary.',
          preserveFields: ['questionNumber', 'correctAnswer'],
      },
      'true-false-alt': {
          targetType: 'closest-meaning',
          instruction: 'Convert each True/False statement into an MCQ question asking which paraphrase is closest in meaning to the original. Create 4 options (A-D) where one matches the original meaning.',
          example: 'Original: 1. The sun rises in the west. (F)\nConverted: 1. Which sentence has the closest meaning?\nA. The sun rises in the east. B. The sun sets in the west. C. The sun rises in the west. D. The moon rises in the west.',
          constraint: 'The correct answer MUST be the option that reflects the TRUE version of the statement.',
          preserveFields: ['questionNumber'],
      },
      'gap-fill-alt': {
          targetType: 'mcq-grammar',
          instruction: 'Convert this open-ended gap-fill exercise into MCQ format. For each blank, generate 4 options (A-D) where one is the correct answer.',
          example: 'Original: She ______ (go) to school every day.\nConverted: She ______ to school every day.\nA. go  B. goes  C. going  D. gone',
          constraint: 'The correct option must be the original expected answer. Distractors must be grammatically plausible.',
          preserveFields: ['questionNumber', 'correctAnswer', 'questionText'],
      },
      'translation-alt': {
          targetType: 'sentence-rewrite',
          instruction: 'Convert this translation exercise into sentence-rewrite format. Use the target language sentence as the question and ask students to rewrite using given words.',
          example: 'Original: Translate: She goes to school every day.\nConverted: Rewrite the sentence: She goes to school every day. (using: attend)',
          constraint: 'If the original has no clear target sentence to rewrite from, this conversion is NOT possible — return FAIL.',
          preserveFields: ['questionNumber'],
      },
      'word-ordering-alt': {
          targetType: 'sentence-arrangement',
          instruction: 'Re-tag this word-ordering exercise as sentence-arrangement. The content format is often identical — just change the type tag.',
          example: 'No content change needed — this is a re-classification.',
          constraint: 'Preserve all original content exactly. Only the type tag changes.',
          preserveFields: ['questionNumber', 'options', 'correctAnswer', 'questionText'],
      },
      ```
    - **VERIFY**: `COMPROMISE_TEMPLATES` now has entries for all values in the `CompromiseRoute` union (TypeScript will error if any are missing since it's a `Record<CompromiseRoute, CompromiseTemplate>`). Each unsupported type has exactly 2 conversion attempts before falling through to raw-text-fallback.

  - [x] 5.3 **Add raw-text-fallback cascade to `executeCompromiseStep()`.**
    - After BOTH primary and alternate strategies fail for a section, instead of pushing to `skippedSections`, implement the raw-text-fallback:
      ```typescript
      // Both strategies failed → Raw Text Fallback (FR-12)
      compromisedSections.push({
          sectionIndex: entry.sectionIndex,
          originalType: entry.type,
          convertedType: 'raw-text-fallback',
          convertedText: targetText, // keep original section text
          reasoning: {
              originalType: entry.type,
              convertedType: 'raw-text-fallback',
              preserved: 'All original text preserved as-is',
              lost: 'Structured parsing not possible',
              confidence: '0',
              teacherNotes: 'This section could not be auto-converted. Students will see the raw text and type their answers.',
          },
      });
      ```
    - **CRITICAL (PRD §FR-12 lines 819-821)**: After pushing the raw-text-fallback entry, you MUST also run a best-effort question extraction on `targetText`:
      ```typescript
      // Best-effort question extraction from raw text
      const QUESTION_RE = /^(?:Question|Câu|Q)\s*(\d+)\s*[.:]/im;
      const rawLines = targetText.split('\n');
      const extractedQuestions: { number: number; text: string }[] = [];
      for (let i = 0; i < rawLines.length; i++) {
          const m = rawLines[i].match(QUESTION_RE);
          if (m) {
              extractedQuestions.push({ number: parseInt(m[1]), text: rawLines[i] });
          }
      }
      // If zero questions found, create 1 question per non-empty line that has a number
      if (extractedQuestions.length === 0) {
          for (let i = 0; i < rawLines.length; i++) {
              if (/^\s*\d+/.test(rawLines[i]) && rawLines[i].trim().length > 5) {
                  extractedQuestions.push({ number: i + 1, text: rawLines[i] });
              }
          }
      }
      ```
    - **WHERE `extractedQuestions` GOES**: Add an `extractedQuestions` field to the `CompromisedSection` interface in `thcs-compromise-step.ts`. Find the interface (around line 20-33) and add:
      ```typescript
      extractedQuestions?: { number: number; text: string }[];
      ```
      Then, in the raw-text-fallback block above, attach the extracted questions:
      ```typescript
      compromisedSections.push({
          sectionIndex: entry.sectionIndex,
          originalType: entry.type,
          convertedType: 'raw-text-fallback',
          convertedText: targetText,
          extractedQuestions,  // <-- attach here
          reasoning: { ... },
      });
      ```
    - **DATA FLOW TO ENGINE**: In the orchestrator (`thcsDocumentParser.service.ts`), after the compromise step returns, find the loop that processes `compromisedSections` (this is where `convertedText` replaces sections). For any section where `cs.convertedType === 'raw-text-fallback'`, you must:
      1. Set `section.isRawTextFallback = true`
      2. Set `section.rawText = cs.convertedText`
      3. Create questions from `cs.extractedQuestions` (if any):
         ```typescript
         if (cs.convertedType === 'raw-text-fallback' && cs.extractedQuestions?.length) {
             section.questions = cs.extractedQuestions.map((eq, i) => ({
                 id: `raw-${cs.sectionIndex}-${i}`,
                 questionNumber: eq.number,
                 questionText: eq.text,
                 type: 'raw-text-fallback' as const,
                 options: [],
                 correctAnswer: answerKey?.[eq.number] || '',
             }));
         }
         ```
      Where `answerKey` is the parsed answer key from the engine. If the answer key is not available at this point, set `correctAnswer: ''` and let it be filled post-engine.
    - **VERIFY**: No section is ever silently dropped. It either converts, skips (listening/speaking/essay), or falls back to raw-text.

  - [x] 5.4 **Add `raw-text-fallback` to type system.**
    - Open `types/thcs-test.types.ts`.
    - Add `'raw-text-fallback'` to the `Phase2QuestionType` union (line 28-33):
      ```typescript
      export type Phase2QuestionType =
          | 'verb-form'
          | 'word-form'
          | 'reading-cloze-wordbank'
          | 'sentence-rewrite'
          | 'sentence-rewrite-keyword'
          | 'raw-text-fallback';       // FR-12: compromise failure fallback
      ```
    - Add `rawText` and `isRawTextFallback` fields to `THCSSection` (line 99-124):
      ```typescript
      // After line 123 (shuffleOptions), add:
      rawText?: string;                // FR-12: original raw section text (only set for raw-text-fallback)
      isRawTextFallback?: boolean;     // FR-12: true when this section failed compromise
      ```
    - Add `'raw-text-fallback'` to `INTENT_SKILL_MAP` (line 481-502):
      ```typescript
      'raw-text-fallback': { name: 'Manual Review', category: 'Other' },
      ```
    - Add `'raw-text-fallback'` to `ALL_INSTRUCTION_TEMPLATES` (after line 364):
      ```typescript
      'raw-text-fallback': 'This section requires manual review. Read the text and answer below.',
      ```
    - **VERIFY**: TypeScript compiles with no errors. `THCSQuestionType` now includes `'raw-text-fallback'`.

  - [x] 5.5 **Write tests for alternate strategies and raw-text-fallback.**
    - In `thcs-compromise-step.test.ts`, add:
      - Test: matching → primary fails → alternate (verb-form) succeeds
      - Test: true-false → both strategies fail → raw-text-fallback created
      - Test: listening → skipped (no fallback, just warning)
      - Test: raw-text-fallback section has `convertedType === 'raw-text-fallback'`
    - **VERIFY**: All tests pass.

- [x] 6.0 Engine + Retry Manager Updates (FR-8 + FR-11)
  - [x] 6.1 **Remove circuit breaker from `thcs-retry-manager.ts`.**
    - Open `thcs-retry-manager.ts`.
    - Remove `isCircuitBreakerTripped()` function (lines 214-217).
    - Remove the circuit breaker check inside `executeRetryChain()` (lines 113-122):
      ```typescript
      // DELETE these lines:
      if (isCircuitBreakerTripped(session)) {
          console.warn(`[RetryManager] Circuit breaker tripped...`);
          return { outcome: 'circuit-breaker', bestResult, callLog: localLog, escalatedTo: chain.fallback };
      }
      ```
    - Remove `maxCalls` from `RetrySession` interface (line 32).
    - Update `createRetrySession()` to not accept or use `maxCalls`:
      ```typescript
      export function createRetrySession(): RetrySession {
          return { totalCalls: 0, callLog: [] };
      }
      ```
    - Remove `'circuit-breaker'` from the `RetryResult.outcome` union (line 49):
      ```typescript
      outcome: 'success' | 'escalated' | 'all-failed';
      ```
    - Update `getSessionStats()` (lines 220-230) to remove `remaining` field.
    - **VERIFY**: The word "circuit" does NOT appear anywhere in the file. `maxCalls` does NOT appear.

  - [x] 6.1b **Remove circuit breaker from `thcs-pass1-restructure.ts`.**
    - Open `thcs-pass1-restructure.ts`.
    - Find lines 171-174 where `session.totalCalls >= session.maxCalls` is checked:
      ```typescript
      // DELETE these lines:
      if (session.totalCalls >= session.maxCalls) {
          console.warn('[Pass1] Circuit breaker — returning raw text');
          return fallback;
      }
      ```
    - Remove these lines. Pass 1 should never short-circuit based on call count.
    - **DO NOT** change the function signature (still takes `RetrySession`). The session is used for `totalCalls` tracking.
    - **VERIFY**: The word "circuit" does NOT appear in `thcs-pass1-restructure.ts`. The function still accepts `RetrySession` as second arg.

  - [x] 6.2 **Update all call sites that reference circuit breaker.**
    - Search the entire `src/services/test-creation/` directory for:
      - `isCircuitBreakerTripped` — remove all references
      - `maxCalls` — remove all references (from RetrySession, createRetrySession, etc.)
      - `'circuit-breaker'` — remove all case handlers
      - `createRetrySession(5)` or any `createRetrySession(N)` — change to `createRetrySession()`
      - `session.totalCalls >= session.maxCalls` — remove (including in `thcs-pass1-restructure.ts`)
    - **VERIFY**: `grep -r "circuit" src/services/test-creation/` returns zero results. `grep -r "maxCalls" src/services/test-creation/` returns zero results.

  - [x] 6.3 **Add `[MANUAL-REVIEW]` and `[CONFIDENCE:]` to PIPELINE_TAGS in `thcs-engine-enhancements.ts`.**
    - Open `thcs-engine-enhancements.ts`.
    - Find the `PIPELINE_TAGS` array (line 241-250).
    - Add these 2 new regex entries to the array:
      ```typescript
      /\[MANUAL-REVIEW\]/gi,
      /\[CONFIDENCE:\s*\d+\]/gi,
      ```
    - **WHY**: `[CONFIDENCE: N]` is emitted by the crossfix loop audit. Without stripping, it leaks into student-facing text.
    - **VERIFY**: Both `MANUAL-REVIEW` and `CONFIDENCE:` appear in the PIPELINE_TAGS array.

  - [x] 6.4 **Update retry manager tests.**
    - In `thcs-retry-manager.test.ts`:
      - Remove any test that references `isCircuitBreakerTripped`, `maxCalls`, or `'circuit-breaker'`.
      - Update `createRetrySession()` calls to not pass arguments.
      - Verify remaining tests still pass.
    - **VERIFY**: All tests pass. No mention of "circuit" in test file.

- [x] 7.0 Student Renderer + Auto-Marking for Raw Text Fallback (FR-12)
  - [x] 7.1 **Create `THCSRawTextFallback.tsx` component.**
    - Create file: `src/components/thcs-student/THCSRawTextFallback.tsx`
    - Props interface:
      ```typescript
      interface THCSRawTextFallbackProps {
          section: THCSSection;
          answers: Record<string, string>;     // questionId → student's typed answer
          onAnswerChange: (questionId: string, answer: string) => void;
          isReviewMode?: boolean;              // true = show correct answers
          questionResults?: Record<number, QuestionResult>;
      }
      ```
    - Render:
      1. Section raw text inside a bordered container with preserved whitespace (CSS `white-space: pre-wrap`)
      2. For each question in `section.questions`: render a `<label>` with question number + `<input type="text" />` below
      3. In review mode: show correct answer next to the input, green for correct, red for incorrect
    - **NO Mantine components.** Use native HTML + vanilla CSS.
    - Follow the `student-view-design` skill for colors, typography, spacing.
    - **VERIFY**: Component renders without errors. No Mantine imports.

  - [x] 7.2 **Route `raw-text-fallback` sections in `THCSTestLayout.tsx` (section-level routing).**
    - **⚠️ DO NOT modify `THCSQuestionRenderer.tsx`** — that component renders individual questions, but raw-text-fallback is a SECTION-level concept. The entire section is replaced by the `THCSRawTextFallback` component.
    - Open `src/components/thcs-student/THCSTestLayout.tsx`.
    - Add this import at the top:
      ```typescript
      import THCSRawTextFallback from './THCSRawTextFallback';
      ```
    - Find the TWO places where `currentSection.questions.map((q) => ...)` renders individual questions. There are exactly 2 instances:
      1. **Two-column layout** (inside the right panel `<div>` after the passage panel) — search for `{currentSection.questions.map((q) =>` inside the two-column grid
      2. **Single-column layout** (after `{/* Questions */}` comment) — search for `{currentSection.questions.map((q) =>` in the single-column `<>` fragment
    - **BEFORE** each `.map()` block, wrap it in a conditional. If the section is a raw-text-fallback, render `THCSRawTextFallback` instead of the question loop:
      ```tsx
      {currentSection.isRawTextFallback ? (
          <THCSRawTextFallback
              section={currentSection}
              answers={Object.fromEntries(
                  currentSection.questions.map(q => [
                      q.questionNumber.toString(),
                      (answers[q.questionNumber.toString()] as string) || ''
                  ])
              )}
              onAnswerChange={(qId, val) => handleAnswer(parseInt(qId), val)}
              isReviewMode={isSubmitted}
          />
      ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {currentSection.questions.map((q) => (
                  /* ... existing THCSQuestionRenderer code stays unchanged ... */
              ))}
          </div>
      )}
      ```
    - Apply this pattern to BOTH the two-column and single-column render paths.
    - **VERIFY**: Import exists. Both `.map()` blocks are wrapped in the `isRawTextFallback` conditional. No changes to `THCSQuestionRenderer.tsx`.

  - [x] 7.3 **Add `checkRawTextAnswer()` to `thcsAutoMarking.service.ts` and wire into grading.**
    - Open `src/services/thcsAutoMarking.service.ts`.
    - Add this function (place it after the `gradeClozeQuestion` function, before `markThcsTest`):
      ```typescript
      /**
       * FR-12: Check raw-text-fallback answer via string comparison.
       * Trimmed, case-insensitive, whitespace-normalized.
       */
      export function checkRawTextAnswer(studentAnswer: string, correctAnswer: string): boolean {
          if (!correctAnswer || correctAnswer === '?') return false; // teacher grades manually
          const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
          return normalize(studentAnswer) === normalize(correctAnswer);
      }
      ```
    - **WIRE INTO GRADING**: Inside `markThcsTest()`, find the else-if chain that routes question types for grading. It goes: MCQ → fill-in → cloze → writing → else (unknown). Add a NEW branch **after the writing check** (`} else if (question.type === 'sentence-rewrite' || ...`) and **before the final `} else {` catch-all**:
      ```typescript
      } else if (question.type === 'raw-text-fallback') {
          // ─── Raw text fallback grading ─────────────────────
          const studentAnswer = typeof rawAnswer === 'string' ? rawAnswer : '';
          const isCorrect = checkRawTextAnswer(studentAnswer, question.correctAnswer || '');
          const pointsEarned = isCorrect ? questionMaxPoints : 0;

          qResult = {
              questionNumber: question.questionNumber,
              isCorrect,
              studentAnswer,
              correctAnswer: question.correctAnswer || '?',
              pointsEarned,
              pointsMax: questionMaxPoints,
          };
      } else {
      ```
    - **NOTE**: The final `} else {` catch-all (unknown type → 0 points) MUST remain as the very last branch.
    - **VERIFY**: `checkRawTextAnswer` is exported. The grading chain has 6 branches: MCQ → fill-in → cloze → writing → raw-text-fallback → unknown.

  - [x] 7.4 **Add raw-text-fallback banner to `THCSParseReviewPanel.tsx`.**
    - Open `src/components/thcs-editor/THCSParseReviewPanel.tsx`.
    - This component already has helper functions for compromise detection:
      - `isCompromised(sectionIndex)` — returns `true` if section was compromised
      - `getCompromiseInfo(sectionIndex)` — returns compromise details
      - `isSkipped(sectionIndex)` — returns `true` if section was skipped
    - Add a NEW check alongside `isCompromised()`. Find the section rendering loop and add:
      ```typescript
      const isRawFallback = (si: number) =>
          parsedTest.sections[si]?.isRawTextFallback === true;
      ```
    - In the section card rendering, add a condition: if `isRawFallback(sectionIndex)`, show:
      - Orange-yellow banner text: *"⚠️ This section could not be auto-converted. Students will see the raw text and type their answers."*
      - Use the same styling pattern as the existing compromise orange highlight
    - **VERIFY**: The orange banner appears for raw-text-fallback sections. Existing compromise banners still work.

  - [x] 7.5 **Add raw-text-fallback display to `THCSSectionBlock.tsx` (editor view).**
    - Open `src/components/thcs-editor/THCSSectionBlock.tsx`.
    - Find the section's question type check (look for `defaultQuestionType` in the props interface).
    - Add a condition: if the section's `defaultQuestionType === 'raw-text-fallback'` OR `section.isRawTextFallback === true`:
      1. Display the raw text from `section.rawText` in a bordered, read-only container with `white-space: pre-wrap`
      2. Show the orange "⚠️ Manual review required" note above the text
      3. Add an "Edit" button that toggles the container to a `<textarea>` so the teacher can edit the raw text
      4. When the teacher saves edits, call the existing `onUpdateSection(updatedSection)` callback (check the component's props for the exact callback name — likely `onSectionChange` or `onUpdate`)
    - **VERIFY**: Raw-text-fallback sections display correctly in the editor. The teacher can view and edit the raw text.

  - [x] 7.6 **Write tests for `THCSRawTextFallback.tsx`.**
    - Create `src/components/thcs-student/THCSRawTextFallback.test.tsx`.
    - Test cases:
      - Renders raw text content inside a pre-formatted container
      - Renders one text input per question
      - `onAnswerChange` is called when student types
      - Review mode shows correct/incorrect indicators
      - Empty correctAnswer shows "teacher will grade" message
    - **VERIFY**: All tests pass.

- [ ] 8.0 Integration Testing + Regression Verification
  - [x] 8.1 **Update orchestrator test file.**
    - In `thcsDocumentParser.service.test.ts`:
      - Add test: well-structured Step 0 output → parallel assessment → direct to engine (fast path)
      - Add test: input missing Step 0 markers → gate check returns error
      - Add test: AI fails but Code confidence ≥ 70 → uses original cleaned text
      - Add test: both AI and Code low confidence → crossfix loop executes
    - **VERIFY**: All tests pass.

  - [x] 8.1b **Verify FR-9 (AI-Inferred Flagging) and FR-10 (Reasoning Log) survive the rewrite.**
    - These features are "already implemented" per PRD §FR-9 and §FR-10. Confirm they still work:
    - **FR-9**: Open `thcs-engine-enhancements.ts`. Verify `consumeAITags()` still handles `[AI-INFERRED]`.
    - **FR-9**: Open `THCSParseReviewPanel.tsx`. Verify AI-inferred answers are still highlighted in yellow.
    - **FR-10**: Open `thcs-prompt-builder.ts`. Verify `parseAIRepairResponse()` still extracts `--- REASONING LOG ---`.
    - **FR-10**: Verify the crossfix loop (Task 4.2) calls `parseAIRepairResponse()` and pushes reasoning entries to `allReasoning`.
    - **NEW TAGS**: After Task 6.3, verify `PIPELINE_TAGS` in `thcs-engine-enhancements.ts` includes BOTH `[MANUAL-REVIEW]` and `[CONFIDENCE:]` regex entries (these are stripped from student-facing text).
    - **VERIFY**: Grep for `AI-INFERRED` in engine — must exist. Grep for `REASONING LOG` in prompt builder — must exist. Grep for `MANUAL-REVIEW` in PIPELINE_TAGS — must exist. Grep for `CONFIDENCE:` in PIPELINE_TAGS — must exist.

  - [ ] 8.2 **Run full test suite — regression check.**
    - Run `npx vitest run` to execute ALL tests.
    - Every existing test must pass. Zero regressions.
    - If any test fails, investigate and fix without changing the test expectation (the implementation must match existing behavior for unchanged functionality).
    - **VERIFY**: `npx vitest run` exits with 0 failures.

  - [ ] 8.3 **Manual smoke test with real test data.**
    - Start the dev server: `npm run dev`
    - Go to test creation → paste a known-good Step 0 output
    - Verify: parse completes, sections are classified correctly, answer key is applied
    - Verify: **bold** markers appear in passage preview
    - Verify: Parse Review Panel shows confidence score + any warnings
    - **VERIFY**: End-to-end flow works as expected.

  - [ ] 8.4 **Manual gate check test.**
    - Paste random text (not Step 0 output) into the parser
    - Verify: error message appears: "This text doesn't appear to be Step 0 output..."
    - Verify: parsing does NOT proceed
    - **VERIFY**: Gate check blocks bad input.

  - [ ] 8.5 **Build verification.**
    - Run `npm run build`.
    - Verify zero TypeScript errors and zero build failures.
    - **VERIFY**: Build succeeds.
