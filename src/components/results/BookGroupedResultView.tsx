import React from 'react';
import type {
  BookResultAttemptDetail,
  BookResultAttemptSummary,
  BookResultGroupSummary,
  BookResultSourceAvailability,
} from '../../services/book-activity/results/bookResult.types';
import type {
  BookActivityStudentResultProjection,
} from '../../services/book-activity/bookResultVisibility.service';
import {
  historicalSourceUnavailableProjection,
} from '../../services/book-delivery/attemptSourceContextProjection.service';
import { BookAttemptSourceReview } from '../book-runtime/BookAttemptSourceReview';
import { AttemptHistory } from './AttemptHistory';
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
  readonly onBackToHomework?: () => void;
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

const sourceAvailabilityLabel = (availability: BookResultSourceAvailability): string => {
  if (availability === 'available') return 'Metadata recorded';
  if (availability === 'not-required') return 'Not required';
  return `Unavailable · ${titleCase(availability)}`;
};

const sourceAvailabilityDescription = (availability: BookResultSourceAvailability): string => {
  if (availability === 'available') return 'Historical source metadata recorded; review access is shown below';
  if (availability === 'not-required') return 'No PDF was required for this activity';
  return `Original PDF unavailable; result preserved (${titleCase(availability).toLowerCase()})`;
};

const safeResponseText = (value: unknown): string => {
  try {
    const encoded = JSON.stringify(value, null, 2);
    return encoded === undefined ? 'No response was recorded.' : encoded;
  } catch {
    return 'The submitted response could not be displayed.';
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const responseSummary = (value: unknown): string => {
  const preview = (text: string): string => (
    text.length > 160 ? `${text.slice(0, 157)}…` : text
  );
  if (typeof value === 'string' && value.trim() !== '') return preview(value.trim());
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? 'response' : 'responses'} recorded`;
  }
  if (!isRecord(value)) return 'Response recorded';

  for (const key of ['text', 'answer', 'choice']) {
    if (typeof value[key] === 'string' && value[key].trim() !== '') return preview(value[key].trim());
  }
  if (typeof value.selectedOptionId === 'string') return 'One answer selected';
  if (Array.isArray(value.selectedOptionIds)) {
    return `${value.selectedOptionIds.length} ${value.selectedOptionIds.length === 1 ? 'answer' : 'answers'} selected`;
  }
  if (Array.isArray(value.answers)) {
    return `${value.answers.length} ${value.answers.length === 1 ? 'answer' : 'answers'} recorded`;
  }
  return 'Response recorded';
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
  statusLabel: includeScore ? titleCase(attempt.evaluationStatus) : undefined,
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
  onBackToHomework,
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
  const hasReleasedStudentEvaluation = evaluationProjection?.score !== undefined
    || evaluationProjection?.answerKey !== undefined
    || evaluationProjection?.correctness !== undefined
    || evaluationProjection?.feedback !== undefined;

  return (
    <section className="book-result" aria-labelledby="book-result-title">
      <header className="book-result-header">
        <div>
          <p className="book-result-eyebrow">Book Activity result</p>
          <h1 id="book-result-title">
            {viewerRole === 'student' ? 'Activity result' : 'Review Activity attempts'}
          </h1>
          <p className="book-result-subtitle">
            {viewerRole === 'student'
              ? 'Your submitted activity'
              : `${group.attemptCount} ${group.attemptCount === 1 ? 'attempt' : 'attempts'} recorded`}
          </p>
        </div>
        {onBackToHomework && (
          <button type="button" className="book-result-back" onClick={onBackToHomework}>
            Back to homework
          </button>
        )}
        {refreshing && (
          <span className="book-result-refreshing" role="status">
            Refreshing results…
          </span>
        )}
      </header>

      {selectedSummary && currentAttempt && group.attempts.length > 1 && (
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
            {viewerRole !== 'student' && (
              <span className={`book-result-status book-result-status--${selectedSummary.evaluationStatus}`}>
                {titleCase(selectedSummary.evaluationStatus)}
              </span>
            )}
          </div>

          <dl className="book-result-detail-grid">
            {viewerRole !== 'student' && (
              <DetailRow label="Submitted" value={formatDateTime(selectedSummary.submittedAt)} />
            )}
            <DetailRow label="Completion" value={titleCase(selectedSummary.completionStatus)} />
            <DetailRow
              label={viewerRole === 'student' ? 'Review' : 'Evaluation'}
              value={viewerRole === 'student'
                ? hasReleasedStudentEvaluation ? 'Reviewed' : 'Feedback pending'
                : scoreLabel(selectedSummary)
                ? `${titleCase(selectedSummary.evaluationStatus)} · ${scoreLabel(selectedSummary)}`
                : titleCase(selectedSummary.evaluationStatus)}
            />
          </dl>

          {viewerRole !== 'student' && (
            <details className="book-result-technical">
              <summary>Technical attempt details</summary>
              <dl className="book-result-detail-grid book-result-detail-grid--technical">
                <DetailRow label="Activity ID" value={group.activityId} />
                <DetailRow label="Student ID" value={group.studentId} />
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
              </dl>
            </details>
          )}

          {viewerRole !== 'student' && (
            <section className="book-result-section" aria-labelledby="book-result-provenance-heading">
              <h3 id="book-result-provenance-heading">Book context</h3>
              <p className="book-result-provenance-note">
                Historical display-only metadata. The review panel below separately shows whether the original PDF is available.
              </p>
              {selectedSummary.sources.length === 0 ? (
                <p className="book-result-muted">No source material was required for this attempt.</p>
              ) : (
                <ul className="book-result-source-list">
                  {selectedSummary.sources.map((source) => (
                    <li key={`${source.sourceKey}:${source.sourceVersionId}`}>
                      <div>
                        <strong>
                          {source.pages.length > 0
                            ? `Component ${source.componentId} · page${source.pages.length === 1 ? '' : 's'} ${source.pages.join(', ')}`
                            : 'Book source'}
                        </strong>
                        <span>{sourceAvailabilityDescription(source.availability)}</span>
                      </div>
                      <div className="book-result-source-actions">
                        <span className={`book-result-source-state book-result-source-state--${source.availability}`}>
                          {sourceAvailabilityLabel(source.availability)}
                        </span>
                        <details className="book-result-technical book-result-technical--inline">
                          <summary>Source details</summary>
                          <span>{source.sourceKey} · {source.componentId} · {source.sourceVersionId}</span>
                        </details>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

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

          {detail && detail.attemptId === selectedSummary.attemptId && viewerRole === 'student' && (
            <div className="book-result-student-feedback">
              {evaluationProjection?.score && (
                <section className="book-result-section" aria-label="Released score">
                  <h3>Score</h3>
                  <p className="book-result-feedback">{evaluationProjection.score.displayScore}</p>
                </section>
              )}
              {evaluationProjection?.feedback !== undefined && (
                <section className="book-result-section" aria-label="Released feedback">
                  <h3>Feedback</h3>
                  <p className="book-result-feedback">{evaluationProjection.feedback}</p>
                </section>
              )}
              {evaluationLoading && (
                <div className="book-result-state" role="status">
                  Loading released evaluation details…
                </div>
              )}
              {evaluationError && (
                <div className="book-result-state book-result-state--error" role="alert">
                  <p>{evaluationError}</p>
                  {onRetryEvaluation && (
                    <button type="button" onClick={onRetryEvaluation}>Try again</button>
                  )}
                </div>
              )}
              {!evaluationLoading && !evaluationError && evaluationProjection?.feedback === undefined && (
                <p className="book-result-muted" role="status">
                  Feedback is not available yet
                </p>
              )}
            </div>
          )}

          {detail && detail.attemptId === selectedSummary.attemptId && viewerRole !== 'student' && (
            <BookAttemptSourceReview
              key={detail.attemptId}
              onAction={onReviewAction}
              projection={detail.attemptSourceContext
                ?? historicalSourceUnavailableProjection('missing_context')}
            >
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
                  <p className="book-result-response-summary">{responseSummary(detail.response)}</p>
                  <details className="book-result-technical">
                    <summary>Technical response data</summary>
                    <pre className="book-result-response">{safeResponseText(detail.response)}</pre>
                  </details>
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
            </BookAttemptSourceReview>
          )}
        </article>
      )}
    </section>
  );
};

export default BookGroupedResultView;
