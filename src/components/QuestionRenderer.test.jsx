import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import QuestionRenderer from './QuestionRenderer';

describe('QuestionRenderer', () => {
  it('should render the multiple choice view for multiple-choice questions', () => {
    const question = {
      type: 'multiple-choice',
      question: 'What is the capital of France?',
      options: ['London', 'Paris', 'Berlin', 'Madrid'],
      answer: 'Paris'
    };
    render(
      <MantineProvider>
        <QuestionRenderer question={question} />
      </MantineProvider>
    );
    expect(screen.getByText('What is the capital of France?')).toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
  });

  it('should render the multiple select view for multiple-select questions', () => {
    const question = {
      type: 'multiple-select',
      question: 'Test question',
      options: ['Option 1', 'Option 2', 'Option 3']
    };
    render(
      <MantineProvider>
        <QuestionRenderer question={question} />
      </MantineProvider>
    );
    expect(screen.getByText('Test question')).toBeInTheDocument();
    expect(screen.getByText('✓ Select all that apply')).toBeInTheDocument();
  });

  it('should render the completion view for completion questions', () => {
    const question = {
      type: 'completion',
      question: 'The capital of France is _____.',
      wordBank: ['Paris', 'London', 'Berlin', 'Madrid']
    };
    render(
      <MantineProvider>
        <QuestionRenderer question={question} />
      </MantineProvider>
    );
    expect(screen.getByText(/The capital of France is/i)).toBeInTheDocument();
    expect(screen.getByText('Select a word from the word bank below')).toBeInTheDocument();
  });

  it('should render the matching view for matching questions', () => {
    const question = {
      type: 'matching',
      question: 'Match each country to its capital city.',
      items: [
        { id: 'item-1', text: 'Japan' },
        { id: 'item-2', text: 'Canada' },
        { id: 'item-3', text: 'Australia' }
      ],
      options: [
        { id: 'opt-a', text: 'Canberra' },
        { id: 'opt-b', text: 'Tokyo' },
        { id: 'opt-c', text: 'Ottawa' }
      ],
      answers: {
        'item-1': 'opt-b',
        'item-2': 'opt-c',
        'item-3': 'opt-a'
      },
      reusableAnswers: false,
      timer: 40,
      points: 10
    };
    render(
      <MantineProvider>
        <QuestionRenderer question={question} />
      </MantineProvider>
    );
    expect(screen.getByText('Match each country to its capital city.')).toBeInTheDocument();
    expect(screen.getByText('Items to Match:')).toBeInTheDocument();
  });

  it('should render an unsupported message for unknown question types', () => {
    const question = { type: 'unknown' };
    render(<QuestionRenderer question={question} />);
    // Text is split: "Unsupported question type:" and "unknown"
    expect(screen.getByText(/Unsupported question type/)).toBeInTheDocument();
  });
});
