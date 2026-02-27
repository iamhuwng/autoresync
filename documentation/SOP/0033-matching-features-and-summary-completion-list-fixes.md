# 0033 - Matching Features & Summary Completion List Display Fixes

**Date:** 2026-02-12
**Scope:** IELTS Question Type Display Bugs — Matching Features review preview + Summary Completion (List) paragraph reconstruction
**Status:** Matching Features ✅ Complete | Summary Completion List ⚠️ Prompt Fix Applied, Needs Re-parse & Testing

---

## 1. Matching Features Display Bug (Completed)

### Problem
In the **ParseReviewPanel** (test creation review step), "Matching Features" questions displayed only the option letter (e.g., "A", "B", "C") inside `<Chip>` components, instead of showing the full text (e.g., "A. Freeman"). Additionally, the `value` prop on `<Chip>` was set incorrectly, breaking answer highlighting logic — selected answers wouldn't visually match.

### Root Cause
In `ParseReviewPanel.tsx` (lines 528-558), the `QuestionPreview` component's matching-type branch was:
1. Displaying only `String.fromCharCode(65 + i)` as the Chip label (letter only)
2. Using the full option text as the Chip `value`, preventing answer matching since answers are stored as single letters ("A", "B", etc.)

### Fix Applied
**File:** `kahoot/src/components/test-creation/ParseReviewPanel.tsx` (lines 528-558)

- Changed Chip label to show `{letter}. {optionText}` (e.g., "A. Freeman")
- Changed Chip `value` to use the letter only (`String.fromCharCode(65 + i)`) so it matches the answer format for highlighting
- Increased option-count threshold from 5 → 8 before switching to a `<Select>` dropdown
- Added `wrap="wrap"` to `<Group>` for better overflow handling

### Result
Matching Features questions now display correctly in the review step with proper text labels and working answer highlighting.

---

## 2. Summary Completion List Display Bug (Prompt Fix Applied — Needs Testing)

### Problem
"Summary Completion (List)" questions (e.g., Q27-31 from Cambridge 10, Reading Test 2) were displayed as **fragmented, disconnected sentences** with inline dropdowns, instead of a single continuous paragraph. The opening text of the paragraph was completely missing.

**Expected:** A flowing paragraph starting with "People go to art museums because they accept the value of seeing an original work of art..." with dropdowns at each blank position.

**Actual:** Disjointed fragments like:
- "perhaps because the availability of novels has depended on [▼] for so long"
- "[▼] are the most important thing"
- (missing: "People go to art museums because...")

### Root Cause Analysis

A multi-layered investigation was performed across the full data pipeline:

#### Layer 1: Rendering Component (`IELTSQuestionsPanel.tsx`, lines 550-585)
The rendering logic has **two modes**:
1. **Full paragraph mode** (line 559): If the first question's `questionText` contains ALL blanks (`blankCount >= group.questions.length`), it splits by underscores and inserts dropdowns. ✅ This mode works correctly.
2. **Fragment concatenation mode** (line 568): If each question has its own text fragment, it concatenates them. ⚠️ This mode cannot reconstruct **missing** text that the AI never extracted.

**Conclusion:** The rendering logic was correct for the intended data format. The problem was upstream.

#### Layer 2: AI Prompts (`gemini.provider.ts` & `groq.provider.ts`)
The AI prompts instructed the model to extract each question as a **separate fragment** around its blank, rather than the full summary paragraph in the first question. The example in the prompt showed:
```json
"questionText": "The colony was established for ____"
```
This led the AI to extract each blank's surrounding context separately, losing the paragraph beginning and inter-blank text.

**Conclusion:** This was the **root cause**. The AI prompt needed to instruct the model to extract the FULL summary paragraph with ALL blanks in the first question's `questionText`.

#### Layer 3: Validation Schema (`response.validator.ts`, line 42)
The Zod schema required `questionText: z.string().min(1)`, which would reject the intended fix where subsequent questions (Q28-Q31) have `questionText = ""`.

**Conclusion:** The schema needed adjustment to allow empty strings.

#### Layer 4: Data Pipeline (`ai-extractor.service.ts`, `validator.service.ts`, `TestCreationModal.tsx`)
- `AIQuestionResult` interface doesn't carry `sectionInstruction` through to `MergedQuestion`
- `TestCreationModal.tsx` maps `mergedQuestions` to final draft questions but drops `instructions` field
- The `sectionInstruction` is only partially preserved (stored per-question in AI response, mapped to `instructions` in `ExtractedQuestion`, but lost at `MergedQuestion` → draft boundary)

**Conclusion:** The `sectionInstruction` pipeline gap is a separate issue — it doesn't block the primary fix but means the summary title heading (e.g., "The value attached to original works of art") won't appear above the paragraph unless carried through the full pipeline.

### Fixes Applied

#### Fix 1: Gemini Prompt — `buildQuestionsPrompt` (line ~365)
Added annotation to the summary-completion-list type description:
```
⚠️ FIRST question MUST contain the ENTIRE summary paragraph with ALL blanks (______). Subsequent questions get empty questionText "".
```

#### Fix 2: Gemini Prompt — `buildQuestionsAndAnswersPrompt` (lines ~707-730)
Added a comprehensive **⚠️ CRITICAL** section with:
- Explicit rules (first question = full paragraph, subsequent = empty)
- ✅ Correct example with 5 blanks across 3 paragraph sentences
- ❌ Wrong examples showing what to avoid
- Concrete JSON output example showing Q27 (full paragraph) and Q28 (empty text)

#### Fix 3: Groq Prompt — Both methods (lines ~434, ~670)
Mirrored the same instructions and JSON examples for consistency.

#### Fix 4: Response Validator (`response.validator.ts`, line 42)
Changed `questionText: z.string().min(1)` → `z.string().min(0)` to allow empty strings for subsequent questions in summary-completion-list groups.

### Unresolved Gaps & Risks

#### Gap 1: No Rendering-Side Fallback for Title/Heading
The summary heading (e.g., "The value attached to original works of art") is expected to come via `sectionInstruction`, but this field is **not carried through** the full pipeline to the student view. The `IELTSQuestionsPanel` hardcodes "List of Phrases" (line 690) regardless of actual content.

**Impact:** Minor — the paragraph content itself is correct, just the title above it may be generic.
**Recommendation:** Carry `sectionInstruction` through `MergedQuestion` → draft → published test → student view. Update the hardcoded "List of Phrases" to use this dynamic title.

#### Gap 2: Existing Tests Not Auto-Fixed
Tests already created with the old fragmented format will continue using the fragment concatenation fallback path. They won't display the full paragraph until re-parsed with the updated prompts.

**Impact:** Medium — existing tests in Firebase have incorrect data.
**Recommendation:** Document this for teachers. Consider a migration tool or re-parse button.

#### Gap 3: `min(0)` Schema Relaxation
Changing `questionText` to `min(0)` allows empty strings for ALL question types, not just `summary-completion-list`. This is a broader relaxation than necessary.

**Impact:** Low — the AI is unlikely to return empty text for non-summary types, and if it does, it would fail at the rendering stage visually, not silently.
**Recommendation:** Consider adding type-conditional validation if issues arise.

#### Gap 4: AI Compliance Not Guaranteed
The fix relies on the AI **following** the prompt instructions. LLMs can ignore instructions, especially under edge cases (very long passages, unusual formatting, multiple summary sections in one test).

**Impact:** Medium — the fragment concatenation fallback still works, just imperfectly.
**Recommendation:** Add a post-processing step in `normalizeResult()` or `ai-extractor.service.ts` that detects `summary-completion-list` groups and merges fragmented `questionText` fields if the first question doesn't contain all blanks.

#### Gap 5: `summary-completion-text` Not Addressed
The same paragraph reconstruction issue could theoretically apply to `summary-completion-text` (where blanks are filled from the passage rather than a word bank). This type was not explicitly addressed in this fix.

**Impact:** Low — `summary-completion-text` may already work differently since it has different rendering logic.
**Recommendation:** Verify `summary-completion-text` rendering with a test case.

---

## 3. Key Design Decisions

1. **Prompt-first fix vs. rendering-side fix:** We chose to fix the AI prompt to produce the correct data structure, rather than trying to reconstruct missing text at the rendering layer. This is more sustainable because the rendering component can't recover text that was never extracted.

2. **Backward compatibility:** The rendering code's fragment concatenation path (lines 568-584) serves as a fallback for old data. We did NOT remove it.

3. **Schema relaxation over conditional validation:** We relaxed `min(1)` → `min(0)` globally rather than adding type-conditional logic, trading minimal safety for simplicity.

---

## 4. Files Modified

| File | Change | Lines |
|------|--------|-------|
| `components/test-creation/ParseReviewPanel.tsx` | Matching Features Chip display fix | 528-558 |
| `services/ai/gemini.provider.ts` | Summary-completion-list full paragraph instructions + examples | ~365, ~707-730, ~940-960 |
| `services/ai/groq.provider.ts` | Same instructions mirrored for Groq provider | ~434, ~670, ~785-806 |
| `services/ai/response.validator.ts` | Allow empty questionText (`min(0)`) | 42 |

## 5. Files Investigated (Not Modified)

| File | Purpose |
|------|---------|
| `components/test/IELTSQuestionsPanel.tsx` | Verified rendering logic is correct for new format |
| `services/test-creation/ai-extractor.service.ts` | Traced data pipeline, identified sectionInstruction gap |
| `services/test-creation/validator.service.ts` | Confirmed MergedQuestion doesn't carry sectionInstruction |
| `components/test-creation/TestCreationModal.tsx` | Confirmed instructions field dropped at draft creation |
| `documentation/samples/Cam 10 reding Test 2.md` | Reference source material for expected paragraph format |
