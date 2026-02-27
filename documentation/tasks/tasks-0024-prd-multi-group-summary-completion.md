# Tasks: 0024 — Multi-Group Summary Completion

**PRD Reference:** [`0024-prd-multi-group-summary-completion.md`](./0024-prd-multi-group-summary-completion.md)
**Generated:** 2026-02-22
**Audience:** Junior developer — follow every step exactly, do not improvise.

> ⚠️ **READ BEFORE YOU START**
> - Do NOT change any file that is not listed in the task.
> - Do NOT use any library, component, or pattern not explicitly instructed.
> - Ensure all the tests and your build are passing before moving onto the next step.

---

## Relevant Files

| File | Status | Role |
|------|--------|------|
| `src/services/ai/response.validator.ts` | **MODIFY** | Add `summaryGroupId` to `AIQuestionSchema` |
| `src/services/ai/gemini.provider.ts` | **MODIFY** | Add AI instruction for parsing `summaryGroupId` |
| `src/services/ai/groq.provider.ts` | **MODIFY** | Add AI instruction for parsing `summaryGroupId` |
| `src/utils/summaryGroupUtils.ts` | **MODIFY** | Upgrade `getGroupQuestions` to support `summaryGroupId` |
| `src/utils/summaryGroupUtils.test.ts` | **MODIFY** | Add unit tests to cover updated `getGroupQuestions` logic |
| `src/components/SummaryMasterBlock.jsx` | **MODIFY** | Display `summaryGroupId` in the header if it exists |
| `src/components/test/IELTSQuestionsPanel.tsx` | **MODIFY** | Sub-divide consecutive same-type question groups by `summaryGroupId` |

---

## Tasks

- [x] **1.0 Modify `AIQuestionSchema` in `src/services/ai/response.validator.ts`**

  > We need to instruct the AI validation layer to accept `summaryGroupId` in the returned JSON.

  - [x] **1.1** Open `src/services/ai/response.validator.ts` and find `AIQuestionSchema` (around line 40).
  - [x] **1.2** Add `summaryGroupId: z.string().optional(),` directly below the `options` field. The schema should now look like this:

    ```typescript
      options: z.array(z.string()).nullable().optional(),
      summaryGroupId: z.string().optional(),
      answer: z.union([z.string(), z.array(z.string())]),
    ```

---

- [x] **2.0 Update Prompt in `src/services/ai/gemini.provider.ts`**

  > This change enables the Gemini AI to detect distinct summary completion groups and output the `summaryGroupId` property.

  - [x] **2.1** Find `buildQuestionsAndAnswersPrompt` in `src/services/ai/gemini.provider.ts`.
  - [x] **2.2** In the prompt text, find `7. **"summary-completion-list"**` (around line 707). Modify its description block by adding a new CRITICAL bullet stating the rule for `summaryGroupId`:

    ```text
    7. **"summary-completion-list"**
       - ESSENCE: Fill blanks from a PROVIDED WORD BANK
       - WORD SOURCE: Box of words/phrases (A-H, A-L, etc.)
       - KEY PHRASE: "Complete using words from the BOX/LIST below"
       - Options: Extract the word bank as options array

       ⚠️ **CRITICAL: MULTI-GROUP IDENTIFICATION (summaryGroupId)**
       - Determine if the passage contains multiple separate summary completion exercises.
       - Assign a \`summaryGroupId\` string (e.g., "sc-1", "sc-2") to every question of type 'summary-completion-list' and 'summary-completion-text'.
       - A new group starts when a new instruction paragraph appears (e.g., 'Complete the following summary...').
       - All questions sharing the same instruction header MUST receive the SAME \`summaryGroupId\`.
       - The counter resets per passage (e.g., Passage 2 begins back at "sc-1").
       - NEVER include \`summaryGroupId\` for non-summary question types.
    ```

  - [x] **2.3** Update the JSON example for question 27 in the same file to show `summaryGroupId` being returned. Around line 942:

    ```json
    {
      "questionNumber": 27,
      "questionText": "People go to art museums because they accept the value of seeing an original work of art. But they do not go to museums to read original manuscripts of novels, perhaps because the availability of novels has depended on ______ for so long, and also because with novels, the ______ are the most important thing.\\n\\nHowever, in historical times artists such as Leonardo were happy to instruct ______ to produce copies of their work and these days new methods of reproduction allow excellent replication of surface relief features as well as colour and ______.\\n\\nIt is regrettable that museums still promote the superiority of original works of art, since this may not be in the interests of the ______.",
      "type": "summary-completion-list",
      "summaryGroupId": "sc-1",
      "sectionInstruction": "The value attached to original works of art. Complete the summary using the list of words, A-L, below.",
      "options": ["A. mechanical__(word)", "B.__(word)", "C.__(word)", "D. __(word)", "E. __(word)", "F. __(word)", "G. __(word)", "H. __(word)"],
      "answer": "",
      "passageId": "passage-3",
      "confidence": 95,
      "context": null
    },
    {
      "questionNumber": 28,
      "questionText": "",
      "type": "summary-completion-list",
      "summaryGroupId": "sc-1",
      "sectionInstruction": "The value attached to original works of art. Complete the summary using the list of words, A-L, below.",
      "options": ["A. mechanical__(word)", "B. __(word)", "C. __(word)", "D. __(word)", "E. __(word)", "F. __(word)", "G. __(word)", "H. __(word)"],
      "answer": "",
      "passageId": "passage-3",
      "confidence": 95,
      "context": null
    }
    ```

---

- [x] **3.0 Update Prompt in `src/services/ai/groq.provider.ts`**

  > Sync the Groq provider.

  - [x] **3.1** In `src/services/ai/groq.provider.ts`, find the prompt text sections that explain `summary-completion-list` (around lines 434 and 670). Note: Groq provider format is a bit different, it might just be table rows. Find where `summary-completion-list` is defined.
  - [x] **3.2** Modify the instructions to mandate the `summaryGroupId` property. Example:

    Where `summary-completion-list` is explained, append: `MUST assign a 'summaryGroupId' (e.g. \"sc-1\") to all questions under the same instruction block. Increment (e.g. \"sc-2\") if a new summary instruction block appears in the same passage. NEVER put this property on non-summary questions.`

  - [x] **3.3** Update the JSON example for Q27 (around line 788) in `groq.provider.ts` to include `"summaryGroupId": "sc-1"` exactly as you did for Gemini.

---

- [x] **4.0 Update `getGroupQuestions` in `src/utils/summaryGroupUtils.ts`**

  > This lets the Edit Modal properly isolate questions that belong to the exact same `summaryGroupId`, even if they sit next to another summary group.

  - [x] **4.1** Open `src/utils/summaryGroupUtils.ts` and locate the `getGroupQuestions` function.
  - [x] **4.2** Overwrite the implementation of `getGroupQuestions` completely with this new logic:

    ```typescript
    export function getGroupQuestions(
      allQuestions: SummaryQuestion[],
      selectedIndex: number
    ): SummaryQuestion[] {
      const target = allQuestions[selectedIndex];
      if (!target) return [];

      const targetType = target.type;
      const targetPassageId = target.passageId;
      const targetGroupId = target.summaryGroupId;

      // Grouping via summaryGroupId (New Phase 2 isolation behavior)
      if (targetGroupId) {
        return allQuestions.filter(
          q => q.summaryGroupId === targetGroupId &&
               q.passageId === targetPassageId &&
               q.type === targetType
        );
      }

      // Legacy fallback: Walk backwards/forwards for exact consecutive types
      let start = selectedIndex;
      while (
        start > 0 &&
        allQuestions[start - 1].type === targetType &&
        allQuestions[start - 1].passageId === targetPassageId &&
        !allQuestions[start - 1].summaryGroupId // Break if we hit a group ID
      ) {
        start--;
      }

      let end = selectedIndex;
      while (
        end < allQuestions.length - 1 &&
        allQuestions[end + 1].type === targetType &&
        allQuestions[end + 1].passageId === targetPassageId &&
        !allQuestions[end + 1].summaryGroupId // Break if we hit a group ID
      ) {
        end++;
      }

      return allQuestions.slice(start, end + 1);
    }
    ```

---

- [x] **5.0 Update `summaryGroupUtils.test.ts` Unit Tests**

  > Verify that the new logic in `getGroupQuestions` properly isolates sub-groups.

  - [x] **5.1** Open `src/utils/summaryGroupUtils.test.ts`.
  - [x] **5.2** Adjust the `makeQ` function helper to accept and assign `summaryGroupId` overrides.

    ```typescript
    const makeQ = (overrides: any) => ({
      type: 'summary-completion-list',
      question: '',
      answer: '',
      passageId: 'p1',
      number: 1,
      summaryGroupId: undefined,
      ...overrides,
    });
    ```
  - [x] **5.3** Inside the `describe('getGroupQuestions')` block, ADD these two tests below the existing ones:

    ```typescript
    it('isolates multi-group exercises by summaryGroupId in the same passage', () => {
      const allQs = [
        makeQ({ number: 27, summaryGroupId: 'sc-1' }),
        makeQ({ number: 28, summaryGroupId: 'sc-1' }),
        makeQ({ number: 29, summaryGroupId: 'sc-2' }),
        makeQ({ number: 30, summaryGroupId: 'sc-2' }),
      ];
      // Select index 2 (q 29), should only return sc-2 group
      const group = getGroupQuestions(allQs, 2);
      expect(group.map(q => q.number)).toEqual([29, 30]);

      // Select index 0 (q 27), should only return sc-1 group
      const group1 = getGroupQuestions(allQs, 0);
      expect(group1.map(q => q.number)).toEqual([27, 28]);
    });

    it('prevents legacy fallback from bleeding into new summaryGroupId blocks', () => {
      const allQs = [
        makeQ({ number: 27, summaryGroupId: undefined }), // legacy behavior question
        makeQ({ number: 28, summaryGroupId: undefined }),
        makeQ({ number: 29, summaryGroupId: 'sc-1' }),    // new behavior question
      ];
      // Grouping legacy question 27 shouldn't sweep up 29 since 29 has a summaryGroupId
      const group = getGroupQuestions(allQs, 0);
      expect(group.map(q => q.number)).toEqual([27, 28]);
    });
    ```

  - [x] **5.4** Run `npx jest src/utils/summaryGroupUtils.test.ts` and ensure all tests pass.

---

- [x] **6.0 Modify `SummaryMasterBlock.jsx`**

  > Show the `summaryGroupId` property natively in the UI to give teachers awareness.

  - [x] **6.1** Open `src/components/SummaryMasterBlock.jsx`.
  - [x] **6.2** Find the Header Bar inside the `Section A — Paragraph Block`. Currently, it renders the label like this:

    ```jsx
    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
      (Q{groupQuestions[0]?.number}–Q{groupQuestions[groupQuestions.length - 1]?.number} group · edit text, then click away)
    </span>
    ```

    Modify it to show the `leader.summaryGroupId` if it exists:

    ```jsx
    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
      {leader.summaryGroupId ? `(Group ${leader.summaryGroupId} · Q${groupQuestions[0]?.number}–Q${groupQuestions[groupQuestions.length - 1]?.number} · edit text, then click away)` : `(Q${groupQuestions[0]?.number}–Q${groupQuestions[groupQuestions.length - 1]?.number} group · edit text, then click away)`}
    </span>
    ```

---

- [x] **7.0 Sub-divide `summary-completion` in `IELTSQuestionsPanel.tsx`**

  > This is crucial for Student View correctness. When `groupQuestionsByTaskType` chunks consecutive question types together, it must separate them into isolated `QuestionGroup` arrays if the `summaryGroupId` diverges.

  - [x] **7.1** Open `src/components/test/IELTSQuestionsPanel.tsx`. At the beginning of the `groupQuestionsByTaskType` function (around line 153), we need to modify the group formation logic.
  - [x] **7.2** Overwrite the entire implementation of `groupQuestionsByTaskType` to accommodate the `summaryGroupId` rule:

    ```typescript
    const groupQuestionsByTaskType = (questions: Question[]): QuestionGroup[] => {
      if (questions.length === 0) return [];
      const firstQuestion = questions[0];
      if (!firstQuestion) return [];

      const groups: QuestionGroup[] = [];
      let currentGroup: Question[] = [firstQuestion];
      let currentType = firstQuestion.type;
      let currentGroupId = (firstQuestion as any).summaryGroupId; // Track summary group

      for (let i = 1; i < questions.length; i++) {
        const question = questions[i];
        if (!question) continue;

        const qGroupId = (question as any).summaryGroupId;

        // Condition to append to existing group:
        // 1. MUST be the same exact question type
        // 2. AND either neither question has a summaryGroupId OR both share the exact same summaryGroupId.
        const typeMatches = question.type === currentType;
        const groupIdMatches = qGroupId === currentGroupId;

        if (typeMatches && groupIdMatches) {
          currentGroup.push(question);
        } else {
          // Save current group and start a new one
          const firstQ = currentGroup[0];
          const lastQ = currentGroup[currentGroup.length - 1];
          if (firstQ && lastQ) {
            groups.push({
              startNumber: firstQ.number,
              endNumber: lastQ.number,
              type: currentType,
              questions: currentGroup,
              instructions: getTaskInstructions(currentType, firstQ.number, lastQ.number, firstQ.wordLimit),
            });
          }

          currentGroup = [question];
          currentType = question.type;
          currentGroupId = qGroupId;
        }
      }

      // Add the final remainder group
      if (currentGroup.length > 0) {
        const firstQ = currentGroup[0];
        const lastQ = currentGroup[currentGroup.length - 1];
        if (firstQ && lastQ) {
          groups.push({
            startNumber: firstQ.number,
            endNumber: lastQ.number,
            type: currentType,
            questions: currentGroup,
            instructions: getTaskInstructions(currentType, firstQ.number, lastQ.number, firstQ.wordLimit),
          });
        }
      }

      return groups;
    };
    ```

---

- [ ] **8.0 Manual Verification**

  - [ ] **8.1** AI Parser Testing: Take a PDF test with multiple distinct summary sections and drop it into ParseReviewPanel. Ensure the summary groups received the distinct `"sc-1"`, `"sc-2"` strings inside the generated JSON.
  - [ ] **8.2** Check Student View: Open `IELTSQuestionsPanel.tsx` in a browser against that mock data containing distinct `sc-1` and `sc-2` chunks and verify they correctly decoupled into two visually separated instruction blocks and rendered correctly.
  - [ ] **8.3** Check Edit Modal: Open the mock Test inside the `TestEditor`. Ensure each group only shows its specific passage segment in the `SummaryMasterBlock.jsx` headers! The word banks must not be mingled.
  - [ ] **8.4** Legacy Backward-compatibility Check: Edit an old Test without any `summaryGroupId`. Does it still render normally without errors? Yes.
