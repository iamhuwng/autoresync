# Reading V2 Family: Binary Judgement

This document defines the `binary-judgement` family for Reading V2.

Companion docs:

- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`

This family covers tasks where every interaction uses one locked judgement vocabulary.

---

## 1. Included Official Task Types

- `true-false-not-given`
- `yes-no-not-given`

---

## 2. Why This Family Exists

Older repo types grouped these under a `true-false` category, but Reading V2 needs a family name that describes the real shared mechanic:

- one locked response vocabulary
- one state chosen per interaction
- high risk if the wrong vocabulary is mixed into the wrong task group

That is why the family name is `binary-judgement`, not `true-false`.

---

## 3. Student Experience

What the student sees:

- one instruction block
- one locked vocabulary for the entire group
- one statement or claim per interaction

What the student does:

- read the passage
- judge the statement against the locked vocabulary

---

## 4. Visual Schema

```text
+--------------------------------------+-------------------------------------------+
| Left: passage                        | Right: binary-judgement group             |
|                                      | - instructions                            |
|                                      | - visible vocabulary header               |
|                                      | - statements                              |
|                                      | - one selector per statement              |
+--------------------------------------+-------------------------------------------+
```

Phone behavior:

- keep the vocabulary visible in the answer layer
- do not require memory of whether the group is TFNG or YNNG

---

## 5. Shared TaskGroup Requirements

Every binary-judgement `TaskGroup` must define:

- official task type
- `binary-judgement` family
- explicit judgement vocabulary
- one interaction per statement

Forbidden:

- mixing TFNG and YNNG inside one group
- relying on the student to infer the vocabulary from one short label hidden at the top of the page

---

## 6. Type-Specific Notes

### 6.1 `true-false-not-given`

Vocabulary:

- True
- False
- Not Given

Use when the task is about factual consistency with the passage.

### 6.2 `yes-no-not-given`

Vocabulary:

- Yes
- No
- Not Given

Use when the task is about the writer's views, claims, or opinions.

Critical rule:

- do not normalize this into TFNG

The vocabulary difference is meaningful and must survive import, authoring, scoring, and review.

---

## 7. Mobile Rules

Phone contract:

- keep the active statement visible
- keep the vocabulary visible
- use compact but obvious single-select controls
- preserve passage position when opening and closing answer entry

---

## 8. Result And Review Rules

Teacher review should show:

- the group vocabulary
- the student-selected judgement
- the correct judgement
- the relevant statement text

This family is simple structurally, but highly sensitive to instruction correctness. Wrong vocabulary means wrong assessment.

---

## 9. Edge Cases And Prevention

### 9.1 Import Cannot Tell TFNG vs YNNG

Mark it unresolved and publish-blocking until the teacher confirms.

### 9.2 Mixed Vocabulary In Source Material

Split into separate task groups.

### 9.3 Reviewer Sees Only Flat Question Row

Avoid as default.

The teacher must be able to see the group-level vocabulary context.
