# Task List: PRD-0028 — THCS-THPT Test System Phase 2

**Source PRD:** `documentation/tasks/0028-prd-thcs-thpt-test-system-phase2.md`
**Created:** 2026-02-26
**Amended:** 2026-02-26 (post-assessment — 9C/11M/8m fixes + 6 junior-evaluation amendments applied)
**Depends on:** PRD-0027 (Phase 1) — MUST be fully implemented before starting

---

## Relevant Files

### Types & Data Model
- `src/types/thcs-test.types.ts` — **MODIFY**: Add fill-in, writing, cloze fields to `THCSQuestion`; make `intent` optional for Phase 2 types; extend `THCSGradingResult` with partial grading status; update `SectionResult.intentBreakdown` key type; add `BlankAnswer`, `WritingGradingResult` interfaces; add `isCustomLayout` to `THCSSection`.

### Services
- `src/services/thcsAutoMarking.service.ts` — **MODIFY**: Add `gradeFillInQuestion()`, `gradeClozeQuestion()`, `normalizeAnswer()`, extend `markThcsTest()` to handle all question types (update `studentAnswers` param type to `Record<string, string | string[]>`) + partial grading states.
- `src/services/thcsWritingGrading.service.ts` — **NEW**: Two-tier AI writing grading (string similarity + LLM escalation via `aiService` router). Client-side token bucket throttle.
- `src/services/ai/ai.service.ts` — **MODIFY**: Add `gradeWritingAnswer()` and `suggestAlternativeAnswers()` to `IAIService` interface.
- `src/services/ai/router.service.ts` — **MODIFY**: Add `gradeWritingAnswer()` and `suggestAlternativeAnswers()` proxy methods with fallback pattern.
- `src/services/ai/gemini.provider.ts` — **MODIFY**: Implement `gradeWritingAnswer()` and `suggestAlternativeAnswers()`.
- `src/services/ai/groq.provider.ts` — **MODIFY**: Implement `gradeWritingAnswer()` and `suggestAlternativeAnswers()`.
- `src/services/thcsTestStorage.ts` — **MODIFY**: Add `runTransaction` to firebase imports. Add `publishTestUpdate()` with delta changelog recording, `reconstructVersion()`, `computeDelta()`.
- `src/services/notificationService.ts` — **MODIFY**: Add `sendGradeUpdatedNotification()` for writing grade updates. Extend notification type union if one exists.

### Editor Components
- `src/components/thcs-editor/THCSFillInBlock.tsx` — **NEW**: Fill-in (verb/word form) editor block with blank detection, multi-value answers, AI suggestions.
- `src/components/thcs-editor/THCSWritingBlock.tsx` — **NEW**: Sentence rewriting editor block (E1: given start, E2: keyword) with model answers, AI suggestions.
- `src/components/thcs-editor/THCSClozeWordBankBlock.tsx` — **NEW**: Cloze word bank editor block with passage input, word bank, blank mapping, distractor management. Section-level component managing a SINGLE question with multiple blanks.
- `src/components/thcs-editor/THCSAnswerKeyPanel.tsx` — **MODIFY**: Extend with type-specific answer key inputs (fill-in multi-value, writing model answers, cloze dropdowns).
- `src/components/thcs-editor/THCSFillInAnswerInput.tsx` — **NEW**: Multi-value text input sub-component for answer key panel.
- `src/components/thcs-editor/THCSWritingAnswerInput.tsx` — **NEW**: Model answer text input sub-component for answer key panel.
- `src/components/thcs-editor/THCSClozeAnswerInput.tsx` — **NEW**: Word bank dropdown sub-component for answer key panel.
- `src/components/thcs-editor/THCSVersionDropdown.tsx` — **NEW**: Version changelog dropdown with view/compare.
- `src/components/thcs-editor/THCSPreviewOverlay.tsx` — **NEW**: Fullscreen preview overlay (Phase 2A static, Phase 2B interactive).
- `src/components/thcs-editor/THCSQuestionBlock.tsx` — **MODIFY**: Add question type selector beyond MCQ intents; delegate to type-specific blocks.

### Student View Components
- `src/components/thcs-student/THCSFillInRenderer.tsx` — **NEW**: Inline text input blanks within sentence, tab navigation.
- `src/components/thcs-student/THCSWritingRenderer.tsx` — **NEW**: E1 inline continuation input, E2 full-width text input.
- `src/components/thcs-student/THCSClozeRenderer.tsx` — **NEW**: Dropdown selects per blank with word bank header.
- `src/components/thcs-student/THCSQuestionRenderer.tsx` — **MODIFY**: Route to type-specific renderers based on `question.type`.
- `src/components/thcs-student/THCSTestLayout.tsx` — **MODIFY**: Support mixed answer types (string | string[]), update `saveAnswersToRTDB` signature, 10s writing sync with interval cleanup, partial grading display, preview mode props.
- `src/components/thcs-student/THCSPassagePanel.tsx` — **VERIFY** (no modification expected): Confirm existing two-column support works with new `reading-cloze-wordbank` intent.

### Grading Components
- `src/components/thcs-grading/GradingTestCard.tsx` — **NEW**: Test card with progress bar for grading tab.
- `src/components/thcs-grading/BatchGradingPanel.tsx` — **NEW**: By-question batch grading UI with side-by-side student answers.
- `src/components/thcs-grading/InlineWritingGrader.tsx` — **NEW**: Monitor inline grading panel with score slider + feedback.

### Pages
- `src/pages/TeacherGradingPage.tsx` — **NEW**: Grading tab page with by-test/by-question views, lazy-load pagination.
- `src/pages/THCSTestEditorPage.tsx` — **MODIFY**: Add new widget blocks, preview button, version dropdown, extended type selector.
- `src/pages/TeacherTestMonitorPage.tsx` — **MODIFY**: Add THCS-specific student cards with section breakdown, inline writing grading, student detail modal extension.

### Navigation & Routes
- `src/constants/routes.ts` — **MODIFY**: Add `TEACHER_GRADING: '/teacher/grading'`.
- `src/components/navigation/TeacherNavigation.tsx` — **MODIFY**: Add "Grading" nav button with pending badge count.
- `src/components/navigation/TeacherHeader.tsx` — **MODIFY**: Add Grading to `mobileMenuItems` array.
- `src/App.jsx` — **MODIFY**: Add `/teacher/grading` route with `PrivateRoute allowedRoles={['teacher', 'super_admin']}` + `ErrorBoundary` wrapper.

### Tests
- `src/__tests__/security/routeAccess.test.ts` — **MODIFY**: Add `/teacher/grading` to `ROUTE_CONFIG`.
- `src/services/thcsAutoMarking.service.test.ts` — **MODIFY**: Add tests for fill-in grading, cloze grading, partial grading states.
- `src/services/thcsWritingGrading.service.test.ts` — **NEW**: Tests for two-tier writing grading, throttle, fallback.

### Notes

- Unit tests should typically be placed alongside the code files they are testing.
- Use `npx vitest [optional/path/to/test/file]` to run tests.
- All AI calls MUST go through `import { aiService } from '../services/ai/router.service.ts'`. NEVER import providers directly.
- **No new npm dependencies allowed** (PRD §7.1). All utility functions (Levenshtein, Jaccard, etc.) MUST be implemented in-house. Do NOT install any new library.
- UI component testing is NOT required for Phase 2 student renderers (`THCSFillInRenderer`, `THCSWritingRenderer`, `THCSClozeRenderer`). Only service-layer tests are required.
- **Integration Safety Rules triggered:** #1 (new route), #3 (new nav handler), #6 (10s writing interval), #7 (gradingStatus states), #8 (new components integration).

---

## Tasks

- [ ] 1.0 Data Model Extension & Type System Updates
  - [x] 1.1 In `src/types/thcs-test.types.ts`, make the following changes to the `THCSQuestion` interface:
    **(a)** Change `intent` from required to optional: `intent?: MCQIntent;` — Phase 2 question types (`verb-form`, `word-form`, `sentence-rewrite`, `sentence-rewrite-keyword`, `reading-cloze-wordbank`) do NOT have an MCQIntent. The `type` field is the primary discriminator for all question types. When `type` is an MCQIntent value, `intent` is set to the same value. When `type` is a Phase2QuestionType, `intent` is `undefined`.
    **(b)** Add the following optional fields (alongside existing MCQ fields). These fields are only populated when `type` is a Phase 2 type:
    - `sentenceTemplate?: string` (the sentence with `___` markers for verb-form/word-form)
    - `blankAnswers?: Array<{ acceptedAnswers: string[]; aiSuggestions?: Array<{ answer: string; confidence: number; approved: boolean; }>; }>` (correct answers per blank)
    - `originalSentence?: string` (for sentence-rewrite types)
    - `sentenceStarter?: string` (for E1 sentence-rewrite)
    - `keyword?: string` (for E2 sentence-rewrite-keyword)
    - `modelAnswers?: string[]` (acceptable rewritten sentences)
    - `passageTemplate?: string` (passage with `___(N)___` markers for cloze)
    - `wordBank?: string[]` (all words including distractors)
    - `blankMapping?: Record<number, string>` (blank number → correct word)
    - `allowWordReuse?: boolean` (default false)
    - `autoGradeWriting?: boolean` (teacher toggle, default false — per PRD §4.2.3)
  - [x] 1.2 Change `THCSGradingResult.gradingStatus` from the literal `'fully-graded'` to the union type: `'submitted' | 'auto-graded' | 'partially-graded' | 'fully-graded'`. Export this as a named type `THCSGradingStatus`.
  - [x] 1.3 Extend `QuestionResult` interface to support non-MCQ results. Add: `blankResults?: Array<{ isCorrect: boolean; studentAnswer: string; correctAnswer: string; pointsEarned: number; }>` (for fill-in and cloze), `writingResult?: { studentAnswer: string; modelAnswers: string[]; aiScore?: number; aiConfidence?: number; teacherScore?: number; teacherFeedback?: string; gradingTier?: WritingGradingTier; }` (for sentence rewriting).
    **Export a named type for the grading tier enum with explicit mapping:**
    ```typescript
    export type WritingGradingTier =
      | 'pending'           // Initial state — not yet processed
      | 'auto-correct'      // Tier 1 string similarity ≥ 80% → auto-graded as correct
      | 'auto-incorrect'    // Tier 1 string similarity < 30% → auto-graded as incorrect
      | 'ai-correct'        // Tier 2 LLM score ≥ 80% → auto-graded as correct via AI
      | 'ai-incorrect'      // Tier 2 LLM score < 50% → auto-graded as incorrect via AI
      | 'teacher-review'    // Tier 2 LLM score 50-79%, OR AI unavailable → flagged for teacher
      | 'teacher-graded';   // Teacher has manually graded this answer
    ```
  - [x] 1.4 Update `QuestionResult.studentAnswer` type from `string` to `string | string[]` (string[] for fill-in blanks). Update `QuestionResult.correctAnswer` type from `string` to `string | string[] | undefined` (undefined for writing where model answers are in `writingResult`). **Downstream usages that MUST be updated:**
    - In `thcsAutoMarking.service.ts` `markThcsTest()`: the line `correctAnswer: question.correctAnswer` — for MCQ questions, keep as-is (string). For fill-in/cloze, set `correctAnswer` to `blankAnswers.map(b => b.acceptedAnswers[0])` (string[]). For writing, set to `undefined`.
    - In `thcsResultToTestMarkingResult()`: the line `correctAnswer: qr.correctAnswer` — cast to `string` with fallback: `correctAnswer: typeof qr.correctAnswer === 'string' ? qr.correctAnswer : JSON.stringify(qr.correctAnswer ?? 'N/A')`.
  - [x] 1.5 Merge Phase 2 instruction templates into a single unified constant. Do NOT create a separate `PHASE2_INSTRUCTION_TEMPLATES`. Instead, create `ALL_INSTRUCTION_TEMPLATES: Record<THCSQuestionType, string>` that contains ALL entries from the existing `INSTRUCTION_TEMPLATES` (all 15 MCQ intents) PLUS the 5 Phase 2 types:
    - `'verb-form': 'Supply the correct form of the verbs in brackets.'`
    - `'word-form': 'Supply the correct form of the words in brackets.'`
    - `'reading-cloze-wordbank': 'Read the passage and fill in each blank with a word from the word bank.'`
    - `'sentence-rewrite': 'Rewrite each sentence so that it has the same meaning, beginning with the given words.'`
    - `'sentence-rewrite-keyword': 'Rewrite each sentence using the given word. Do not change the word given.'`
    Keep the old `INSTRUCTION_TEMPLATES` constant as-is for backward compatibility. Update the section instruction auto-generation logic to check `ALL_INSTRUCTION_TEMPLATES[question.type]` instead of `INSTRUCTION_TEMPLATES[question.intent]`.
  - [x] 1.6 Change `SectionResult.intentBreakdown` key type from `Record<MCQIntent, ...>` to `Record<THCSQuestionType, { correct: number; total: number }>`. This ensures Phase 2 question types (`verb-form`, `word-form`, etc.) can be tracked in the intent/type breakdown analytics. Update the type assertion in `markThcsTest()` accordingly.
  - [x] 1.7 Add `isCustomLayout?: boolean` to the `THCSSection` interface. Default `false`. Set to `true` when teacher manually changes the layout radio button. Used to prevent auto-reverting layout when the first question's type changes (see Task 11.1).

- [ ] 2.0 New Editor Widgets (Fill-in, Writing, Cloze Word Bank)
  - [x] 2.1 Create `src/components/thcs-editor/THCSFillInBlock.tsx`. This component renders when `question.type === 'verb-form'` or `'word-form'`. It includes: (a) a `Textarea` for `sentenceTemplate` where teacher uses `___` (triple underscore) to mark blanks, (b) a display showing "Blanks detected: N" that auto-counts `___` occurrences via regex `/___/g`, (c) for each detected blank: a multi-value text input where teacher types an answer and presses Enter to add it to `blankAnswers[i].acceptedAnswers[]`, with a `[+]` button and delete chips for each answer, (d) a "🤖 Suggest Alternatives" button that calls `aiService.suggestAlternativeAnswers()` to generate alternative answers (display with confidence %, click to approve → adds to acceptedAnswers, dismiss to ignore). **Loading state:** Add `isGeneratingSuggestions: boolean` local state. When button is clicked: set to `true`, disable the button, show a spinner/loading text ("⏳ Generating..."). When the AI call resolves (success or failure): set back to `false`. This prevents teachers from mashing the button and triggering cascading API calls that breach the token bucket rate limit. Props: `question: THCSQuestion`, `onUpdate: (q: THCSQuestion) => void`. Follow the same card styling pattern as `THCSQuestionBlock.tsx` (white background, purple border, rounded corners).
  - [x] 2.2 Create `src/components/thcs-editor/THCSWritingBlock.tsx`. This component renders when `question.type === 'sentence-rewrite'` or `'sentence-rewrite-keyword'`. It includes: (a) `TextInput` for `originalSentence`, (b) for E1 (`sentence-rewrite`): `TextInput` for `sentenceStarter` (required), (c) for E2 (`sentence-rewrite-keyword`): `TextInput` for `keyword` (required, displayed in uppercase), (d) multi-value text input for `modelAnswers[]` (same pattern as fill-in: type + Enter to add, chips to remove), (e) "🤖 Suggest Alternatives" button using `aiService.suggestAlternativeAnswers()` — **same loading state pattern as Task 2.1(d)**: `isGeneratingSuggestions` boolean, disable button + show spinner while loading, re-enable on resolve, (f) a toggle `autoGradeWriting` checkbox labeled "Enable auto-grading for this section" (default off — per PRD §4.2.3). Props mirror `THCSFillInBlock`.
  - [x] 2.3 Create `src/components/thcs-editor/THCSClozeWordBankBlock.tsx`. This is a **section-level** component (not per-question) that manages a **SINGLE `THCSQuestion`** containing all blanks. **Architectural clarification:** A cloze reading section has ONE question object in `section.questions[]`. That single question stores `passageTemplate`, `wordBank`, `blankMapping`, and `allowWordReuse`. Each blank (1, 2, 3...) is NOT a separate question — they are all blank slots within the one question. Points are divided equally among blanks (e.g., 3 blanks × 0.33pts = 1pt total). The `questionNumber` of the cloze question is the starting number; individual blanks are graded as sub-items within `blankResults[]`. The component includes: (a) `Textarea` for `passageTemplate` with `___(N)___` numbered blank markers, (b) auto-detection of blank count from `___(\d+)___` regex, (c) word bank editor: teacher adds words via text input + Enter. Each word shown as a chip (deletable). Words are stored in `wordBank[]`, (d) blank mapping table: for each detected blank N, a `Select` dropdown with word bank items as options to select the correct word. Stored in `blankMapping[N]`, (e) distractors display: words in word bank NOT in any blankMapping value shown as "Distractors: [small] [destroy]", (f) settings toggle: "☑ Allow word reuse" → sets `allowWordReuse` on the question, (g) duplicate word count display: if same word appears in multiple blank mappings, show "word × count" in the word bank. **IMPORTANT: This display is computed dynamically during React render** by counting occurrences of each word across `blankMapping` values. Do NOT mutate or modify the `wordBank[]` array itself — `wordBank` must always contain plain, undecorated strings (e.g., `"the"`, NOT `"the (x2)"`). The "× count" suffix is purely a JSX render decoration. Validation: ❌ block if any blank has no correct word assigned, ⚠️ warn if no distractors.
  - [x] 2.4 Modify `src/components/thcs-editor/THCSQuestionBlock.tsx` to support Phase 2 question types. Currently the component only renders MCQ options (radio buttons + text inputs for A/B/C/D). Changes: (a) expand the `MCQ_INTENTS` array (rename to `QUESTION_TYPE_OPTIONS`) to include Phase 2 types: `{ value: 'verb-form', label: 'Verb Form (Fill-in)' }`, `{ value: 'word-form', label: 'Word Form (Fill-in)' }`, `{ value: 'sentence-rewrite', label: 'Sentence Rewrite (Given Start)' }`, `{ value: 'sentence-rewrite-keyword', label: 'Sentence Rewrite (Keyword)' }`, `{ value: 'reading-cloze-wordbank', label: 'Cloze Word Bank' }`, (b) add conditional rendering: if type is `verb-form` or `word-form` → render `<THCSFillInBlock>`, if type is `sentence-rewrite` or `sentence-rewrite-keyword` → render `<THCSWritingBlock>`, if type is `reading-cloze-wordbank` → render `<THCSClozeWordBankBlock>`, otherwise (MCQ) → render existing options UI, (c) update the `Select` for type/intent to use the combined list, (d) when type changes from MCQ to Phase 2 type, clear ALL MCQ-specific fields: set `options` to `['', '', '', '']`, `correctAnswer` to `''`, `optionUnderlines` to `undefined`, `underlinedParts` to `undefined`. When type changes from Phase 2 to MCQ, clear ALL Phase 2 fields: set `sentenceTemplate` to `undefined`, `blankAnswers` to `undefined`, `originalSentence` to `undefined`, `sentenceStarter` to `undefined`, `keyword` to `undefined`, `modelAnswers` to `undefined`, `passageTemplate` to `undefined`, `wordBank` to `undefined`, `blankMapping` to `undefined`, `allowWordReuse` to `undefined`, `autoGradeWriting` to `undefined`.
  - [x] 2.5 Modify `src/pages/THCSTestEditorPage.tsx` to pass `draftId` and new callbacks to the new editor blocks. Ensure `handleQuestionUpdate` correctly persists all new Phase 2 fields. Update `createDefaultQuestion()` helper to set default values for Phase 2 types (e.g., empty `sentenceTemplate`, empty `blankAnswers: []`, etc.). When adding questions with Phase 2 types, ensure `questionNumber` recalculation still works correctly.

- [ ] 3.0 Answer Key Panel Extension (All Question Types)
  - [x] 3.1 Create `src/components/thcs-editor/THCSFillInAnswerInput.tsx`. A sub-component for the answer key panel. Renders per fill-in question: shows each blank with a multi-value text input for `acceptedAnswers[]`. Each answer is a chip (deletable). Teacher types + Enter to add. Props: `blankAnswers: BlankAnswer[]`, `onUpdate: (blankIndex: number, answers: string[]) => void`, `onRequestAI: () => void`.
  - [x] 3.2 Create `src/components/thcs-editor/THCSWritingAnswerInput.tsx`. A sub-component for the answer key panel. Renders per writing question: multi-value text input for `modelAnswers[]`. Props: `modelAnswers: string[]`, `onUpdate: (answers: string[]) => void`, `onRequestAI: () => void`.
  - [x] 3.3 Create `src/components/thcs-editor/THCSClozeAnswerInput.tsx`. A sub-component for the answer key panel. Renders per cloze blank: a `Select` dropdown with word bank items. Props: `wordBank: string[]`, `selectedWord: string`, `onUpdate: (word: string) => void`.
  - [x] 3.4 Modify `src/components/thcs-editor/THCSAnswerKeyPanel.tsx`. Extend the existing MCQ-only panel: (a) add new props from PRD §4.11.3: `onUpdateFillInAnswers`, `onUpdateModelAnswers`, `onUpdateClozeMapping`, `onRequestAISuggestions`, (b) group questions by type within the panel (MCQ section → Fill-in section → Writing section → Cloze section), (c) for each group, render the appropriate sub-component, (d) update the `answered`/`missing` counter logic: MCQ=has `correctAnswer`, fill-in=every blank has ≥1 answer, writing=has ≥1 model answer, cloze=every blank mapped to a word, (e) add "🤖 Suggest Alternatives" button per fill-in/writing group.

- [ ] 4.0 Student View Renderers & Answer Sync
  - [x] 4.1 Create `src/components/thcs-student/THCSFillInRenderer.tsx`.
  - [x] 4.2 Create `src/components/thcs-student/THCSWritingRenderer.tsx`.
  - [x] 4.3 Create `src/components/thcs-student/THCSClozeRenderer.tsx`.
  - [x] 4.4 Modify `src/components/thcs-student/THCSQuestionRenderer.tsx` to route to type-specific renderers.
  - [x] 4.5 Modify `src/components/thcs-student/THCSTestLayout.tsx` for mixed answer types and writing sync.
  - [x] 4.6 Update student answer storage — `saveAnswersToRTDB` in `THCSTestLayout.tsx`.

- [ ] 5.0 Auto-Grading Extension (Fill-in + Cloze) & Partially Graded State Machine
  - [x] 5.1 Add `normalizeAnswer()` to `thcsAutoMarking.service.ts`.
  - [x] 5.2 Add `gradeFillInQuestion()` to `thcsAutoMarking.service.ts`.
  - [x] 5.3 Add `gradeClozeQuestion()` to `thcsAutoMarking.service.ts`.
  - [x] 5.4 Extend `markThcsTest()` to handle all question types.
  - [x] 5.5 Implement grading status state machine (auto-graded vs fully-graded).
  - [x] 5.6 Update `thcsResultToTestMarkingResult()` for Phase 2 types.
  - [x] 5.7 Trigger AI writing grading after submission (placeholder — actual implementation in Task 6.5).

- [ ] 6.0 AI-Assisted Writing Grading Service
  - [x] 6.1 Add `gradeWritingAnswer()` to `IAIService` interface.
  - [x] 6.2 Implement `gradeWritingAnswer()` in `gemini.provider.ts`.
  - [x] 6.3 Implement `gradeWritingAnswer()` in `groq.provider.ts`.
  - [x] 6.4 Add `gradeWritingAnswer()` proxy to `router.service.ts`.
  - [x] 6.5 Create `thcsWritingGrading.service.ts` with Tier 1+2 grading.
  - [x] 6.6 Add `suggestAlternativeAnswers()` to AI system (interface, Gemini, Groq, router).


- [x] 7.0 Grading Tab — Route, Navigation, Page & Batch Grading UI
  - [x] 7.1 Add `TEACHER_GRADING: '/teacher/grading'` to `routes.ts`.
  - [x] 7.2 Add lazy import and route in `App.jsx` — `['teacher', 'super_admin']` + `ErrorBoundary`.
  - [x] 7.3 Add grading route to `routeAccess.test.ts` `ROUTE_CONFIG`.
  - [x] 7.4 Add "Grading" button to `TeacherNavigation.tsx` (Management Group, after Homework).
  - [x] 7.5 Add "Grading" to `TeacherHeader.tsx` mobile menu (after homework, before students).
  - [x] 7.6 Create `TeacherGradingPage.tsx` — grading list page with search, filters, deadline sorting.
  - [x] 7.7 Create `GradingTestCard.tsx` — progress bar, student counts, pending badge, action button.
  - [x] 7.8 Create `BatchGradingPanel.tsx` — score presets, feedback, RTDB grade submission.
  - [x] 7.9 Add `sendGradeUpdatedNotification()` to `notificationService.ts`.


- [x] 8.0 THCS Monitor Integration
  - [x] 8.1 Detect `testType === 'THCS-THPT'` in `TeacherTestMonitorPage.tsx`, render `THCSStudentProgressCard` with per-part breakdown, writing status, grade button.
  - [x] 8.2 Create `InlineWritingGrader.tsx` — keyboard-navigable score slider, model answers, AI feedback, RTDB grade submission.
  - [x] 8.3 Add `thcsSections`/`thcsResults` props to `StudentDetailModal` — grouped section view with MCQ ✓/✕, fill-in comparison, writing grade/feedback.

- [x] 9.0 Delta-Based Version Changelog, Version Dropdown & Assignment Pinning
  - [x] 9.1 `computeDelta()` — deep recursive object diff with `~` separator paths, `null` for newly added fields.
  - [x] 9.2 `publishTestUpdate()` — changelog creation with `runTransaction` for race safety (PRD §9 EC8/EC15).
  - [x] 9.3 `saveThcsTestToFirebase()` re-publish detection — calls `publishTestUpdate` when `publishedAt` exists.
  - [x] 9.4 `reconstructVersion()` — backward delta application for version reconstruction.
  - [x] 9.5 `THCSVersionDropdown.tsx` — changelog listing, version view, comparison diff table, "Show all" toggle.
  - [x] 9.6 Assignment version pinning in `sessionManager.js` — `versionKey` + `_cachedVersion` for THCS tests only.

- [x] 10.0 Preview as Student (Phase 2A Static + Phase 2B Interactive)
  - [x] 10.1 Added "Preview 👁️" button between Save Draft and Publish in `THCSTestEditorPage.tsx`. `showPreview` state toggles the overlay.
  - [x] 10.2 Created `THCSPreviewOverlay.tsx` — Phase 2A static fullscreen overlay with banner, section navigation, passage rendering. Uses `convertDraftToPreviewTest()` helper.
  - [x] 10.3 Phase 2B interactive mode — toggle between Static/Interactive, timer countdown, clickable answers (local state only, NO RTDB), mock auto-grading on submit with score display and Retry button.

- [x] 11.0 Two-Column Layout Activation & Mixed Section Handling
  - [x] 11.1 Auto-default layout in `THCSSectionBlock.tsx` — reading intents → two-column, others → single-column. `isCustomLayout` flag prevents auto-reverting. `READING_INTENTS` already includes `reading-cloze-wordbank` in both editor and student layout.
  - [x] 11.2 Mixed question type handling — auto-set generic instruction, warning banner in section body, validation warning on publish.
  - [x] 11.3 Phase 2 validation rules in `useThcsValidation.ts` — fill-in (blank markers, accepted answers, AI review), writing (original sentence, starter/keyword, model answers), cloze (word mapping, distractor check, blank/word count).
