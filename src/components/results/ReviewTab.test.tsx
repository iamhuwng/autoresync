/**
 * ReviewTab Tests — PRD-0039 Task 7.10
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReviewTab } from './ReviewTab';
import type { TestResultRecord } from '../../services/testResults.service';

/* ─── Fixtures ───────────────────────────────────────────────────────────── */

const baseResult: TestResultRecord = {
  resultId: 'r1',
  testId: 't1',
  testTitle: 'Test',
  testType: 'THCS-THPT',
  studentId: 's1',
  totalScore: 6,
  maxScore: 10,
  percentage: 60,
  correct: 3,
  incorrect: 2,
  partialCredit: 0,
  totalQuestions: 5,
  submittedAt: Date.now(),
  questionResults: [
    { questionNumber: 1, isCorrect: true, studentAnswer: 'A', correctAnswer: 'A', score: 2, maxScore: 2, questionType: 'multiple-choice' },
    { questionNumber: 2, isCorrect: false, studentAnswer: 'B', correctAnswer: 'C', score: 0, maxScore: 2, questionType: 'multiple-choice' },
    { questionNumber: 3, isCorrect: true, studentAnswer: 'D', correctAnswer: 'D', score: 2, maxScore: 2, questionType: 'fill-in-blank' },
    { questionNumber: 4, isCorrect: false, studentAnswer: 'hello', correctAnswer: 'world', score: 0, maxScore: 2, questionType: 'fill-in-blank' },
    { questionNumber: 5, isCorrect: true, studentAnswer: 'X', correctAnswer: 'X', score: 2, maxScore: 2 },
  ],
} as any;

const perfectResult: TestResultRecord = {
  ...baseResult,
  incorrect: 0,
  correct: 5,
  totalScore: 10,
  percentage: 100,
  questionResults: baseResult.questionResults!.map(q => ({ ...q, isCorrect: true, score: 2 })),
} as any;

const resultWithExplanations: TestResultRecord = {
  ...baseResult,
  formativeFeedback: {
    questionExplanations: {
      '2': 'You chose B but C is correct because...',
      '4': 'The answer "world" is required here because...',
    },
  },
} as any;

const resultWithLegacyExplanationKeys: TestResultRecord = {
  ...baseResult,
  formativeFeedback: {
    questionExplanations: {
      'Q2': 'Legacy key format still resolves correctly.',
    },
  },
} as any;

const resultWithPendingReview: TestResultRecord = {
  ...baseResult,
  questionResults: [
    ...baseResult.questionResults!.slice(0, 4),
    { questionNumber: 5, isCorrect: false, studentAnswer: 'My sentence', correctAnswer: 'Model sentence', score: 0, maxScore: 2, questionType: 'sentence-rewrite' },
  ],
  incorrect: 3,
} as any;

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('ReviewTab', () => {
  it('shows incorrect-only by default (Task 7.4)', () => {
    render(<ReviewTab result={baseResult} />);
    // Only 2 incorrect questions should render
    expect(screen.getByTestId('rv-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('rv-card-4')).toBeInTheDocument();
    expect(screen.queryByTestId('rv-card-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rv-card-3')).not.toBeInTheDocument();
  });

  it('does not render the old show-all toggle', () => {
    render(<ReviewTab result={baseResult} />);
    expect(screen.queryByTestId('rv-toggle-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rv-toggle-incorrect')).not.toBeInTheDocument();
  });

  it('renders the incorrect banner with count (Task 7.2)', () => {
    render(<ReviewTab result={baseResult} />);
    expect(screen.getByTestId('rv-incorrect-banner')).toBeInTheDocument();
    expect(screen.getByTestId('rv-incorrect-count')).toHaveTextContent('2');
  });

  it('renders AI explanation callouts when available', () => {
    render(<ReviewTab result={resultWithExplanations} />);
    expect(screen.getByTestId('rv-explanation-2')).toHaveTextContent('You chose B but C is correct');
    expect(screen.getByTestId('rv-explanation-4')).toHaveTextContent('The answer "world" is required');
  });

  it('supports legacy Q-prefixed explanation keys', () => {
    render(<ReviewTab result={resultWithLegacyExplanationKeys} />);
    expect(screen.getByTestId('rv-explanation-2')).toHaveTextContent('Legacy key format still resolves correctly.');
  });

  it('renders pending-review notice for sentence-rewrite', () => {
    render(<ReviewTab result={resultWithPendingReview} />);
    expect(screen.getByTestId('rv-pending-5')).toHaveTextContent('Awaiting teacher review');
  });

  it('renders perfect-score congratulations card (Task 7.9)', () => {
    render(<ReviewTab result={perfectResult} />);
    expect(screen.getByTestId('rv-perfect-score')).toBeInTheDocument();
    expect(screen.getByText('Perfect Score!')).toBeInTheDocument();
    expect(screen.getByText('You answered all questions correctly.')).toBeInTheDocument();
    // Should NOT show the banner
    expect(screen.queryByTestId('rv-incorrect-banner')).not.toBeInTheDocument();
  });

  it('displays question type labels', () => {
    render(<ReviewTab result={baseResult} />);
    expect(screen.getAllByText('MCQ').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Fill-in-blank').length).toBeGreaterThanOrEqual(1);
  });

  it('review cards have correct id attributes (Task 7.5)', () => {
    render(<ReviewTab result={baseResult} />);
    const card2 = document.getElementById('qcard-2');
    const card4 = document.getElementById('qcard-4');
    expect(card2).toBeTruthy();
    expect(card4).toBeTruthy();
  });

  it('scrolls to and highlights the requested incorrect question', () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    const onHighlightComplete = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <ReviewTab
        result={baseResult}
        highlightedQuestionNumber={2}
        onHighlightComplete={onHighlightComplete}
      />,
    );

    const card = screen.getByTestId('rv-card-2');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(card).toHaveClass('rv-card--highlighted');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onHighlightComplete).toHaveBeenCalledTimes(1);
    expect(card).not.toHaveClass('rv-card--highlighted');
    vi.useRealTimers();
  });
});
