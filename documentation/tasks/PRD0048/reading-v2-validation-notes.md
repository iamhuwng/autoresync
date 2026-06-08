# Reading V2 Validation Notes

Updated: 2026-05-01

## Teacher-Readable Publish Blocking

Build Workspace validation continues to convert blocking issues into teacher-readable messages instead of exposing schema terms. The visible validation panel describes what needs attention before publishing.

## Review Issues UX Contract

Canonical contract: `documentation/architecture/reading-v2-studio-review-issues-contract.md`.

The topbar warning pill opens a click-stable `Review issues` panel. The pill count must equal the visible actionable rows in the panel.

Teacher-facing issue rows use this shape:

```text
Q<number>: <short issue type>
Questions <start>-<end>: <short issue type>
```

Examples:

- `Q12: Wrong judgement vocabulary`
- `Q18: Missing answer-key row`
- `Questions 31-35: Question text changed`
- `Questions 9-13: Table cell missing`

Default severity mapping:

- `publish-blocker`: blocks publish and requires teacher edit before publish.
- `needs-review`: Auto V4/source verifier issue that can enter Studio and be repaired or accepted by the teacher.
- `info`: provenance, source-ledger note, or successful repair evidence.

Real import incidents are regression fixtures. They must not become canonical behavior definitions for one test, one question range, one answer vocabulary, or one table shape.

Deprecated: full warning details hidden in hover/title tooltip. Replacement: stable Review Issues panel plus inline issue chips on affected question groups.

## Active Editor Validation

Active task-type editors must provide enough data to save, preview, publish, and render in the student runtime. For active task types, publish remains blocked by the shared Reading V2 validation gate when required prompts, option text, answer keys, anchors, or canonical ownership are missing.

Multiple Selection teacher validation requires the number of correct answers to match the configured choice count. Student runtime progress uses the same count, so a one-of-two partial response is preserved but not marked complete.

Completion-family task editors now surface blank-marker readiness in the authoring UI. Teachers can insert a visible `[blank]` marker from the row itself. Publish validation also blocks Sentence Completion, Summary Completion from Text, Summary Completion from List, and Note Completion prompts that do not include a visible blank marker such as `[blank]` or `___`, so preview/runtime text cannot silently omit the answer location.

## Table Completion Validation

Table Completion adds structured validation for merged/blank table data:

- every persisted table cell needs a stable `cellId`
- table cell IDs must be unique
- `rowSpan` and `colSpan` must be positive
- merged cells must not overlap
- every blank cell must link to at least one question anchor
- every Table Completion question interaction must link back to a blank table cell

These checks prevent publishing table layouts that could save successfully but fail or drift in preview/student runtime.

## Deferred Task Types

Flowchart Completion and Diagram Labelling remain inactive in the teacher-facing Add Question Group modal. Because they are not visible active editor paths, they are not presented as publishable authoring workflows in this phase.
