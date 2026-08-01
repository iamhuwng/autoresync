import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  BookActivityStudentResultProjection,
} from '../../services/book-activity/bookResultVisibility.service';
import { BookActivityResultFeedback } from './BookActivityResultFeedback';

describe('BookActivityResultFeedback', () => {
  it('renders the safest hidden state without denied evaluation fields', () => {
    render(
      <BookActivityResultFeedback
        projection={{ attemptId: 'attempt-1', status: 'hidden' }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Evaluation details are not available.',
    );
    expect(screen.queryByText(/score|feedback|answer|correct/iu)).not.toBeInTheDocument();
  });

  it('shows only the submitted response while review is pending', () => {
    render(
      <BookActivityResultFeedback
        projection={{
          attemptId: 'attempt-1',
          status: 'pending_review',
          studentResponse: { text: 'My answer' },
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Awaiting teacher review' })).toBeInTheDocument();
    expect(screen.getByText(/My answer/)).toBeInTheDocument();
    expect(screen.queryByText('Teacher feedback')).not.toBeInTheDocument();
    expect(screen.queryByTestId('book-released-answer-key')).not.toBeInTheDocument();
  });

  it('shows independently released fields and an audit-visible correction', () => {
    const projection: BookActivityStudentResultProjection = {
      attemptId: 'attempt-1',
      status: 'graded',
      score: {
        earnedScore: 2,
        maximumScore: 2,
        displayScore: '2.00 / 2.00',
      },
      feedback: 'Updated feedback',
      correction: {
        note: 'A marking mistake was corrected.',
        revision: 2,
        previousRevision: 1,
        evaluatedAt: '2026-08-02T00:00:00.000Z',
      },
    };
    render(<BookActivityResultFeedback projection={projection} />);

    expect(screen.getByText('2.00 / 2.00')).toBeInTheDocument();
    expect(screen.getByText('Updated feedback')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Previously released evaluation information changed.',
    );
    expect(screen.queryByTestId('book-released-answer-key')).not.toBeInTheDocument();
    expect(screen.queryByText('Question review')).not.toBeInTheDocument();
  });

  it('keeps the last safe projection visible and offers an accessible retry', () => {
    const onRetry = vi.fn();
    render(
      <BookActivityResultFeedback
        projection={{
          attemptId: 'attempt-1',
          status: 'graded',
          feedback: 'Already released',
        }}
        error="Released evaluation details could not be refreshed."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Already released')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The last released evaluation remains visible.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
