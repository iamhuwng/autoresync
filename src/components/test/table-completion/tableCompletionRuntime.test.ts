import { describe, expect, it } from 'vitest';

import type { TableCompletionGroupV1 } from '../../../types/tableCompletion';

import {
  buildTableCompletionBlankBreadcrumbLabel,
  isSimpleTableCompletionGroup,
} from './tableCompletionRuntime';

const createGroup = (
  overrides: Partial<TableCompletionGroupV1> = {},
): TableCompletionGroupV1 => ({
  schemaVersion: 1,
  groupId: 'group-table-1',
  taskType: 'table-completion',
  passageId: 'p1',
  questionRange: { start: 1, end: 1 },
  sharedContent: {
    instructionText: 'Questions 1-1',
    answerRuleText: 'Choose ONE WORD ONLY.',
    constraints: {},
  },
  columns: [
    { columnId: 'c1', order: 0 },
    { columnId: 'c2', order: 1 },
  ],
  rows: [
    { rowId: 'r-header-1', order: 0, cellIds: ['cell-header-1', 'cell-header-2'] },
    { rowId: 'r1', order: 1, cellIds: ['cell-row-header', 'cell-1'] },
  ],
  cells: [
    {
      cellId: 'cell-header-1',
      rowId: 'r-header-1',
      columnId: 'c1',
      rowSpan: 1,
      colSpan: 1,
      role: 'column-header',
      segments: [{ kind: 'text', text: 'Plant' }],
    },
    {
      cellId: 'cell-header-2',
      rowId: 'r-header-1',
      columnId: 'c2',
      rowSpan: 1,
      colSpan: 1,
      role: 'column-header',
      segments: [{ kind: 'text', text: 'Use' }],
    },
    {
      cellId: 'cell-row-header',
      rowId: 'r1',
      columnId: 'c1',
      rowSpan: 1,
      colSpan: 1,
      role: 'row-header',
      segments: [{ kind: 'text', text: 'Ginkgo Biloba' }],
    },
    {
      cellId: 'cell-1',
      rowId: 'r1',
      columnId: 'c2',
      rowSpan: 1,
      colSpan: 1,
      role: 'body',
      segments: [{ kind: 'blank-anchor', anchorId: 'anchor-1' }],
    },
  ],
  blanks: [
    {
      blankId: 'blank-1',
      questionNumber: 1,
      anchorId: 'anchor-1',
      cellId: 'cell-1',
      canonicalOrder: 0,
      acceptedAnswers: ['answer'],
      constraints: {},
      breadcrumb: { rowHeaders: ['Ginkgo Biloba'], columnHeaders: ['Use'] },
    },
  ],
  provenance: {
    sourceWorkflow: 'in-app-parse',
    sourceShape: 'markdown-table',
    rawExcerpt: 'raw',
    normalizationVersion: 1,
    confidence: 0.95,
    warnings: [],
    canonicalRevisionHash: 'hash-1',
  },
  canonicalReadingOrder: ['blank-1'],
  ...overrides,
});

describe('tableCompletionRuntime', () => {
  it('builds breadcrumb labels from semantic row and column headers', () => {
    expect(
      buildTableCompletionBlankBreadcrumbLabel(
        createGroup().blanks[0]!,
      ),
    ).toBe('Ginkgo Biloba - Use');
  });

  it('returns true only for simple table groups', () => {
    expect(isSimpleTableCompletionGroup(createGroup())).toBe(true);
    expect(
      isSimpleTableCompletionGroup(
        createGroup({
          columns: [
            { columnId: 'c1', order: 0 },
            { columnId: 'c2', order: 1 },
            { columnId: 'c3', order: 2 },
            { columnId: 'c4', order: 3 },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isSimpleTableCompletionGroup(
        createGroup({
          cells: [
            {
              cellId: 'cell-1',
              rowId: 'r1',
              columnId: 'c2',
              rowSpan: 2,
              colSpan: 1,
              role: 'body',
              segments: [{ kind: 'blank-anchor', anchorId: 'anchor-1' }],
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isSimpleTableCompletionGroup(
        createGroup({
          cells: [
            {
              cellId: 'cell-1',
              rowId: 'r1',
              columnId: 'c2',
              rowSpan: 1,
              colSpan: 1,
              role: 'body',
              segments: [
                { kind: 'blank-anchor', anchorId: 'anchor-1' },
                { kind: 'text', text: ' / ' },
                { kind: 'blank-anchor', anchorId: 'anchor-2' },
              ],
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});
