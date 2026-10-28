import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListeningQuestionDisplay } from './ListeningQuestionDisplay';

describe('ListeningQuestionDisplay', () => {
  it.each([
    ['roman', ['Tokyo', 'Ottawa'], 'ii'],
    ['number', ['Tokyo', 'Ottawa'], '2'],
    ['letter', ['i. Tokyo', 'ii. Ottawa'], 'ii'],
  ] as const)('keeps the %s matching bank labels consistent with answer values', (format, options, value) => {
    const onAnswerChange = vi.fn();
    render(<ListeningQuestionDisplay group={{ type: 'matching', startNumber: 1, endNumber: 1, instructions: '',
      questions: [{ number: 1, type: 'matching', question: 'Choose the city.', options: [...options], optionLabelFormat: format, answer: value, points: 1 }] }}
      answers={{}} currentQuestionNumber={1} onAnswerChange={onAnswerChange} />);
    expect(screen.getByText(`${value}.`)).toBeTruthy();
    expect(screen.getByRole('option', { name: `${value}. Ottawa` })).toHaveProperty('value', value);
    fireEvent.change(screen.getByRole('combobox'), { target: { value } });
    expect(onAnswerChange).toHaveBeenCalledWith(1, value);
  });

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

  it('renders native list-summary blanks as choices with canonical labels', () => {
    const change = vi.fn();
    render(<ListeningQuestionDisplay group={{ type: 'summary-completion-list', startNumber: 1, endNumber: 1,
      instructions: '', questions: [{ number: 1, type: 'summary-completion-list', question: 'Destination: [1]',
        answer: 'B', options: ['Tokyo', 'Ottawa'], points: 1 }] }} answers={{}} currentQuestionNumber={1}
      onAnswerChange={change} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Answer 1' }), { target: { value: 'B' } });
    expect(change).toHaveBeenCalledWith(1, 'B');
    expect(screen.getByRole('option', { name: 'B. Ottawa' })).toHaveProperty('value', 'B');
  });
});
