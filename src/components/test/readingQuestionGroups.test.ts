import { describe, expect, it } from 'vitest';

import type { QuestionGroupsField } from '../../types/tableCompletion';

import {
  getFirstUnansweredReadingQuestionGroupStart,
  groupReadingQuestionsByTaskType,
} from './readingQuestionGroups';

const CANONICAL_GROUP: QuestionGroupsField[number] = {
  schemaVersion: 1,
  groupId: 'group-table-1',
  taskType: 'table-completion',
  passageId: 'p1',
  questionRange: { start: 1, end: 2 },
  sharedContent: {
    instructionText: 'Questions 1-2\n\nComplete the table below.',
    answerRuleText: 'Choose ONE WORD ONLY from the passage for each answer.',
    constraints: { maxWords: 1 },
    caption: 'Medicinal plants',
  },
  columns: [
    { columnId: 'c1', order: 0 },
    { columnId: 'c2', order: 1 },
  ],
  rows: [
    { rowId: 'r-header-1', order: 0, cellIds: ['cell-header-1', 'cell-header-2'] },
    { rowId: 'r1', order: 1, cellIds: ['cell-1', 'cell-2'] },
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
      cellId: 'cell-1',
      rowId: 'r1',
      columnId: 'c1',
      rowSpan: 1,
      colSpan: 1,
      role: 'row-header',
      segments: [{ kind: 'text', text: 'Ginkgo Biloba' }],
    },
    {
      cellId: 'cell-2',
      rowId: 'r1',
      columnId: 'c2',
      rowSpan: 1,
      colSpan: 1,
      role: 'body',
      segments: [
        { kind: 'text', text: 'Use ' },
        { kind: 'blank-anchor', anchorId: 'anchor-1' },
        { kind: 'text', text: ' and ' },
        { kind: 'blank-anchor', anchorId: 'anchor-2' },
      ],
    },
  ],
  blanks: [
    {
      blankId: 'blank-1',
      questionNumber: 1,
      anchorId: 'anchor-1',
      cellId: 'cell-2',
      canonicalOrder: 0,
      acceptedAnswers: ['ginger'],
      constraints: { maxWords: 1 },
      breadcrumb: { rowHeaders: ['Ginkgo Biloba'], columnHeaders: ['Use'] },
    },
    {
      blankId: 'blank-2',
      questionNumber: 2,
      anchorId: 'anchor-2',
      cellId: 'cell-2',
      canonicalOrder: 1,
      acceptedAnswers: ['mint'],
      constraints: { maxWords: 1 },
      breadcrumb: { rowHeaders: ['Ginkgo Biloba'], columnHeaders: ['Use'] },
    },
  ],
  provenance: {
    sourceWorkflow: 'in-app-parse',
    sourceShape: 'markdown-table',
    rawExcerpt: '| Plant | Use |',
    normalizationVersion: 1,
    confidence: 0.95,
    warnings: [],
    canonicalRevisionHash: 'hash-1',
  },
  canonicalReadingOrder: ['blank-1', 'blank-2'],
};

describe('readingQuestionGroups', () => {
  it('prefers explicit canonical table groups over flat adjacency grouping', () => {
    const questions = [
      {
        number: 1,
        type: 'table-completion',
        passageId: 'p1',
        question: 'legacy fallback one',
        groupId: 'group-table-1',
        groupTaskType: 'table-completion' as const,
      },
      {
        number: 2,
        type: 'table-completion',
        passageId: 'p1',
        question: 'legacy fallback two',
        groupId: 'group-table-1',
        groupTaskType: 'table-completion' as const,
      },
      {
        number: 3,
        type: 'multiple-choice',
        passageId: 'p1',
        question: 'Which option is correct?',
      },
    ];

    const groups = groupReadingQuestionsByTaskType(questions, [CANONICAL_GROUP]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      startNumber: 1,
      endNumber: 2,
      type: 'table-completion',
      canonicalGroup: CANONICAL_GROUP,
    });
    expect(groups[0]?.instructions).toContain('Complete the table below.');
    expect(groups[1]).toMatchObject({
      startNumber: 3,
      endNumber: 3,
      type: 'multiple-choice',
    });
  });

  it('uses the shared empty-answer helper when resolving the first unanswered group', () => {
    const groups = groupReadingQuestionsByTaskType(
      [
        { number: 1, type: 'true-false-not-given', passageId: 'p1' },
        { number: 2, type: 'true-false-not-given', passageId: 'p1' },
        { number: 3, type: 'multiple-choice', passageId: 'p1' },
      ],
      [],
    );

    expect(
      getFirstUnansweredReadingQuestionGroupStart(groups, {
        1: 'TRUE',
        2: '   ',
        3: 'A',
      }),
    ).toBe(1);

    expect(
      getFirstUnansweredReadingQuestionGroupStart(groups, {
        1: 'TRUE',
        2: 'FALSE',
        3: 'A',
      }),
    ).toBeNull();
  });
});
