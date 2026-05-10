import { describe, expect, it } from 'vitest';

import {
  addTableCompletionRow,
  deleteTableCompletionRow,
  insertBlankAnchorInCell,
  mergeTableCompletionCell,
  removeBlankAnchor,
  splitTableCompletionCell,
} from './tableCompletionRepair';

const createGroup = () => ({
  schemaVersion: 1 as const,
  groupId: 'table-group-1',
  taskType: 'table-completion' as const,
  passageId: 'passage-1',
  questionRange: { start: 18, end: 18 },
  sharedContent: {
    instructionText: 'Complete the table below.',
    answerRuleText: 'Choose NO MORE THAN TWO WORDS.',
    constraints: { maxWords: 2 },
    caption: 'Medicinal plants',
  },
  columns: [
    { columnId: 'column-1', order: 0 },
    { columnId: 'column-2', order: 1 },
  ],
  rows: [
    { rowId: 'row-header-1', order: 0, cellIds: ['cell-header-1', 'cell-header-2'] },
    { rowId: 'row-1', order: 1, cellIds: ['cell-row-header', 'cell-1'] },
  ],
  cells: [
    {
      cellId: 'cell-header-1',
      rowId: 'row-header-1',
      columnId: 'column-1',
      rowSpan: 1,
      colSpan: 1,
      role: 'column-header' as const,
      segments: [{ kind: 'text' as const, text: 'Plant' }],
    },
    {
      cellId: 'cell-header-2',
      rowId: 'row-header-1',
      columnId: 'column-2',
      rowSpan: 1,
      colSpan: 1,
      role: 'column-header' as const,
      segments: [{ kind: 'text' as const, text: 'Region' }],
    },
    {
      cellId: 'cell-row-header',
      rowId: 'row-1',
      columnId: 'column-1',
      rowSpan: 1,
      colSpan: 1,
      role: 'row-header' as const,
      segments: [{ kind: 'text' as const, text: 'Ginkgo Biloba' }],
    },
    {
      cellId: 'cell-1',
      rowId: 'row-1',
      columnId: 'column-2',
      rowSpan: 1,
      colSpan: 1,
      role: 'body' as const,
      segments: [
        { kind: 'text' as const, text: 'Native region ' },
        { kind: 'blank-anchor' as const, anchorId: 'anchor-18' },
      ],
    },
  ],
  blanks: [
    {
      blankId: 'blank-18',
      questionNumber: 18,
      anchorId: 'anchor-18',
      cellId: 'cell-1',
      canonicalOrder: 0,
      acceptedAnswers: ['China'],
      constraints: { maxWords: 2 },
      breadcrumb: {
        rowHeaders: ['Ginkgo Biloba'],
        columnHeaders: ['Region'],
      },
    },
  ],
  provenance: {
    sourceWorkflow: 'in-app-parse' as const,
    sourceOutcome: 'deterministic-table' as const,
    sourceShape: 'markdown-table' as const,
    sourceKind: 'markdown-table' as const,
    fallbackKind: 'none' as const,
    lossFlags: [],
    rawExcerpt: '| Plant | Region |',
    normalizationVersion: 1,
    confidence: 0.95,
    warnings: [],
    canonicalRevisionHash: 'abc12345',
  },
  canonicalReadingOrder: ['blank-18'],
});

describe('tableCompletionRepair', () => {
  it('adds and deletes table rows while keeping row cell ownership coherent', () => {
    const added = addTableCompletionRow(createGroup());
    const addedRow = added.rows.at(-1);

    expect(added.rows).toHaveLength(3);
    expect(addedRow?.cellIds).toHaveLength(2);

    const deleted = deleteTableCompletionRow(added, addedRow!.rowId);

    expect(deleted).not.toBeNull();
    expect(deleted?.rows).toHaveLength(2);
    expect(deleted?.cells.some((cell) => cell.rowId === addedRow!.rowId)).toBe(false);
  });

  it('merges adjacent cells and can split them back apart', () => {
    const merged = mergeTableCompletionCell(createGroup(), 'cell-header-1', 'horizontal');

    expect(merged).not.toBeNull();
    expect(merged?.cells.find((cell) => cell.cellId === 'cell-header-1')?.colSpan).toBe(2);
    expect(merged?.rows[0]?.cellIds).toEqual(['cell-header-1']);

    const split = splitTableCompletionCell(merged!, 'cell-header-1', 'horizontal');

    expect(split).not.toBeNull();
    expect(split?.cells.find((cell) => cell.cellId === 'cell-header-1')?.colSpan).toBe(1);
    expect(split?.rows[0]?.cellIds).toHaveLength(2);
  });

  it('inserts and removes blank anchors while reassigning question numbers sequentially', () => {
    const withInsertedBlank = insertBlankAnchorInCell(createGroup(), 'cell-row-header');

    expect(withInsertedBlank).not.toBeNull();
    expect(withInsertedBlank?.blanks).toHaveLength(2);
    expect(withInsertedBlank?.blanks.map((blank) => blank.questionNumber)).toEqual([18, 19]);

    const insertedBlank = withInsertedBlank?.blanks.find((blank) => blank.cellId === 'cell-row-header');
    expect(insertedBlank).toBeDefined();

    const afterRemoval = removeBlankAnchor(withInsertedBlank!, insertedBlank!.blankId);

    expect(afterRemoval).not.toBeNull();
    expect(afterRemoval?.blanks).toHaveLength(1);
    expect(afterRemoval?.blanks[0]?.questionNumber).toBe(18);
    expect(afterRemoval?.canonicalReadingOrder).toEqual([afterRemoval!.blanks[0]!.blankId]);
  });
});
