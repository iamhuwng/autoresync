# Reading V2 Task Type UI Component Mockup Spec

Source design gates:
- `DESIGN.md`
- `documentation/samples/IELTS-reading-question-type-display-design.md`

Purpose: improved UI component breakdown for IELTS Reading V2 task-type displays. These components are mockup-level building blocks, not yet production implementation tasks.

## Design Direction

- Keep exam runtime paper-like: white answer surface, gray instruction band, thin borders, compact rhythm.
- Use blue only for answer focus/selection, not decoration.
- Use consistent question badges across every answer surface.
- Keep reference material visible beside or above answers, never repeated per question.
- Use one group-level renderer per task family; avoid per-question cards for structural groups.
- Keep mobile viable by allowing banks and structured surfaces to stack.

## Component Inventory

### `ReadingTaskFrame`

Wraps one question group.

Props:
- `rangeLabel`: `Questions 1-4`
- `taskLabel`: `Matching headings`
- `answeredCount`
- `totalCount`
- `instructions`
- `children`

Responsibility:
- Own group header, instruction strip, progress count, and vertical rhythm.
- Never know task-specific answer logic.

### `InstructionStrip`

Plain instruction surface.

Props:
- `rangeLabel`
- `primaryInstruction`
- `secondaryInstruction`
- `note`

Responsibility:
- Show official IELTS instruction copy.
- Support compact multi-line instructions without icons or decoration.

### `QuestionBadge`

Number marker used inline, in tables, in diagrams, and rows.

Props:
- `number`
- `state`: `empty | answered | active`

Responsibility:
- Keep numbers visually stable and easy to scan.
- Same 28px square footprint everywhere.

### `InlineBlank`

Completion input embedded inside sentence/summary/note text.

Props:
- `questionNumber`
- `value`
- `wordLimit`
- `ariaLabel`
- `onChange`
- `onClear`

Responsibility:
- Maintain reading flow while making answer target obvious.
- Input width scales by word limit, with min/max guard.

### `InlineSelectBlank`

Dropdown embedded in summary/list text.

Props:
- `questionNumber`
- `options`
- `selectedOptionId`
- `disabledOptionIds`
- `onChange`

Responsibility:
- Used for no-reuse option banks.
- Shows question number and selected letter without breaking line rhythm.

### `ReferenceBank`

Shared option/heading/feature/endings bank.

Props:
- `title`
- `columns`
- `items`: `{ id, label, text, state }[]`
- `reuseMode`: `allowed | blocked`

Responsibility:
- Render once per group.
- Mark used options clearly when reuse is blocked.

### `ChoiceOption`

Radio/checkbox row for choice-family tasks.

Props:
- `label`
- `text`
- `checked`
- `disabled`
- `variant`: `radio | checkbox`

Responsibility:
- Full-width touch target.
- Clear selected border/fill with native input still visible.

### `SegmentedAnswerGroup`

TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN control.

Props:
- `questionNumber`
- `statement`
- `options`
- `selected`

Responsibility:
- Preserve exact vocabulary for factual vs opinion judgement.
- Keep three choices equal width on desktop, stacked on narrow screens.

### `MatchingAssignmentRow`

Question row plus answer selector for matching families.

Props:
- `questionNumber`
- `prompt`
- `targetLabel`
- `options`
- `selectedOptionId`
- `selectorType`: `select | chips`
- `reuseMode`

Responsibility:
- Keep prompt, target, and answer control in one scannable row.
- Use select for large banks; chips for small feature banks.

### `SummarySurface`

Group-level summary paragraph.

Props:
- `title`
- `segments`
- `blankRenderer`

Responsibility:
- Natural paragraph flow.
- No repeated question cards.

### `NoteCompletionSurface`

Structured note block.

Props:
- `title`
- `sections`
- `blankRenderer`

Responsibility:
- Preserve headings, bullets, indentation, and blank positions.

### `StructuredTableSurface`

Table completion display.

Props:
- `caption`
- `columns`
- `rows`
- `blankCells`

Responsibility:
- Inputs live inside blank cells.
- Horizontal overflow on narrow screens.

### `FlowchartSurface`

Flowchart completion display.

Props:
- `steps`
- `orientation`: `vertical | horizontal`
- `blankRenderer`

Responsibility:
- Preserve process order and arrows.
- Blank steps look like answer targets, not detached rows.

### `DiagramLabelSurface`

Diagram/image labelling display.

Props:
- `image`
- `hotspots`
- `blankRenderer`

Responsibility:
- Place answer target near hotspot.
- Provide fallback list if image/hotspot data missing.

### `ShortAnswerRow`

Direct question plus answer field.

Props:
- `questionNumber`
- `prompt`
- `wordLimit`
- `value`

Responsibility:
- Wider input than inline completion.
- Show concise word-limit helper.

## Task Type To Component Map

| Task type | Primary surface | Shared components |
|---|---|---|
| Sentence completion | `SummarySurface` line variant | `InstructionStrip`, `InlineBlank`, `QuestionBadge` |
| Summary completion text | `SummarySurface` | `InlineBlank`, `ReferenceBank` not used |
| Summary completion list | `SummarySurface` | `InlineSelectBlank`, `ReferenceBank` |
| Note completion | `NoteCompletionSurface` | `InlineBlank`, `QuestionBadge` |
| Table completion | `StructuredTableSurface` | `InlineBlank`, `QuestionBadge` |
| Flowchart completion | `FlowchartSurface` | `InlineBlank`, `QuestionBadge` |
| Diagram labelling | `DiagramLabelSurface` | `InlineBlank`, `QuestionBadge` |
| True/False/Not Given | statement list | `SegmentedAnswerGroup` |
| Yes/No/Not Given | statement list | `SegmentedAnswerGroup` |
| Matching headings | assignment list | `ReferenceBank`, `MatchingAssignmentRow` |
| Matching information | assignment list | `ReferenceBank`, `MatchingAssignmentRow` |
| Matching features | assignment list | `ReferenceBank`, `MatchingAssignmentRow` |
| Matching sentence endings | assignment list | `ReferenceBank`, `MatchingAssignmentRow` |
| Multiple choice | choice list | `ChoiceOption` |
| Multiple select | choice list | `ChoiceOption`, selection counter |
| Short answer | direct rows | `ShortAnswerRow` |

## Files Likely To Receive Production Extraction

- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.css`
- New candidate folder: `src/components/reading-v2/runtime/task-type-components/`

Suggested split:
- `ReadingTaskFrame.tsx`
- `InstructionStrip.tsx`
- `CompletionSurfaces.tsx`
- `ReferenceBank.tsx`
- `ChoiceControls.tsx`
- `MatchingControls.tsx`
- `StructuredSurfaces.tsx`

## Mockup Artifact

Visual mockups live in:
- `documentation/tasks/PRD0048/design/reading-v2-task-type-ui-mockups.html`
