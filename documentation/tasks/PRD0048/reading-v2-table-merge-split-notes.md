# Reading V2 Table Completion Merge/Split Notes

Updated: 2026-05-01

## Durable Table Cell Model

Reading V2 table cells now support:

- `cellId`: stable persisted cell identity.
- `rowSpan`: durable row span for merged cells.
- `colSpan`: durable column span for merged cells.
- `anchorId`: first blank/question anchor for backward-compatible single-anchor reads.
- `anchorIds`: all blank/question anchors owned by a cell, including merged cells with multiple blanks.
- `isBlank`: marks cells that own one or more scored blank anchors.

Merge/split is data-model behavior, not CSS-only layout.

## Authoring Behavior

The Table Completion Builder supports:

- Stitch-aligned compact toolbar above the table grid
- rectangular cell selection using persisted `cellId` values
- merge selected cells
- split selected merged cell
- row and column add/remove
- selected-cell blank marking and blank clearing
- first-row header marking
- cell text editing
- header/body role editing
- blank toggles
- answer entry for every blank anchor
- question-number display for blank anchors

A merge is allowed only when selected visible cells form one complete rectangle. The merged cell keeps the top-left cell identity and stores the selected rectangle size in `rowSpan` and `colSpan`.

When blank cells are merged, all blank anchors are preserved in `anchorIds`. When a merged cell is split, anchors are distributed back across generated cells in row-major order so question links survive the split.

Row and column removal is blocked when a merged cell crosses the row or column being removed. The builder shows visible teacher-readable status copy explaining that the affected merged cell must be split before removal.

The authoring table now renders question chips inside blank cells. Merged blank cells show all attached question chips, so teachers can verify merge/split behavior before previewing.

The toolbar actions are not presentation-only. Add/remove row/column, merge, split, selected blank marking, selected blank clearing, and header-row marking all commit through the canonical table rebuild path so preview, publish, and student runtime receive the same persisted `cellId`, `rowSpan`, `colSpan`, `anchorId`, and `anchorIds` data.

## Runtime Behavior

Preview and student runtime render table cells with real `rowSpan` and `colSpan`. If a merged blank cell owns multiple anchors, the runtime renders all attached question-number chips inside that cell.

## Validation

Publish is blocked when table data is not durable or cannot render safely:

- missing `cellId`
- duplicate `cellId`
- invalid `rowSpan` or `colSpan`
- overlapping merged cells
- blank cell without an anchor/question link
- question interaction linked to an anchor that is not present in a blank table cell

## Current Limits

- Merge/split operates on visible rectangular cell selections, not arbitrary non-rectangular regions.
- Removing rows or columns is guarded for merged cells crossing the last row or column; publish validation remains the final safety gate for any malformed imported or legacy table data.
- Flowchart and diagram structured-layout editing remains inactive until runtime and persistence are complete.
