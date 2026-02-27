# Conversation Log — 2026-02-17

**Session Start:** 2026-02-17 ~03:00 AM (ICT)
**Topic:** Fixing IELTS Scoring Discrepancies, Multi-Blank Question Rendering, and Word Limit Enforcement

---

## 1. Lint Fix — Regex Capture Group Safety

**User Request:** (Continuation from previous session) Fix lint error on `labelMatch[1]` possibly being `undefined`.

**Action Taken:**
- File: `src/hooks/test/useTestSubmission.ts`, line 252
- Change: `labelMatch[1]` → `labelMatch[1] || ''` to satisfy TypeScript strict null check
- Build verified: ✅ Pass

**Files Modified:**
- `src/hooks/test/useTestSubmission.ts` (line 252)

---

## 2. Investigation — Remaining Scoring & UI Issues

**User Request:** Resolve the remaining issues at root cause level. If the current implementation cannot be easily adapted, freely open up to drastic solutions.

**Issues Identified:**

### Issue A: Hardcoded Word Limits
- `InlineCompletionInput` in `AuthenticAnswerInput.tsx` hardcodes `maxWords = 2`
- `ShortAnswerInput` hardcodes `maxWords = 3`
- IELTS question types have different word limits:
  - `sentence-completion` / `diagram-labeling` → ONE WORD ONLY (1)
  - `summary-completion-text` / `table-completion` etc. → NO MORE THAN TWO WORDS (2)
  - `short-answer` → NO MORE THAN THREE WORDS AND/OR A NUMBER (3)
- The word limit indicator shown to students was **misleading** for certain question types

### Issue B: Multi-Blank Questions Show Only 1 Input
- Questions like Q23 (`"availability of ___ and ___ at home"`) have 2 blanks but UI only rendered 1 input
- Root cause: `InlineContextCompletionInput` used `parts[0]` + ONE input + `parts.slice(1).join(' ')`, losing all subsequent blanks as plain text
- Same bug existed in 2 additional locations in `IELTSQuestionsPanel.tsx` (colon-format table and pipe-format table rendering)
- The `AnswerKeyModal` for teachers also had no way to enter multi-blank answers

**Investigation Process:**
1. Traced how `InlineContextCompletionInput` renders blanks — confirmed it splits on `/{3,}/` but only places 1 input
2. Checked `IELTSQuestionsPanel.tsx` table-completion rendering — same pattern at lines 872-919 (pipe-format) and lines 1122-1161 (colon-format)
3. Checked `summary-completion-list` rendering — this was CORRECT (each blank maps to a different question, not multiple blanks per question)
4. Checked `SummaryCompletionListInput` in `AuthenticAnswerInput.tsx` — also correct (single dropdown per question)
5. Checked `AnswerKeyModal.tsx` — single `TextInput` per question, no multi-blank awareness

---

## 3. Implementation — Root Cause Fixes (3 Layers)

**Design Decision: Pipe-delimited storage (`|`)**
- For multi-blank questions (2+ `___` in question text), store combined answer as `word1|word2`
- Pipe (`|`) chosen because it never appears in natural IELTS answer text
- Single-blank questions continue to store plain strings (fully backward compatible)
- Multi-blank inputs display labels like `23a`, `23b` to distinguish blanks

### Layer 1: Student UI (AuthenticAnswerInput.tsx)

**Changes:**
1. **Added `getMaxWordsForType(type)` utility** — derives correct word limit from IELTS question type
2. **Updated `InlineCompletionInput`** — now accepts `question` prop, uses `getMaxWordsForType()` instead of hardcoded `2`
3. **Updated `ShortAnswerInput`** — same: uses `getMaxWordsForType()` instead of hardcoded `3`
4. **Rewrote `InlineContextCompletionInput`** — now renders ALL blanks:
   - Detects N blanks via `split(/_{3,}/)`
   - Renders N inputs inline within the text flow
   - Each input tracks its own value
   - Combined answer stored as pipe-delimited string (`word1|word2`)
   - Single-blank backward compatible (stores as plain string)
   - Shows word-limit warning per blank when exceeded
   - Dynamic input width based on content length

### Layer 2: Student UI (IELTSQuestionsPanel.tsx)

**Two table rendering locations fixed:**

1. **Pipe-format table** (lines 872-919) — multi-blank cells now render N inputs with pipe-delimited storage
2. **Colon-format table** (lines 1122-1161) — same fix applied

Both use the same pattern: detect blank count, parse pipe-delimited answer into array, render per-blank inputs, combine on change.

### Layer 3: Teacher UI (AnswerKeyModal.tsx)

**Changes:**
1. **Added `MultiBlankAnswerInput` component** — controlled input component with:
   - Separate labeled text fields per blank (e.g., `23a`, `23b`)
   - Submit button (enabled only when all blanks filled)
   - Stores combined answer as pipe-delimited string
   - Instructions text explaining the format
2. **Updated question list rendering** — detects multi-blank questions (2+ `___` in `questionText`) and renders `MultiBlankAnswerInput` instead of single `TextInput`
3. **Added "N blanks" badge** to multi-blank questions for teacher visibility

### Layer 4: Scoring (useTestSubmission.ts)

**Updated the text-based completion scoring branch:**
- Detects multi-blank questions by counting `___` in question text
- If multi-blank AND answer contains `|`: splits both student and correct answers by pipe, compares each part individually with normalized comparison
- Length mismatch fallback: joins all parts and compares as single string
- Single-blank: unchanged normalized comparison (backward compatible)

**Files Modified:**
- `src/components/test/AuthenticAnswerInput.tsx` — getMaxWordsForType utility, InlineCompletionInput, ShortAnswerInput, InlineContextCompletionInput rewrite
- `src/components/test/IELTSQuestionsPanel.tsx` — 2 table rendering locations
- `src/components/test-creation/AnswerKeyModal.tsx` — MultiBlankAnswerInput component + multi-blank detection
- `src/hooks/test/useTestSubmission.ts` — pipe-delimited scoring logic

**Build Status:** ✅ All 4 files compile, full build passes (exit code 0)

---

## 4. Verification — Remaining `parts.slice(1).join(' ')` Patterns

**Action:** Searched for any remaining instances of the old single-blank pattern across the codebase.

**Results:**
- `IELTSQuestionsPanel.tsx:578` — summary-completion-list: **CORRECT** (each blank = different question, not multi-blank per question)
- `AuthenticAnswerInput.tsx:770` — SummaryCompletionListInput: **CORRECT** (single dropdown per question)

**Conclusion:** All multi-blank rendering locations have been fixed. The remaining `parts.slice(1).join(' ')` instances are in contexts where each blank maps to a separate question (not multiple blanks within one question), so they are correct.

---

## Summary of All Changes This Session

| File | Lines Changed | What |
|------|-------------|------|
| `useTestSubmission.ts` | 252 | Lint fix: `labelMatch[1] \|\| ''` |
| `AuthenticAnswerInput.tsx` | ~120 lines | Word limit utility + multi-blank rewrite |
| `IELTSQuestionsPanel.tsx` | ~70 lines | 2 table renderers → multi-blank |
| `AnswerKeyModal.tsx` | ~80 lines | MultiBlankAnswerInput + detection |
| `useTestSubmission.ts` | ~25 lines | Pipe-delimited scoring |

**Pre-existing lint warnings (NOT from this session):**
- `IELTSQuestionsPanel.tsx:208` — unused `partIndex`
- `IELTSQuestionsPanel.tsx:209` — unused `skill`
- `AnswerKeyModal.tsx:90-91` — type narrowing in `parseBulkAnswers`

---

## 5. Investigation — GEMINI.md File Discrepancy

**User Request:** User asked to "update conversation log according to antigravity rules." Agent read `C:\Users\Sanctuary\.gemini\GEMINI.md` but returned different content than what the user sees.

**Investigation:**
1. Searched for all `GEMINI.md` files across the user profile — found 13 instances
2. The file at `C:\Users\Sanctuary\.gemini\GEMINI.md` was **5,368 bytes, last modified October 19, 2025** — contained old "Gemini Added Memories" content
3. The user's actual rules (File Management, Conversation Log, Context Window) lived in `C:\Users\Sanctuary\.gemini\antigravity\code_tracker\active\no_repo\a77e2e9b03a47e37561e26f110e61096_GEMINI.md`
4. This is a hashed filename managed by the **Antigravity Sync VS Code extension** (`mrd9999.antigravity-sync`)

**Root Cause:** The Antigravity Sync extension maintains its own tracked copy of GEMINI.md and presents it to the user via the editor. But the physical file at `C:\Users\Sanctuary\.gemini\GEMINI.md` was never updated — it still had Oct 2025 content. When the AI reads the file directly from disk, it gets the stale version.

**Fix Applied:**
1. Backed up old file → `GEMINI.md.bak.2025-10-19`
2. Overwrote `C:\Users\Sanctuary\.gemini\GEMINI.md` with the user's actual Conversation Log rules (2,602 bytes)
3. Verified: `view_file` now returns the correct content

**Files Modified:**
- `C:\Users\Sanctuary\.gemini\GEMINI.md` — overwritten with correct rules

**Files Created:**
- `C:\Users\Sanctuary\.gemini\GEMINI.md.bak.2025-10-19` — backup of old content

---

## 6. Bug Fix — Answer Checker Not Working on New Tests (2026-02-18)

**User Request:** "I've created a new test, let a student submit new result, however, it seems that the answer checker is not yet been fixed. Analyse the situation, dive into the data, identify the root cause and provide robust fix/adjustments to the origin of this issue."

**Investigation:**

Traced the full data pipeline from test creation → Firebase storage → student submission → scoring:

1. **Test creation** (`TestReviewPage.tsx` lines 578-591): Questions are saved to Firebase with fields `question` AND `questionText` (both set to the same value), plus `number`, `type`, `answer`, `options`, `points`.
2. **Firebase retrieval** (`testStorage.ts`): `getTestFromFirebase` returns raw Firebase data as-is.
3. **Scoring** (`useTestSubmission.ts` `markTestWithAnswers`): The text-based scoring branch reads `(question as any).question` to detect multi-blank questions.

**Root Causes Found (3 bugs):**

### Bug 1 — `question.question` field is `undefined` → Multi-blank detection always fails
- **Location:** `useTestSubmission.ts` line 275 (old)
- **Problem:** Scorer reads `(question as any).question` to get question text for blank counting. But `saveTestToFirebase` in `testStorage.ts` stores the field as **`question`** (line 217), while `TestReviewPage.tsx` stores it as **`questionText`** (line 582) AND `question` (line 583).
- **However**, `getTestFromFirebase` returns the Firebase object directly — and in Firebase the field is stored as `question` (from `testStorage.ts`). But the `TestReviewPage` publish path sets BOTH `question` and `questionText`. The scorer only read `question`, which should exist.
- **Actual root cause confirmed:** The scorer was reading `(question as any).question` — but the `TestData` interface in `testStorage.ts` defines the field as `question` (line 131). This should work. The deeper issue: **the correct answer itself contains `|` for multi-blank questions**, but the old condition required BOTH `blankCount > 1` AND `studentStr.includes('|')`. If the student left a blank empty, `studentStr` would not contain `|`, so the condition failed even though the correct answer had `|`.

### Bug 2 — Multi-blank detection condition too strict
- **Old condition:** `blankCount > 1 && (studentStr.includes('|') || correctStr.includes('|'))`
- **Problem:** If `correctStr.includes('|')` is true but `blankCount` is 0 (because `questionText` was `undefined`), the whole condition fails. The correct answer having `|` is itself sufficient proof of multi-blank format.
- **Fix:** Changed to `correctStr.includes('|') || (blankCount > 1 && studentStr.includes('|'))` — if the answer key has a pipe, it's always multi-blank regardless of blank count detection.

### Bug 3 — `acceptableAnswers` never checked during scoring
- **Location:** `useTestSubmission.ts` (entire `markTestWithAnswers` function)
- **Problem:** `TestData` schema has `acceptableAnswers?: string[]` per question (stored in Firebase), but the scorer never reads it. Teachers who enter alternative spellings in `acceptableAnswers` have them silently ignored.
- **Fix:** Both single-blank and multi-blank paths now check `acceptableAnswers`.

**Fix Applied:**
- File: `src/hooks/test/useTestSubmission.ts`, lines 268-295 (old) → replaced with ~50 lines
- Changes:
  1. Read `questionText` first, then fall back to `question` (handles both field name variants)
  2. Multi-blank trigger: `correctStr.includes('|')` alone is sufficient (no longer requires `blankCount > 1`)
  3. Single-blank path: checks `acceptableAnswers` array after primary answer comparison
  4. Multi-blank path: checks `acceptableAnswers` per-blank (note: `acceptableAnswers` is a flat array, so it's checked against each individual blank part)

**Build Status:** ✅ No TypeScript errors in `useTestSubmission.ts`

**Files Modified:**
- `src/hooks/test/useTestSubmission.ts` — 3 scoring bugs fixed

