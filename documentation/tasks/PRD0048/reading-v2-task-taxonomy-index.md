# Reading V2 Task Taxonomy Index

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`

This file freezes the canonical Reading V2 task taxonomy:

- official task-type slugs
- user-facing labels
- V2 engineering family mapping
- normalization of legacy labels and aliases

Use this file when:

- naming a task type in a draft, material, or result
- grouping task types into implementation families
- building search filters in Teacher Lobby
- writing future task-type docs

Do not use legacy parser fallback categories as the new V2 taxonomy.

---

## 1. Why This Index Exists

The repo already contains a canonical 16-type slug set in older type definitions, but those older files also contain category groupings that are not strict enough for Reading V2 implementation planning.

Reading V2 needs two separate concepts:

- official task type
- engineering family

Those are related, but not identical.

Example:

- `summary-completion-list` is officially a completion-flavored IELTS task
- but in Reading V2 it belongs to the `choice` family because the runtime and authoring mechanics are option-picking, not free-text completion

This index resolves those distinctions explicitly.

---

## 2. Authority And Naming Rules

### 2.1 Canonical Slug Rule

All V2 canonical task types must use the exact slugs in section 4.

No draft, material, result, or projection may invent new slugs for the same task without first updating this index.

### 2.2 User-Facing Label Rule

Teacher and student surfaces may use human labels, but storage and internal contracts must use the canonical slug.

### 2.3 Family Rule

Reading V2 engineering families are:

- `completion`
- `choice`
- `binary-judgement`
- `matching`
- `structured-layout`

### 2.4 Legacy Category Rule

Older repo types such as `QuestionCategory` or `IELTSTaskCategory` are historical taxonomy helpers, not authoritative Reading V2 family law.

Notable V2 overrides:

- `short-answer` belongs to the `completion` family in Reading V2
- `summary-completion-list` belongs to the `choice` family in Reading V2
- `table-completion` and `flowchart-completion` belong to the `structured-layout` family in Reading V2
- `diagram-labeling` belongs to the `structured-layout` family in Reading V2

---

## 3. Family Overview

| V2 family | Core mechanic | Typical student action | Included task types |
|---|---|---|---|
| `completion` | Fill a missing value from passage understanding | type answer | sentence, summary-from-text, note, short answer |
| `choice` | Select from visible choices or listed options | tap or select | multiple choice, multiple select, summary-from-list |
| `binary-judgement` | Choose from a locked judgement vocabulary | tap one state | TFNG, YNNG |
| `matching` | Assign one item to another list or reference set | tap-to-assign | headings, information, features, sentence endings |
| `structured-layout` | Answer against a two-dimensional or anchored structure | focus blank or anchor, then answer | table, flowchart, diagram |

---

## 4. Canonical 16-Task Taxonomy

| # | Canonical slug | User-facing label | V2 engineering family | Primary student interaction | Primary structure dependency |
|---|---|---|---|---|---|
| 1 | `sentence-completion` | Sentence Completion | `completion` | free-text answer | inline blanks inside sentence prompts |
| 2 | `summary-completion-text` | Summary Completion From Text | `completion` | free-text answer | summary shell with blanks |
| 3 | `summary-completion-list` | Summary Completion From List | `choice` | choose from list | summary shell plus visible option bank |
| 4 | `note-completion` | Note Completion | `completion` | free-text answer | note shell with blanks |
| 5 | `table-completion` | Table Completion | `structured-layout` | answer focused blanks | table shell with rows, columns, and cell anchors |
| 6 | `flowchart-completion` | Flowchart Completion | `structured-layout` | answer focused blanks | flow steps with ordered anchors |
| 7 | `diagram-labeling` | Diagram Label Completion | `structured-layout` | choose or type labels against hotspots | image or diagram with anchor targets |
| 8 | `true-false-not-given` | True / False / Not Given | `binary-judgement` | choose one judgement | locked response vocabulary |
| 9 | `yes-no-not-given` | Yes / No / Not Given | `binary-judgement` | choose one judgement | locked response vocabulary |
| 10 | `matching-headings` | Matching Headings | `matching` | assign heading to paragraph or section | heading list plus paragraph references |
| 11 | `matching-information` | Matching Information | `matching` | assign statement to paragraph or section | statement list plus paragraph references |
| 12 | `matching-features` | Matching Features | `matching` | assign feature option to items | option set plus target items, often reusable options |
| 13 | `matching-sentence-endings` | Matching Sentence Endings | `matching` | pair sentence stems with endings | stem list plus ending option set |
| 14 | `multiple-choice` | Multiple Choice | `choice` | choose one option | prompt plus single-answer options |
| 15 | `multiple-select` | Multiple Choice Multiple Answer | `choice` | choose more than one option | prompt plus multi-answer options |
| 16 | `short-answer` | Short Answer | `completion` | free-text answer | direct question prompt with answer rule |

---

## 5. Alias And Normalization Table

Use this table when importing or normalizing source content.

| Incoming label or alias | Normalize to | Notes |
|---|---|---|
| Summary completion | `summary-completion-text` or `summary-completion-list` | Must disambiguate by answer mode |
| Summary completion from box | `summary-completion-list` | Option bank visible to student |
| Summary completion from passage | `summary-completion-text` | Answer comes from passage text |
| Notes completion | `note-completion` | Normalize plural label to singular slug |
| Note completion | `note-completion` | Canonical label |
| Diagram labelling | `diagram-labeling` | Normalize British spelling to canonical slug |
| Diagram labeling | `diagram-labeling` | Canonical label |
| Map labelling | `diagram-labeling` | Treated as the same anchored-image mechanic in V2 unless later split explicitly |
| Map labeling | `diagram-labeling` | Same normalization rule |
| Choose two options | `multiple-select` | Preserve selection limit in answer rule |
| Choose two options x2 | `multiple-select` | Usually one grouped task with repeated multi-select interactions |
| Choose three letters | `multiple-select` | Preserve selection limit in answer rule |
| TFNG | `true-false-not-given` | Import shorthand only |
| YNNG | `yes-no-not-given` | Import shorthand only |

Importers must never normalize:

- `summary-completion-list` to `multiple-choice`
- `table-completion` to `sentence-completion`
- `flowchart-completion` to `sentence-completion`
- `diagram-labeling` to generic image question

Those are precisely the flattening failures Reading V2 exists to prevent.

---

## 6. Family Mapping Differences From Older Repo Types

The older repo type files are still useful as terminology evidence, but Reading V2 must use this family mapping instead:

| Canonical slug | Older broad category | Reading V2 family | Why V2 differs |
|---|---|---|---|
| `summary-completion-list` | completion | `choice` | Option-bank behavior drives authoring, mobile, and scoring mechanics |
| `table-completion` | completion | `structured-layout` | Two-dimensional anchors need dedicated runtime and mobile rules |
| `flowchart-completion` | completion | `structured-layout` | Ordered flow anchors need dedicated runtime and mobile rules |
| `diagram-labeling` | completion | `structured-layout` | Anchored image interaction is materially different from text completion |
| `short-answer` | short-answer | `completion` | Free-text extraction and answer-rule behavior align with completion family |
| `true-false-not-given` | true-false | `binary-judgement` | Family name must describe the shared locked-vocabulary mechanic, not one subtype |
| `yes-no-not-given` | true-false | `binary-judgement` | Same reason as above |

---

## 7. Search And Discovery Rules

Teacher search must support:

- official task type
- engineering family
- passage metadata
- ownership and publish state

Search examples:

- `matching-headings`
- `matching`
- `table-completion`
- `structured-layout`
- `summary-completion-list`
- `diagram-labeling`

Search result cards should show both:

- primary official type label
- family badge

This avoids the old problem where grouped materials become hard to discover because only one label system exists.

---

## 8. Taxonomy Use In Results And Analytics

Saved results must preserve:

- official task type
- engineering family
- stable `interactionId`
- visible question number

Analytics should be able to aggregate by:

- full test
- task-group material
- passage asset
- engineering family
- official task type

The family/type split is intentional:

- family helps product and engineering analysis
- official type helps teacher interpretation and content discovery

---

## 9. Companion Docs By Family

The current family docs in the PRD-0048 packet are:

- `documentation/tasks/PRD0048/reading-v2-family-completion.md`
- `documentation/tasks/PRD0048/reading-v2-family-choice.md`
- `documentation/tasks/PRD0048/reading-v2-family-binary-judgement.md`
- `documentation/tasks/PRD0048/reading-v2-family-matching.md`
- `documentation/tasks/PRD0048/reading-v2-family-structured-layout.md`

Use the family doc when deciding:

- editor behavior
- answer rule behavior
- mobile runtime behavior
- review behavior

Use this index when deciding:

- canonical slug
- user-facing label
- family membership
- import normalization

---

## 10. Implementation Guardrails

1. Do not use the old generic slugs `completion` or `matching` as canonical V2 task types.
2. Do not let parser fallback labels leak into published Reading V2 payloads.
3. Do not infer family from the legacy category field when the family is already frozen here.
4. Do not silently collapse structured-layout tasks into plain completion.
5. Do not silently collapse list-based summary tasks into generic multiple choice.

---

## 11. Immediate Follow-On Task-Type Docs

The current source-of-truth packet includes one concise task-type doc per official IELTS Reading type:

- `documentation/tasks/PRD0048/reading-v2-type-sentence-completion.md`
- `documentation/tasks/PRD0048/reading-v2-type-summary-completion-text.md`
- `documentation/tasks/PRD0048/reading-v2-type-summary-completion-list.md`
- `documentation/tasks/PRD0048/reading-v2-type-note-completion.md`
- `documentation/tasks/PRD0048/reading-v2-type-table-completion.md`
- `documentation/tasks/PRD0048/reading-v2-type-flowchart-completion.md`
- `documentation/tasks/PRD0048/reading-v2-type-diagram-labeling.md`
- `documentation/tasks/PRD0048/reading-v2-type-true-false-not-given.md`
- `documentation/tasks/PRD0048/reading-v2-type-yes-no-not-given.md`
- `documentation/tasks/PRD0048/reading-v2-type-matching-headings.md`
- `documentation/tasks/PRD0048/reading-v2-type-matching-information.md`
- `documentation/tasks/PRD0048/reading-v2-type-matching-features.md`
- `documentation/tasks/PRD0048/reading-v2-type-matching-sentence-endings.md`
- `documentation/tasks/PRD0048/reading-v2-type-multiple-choice.md`
- `documentation/tasks/PRD0048/reading-v2-type-multiple-select.md`
- `documentation/tasks/PRD0048/reading-v2-type-short-answer.md`

Each task-type doc inherits:

- the slugs in this index
- the family mapping in this index
- the `TaskGroup` rules in `reading-v2-taskgroup-object.md`
- the runtime and mobile rules in the relevant family doc
