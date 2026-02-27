# PRD 0024: Multi-Group Summary Completion — Same-Type Group Identity

**Date:** 2026-02-22
**Status:** Draft
**Priority:** Medium
**Phase:** Phase 2 of [PRD 0023](./0023-prd-summary-completion-editor.md)
**Dependency:** PRD 0023 must be fully implemented before this PRD begins.

---

## 1. Introduction / Overview

### The Problem

IELTS Reading passages occasionally contain **two separate Summary Completion exercises** targeting different parts of the same passage. For example:

> **Questions 27–31 (Group A):** "Complete the summary. Choose NO MORE THAN TWO WORDS..."
> — five blanks about the opening argument of the passage.
>
> **Questions 32–36 (Group B):** "Complete the summary. Choose ONE WORD ONLY..."
> — five blanks about the conclusion of the passage.

Both groups are the same question type (`summary-completion-list`), so the current system cannot tell them apart. **Every component that groups questions by type treats them as one big group:**

- **AI Parser** outputs one flat run of 10 questions without group boundaries.
- **Student View** (`IELTSQuestionsPanel.tsx`) reads all 10 questions together, producing one malformed paragraph.
- **Edit Modal** (`TestEditor.tsx`) passes all 10 questions as `groupQuestions`, so `SummaryMasterBlock` tries to merge two unrelated paragraphs.

### The Goal

Introduce a **`summaryGroupId` field** on each question so that every layer — AI parsing, data storage, the Edit Modal, and the Student View — can correctly identify which exercise a question belongs to, even when multiple exercises of the same type exist in the same passage.

---

## 2. Goals

1. **AI detection** — The AI parser must recognize separate summary completion exercise blocks from their instruction headers and assign each a unique `summaryGroupId` string.
2. **Data integrity** — Each question in Firebase must carry a `summaryGroupId` field so the group identity persists beyond a single session.
3. **Edit Modal correctness** — When a teacher edits a question from Group A, only Group A's paragraph and word bank are shown. Group B is not shown or mixed in.
4. **Student View correctness** — Each group renders as a fully independent exercise block (separate instruction header, separate paragraph, separate word bank) in the correct reading order.
5. **Backward compatibility** — Questions without `summaryGroupId` (created before this PRD) must continue to work using the existing consecutive-type grouping. No data migration is required.

---

## 3. User Stories

- **As a teacher**, when I parse an IELTS test that has two Summary Completion exercises, I want each exercise to be saved as a separate, independent block so that students see two distinct exercises and not one broken paragraph.
- **As a teacher**, when I open the Edit Test Modal and select a question from the first Summary Completion group, I want to see only that group's paragraph and word bank — not the second group's content mixed in.
- **As a student**, I want to see two clearly separated Summary Completion exercises on the test page, each with its own instruction and word bank.
- **As a developer**, I want `summaryGroupId` to be a simple, stable string (not dependent on question index) so that it survives question reordering and remains correct when saved to Firebase.

---

## 4. Functional Requirements

### 4.1 Data Model — New Field

1. Each question of type `summary-completion-list` or `summary-completion-text` **may** carry a `summaryGroupId` field of type `string`.
   - Format: arbitrary but stable. Recommended: `"sc-1"`, `"sc-2"` (assigned sequentially per passage by the AI parser).
   - The field is **optional** — absence means the question belongs to the only summary group in its passage (backward-compatible default).
2. When `summaryGroupId` is absent on a question, all code must treat the question as if it has a unique fallback id of `"sc-default"`. The grouping result must be identical to the current consecutive-type grouping.

### 4.2 AI Parser — Instruction Header Detection

3. The AI parsing prompt (in `gemini.provider.ts` / `groq.provider.ts` or equivalent) must be updated to:
   - Detect when a new Summary Completion instruction block starts (identified by a new bold or line-separated instruction paragraph containing phrases such as: *"Complete the summary"*, *"Choose ... words ... passage"*, *"Choose ... letter"*).
   - Assign a new `summaryGroupId` value each time a new instruction block is detected within the same passage.
   - Output `summaryGroupId` as part of each question's JSON object.
4. The AI must assign the **same** `summaryGroupId` to all questions that share an instruction header, even if they are split across multiple sub-paragraphs.
5. The AI must assign a **different** `summaryGroupId` to questions from a different instruction header, even if both groups are the same question type.
6. For all other question types (non-summary), `summaryGroupId` must be omitted entirely from the output.

### 4.3 `summaryGroupUtils.ts` — Updated Group Detection

7. The existing `getGroupQuestions` function in `src/utils/summaryGroupUtils.ts` must be updated:
   - **If** the target question has a non-empty `summaryGroupId`, group by matching `summaryGroupId` AND `passageId` (both must match).
   - **If** the target question has no `summaryGroupId` (or it is `undefined`/`""`), group by the existing consecutive-type + `passageId` rule (unchanged — backward compat).
8. The updated function must never cross `passageId` boundaries regardless of `summaryGroupId`.

### 4.4 Edit Modal — Multiple Group Blocks

9. `TestEditor.tsx` must pass `groupQuestions` containing only the questions whose `summaryGroupId` matches the selected question. It must NOT include questions from a different `summaryGroupId` within the same passage.
10. When the teacher navigates between questions of **different** summary groups (pressing Previous / Next), the `SummaryMasterBlock` must visually update to show the new group's paragraph. There must be no leftover content from the previous group.
11. The `SummaryMasterBlock` header must display the `summaryGroupId` label so the teacher can tell which group they are editing, e.g.: **"SUMMARY PARAGRAPH — Group sc-1 (Q27–Q31)"**.

### 4.5 Student View — Independent Exercise Blocks

12. `IELTSQuestionsPanel.tsx`'s `groupQuestionsByTaskType` function must be updated to sub-group by `summaryGroupId` when it is present. Each sub-group must render as a fully independent block with its own:
    - Instruction header.
    - Flowing paragraph with inline dropdowns (or text inputs).
    - Word bank reference panel (for `summary-completion-list`).
13. The two blocks must be rendered in question-number order, so Group A (Q27–Q31) always appears above Group B (Q32–Q36).
14. If `summaryGroupId` is absent on all questions in a group, the existing rendering logic is used unchanged.

### 4.6 Validation

15. `validateQuestions` in `TestEditor.tsx` must not produce false "Question text is empty" warnings for group members of any `summaryGroupId` group (the existing guard from PRD 0023 already handles this, but must apply to the new grouping scheme too).

---

## 5. Non-Goals (Out of Scope)

- Automatically merging two separate groups that were incorrectly split by the AI — this is a manual teacher action.
- Allowing the teacher to manually assign or change a `summaryGroupId` via the Edit Modal UI — group identity is determined at parse time only.
- Supporting `summaryGroupId` on question types other than `summary-completion-list` and `summary-completion-text`.
- Migrating existing tests in Firebase to add `summaryGroupId` — backward compatibility handles this.
- A UI that lets the teacher see all groups in a passage at once (a "passage overview" panel) — future scope.

---

## 6. Design Considerations

### 6.1 `summaryGroupId` Format

Use the pattern `"sc-N"` where N is a 1-based integer counting from the first summary group found in the passage. This is simple, human-readable, and stable.

```
Passage 1 — Group sc-1:  Q27, Q28, Q29, Q30, Q31
Passage 1 — Group sc-2:  Q32, Q33, Q34, Q35, Q36
Passage 2 — Group sc-1:  Q1,  Q2,  Q3         (different passage, counter resets)
```

The counter resets per passage. Multiple passages in the same test each have their own independent counter.

### 6.2 Updated `getGroupQuestions` Logic (Pseudocode)

```typescript
export function getGroupQuestions(allQuestions, selectedIndex) {
  const target = allQuestions[selectedIndex];
  const groupId = target.summaryGroupId;

  if (groupId) {
    // New path: group by summaryGroupId + passageId
    return allQuestions.filter(
      q => q.summaryGroupId === groupId && q.passageId === target.passageId
    );
  }

  // Legacy path: unchanged consecutive-type grouping
  // ... existing logic ...
}
```

### 6.3 Student View Group Rendering (Pseudocode)

```typescript
// Inside groupQuestionsByTaskType:
// After the existing grouping by consecutive type,
// if the group type is summary-completion-* AND any question has summaryGroupId,
// split the group into sub-groups by summaryGroupId.
const subGroups = splitByGroupId(group.questions);
// Render each subGroup as an independent block.
```

### 6.4 AI Prompt Addition

The AI prompt schema for each question must add an optional field:

```json
{
  "number": 27,
  "type": "summary-completion-list",
  "summaryGroupId": "sc-1",
  "question": "...",
  "answer": "...",
  "options": ["A. ...", "B. ..."]
}
```

The prompt instruction should include:

> "For `summary-completion-list` and `summary-completion-text` questions, assign a `summaryGroupId` string (e.g., `"sc-1"`, `"sc-2"`) to each question. All questions that are part of the same exercise block (share the same instruction header) must get the same `summaryGroupId`. A new block starts when a new instruction paragraph appears (e.g., 'Complete the following summary...'). The counter resets per passage. Never include `summaryGroupId` for other question types."

---

## 7. Technical Considerations

### 7.1 Files to Touch

| File | Change Type | Notes |
|------|-------------|-------|
| AI prompt files (e.g., `gemini.provider.ts`, `groq.provider.ts`) | Modify | Add `summaryGroupId` detection and output instructions. Locate the exact prompt template strings before modifying. |
| `src/utils/summaryGroupUtils.ts` | Modify | Update `getGroupQuestions` to use `summaryGroupId` when present. |
| `src/utils/summaryGroupUtils.test.ts` | Modify | Add new unit tests for the updated `getGroupQuestions` with `summaryGroupId`. |
| `src/components/test/IELTSQuestionsPanel.tsx` | Modify | Update `groupQuestionsByTaskType` to sub-group by `summaryGroupId`. |
| `src/components/SummaryMasterBlock.jsx` | Modify | Update header to display `summaryGroupId`. |
| `src/components/TestEditor.tsx` | No change needed | Already uses `getGroupQuestions` — the util update handles this automatically. |

### 7.2 Before Modifying AI Prompt Files

> **Do NOT guess at the prompt file location or structure.** Before modifying any AI prompt:
> 1. Search for the string `"summary-completion"` across the entire `src/` directory using grep.
> 2. Read the files found to understand the current prompt template and schema format.
> 3. Only then add the `summaryGroupId` field and parsing instruction in the exact location and format used by the rest of the schema.

### 7.3 Backward Compatibility Contract

The following behavior must be preserved for tests that have no `summaryGroupId`:

- `getGroupQuestions` falls back to consecutive-type grouping.
- `IELTSQuestionsPanel.tsx` renders the group as a single block (existing behavior).
- No `summaryGroupId` label appears in the Edit Modal header for these tests.

### 7.4 Test for Correct AI Output

After modifying the AI prompt, verify by parsing a real IELTS test PDF that has two Summary Completion groups. The parsed output JSON must show two separate `summaryGroupId` values (`"sc-1"` and `"sc-2"`) on the correct questions before you proceed to any UI changes.

---

## 8. Success Metrics

1. **AI accuracy:** Parsing an IELTS test with two Summary Completion groups produces correct, distinct `summaryGroupId` values on 100% of questions.
2. **Edit Modal isolation:** Selecting a question from Group A in the Edit Modal shows only Group A's paragraph and word bank. Group B content is never shown.
3. **Student View separation:** Two Summary Completion groups in one passage render as two visually independent exercises on the test page.
4. **No regressions:** Tests with a single Summary Completion group (or no `summaryGroupId`) continue to display and score identically to before.
5. **No data migration needed:** Opening an old test (without `summaryGroupId`) in the Edit Modal and Student View functions correctly.

---

## 9. Open Questions

**Q1 (AI confidence):** What happens when the AI cannot determine whether two question runs are separate groups or one group? Should it:
- **(A)** Default to treating them as **one group** (safer — avoids incorrect splits)
- **(B)** Default to treating them as **separate groups** (surfaces issues visually)

**Q2 (Manual override):** If the AI incorrectly merges two groups (assigns both the same `summaryGroupId`), can the teacher correct it via the Edit Modal, or is re-parsing the only fix?

**Q3 (Word bank per group):** For `summary-completion-list`, each group has its own independent word bank (`options[]`). The AI must output separate `options` arrays for each group. Should the word bank be stored on the **group leader question** of each sub-group, or should it be stored on a separate per-group field? (Current design: stored on Q1 of each group's leader — same as PRD 0023. Confirm this is acceptable for two groups in one passage.)
