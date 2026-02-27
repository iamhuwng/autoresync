# PRD: Fix Summary Completion Bugs

**Date:** 2026-02-13  
**Status:** Draft — Awaiting Assessment  
**Priority:** Medium → Bug 1 **debunked**, Bug 2 confirmed

---

## 1. Problem Statement

Two bugs reported related to Summary Completion questions:

1. **Bug 1 — "Results not recorded":** When a student completes a test with "Summary Completion" questions, their results are not correctly scored.
2. **Bug 2 — Edit modal shows no question text:** The test edit modal displays no question text for "Summary Completion" questions.

---

## 2. Root Cause Analysis

### Bug 1: Summary Completion Scoring — ✅ WORKING CORRECTLY (No Bug)

#### Firebase Data Investigation (2026-02-13)

Inspected actual Firebase data for test `test-1770888798048-vgb9fpe` (Cam 10) which contains `summary-completion-list` questions (Q27-Q31).

**Published test data (`/tests/{testId}/questions`):**

| Q# | Type | Answer (stored) | Has answer? |
|----|------|-----------------|-------------|
| 27 | summary-completion-list | `"B"` | ✅ Yes |
| 28 | summary-completion-list | `"H"` | ✅ Yes |
| 29 | summary-completion-list | `"L"` | ✅ Yes |
| 30 | summary-completion-list | `"G"` | ✅ Yes |
| 31 | summary-completion-list | `"D"` | ✅ Yes |

**Answers are correctly stored** in the published test because the teacher entered them via the AnswerKeyModal.

**Student submission result (`/test_results/-OlH_SOmO-5XvpOhAc_I`):**

| Q# | Student Answer | Correct Answer | Scored | Verdict |
|----|---------------|----------------|--------|---------|
| 27 | `"B"` | `"B"` | ✅ `isCorrect: true` | Correct scoring |
| 28 | `"G"` | `"H"` | ❌ `isCorrect: false` | Correct scoring (student picked wrong letter) |
| 29 | `"K"` | `"L"` | ❌ `isCorrect: false` | Correct scoring (student picked wrong letter) |
| 30 | `"I"` | `"G"` | ❌ `isCorrect: false` | Correct scoring (student picked wrong letter) |
| 31 | `"D"` | `"D"` | ✅ `isCorrect: true` | Correct scoring |

**Conclusion:** The scoring is working perfectly. The student simply selected incorrect letters. Q27 ("B") and Q31 ("D") were answered correctly and scored as `isCorrect: true`. Q28-Q30 had wrong student answers and were correctly scored as `isCorrect: false`.

**The total submission had 2/40 correct — the student barely answered most questions** (studentAnswer: `""` for Q1-Q26 and Q32-Q40). This was likely a test run or the teacher ended the session early.

**Bug 1 Status: NOT A BUG. No code changes needed.**

---

### Preventive Improvement: AI Answer Key Auto-Merging

While Bug 1 is debunked for the user's workflow (manual AnswerKeyModal), there IS still a systemic gap:

**The AI extraction returns answers in a separate `answerKey` object, but the code never merges them into the questions.** This means:
- The "Missing Answers" warnings in the review page are always triggered for ALL questions after AI parsing
- Teachers must always manually enter answers via AnswerKeyModal even though the AI already extracted them

**Recommendation:** Fix `ai-extractor.service.ts` to merge `answerKey` into `suggestedAnswer`. This is a **quality-of-life improvement**, not a bug fix. It would:
- Pre-populate answers in the review page
- Reduce teacher workload
- Fewer "missing answer" warnings

**This should be tracked as a separate enhancement, not part of this PRD.**

---

### Bug 2: Edit Modal Shows No Question Text — ✅ CONFIRMED

#### Root Cause

Firebase data confirms the structure:

```
Q27: question: "People go to art museums because...____...the ______."  ← FULL paragraph with blanks
Q28: question: ""  ← EMPTY
Q29: question: ""  ← EMPTY  
Q30: question: ""  ← EMPTY
Q31: question: ""  ← EMPTY
```

For `summary-completion-list`, Q1 of the group carries the full summary paragraph with all blanks. Q2+ have `question: ""` by design — they share Q1's paragraph.

In `TestEditor.tsx`, `initializeFreshState()` at line 126:
```typescript
question: q.question || '',  // Empty for Q28-Q31
```

The edit modal doesn't understand the shared-paragraph structure. Q28-Q31 show blank in the editor.

#### User's Direction

> "Should we change the modal of edit test to accommodate the task type instead? I feel like each task type should have their own feature accommodations in edit test modal."

**Agreed.** The fix should be in the **edit test modal**, NOT in the display/rendering code.

---

## 3. Implementation Plan

### Phase 1: Type-Specific Edit Modal for Summary Completion (Bug 2)

| Step | File | Change | Risk |
|------|------|--------|------|
| 1.1 | `TestEditor.tsx` | In `initializeFreshState()`, detect `summary-completion-list` questions and propagate the shared paragraph and options from Q1 to Q2+ as context metadata | Low |
| 1.2 | `QuestionEditorPanel.jsx` | Add type-specific rendering for `summary-completion-list`: show the shared paragraph context as read-only reference, the blank position, and per-question answer editing | Medium |
| 1.3 | (Optional) Question list sidebar | Show a visual indicator that these questions form a summary group | Low |

**Edit modal design for `summary-completion-list`:**

- **Q1 (group leader):** 
  - Editable paragraph text field (the full summary with `______` blanks)
  - Editable options/word bank list (A-L)
  - Answer field for blank #1
  
- **Q2+ (group members):**
  - Read-only label: *"Summary Group (Q27-Q31)"*
  - Read-only display of shared paragraph (scrollable, compact)
  - Highlight which blank this question corresponds to
  - Editable answer field for this specific blank

### Phase 2: Verification

| Step | Action |
|------|--------|
| 2.1 | `npm run build` — type checking |
| 2.2 | `npm test -- --run` — existing tests |
| 2.3 | Manual smoke test: open edit modal for a test with summary-completion-list, verify paragraph and answers display correctly |

---

## 4. Files Changed (Summary)

| File | Phase | Type |
|------|-------|------|
| `components/TestEditor.tsx` | 1 | Enhancement (type context propagation) |
| `components/QuestionEditorPanel.jsx` | 1 | Enhancement (type-specific rendering) |

---

## 5. What This Does NOT Change

- **Student-facing display** (IELTSQuestionsPanel.tsx) — no changes to the rendering of summary-completion-list during tests
- **Scoring logic** (autoMarking.service.ts, useTestSubmission.ts) — confirmed working correctly via Firebase data inspection
- **AI prompts** — the prompt correctly separates answers into answerKey
- **Answer key flow** — AnswerKeyModal → publish pipeline is working correctly

---

## 6. Open Questions

1. **For Bug 2:** How detailed should the type-specific editor be?
   - **Option A (Minimal):** Read-only shared paragraph + answer field per question
   - **Option B (Full):** Editable paragraph with inline blank markers + options list editor + answer assignment per blank
   
   **Recommendation:** Option A for now, expand later.

2. **Should we pursue the AI answer key auto-merging as a separate task?** This would pre-populate answers from AI extraction, reducing manual entry work.
