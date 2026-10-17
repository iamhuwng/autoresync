import React from 'react';
import type {
  BookActivityStudentResultProjection,
} from '../../services/book-activity/bookResultVisibility.service';
import './BookActivityResultFeedback.css';

export interface BookActivityResultFeedbackProps {
  readonly projection: BookActivityStudentResultProjection | null;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
}

const displayValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    const encoded = JSON.stringify(value, null, 2);
    return encoded === undefined ? 'No response was recorded.' : encoded;
  } catch {
    return 'This information could not be displayed.';
  }
};

const titleCase = (value: string): string => (
  value.replace(/_/gu, ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase())
);

export const BookActivityResultFeedback: React.FC<BookActivityResultFeedbackProps> = ({
  projection,
  loading = false,
  error = null,
  onRetry,
}) => {
  if (loading && !projection) {
    return (
      <section className="book-evaluation-feedback" aria-label="Activity evaluation">
        <p className="book-evaluation-feedback__state" role="status">
          Loading released evaluation details…
        </p>
      </section>
    );
  }

  if (error && !projection) {
    return (
      <section className="book-evaluation-feedback" aria-label="Activity evaluation">
        <div className="book-evaluation-feedback__error" role="alert">
          <p>{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry}>Try again</button>
          )}
        </div>
      </section>
    );
  }

  if (!projection || projection.status === 'hidden') {
    return (
      <section className="book-evaluation-feedback" aria-label="Activity evaluation">
        <p className="book-evaluation-feedback__state" role="status">
          Evaluation details are not available.
        </p>
      </section>
    );
  }

  const hasReleasedEvaluation = projection.score !== undefined
    || projection.answerKey !== undefined
    || projection.correctness !== undefined
    || projection.feedback !== undefined;

  return (
    <section
      className="book-evaluation-feedback"
      aria-labelledby={`book-evaluation-feedback-${projection.attemptId}`}
    >
      <header className="book-evaluation-feedback__header">
        <div>
          <p className="book-evaluation-feedback__eyebrow">Activity evaluation</p>
          <h3 id={`book-evaluation-feedback-${projection.attemptId}`}>
            {projection.status === 'pending_review' ? 'Awaiting teacher review' : 'Released result'}
          </h3>
        </div>
        {projection.score && (
          <strong className="book-evaluation-feedback__score">
            {projection.score.displayScore}
          </strong>
        )}
      </header>

      {error && (
        <div className="book-evaluation-feedback__error" role="alert">
          <p>{error} The last released evaluation remains visible.</p>
          {onRetry && (
            <button type="button" onClick={onRetry}>Try again</button>
          )}
        </div>
      )}

      {projection.correction && (
        <aside className="book-evaluation-feedback__correction" role="status">
          <p className="book-evaluation-feedback__eyebrow">Correction · revision {projection.correction.revision}</p>
          <strong>Previously released evaluation information changed.</strong>
          <p>{projection.correction.note}</p>
        </aside>
      )}

      {projection.studentResponse !== undefined && (
        <div className="book-evaluation-feedback__block">
          <h4>Your submitted response</h4>
          <pre>{displayValue(projection.studentResponse)}</pre>
        </div>
      )}

      {projection.answerKey !== undefined && (
        <div className="book-evaluation-feedback__block" data-testid="book-released-answer-key">
          <h4>Released answer</h4>
          <pre>{displayValue(projection.answerKey)}</pre>
        </div>
      )}

      {projection.correctness !== undefined && (
        <div className="book-evaluation-feedback__block">
          <h4>Question review</h4>
          {projection.correctness.length === 0 ? (
            <p className="book-evaluation-feedback__muted">No question-level review was recorded.</p>
          ) : (
            <ul className="book-evaluation-feedback__facts">
              {projection.correctness.map((fact) => (
                <li key={fact.interactionId}>
                  <span>{fact.interactionId}</span>
                  <strong>{titleCase(fact.outcome)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {projection.feedback !== undefined && (
        <div className="book-evaluation-feedback__block">
          <h4>Teacher feedback</h4>
          <p className="book-evaluation-feedback__copy">{projection.feedback}</p>
        </div>
      )}

      {projection.status === 'graded' && !hasReleasedEvaluation && (
        <p className="book-evaluation-feedback__state" role="status">
          Your teacher has completed this evaluation. Detailed results are not released yet.
        </p>
      )}
    </section>
  );
};

export default BookActivityResultFeedback;
