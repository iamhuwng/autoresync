# PRD-0032: Passage Extraction & Rich-Text Formatting Pipeline

## 1. Introduction / Overview

The THCS/THPT test creation pipeline uses a Step 0 AI prompt that instructs the external AI to output rich formatting markers inside passages and questions — `**bold**` for tested vocabulary, `__underline__` for tested phrases, `[I][II][III][IV]` for sentence insertion points, and `PASSAGE:` delimiters for reading passages. However, **the parser and renderer silently discard all of these markers**, resulting in students seeing tests that are missing passages entirely, showing raw markup symbols, and lacking the visual cues needed to answer question types like synonym/antonym, paraphrase, word-reference, and sentence-fit.

This PRD covers the full fix: extraction of `PASSAGE:` blocks in the parser, rich-text rendering in the passage panel, and handling of previously-ignored question intents/formats in the question renderer.

### Problem Statement

When a teacher creates a 12th-grade English test with 6 reading sections and 40 questions, the student preview (and published test) shows:
- **No passage text at all** for reading-comprehension, reading-cloze-mcq, and reading-announcement sections
- Raw `**asterisks**` or `__underscores__` instead of styled text when passage text is reconstructed via fallback
- No visual distinction for `[I]` / `[II]` / `[III]` / `[IV]` insertion markers
- Raw `{{they}}` in word-reference questions instead of underlined text
- Jumbled sub-items in sentence-arrangement questions (e.g., `a. First sentence b. Second sentence` on one line)

### Root Cause

The parser (`thcsDocumentParser.service.ts` → `parseQuestions()`) never extracts `PASSAGE:` blocks. The `passageText` field on `ParsedSection` exists but is never assigned. The passage panel (`THCSPassagePanel.tsx`) renders passage content as a raw string with no markdown parsing. The question renderer (`THCSQuestionRenderer.tsx`) lacks handling for `word-reference` intent and `sentence-arrangement` sub-item formatting.

---

## 2. Goals

1. **G1:** Extract `PASSAGE:` blocks from AI output and store them in `ParsedSection.passageText` so the draft converter can build proper passage objects for reading sections.
2. **G2:** Render passage content with rich-text formatting — `**bold**` as `<strong>`, `__underline__` as `<u>`, and `{{braces}}` as `<u>` — so students can identify tested vocabulary and phrases.
3. **G3:** Style `[I]`, `[II]`, `[III]`, `[IV]` insertion markers in passages as bold text so students can locate them for sentence-fit questions.
4. **G4:** Handle `word-reference` intent in the question renderer so `{{word}}` displays as underlined text (same behavior as synonym/antonym).
5. **G5:** Render sentence-arrangement questions with lettered sub-items (`a.`, `b.`, `c.`, etc.) on separate lines for readability.

---

## 3. User Stories

- **US1:** As a student taking a reading comprehension test, I want to see the full passage text alongside the questions, so I can read the passage and answer questions about it.
- **US2:** As a student, I want tested vocabulary words to appear **bold** in the passage, so I can quickly find the word a synonym/antonym question is asking about.
- **US3:** As a student, I want underlined phrases/sentences to appear __underlined__ in the passage, so I can identify the text a paraphrase question is referring to.
- **US4:** As a student, I want `[I]`, `[II]`, `[III]`, `[IV]` insertion markers to be visually distinct in the passage, so I can locate where a sentence might fit.
- **US5:** As a student answering a word-reference question (e.g., "The word _they_ in paragraph 2 refers to..."), I want the tested word to be underlined in the question, so I know which word is being asked about.
- **US6:** As a student answering a sentence-arrangement question, I want each lettered sub-item (a, b, c, d, e) displayed on its own line, so I can read each sentence clearly before choosing the correct order.

---

## 4. Functional Requirements

### FR1: PASSAGE: Block Extraction in Parser

1. **FR1.1:** In `parseQuestions()` (`thcsDocumentParser.service.ts`), detect lines matching `/^PASSAGE:\s*$/i` or `/^PASSAGE:\s+\S/i` (passage marker with optional inline text).
2. **FR1.2:** Collect all lines after the `PASSAGE:` marker until the first `Question N.` pattern into a `passageLines` array.
3. **FR1.3:** Join `passageLines` with `\n` and assign to `section.passageText`.
4. **FR1.4:** If the `PASSAGE:` marker has inline text (e.g., `PASSAGE: Solar energy can be...`), include that text as the first line of the passage.
5. **FR1.5:** Passage lines must NOT be added to `instructionLines` or `questionText`. They are a separate data channel.
6. **FR1.6:** If `PASSAGE:` appears after some instruction lines but before the first question, instruction lines collected before `PASSAGE:` remain as `section.instructionText`.
7. **FR1.7:** Handle passage titles: if the first non-empty line after `PASSAGE:` is short (≤80 chars), not ending with a period, and the next line is longer, it is likely a title. The draft converter's existing title-extraction logic (lines 526-550) will handle this — no parser change needed here.

### FR2: Passage Rich-Text Rendering

8. **FR2.1:** Create a utility function `renderPassageRichText(text: string): React.ReactNode[]` in a new file or inside `THCSPassagePanel.tsx`.
9. **FR2.2:** The function must parse and render these markers (in priority order):
   - `**text**` → `<strong>text</strong>` (bold)
   - `__text__` → `<u>text</u>` (underline)
   - `{{text}}` → `<u>text</u>` (underline, for consistency with question markers)
   - `[I]`, `[II]`, `[III]`, `[IV]` → `<strong>[I]</strong>` etc. (bold)
10. **FR2.3:** Paragraph breaks (`\n\n`) must produce `<br/><br/>` or equivalent visual paragraph separation.
11. **FR2.4:** Single line breaks (`\n`) must be preserved (passage uses `whiteSpace: pre-wrap`).
12. **FR2.5:** Markers must not be parsed recursively (e.g., `**__nested__**` is not required to work).
13. **FR2.6:** Replace all instances of `{passage.content}` in `THCSPassagePanel.tsx` (lines 92, 131, 159) with `renderPassageRichText(passage.content)`.

### FR3: Insertion Marker Styling

14. **FR3.1:** The `renderPassageRichText` function must detect `[I]`, `[II]`, `[III]`, `[IV]` (and optionally `[V]` through `[X]` for future-proofing) and render them as `<strong>[I]</strong>`.
15. **FR3.2:** These markers appear inline within passage paragraphs and must remain inline (not block-level elements).

### FR4: Word-Reference Intent Handling

16. **FR4.1:** In `THCSQuestionRenderer.tsx`, add `'word-reference'` to the `isSynonymAntonym` boolean check (alongside `'synonym-mcq'`, `'antonym-mcq'`, `'closest-meaning'`).
17. **FR4.2:** This ensures questions with `{{word}}` in their text get the "underlined parts" rendering path, displaying the tested word with underline styling.
18. **FR4.3:** Update the diagnostic `plog` to distinguish word-reference from synonym/antonym in the `renderPath` label.

### FR5: Sentence-Arrangement Sub-Item Formatting

19. **FR5.1:** In `THCSQuestionRenderer.tsx`, detect `sentence-arrangement` intent/type for the question.
20. **FR5.2:** When question text contains lettered sub-items matching pattern `/[a-e]\.\s/` (e.g., `a. First sentence b. Second sentence`), split the text on these boundaries.
21. **FR5.3:** Render each sub-item on its own line with the letter label styled (e.g., bold letter + period, followed by the sentence text).
22. **FR5.4:** If question text does NOT contain lettered sub-items (e.g., it's scrambled words separated by `/`), render as standard MCQ (no change from current behavior).

### FR6: Diagnostic Logging

23. **FR6.1:** Add a `plog` statement in `THCSPreviewOverlay.tsx` (or the passage rendering path) that logs whether each reading section has passage text, its length, and whether it contains formatting markers (`**`, `__`, `{{`, `[I]`).
24. **FR6.2:** Extend the existing per-question `plog` in `THCSQuestionRenderer.tsx` to log `word-reference` and `sentence-arrangement` render paths.

---

## 5. Non-Goals (Out of Scope)

- **NG1:** Modifying the Step 0 AI prompt (`thcs-pdf-extraction-prompt.txt`). The prompt already instructs the AI correctly — the problem is downstream.
- **NG2:** Supporting nested formatting (e.g., `**__bold underline__**`). Single-level markers are sufficient.
- **NG3:** Rendering images or figures referenced in passages (`[Figure: description]`). This is a separate feature.
- **NG4:** Cloze passage blank formatting (`(1)______`). The existing cloze rendering handles this adequately.
- **NG5:** Pass 1 (Janitor AI) changes. This PRD only covers the parser, converter, and renderers.

---

## 6. Design Considerations

### Passage with Bold & Underline

In the passage panel, formatted text should look natural:
- **Bold** words: slightly heavier weight, used for tested vocabulary (e.g., the word **discerning** in a synonym question)
- <u>Underlined</u> text: standard text-decoration underline, used for tested phrases/sentences (e.g., "the underlined sentence in paragraph 4")
- `[I]` markers: **bold** inline text matching surrounding font size

### Sentence-Arrangement Sub-Items

Each lettered item should display as:
```
a. Jamie: I'm not sure, but my phone knows so much about me...
b. Sam: Maybe one day we'll need to change our laws...
c. Sam: Do you think robots like Claude should have rights...
```
With clear line separation and the letter label in bold.

---

## 7. Technical Considerations

### Files to Modify

| File | Change |
|---|---|
| `src/services/test-creation/thcsDocumentParser.service.ts` | Add `PASSAGE:` extraction in `parseQuestions()` |
| `src/components/thcs-student/THCSPassagePanel.tsx` | Add `renderPassageRichText()`, replace raw `{passage.content}` |
| `src/components/thcs-student/THCSQuestionRenderer.tsx` | Add `word-reference` to synonym/antonym branch; add sentence-arrangement sub-item splitting |
| `src/components/thcs-editor/THCSPreviewOverlay.tsx` | Add passage diagnostic logging |

### Dependencies

- No new packages required. Rich-text rendering uses React elements (`<strong>`, `<u>`, `<span>`).
- The `previewLogCollector` utility already exists for diagnostic logging.
- The `ParsedSection.passageText` field already exists on the interface — just needs to be populated.

### Risk: preCleanText stripping markers

The `preCleanText()` function in the parser was previously identified as potentially stripping `**` and `__` markers. Verify that the current implementation preserves these markers. The test at line 38-39 of `thcsDocumentParser.service.test.ts` confirms `__underlined__` is preserved. Verify `**bold**` is also preserved — if not, add a preservation rule.

### Backward Compatibility

- Tests parsed before this fix will not retroactively gain passage text. Only newly parsed tests benefit.
- The `renderPassageRichText` function must gracefully handle passage text that has NO formatting markers (plain text passes through unchanged).
- The sentence-arrangement sub-item detection must not false-positive on regular question text that happens to contain `a.` or `b.` patterns.

---

## 8. Success Metrics

1. **SM1:** After pasting the Grade 12 test (from user's AI output), the Preview mode shows all 4 reading passages with their full text.
2. **SM2:** Bold markers (`**discerning**`) render as visually bold text in the passage panel.
3. **SM3:** Underline markers (`__Today's professionals increasingly amalgamate...__`) render as underlined text in the passage panel.
4. **SM4:** `[I]`, `[II]`, `[III]`, `[IV]` render as bold inline text in passages.
5. **SM5:** Word-reference questions (e.g., Q25, Q34) show the tested word underlined in the question text.
6. **SM6:** Sentence-arrangement questions (Q13-Q17) show each lettered sub-item on its own line.
7. **SM7:** Diagnostic logs in Preview mode confirm correct render paths for all 40 questions.
8. **SM8:** Existing regression tests (`thcsDocumentParser.service.test.ts`) continue to pass (20/20).

---

## 9. Open Questions

1. **OQ1:** Should `renderPassageRichText` also handle `[WORD BANK: ...]` tags that appear in some passage texts? Currently these are stripped in the draft converter — confirm this is sufficient.
2. **OQ2:** Should insertion markers beyond `[IV]` (e.g., `[V]`, `[VI]`) be supported? Bold brackets work for any Roman numeral pattern, so this is automatic.
3. **OQ3:** For the sentence-arrangement sub-item split, should we handle both `a.` and `a)` letter styles? The AI prompt uses `a.` format consistently, but real PDFs may vary.
