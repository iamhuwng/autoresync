---
title: PRD Summary Completion Editor
createdAt: '2026-02-27T15:28:12.404Z'
updatedAt: '2026-02-27T15:28:13.813Z'
description: Product requirements for summary completion question editor
tags:
  - prd
  - summary-completion
  - editor
---
# PRD 0023: Type-Specific Editor for Summary Completion in Edit Test Modal

**Date:** 2026-02-22
**Status:** ✅ FINALIZED — Ready for Implementation Planning
**Priority:** Medium
**Related PRDs:** [0012 – Refactor Edit Test Dialog](./0012-prd-refactor-edit-test-dialog.md), [PRD-summary-completion-bugs](./PRD-summary-completion-bugs.md)

## All Decisions Locked

| # | Topic | Decision |
|---|-------|----------|
| Q1 | Scope | Cover **both** `summary-completion-list` AND `summary-completion-text` as separate type-conditional editors |
| Q2 | Blank editing | Phase 1: **text segment editing only** — add/remove blanks deferred to Phase 2 |
| Q3 | Group detection | Dedicated **`summaryGroupUtils.ts`** utility (reusable across future types) |
| Q4 | Word bank updates | **Live** — immediately propagates to all sibling questions in local state |
| Q5 | Preview mode | **Deferred** — read-only context string per card is sufficient for Phase 1 |
| Q6 | Type separation | The two types are **already separate type strings** — no new type needed. PRD uses type-conditional UI sections |
| Q7 | Word bank deletion | Allow deletion + **auto-clear sibling answer** + toast notification |
| Q8 | Segment commit | **On blur** (click away commits) — as-you-type deferred |
| Q9 | Multi-group in one passage | AI separates by type string; same-type multi-group (rare) handled via `summaryGroupId` in **Phase 2** |
| Q10 | Group update architecture | **`onGroupUpdate(updatedQuestions[])` callback** in `TestEditor.tsx` — one atomic update |

---

---

## 1. Introduction / Overview

### The Problem

Currently, the `QuestionEditorPanel.jsx` renders a generic `<Textarea>` for the `question` field of every question type. For `summary-completion-list` questions, this is broken by design:

- **Q1 (group leader)** of the summary group stores the full paragraph with `______` blanks.
- **Q2–Q5 (group members)** have `question: ""` (empty) — they share Q1's paragraph by design, so the Student View reconstructs the paragraph from Q1 alone.
- When a teacher opens Q2–Q5 for editing, they see a **blank editor** with no context — making it impossible to understand what they are editing or which blank corresponds to this question.

### The Goal

Design and build a type-specific editing experience inside `QuestionEditorPanel.jsx` for `summary-completion-list` (and later `summary-completion-text`) that:

1. Shows the **complete summary paragraph** with all blanks in one visually coherent block.
2. Makes it clear **which blank belongs to which question number**.
3. Allows editing the paragraph text and word bank (options) in one place.
4. Reduces individual question cards to be ultra-minimal — only the answer key for that specific blank.
5. Is **backward compatible** with the existing Student View (`IELTSQuestionsPanel.tsx`) with zero changes to that component.

---

## 2. Goals

1. **Fix the blank editor bug** — Q2–Q5 of a summary group must show context, not an empty textarea.
2. **Single source of truth** — The summary paragraph text must only be editable in one place to prevent data sync bugs.
3. **Zero Student View regression** — The Student View (`IELTSQuestionsPanel.tsx`) reads the flat `question` string and must continue to work unchanged.
4. **Support multi-blank sentences** — One sentence can have 0, 1, or 2+ blanks. The editor must handle all cases.
5. **Backward compatibility** — Old tests (with flat `question` strings and `______` markers) must open in the editor without errors.

---

## 3. User Stories

- **As a teacher**, I want to open any question in a Summary Completion group and see the entire paragraph with all blanks clearly labeled (Q27, Q28...) so I can understand the full context.
- **As a teacher**, I want to edit the paragraph text and word bank in one place instead of trying to remember which question holds the master paragraph.
- **As a teacher**, I want to set the correct answer letter (A, B, C...) for each individual blank from a dropdown of available word bank options.
- **As a teacher**, I want adding a new blank option to the word bank to immediately make it selectable as a correct answer for any blank.
- **As a developer**, I want the new data to stay backward compatible so the Student View reads data exactly the same as today.

---

## 4. Functional Requirements

### 4.1 Group Detection

1. When `QuestionEditorPanel.jsx` receives a question whose `type` is `summary-completion-list` (or `summary-completion-text`), it must switch to **Summary Group Editor mode** instead of the generic textarea.
2. The component must receive (as new props) the **full list of group sibling questions** (`groupQuestions: Question[]`) so it has access to all blanks and their positions.
3. The group leader (the question with the full paragraph) must be detected by checking which question has non-empty `question` text AND the most `______` blanks.

### 4.2 Summary Paragraph Block (Master Editor)

4. The editor must render a **"Summary Paragraph" master block** at the top of the panel, visible from any question's edit card within the group.
5. The master block must display the paragraph as an array of **inline segments**: alternating text segments and blank-token badges (`[Q27]`, `[Q28]`...).
6. Text segments must be editable inline (clicking on a text segment makes it editable; clicking elsewhere or pressing Enter commits the change).
7. Blank-token badges must be non-editable directly. Each badge displays the question number it maps to.
8. An **[Insert Blank Here]** button must appear when the user places their cursor inside a text segment, allowing them to split the text and insert a new blank token at the cursor position. This creates a new question number in the sequence.
9. A **[Remove Blank]** button must appear on each blank-token badge (visible on hover or focus) allowing the teacher to delete a blank (and merge its surrounding text segments). Removing a blank removes the corresponding question from the database.

> ⚠️ **Open Question:** Requirement 4.9 (removing a blank removing a question) has significant implications for the question numbering of subsequent questions. This is a Phase 2 scope item. Phase 1 will support editing text segments only; adding/removing blanks is out of scope.

10. The master paragraph must detect the existing blank positions from the flat `question` string using `/_{3,}/g` regex on `groupLeader.question` (exactly how `IELTSQuestionsPanel.tsx` does today in lines 563–596).

### 4.3 Word Bank Block (Options Editor)

11. Below the master paragraph block, the editor must render a **"Word Bank" block** containing the shared `options` array (e.g., `["A. copy", "B. unique", ...]`) from the group leader question.
12. Each option must be individually editable via a text input.
13. Options can be added with an **[+ Add Option]** button and removed with a **[× Remove]** button per row.
14. Changes to the word bank must update `groupLeader.options` and propagate via `onUpdate`.

### 4.4 Individual Question Cards (Minimal Mode)

15. For each question in the group (Q27–Q31), the editor must **suppress the generic question text section** (the `<Textarea>` for `question` field).
16. Instead, each card must show:
    - A **read-only context string** extracted from the master paragraph, showing only the sentence(s) containing that question's blank (e.g., `"But they do not go to look at a [Q27] of the Mona Lisa."`). This is for quick reference only.
    - The standard **Correct Answer** section — replaced with a `<Select>` dropdown populated from the word bank options (not a free-text input).
    - The standard **Score Points** and **Explanation** fields (unchanged).
17. The answer dropdown must show the letter + option text (e.g., `"A. copy"`). It must NOT allow selecting an option already assigned to a sibling blank (grey it out with `(used)` suffix).

### 4.5 Serialization: Dual-Format Save

18. On `onUpdate`, the editor must serialize changes back into the **existing flat string format** for the `question` field, ensuring the Student View (`IELTSQuestionsPanel.tsx`) continues to work unchanged:
    - Group leader Q1: `question` = full flat string with `______` markers at blank positions.
    - Group members Q2–Q5: `question` = `""` (empty, as today).
19. Additionally, the editor must save a **`summaryAST`** field on the group leader question for future edits, containing the segments array: `[{ type: "text", value: "..." }, { type: "blank", questionNumber: 27 }, ...]`.
20. When opening an existing test for editing, if `summaryAST` exists, the editor must use it directly. If not, it must **parse the flat `question` string** by splitting on `/_{3,}/g` and reconstructing an approximate AST.

### 4.6 Validation Changes

21. The `validateFields()` function in `QuestionEditorPanel.jsx` must be updated to skip the "Question Text is empty" warning for group-member questions (Q2–Q5) when their `type` is `summary-completion-list` **or** `summary-completion-text`, since their empty `question` field is intentional.
22. An answer is required for each question in the group (existing validation behavior).

### 4.7 Type-Conditional UI Differences

23. When `question.type === 'summary-completion-list'`:
    - Show **Word Bank Block** (Section 4.3).
    - Show **letter dropdown** (`<Select>`) as the answer input in each question card.
24. When `question.type === 'summary-completion-text'`:
    - **Hide** the Word Bank Block entirely.
    - Show a **free-text `<TextInput>`** as the answer input in each question card, with placeholder: "Enter the correct word(s) from the passage".
    - Multi-blank questions store their answer as a pipe-delimited string (e.g., `"analysis|economic"`) matching the existing `InlineContextCompletionInput` format.

---

## 5. Non-Goals (Out of Scope — Phase 1)

- Adding or removing blank tokens from the paragraph (inserting new blanks, deleting existing ones) — Phase 2.
- A full `contentEditable` rich-text editor (such as Slate.js). Phase 1 uses a simpler segment-based approach with individual text inputs per segment.
- Changing how the Student View (`IELTSQuestionsPanel.tsx`) reads data.
- Migrating old tests in Firebase.
- Multiple acceptable answer variations for `summary-completion-text` blanks — Phase 2.

---

## 6. Design Considerations

### 6.1 Component Architecture

```
QuestionEditorPanel.jsx
  └── if (isSummaryCompletionGroup)
        ├── SummaryMasterBlock.jsx  (NEW — master paragraph editor + word bank)
        └── SummaryQuestionCard.jsx (NEW — context + answer dropdown per blank)
      else
        └── [existing generic editor]
```

### 6.2 New Props Required for QuestionEditorPanel

```jsx
// NEW prop to pass sibling questions for group context
groupQuestions?: Question[]
```

The parent (`TestEditor.tsx`) must detect a `summary-completion-list` question, find all sibling group members by consecutive question numbers + same type, and pass them via `groupQuestions`.

### 6.3 Inline Segment Editor (Phase 1)

Rather than a full `contentEditable` block, Phase 1 uses a flex-wrap row of alternating `<input>` fields and badge chips:

```
[ text: "People go to" ] [Q27] [ text: " the world of" ] [Q28] [ text: "." ]
```

Each `<input>` is an auto-resizing text input (uses `size={value.length || 1}`). The badges are styled `<span>` elements.

### 6.4 Data Model

```typescript
// Stored on the group leader question (Q27) in Firebase
interface SummaryCompletionLeader extends Question {
  question: string;          // EXISTING — flat string, backward compat for Student View
  options: string[];         // EXISTING — ["A. copy", "B. unique", ...]
  summaryAST?: SummarySegment[]; // NEW — for Edit Modal use only
}

type SummarySegment =
  | { type: 'text';  value: string }
  | { type: 'blank'; questionNumber: number };
```

### 6.5 Visual Scheme (from design discussion)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [▼] SUMMARY PARAGRAPH (Q27–Q31 Group)
  ──────────────────────────────────────────────────────
  [ People go to art museums ] [Q27] [ of the Mona Lisa. ]
  [ This is because the ]  [Q28]  [ feeling cannot be replicated. ]

  [▼] WORD BANK (shared by Q27-Q31)
  ──────────────────────────────────────────────────────
  [A] [ copy               ] [×]
  [B] [ unique             ] [×]
  [+ Add Option]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [▼] Q27 Detail
  Context (read-only): "go to look at a [Q27] of the Mona Lisa."
  Answer: [ A. copy ▼ ]          Score: [ 1 ]

  [▼] Q28 Detail
  Context (read-only): "because the [Q28] feeling of seeing..."
  Answer: [ B. unique ▼ ]        Score: [ 1 ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 7. Technical Considerations

### 7.1 Files to Touch

| File | Change Type | Notes |
|------|-------------|-------|
| `src/components/QuestionEditorPanel.jsx` | Modify | Add group detection, suppress generic textarea for summary types, add `groupQuestions` + `onGroupUpdate` props |
| `src/components/SummaryMasterBlock.jsx` | **New** | Master paragraph segment editor + word bank editor (hidden for `summary-completion-text`) |
| `src/components/SummaryQuestionCard.jsx` | **New** | Individual card with read-only context + type-appropriate answer input |
| `src/utils/summaryGroupUtils.ts` | **New** | Group detection, AST parse/serialize, deletion guard logic |
| `src/components/TestEditor.tsx` | Modify | Detect summary groups, pass `groupQuestions` + `onGroupUpdate` callback to `QuestionEditorPanel` |

### 7.2 TestEditor: Group Detection Pseudo-Logic

```typescript
// When rendering QuestionEditorPanel for question at index i:
const q = questions[i];
let groupQuestions: Question[] | undefined;

if (q.type === 'summary-completion-list') {
  // Walk consecutive questions of same type
  groupQuestions = questions.filter(
    (other) => other.type === q.type && other.passageId === q.passageId
  );
}
```

### 7.3 Backward Compatibility Guarantee

The Student View (`IELTSQuestionsPanel.tsx`) at lines 562–596 already handles:
- `blankCount >= group.questions.length` → reads Q1's flat `question` string directly.
- Fallback: concatenates each question's `question` fragment.

As long as the Edit Modal serializes back to `q1.question` as a flat string with `______`, the Student View requires zero changes.

### 7.4 Legacy Test Handling

For tests without `summaryAST`, the editor must parse `q1.question` on open:

```typescript
function parseToAST(flat: string, groupNumbers: number[]): SummarySegment[] {
  const textParts = flat.split(/_{3,}/);
  const segments: SummarySegment[] = [];
  textParts.forEach((text, i) => {
    if (text) segments.push({ type: 'text', value: text });
    if (i < groupNumbers.length) {
      segments.push({ type: 'blank', questionNumber: groupNumbers[i] });
    }
  });
  return segments;
}
```

---

## 8. Success Metrics

1. **Bug eliminated:** Opening Q28–Q31 in the Edit Test Modal shows contextual paragraph — not a blank textarea.
2. **No Student View regression:** Tests with `summary-completion-list` display and score identically before and after this change.
3. **No new validation warnings:** Group member questions (Q2–Q5) no longer trigger a "Question Text is empty" warning.
4. **Correct answer selectable:** Each individual question's answer can be set via a dropdown of its shared word bank options.

---

## 9. Resolved Conflicts

### ✅ Conflict 1 RESOLVED: `summary-completion-text` Has No Word Bank
**Resolution (Q6):** The two types are already separate type strings. The Word Bank Block and dropdown answer input are rendered only when `question.type === 'summary-completion-list'`. For `summary-completion-text`, the Word Bank Block is hidden and the individual question card shows a free-text answer input for the single correct answer from the passage.

### ✅ Conflict 2 RESOLVED: Live Word Bank Propagation Architecture
**Resolution (Q10-A):** `TestEditor.tsx` will expose an `onGroupUpdate(updatedQuestions: Question[])` callback. `SummaryMasterBlock` calls this as one atomic update when word bank changes, avoiding multiple-setState re-render cascades.

### ✅ Conflict 3 RESOLVED: Orphaned Answers on Word Bank Option Deletion
**Resolution (Q7-B):** When a word bank option is deleted, the system:
1. Checks all sibling questions for an answer matching the deleted option's letter.
2. Clears matching answers automatically.
3. Shows a toast: *"Q27's answer was cleared because option A was removed."*
4. This is included in the `onGroupUpdate` payload — one atomic update.

### 📋 Edge Case DOCUMENTED: Two Same-Type Groups in One Passage
If a passage contains two `summary-completion-list` groups (rare but possible), the existing consecutive-same-type grouping would merge them incorrectly. **Resolution:** Scoped to Phase 2 via a `summaryGroupId` field on each question, populated by the AI parser.

---

### Phase 1 (This PRD)
- Type-specific editor for `summary-completion-list` and `summary-completion-text`
- Master Paragraph Block with segment editing (text only, no add/remove blanks)
- Word Bank Block (list type only, hidden for text type)
- Individual question cards with read-only context + type-appropriate answer input
- Live word bank propagation via `onGroupUpdate`
- Deletion guard with auto-clear + toast notification
- On-blur commit for text segment edits
- `summaryGroupUtils.ts` utility (group detection, AST parse/serialize, deletion guard)
- Dual-format save (flat string + `summaryAST`)
- Full backward compatibility for legacy tests

### Phase 2 (Future PRD)
- Add/remove blank tokens from paragraph (creates/deletes questions)
- `summaryGroupId` field for same-type multi-group support in one passage
- Preview mode toggle (see paragraph as student would)
- Multiple acceptable answer variations for `summary-completion-text` blanks
