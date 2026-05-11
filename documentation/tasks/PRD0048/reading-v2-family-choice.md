# Reading V2 Family: Choice

This document defines the `choice` family for Reading V2.

Companion docs:

- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`

This family covers tasks where the student selects from a visible set of options rather than composing the answer directly from passage text.

---

## 1. Included Official Task Types

- `multiple-choice`
- `multiple-select`
- `summary-completion-list`

---

## 2. Student Experience

Choice-family tasks always expose a visible choice set.

What the student sees:

- one instruction block
- one answer rule
- one or more prompts, blanks, or stems
- one visible option bank or per-question options

What the student does:

- choose one or more visible options
- sometimes reuse options depending on the task rule

---

## 3. Visual Schema

### 3.1 Desktop And Tablet

```text
+--------------------------------------+-------------------------------------------+
| Left: passage                        | Right: choice task group                  |
|                                      | - instructions                            |
|                                      | - answer rule                             |
|                                      | - prompts or blanks                       |
|                                      | - visible option list or banks            |
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
| Answer layer: active prompt plus visible options             |
| - single select or multi-select controls                     |
| - clear selection limit                                      |
+--------------------------------------------------------------+
```

---

## 4. Shared TaskGroup Requirements

Every choice-family `TaskGroup` must define:

- official task type
- `choice` engineering family
- explicit option-set structure
- selection rule
- option-label format where relevant

The option set may be:

- per interaction
- shared at task-group level

Forbidden:

- relying on prompt text alone to reconstruct options
- silently converting visible options into free-text completion

---

## 5. Shared AnswerRule Patterns

Typical answer-rule fields:

- `selectionLimit`
- `selectionMode: single | multiple`
- `optionLabelFormat`
- `optionReuse`

Use explicit `selectionLimit` for variants such as:

- choose two options
- choose three letters
- multiple selections across repeated prompts

---

## 6. Type-Specific Notes

### 6.1 `multiple-choice`

Student shape:

- one prompt
- one option list
- one correct answer

Rules:

- use single-select controls
- preserve option order
- preserve displayed labels

### 6.2 `multiple-select`

Student shape:

- one prompt
- one option list
- more than one required answer

Rules:

- explicit selection limit is required
- feedback and validation should show how many choices are expected

Normalization notes:

- "Choose two options"
- "Choose two letters"
- "Choose three answers"

All normalize here, with selection limit preserved.

### 6.3 `summary-completion-list`

Student shape:

- one summary shell with multiple blanks
- one visible option bank

Why this family includes it:

- the student is choosing from a visible bank
- mobile, editor, and validation behavior align with choice tasks more than free-text completion

Common failure to prevent:

- flattening the summary shell into unrelated option questions

---

## 7. Mobile Rules

Phone rules for this family:

- keep active prompt visible with options
- do not hide selection limit
- allow quick reopen without losing passage position

For `summary-completion-list`:

- show the current blank or summary context
- keep the option bank readable
- avoid forcing the student to remember the blank context after opening a detached option list

---

## 8. Result And Review Rules

Teacher review should preserve:

- option labels and texts
- selected options
- selection limit
- grouped shell context for summary-from-list tasks

Saved results should never lose the distinction between:

- single-choice
- multi-select
- summary-from-list

---

## 9. Edge Cases And Prevention

### 9.1 Option Labels Matter

Preserve explicit label format when the material depends on:

- letters
- roman numerals
- numbers

### 9.2 Same Option Bank, Multiple Prompts

Allowed inside one group.

Do not copy the same option bank into every interaction unless the UI needs a local projection.

### 9.3 Summary Shell But No Visible Option Bank

This is not `summary-completion-list`.

It belongs in `summary-completion-text`.
