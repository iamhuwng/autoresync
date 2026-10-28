import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineFormCompletion } from './InlineFormCompletion';

const questions = [1, 2].map((number, index) => ({
  number, type: 'completion', question: index === 0 ? 'Name: [1]' : 'Address: 2 ______',
  answer: '', points: 1, sectionNumber: 1,
  context: { sectionHeading: 'Booking details', contextLines: ['Name: [1]', 'Address: 2 ______', 'Telephone: 012345'], currentLineIndex: index },
}));

describe('Listening native form rendering', () => {
  it('shows an explicitly indexed prompt edit once even when the teacher removes its blank marker', () => {
    render(<InlineFormCompletion questions={[{ ...questions[0]!, question: 'Full name',
      context: { contextLines: ['Full name'], currentLineIndex: 0 } }]} answers={{}} onAnswerChange={vi.fn()} />);
    expect(screen.getAllByText('Full name')).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { name: 'Answer 1' })).toHaveLength(1);
  });

  it('renders a shared form once and sends each answer to its own question number', () => {
    const change = vi.fn();
    render(<InlineFormCompletion questions={questions} answers={{ 1: 'Alice', 2: 'London' }} onAnswerChange={change} />);
    expect(screen.getAllByText('Booking details')).toHaveLength(1);
    expect(screen.getAllByText('Telephone: 012345')).toHaveLength(1);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect((screen.getByRole('textbox', { name: 'Answer 1' }) as HTMLInputElement).value).toBe('Alice');
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer 2' }), { target: { value: 'Oxford' } });
    expect(change).toHaveBeenCalledWith(2, 'Oxford');
  });

  it('binds an anonymous blank only when its existing line index identifies a single question', () => {
    const change = vi.fn();
    render(<InlineFormCompletion questions={[{ ...questions[0]!, context: {
      contextLines: ['Name: ____', 'Fixed information'], currentLineIndex: 0,
    } }]} answers={{}} onAnswerChange={change} disabled />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect((screen.getByRole('textbox', { name: 'Answer 1' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('keeps ambiguous context as text and supplies separate numbered answer rows', () => {
    render(<InlineFormCompletion questions={questions.map(question => ({ ...question,
      context: { contextLines: ['Two unnumbered blanks: ____ and ____'], currentLineIndex: 0 },
    }))} answers={{}} onAnswerChange={vi.fn()} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getByText('Two unnumbered blanks:')).toBeTruthy();
  });
});
