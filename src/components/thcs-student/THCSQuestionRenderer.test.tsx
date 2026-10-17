import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import THCSQuestionRenderer from './THCSQuestionRenderer';

describe('THCSQuestionRenderer visual text alternative', () => {
    it('shows the teacher-entered visual text when no image was supplied', () => {
        render(
            <THCSQuestionRenderer
                question={{
                    id: 'q1',
                    questionNumber: 1,
                    type: 'mcq-sign-notice',
                    intent: 'mcq-sign-notice',
                    questionText: 'What does this sign mean?',
                    options: ['A', 'B', 'C', 'D'],
                    correctAnswer: 'A',
                    imageCaption: 'NO PARKING',
                }}
                selectedAnswer={null}
                onAnswer={vi.fn()}
                isFlagged={false}
                onToggleFlag={vi.fn()}
                isReviewMode={false}
            />,
        );

        expect(screen.getByLabelText('Visual prompt text')).toHaveTextContent('NO PARKING');
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
});
