# Reading V2 Family: Structured Layout

This document defines the `structured-layout` family for Reading V2.

Companion docs:

- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`

This family covers tasks whose meaning depends on a two-dimensional or anchored structure that must not be flattened into sentence-like questions.

---

## 1. Included Official Task Types

- `table-completion`
- `flowchart-completion`
- `diagram-labeling`

---

## 2. Why This Family Exists

These task types break when the system assumes everything is just a line of text with a blank.

Shared properties:

- explicit anchors matter
- structure matters to comprehension
- mobile behavior cannot just copy desktop inline rendering

This family exists to prevent:

- runtime reconstruction from flat strings
- silent fallback to sentence completion
- unusable mobile layouts

---

## 3. Student Experience

What the student sees:

- one structured shell
- grouped instructions and answer rule
- numbered blank or target interactions attached to the shell

What the student does:

- understand the structure
- focus an anchor or blank
- answer against the correct structural location

---

## 4. Visual Schema

### 4.1 Desktop And Tablet

```text
+--------------------------------------+-------------------------------------------+
| Left: passage                        | Right: structured-layout task group       |
|                                      | - instructions                            |
|                                      | - structured shell                        |
|                                      | - highlighted active blank or target      |
|                                      | - answer control                          |
+--------------------------------------+-------------------------------------------+
```

### 4.2 Phone

```text
+--------------------------------------------------------------+
| Passage-first phone shell                                    |
+--------------------------------------------------------------+
| Sticky question strip                                        |
+--------------------------------------------------------------+
| Primary pane: passage or structured overview                 |
+--------------------------------------------------------------+
| Answer layer: focused blank or target                        |
| - synchronized with overview                                 |
| - preserves place                                            |
+--------------------------------------------------------------+
```

---

## 5. Shared TaskGroup Requirements

Every structured-layout `TaskGroup` must define:

- official task type
- `structured-layout` family
- explicit shell structure
- explicit anchors
- answer rule
- ordered interactions

Forbidden:

- reconstructing shell structure from question text heuristics
- shipping student runtime from flat fallback strings

---

## 6. Type-Specific Notes

### 6.1 `table-completion`

Shell:

- rows
- columns
- cell anchors

Rules:

- cell identity must be explicit
- headers and row labels must be preserved
- answer blanks map to cell anchors, not to detached text guesses

Phone contract:

- use a read-only zoomable table overview
- do not place tiny live inputs inside the zoomable table by default
- pair the overview with synchronized answer entry
- tap-to-center and highlight the active blank

### 6.2 `flowchart-completion`

Shell:

- ordered steps
- directional or logical sequence
- step anchors

Rules:

- preserve flow order explicitly
- anchors belong to the shell, not to detached prompt lines

Phone contract:

- show a simplified structural overview
- answer through focused step-based entry controls
- keep flow order obvious during navigation

### 6.3 `diagram-labeling`

Shell:

- image or diagram asset
- labeled or unlabeled targets
- hotspot anchors

Rules:

- target areas must be explicit anchors
- label bank or label input mode must be explicit

Phone contract:

- zoomable image interaction
- large target areas
- structured label-picking alternative
- no tiny precise drag requirement

---

## 7. Shared AnswerRule Patterns

Typical structured-layout answer-rule fields:

- `wordLimit`
- `inputMode`
- `labelSource`
- `selectionLimit`
- `anchorBindingRequired`

The answer rule must say whether the student:

- types text
- chooses from a list
- assigns labels to hotspots

---

## 8. Result And Review Rules

Saved results must preserve:

- `interactionId`
- `taskGroupId`
- `displayNumber`
- `anchorRef`
- student answer
- correct answer

Teacher review must preserve enough shell context that the teacher can reconstruct what structural target the student answered.

Forbidden:

- flat result rows that lose anchor identity

---

## 9. Extraction And Reuse Rules

When structured-layout materials are extracted:

- copy the shell
- copy anchors with new identities
- preserve provenance
- preserve answer rules

If the copied shell is materially rewritten:

- create a derivative asset or version
- do not hot-edit the original shared asset silently

---

## 10. Edge Cases And Prevention

### 10.1 Shell Exists But Anchors Do Not

Publish-blocking error.

### 10.2 Imported Table Looks Textual

Do not downgrade automatically to sentence completion.

Require teacher confirmation or repair.

### 10.3 Diagram Has Image But No Targets Yet

Allowed in draft.

Publish-blocking until targets are defined or the task is retyped.
