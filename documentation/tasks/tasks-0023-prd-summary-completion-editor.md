# Tasks: 0023 — Type-Specific Editor for Summary Completion

**PRD Reference:** [`0023-prd-summary-completion-editor.md`](./0023-prd-summary-completion-editor.md)
**Generated:** 2026-02-22
**Audience:** Junior developer — follow every step exactly, do not improvise.

> ⚠️ **READ BEFORE YOU START**
> - Do NOT change any file that is not listed in the task.
> - Do NOT use any library, component, or pattern not explicitly instructed.
> - Do NOT modify the Student View (`IELTSQuestionsPanel.tsx`). That file must remain entirely untouched.
> - Do NOT refactor or "clean up" code you are not explicitly asked to change.
> - After every sub-task, verify in the browser that the rest of the editor still works before proceeding.

---

## Relevant Files

| File | Status | Role |
|------|--------|------|
| `src/utils/summaryGroupUtils.ts` | **CREATE NEW** | Core utility: group detection, AST parse/serialize, deletion guard, context extraction |
| `src/utils/summaryGroupUtils.test.ts` | **CREATE NEW** | Unit tests for all util functions |
| `src/components/SummaryMasterBlock.jsx` | **CREATE NEW** | Master paragraph segment editor + optional word bank |
| `src/components/SummaryQuestionCard.jsx` | **CREATE NEW** | Individual blank card with read-only context + type-appropriate answer input |
| `src/components/QuestionEditorPanel.jsx` | **MODIFY** | Add `groupQuestions` + `onGroupUpdate` props; add guard in `validateFields`; add type check to render Summary mode |
| `src/components/TestEditor.tsx` | **MODIFY** | Compute `groupQuestions`, add `handleGroupUpdate`, pass both to `QuestionEditorPanel` |

### Notes

- Unit tests use **Jest** (already configured). Run all tests with: `npx jest`
- Run only the new util tests with: `npx jest src/utils/summaryGroupUtils.test.ts`
- All new `.jsx` component files use plain React — no TypeScript, matching the existing `.jsx` files in `src/components/`.
- `SummaryMasterBlock.jsx` and `SummaryQuestionCard.jsx` go in `src/components/` alongside `QuestionEditorPanel.jsx`.
- `summaryGroupUtils.ts` goes in `src/utils/` (create the folder if it does not exist).
- Styling: use only inline `style={{}}` objects. Do NOT use CSS modules, Tailwind, or external class names. Match the visual style already used in `QuestionEditorPanel.jsx` (blue `#3b82f6` accents, white background, `#1e293b` text, `0.5rem` border-radius, `#e2e8f0` border color).
- Toast notifications: use `window.alert()` for Phase 1 (a real toast library is a Phase 2 concern).

---

## Tasks

- [ ] **1.0 Create `src/utils/summaryGroupUtils.ts` — the core utility**

  > This file must export five named functions. Write them in the exact order shown. Do not add extra exports. Do not import anything except types from `'../types'` if that file exists; otherwise declare the two types inline in this file.

  - [ ] **1.1** Create the file at `src/utils/summaryGroupUtils.ts`. At the top, declare these two TypeScript types exactly as written:

    ```typescript
    export type SummarySegment =
      | { type: 'text';  value: string }
      | { type: 'blank'; questionNumber: number };

    // A "question" from editedQuestions in TestEditor
    export interface SummaryQuestion {
      type: string;
      question: string;       // flat string for group leader, "" for members
      answer: string;
      options?: string[];     // word bank — only on group leader, only for 'summary-completion-list'
      passageId?: string;
      number?: number;
      summaryAST?: SummarySegment[];  // optional rich format, stored on group leader
      [key: string]: any;     // allow any other field (points, timer, etc.)
    }
    ```

  - [ ] **1.2** Write and export the function `findGroupLeader`:

    ```typescript
    /**
     * Given the list of sibling questions in a summary group,
     * returns the one question that contains the full paragraph text.
     * Detection rule: the question with the most "______" blank markers
     * AND non-empty question text.
     * Falls back to the first question if none have blanks.
     */
    export function findGroupLeader(groupQuestions: SummaryQuestion[]): SummaryQuestion {
      let best = groupQuestions[0];
      let bestBlanks = 0;
      for (const q of groupQuestions) {
        if (!q.question) continue;
        const blanks = (q.question.match(/_{3,}/g) || []).length;
        if (blanks > bestBlanks) {
          bestBlanks = blanks;
          best = q;
        }
      }
      return best;
    }
    ```

  - [ ] **1.3** Write and export the function `parseToAST`:

    ```typescript
    /**
     * Converts a flat question string (with "______" markers) into a
     * SummarySegment[] AST that the editor uses internally.
     *
     * @param flat - the flat string, e.g. "People go to ______ of the ______ Mona Lisa."
     * @param groupQuestions - all sibling questions in ORDER (Q27 first, Q28 second, etc.)
     * @returns SummarySegment[]
     *
     * Example:
     *   flat = "go to ______ of the ______"
     *   groupQuestions = [{ number: 27 }, { number: 28 }]
     *   result = [
     *     { type: 'text', value: 'go to ' },
     *     { type: 'blank', questionNumber: 27 },
     *     { type: 'text', value: ' of the ' },
     *     { type: 'blank', questionNumber: 28 },
     *   ]
     */
    export function parseToAST(flat: string, groupQuestions: SummaryQuestion[]): SummarySegment[] {
      const parts = flat.split(/_{3,}/);
      const segments: SummarySegment[] = [];
      parts.forEach((text, i) => {
        // Always push a text segment (even if empty string — the editor will handle empty)
        segments.push({ type: 'text', value: text });
        // After each text part except the last, insert a blank
        if (i < groupQuestions.length) {
          const qNum = groupQuestions[i].number ?? (i + 1);
          segments.push({ type: 'blank', questionNumber: qNum });
        }
      });
      return segments;
    }
    ```

  - [ ] **1.4** Write and export the function `serializeToFlat`:

    ```typescript
    /**
     * Converts a SummarySegment[] AST back into the flat question string
     * that the Student View (IELTSQuestionsPanel.tsx) expects.
     * Blank tokens become exactly "______" (six underscores).
     *
     * @param segments - the AST from the editor's local state
     * @returns string — the flat question string to save on the group leader question
     *
     * Example:
     *   segments = [
     *     { type: 'text', value: 'go to ' },
     *     { type: 'blank', questionNumber: 27 },
     *     { type: 'text', value: ' of the ' },
     *     { type: 'blank', questionNumber: 28 },
     *   ]
     *   result = "go to ______ of the ______"
     */
    export function serializeToFlat(segments: SummarySegment[]): string {
      return segments
        .map(seg => seg.type === 'text' ? seg.value : '______')
        .join('');
    }
    ```

  - [ ] **1.5** Write and export the function `extractContext`:

    ```typescript
    /**
     * Given the full AST and a target question number, returns a human-readable
     * read-only context string showing the surrounding text with [QXX] placeholder.
     * Shows all text segments adjacent to the target blank (between two other blanks
     * or start/end of paragraph).
     *
     * @param segments - the AST
     * @param questionNumber - the question we want context for (e.g. 27)
     * @returns string — e.g. "go to look at a [Q27] of the Mona Lisa."
     */
    export function extractContext(segments: SummarySegment[], questionNumber: number): string {
      return segments
        .map(seg => {
          if (seg.type === 'text') return seg.value;
          if (seg.questionNumber === questionNumber) return `[Q${questionNumber}]`;
          return `[Q${seg.questionNumber}]`;
        })
        .join('')
        .trim();
    }
    ```

  - [ ] **1.6** Write and export the function `applyDeletionGuard`:

    ```typescript
    /**
     * When a word bank option is removed from the group leader's options array,
     * any sibling question whose answer matches the deleted option's letter
     * must have its answer cleared automatically.
     *
     * @param groupQuestions - all sibling questions (MUST be a fresh copy, not the original)
     * @param deletedOptionIndex - the 0-based index of the deleted option
     *                             (e.g. index 0 = letter "A", index 1 = letter "B", etc.)
     * @returns { updatedQuestions: SummaryQuestion[], clearedNumbers: number[] }
     *          updatedQuestions: the new array with affected answers cleared
     *          clearedNumbers: question numbers whose answers were cleared (for the toast message)
     */
    export function applyDeletionGuard(
      groupQuestions: SummaryQuestion[],
      deletedOptionIndex: number
    ): { updatedQuestions: SummaryQuestion[]; clearedNumbers: number[] } {
      const deletedLetter = String.fromCharCode(65 + deletedOptionIndex); // 0 → 'A', 1 → 'B', etc.
      const clearedNumbers: number[] = [];

      const updatedQuestions = groupQuestions.map(q => {
        if (q.answer === deletedLetter) {
          clearedNumbers.push(q.number ?? 0);
          return { ...q, answer: '' };
        }
        return { ...q };
      });

      return { updatedQuestions, clearedNumbers };
    }
    ```

  - [ ] **1.7** Write and export the function `getGroupQuestions`:

    ```typescript
    /**
     * Given the full flat questions array from TestEditor's editedQuestions
     * and the index of the currently selected question, returns all questions
     * that belong to the same summary group.
     *
     * Grouping rule: consecutive questions with the SAME type AND the SAME passageId.
     * Walk backwards from the selected index to find the start of the group,
     * then walk forward to find the end.
     *
     * @param allQuestions - Object.values(editedQuestions) — an array in order
     * @param selectedIndex - the 0-based index of the currently selected question
     * @returns SummaryQuestion[] - all questions in this group, in order
     */
    export function getGroupQuestions(
      allQuestions: SummaryQuestion[],
      selectedIndex: number
    ): SummaryQuestion[] {
      const target = allQuestions[selectedIndex];
      if (!target) return [];

      const targetType = target.type;
      const targetPassageId = target.passageId;

      // Walk backwards to find group start
      let start = selectedIndex;
      while (
        start > 0 &&
        allQuestions[start - 1].type === targetType &&
        allQuestions[start - 1].passageId === targetPassageId
      ) {
        start--;
      }

      // Walk forward to find group end
      let end = selectedIndex;
      while (
        end < allQuestions.length - 1 &&
        allQuestions[end + 1].type === targetType &&
        allQuestions[end + 1].passageId === targetPassageId
      ) {
        end++;
      }

      return allQuestions.slice(start, end + 1);
    }
    ```

---

- [ ] **2.0 Create `src/utils/summaryGroupUtils.test.ts` — unit tests**

  > Write tests for all five functions. Use Jest's `describe` / `it` / `expect` pattern. Do not use any mocking. No external imports except the five functions from `./summaryGroupUtils`.

  - [ ] **2.1** Create the file at `src/utils/summaryGroupUtils.test.ts` with the following content exactly:

    ```typescript
    import {
      findGroupLeader,
      parseToAST,
      serializeToFlat,
      extractContext,
      applyDeletionGuard,
      getGroupQuestions,
    } from './summaryGroupUtils';

    const makeQ = (overrides: any) => ({
      type: 'summary-completion-list',
      question: '',
      answer: '',
      passageId: 'p1',
      number: 1,
      ...overrides,
    });

    describe('findGroupLeader', () => {
      it('returns the question with the most blanks', () => {
        const q1 = makeQ({ number: 27, question: 'go to ______ of the ______ Mona Lisa.' });
        const q2 = makeQ({ number: 28, question: '' });
        const leader = findGroupLeader([q1, q2]);
        expect(leader.number).toBe(27);
      });

      it('falls back to first question if none have blanks', () => {
        const q1 = makeQ({ number: 27, question: 'no blanks here' });
        const q2 = makeQ({ number: 28, question: '' });
        const leader = findGroupLeader([q1, q2]);
        expect(leader.number).toBe(27);
      });
    });

    describe('parseToAST', () => {
      it('correctly splits one blank', () => {
        const flat = 'People go to ______ museums.';
        const qs = [makeQ({ number: 27 })];
        const ast = parseToAST(flat, qs);
        expect(ast).toEqual([
          { type: 'text', value: 'People go to ' },
          { type: 'blank', questionNumber: 27 },
          { type: 'text', value: ' museums.' },
        ]);
      });

      it('correctly splits two blanks', () => {
        const flat = 'A ______ and a ______.';
        const qs = [makeQ({ number: 27 }), makeQ({ number: 28 })];
        const ast = parseToAST(flat, qs);
        expect(ast).toEqual([
          { type: 'text', value: 'A ' },
          { type: 'blank', questionNumber: 27 },
          { type: 'text', value: ' and a ' },
          { type: 'blank', questionNumber: 28 },
          { type: 'text', value: '.' },
        ]);
      });
    });

    describe('serializeToFlat', () => {
      it('converts AST back to flat string', () => {
        const segments = [
          { type: 'text' as const, value: 'A ' },
          { type: 'blank' as const, questionNumber: 27 },
          { type: 'text' as const, value: ' and a ' },
          { type: 'blank' as const, questionNumber: 28 },
          { type: 'text' as const, value: '.' },
        ];
        expect(serializeToFlat(segments)).toBe('A ______ and a ______.');
      });

      it('round-trips parseToAST → serializeToFlat', () => {
        const flat = 'go to ______ of the ______ here.';
        const qs = [makeQ({ number: 27 }), makeQ({ number: 28 })];
        const ast = parseToAST(flat, qs);
        expect(serializeToFlat(ast)).toBe(flat);
      });
    });

    describe('extractContext', () => {
      it('returns the full paragraph with [Q27] in the right place', () => {
        const segments = [
          { type: 'text' as const, value: 'go to ' },
          { type: 'blank' as const, questionNumber: 27 },
          { type: 'text' as const, value: ' of the Mona Lisa.' },
        ];
        const ctx = extractContext(segments, 27);
        expect(ctx).toBe('go to [Q27] of the Mona Lisa.');
      });
    });

    describe('applyDeletionGuard', () => {
      it('clears answers matching the deleted letter', () => {
        const qs = [
          makeQ({ number: 27, answer: 'A' }),
          makeQ({ number: 28, answer: 'B' }),
          makeQ({ number: 29, answer: 'A' }),
        ];
        const { updatedQuestions, clearedNumbers } = applyDeletionGuard(qs, 0); // delete 'A'
        expect(updatedQuestions[0].answer).toBe('');
        expect(updatedQuestions[1].answer).toBe('B'); // unchanged
        expect(updatedQuestions[2].answer).toBe('');
        expect(clearedNumbers).toEqual([27, 29]);
      });

      it('returns empty clearedNumbers when nothing is affected', () => {
        const qs = [makeQ({ number: 27, answer: 'B' })];
        const { clearedNumbers } = applyDeletionGuard(qs, 0); // delete 'A'
        expect(clearedNumbers).toHaveLength(0);
      });
    });

    describe('getGroupQuestions', () => {
      it('returns group spanning consecutive same-type same-passage questions', () => {
        const allQs = [
          makeQ({ number: 26, type: 'true-false-not-given', passageId: 'p1' }),
          makeQ({ number: 27, type: 'summary-completion-list', passageId: 'p1' }),
          makeQ({ number: 28, type: 'summary-completion-list', passageId: 'p1' }),
          makeQ({ number: 29, type: 'summary-completion-list', passageId: 'p1' }),
          makeQ({ number: 30, type: 'multiple-choice', passageId: 'p1' }),
        ];
        // select index 2, which is question 28
        const group = getGroupQuestions(allQs, 2);
        expect(group.map(q => q.number)).toEqual([27, 28, 29]);
      });

      it('does not cross passage boundaries', () => {
        const allQs = [
          makeQ({ number: 27, type: 'summary-completion-list', passageId: 'p1' }),
          makeQ({ number: 28, type: 'summary-completion-list', passageId: 'p2' }),
        ];
        const group = getGroupQuestions(allQs, 0);
        expect(group.map(q => q.number)).toEqual([27]);
      });
    });
    ```

  - [ ] **2.2** Run the tests to confirm they all pass:
    ```bash
    npx jest src/utils/summaryGroupUtils.test.ts
    ```
    All 10 tests must show ✅ PASS. If any fail, fix the utility functions until they pass before proceeding to Task 3.

---

- [ ] **3.0 Create `src/components/SummaryMasterBlock.jsx` — master paragraph editor**

  > This component renders the full AST paragraph and (if type is `summary-completion-list`) the word bank. It calls `onGroupUpdate` on every change.

  - [ ] **3.1** Create the file `src/components/SummaryMasterBlock.jsx`. The component signature must be exactly:

    ```jsx
    /**
     * SummaryMasterBlock
     *
     * Props:
     * - groupQuestions {Array}   All sibling questions in the group, in order.
     *                            The group leader (with the paragraph) is detected internally.
     * - onGroupUpdate {Function} Callback: onGroupUpdate(updatedGroupQuestions)
     *                            Called with a full fresh copy of the group array whenever
     *                            any text segment or word bank item changes.
     *                            The caller (TestEditor) will update its state.
     */
    import React, { useState, useEffect } from 'react';
    import { findGroupLeader, parseToAST, serializeToFlat, applyDeletionGuard } from '../utils/summaryGroupUtils';

    export default function SummaryMasterBlock({ groupQuestions, onGroupUpdate }) {
      // ...
    }
    ```

  - [ ] **3.2** Inside the component, add this state initialization using `useEffect` to (re)build the AST whenever the group changes:

    ```jsx
    const leader = findGroupLeader(groupQuestions);
    const isList = leader.type === 'summary-completion-list';

    // Internal AST state — array of SummarySegment objects
    const [segments, setSegments] = useState(() => {
      // If the leader already has a summaryAST, use it directly
      if (leader.summaryAST && leader.summaryAST.length > 0) {
        return leader.summaryAST;
      }
      // Otherwise parse from flat string
      return parseToAST(leader.question || '', groupQuestions);
    });

    // Re-sync AST when the parent changes the group (e.g. navigation)
    useEffect(() => {
      if (leader.summaryAST && leader.summaryAST.length > 0) {
        setSegments(leader.summaryAST);
      } else {
        setSegments(parseToAST(leader.question || '', groupQuestions));
      }
    }, [leader.question, JSON.stringify(leader.summaryAST)]);
    ```

  - [ ] **3.3** Add a helper `propagate` function inside the component. This is the only function that calls `onGroupUpdate`. It must always be called after any state change to segments or options:

    ```jsx
    /**
     * Builds fresh copies of all group questions using the latest segments
     * and updated options, then calls onGroupUpdate once.
     *
     * @param newSegments {Array}  The updated segments array
     * @param newOptions  {Array}  The updated options array (only used for summary-completion-list)
     * @param customGroup {Array}  Optional override of the full group (used by deletion guard).
     *                             If omitted, current groupQuestions is used.
     */
    const propagate = (newSegments, newOptions, customGroup) => {
      const flat = serializeToFlat(newSegments);
      const base = customGroup || groupQuestions;
      const updatedGroup = base.map(q => {
        const isLeader = (q === leader || q.number === leader.number);
        if (isLeader) {
          return {
            ...q,
            question: flat,        // flat string for Student View backward compat
            summaryAST: newSegments,  // rich format for Edit Modal
            ...(isList ? { options: newOptions } : {}),
          };
        }
        return { ...q };
      });
      onGroupUpdate(updatedGroup);
    };
    ```

  - [ ] **3.4** Add the handler for editing a text segment on blur:

    ```jsx
    const handleTextBlur = (segIndex, newValue) => {
      const newSegments = segments.map((seg, i) =>
        i === segIndex ? { ...seg, value: newValue } : seg
      );
      setSegments(newSegments);
      propagate(newSegments, leader.options || []);
    };
    ```

  - [ ] **3.5** Add the three word bank handlers (only used when `isList === true`):

    ```jsx
    const handleOptionChange = (optIndex, newValue) => {
      const newOptions = (leader.options || []).map((opt, i) =>
        i === optIndex ? newValue : opt
      );
      propagate(segments, newOptions);
    };

    const handleAddOption = () => {
      const newOptions = [...(leader.options || []), ''];
      propagate(segments, newOptions);
    };

    const handleRemoveOption = (optIndex) => {
      // 1. Apply deletion guard — auto-clears sibling answers
      const { updatedQuestions, clearedNumbers } = applyDeletionGuard(
        groupQuestions.map(q => ({ ...q })),
        optIndex
      );
      // 2. Remove the option from the leader's options array
      const newOptions = (leader.options || []).filter((_, i) => i !== optIndex);
      // 3. Show toast listing which questions had their answer cleared
      if (clearedNumbers.length > 0) {
        window.alert(
          `Option ${String.fromCharCode(65 + optIndex)} was removed. ` +
          `The answer for question(s) ${clearedNumbers.join(', ')} has been cleared automatically.`
        );
      }
      // 4. Propagate — pass updatedQuestions as customGroup so the cleared answers are saved
      propagate(segments, newOptions, updatedQuestions);
    };
    ```

  - [ ] **3.6** Write the JSX return value. Render the component in TWO visual sections:

    **Section A — Paragraph Block:**

    ```jsx
    return (
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden', marginBottom: '1rem' }}>

        {/* Header bar */}
        <div style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.06)', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#3b82f6' }}>
            Summary Paragraph
          </span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            (Q{groupQuestions[0]?.number}–Q{groupQuestions[groupQuestions.length - 1]?.number} group · edit text, then click away)
          </span>
        </div>

        {/* Inline segment editor */}
        <div style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', fontFamily: 'Arial, sans-serif', fontSize: '0.9375rem', lineHeight: 1.8 }}>
          {segments.map((seg, i) => {
            if (seg.type === 'blank') {
              // Render a non-editable blank badge
              return (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', background: '#dbeafe', color: '#1d4ed8', borderRadius: '0.25rem', padding: '0 0.375rem', fontWeight: 700, fontSize: '0.8125rem', height: '24px', whiteSpace: 'nowrap' }}>
                  Q{seg.questionNumber}
                </span>
              );
            }
            // Render an auto-resizing editable text input
            return (
              <input
                key={i}
                type="text"
                defaultValue={seg.value}
                onBlur={(e) => handleTextBlur(i, e.target.value)}
                style={{
                  border: 'none',
                  borderBottom: '1px dashed #cbd5e1',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '0.9375rem',
                  color: '#1e293b',
                  fontFamily: 'Arial, sans-serif',
                  padding: '0 2px',
                  minWidth: '4px',
                  width: `${Math.max(seg.value.length, 1) * 8}px`,
                }}
                onFocus={(e) => { e.target.style.borderBottomColor = '#3b82f6'; }}
                onBlurCapture={(e) => { e.target.style.borderBottomColor = '#cbd5e1'; }}
              />
            );
          })}
        </div>

        {/* Phase 2 placeholder note for add/remove blanks */}
        <div style={{ padding: '0.375rem 1rem', borderTop: '1px solid #e2e8f0', background: '#fafafa', fontSize: '0.75rem', color: '#94a3b8' }}>
          ℹ Adding or removing blanks is available in a future update.
        </div>
      </div>
    );
    ```

    **Section B — Word Bank Block (only if `isList === true`):**

    Add the word bank block BETWEEN the paragraph block and the closing `</div>`:

    ```jsx
    {isList && (
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden', marginBottom: '1rem' }}>
        {/* Header */}
        <div style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.06)', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#3b82f6' }}>
            Word Bank (shared by all blanks)
          </span>
        </div>

        {/* Option rows */}
        <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {(leader.options || []).map((opt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Letter badge */}
              <span style={{ minWidth: '20px', fontWeight: 700, color: '#475569', fontSize: '0.875rem' }}>
                {String.fromCharCode(65 + i)}.
              </span>
              {/* Editable option text */}
              <input
                type="text"
                value={opt}
                onChange={(e) => handleOptionChange(i, e.target.value)}
                style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '0.375rem', padding: '0.25rem 0.5rem', fontSize: '0.875rem', color: '#1e293b', outline: 'none' }}
                onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; }}
                onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; }}
              />
              {/* Remove button */}
              <button
                onClick={() => handleRemoveOption(i)}
                title="Remove this option"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem', lineHeight: 1, padding: '0 4px' }}
              >
                ×
              </button>
            </div>
          ))}

          {/* Add option button */}
          <button
            onClick={handleAddOption}
            style={{ alignSelf: 'flex-start', marginTop: '0.25rem', background: 'transparent', border: '1px dashed #3b82f6', borderRadius: '0.375rem', color: '#3b82f6', fontSize: '0.8125rem', fontWeight: 600, padding: '0.25rem 0.75rem', cursor: 'pointer' }}
          >
            + Add Option
          </button>
        </div>
      </div>
    )}
    ```

---

- [ ] **4.0 Create `src/components/SummaryQuestionCard.jsx` — per-blank question card**

  > This component renders ONE individual question card for a single blank inside the summary group. It shows read-only context and the correct answer input. It is rendered once per question in the group, BELOW the SummaryMasterBlock.

  - [ ] **4.1** Create the file `src/components/SummaryQuestionCard.jsx` with this exact signature:

    ```jsx
    /**
     * SummaryQuestionCard
     *
     * Props:
     * - question {Object}          The individual question (Q27, Q28, etc.)
     * - questionIndex {number}     0-based index in allQuestions array (used for onUpdate call)
     * - allSegments {Array}        The current AST from SummaryMasterBlock. Used to build read-only context.
     * - isHighlighted {boolean}    True when this card is the currently selected question.
     * - onUpdate {Function}        onUpdate(index, updatedQuestion) — same callback as generic editor.
     * - usedAnswers {string[]}     Letters already used by OTHER blanks in the group.
     */
    import React from 'react';
    import { extractContext } from '../utils/summaryGroupUtils';

    export default function SummaryQuestionCard({
      question,
      questionIndex,
      allSegments,
      isHighlighted,
      onUpdate,
      usedAnswers = [],
    }) {
      const isList = question.type === 'summary-completion-list';
      const context = extractContext(allSegments, question.number);
    ```

  - [ ] **4.2** Add the answer change handlers inside the component:

    ```jsx
      // For summary-completion-list: answer is a letter string like "A"
      const handleDropdownChange = (e) => {
        onUpdate(questionIndex, { ...question, answer: e.target.value });
      };

      // For summary-completion-text: answer is the word from the passage
      const handleTextChange = (e) => {
        onUpdate(questionIndex, { ...question, answer: e.target.value });
      };
    ```

  - [ ] **4.3** Write the JSX return. The card has a subtle highlight ring when `isHighlighted` is true:

    ```jsx
      return (
        <div style={{
          border: isHighlighted ? '2px solid #3b82f6' : '1px solid #e2e8f0',
          borderRadius: '0.5rem',
          marginBottom: '0.75rem',
          overflow: 'hidden',
          background: '#ffffff',
        }}>

          {/* Card header with question number */}
          <div style={{ padding: '0.5rem 1rem', background: isHighlighted ? 'rgba(59, 130, 246, 0.08)' : '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1e293b' }}>
              Question {question.number}
            </span>
            {question.answer && (
              <span style={{ marginLeft: 'auto', padding: '0.125rem 0.5rem', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white', borderRadius: '0.25rem', fontSize: '0.6875rem', fontWeight: 600 }}>
                SET
              </span>
            )}
          </div>

          <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* Read-only context paragraph */}
            <div style={{ padding: '0.5rem 0.75rem', background: '#f1f5f9', borderRadius: '0.375rem', fontSize: '0.875rem', color: '#475569', fontFamily: 'Arial, sans-serif', lineHeight: 1.6 }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                Context (read-only)
              </span>
              {context}
            </div>

            {/* Answer section */}
            <div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b', display: 'block', marginBottom: '0.375rem' }}>
                Correct Answer *
              </span>

              {isList ? (
                // summary-completion-list: dropdown from word bank
                <select
                  value={question.answer || ''}
                  onChange={handleDropdownChange}
                  style={{ width: '100%', padding: '0.375rem 0.5rem', border: '2px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.9375rem', color: '#1e293b', background: '#ffffff', outline: 'none' }}
                >
                  <option value="">— Select answer —</option>
                  {(question.options || []).map((opt, i) => {
                    const letter = String.fromCharCode(65 + i);
                    const isUsedByOther = usedAnswers.includes(letter);
                    return (
                      <option
                        key={i}
                        value={letter}
                        disabled={isUsedByOther}
                        style={{ color: isUsedByOther ? '#94a3b8' : '#000000' }}
                      >
                        {letter}. {opt}{isUsedByOther ? ' (used)' : ''}
                      </option>
                    );
                  })}
                </select>
              ) : (
                // summary-completion-text: free text from passage
                <input
                  type="text"
                  value={question.answer || ''}
                  onChange={handleTextChange}
                  placeholder="Enter the correct word(s) from the passage"
                  style={{ width: '100%', padding: '0.375rem 0.5rem', border: '2px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.9375rem', color: '#1e293b', background: '#ffffff', outline: 'none', boxSizing: 'border-box' }}
                />
              )}
            </div>

          </div>
        </div>
      );
    }
    ```

---

- [ ] **5.0 Modify `src/components/QuestionEditorPanel.jsx` — add Summary Group mode**

  > You will make THREE isolated changes to this file. Read each change instruction completely before touching the file.

  - [ ] **5.1** **Add new imports (top of file, after line 4).** Insert the following two import lines immediately after the existing `import r2StorageService` line (line 4):

    ```jsx
    import SummaryMasterBlock from './SummaryMasterBlock';
    import SummaryQuestionCard from './SummaryQuestionCard';
    ```

  - [ ] **5.2** **Add two new props to the component signature.** The current signature (line 6–18) is:

    ```jsx
    const QuestionEditorPanel = ({
      question,
      questionIndex,
      totalQuestions,
      onUpdate,
      onClose,
      onReset,
      onPrevious,
      onNext,
      isFirst,
      isLast,
      isImagePassage = false
    }) => {
    ```

    Change it to add `groupQuestions` and `onGroupUpdate` at the end:

    ```jsx
    const QuestionEditorPanel = ({
      question,
      questionIndex,
      totalQuestions,
      onUpdate,
      onClose,
      onReset,
      onPrevious,
      onNext,
      isFirst,
      isLast,
      isImagePassage = false,
      groupQuestions = null,     // NEW: Array of all sibling questions, or null
      onGroupUpdate = null,      // NEW: Callback for group-level updates
    }) => {
    ```

  - [ ] **5.3** **Fix the validation warning for group-member questions.** Locate the `validateFields` function (approximately line 32). Find this exact block:

    ```jsx
    if (!isImagePassage && (!q.question || q.question.trim() === '')) {
      warnings.question = 'Question text is empty';
    }
    ```

    Replace it with:

    ```jsx
    const isSummaryGroupMember =
      (q.type === 'summary-completion-list' || q.type === 'summary-completion-text') &&
      groupQuestions !== null &&
      groupQuestions.length > 1;

    if (!isImagePassage && !isSummaryGroupMember && (!q.question || q.question.trim() === '')) {
      warnings.question = 'Question text is empty';
    }
    ```

    **Why:** Group member questions (Q28–Q31) intentionally have an empty `question` field. Without this guard they trigger a false validation warning.

  - [ ] **5.4** **Add the Summary Group render mode.** In the JSX return (inside `{/* Editor Content */}` `<Stack spacing="lg">`), find the very first child, which is the `{/* Question Text */}` section starting with:

    ```jsx
    {/* Question Text */}
    {!isImagePassage ? (
    ```

    BEFORE that block, add the following early-return for summary group mode:

    ```jsx
    {/* ── SUMMARY GROUP MODE ── */}
    {(question.type === 'summary-completion-list' || question.type === 'summary-completion-text') &&
      groupQuestions && groupQuestions.length > 0 && onGroupUpdate ? (
      <>
        {/* Master block — paragraph + word bank */}
        <SummaryMasterBlock
          groupQuestions={groupQuestions}
          onGroupUpdate={onGroupUpdate}
        />

        {/* Individual cards for each blank */}
        {groupQuestions.map((q, i) => {
          // Compute usedAnswers: letters already assigned to OTHER blanks
          const usedAnswers = groupQuestions
            .filter((_, j) => j !== i)
            .map(sq => sq.answer)
            .filter(Boolean);

          // Find the index of this question in allQuestions
          // We use questionIndex as an anchor: if this q matches the selected question,
          // its index is questionIndex. For others, we offset by their position.
          // We reconstruct the real allIndex by finding groupQuestions position delta.
          const selectedGroupIndex = groupQuestions.findIndex(
            sq => sq.number === question.number
          );
          const delta = i - selectedGroupIndex;
          const realIndex = questionIndex + delta;

          return (
            <SummaryQuestionCard
              key={q.number}
              question={q}
              questionIndex={realIndex}
              allSegments={
                // Pull AST from the group leader
                (() => {
                  const { parseToAST, findGroupLeader } = require('../utils/summaryGroupUtils');
                  const leader = findGroupLeader(groupQuestions);
                  if (leader.summaryAST && leader.summaryAST.length > 0) return leader.summaryAST;
                  return parseToAST(leader.question || '', groupQuestions);
                })()
              }
              isHighlighted={q.number === question.number}
              onUpdate={onUpdate}
              usedAnswers={usedAnswers}
            />
          );
        })}
      </>
    ) : (
    ```

    Then close the ternary AFTER the existing `{/* Score / Points */}` section ends (before the final `</Stack>` closing tag):

    ```jsx
    )}
    {/* ── END SUMMARY GROUP MODE ── */}
    ```

    > ⚠️ **Important:** Do NOT delete or modify any of the existing editor fields (Question Text, Answer Key, Options, Score, etc.) that were already inside the Stack. You are wrapping them all in the `else` branch of the new ternary. The existing generic editor remains entirely intact for all other question types.

    > ⚠️ The `require()` inside the JSX is intentional for now (avoiding a circular import while keeping the file as `.jsx`). If the linter complains, move the two lines up to a `useMemo` at the component top level instead.

---

- [ ] **6.0 Modify `src/components/TestEditor.tsx` — wire up group detection and callback**

  > You will make TWO isolated changes. Read both completely before touching the file.

  - [ ] **6.1** **Add `handleGroupUpdate` function.** Locate the existing `handleQuestionUpdate` function (line 183):

    ```tsx
    const handleQuestionUpdate = (index: number, updatedQuestion: any) => {
      setEditedQuestions(prev => ({
        ...prev,
        [index]: updatedQuestion
      }));
      setModifiedQuestions(prev => new Set([...prev, index]));
    };
    ```

    Immediately AFTER this function (after line 189), add the new function:

    ```tsx
    /**
     * Called by SummaryMasterBlock when any group-level change occurs
     * (paragraph text edit, word bank add/edit/delete, deletion guard auto-clear).
     * Receives the full updated group and applies ALL changes atomically in one setState call.
     *
     * @param updatedGroupQuestions - Array of updated group questions, in the same order as
     *                                they appear in groupQuestions (passed to QuestionEditorPanel).
     *                                Each element preserves its original .number field so we can
     *                                map it back to the correct index in editedQuestions.
     */
    const handleGroupUpdate = (updatedGroupQuestions: any[]) => {
      setEditedQuestions(prev => {
        const next = { ...prev };
        // For each updated question, find its index by matching question.number
        // against the indices in editedQuestions (question.number is 1-based, index is 0-based)
        updatedGroupQuestions.forEach(updatedQ => {
          // Find the index whose current question has the same number
          const index = Object.keys(next).find(
            key => next[Number(key)]?.number === updatedQ.number
          );
          if (index !== undefined) {
            next[Number(index)] = updatedQ;
          }
        });
        return next;
      });
      // Mark all indices in the group as modified
      setModifiedQuestions(prev => {
        const newSet = new Set(prev);
        updatedGroupQuestions.forEach(updatedQ => {
          const index = Object.keys(editedQuestions).find(
            key => editedQuestions[Number(key)]?.number === updatedQ.number
          );
          if (index !== undefined) newSet.add(Number(index));
        });
        return newSet;
      });
    };
    ```

  - [ ] **6.2** **Pass `groupQuestions` and `onGroupUpdate` to `QuestionEditorPanel`.** Find the `questionEditorPanel` constant (line 645):

    ```tsx
    const questionEditorPanel = selectedQuestionIndex !== null ? (
      <QuestionEditorPanel
        isImagePassage={...}
        question={...}
        questionIndex={...}
        totalQuestions={...}
        onUpdate={(updated: any) => handleQuestionUpdate(selectedQuestionIndex, updated)}
        onClose={...}
        onReset={...}
        onPrevious={...}
        onNext={...}
      />
    ) : null;
    ```

    Add the `groupQuestions` and `onGroupUpdate` props. The final render of `QuestionEditorPanel` must look exactly like this (replacing the entire block from `const questionEditorPanel` to the closing `) : null;`):

    ```tsx
    const questionEditorPanel = selectedQuestionIndex !== null ? (() => {
      const q = editedQuestions[selectedQuestionIndex] || test.questions[selectedQuestionIndex];
      const resource = resources.find(r => r.id === q?.resourceId || r.id === q?.passageId);
      const isImagePassage =
        resource?.type === 'image' ||
        (resource?.type === 'text' && !!(resource as any).imageUrl) ||
        (resource?.type === 'audio' && (resource as any).images && (resource as any).images.length > 0);

      // Compute group if this is a summary type
      const isSummaryType =
        q?.type === 'summary-completion-list' || q?.type === 'summary-completion-text';

      let groupQuestions: any[] | null = null;
      if (isSummaryType) {
        // Import at the top of the file (add this import at line ~25):
        // import { getGroupQuestions } from '../utils/summaryGroupUtils';
        const allQsArray = Object.keys(editedQuestions)
          .sort((a, b) => Number(a) - Number(b))
          .map(key => editedQuestions[Number(key)]);
        groupQuestions = getGroupQuestions(allQsArray, selectedQuestionIndex);
      }

      return (
        <QuestionEditorPanel
          isImagePassage={isImagePassage}
          question={q}
          questionIndex={selectedQuestionIndex}
          totalQuestions={test.questions.length}
          onUpdate={(updated: any) => handleQuestionUpdate(selectedQuestionIndex, updated)}
          onClose={handleCloseEditor}
          onReset={() => handleResetQuestion(selectedQuestionIndex)}
          onPrevious={() => {
            if (selectedQuestionIndex > 0) setSelectedQuestionIndex(selectedQuestionIndex - 1);
          }}
          onNext={() => {
            if (selectedQuestionIndex < test.questions.length - 1)
              setSelectedQuestionIndex(selectedQuestionIndex + 1);
          }}
          groupQuestions={groupQuestions}
          onGroupUpdate={isSummaryType ? handleGroupUpdate : null}
        />
      );
    })() : null;
    ```

    > ⚠️ You also need to add the `getGroupQuestions` import. At the top of `TestEditor.tsx`, find the last import line (line 25: `import { adaptTestToResources, ... }`). Add this line immediately after it:

    ```tsx
    import { getGroupQuestions } from '../utils/summaryGroupUtils';
    ```

  - [ ] **6.3** **Fix `validateQuestions` to skip empty question text for summary group members.** Find the `validateQuestions` function (line 349). Inside its `.forEach`, find the block:

    ```tsx
    if (!isImagePassage && (!question.question || question.question.trim() === '')) {
      errors.push(`Question ${questionNum}: Question text is empty`);
    }
    ```

    Replace it with:

    ```tsx
    const isSummaryGroupMember =
      (question.type === 'summary-completion-list' || question.type === 'summary-completion-text') &&
      (!question.question || question.question.trim() === '');

    if (!isImagePassage && !isSummaryGroupMember && (!question.question || question.question.trim() === '')) {
      errors.push(`Question ${questionNum}: Question text is empty`);
    }
    ```

---

- [ ] **7.0 Manual Verification**

  > Follow these steps EXACTLY in the browser. Do not skip any step. The dev server should already be running (`npm run dev`).

  - [ ] **7.1** Open a test in the Edit Test Modal that contains a `summary-completion-list` question group (e.g., Q27–Q31). Click on **Q27** (the group leader).
    - **Expected:** The right panel shows the Summary Paragraph block at the top with inline text inputs and blue `Q27`, `Q28`, ... badges. Below it, the Word Bank block shows options A, B, C... as editable rows. Below the word bank, individual cards appear for Q27–Q31 each showing a read-only context paragraph and a dropdown.
    - **Failure:** If you see a blank generic textarea, stop and debug Task 6.2 first.

  - [ ] **7.2** Click on **Q28** (a group member).
    - **Expected:** The same Summary Paragraph block is shown. Q28's card has a blue highlight border. The generic textarea is NOT shown.
    - **Failure:** If you see an empty textarea, debug Task 5.4.

  - [ ] **7.3** Edit a text segment in the paragraph block. Click on the text between two badges, change a word, then click elsewhere (blur).
    - **Expected:** The change is committed. The read-only context strings in the individual question cards update to reflect the new text. No page jitter or error in the browser console.

  - [ ] **7.4** Change the answer dropdown for Q27 to a letter. Then change Q28's dropdown to the SAME letter.
    - **Expected:** Q28's dropdown shows the letter as `(used)` and disabled in its own row.

  - [ ] **7.5** Edit a word bank option. Change "A. copy" to "A. duplicate".
    - **Expected:** The dropdown in Q27's card immediately shows "A. duplicate" in the select options.

  - [ ] **7.6** Delete a word bank option that Q27 is currently assigned to (e.g., delete option A when Q27's answer is "A").
    - **Expected:** An alert appears: "Option A was removed. The answer for question(s) 27 has been cleared automatically." Q27's dropdown resets to "— Select answer —".

  - [ ] **7.7** Click Save. Then re-open the same test.
    - **Expected:** The paragraph text and word bank are preserved. The Student View (run a student account through the test) still shows the paragraph correctly with inline dropdowns — exactly as it did before this feature.

  - [ ] **7.8** Open a test with a `summary-completion-text` question.
    - **Expected:** The Summary Paragraph block is shown. The Word Bank block is NOT rendered. Each individual card shows a free-text input instead of a dropdown.

  - [ ] **7.9** Open a test with a different question type (e.g., `multiple-choice`).
    - **Expected:** The generic editor is shown exactly as before. None of the new components are rendered.

  - [ ] **7.10** Run all unit tests and confirm they still pass:
    ```bash
    npx jest
    ```
    No existing tests should have regressed. The new `summaryGroupUtils.test.ts` tests must all be green.
