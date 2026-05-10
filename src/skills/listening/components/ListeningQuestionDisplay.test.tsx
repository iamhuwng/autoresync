import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListeningQuestionDisplay } from './ListeningQuestionDisplay';

describe('ListeningQuestionDisplay', () => {
  it('disables inline completion inputs when disabled is true', () => {
    render(
      <ListeningQuestionDisplay
        group={{
          type: 'completion',
          startNumber: 1,
          endNumber: 1,
          instructions: 'Complete the note.',
          questions: [
            {
              number: 1,
              type: 'completion',
              question: 'Student name ____',
              answer: 'Alice',
              points: 1,
            },
          ],
        }}
        answers={{ 1: '' }}
        onAnswerChange={() => {}}
        currentQuestionNumber={1}
        disabled
      />,
    );

    const input = screen.getByPlaceholderText('1') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
