# Reading V2 Validation Notes

Updated: 2026-05-01

## Teacher-Readable Publish Blocking

Build Workspace validation continues to convert blocking issues into teacher-readable messages instead of exposing schema terms. The visible validation panel describes what needs attention before publishing.

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
