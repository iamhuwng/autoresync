import '@testing-library/jest-dom';

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileMatchingHeadingsInput } from './MobileMatchingHeadingsInput';

const buildQuestions = () => [
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
        optionLabelFormat: 'roman' as const,
    },
];

describe('MobileMatchingHeadingsInput', () => {
    it('renders card-based mobile fields and opens a modal picker for each paragraph', async () => {
        const user = userEvent.setup();

        render(
            <MobileMatchingHeadingsInput
                questions={buildQuestions()}
                answers={{}}
                onAnswerChange={() => {}}
                fontSize={22}
                lineSpacing={1.6}
            />,
        );

        expect(screen.getByText('List of Headings')).toBeInTheDocument();

        const questionText = screen.getByText('Paragraph A');
        expect(questionText).toHaveStyle({ fontSize: '22px', lineHeight: '1.6' });

        const trigger = screen.getByRole('button', { name: 'Heading for question 1' });
        expect(trigger).toHaveStyle({ fontSize: '15px' });
        expect(screen.queryByRole('dialog', { name: 'Choose heading' })).not.toBeInTheDocument();

        await user.click(trigger);
        expect(screen.getByRole('dialog', { name: 'Choose heading' })).toBeInTheDocument();
        expect(screen.getByRole('listbox', { name: 'Heading options for question 1' })).toBeInTheDocument();
        expect(screen.queryByText('Drag heading here')).not.toBeInTheDocument();
    });

    it('submits the selected heading and lets the student clear it', async () => {
        const user = userEvent.setup();
        const onAnswerChange = vi.fn();

        render(
            <MobileMatchingHeadingsInput
                questions={buildQuestions()}
                answers={{ 1: 'ii' }}
                onAnswerChange={onAnswerChange}
            />,
        );

        const trigger = screen.getByRole('button', { name: 'Heading for question 2' });
        await user.click(trigger);
        expect(screen.getByRole('dialog', { name: 'Choose heading' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Why large cities created pressure on public health/i }));

        expect(onAnswerChange).toHaveBeenCalledWith(2, 'iii');
        expect(screen.queryByRole('dialog', { name: 'Choose heading' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Clear' }));
        expect(onAnswerChange).toHaveBeenCalledWith(1, '');
    });

    it('disables headings already used by other questions while keeping the current choice available', async () => {
        const user = userEvent.setup();

        render(
            <MobileMatchingHeadingsInput
                questions={buildQuestions()}
                answers={{ 1: 'ii' }}
                onAnswerChange={() => {}}
            />,
        );

        const questionTwoTrigger = screen.getByRole('button', { name: 'Heading for question 2' });
        await user.click(questionTwoTrigger);
        expect(screen.getByRole('dialog', { name: 'Choose heading' })).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /A missing step in the historical argument/i }),
        ).toBeDisabled();

        const questionOneTrigger = screen.getByRole('button', { name: 'Heading for question 1' });
        expect(questionOneTrigger).toHaveTextContent('ii. A missing step in the historical argument');
    });

    it('shows the selected heading only once inside a question card', () => {
        render(
            <MobileMatchingHeadingsInput
                questions={buildQuestions()}
                answers={{ 1: 'ii' }}
                onAnswerChange={() => {}}
            />,
        );

        const questionCard = screen.getByText('Paragraph A').closest('article');
        expect(questionCard).not.toBeNull();
        expect(
            within(questionCard as HTMLElement).getAllByText('ii. A missing step in the historical argument'),
        ).toHaveLength(1);
    });

    it('registers each paragraph card for exact navigator scroll targeting', () => {
        const onQuestionRefChange = vi.fn();

        render(
            <MobileMatchingHeadingsInput
                questions={buildQuestions()}
                answers={{}}
                onAnswerChange={() => {}}
                onQuestionRefChange={onQuestionRefChange}
            />,
        );

        expect(onQuestionRefChange).toHaveBeenCalledWith(1, expect.any(HTMLElement));
        expect(onQuestionRefChange).toHaveBeenCalledWith(2, expect.any(HTMLElement));
    });
});
