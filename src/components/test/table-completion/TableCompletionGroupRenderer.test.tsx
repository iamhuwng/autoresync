import '@testing-library/jest-dom';

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TableCompletionGroupV1 } from '../../../types/tableCompletion';

import { TableCompletionGroupRenderer } from './TableCompletionGroupRenderer';

const createGroup = (
  overrides: Partial<TableCompletionGroupV1> = {},
): TableCompletionGroupV1 => ({
  schemaVersion: 1,
  groupId: 'group-table-1',
  taskType: 'table-completion',
  passageId: 'p1',
  questionRange: { start: 1, end: 2 },
  sharedContent: {
    instructionText: 'Questions 1-2\n\nComplete the table below.',
    answerRuleText: 'Choose ONE WORD ONLY.',
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
    rawExcerpt: 'raw',
    normalizationVersion: 1,
    confidence: 0.95,
    warnings: [],
    canonicalRevisionHash: 'hash-1',
  },
  canonicalReadingOrder: ['blank-1', 'blank-2'],
  ...overrides,
});

describe('TableCompletionGroupRenderer', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('renders canonical table blanks inline for desktop mode', () => {
    render(
      <TableCompletionGroupRenderer
        group={createGroup()}
        questions={[
          { number: 1, blankId: 'blank-1' },
          { number: 2, blankId: 'blank-2' },
        ]}
        answers={{ 1: '', 2: '' }}
        onAnswerChange={() => {}}
      />,
    );

    expect(screen.getByText('Medicinal plants')).toBeInTheDocument();
    expect(screen.getByText('Plant')).toBeInTheDocument();
    expect(screen.getByText('Use')).toBeInTheDocument();
    expect(screen.getByLabelText('Question 1: Ginkgo Biloba - Use')).toBeInTheDocument();
    expect(screen.getByLabelText('Question 2: Ginkgo Biloba - Use')).toBeInTheDocument();
  });

  it('renders a mobile answer sheet for complex canonical tables and keeps canonical order', () => {
    const handleAnswerChange = vi.fn();

    render(
      <TableCompletionGroupRenderer
        group={createGroup({
          columns: [
            { columnId: 'c1', order: 0 },
            { columnId: 'c2', order: 1 },
            { columnId: 'c3', order: 2 },
            { columnId: 'c4', order: 3 },
          ],
        })}
        questions={[
          { number: 1, blankId: 'blank-1' },
          { number: 2, blankId: 'blank-2' },
        ]}
        answers={{ 1: '', 2: '' }}
        onAnswerChange={handleAnswerChange}
        mode="mobile"
      />,
    );

    const questionOneLabel = screen.getByText('Question 1');
    const questionTwoLabel = screen.getByText('Question 2');
    expect(questionOneLabel.compareDocumentPosition(questionTwoLabel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.change(
      screen.getByLabelText('Answer for question 1: Ginkgo Biloba - Use'),
      { target: { value: 'ginger' } },
    );

    expect(handleAnswerChange).toHaveBeenCalledWith(1, 'ginger');
  });

  it('collapses repeated placeholders for a single question into one rendered control', () => {
    render(
      <TableCompletionGroupRenderer
        group={createGroup({
          questionRange: { start: 7, end: 7 },
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
              segments: [{ kind: 'text', text: 'Part of tree' }],
            },
            {
              cellId: 'cell-header-2',
              rowId: 'r-header-1',
              columnId: 'c2',
              rowSpan: 1,
              colSpan: 1,
              role: 'column-header',
              segments: [{ kind: 'text', text: 'Traditional use' }],
            },
            {
              cellId: 'cell-1',
              rowId: 'r1',
              columnId: 'c1',
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
              cellId: 'cell-2',
              rowId: 'r1',
              columnId: 'c2',
              rowSpan: 1,
              colSpan: 1,
              role: 'body',
              segments: [{ kind: 'text', text: 'Medicine' }],
            },
          ],
          blanks: [
            {
              blankId: 'blank-7',
              questionNumber: 7,
              anchorId: 'anchor-7',
              cellId: 'cell-1',
              canonicalOrder: 0,
              acceptedAnswers: ['leaves and bark'],
              constraints: { maxWords: 2 },
              breadcrumb: { rowHeaders: ['Medicine'], columnHeaders: ['Part of tree'] },
            },
          ],
          canonicalReadingOrder: ['blank-7'],
        })}
        questions={[{ number: 7, blankId: 'blank-7' }]}
        answers={{ 7: '' }}
        onAnswerChange={() => {}}
      />,
    );

    expect(screen.getAllByLabelText('Question 7: Medicine - Part of tree')).toHaveLength(1);
    expect(screen.getByText('___ and ___')).toBeInTheDocument();
  });
});
