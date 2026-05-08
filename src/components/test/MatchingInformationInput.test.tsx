import '@testing-library/jest-dom';

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchingInformationInput } from './MatchingInformationInput';

const buildQuestions = () => [
    {
        number: 14,
        type: 'matching-information',
        question: 'An early example of industrial migration',
        sectionReferences: [
            { label: 'A' },
            { label: 'B' },
            { label: 'C' },
        ],
        answer: '',
        passageId: 'p1',
    },
];

describe('MatchingInformationInput', () => {
    it('renders section labels once in the options list without duplicating them as text', () => {
        render(
            <MatchingInformationInput
                questions={buildQuestions()}
                answers={{}}
                onAnswerChange={() => {}}
            />,
        );

        const listPanel = screen.getByText('List of Options').parentElement;
        expect(listPanel).not.toBeNull();
        expect(within(listPanel as HTMLElement).getAllByText(/^A$/)).toHaveLength(1);
        expect(within(listPanel as HTMLElement).getAllByText(/^B$/)).toHaveLength(1);
        expect(within(listPanel as HTMLElement).getAllByText(/^C$/)).toHaveLength(1);
    });

    it('returns the selected section label when a student clicks a chip', async () => {
        const user = userEvent.setup();
        const onAnswerChange = vi.fn();

        render(
            <MatchingInformationInput
                questions={buildQuestions()}
                answers={{}}
                onAnswerChange={onAnswerChange}
            />,
        );

        await user.click(screen.getAllByRole('button', { name: 'B' })[0]!);

        expect(onAnswerChange).toHaveBeenCalledWith(14, 'B');
    });

    it('applies mobile preview sizing to question text without resizing answer chips', () => {
        render(
            <MatchingInformationInput
                questions={buildQuestions()}
                answers={{}}
                onAnswerChange={() => {}}
                fontSize={22}
                lineSpacing={1.6}
            />,
        );

        const questionText = screen.getByText('An early example of industrial migration');
        expect(questionText).toHaveStyle({ fontSize: '22px', lineHeight: '1.6' });

        const answerChip = screen.getAllByRole('button', { name: 'A' })[0];
        expect(answerChip).toHaveStyle({ fontSize: '15px' });
    });

    it('registers each question row for exact navigator scroll targeting', () => {
        const onQuestionRefChange = vi.fn();

        render(
            <MatchingInformationInput
                questions={buildQuestions()}
                answers={{}}
                onAnswerChange={() => {}}
                onQuestionRefChange={onQuestionRefChange}
            />,
        );

        expect(onQuestionRefChange).toHaveBeenCalledWith(14, expect.any(HTMLDivElement));
    });
});
