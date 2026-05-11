# Reading V2 Family: Completion

This document defines the `completion` family for Reading V2.

Companion docs:

- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`

This family covers task types where the student's primary job is to supply a missing value directly rather than choose from a visible option set.

---

## 1. Included Official Task Types

- `sentence-completion`
- `summary-completion-text`
- `note-completion`
- `short-answer`

Not included:

- `summary-completion-list` because it is choice-driven
- `table-completion` because it is structured-layout
- `flowchart-completion` because it is structured-layout

---

## 2. Student Experience

Completion tasks are typically read as one coherent text shell with missing answers.

What the student sees:

- one instruction block
- one answer rule
- one or more numbered blanks or direct prompts
- no visible option bank

What the student does:

- read the passage
- locate relevant information
- type a word, phrase, or short answer

---

## 3. Visual Schema

### 3.1 Desktop And Tablet

```text
+--------------------------------------+-------------------------------------------+
| Left: passage                        | Right: completion task group              |
| - paragraph flow                     | - instructions                            |
| - highlight or anchor context        | - answer rule                             |
|                                      | - numbered blanks or prompts              |
|                                      | - text inputs                             |
+--------------------------------------+-------------------------------------------+
```

### 3.2 Phone

```text
+--------------------------------------------------------------+
| Passage-first phone shell                                    |
+--------------------------------------------------------------+
| Sticky question strip                                        |
+--------------------------------------------------------------+
| Primary pane: passage                                        |
+--------------------------------------------------------------+
| Answer layer: one blank or prompt at a time                  |
| - visible number                                             |
| - local prompt context                                       |
| - input field                                                |
+--------------------------------------------------------------+
```

---

## 4. Shared TaskGroup Requirements

Every completion-family `TaskGroup` must define:

- official task type
- `completion` engineering family
- shared instruction blocks
- answer rule including word limit where relevant
- ordered interactions
- linked stimulus references

Optional:

- blank anchors inside a summary shell or note shell
- inline prompt blocks for short-answer interactions

Forbidden:

- visible choice bank as the primary answer mode
- runtime guessing the answer rule from the instruction string

---

## 5. Shared AnswerRule Patterns

Typical answer-rule fields:

- `wordLimit`
- `allowNumber`
- `allowHyphenatedWord`
- `caseSensitivity`
- `trimPunctuation`
- `acceptMultipleEquivalentAnswers`

Scoring must read the explicit answer rule, not infer it from a renderer.

---

## 6. Type-Specific Notes

### 6.1 `sentence-completion`

Student shape:

- one sentence stem per interaction
- one blank or one implied missing phrase

Modeling notes:

- preserve sentence text exactly enough that teachers can verify grammar and meaning
- use one interaction per blank

Common failure to prevent:

- flattening grouped instructions into each sentence card and losing the shared word-limit rule

### 6.2 `summary-completion-text`

Student shape:

- one summary block with multiple blanks
- answers come from the passage, not from a list

Modeling notes:

- summary shell belongs to the stimulus side of the group
- blanks may use explicit anchors inside the shell

Common failure to prevent:

- treating the summary as unrelated sentence-completion cards and losing shell context

### 6.3 `note-completion`

Student shape:

- note-style bullets or outline
- answers come from the passage

Modeling notes:

- preserve note hierarchy if it helps meaning
- do not flatten indentation or bullet grouping away if it changes comprehension

Common failure to prevent:

- degrading note structure into plain lines with no hierarchy

### 6.4 `short-answer`

Student shape:

- direct question prompts
- short free-text responses

Why this family includes it:

- the student still supplies a value directly
- authoring, answer-rule, and scoring behavior match completion better than choice

Common failure to prevent:

- treating short-answer as a separate family and duplicating completion logic unnecessarily

---

## 7. Mobile Rules

Phone rules for this family:

- keep the passage as the primary pane
- open focused answer entry for the active blank or question
- preserve reading position when the answer layer closes
- keep instructions or word limit visible in the answer layer

Avoid:

- long detached answer sheets with little local context
- hidden word-limit rules

---

## 8. Result And Review Rules

Teacher review should show:

- grouped instruction
- answer rule
- local prompt or blank context
- student answer
- correct answer
- visible question number

For summary and note tasks, keep the shell context visible enough that the teacher can understand what blank was being answered.

---

## 9. Extraction And Reuse Rules

When completion-family tasks are extracted:

- preserve the grouped shell
- preserve answer rule
- rebase numbering
- create new identities with hidden provenance

Do not:

- convert extracted summary or note tasks into independent sentence cards

---

## 10. Edge Cases And Prevention

### 10.1 Word Limit Differs Across Interactions

Avoid in one group if possible.

If unavoidable, split into multiple groups.

### 10.2 Shared Shell Has Nonlinear Layout

If the shell becomes table-like or flow-like, it is probably not a pure completion family task and should move to structured-layout.

### 10.3 Acceptable Answer Variants

Store them explicitly in scoring rules.

Do not rely on teacher memory or result review comments to recover them later.
