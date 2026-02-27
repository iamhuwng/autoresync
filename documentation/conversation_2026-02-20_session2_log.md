# Session Date: 2026-02-20

## Objective
Investigate and resolve the issue where IELTS Reading test completion tasks default to a word limit of 1, ignoring original instructions from the text (from test creation all the way to student test view). 

## Analysis & Root Causes
1. **Parsing extraction limitation**: Although `type-classifier.service.ts` successfully extracted word limits and the validator stored them inside the `MergedQuestion` (`wordLimit: { max, min? }`), these limits were being immediately dropped when transforming `MergedQuestion` representations into the UI's `ParsedQuestion` models.
2. **Draft Load/Publish State Data Loss**: During the review step (`TestReviewPage.tsx`), loading and publishing maps explicitly omitted preserving `wordLimit` to database storage format (`StorageQuestion`), meaning NO word limit was being saved into Firebase for tests.
3. **Manual Override UI Bug**: The section instruction header within the review page allowed teachers to update the word limit override. However, `TestReviewPage.tsx` intercepted this callback and only saved the `text` field, completely ignoring their `wordLimit` input.
4. **Student Render Logic Hardcoded Fallbacks**: Within the actual test (`AuthenticAnswerInput.tsx` and `IELTSQuestionsPanel.tsx`), the student view ignored limits on individual questions. The `getMaxWordsForType` function blindly defaulted to specific preset limits based exclusively on question type (`1` for `sentence-completion`, `2` for `summary-completion` etc). Furthermore, test instruction banners (e.g. `Choose ONE WORD ONLY`) were hardcoded to these defaults regardless of real test settings.

## Fixes Implemented
1. **Backend Integration (`document.types.ts`)**: 
   - Added `wordLimit?: number` and `sectionInstructionId?: string` directly to the `ParsedQuestion` interface to carry through word limitations at a localized level.
2. **Review Mapping Integration (`useTestCreation.ts`)**: 
   - Updated the mapping of AI-extracted representations `MergedQuestion` → `ParsedQuestion` to safely preserve `wordLimit` (`wordLimit: q.wordLimit?.max`).
   - Ensured mapping to `StorageQuestion` properly transfers the `wordLimit`.
3. **Draft Load and Override Hook logic (`TestReviewPage.tsx`)**: 
   - Made sure that loading past drafts accurately restores `wordLimit` per question.
   - Fixed the `handleSectionInstructionChange` callback: When the teacher changes the `wordLimit` field override manually, the system now automatically applies their new `wordLimit` specifically to all questions inside that `sectionInstructionId` or `passageId`.
4. **Student UI Word Limits & Labels (`AuthenticAnswerInput.tsx` & `IELTSQuestionsPanel.tsx`)**: 
   - Updated the `getMaxWordsForType` function across the board to accept the mapped `question.wordLimit` as priority, removing the hardcoded assumptions.
   - Refactored `IELTSQuestionsPanel.tsx`'s test instructions logic (`getTaskInstructions`) to generate instructions accurately matching the explicit `wordLimit` requirement (e.g. automatically re-wording to "Choose NO MORE THAN THREE WORDS..."). This fully restores realistic simulation properties. Code compiled successfully after fixes.

## 2. Root Cause Consolidation (Session 2)

### Request
Assess, evaluate, and devise a plan to consolidate the work. Investigate app codes and app interaction from test creation to student test view to identify all places which require fixes.

### Investigation
Performed exhaustive audit of 10+ files across the full pipeline:
- `type-classifier.service.ts` → `validator.service.ts` → `useTestCreation.ts` → `TestReviewPage.tsx` → `testStorage.ts` → `useTestData.ts` → `AuthenticAnswerInput.tsx` / `IELTSQuestionsPanel.tsx`

### Critical Root Cause Found
All upstream fixes were correctly implemented, BUT `testStorage.ts:saveTestToFirebase` (line 213) creates a new `formatted` object that **silently drops `wordLimit`**. The `TestData.questions` type definition also lacked `wordLimit`. This means every published test had `wordLimit: undefined` in Firebase, causing student views to always fall back to hardcoded defaults.

### Fixes Applied
1. **`testStorage.ts`**: Added `wordLimit` and `sectionInstructionId` to `TestData.questions` type, persisted them in `saveTestToFirebase` question formatting, added diagnostic logging
2. **`testStorage.test.ts`**: Added 2 unit tests verifying wordLimit persistence (positive case: wordLimit=3 persisted; edge case: wordLimit=0 omitted)

### Verification
- All 22 unit tests pass ✅
- Production build succeeds ✅

## 3. Fixing Answer Checker Logic (Session 3)

### Request
Check the screen recording where most of the questions which are marked as wrong are actually correct. Investigate conversational logs, app codes, interaction among client-server, teacher-student, from test creation to student test view to identify all places which require fixes, treat the problem at root cause, and provide a contingency to prevent recurrence.

### Investigation
Analysis of the provided screen recording (`20.02.2026 18_35.webm`) using the Browser Subagent indicated that:
- **Heading Matching & Multiple Choice & True/False**: Correct key answers (like "iv" or "F") were throwing an `"invalid answer format"` error. Furthermore, matching questions where the user appended verbose text (e.g. `"iv. The time and place..."`) were failing.
- **Short-Answer/Fill in the Blank**: Acceptable alternative answers (`/` syntax) and optional phrases (`( )` syntax) inside the test's `correctAnswer` properties were not being parsed dynamically (e.g., student answer `"books]activities"` vs correct `"books (and) activities"`; `"regulation"` vs `"internal regulation / self-regulation"`).

Investigating the project codebase quickly narrowed down the error format string and the marking logic to `src/services/autoMarking.service.ts`.

### Critical Root Causes Found
1. **Strict Answer Type Checks in Specific Modules**: `scoreMatching`, `scoreDiagramLabeling`, and `scoreMultipleSelect` forcefully returned `"Invalid answer format."` if the input `studentAnswer` wasn't exactly an Array or Object. In the modern `AuthenticAnswerInput` implementation, all singular item answers arrive as single primitive `string`s. Therefore, tests AI-classified as `matching` or related types automatically evaluated correctly-formed string inputs as invalid formats.
2. **Brittle String Equality for Sentence Completion**: The system's standard `answersMatch()` logic simply normalized and matched exact strings. It was completely unaware of standard IELTS answer key syntaxes such as alternative separators (`/`, `|`) and optional words denoted by parentheses `()`.
3. **Rigid Punctuation Preservations**: Punctuation inside user inputs (e.g., mistaken bracket characters `]`) completely nullified potential matches, meaning human-input errors outside of standard punctuation were overly penalized.

### Fixes Applied
1. **`autoMarking.service.ts` -> Type Coercion for String Fallbacks**: Edited the `scoreMatching`, `scoreDiagramLabeling`, and `scoreMultipleSelect` to explicitly allow single `string` answers representing a 1-to-1 question. Checked using standard `answersMatch` instead of expecting an object map, permanently averting the `"invalid answer format"` bug from showing up in student reports.
2. **`autoMarking.service.ts` -> Normalization Pipeline Overhaul**: Upgraded `normalizeAnswer` to intelligently translate extraneous bracket and punctuation inputs `[]{}()<>,;!?` into simple spaces natively allowing matching.
3. **`autoMarking.service.ts` -> Key Extraction Matching**: Configured `answersMatch` for Matching Headings and Multiple Choice to actively extract pure key patterns (like `"iv"` or `"B"`) from student inputs formatted like `"iv. verbose header detail..."` ensuring robustness.
4. **`autoMarking.service.test.ts` -> Contingency Test Suite**: Created a comprehensive testing suite `autoMarking.service.test.ts` handling all regression checkpoints using `vitest` covering exact match, permutations, and single-string fallback cases.

### Verification
- Ran vitest and 9/9 tests pass seamlessly. ✅


## 4. Resolving Answer Key Processing Architecture (Session 4)

### Request
The user disagreed with generating variants at test completion time (Generative Variant Expansion Pipeline), declaring this should be dealt with at the "answer key input step" to solve mismatch dynamically while preserving the required IELTS original string syntax. E.g., handling the original key `"books (and) activities"` properly against expected multiple UI blank inputs mapped as `"books|activities"`.

### Root Cause / Logic Optimization
Dynamically separating `()` paths and translating `/` syntax during auto-grading meant the grading service couldn't efficiently sync with complex multiple-blank inputs (where `AuthenticAnswerInput` structurally sends `value1|value2`). The correct architecture requires separating **view-logic answers** and **evaluation configurations**.

### Fixes Applied
1. **`testStorage.ts` -> Compile Acceptable Variants**: Created a `compileAcceptableAnswers` mapping function directly inside the test publishing pipeline (`saveTestToFirebase`). Extracted exact variant structures needed by UI components (e.g. splitting `/`, rendering `()` alternatives, and specifically combining multi-blanks using `|` to represent dual-input matching forms based on placeholder counts in `questionText`). These are natively saved into the Firebase model `acceptableAnswers` array!
2. **`autoMarking.service.ts` -> Reverted Runtime Expansion**: Deleted `expandCorrectAnswers` from runtime scoring logic. The module is now strictly a strict evaluator (O(1) mapping matching against pre-compiled keys). 
3. **`autoMarking.service.ts` -> Injected Interface Alignment**: Updated standard checking to use a centralized `isAnswerCorrect` interceptor that loops statically provided options `[...targetAnswer, ...question.acceptableAnswers]` ensuring exact checks with DB-provided data without hallucinated parsing!
4. **`autoMarking.service.test.ts` Update**: Adjusted tests injecting synthesized `acceptableAnswers` proving that the scoring mechanisms effectively rely on compiler outputs.

### Verification
- Ran `vitest run src/services/autoMarking.service.test.ts` - 9/9 unit tests cleanly passed. ✅

## 5. Fix Persistent Word Limit & Auto-Marking Bugs (Session 5)

### Request
User provided screenshot and video evidence from a **newly created** test (Cam 10 Reading Test 2) showing:
1. Q23-26 sentence completion still shows word limit as 1 (should be 2 per "NO MORE THAN TWO WORDS")
2. Correct student answers still graded as incorrect (MCQ prefix mismatch, heading text vs index, multi-blank variant failure)

### Root Causes Found
1. **Orphaned `extractWordLimit()`**: The regex function in `type-classifier.service.ts` was never called by `classifyQuestion()`. The `ClassificationResult` interface lacked a `wordLimit` field entirely.
2. **Pipeline gap in `index.ts:344`**: The `rulesQuestions` mapping only extracted `type` and `confidence`, silently dropping word limit data.
3. **Wrong field for blank counting**: `testStorage.ts:263` passed `question.question` (instruction text) to `compileAcceptableAnswers()` instead of `question.questionText` (contains actual blanks `___`).
4. **MCQ/Matching prefix mismatch**: Student UI sends full text ("C the negative effect...") but DB stores just "C". No resolution logic existed.

### Fixes Applied
1. **`type-classifier.service.ts`**: Added `wordLimit?: WordLimitResult | null` to `ClassificationResult`. Integrated `this.extractWordLimit(text)` into `classifyQuestion()` and propagated through `detectFromSectionContext()`.
2. **`test-creation/index.ts`**: Updated `rulesQuestions` mapping to propagate `r.wordLimit.maxWords` → `wordLimit.max` on `RulesQuestionResult`.
3. **`testStorage.ts`**: Changed to `(question as any).questionText || question.question || ''` for blank counting.
4. **`autoMarking.service.ts`**: Added `extractOptionPrefix()` helper resolving answer labels from full option text. Updated `isAnswerCorrect()` to use prefix resolution bidirectionally.

### Verification
- All 121 tests passed (autoMarking: 9, type-classifier: 91, testStorage: 21) ✅
- Production build succeeded (exit code 0) ✅
## 6. Reassess Implementation & Scoring Consolidation (Session 6)

### Request
User requested a reassessment of the implementation to provide necessary consolidation measures or fixes.

### Critical Finding: Dual Scoring Architecture
An end-to-end audit of the scoring pipeline revealed a major architectural flaw: **there were two completely independent scoring engines**.
1. **Live Submission Path** (`useTestSubmission.ts`): Used by students submitting real-time tests. Contained **~150 lines of rigid, inline scoring logic** that bypassed all recent auto-marking fixes.
2. **Results Review Path** (`autoMarking.service.ts`): Used by teachers/students viewing past results, and by the disconnect auto-submitter. Contained all the robust fixes (prefix resolution, acceptableAnswers permutations, etc.).

**Impact:** A student entering a perfectly valid variable answer (e.g. `books|activities`) during a live test was incorrectly graded by the inline `useTestSubmission.ts` logic. The previous sessions' fixes to `autoMarking.service.ts` had no effect on live submissions.

### Fixes Applied
1. **Removed Inline Logic**: Deleted the 150-line custom grading implementation inside `useTestSubmission.ts`.
2. **Delegated to `autoMarking` Engine**: Re-wrote the `markTestWithAnswers` hook to cleanly loop through submissions and pass them directly into `scoreQuestion()` from `autoMarking.service.ts`.
3. **Consolidated Behavior**: All IELTS question constraints, `acceptableAnswers` compilations, roman numeral normalization, and prefix extractions are now universally applied exactly when the student clicks "Submit".

### Verification
- `autoMarking.service.test.ts` (9/9 passed) ✅
- Production build succeeded (exit code 0) ✅
- Created `assessment_report.md` detailing the architectural unification.

## 7. Word Limit Drop in TestCreationModal Draft Flow (Session 7)

### Request
Despite all upstream fixes in Sessions 1–6, user reported word limit was **still** defaulting to 1 for questions 23–26 when creating a new test via the modal. This indicated another data drop point somewhere downstream that all prior fixes had missed.

### Debugging Journey

#### Phase 1: Establishing What Works
The first step was a **complete static pipeline trace**, methodically verifying each stage by reading the actual source code rather than adding more runtime logging (which had caused an infinite render loop in a prior session).

**Files traced in order:**
1. `type-classifier.service.ts` → `extractWordLimit()` — Regex patterns correctly parse "NO MORE THAN TWO WORDS" → `{maxWords: 2}` ✅
2. `type-classifier.service.ts` → `detectFromSectionContext()` — Calls `extractWordLimit`, returns `ClassificationResult.wordLimit` ✅
3. `test-creation/index.ts` → `rulesResult` mapping — Propagates `r.wordLimit` to `RulesQuestionResult` ✅
4. `validator.service.ts` → `createMergedQuestion()` — Sets `wordLimit: rulesQ?.wordLimit` on `MergedQuestion` ✅
5. `useTestCreation.ts` → `parsedQuestions` mapping — Maps `q.wordLimit?.max` to `ParsedQuestion.wordLimit` ✅
6. `testStorage.ts` → `saveTestToFirebase` — Persists `wordLimit` when `> 0` ✅
7. `AuthenticAnswerInput.tsx` → `getMaxWordsForType()` — Prioritizes `manualLimit` over type-defaults ✅
8. `IELTSQuestionsPanel.tsx` → `groupQuestionsByTaskType()` — Uses `firstQ.wordLimit` for group instructions ✅

**Every single stage was correct.** This was confusing — the pipeline appeared watertight.

#### Phase 2: The Breakthrough — Two Separate Code Paths
The key insight came from realizing there were **two independent code paths** for creating tests:

| Path | Entry Point | Where Questions Are Mapped |
|------|------------|---------------------------|
| **Direct hook flow** | `useTestCreation.ts` | Line 311 — includes `wordLimit: q.wordLimit?.max` ✅ |
| **Modal draft flow** | `TestCreationModal.tsx` | Line 492 — **missing `wordLimit` entirely** ❌ |

The user was creating tests through the **modal wizard** (TestCreationModal), which has its own question mapping at lines 492–505 inside `startRealParsing()`. This mapping built question objects for `saveParsedContent()` but **never included the `wordLimit` field**:

```typescript
// TestCreationModal.tsx:492 — BEFORE fix
const questions = validation?.mergedQuestions?.map(q => ({
    id: `q-${q.questionNumber}`,
    number: q.questionNumber,
    questionNumber: q.questionNumber,
    questionText: q.questionText || '',
    question: q.questionText || '',
    type: q.type,
    options: q.options || [],
    answer: q.answer || '',
    answerSource: 'ai-suggestion' as const,
    passageId: q.passageId || passages[0]?.id || 'default',
    confidence: q.confidence || 80,
    points: 1,
    // ❌ wordLimit was NEVER included here
}));
```

This was the **true root cause** across all sessions. The `useTestCreation.ts` path (Step 5 in our trace) had been fixed in Session 1, but it was never the actual code path used by the modal wizard. The modal had its own completely independent mapping.

### Fix Applied
- **`TestCreationModal.tsx:505`**: Added `wordLimit: q.wordLimit?.max` to the questions mapping.

The `draftCloudService.ts:saveParsedContent()` function was verified to use `deepRemoveUndefined()` and passes the entire questions array to Firestore, so adding `wordLimit` to the mapping is sufficient — no downstream changes needed.

### Cleanup
Removed all diagnostic logging that had accumulated across 4 files during prior debugging sessions:
- `type-classifier.service.ts`: 3 `console.log` calls from `extractWordLimit` and `classifySection`
- `index.ts`: Reverted `rulesResult` mapping from verbose debug form to clean arrow function
- `validator.service.ts`: Removed `mergedWordLimit` conditional debug block from `createMergedQuestion`
- `useTestCreation.ts`: Removed conditional wordLimit trace in `parsedQuestions` mapping

### Verification
- Production build succeeded (exit code 0) ✅

### Lesson Learned

> **Duplicate mapping paths are a persistent architectural risk.** When data flows through multiple independent code paths to the same destination (Firestore), fixing one path does not fix the other. The `useTestCreation.ts` hook and the `TestCreationModal.tsx` modal both map `MergedQuestion → StorageQuestion`, but they are completely independent implementations. Future field additions (e.g. `sectionInstructionId`, `acceptableAnswers`) must be manually checked against **both** paths to avoid silent data drops. A potential long-term fix is to extract the question mapping into a shared utility function used by both paths.

## 8. Stale Results Shown After Submission (Session 8)

### Request
User reported that after deleting old tests, creating new ones, opening new sessions, and submitting new attempts, the **exact same old scores/answers** from a previous attempt were displayed in the results modal. Word limit fix was confirmed working.

### Key Design Clarification from User
Test results are **independent entities**. Deleting a test must NOT delete its associated results. Results carry their own metadata (test title, type, skill, scores, question breakdown) precisely for long-term search/identification/analysis purposes. They are not permanently tied to the test lifecycle.

### Root Cause
The `getStudentSessionResult(studentId, sessionCode)` function in `testResults.service.ts` used `.find()` to locate a result matching the sessionCode. When teachers reuse the same live session (same sessionCode) for multiple tests, each submission creates a new `test_results` record. **`.find()` returns the first (oldest) match** — so the modal always displayed the original test's results.

The same bug existed in `TestResultsModal.tsx` Strategy 2 fallback.

### Fix Applied
Changed **both** locations from `.find()` to `.filter().sort(submittedAt desc)[0]`:

```typescript
// BEFORE — returns oldest match
const result = studentResults.find(r => r.sessionCode === sessionCode);

// AFTER — returns most recent match
const result = studentResults
  .filter(r => r.sessionCode === sessionCode)
  .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0];
```

**Files modified:**
- `testResults.service.ts:getStudentSessionResult` (line 639)
- `TestResultsModal.tsx` Strategy 2 fallback (line 85)

### Verification
- Production build succeeded (exit code 0) ✅
