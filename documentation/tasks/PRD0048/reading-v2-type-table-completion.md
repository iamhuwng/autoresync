# Reading V2 Type: Table Completion

Official slug: `table-completion`
Engineering family: `structured-layout`

Companion docs:

- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-family-structured-layout.md`
- `documentation/tasks/0047-prd-ielts-reading-table-completion-canonical-pipeline.md`

## Definition

Students complete a structured table whose meaning depends on rows, columns, headers, and anchored cell blanks.

## Student Surface

- one table shell
- shared instruction and answer rule
- numbered blanks attached to table cells

## TaskGroup Requirements

- explicit row and column structure
- explicit cell anchors
- grouped validation for shell and anchors
- teacher-facing grouped table builder in Studio; teachers must not author tables through isolated flat question cards

## AnswerRule Essentials

- word limit
- input mode
- anchor binding requirement
- accepted answers edited per blank inside the table-completion group

## Mobile Note

Use the zoomable overview plus synchronized answer-entry contract, not tiny inline inputs inside the live table by default.

## Failure To Prevent

Do not reconstruct headers or cell structure from flat question text.

## Teacher-Facing Studio Workflow

Teachers should experience `table-completion` as a small table builder, not as schema editing.

```text
Add Question Group
  -> Table Completion
  -> Create or paste table
  -> Mark blank cells
  -> Fill correct answers
  -> Preview
  -> Publish
```

### Required UI Behavior

- `Add Question Group -> Table Completion` creates one grouped exercise with a starter table.
- The selected group shows a dedicated `Table Completion Builder`.
- The builder exposes plain controls:
  - `Table title`
  - `Paste table from spreadsheet`
  - a compact table toolbar above the grid
  - editable table cells
  - row and column controls
  - merge/split controls
  - selected-cell blank marking
  - header-row marking
  - `Blank` toggles for cells
  - per-blank `Correct answers`
  - group-level word limit and answer settings
- Marking a cell as `Blank` creates or preserves the linked scored question for that cell.
- Removing a blank removes the linked scored question only after the teacher action is explicit.
- Numbering is derived from group order and blank order. Teachers do not type final IELTS question numbers as identity.
- Preview must render the real student table view from the current draft.

### Live Reading V2 Schema Mapping

The teacher-facing builder writes to the current Reading V2 canonical model:

| Teacher Concept | Canonical Field |
|---|---|
| Table title | `stimuli[stimulusId].title` |
| Table rows and cells | `stimuli[stimulusId].content.kind = table-content` |
| Header/body/note role | table cell `role` |
| Blank cell | table cell `isBlank = true` plus `anchorId` |
| Question for a blank | `interactions[interactionId]` with `responseShape.kind = structured-entry` |
| Blank-to-question link | `interaction.primaryAnchorId` |
| Group blank order | `taskGroup.interactionIds` |
| Table link | `taskGroup.stimulusRefs[0]` |
| Correct answers | `interaction.scoringRule.acceptableAnswers` |
| Word limit | `taskGroup.answerRule.wordLimit` |

Advanced schema details such as anchor IDs, revision hashes, provenance, and raw canonical validation remain hidden in Advanced / Developer Details.

### Convenience And Customization

The default path should require the fewest steps:

1. Paste or start with a starter table.
2. Click blank cells.
3. Enter answers.

Customization should remain close at hand:

- add row
- add column
- remove row
- remove column
- edit each cell
- set cell role
- paste a TSV or Markdown-style table
- repair answer keys without leaving the group

The current live schema supports one scored blank per table cell. If a source table contains multiple blanks inside one cell, the teacher-facing first phase should guide the teacher to split that content into separate cells or rows until a segmented table-cell schema is introduced.

## 2026-05-01 Update: Merge/Split Support

The current Reading V2 canonical table cell content supports durable merge/split data:

| Teacher Concept | Canonical Field |
|---|---|
| Stable cell identity | table cell `cellId` |
| Merged rows | table cell `rowSpan` |
| Merged columns | table cell `colSpan` |
| First blank link | table cell `anchorId` |
| All blank links in a merged cell | table cell `anchorIds` |
| Merged blank cell | `isBlank = true` plus one or more anchors |

The builder now supports rectangular selection, merge selected cells, split selected merged cell, and preservation of blank/question links through merge and split. Preview and student runtime render `rowSpan`/`colSpan` and show every question number attached to a merged blank cell.

The teacher-facing controls are grouped in a Stitch-aligned toolbar above the table. Add/remove row/column, merge, split, mark selected blank, clear selected blanks, header row, and clear selection all save through the canonical table rebuild path.

Publish validation blocks missing `cellId`, duplicate cells, invalid spans, overlapping merged cells, blank cells without anchors, and questions not linked to blank table cells.

The previous statement that the live schema supports only one scored blank per table cell is now superseded for Reading V2 table cells: merged cells can own multiple blank anchors through `anchorIds`.
