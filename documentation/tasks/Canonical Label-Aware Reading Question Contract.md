# Canonical Label-Aware Reading Question Contract

## Summary
- Fix the problem at creation, review, and publish time by replacing raw `question: string` plus `options: string[]` with a canonical Reading question shape.
- Preserve extracted source labels as authoritative content.
- Stop student Reading UI from inventing labels or question numbers for newly created tests.

## Key Changes
- Introduce a shared Reading canonicalizer used by both creation entrypoints:
  - [TestCreationModal.tsx](C:/Users/The%20Lord/Desktop/luyentap/src/components/test-creation/TestCreationModal.tsx)
  - [useTestCreation.ts](C:/Users/The%20Lord/Desktop/luyentap/src/hooks/useTestCreation.ts)
- Canonicalizer responsibilities:
  - Convert raw AI/review `options: string[]` into structured options with explicit `label` and `text`.
  - Strip a leading question number from `questionText` only when it matches the real `questionNumber`.
  - Preserve source option labels exactly as extracted, including non-sequential labels like `ii`, `iv`, `ix`.
  - Reject mixed groups, duplicate labels, or malformed labeled options before draft save or publish.

- Change upstream extraction/validation contracts so Reading data is structured before it reaches storage:
  - [ai.service.ts](C:/Users/The%20Lord/Desktop/luyentap/src/services/ai/ai.service.ts)
  - [response.validator.ts](C:/Users/The%20Lord/Desktop/luyentap/src/services/ai/response.validator.ts)
  - [ai-extractor.service.ts](C:/Users/The%20Lord/Desktop/luyentap/src/services/test-creation/ai-extractor.service.ts)
  - [validator.service.ts](C:/Users/The%20Lord/Desktop/luyentap/src/services/test-creation/validator.service.ts)
- Replace `options?: string[]` for Reading option-bearing task types with structured option objects and carry `questionNumber` and prompt text separately.

- Update durable Reading draft/publish types so canonical data is what gets stored:
  - [document.types.ts](C:/Users/The%20Lord/Desktop/luyentap/src/types/document.types.ts)
  - [draft.types.ts](C:/Users/The%20Lord/Desktop/luyentap/src/types/draft.types.ts)
  - [draftCloudService.ts](C:/Users/The%20Lord/Desktop/luyentap/src/services/draftCloudService.ts)
  - [testStorage.ts](C:/Users/The%20Lord/Desktop/luyentap/src/services/testStorage.ts)
- In [testStorage.ts](C:/Users/The%20Lord/Desktop/luyentap/src/services/testStorage.ts), publish canonical Reading questions, not raw flattened text, and adjust acceptable-answer compilation to read canonical prompt text.

- Update the review flow to edit canonical Reading questions instead of raw newline-separated option strings:
  - [ParseReviewPanel.tsx](C:/Users/The%20Lord/Desktop/luyentap/src/components/test-creation/ParseReviewPanel.tsx)
  - [TestReviewPage.tsx](C:/Users/The%20Lord/Desktop/luyentap/src/pages/TestReviewPage.tsx)
- For option-bearing Reading tasks, review UI should expose label and text separately and block publish if the group is not canonical.

- Update the student Reading runtime to consume canonical fields directly:
  - [ReadingTestPage.tsx](C:/Users/The%20Lord/Desktop/luyentap/src/skills/reading/components/ReadingTestPage.tsx)
  - [IELTSQuestionsPanel.tsx](C:/Users/The%20Lord/Desktop/luyentap/src/components/test/IELTSQuestionsPanel.tsx)
  - [AuthenticAnswerInput.tsx](C:/Users/The%20Lord/Desktop/luyentap/src/components/test/AuthenticAnswerInput.tsx)
- Rendering rules:
  - Show question number only from `number`.
  - Show option labels only from stored `label`.
  - Never prepend `A/B/C`, `i/ii/iii`, or numeric prefixes from array index when a source label exists.
  - Remove Reading-only label heuristics from the new-data path.

- Update Reading presentation transforms so they stop assuming `options` is a string array:
  - [thcsShuffle.ts](C:/Users/The%20Lord/Desktop/luyentap/src/utils/thcsShuffle.ts)
- Reading option shuffling should be disabled for canonical labeled options. Source labels are part of the authored test content and must not be remapped.

## Canonical Data Rules
- Question prompt:
  - Stored as pure prompt text with no leading question number.
  - Example: `27. The burial site was found...` becomes `questionNumber: 27`, `questionText: "The burial site was found..."`.
- Option-bearing tasks:
  - Stored as `{ label, text }`.
  - Example: `"A proof"` becomes `{ label: "A", text: "proof" }`.
  - Example: `"**ii** The spread of cities"` becomes `{ label: "ii", text: "The spread of cities" }`.
- Rendering result:
  - `ii. The spread of cities`
  - `iv. The dead`
  - `ix. The cities`
  - Never `i. ii. ...`, `ii. iv. ...`, `iii. ix. ...`

## Provider Prompt Contract
- Gemini and Groq Reading extraction prompts must request the same canonical option shape.
- For any label-bearing option bank, providers should return:
  - `options`: text-only option values, without embedded labels.
  - `labeledOptions`: `{ label, text }` objects preserving source labels.
  - `optionLabelFormat`: `letter`, `roman`, or `number`.
- Providers must not return conflicting mixed shapes such as `label: "B"` with text that still starts with `A.`.
- For unlabeled question types, providers should return `labeledOptions: null` and `optionLabelFormat: null`.

## Table Completion Extraction Contract
- Table-completion `questionText` must preserve original source row/cell wording.
- Providers must not paraphrase, summarize, reorder, or rewrite table rows into prose to make parsing easier.
- Providers may standardize only `sectionInstruction` for parser recognition, for example adding `TABLE_HEADERS:` or moving answer-rule text there.
- Table structure stays pipe-delimited in `questionText`; table headers stay metadata in `sectionInstruction`.
- Header-only rows remain forbidden as questions.

## Verification
- Creating a matching-headings Reading test with source labels `ii`, `iv`, `ix` stores and renders those exact labels once.
- Creating a summary-completion-list test with options like `A proof`, `B plantation` stores structured labels and renders them once.
- A prompt containing a stored leading question number publishes with one visible number in student view.
- Publish is blocked when a Reading option group mixes labeled and unlabeled entries or repeats a label.
- Student Reading option shuffling no longer mutates canonical labeled options.
- Gemini and Groq prompt tests must assert the table source-preservation contract is present.

## Assumptions
- Existing drafts/tests are out of scope.
- No migration or backward-compat layer.
- Reading only; Listening and THCS remain unchanged unless they share a touched utility.
- The correct source content includes extracted labels, so the system must preserve them structurally rather than regenerate them visually.
