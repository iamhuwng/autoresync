# Reading V2 Runtime And Preview Notes

Updated: 2026-05-01

## Preview Contract

Teacher preview still uses `ReadingV2PreviewOverlay`, which renders the same projection-only `ReadingV2RuntimeShell` used by student runtime surfaces. Preview keeps local-only answer state and does not create attempts, sessions, homework records, assignments, or results.

Preview is intentionally not gated by publish readiness. Teachers can preview incomplete drafts to check layout and wording, while Publish remains blocked by validation until the test is complete and safe.

Completion-family editors now block publish when a prompt lacks a visible blank marker such as `[blank]` or `___`. Preview can still open incomplete drafts, but the validation panel must show the missing marker before a teacher can publish that wording into student runtime.

## Active Task-Type Runtime Coverage

The active Build Workspace task editors produce canonical task groups that project into existing runtime response shapes:

- completion and short-answer tasks use free-text controls
- Multiple Choice and Summary Completion from List use single-choice controls
- Multiple Selection uses multi-select controls
- True / False / Not Given and Yes / No / Not Given use binary judgement controls
- Matching task types use matching controls with projected option sets
- Table Completion uses structured-entry controls plus the table overview

Multiple Selection progress is complete only when the student selects the configured number of choices. Partial selections remain preserved for timed auto-submit payloads, but review counts and question chips do not mark the item answered until the selection count is satisfied.

## Table Completion Runtime Update

Runtime table rendering now honors persisted `rowSpan` and `colSpan`. Merged blank cells render all attached question-number chips from `anchorIds`, so preview and student runtime match the saved table model.

The teacher table toolbar writes selected blank cells, merged cells, split cells, row/column changes, and header-row roles into the same persisted table content that runtime consumes.

## Deferred Runtime Gaps

Flowchart Completion and Diagram Labelling still have projection fixture support and generic structured overview rendering, but teacher-facing authoring stays inactive until the full authoring, persistence, preview, publish, and student runtime path is ready. Diagram remains blocked on durable image persistence.
