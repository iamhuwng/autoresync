# Reading V2 Page Schema: Studio

This document is part of the PRD-0048 source-of-truth packet.

Authoritative companion docs:

- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`

This file defines the visual and behavioral schema for the Reading V2 Studio.

---

## 1. Purpose

Reading V2 Studio is the only long-lived authoring surface for new Reading V2 content.

It owns:

- manual authoring
- AI-assisted import
- pasted source-text import
- explicitly supported uploaded source-file import
- draft save and resume
- draft review
- published editing through draft revision
- validation
- preview launch
- publish handoff

It does not own:

- lobby discovery
- student runtime delivery
- result review

---

## 2. Route And Mode Ownership

Recommended route family:

- create route
- edit or revision route

Teacher Lobby may also host the same Studio shell through an adapted edit-modal entry. That modal entry is a host for the Studio contract, not a second editor.

The same page shell must support these modes:

- create blank
- create from import
- create from Auto
- resume draft
- published edit revision
- duplicate material
- extract task-group material

Mode support does not mean every authoring affordance is enabled in every mode. Passage-collection controls follow the cardinality boundary in `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.

There must not be:

- a separate long-lived review product
- a separate long-lived published-edit modal with its own editor model
- a second editor with different source-of-truth behavior

---

## 3. Audience And Permission Boundary

Primary audience:

- teacher
- admin or super-admin if platform policy allows

The studio may expose author-only information such as:

- validation errors
- provenance
- import evidence
- unresolved uncertainty
- diff state

None of those author-only artifacts may leak into student-safe delivery payloads.

---

## 4. Visual Schema

```text
+----------------------------------------------------------------------------------+
| Reading V2 Studio                                                                |
| Title | Status | Save Draft | Validate | Preview | Publish | Diff | Exit         |
+----------------------------------------------------------------------------------+
| Mode: Create / Import / Resume / Published Revision                              |
| Tabs: [Stimulus] [Questions] [Settings]                                           |
+--------------------------------------+-------------------------------------------+
| Left column: stimulus and reference  | Right column: task logic and questions    |
| -----------------------------------  | ----------------------------------------  |
| Section outline                      | Task-group list                            |
| Passage assets in scope              | Selected task-group editor                 |
| Selected stimulus editor             | Interaction list                           |
| Paragraph or structure anchors       | Answer-rule editor                         |
| Linked material info                 | Validation panel                           |
| Stimulus preview                     | Question preview / diff                    |
+--------------------------------------+-------------------------------------------+
| Bottom utility rail: warnings | provenance | extraction | import evidence         |
+----------------------------------------------------------------------------------+
```

Warning/review schema update:

```text
Warning pill
  -> click-stable Review issues panel
  -> short issue rows, e.g. Q12: Missing answer
  -> row click navigates to the affected task group/question
  -> affected question/group card highlights and shows inline issue chips
```

The warning pill must not depend on hover for critical information. Hover/title text may be used only as a short hint.

Canonical warning/review contract: `documentation/architecture/reading-v2-studio-review-issues-contract.md`.

---

## 5. Layout Contract

Studio uses a stable two-column authoring shell:

- left = shared reading context
- right = grouped task logic and scored interaction control

Top-level tabs are locked to:

- `Stimulus`
- `Questions`
- `Settings`

Tab law:

1. `Stimulus` emphasizes authoring and organization of shared reading content.
2. `Questions` emphasizes task groups, answer rules, and interactions.
3. `Settings` emphasizes material metadata, publish settings, reuse policy, and launch-facing configuration.
4. Answer-key editing remains inside `Questions`, not in its own top-level tab.

The layout must remain visually stable across modes so teachers are not forced to learn a different interface for import, review, and published revision.

### 5.1 Passage Collection Controls

`Add Passage` and passage removal controls are collection-level affordances, not universal Studio affordances.

Allowed:

- `create-blank`: manual new-test creation from scratch
- `create-from-import`: paste/import output shown in Studio
- `create-from-auto`: Auto V4 output shown in Studio

Not allowed:

- `reading-passage` material revision or manual remake
- published full-test revision
- draft resume
- duplicate material
- extracted task-group material

Individual `reading-passage` Studio is one-passage editing. It may edit the existing passage content and questions, but it must not expose a control that creates Passage 2 inside the same entity.

---

## 6. Test-Making Pipeline Placement

Studio is the editor portion of the larger Reading V2 test-making pipeline.

Pipeline placement rules:

1. Access starts from existing Teacher Lobby, Material Profile, draft-card, or approved Studio routes.
2. Metadata setup must happen before publish and should be visible from Studio as a first-step panel, header/readiness state, or Settings shortcut.
3. The content editor remains the Studio two-column shell.
4. Answer keys and scoring rules live inside `Questions` near the task groups/interactions they govern.
5. Material-level settings live inside `Settings`.
6. Validate and Preview run from Studio and use canonical draft/projection contracts.
7. Publish delegates to the V2 publish pipeline; successful non-revision publish exits Studio to the Teacher Lobby/Materials context, while bounded published-revision follow-up may stay in Studio on a draft revision only.

Metadata is material/package information. It must not become canonical task semantics.

`Settings` must not own homework due dates, assigned students/classes, live session code/state, course placement/order, per-assignment release overrides, or final result release state. Those remain with existing platform features.

---

## 7. Import Contract

Import is an entry path into the same canonical draft model used by manual authoring.

Studio import must support:

- pasted source text
- uploaded source files from an explicitly supported file list
- full-test import
- single `passage + task group` fragment import

Studio import must not create a separate import-only source of truth.

After import:

1. Imported content becomes editable draft content.
2. Import evidence remains inspectable by teachers.
3. Uncertain or unsupported structures become visible repair items.
4. Unresolved uncertainty may remain in a draft, but it is publish-blocking when it affects scored meaning, anchors, numbering, answer rules, or student-visible structure.
5. Unsupported uploaded source files fail closed with a clear repair path instead of being guessed into a draft.

---

## 8. Authoring Interaction Contract

Studio must expose these authoring mechanics explicitly:

- structure outline for sections, stimuli, task groups, and interactions
- main editing surface for the selected stimulus or task group
- passage collection changes only in the allowed new-test/import/Auto creation modes
- contextual properties for the selected canonical object
- reorder controls for top-level task groups and linked stimuli
- direct editing for grouped instructions
- direct editing for answer rules
- direct repair controls for broken anchors, unresolved placeholders, and import uncertainty

Reordering must preserve stable object IDs when the object meaning is unchanged.

Editing grouped instructions or answer rules must write into the canonical draft, not into renderer-only display fields.

---

## 9. Tab-Specific Focus Behavior

### 9.1 Stimulus Tab

Primary left-column responsibilities:

- section and stimulus outline
- passage asset selection
- passage editing
- paragraph and anchor map
- structured stimulus editing for tables, flowcharts, and diagrams

Primary right-column responsibilities:

- read-only linked task-group summary
- which groups depend on the selected stimulus
- quick warnings about broken anchor relationships

### 9.2 Questions Tab

Primary left-column responsibilities:

- read-only or lightly editable stimulus reference
- paragraph or anchor highlighting
- selected passage context

Primary right-column responsibilities:

- task-group list
- selected task-group editing
- interaction ordering
- answer-rule configuration
- answer-key configuration
- question preview
- validation status

Table-completion groups require a dedicated grouped table builder inside the selected task-group editor.

Teacher-facing table-completion behavior:

```text
Choose Table Completion
  -> create or paste table
  -> edit rows, columns, headers, and body cells
  -> mark blank cells
  -> fill correct answers beside those blanks
  -> preview the student table view
```

The teacher must not need to know or type internal table-cell anchors, canonical IDs, schema version, or projection terms. The builder writes table rows/cells to the linked table stimulus, blank cells to table-cell anchors, and answer keys to the linked interactions.

Expected builder layout:

```text
+-----------------------------------+-----------------------------------+
| Table Builder                     | Blank & Answer Panel              |
| - table title                     | - Q number derived by Studio      |
| - paste table                     | - linked cell context             |
| - editable grid                   | - correct answers                 |
| - add/remove rows and columns     | - word limit / answer settings    |
| - blank toggles per cell          | - remove blank                    |
+-----------------------------------+-----------------------------------+
```

This replaces flat question-card editing as the primary teacher-facing path for `table-completion`. Generic interaction controls may remain available in Advanced / Developer Details for debugging only.

### 9.3 Settings Tab

Primary left-column responsibilities:

- document context summary
- material kind and provenance reference
- where-used and dependency reference if relevant

Primary right-column responsibilities:

- title and metadata
- publish and visibility settings
- reuse and extraction settings
- revision summary
- publish readiness summary

Settings must not expose assignment, course, live-session, or result-release controls as canonical material settings. It may show links or summaries that take the teacher to the owning platform feature.

---

## 10. Data And State Contract

The Studio page owns:

- current draft or revision
- selected section
- selected stimulus
- selected task group
- validation state
- import evidence state
- diff state
- preview launch parameters

The Studio page does not own:

- final published attempt state
- result review state
- Teacher Lobby card/list state
- homework assignment target state
- live session code/state
- course placement/order
- final result release state

Stable draft state must preserve:

- object IDs
- anchor IDs
- unresolved placeholders
- validation severity
- provenance
- import evidence

---

## 11. Required Actions And Transitions

Studio must support:

- fill or confirm metadata
- save draft
- edit answer keys and scoring rules inside `Questions`
- edit material-level settings inside `Settings`
- validate
- open preview
- publish
- discard changes with confirmation
- create or inspect extraction
- inspect provenance
- inspect import evidence
- open review issues
- navigate from a review issue to the affected question or task group
- leave and return without losing stable draft identity

Published-edit behavior is locked:

- opening a published item must create or resume a draft revision
- the currently published version stays live until republish
- no direct hot-edit path exists for live published Reading V2 content

Post-publish navigation is locked:

- successful non-revision publish exits Studio to the existing Teacher Lobby/Materials shell
- the returned shell becomes the place where the just-published test is re-entered through normal material-card/list actions
- further edits after publish require explicit revision plus republish
- published-revision follow-up may stay in Studio only for bounded draft-revision actions

Obsolete interpretation retired 2026-06-15: "publish returns to the caller context" when that caller is still the same active Studio shell for create/import-style flows. That behavior is stale because it hides the boundary between draft editing and already-split published entities.

Preview behavior is locked:

- preview must launch the real Reading V2 runtime contract
- preview uses local-only answer state
- preview does not write live session, practice, or homework attempts
- preview does not write permanent results or assignment/session/course records

---

## 12. Forbidden Patterns

Studio must not:

- use a free-placement canvas as the source of truth
- split create, review, and revision into separate long-lived apps
- add a separate top-level answer-key tab
- make answer-key modal state a second source of truth
- let `Settings` become a second hidden editor for task logic
- store assignment/session/course/result-release ownership state inside material settings
- allow direct edits to the currently live published object
- allow unresolved placeholders to publish
- treat AI import output as trusted without explicit validation and repair
- store imported content in a separate import-only model after draft creation

---

## 13. Related Docs

- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/reading-v2-feature-pipeline-matrix.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
