/**
 * QuestionNavigator Tests
 * Covers: standard mode, compact horizontal mode, and state/accessibility for chips.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QuestionNavigator } from './QuestionNavigator';

const defaultProps = {
  totalQuestions: 10,
  currentQuestion: 3,
  answeredQuestions: new Set([1, 2]),
  onQuestionClick: vi.fn(),
  flaggedQuestions: new Set([5]),
};

describe('QuestionNavigator - standard mode', () => {
  it('renders all question buttons in grid layout', () => {
    render(<QuestionNavigator {...defaultProps} />);

    for (let i = 1; i <= 10; i++) {
      expect(screen.getByLabelText(new RegExp(`^Go to question ${i}\\b`))).toBeInTheDocument();
    }
  });

  it('fires onQuestionClick when a chip is clicked', () => {
    const onClick = vi.fn();
    render(<QuestionNavigator {...defaultProps} onQuestionClick={onClick} />);
    fireEvent.click(screen.getByLabelText(/^Go to question 7\b/));
    expect(onClick).toHaveBeenCalledWith(7);
  });

  it('shows flag indicator dot on flagged questions', () => {
    render(<QuestionNavigator {...defaultProps} />);
    expect(screen.getByTitle('Flagged for review')).toBeInTheDocument();
  });

  it('does not show compact-mode toggles in standard mode', () => {
    render(<QuestionNavigator {...defaultProps} />);
    expect(screen.queryByTestId('question-navigator-show-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-navigator-collapse')).not.toBeInTheDocument();
  });
});

describe('QuestionNavigator - compact horizontal mode', () => {
  it('renders a single horizontal scroll row', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    expect(screen.getByTestId('question-navigator-collapsible')).toBeInTheDocument();
    expect(screen.getByTestId('question-navigator-scroll-row')).toBeInTheDocument();
  });

  it('renders all question chips in the compact row', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    const scrollRow = screen.getByTestId('question-navigator-scroll-row');

    for (let i = 1; i <= 10; i++) {
      expect(
        within(scrollRow).getByLabelText(new RegExp(`^Go to question ${i}\\b`)),
      ).toBeInTheDocument();
    }
  });

  it('does not render Show all or Collapse toggles', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    expect(screen.queryByTestId('question-navigator-show-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-navigator-collapse')).not.toBeInTheDocument();
  });

  it('fires onQuestionClick in compact mode', () => {
    const onClick = vi.fn();
    render(<QuestionNavigator {...defaultProps} collapsible onQuestionClick={onClick} />);
    fireEvent.click(screen.getByLabelText(/^Go to question 4\b/));
    expect(onClick).toHaveBeenCalledWith(4);
  });
});

describe('QuestionNavigator - chip states (compact)', () => {
  it('current question chip gets distinct styling from unanswered', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    const currentChip = screen.getByLabelText(/^Go to question 3\b/);
    const unansweredChip = screen.getByLabelText(/^Go to question 7\b/);
    expect(currentChip.style.background).toBe(unansweredChip.style.background);
    expect(currentChip).toHaveStyle({ border: '2px solid #2563eb' });
    expect(unansweredChip).toHaveStyle({ border: '2px solid #cbd5e1' });
  });

  it('answered question chip gets distinct styling from unanswered', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    const answeredChip = screen.getByLabelText(/^Go to question 1\b/);
    const unansweredChip = screen.getByLabelText(/^Go to question 7\b/);
    expect(answeredChip.style.background).not.toBe(unansweredChip.style.background);
  });

  it('current chip uses a blue ring instead of a filled blue background', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    const currentChip = screen.getByLabelText(/^Go to question 3\b/);
    expect(currentChip).toHaveStyle({
      color: '#2563eb',
      border: '2px solid #2563eb',
    });
  });

  it('answered chip has white text', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    expect(screen.getByLabelText(/^Go to question 1\b/).style.color).toBe('white');
  });

  it('unanswered chip does not have white text', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    expect(screen.getByLabelText(/^Go to question 7\b/).style.color).not.toBe('white');
  });

  it('flagged question shows flag dot indicator', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    expect(screen.getByTestId('flag-dot-5')).toBeInTheDocument();
  });

  it('non-flagged questions do not show flag dot', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    expect(screen.queryByTestId('flag-dot-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('flag-dot-3')).not.toBeInTheDocument();
  });

  it('aria-labels include answered, unanswered, and flagged states', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    expect(screen.getByLabelText('Go to question 1 (answered)')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to question 7 (unanswered)')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to question 5 (unanswered) (flagged)')).toBeInTheDocument();
  });
});

describe('QuestionNavigator - horizontal scroll', () => {
  it('scroll row has overflow-x auto for horizontal scrolling', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    const scrollRow = screen.getByTestId('question-navigator-scroll-row');
    expect(scrollRow.style.overflowX).toBe('auto');
    expect(scrollRow.style.display).toBe('flex');
  });

  it('chips have flex-shrink: 0 to prevent compression', () => {
    render(<QuestionNavigator {...defaultProps} collapsible />);
    expect(screen.getByLabelText(/^Go to question 1\b/).style.flexShrink).toBe('0');
  });
});
