import { describe, expect, it } from 'vitest';
import {
  buildTableCompletionSectionInstruction,
  deriveTableCompletionQuestionsFromGroup,
  sortTableCompletionQuestionGroups,
  stripTableCompletionReviewOnlyProvenance,
} from './tableCompletionTransforms';
import type { TableCompletionGroupV1 } from '../../types/tableCompletion';

const buildGroup = (overrides: Partial<TableCompletionGroupV1> = {}): TableCompletionGroupV1 => ({
  schemaVersion: 1,
  groupId: 'group-1',
  taskType: 'table-completion',
  passageId: 'passage-b',
  questionRange: { start: 10, end: 11 },
  sharedContent: {
    instructionText: 'Complete the table below.',
    answerRuleText: 'Choose NO MORE THAN TWO WORDS.',
    constraints: { maxWords: 2 },
    caption: 'Medicinal Plants',
  },
  columns: [
    { columnId: 'col-1', order: 0 },
    { columnId: 'col-2', order: 1 },
  ],
  rows: [
    { rowId: 'row-header-1', order: 0, cellIds: ['cell-header-1', 'cell-header-2'] },
    { rowId: 'row-1', order: 1, cellIds: ['cell-row-header', 'cell-1'] },
  ],
  cells: [
    {
      cellId: 'cell-header-1',
      rowId: 'row-header-1',
      columnId: 'col-1',
      rowSpan: 1,
      colSpan: 1,
      role: 'column-header',
      segments: [{ kind: 'text', text: 'Plant Species' }],
    },
    {
      cellId: 'cell-header-2',
      rowId: 'row-header-1',
      columnId: 'col-2',
      rowSpan: 1,
      colSpan: 1,
      role: 'column-header',
      segments: [{ kind: 'text', text: 'Native Region' }],
    },
    {
      cellId: 'cell-row-header',
      rowId: 'row-1',
      columnId: 'col-1',
      rowSpan: 1,
      colSpan: 1,
      role: 'row-header',
      segments: [{ kind: 'text', text: 'Ginkgo Biloba' }],
    },
    {
      cellId: 'cell-1',
      rowId: 'row-1',
      columnId: 'col-2',
      rowSpan: 1,
      colSpan: 1,
      role: 'body',
      segments: [
        { kind: 'text', text: 'Native region: ' },
        { kind: 'blank-anchor', anchorId: 'anchor-1' },
      ],
    },
  ],
  blanks: [
    {
      blankId: 'blank-1',
      questionNumber: 10,
      anchorId: 'anchor-1',
      cellId: 'cell-1',
      canonicalOrder: 0,
      sourceQuestionText: 'Original source question text',
      acceptedAnswers: ['China'],
      constraints: {},
      breadcrumb: {
        rowHeaders: ['Ginkgo Biloba'],
        columnHeaders: ['Native Region'],
      },
    },
  ],
  provenance: {
    sourceWorkflow: 'in-app-parse',
    sourceShape: 'html-table',
    rawExcerpt: '<table>...</table>',
    normalizationVersion: 1,
    confidence: 0.72,
    warnings: ['inferred-headers'],
    canonicalRevisionHash: 'rev-1',
  },
  canonicalReadingOrder: ['blank-1'],
  ...overrides,
});

describe('tableCompletionTransforms', () => {
  it('derives compatibility flat questions from a canonical group', () => {
    const questions = deriveTableCompletionQuestionsFromGroup(buildGroup());

    expect(questions).toEqual([
      expect.objectContaining({
        type: 'table-completion',
        questionNumber: 10,
        questionText: 'Native region: ___',
        sectionInstructionId: 'group-1',
        groupId: 'group-1',
        blankId: 'blank-1',
        anchorId: 'anchor-1',
        groupTaskType: 'table-completion',
        tableGroupSchemaVersion: 1,
        acceptableAnswers: ['China'],
      }),
    ]);
  });

  it('falls back to source question text when the canonical cell has no informative text', () => {
    const questions = deriveTableCompletionQuestionsFromGroup(
      buildGroup({
        cells: [
          {
            cellId: 'cell-header-1',
            rowId: 'row-header-1',
            columnId: 'col-1',
            rowSpan: 1,
            colSpan: 1,
            role: 'column-header',
            segments: [{ kind: 'text', text: 'Plant Species' }],
          },
          {
            cellId: 'cell-header-2',
            rowId: 'row-header-1',
            columnId: 'col-2',
            rowSpan: 1,
            colSpan: 1,
            role: 'column-header',
            segments: [{ kind: 'text', text: 'Native Region' }],
          },
          {
            cellId: 'cell-row-header',
            rowId: 'row-1',
            columnId: 'col-1',
            rowSpan: 1,
            colSpan: 1,
            role: 'row-header',
            segments: [{ kind: 'text', text: 'Ginkgo Biloba' }],
          },
          {
            cellId: 'cell-1',
            rowId: 'row-1',
            columnId: 'col-2',
            rowSpan: 1,
            colSpan: 1,
            role: 'body',
            segments: [{ kind: 'blank-anchor', anchorId: 'anchor-1' }],
          },
        ],
      }),
    );

    expect(questions[0]).toEqual(
      expect.objectContaining({
        questionText: 'Original source question text',
      }),
    );
  });

  it('falls back to source-backed row context when a single answer spans a connective blank pattern', () => {
    const questions = deriveTableCompletionQuestionsFromGroup(
      buildGroup({
        blanks: [
          {
            blankId: 'blank-7',
            questionNumber: 7,
            anchorId: 'anchor-7',
            cellId: 'cell-row-header',
            canonicalOrder: 0,
            sourceQuestionText: 'Part of tree: Medicine',
            acceptedAnswers: ['leaves and bark'],
            constraints: {},
            breadcrumb: {
              rowHeaders: ['Medicine'],
              columnHeaders: ['Part of tree'],
            },
          },
        ],
        cells: [
          {
            cellId: 'cell-header-1',
            rowId: 'row-header-1',
            columnId: 'col-1',
            rowSpan: 1,
            colSpan: 1,
            role: 'column-header',
            segments: [{ kind: 'text', text: 'Part of tree' }],
          },
          {
            cellId: 'cell-header-2',
            rowId: 'row-header-1',
            columnId: 'col-2',
            rowSpan: 1,
            colSpan: 1,
            role: 'column-header',
            segments: [{ kind: 'text', text: 'Traditional use' }],
          },
          {
            cellId: 'cell-row-header',
            rowId: 'row-1',
            columnId: 'col-1',
            rowSpan: 1,
            colSpan: 1,
            role: 'body',
            segments: [
              { kind: 'blank-anchor', anchorId: 'anchor-7' },
              { kind: 'text', text: ' and ' },
              { kind: 'blank-anchor', anchorId: 'anchor-7' },
            ],
          },
          {
            cellId: 'cell-1',
            rowId: 'row-1',
            columnId: 'col-2',
            rowSpan: 1,
            colSpan: 1,
            role: 'body',
            segments: [{ kind: 'text', text: 'Medicine' }],
          },
        ],
      }),
    );

    expect(questions[0]).toEqual(
      expect.objectContaining({
        questionText: 'Part of tree: Medicine',
      }),
    );
  });

  it('builds compatibility section instructions from shared content', () => {
    expect(buildTableCompletionSectionInstruction(buildGroup())).toBe(
      'Complete the table below.\n\nChoose NO MORE THAN TWO WORDS.\n\nMedicinal Plants',
    );
  });

  it('strips review-only provenance for student-safe payloads', () => {
    const stripped = stripTableCompletionReviewOnlyProvenance(buildGroup());

    expect(stripped).toEqual(
      expect.objectContaining({
        provenance: { canonicalRevisionHash: 'rev-1' },
      }),
    );
    expect(stripped.blanks[0]).not.toHaveProperty('acceptedAnswers');
    expect(stripped.blanks[0]).not.toHaveProperty('sourceQuestionText');
  });

  it('sorts question groups by passage order and then start number', () => {
    const later = buildGroup({ groupId: 'group-2', questionRange: { start: 20, end: 21 } });
    const earlier = buildGroup({
      groupId: 'group-0',
      passageId: 'passage-a',
      questionRange: { start: 5, end: 6 },
    });

    expect(
      sortTableCompletionQuestionGroups([buildGroup(), later, earlier], ['passage-a', 'passage-b']).map(
        (group) => group.groupId,
      ),
    ).toEqual(['group-0', 'group-1', 'group-2']);
  });
});
