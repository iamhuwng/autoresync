# Conversation Log - 2026-02-10

## 1. Fix Table Completion Display (23:26)

### User Request
The table completion question type was not displaying correctly according to the IELTS Reading Question Type Display Design guide (`documentation/samples/IELTS-reading-question-type-display-design.md`).

### Problem
- **Before**: Table completion questions rendered as a **flat card list** (like sentence completion) with numbered questions and input fields below each line
- **Expected (per design guide)**: Should render as a **proper HTML table** with named columns, headers, and input fields inline within cells

### Root Cause
1. The `IELTSQuestionsPanel.tsx` table-completion handler had two paths:
   - **Format A/B (pipe-delimited)**: Rendered correctly as an HTML table
   - **Format C/D (no pipes)**: Fell through to a card layout — **THIS was the active path**
2. The AI-generated question data used the "Name: Description" pattern (e.g., `Rani Ki Vav: Excellent condition, despite the (9) ......... of 2001.`) without pipe separators
3. Additionally, blanks were represented as dots (`..........`) instead of underscores (`___`), so the inline input detection failed

### Changes Made
**File: `src/components/test/IELTSQuestionsPanel.tsx`**

#### Change 1: Table rendering for Format C/D (lines ~958-1164)
- Replaced the flat card layout with a proper HTML `<table>` rendering
- Added pattern detection for "Name: Description" colon format
- When detected: renders as a 3-column table (`#`, `NAME`, `FEATURE / DETAIL`)
- When not detected: renders as a 2-column table (`#`, `DESCRIPTION`)
- Reused the same styling as the pipe-delimited Format A/B table

#### Change 2: Text normalization for table cells (lines ~1045-1057)
- Convert dot-based blanks (`.........`) → underscore blanks (`___`) so inline inputs render
- Strip redundant inline question number refs like `(9)` (already in # column)
- Strip instruction text like `(ONE WORD AND/OR A NUMBER)` (already in header)
- Collapse extra whitespace

#### Minor: Fixed TypeScript lint error
- Added `match[1] && match[2]` null checks for regex capture groups
- Removed unused `uniqueNames` variable

### Result
Table completion now renders as a proper table matching the design guide specification.

## 2. AI Prompt Update for Table Structure Preservation (00:03 - 00:11)

### User Request
Update the AI prompts (Gemini and Groq providers) to instruct the AI to properly preserve table structure when extracting "table-completion" questions, rather than flattening data into "Name: Description" format.

### Problem
- AI prompts for `table-completion` were too vague — only "Fill in table cells" / "Table format with blanks"
- No instruction to preserve column structure, headers, or use pipe delimiters
- AI was flattening all table data into single-line "Name: Description" strings
- This caused the display code to miss the Format A/B (pipe-delimited) rendering path

### Root Cause Analysis
The Gemini prompt (line 730) and Groq prompt (line 436) both lacked:
1. Instructions to use pipe (`|`) delimiters in `questionText` to preserve column structure
2. Instructions to include a header row (no blanks) as the first entry
3. Instructions to use underscores (`___`) for blanks, not dots
4. Instructions to strip redundant inline question numbers and word limit instructions
5. Concrete examples showing the expected pipe-delimited output format

### Changes Made

#### File: `src/services/ai/gemini.provider.ts`
1. **Updated `buildQuestionsAndAnswersPrompt`** (lines 730-747): Added 14 lines of detailed instructions for `table-completion`, including:
   - Pipe-delimited format requirement
   - Header row as `questionNumber: 0`
   - Example input/output showing the transformation
   - Rules for stripping redundant data
2. **Updated `buildCombinedPrompt`** (line 368): Added pipe note in completion types list
3. **Added output example** (lines 911-932): Two concrete `table-completion` entries in the output format section — one header row (questionNumber: 0) and one data row (questionNumber: 9)

#### File: `src/services/ai/groq.provider.ts`
1. **Updated `buildQuestionsPrompt`** (line 436): Expanded table-completion row with pipe instruction and example
2. **Updated `buildQuestionsAndAnswersPrompt`** (line 663): Same pipe-delimited instruction
3. **Updated `buildCombinedPrompt`** (line 517): Added table-completion pipe note

#### File: `src/services/ai/response.validator.ts`
- **Changed `questionNumber` min** (line 41): From `min(1)` to `min(0)` to allow table-completion header rows where `questionNumber: 0` holds the column headers

### How It Works (End-to-End Flow)
1. **AI outputs** pipe-delimited `questionText` for table-completion:
   - Header: `{"questionNumber": 0, "questionText": "Name | Location | Feature", ...}`
   - Data: `{"questionNumber": 9, "questionText": "Rani Ki Vav | Excellent condition, despite the ______ | of 2001", ...}`
2. **Validator** allows `questionNumber: 0` through
3. **Display code** (IELTSQuestionsPanel.tsx) detects pipes → enters Format A/B path
4. **Format A/B** detects first row has no blanks → uses it as table headers
5. **Renders** proper HTML table with original column structure

### Build Verification
Build successful ✅ (zero errors)

## 3. HOTFIX: Remove questionNumber: 0 Header Row (00:25)

### Problem (User-Reported)
The live app showed a **Question 0** appearing between questions 8 and 9 in the review panel. This fake "question" had no answer key and triggered a "missing answer" warning in the review sidebar. The `questionNumber: 0` approach was fundamentally flawed because:
1. It creates a fake question visible in ALL views (review panel, test view, completeness checks)
2. It has no answer, triggering missing answer warnings
3. It inflates question counts
4. It pollutes the question list with metadata

### Root Cause
The `questionNumber: 0` approach (from Section 2) treated table headers as a pseudo-question. This was wrong — headers are **metadata**, not a question.

### Fix Applied
1. **Reverted `response.validator.ts`**: `questionNumber` back to `min(1)` — reject `questionNumber: 0`
2. **Updated all AI prompts** (Gemini + Groq): Replaced `questionNumber: 0` header row with `TABLE_HEADERS:` prefix in `sectionInstruction` field
3. **Removed the questionNumber: 0 output example** from Gemini's example output section
4. **Display code**: No changes needed — the existing Format A/B header detection (lines 765-776) already checks if the first data row has no blanks and uses it as headers

### New Approach
- Table headers are carried in `sectionInstruction`: `"TABLE_HEADERS: Name | Location | Feature. Complete the table below."`  
- NO fake question rows — only real questions with `questionNumber >= 1`
- The display code's existing header inference logic handles the rest

### Build Verification
Build successful ✅ (zero errors)

## 4. HOTFIX: Groq Markdown Table Corruption (00:39)

### Problem (User-Reported)
After the Section 3 fix, table-completion questions were being misclassified as **sentence-completion** in the review step. The AI was not recognizing `table-completion` as a valid type.

### Root Cause
The Groq prompts use **markdown tables** to list question types:
```
| Type | Source | Indicator |
| "table-completion" | From passage | Use pipe (|) for columns! Example: "A | B | C" |
```

The **pipe characters (`|`) in the example text** created extra table columns, corrupting the markdown table structure. The AI couldn't parse the type list correctly, so `table-completion` was invisible to the model — it defaulted to `sentence-completion`.

### Fix Applied
**File: `src/services/ai/groq.provider.ts`** (2 locations)

1. **Moved pipe examples OUT of the markdown table** — kept the table cell brief:
   ```
   | "table-completion" | From passage | Table format with blanks — see TABLE FORMAT RULES below |
   ```

2. **Added separate `TABLE FORMAT RULES` section** after the table with detailed instructions using the word "PIPE" instead of the actual character:
   ```
   **⚠️ TABLE FORMAT RULES (for "table-completion" ONLY):**
   - questionText MUST use PIPE character to separate columns...
   - Example: "Gingko Biloba PIPE ______ PIPE Improves cognitive function"
   ```

### Build Verification
Build successful ✅ (zero errors)

## 5. PERSISTENT ISSUE: Question 0 Still Appearing (00:47)

### Problem (User-Reported)
After all fixes, Question 0 is **still appearing** in the live app between questions 8 and 9.

### Root Cause
The fixes in Sections 3 and 4 only affect **NEW AI extractions**. The test data currently displayed in the app was created **before the fixes** and still contains the `questionNumber: 0` header row in the database.

The validator change (`min(1)`) prevents new extractions from having `questionNumber: 0`, but it doesn't retroactively fix already-stored data.

### Solution Required
**Option 1 (Recommended)**: Re-parse the test document
- Delete the current draft/test
- Upload and parse again with the fixed AI prompts
- This creates clean data without Question 0

**Option 2**: Database migration script
- Query all tests with `questionNumber: 0` entries
- Remove those entries from the questions array
- Update question numbering if needed
- More complex, risk of data corruption

**Status**: User confirmed this was a **NEW test** created after all previous fixes — the AI was still outputting `questionNumber: 0` despite the instructions.

## 6. CRITICAL FIX: Strengthen questionNumber: 0 Prohibition (00:52)

### Problem (User-Reported)
Even in a **brand new test** created after all previous fixes, Question 0 was still appearing with the header row "Stepwell | Date | Features | Other notes". The AI was ignoring the previous instruction "Do NOT create a separate header row question".

### Root Cause
The instruction at line 738 ("headers go ONLY in sectionInstruction") was **too weak**. The AI was still creating header rows as questions because:
1. The source document has a visible header row in the table
2. The AI interprets this as "a row that should be extracted"
3. The single-line prohibition wasn't emphatic enough to override this pattern

### Fix Applied
**Files: `gemini.provider.ts` and `groq.provider.ts`**

Added **multiple emphatic prohibitions** with concrete anti-patterns:

```typescript
- 🚫 **ABSOLUTELY FORBIDDEN: Do NOT create ANY question with questionNumber: 0**
- 🚫 **ABSOLUTELY FORBIDDEN: Do NOT create a separate header-only row as a question**
- 🚫 **WRONG EXAMPLE (DO NOT DO THIS):** {"questionNumber": 0, "questionText": "Stepwell | Date | Features", ...}
- Headers are METADATA, not questions. They go in sectionInstruction ONLY.
```

Also added to the combined prompt:
```typescript
- "table-completion" - ... 🚫 NEVER use questionNumber: 0.
```

### Why This Should Work
1. **Multiple repetitions** of the prohibition (3 separate statements)
2. **Concrete anti-pattern** showing exactly what NOT to do (using the actual header from the user's screenshot)
3. **Emoji markers** (🚫) make the prohibition visually distinct
4. **Conceptual framing** ("Headers are METADATA, not questions") helps the AI understand WHY

### Build Verification
Build successful ✅ (zero errors)

### Next Steps
User needs to **re-parse the test** with the strengthened prompts to verify the fix works.
