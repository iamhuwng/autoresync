# Reading V2 Family: Matching

This document defines the `matching` family for Reading V2.

Companion docs:

- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`

This family covers tasks where the student assigns one item to another list or reference set.

---

## 1. Included Official Task Types

- `matching-headings`
- `matching-information`
- `matching-features`
- `matching-sentence-endings`

---

## 2. Student Experience

Matching tasks have the same high-level mechanic:

- there is a target set
- there is a source option or reference set
- each interaction assigns one target to one source choice

What changes by subtype is what the source set means:

- headings
- paragraph references
- feature options
- sentence endings

---

## 3. Visual Schema

### 3.1 Desktop And Tablet

```text
+--------------------------------------+-------------------------------------------+
| Left: passage or target context      | Right: matching task group                |
| - paragraphs or source content       | - instructions                            |
|                                      | - source option/reference set             |
|                                      | - target items                            |
|                                      | - assignment controls                     |
+--------------------------------------+-------------------------------------------+
```

### 3.2 Phone

```text
+--------------------------------------------------------------+
| Passage-first phone shell                                    |
+--------------------------------------------------------------+
| Sticky question strip                                        |
+--------------------------------------------------------------+
| Primary pane: passage or paragraph context                   |
+--------------------------------------------------------------+
| Answer layer: active target plus assignable choices          |
| - tap-to-assign                                              |
| - fast reassignment                                          |
+--------------------------------------------------------------+
```

Drag-and-drop is not the primary mobile pattern for this family.

---

## 4. Shared TaskGroup Requirements

Every matching-family `TaskGroup` must define:

- official task type
- `matching` family
- target item set
- option or reference set
- option reuse rule
- displayed label format where relevant

Common shared needs:

- explicit option-set structure
- explicit target structure
- clear reuse law

---

## 5. Type-Specific Notes

### 5.1 `matching-headings`

Source set:

- heading list, often labeled with roman numerals

Target set:

- paragraphs or sections

Rules:

- preserve heading order and labels
- preserve paragraph references

Common failure to prevent:

- turning paragraph references into plain text with no stable target identity

### 5.2 `matching-information`

Source set:

- paragraphs or sections in the passage

Target set:

- statements or information items

Rules:

- paragraph references must stay explicit
- matching control must make it obvious which paragraph label is being assigned

### 5.3 `matching-features`

Source set:

- a feature option list such as names, categories, or groups

Target set:

- statements or items to match

Rules:

- option reuse is often allowed
- reuse law must be explicit

### 5.4 `matching-sentence-endings`

Source set:

- ending options

Target set:

- sentence stems

Rules:

- option reuse is usually disallowed
- stem text must remain visible enough to understand the pairing

---

## 6. Shared AnswerRule Patterns

Typical answer-rule fields:

- `optionLabelFormat`
- `optionReuse`
- `selectionMode: one-per-target`
- `targetType`

The family must never guess option reuse from the UI alone.

---

## 7. Mobile Rules

Phone contract:

- use tap-to-assign
- allow fast reassignment
- keep the active target visible
- preserve enough passage context when matching against paragraph references

Do not use tiny drag handles or complex spatial rearrangement.

---

## 8. Result And Review Rules

Teacher review should preserve:

- target item
- chosen source option or paragraph reference
- correct mapping
- reuse law where relevant

For matching-information and matching-headings, review should keep paragraph context visible enough that the teacher can understand the target relationship.

---

## 9. Edge Cases And Prevention

### 9.1 Reuse Law Missing

Publish-blocking if the task type requires the system to know whether reuse is allowed.

### 9.2 Paragraph Labels Lost In Import

Publish-blocking until paragraph or section references are repaired.

### 9.3 Matching Group Too Large For Phone

Allowed to use a focused target-first mobile interaction, but do not lose target/source identity.
