import React from 'react';
import type {
  BookResultAttemptDetail,
  BookResultAttemptSummary,
  BookResultGroupSummary,
} from '../../services/book-activity/results/bookResult.types';
import type {
  BookActivityStudentResultProjection,
} from '../../services/book-activity/bookResultVisibility.service';
import {
  historicalSourceUnavailableProjection,
} from '../../services/book-delivery/attemptSourceContextProjection.service';
import { BookAttemptSourceReview } from '../book-runtime/BookAttemptSourceReview';
import { AttemptHistory } from './AttemptHistory';
import { BookActivityResultFeedback } from './BookActivityResultFeedback';
import './BookGroupedResultView.css';

export interface BookGroupedResultViewProps {
  readonly group: BookResultGroupSummary;
  readonly selectedAttemptId: string;
  readonly detail: BookResultAttemptDetail | null;
  readonly detailLoading?: boolean;
  readonly switchingAttempt?: boolean;
  readonly detailError?: string | null;
  readonly refreshing?: boolean;
  readonly viewerRole?: 'student' | 'teacher';
  readonly evaluationProjection?: BookActivityStudentResultProjection | null;
  readonly evaluationLoading?: boolean;
  readonly evaluationError?: string | null;
  readonly onRetryEvaluation?: () => void;
  readonly onAttemptChange: (attemptId: string) => void;
  readonly onRetryDetail?: () => void;
  readonly onReviewAction?: (
    action: 'switchResultTab' | 'viewQuestion',
    metadata: Record<string, unknown>,
  ) => void;
}

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
};

const titleCase = (value: string): string => (
  value.replace(/[-_]/gu, ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase())
);

const safeResponseText = (value: unknown): string => {
  try {
    const encoded = JSON.stringify(value, null, 2);
    return encoded === undefined ? 'No response was recorded.' : encoded;
  } catch {
    return 'The submitted response could not be displayed.';
  }
};

const scoreLabel = (attempt: BookResultAttemptSummary): string | undefined => {
  const score = attempt.evaluation.score;
  return score?.displayScore
    ?? (typeof attempt.evaluation.displayScore === 'string'
      ? attempt.evaluation.displayScore
      : undefined);
};

const attemptHistoryItem = (
  attempt: BookResultAttemptSummary,
  includeScore = true,
) => ({
  resultId: attempt.attemptId,
  submittedAt: Date.parse(attempt.submittedAt),
  attemptNumber: attempt.attemptNumber,
  contextLabel: attempt.surface === 'homework' ? 'Homework' : 'Solo',
  statusLabel: titleCase(attempt.evaluationStatus),
  scoreLabel: includeScore ? scoreLabel(attempt) : undefined,
});

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="book-result-detail-row">
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

export const BookGroupedResultView: React.FC<BookGroupedResultViewProps> = ({
  group,
  selectedAttemptId,
  detail,
  detailLoading = false,
  switchingAttempt = false,
  detailError = null,
  refreshing = false,
  viewerRole = 'teacher',
  evaluationProjection = null,
  evaluationLoading = false,
  evaluationError = null,
  onRetryEvaluation,
  onAttemptChange,
  onRetryDetail,
  onReviewAction,
}) => {
  const selectedSummary = group.attempts.find((attempt) => attempt.attemptId === selectedAttemptId)
    ?? group.attempts[0];
  const attempts = group.attempts.map((attempt) => attemptHistoryItem(
    attempt,
    viewerRole !== 'student',
  ));
  const currentAttempt = selectedSummary
    ? attemptHistoryItem(selectedSummary, viewerRole !== 'student')
    : undefined;

  return (
    <section className="book-result" aria-labelledby="book-result-title">
      <header className="book-result-header">
        <div>
          <p className="book-result-eyebrow">Book Activity result</p>
          <h1 id="book-result-title">Review Activity attempts</h1>
          <p className="book-result-subtitle">
            {group.attemptCount} {group.attemptCount === 1 ? 'attempt' : 'attempts'} for Activity{' '}
            <span className="book-result-code">{group.activityId}</span>
          </p>
        </div>
        {refreshing && (
          <span className="book-result-refreshing" role="status">
            Refreshing results…
          </span>
        )}
      </header>

      {selectedSummary && currentAttempt && (
        <div className="book-result-attempt-picker">
          <AttemptHistory
            currentResult={currentAttempt}
            attempts={attempts}
            loading={false}
            onAttemptChange={onAttemptChange}
          />
        </div>
      )}

      {!selectedSummary && (
        <div className="book-result-state" role="status">
          No visible attempts are available.
        </div>
      )}

      {selectedSummary && (
        <article className="book-result-card" aria-labelledby="book-result-attempt-heading">
          {switchingAttempt && (
            <div className="book-result-state" role="status">
              Switching attempt while the current historical context remains visible…
            </div>
          )}
          {detailError && detail && (
            <div className="book-result-state book-result-state--error" role="alert">
              <p>{detailError} The previously selected attempt remains visible.</p>
              {onRetryDetail && (
                <button type="button" onClick={onRetryDetail}>Try again</button>
              )}
            </div>
          )}
          <div className="book-result-card-heading">
            <div>
              <p className="book-result-eyebrow">
                {selectedSummary.surface === 'homework' ? 'Homework' : 'Private Solo'}
              </p>
              <h2 id="book-result-attempt-heading">Attempt {selectedSummary.attemptNumber}</h2>
            </div>
            <span className={`book-result-status book-result-status--${selectedSummary.evaluationStatus}`}>
              {titleCase(selectedSummary.evaluationStatus)}
            </span>
          </div>

          <dl className="book-result-detail-grid">
            <DetailRow label="Submitted" value={formatDateTime(selectedSummary.submittedAt)} />
            <DetailRow label="Completion" value={titleCase(selectedSummary.completionStatus)} />
            <DetailRow label="Placement" value={selectedSummary.placementId} />
            <DetailRow label="Delivery context" value={selectedSummary.deliveryContextId} />
            <DetailRow
              label="Activity version"
              value={`${selectedSummary.activityVersionId} (v${selectedSummary.activityVersion})`}
            />
            <DetailRow
              label="Binding revision"
              value={`${selectedSummary.bindingId} · revision ${selectedSummary.bindingRevision}`}
            />
            <DetailRow
              label="Attempts"
              value={selectedSummary.attemptLimit === null
                ? `${selectedSummary.attemptsUsed} used · no configured limit`
                : `${selectedSummary.attemptsUsed} of ${selectedSummary.attemptLimit} used`}
            />
            <DetailRow
              label="Evaluation"
              value={viewerRole === 'student'
                ? 'See released evaluation below'
                : scoreLabel(selectedSummary)
                ? `${titleCase(selectedSummary.evaluationStatus)} · ${scoreLabel(selectedSummary)}`
                : titleCase(selectedSummary.evaluationStatus)}
            />
          </dl>

          <section className="book-result-section" aria-labelledby="book-result-provenance-heading">
            <h3 id="book-result-provenance-heading">Source provenance</h3>
            <p className="book-result-provenance-note">
              Historical display-only metadata. It does not provide document or PDF access.
            </p>
            {selectedSummary.sources.length === 0 ? (
              <p className="book-result-muted">No source material was required for this attempt.</p>
            ) : (
              <ul className="book-result-source-list">
                {selectedSummary.sources.map((source) => (
                  <li key={`${source.sourceKey}:${source.sourceVersionId}`}>
                    <div>
                      <strong>{source.sourceKey}</strong>
                      <span>{source.componentId} · {source.sourceVersionId}</span>
                      <span>Pages {source.pages.join(', ') || 'not recorded'}</span>
                    </div>
                    <span className={`book-result-source-state book-result-source-state--${source.availability}`}>
                      {titleCase(source.availability)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {detailLoading && !detail && (
            <div className="book-result-state" role="status">
              Loading this attempt…
            </div>
          )}

          {detailError && !detail && (
            <div className="book-result-state book-result-state--error" role="alert">
              <p>{detailError}</p>
              {onRetryDetail && (
                <button type="button" onClick={onRetryDetail}>Try again</button>
              )}
            </div>
          )}

          {detail && detail.attemptId === selectedSummary.attemptId && (
            <BookAttemptSourceReview
              key={detail.attemptId}
              onAction={onReviewAction}
              projection={detail.attemptSourceContext
                ?? historicalSourceUnavailableProjection('missing_context')}
            >
              {viewerRole === 'student' ? (
                <BookActivityResultFeedback
                  projection={evaluationProjection}
                  loading={evaluationLoading}
                  error={evaluationError}
                  onRetry={onRetryEvaluation}
                />
              ) : (
                <>
                  <section
                    aria-label={`Interaction ${detail.attemptSourceContext?.metadata?.interactionFocusId ?? detail.interactionId}`}
                    aria-labelledby="book-result-response-heading"
                    className="book-result-section"
                    data-book-interaction-id={
                      detail.attemptSourceContext?.metadata?.interactionFocusId ?? detail.interactionId
                    }
                    tabIndex={-1}
                  >
                    <h3 id="book-result-response-heading">Submitted response</h3>
                    <pre className="book-result-response">{safeResponseText(detail.response)}</pre>
                  </section>

                  {detail.feedback.available && detail.feedback.text && (
                    <section className="book-result-section" aria-labelledby="book-result-feedback-heading">
                      <h3 id="book-result-feedback-heading">Feedback</h3>
                      <p className="book-result-feedback">{detail.feedback.text}</p>
                    </section>
                  )}

                  {!detail.feedback.available && detail.feedback.release !== 'not-applicable' && (
                    <p className="book-result-muted" role="status">
                      Feedback is {titleCase(detail.feedback.release).toLowerCase()}.
                    </p>
                  )}
                </>
              )}
            </BookAttemptSourceReview>
          )}
        </article>
      )}
    </section>
  );
};

export default BookGroupedResultView;
