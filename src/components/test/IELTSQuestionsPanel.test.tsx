import '@testing-library/jest-dom';

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IELTSQuestionsPanel } from './IELTSQuestionsPanel';
import type { QuestionGroupsField } from '../../types/tableCompletion';

const buildMatchingHeadingsQuestions = () => [
    {
        number: 1,
        type: 'matching-headings',
        question: 'Paragraph A',
        options: [
            'i. A final push toward industrial growth',
            'ii. A missing step in the historical argument',
            'iii. Why large cities created pressure on public health',
        ],
        answer: '',
        passageId: 'p1',
        points: 1,
        optionLabelFormat: 'roman' as const,
    },
    {
        number: 2,
        type: 'matching-headings',
        question: 'Paragraph B',
        options: [
            'i. A final push toward industrial growth',
            'ii. A missing step in the historical argument',
            'iii. Why large cities created pressure on public health',
        ],
        answer: '',
        passageId: 'p1',
        points: 1,
        optionLabelFormat: 'roman' as const,
    },
];

const CANONICAL_TABLE_GROUP: QuestionGroupsField[number] = {
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
};

describe('IELTSQuestionsPanel matching headings', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            value: vi.fn(),
        });
    });

    it('renders the mobile-specific matching headings layout in embedded mode', () => {
        render(
            <IELTSQuestionsPanel
                questions={buildMatchingHeadingsQuestions()}
                currentPassageId="p1"
                answers={{}}
                onAnswerChange={() => {}}
                activeQuestionNumber={1}
                onQuestionClick={() => {}}
                embedded
                fontSize={20}
                lineSpacing={1.6}
            />,
        );

        expect(screen.getByRole('button', { name: 'Heading for question 1' })).toBeInTheDocument();
        expect(screen.queryByText('Drag heading here')).not.toBeInTheDocument();
    });

    it('keeps the drag-and-drop headings layout for desktop mode', () => {
        render(
            <IELTSQuestionsPanel
                questions={buildMatchingHeadingsQuestions()}
                currentPassageId="p1"
                answers={{}}
                onAnswerChange={() => {}}
                activeQuestionNumber={1}
                onQuestionClick={() => {}}
            />,
        );

        expect(screen.getAllByText('Drag heading here')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: 'Heading for question 1' })).not.toBeInTheDocument();
    });

    it('scrolls to the exact embedded matching-headings card when the active question changes', () => {
        const { rerender } = render(
            <IELTSQuestionsPanel
                questions={buildMatchingHeadingsQuestions()}
                currentPassageId="p1"
                answers={{}}
                onAnswerChange={() => {}}
                activeQuestionNumber={1}
                onQuestionClick={() => {}}
                embedded
                fontSize={20}
                lineSpacing={1.6}
            />,
        );

        const targetCard = screen.getByText('Paragraph B').closest('article');
        expect(targetCard).not.toBeNull();

        const scrollIntoView = vi.fn();
        Object.defineProperty(targetCard as HTMLElement, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoView,
        });

        rerender(
            <IELTSQuestionsPanel
                questions={buildMatchingHeadingsQuestions()}
                currentPassageId="p1"
                answers={{}}
                onAnswerChange={() => {}}
                activeQuestionNumber={2}
                onQuestionClick={() => {}}
                embedded
                fontSize={20}
                lineSpacing={1.6}
            />,
        );

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('renders canonical table-completion groups from questionGroups instead of flat heuristics', () => {
        render(
            <IELTSQuestionsPanel
                questions={[
                    {
                        number: 1,
                        type: 'table-completion',
                        question: 'legacy fallback one',
                        answer: '',
                        passageId: 'p1',
                        points: 1,
                        groupId: 'group-table-1',
                        blankId: 'blank-1',
                        anchorId: 'anchor-1',
                        groupTaskType: 'table-completion',
                    },
                    {
                        number: 2,
                        type: 'table-completion',
                        question: 'legacy fallback two',
                        answer: '',
                        passageId: 'p1',
                        points: 1,
                        groupId: 'group-table-1',
                        blankId: 'blank-2',
                        anchorId: 'anchor-2',
                        groupTaskType: 'table-completion',
                    },
                ]}
                questionGroups={[CANONICAL_TABLE_GROUP]}
                currentPassageId="p1"
                answers={{}}
                onAnswerChange={() => {}}
                activeQuestionNumber={1}
                onQuestionClick={() => {}}
            />,
        );

        expect(screen.getByText('Medicinal plants')).toBeInTheDocument();
        expect(screen.getByLabelText('Question 1: Ginkgo Biloba - Use')).toBeInTheDocument();
        expect(screen.getByLabelText('Question 2: Ginkgo Biloba - Use')).toBeInTheDocument();
    });
});
