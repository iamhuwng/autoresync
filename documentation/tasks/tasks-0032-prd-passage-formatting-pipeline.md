# Tasks for PRD-0032: Passage Extraction & Rich-Text Formatting Pipeline

## Relevant Files

- `src/services/test-creation/thcsDocumentParser.service.ts` - Core parser. Added `passageMarker` regex in PATTERNS, passage extraction logic in `parseQuestions()`.
- `src/services/test-creation/thcsDocumentParser.service.test.ts` - Regression tests (24 passing: 20 existing + 4 new passage extraction tests).
- `src/services/test-creation/thcs-draft-converter.ts` - Draft converter that reads `ps.passageText`. `word-reference` confirmed in `MCQ_INTENTS`.
- `src/components/thcs-student/THCSPassagePanel.tsx` - Passage display component. Added `renderPassageRichText()` function, replaced all 3 raw `{passage.content}` usages.
- `src/components/thcs-student/THCSQuestionRenderer.tsx` - Question renderer. Added `word-reference` to `isSynonymAntonym`, `isSentenceArrangement` flag, sub-item rendering, updated diagnostic labels.
- `src/components/thcs-editor/THCSPreviewOverlay.tsx` - Preview overlay. Extended diagnostic logging with passage presence/length/formatting.
- `src/utils/previewLogCollector.ts` - Preview log utility (existing). Used for `plog()` calls.

### Notes

- Unit tests use Vitest, not Jest. Run with `npx vitest run [path]`.
- The `preCleanText()` function already preserves `**bold**` and `__underline__` markers — confirmed by comment on line 462-463.
- `ParsedSection.passageText` field already exists (line 59) — now populated by the parser.
- The draft converter's passage title extraction and paragraph formatting already work — they needed `passageText` to not be `undefined`.
- Pre-existing TS error in `THCSDocumentUpload.tsx` (references removed export) — not related to this PRD.

## Tasks

- [ ] 1.0 PASSAGE: Block Extraction in Parser
  - [x] 1.1 Add a `passageMarker` regex to the `PATTERNS` object: `/^PASSAGE:\s*(.*)$/i`.
  - [x] 1.2 In `parseQuestions()`, add three new tracking variables: `passageLines`, `inPassage`, `passageStarted`.
  - [x] 1.3 Inside the main line-processing loop, add passage detection logic: detect `PASSAGE:` marker, collect lines, exit on question/option match.
  - [x] 1.4 After the section's for-loop ends, assign `section.passageText = passageLines.join('\n')` with leading/trailing blank line trimming.
  - [x] 1.5 Passage lines are NOT added to `instructionLines` — `continue` in passage collection skips past that code path.
  - [x] 1.6 Edge case: `PASSAGE:` after instruction lines — instruction lines stay separate (naturally works).
  - [x] 1.7 Blank lines in passages preserved: blank line check modified to push empty string to `passageLines` when `inPassage`.
  - [x] 1.8 Wrote 4 unit tests: standalone PASSAGE: marker, inline text, multi-paragraph, backward compatibility. All 24 tests pass.
  - [x] 1.9 Run existing regression tests — all 24 tests pass. ✅

- [ ] 2.0 Passage Rich-Text Rendering
  - [x] 2.1 Created `renderPassageRichText(text: string): React.ReactNode[]` inside `THCSPassagePanel.tsx`.
  - [x] 2.2 Implemented parsing logic: line-by-line processing with single-pass regex for all marker types.
  - [x] 2.3 Single regex matches `**bold**`, `__underline__`, `{{braces}}`, `[I]-[X]` in one pass.
  - [x] 2.4 Line breaks handled: `<br/>` between lines, blank lines produce paragraph spacing.
  - [x] 2.5 Replaced `{passage.content}` on mobile slide-up with `{renderPassageRichText(passage.content)}`.
  - [x] 2.6 Replaced `{passage.content}` on desktop two-column with `{renderPassageRichText(passage.content)}`.
  - [x] 2.7 Replaced `{passage.content}` on single-column with `{renderPassageRichText(passage.content)}`.
  - [ ] 2.8 **MANUAL TEST:** Paste Grade 12 test, open Preview, verify passages display with formatting.
  - [ ] 2.9 **MANUAL TEST:** Verify backward compatibility with passages without formatting markers.

- [ ] 3.0 Word-Reference Intent Handling
  - [x] 3.1 Added `'word-reference'` to the `isSynonymAntonym` check in `THCSQuestionRenderer.tsx`.
  - [x] 3.2 Updated `renderPath` diagnostic to show `'WORD-REFERENCE (underlined word)'` for word-reference intent.
  - [x] 3.3 Verified `word-reference` is in `MCQ_INTENTS` array in `thcs-draft-converter.ts` (line 65). ✅
  - [ ] 3.4 **MANUAL TEST:** Verify word-reference questions show underlined tested word.

- [ ] 4.0 Sentence-Arrangement Sub-Item Formatting
  - [x] 4.1 Added `isSentenceArrangement` detection check.
  - [x] 4.2 Implemented inline sub-item rendering: splits on `\b[a-e].\s` boundaries, renders each on own line with bold label.
  - [x] 4.3 Guard against false positives: Only applies if ≥ 2 lettered sub-items found.
  - [x] 4.4 Integrated into JSX question text rendering as conditional branch before standard text.
  - [x] 4.5 Updated `renderPath` diagnostic to include `'SENTENCE-ARRANGEMENT (sub-items)'`.
  - [ ] 4.6 **MANUAL TEST:** Verify sentence-arrangement sub-items display on separate lines.

- [ ] 5.0 Diagnostic Logging & Regression Testing
  - [x] 5.1 Extended section-level diagnostic log with `passageLen`, `passageFormatting` fields.
  - [x] 5.2 Verified `plog` now logs `word-reference` and `sentence-arrangement` render paths.
  - [x] 5.3 Full parser regression test suite: all 24 tests pass. ✅
  - [ ] 5.4 **MANUAL TEST:** Run end-to-end test with Grade 12 test text.
  - [ ] 5.5 **MANUAL TEST:** Verify diagnostic logs show correct render paths.
