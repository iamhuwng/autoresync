import '@testing-library/jest-dom';

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IELTSQuestionsPanel } from './IELTSQuestionsPanel';

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
});
