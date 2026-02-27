# Conversation Log - 2026-02-11

## 1. Fix Table Headers Not Displaying (23:14 - 23:35)

### User Request
Table completion questions still show generic headers ("Column 1", "Column 2", "Column 3", "Column 4") instead of the actual table headers from the IELTS source document (e.g., "Stepwell | Date | Features | Other notes").

### Root Cause Analysis (Deep Trace)

The user guided the investigation toward the AI→Extractor→Pipeline chain, correctly pointing out that previous attempts (questionNumber: 0, sectionInstruction threading) kept failing because they didn't address the fundamental data flow problem.

**Full pipeline trace revealed:**

| Step | Component | `sectionInstruction` (TABLE_HEADERS) | `options` |
|------|-----------|--------------------------------------|-----------|
| 1 | AI Output | ✅ `sectionInstruction: "TABLE_HEADERS: Name \| Date \| ..."` | `null` (unused for table-completion) |
| 2 | `ai-extractor.service.ts` line 302 | ✅ Mapped to `instructions` | ✅ Mapped as-is |
| 3 | `test-creation/index.ts` line 331 | ❌ **DROPPED** — `AIQuestionResult` doesn't include it | ✅ Passed through |
| 4 | Validator → mergedQuestions | ❌ Gone | ✅ Survives |
| 5 | `TestCreationModal.tsx` line 467 | ❌ Gone | ✅ Mapped |
| 6 | `TestCreationModal.tsx` line 482 | ❌ `sectionInstructions` is **always `{}`** — never populated! | — |
| 7 | Draft → Firebase → Student View | ❌ Never stored | ✅ **Survives entire pipeline** |

**Critical finding:** `sectionInstructions` at line 482 was `const sectionInstructions: Record<string, string> = {}` — an empty object. The instructions data from the extractor was NEVER forwarded to this record.

### Previous Failed Approaches (from conversation_2026-02-10_log.md)
1. **questionNumber: 0** — Created fake Question 0 visible in UI, no answer key, broke completeness
2. **TABLE_HEADERS in sectionInstruction** — Data dropped in pipeline (never reached draft/published test)
3. **Markdown table corruption** — Pipe characters in Groq prompt table broke type detection
4. **Stronger prohibition** — ✅ Stopped questionNumber: 0, but headers still generic

### Solution: Map TABLE_HEADERS → `options` at the Extractor Level

**Key insight:** For `table-completion` questions, the `options` field is **completely unused** (they're fill-in-the-blank, not multiple-choice). But `options` naturally survives the **entire** data pipeline without any pipeline changes needed.

**Files changed (only 2):**

#### 1. `src/services/test-creation/ai-extractor.service.ts` (line 298-328)
- In the `extractQuestions` mapping, for `table-completion` questions:
  - Parse `TABLE_HEADERS:` prefix from `sectionInstruction`
  - Split by pipe to get individual header names
  - Set parsed headers as `options` array
- Example: `sectionInstruction: "TABLE_HEADERS: Name | Date | Features | Other notes"` → `options: ["Name", "Date", "Features", "Other notes"]`

#### 2. `src/components/test/IELTSQuestionsPanel.tsx` (line 749-782, 981-989)
- **Format A/B (pipe-delimited):** Added Priority 1 check — if first question has `options`, use them as column headers
- **Format C/D (no-pipe):** Also check `options` for header names, falling back to generic "Name" / "Feature / Detail"
- Header detection priority order: options → first-row-detection → generic fallback

### Why This Works (vs. Previous Attempts)
- **No fake questions** — no questionNumber: 0
- **No pipeline changes** — options already flows through everything
- **No AI prompt changes** — AI already outputs TABLE_HEADERS in sectionInstruction
- **No type confusion** — extractor doesn't change the type, only enriches options
- **Semantic fit** — for table-completion, "options" = "what the valid column names are"

### Build Verification
Build successful ✅ (exit code 0)

### Next Steps
- Re-parse a test document with the new extractor logic to verify headers appear correctly
- For already-published tests, re-parsing is required (this only affects NEW extractions)
