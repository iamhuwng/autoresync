import React from 'react';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import type {
  BookResultAttemptDetail,
  BookResultGroupSummary,
} from '../../services/book-activity/results/bookResult.types';
import type {
  BookActivityStudentResultProjection,
} from '../../services/book-activity/bookResultVisibility.service';
import {
  createBookActivityEvaluationBrowserClient,
  isBookActivityEvaluationPresentationEnabled,
  type BookActivityEvaluationBrowserClient,
} from '../../services/book-activity/activityEvaluation.browser';
import {
  BookResultBrowserError,
  createBookResultBrowserClient,
  parseBookResultRouteHandle,
  type BookResultBrowserClient,
} from '../../services/bookResult.browser';
import { StudentLayout } from '../layout/StudentLayout';
import { StudentSidebar } from '../layout/StudentSidebar';
import { toast } from '../modern';
import { AttemptHistory, type AttemptHistoryItem } from './AttemptHistory';
import { BookGroupedResultView } from './BookGroupedResultView';
import './BookResultAdapter.css';

export interface BookResultAdapterProps {
  readonly routeHandle: string;
  readonly viewerRole: 'student' | 'teacher';
  readonly viewerId?: string;
  readonly client?: BookResultBrowserClient;
  readonly evaluationClient?: BookActivityEvaluationBrowserClient;
  readonly onBackToHomework?: () => void;
}

const groupCache = new Map<string, BookResultGroupSummary>();
const detailCache = new Map<string, BookResultAttemptDetail>();

export const resetBookResultAdapterCacheForTests = (): void => {
  groupCache.clear();
  detailCache.clear();
};

const visibleError = (error: unknown): string => {
  if (error instanceof BookResultBrowserError) {
    if (error.code === 'forbidden' || error.code === 'unauthorized') {
      return 'You do not have access to this Activity result.';
    }
    if (error.code === 'not_found') return 'This Activity result is no longer available.';
    if (error.code === 'route_disabled') return 'Activity results are temporarily unavailable.';
  }
  return 'We could not load this Activity result. Please try again.';
};

const visibleEvaluationError = (): string => (
  'Released evaluation details could not be refreshed. Try again.'
);

const invalidatesCachedAuthority = (error: unknown): boolean => (
  error instanceof BookResultBrowserError
  && ['forbidden', 'unauthorized', 'not_found', 'route_disabled'].includes(error.code)
);

const LoadingState = () => (
  <div className="book-result-adapter-state" role="status">
    <span className="book-result-adapter-spinner" aria-hidden="true" />
    Loading Activity attempts…
  </div>
);

const backToHomeworkStyle: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '0.65rem 1rem',
  border: '1px solid #abb3b7',
  borderRadius: '0.625rem',
  background: '#fff',
  color: '#2b3437',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
};

const resultActionStyle: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
};

const BackToHomework: React.FC<{ onClick?: () => void; label?: string }> = ({ onClick, label = 'Back to homework' }) => (
  onClick ? (
    <button type="button" onClick={onClick} style={backToHomeworkStyle}>
      {label}
    </button>
  ) : null
);

const studentCompletionLabel = (status: BookResultGroupSummary['attempts'][number]['completionStatus']): string => (
  status === 'completed' ? 'Complete' : 'Not complete'
);

const studentReviewLabel = (
  projection: BookActivityStudentResultProjection | null,
): string => (
  projection?.score || projection?.feedback !== undefined ? 'Reviewed' : 'Feedback pending'
);

const StudentBookResultView: React.FC<{
  group: BookResultGroupSummary;
  selectedAttemptId: string;
  detail: BookResultAttemptDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  refreshing: boolean;
  evaluationProjection: BookActivityStudentResultProjection | null;
  evaluationLoading: boolean;
  evaluationError: string | null;
  onAttemptChange: (attemptId: string) => void;
  onRetryDetail: () => void;
  onRetryEvaluation: () => void;
  onBackToHomework?: () => void;
}> = ({
  group,
  selectedAttemptId,
  detail,
  detailLoading,
  detailError,
  refreshing,
  evaluationProjection,
  evaluationLoading,
  evaluationError,
  onAttemptChange,
  onRetryDetail,
  onRetryEvaluation,
  onBackToHomework,
}) => {
  const selectedSummary = group.attempts.find((attempt) => attempt.attemptId === selectedAttemptId)
    ?? group.attempts[0];
  const publicPractice = selectedSummary?.surface === 'public';
  const attempts: AttemptHistoryItem[] = group.attempts.map((attempt) => ({
    resultId: attempt.attemptId,
    submittedAt: Date.parse(attempt.submittedAt),
    attemptNumber: attempt.attemptNumber,
  }));

  return (
    <section className="book-result" aria-labelledby="student-book-result-title">
      <header className="book-result-header">
        <div>
          <p className="book-result-eyebrow">{publicPractice ? 'Public practice' : 'Homework'}</p>
          <h1 id="student-book-result-title">Activity result</h1>
          <p className="book-result-subtitle">Your submitted activity</p>
        </div>
        {refreshing && (
          <span className="book-result-refreshing" role="status">Refreshing result…</span>
        )}
      </header>

      <BackToHomework onClick={onBackToHomework} label={publicPractice ? 'Back to library' : undefined} />

      {selectedSummary && (
        <article className="book-result-card" aria-labelledby="student-book-result-summary">
          <h2 id="student-book-result-summary">Submission summary</h2>
          {attempts.length > 1 && (
            <div className="book-result-attempt-picker">
              <AttemptHistory
                currentResult={attempts.find((attempt) => attempt.resultId === selectedSummary.attemptId) ?? attempts[0]!}
                attempts={attempts}
                onAttemptChange={onAttemptChange}
              />
            </div>
          )}

          <dl className="book-result-detail-grid">
            <div className="book-result-detail-row">
              <dt>Completion</dt>
              <dd>{studentCompletionLabel(selectedSummary.completionStatus)}</dd>
            </div>
            <div className="book-result-detail-row">
              <dt>Review</dt>
              <dd>{publicPractice ? 'Not applicable' : studentReviewLabel(evaluationProjection)}</dd>
            </div>
            {!publicPractice && evaluationProjection?.score && (
              <div className="book-result-detail-row">
                <dt>Score</dt>
                <dd>{evaluationProjection.score.displayScore}</dd>
              </div>
            )}
          </dl>

          {detailLoading && !detail && (
            <div className="book-result-state" role="status">Loading result details…</div>
          )}
          {detailError && !detail && (
            <div className="book-result-state book-result-state--error" role="alert">
              <p>{detailError}</p>
              <button type="button" onClick={onRetryDetail} style={resultActionStyle}>Try again</button>
            </div>
          )}
          {evaluationLoading && !evaluationProjection && (
            <div className="book-result-state" role="status">Loading feedback…</div>
          )}
          {evaluationError && !evaluationProjection && (
            <div className="book-result-state book-result-state--error" role="alert">
              <p>{evaluationError}</p>
              <button type="button" onClick={onRetryEvaluation} style={resultActionStyle}>Try again</button>
            </div>
          )}
          {!publicPractice && evaluationProjection?.feedback !== undefined && (
            <section className="book-result-section" aria-labelledby="student-book-feedback-heading">
              <h3 id="student-book-feedback-heading">Feedback</h3>
              <p>{evaluationProjection.feedback}</p>
            </section>
          )}
          {!publicPractice && detail?.feedback.release === 'released' && detail.feedback.correctionNote !== undefined && (
            <aside className="book-result-section" aria-labelledby="student-book-correction-heading">
              <h3 id="student-book-correction-heading">Correction</h3>
              <p>{detail.feedback.correctionNote}</p>
            </aside>
          )}
          {!evaluationLoading && evaluationProjection?.feedback === undefined && (
            <p className="book-result-muted" role="status">{publicPractice ? 'Feedback does not apply to Public practice.' : 'Feedback is not available yet'}</p>
          )}
        </article>
      )}
    </section>
  );
};

const BookResultAdapterState: React.FC<BookResultAdapterProps> = ({
  routeHandle,
  viewerRole,
  viewerId,
  client: clientOverride,
  evaluationClient: evaluationClientOverride,
  onBackToHomework,
}) => {
  const address = React.useMemo(
    () => parseBookResultRouteHandle(routeHandle),
    [routeHandle],
  );
  const [client] = React.useState<BookResultBrowserClient | null>(() => {
    if (clientOverride) return clientOverride;
    try {
      return createBookResultBrowserClient();
    } catch {
      return null;
    }
  });
  const [evaluationClient] = React.useState<BookActivityEvaluationBrowserClient | null>(() => {
    if (evaluationClientOverride) return evaluationClientOverride;
    if (viewerRole !== 'student' || !isBookActivityEvaluationPresentationEnabled()) return null;
    try {
      return createBookActivityEvaluationBrowserClient();
    } catch {
      return null;
    }
  });
  const viewerCacheKey = `${viewerRole}:${viewerId ?? 'missing'}:${routeHandle}`;
  const cachedGroup = viewerId ? groupCache.get(viewerCacheKey) ?? null : null;
  const [group, setGroup] = React.useState<BookResultGroupSummary | null>(cachedGroup);
  const [selectedAttemptId, setSelectedAttemptId] = React.useState(
    cachedGroup?.latestAttemptId ?? '',
  );
  const [requestedAttemptId, setRequestedAttemptId] = React.useState(
    cachedGroup?.latestAttemptId ?? '',
  );
  const [detail, setDetail] = React.useState<BookResultAttemptDetail | null>(() => {
    const latest = cachedGroup?.attempts.find(
      (attempt) => attempt.attemptId === cachedGroup.latestAttemptId,
    );
    return latest ? detailCache.get(`${viewerCacheKey}:${latest.resultId}`) ?? null : null;
  });
  const [groupLoading, setGroupLoading] = React.useState(cachedGroup === null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(cachedGroup !== null);
  const [groupError, setGroupError] = React.useState<string | null>(null);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [groupRetry, setGroupRetry] = React.useState(0);
  const [detailRetry, setDetailRetry] = React.useState(0);
  const [evaluationProjection, setEvaluationProjection] = React.useState<
    BookActivityStudentResultProjection | null
  >(null);
  const [evaluationLoading, setEvaluationLoading] = React.useState(false);
  const [evaluationError, setEvaluationError] = React.useState<string | null>(null);
  const [evaluationRetry, setEvaluationRetry] = React.useState(0);
  const [releasingFeedback, setReleasingFeedback] = React.useState(false);
  const releaseInFlight = React.useRef(false);
  const { trackAction } = useFeatureTracking(FEATURE_IDS.results);

  const accessMismatch = !viewerId || (viewerRole === 'student'
    && Boolean(address && address.studentId !== viewerId));

  React.useEffect(() => {
    if (!address || !client || accessMismatch) {
      setGroupLoading(false);
      setRefreshing(false);
      return undefined;
    }
    let active = true;
    setGroupError(null);
    if (groupCache.has(viewerCacheKey)) setRefreshing(true);
    else setGroupLoading(true);

    void client.readGroup(address).then((nextGroup) => {
      if (!active) return;
      groupCache.set(viewerCacheKey, nextGroup);
      setGroup(nextGroup);
      setSelectedAttemptId((current) => (
        nextGroup.attempts.some((attempt) => attempt.attemptId === current)
          ? current
          : nextGroup.latestAttemptId
      ));
      setRequestedAttemptId((current) => (
        nextGroup.attempts.some((attempt) => attempt.attemptId === current)
          ? current
          : nextGroup.latestAttemptId
      ));
    }).catch((error: unknown) => {
      if (!active) return;
      if (invalidatesCachedAuthority(error)) {
        groupCache.delete(viewerCacheKey);
        for (const key of detailCache.keys()) {
          if (key.startsWith(`${viewerCacheKey}:`)) detailCache.delete(key);
        }
        setGroup(null);
        setDetail(null);
        setGroupError(visibleError(error));
      } else if (!groupCache.has(viewerCacheKey)) {
        setGroupError(visibleError(error));
      }
    }).finally(() => {
      if (!active) return;
      setGroupLoading(false);
      setRefreshing(false);
    });

    return () => { active = false; };
  }, [accessMismatch, address, client, groupRetry, viewerCacheKey]);

  React.useEffect(() => {
    if (!address || !client || !group || !requestedAttemptId) return undefined;
    const summary = group.attempts.find((attempt) => attempt.attemptId === requestedAttemptId);
    if (!summary) return undefined;
    const cacheKey = `${viewerCacheKey}:${summary.resultId}`;
    const cached = detailCache.get(cacheKey);
    let active = true;
    setDetailError(null);
    if (cached) {
      setDetail(cached);
      setSelectedAttemptId(summary.attemptId);
      setRefreshing(true);
    } else {
      setDetailLoading(true);
    }

    void client.readDetail(address, summary.resultId).then((nextDetail) => {
      if (!active || nextDetail.attemptId !== summary.attemptId) return;
      detailCache.set(cacheKey, nextDetail);
      // Commit the selected result, response, version, source, page, and focus
      // in one React update after the exact detail has been verified.
      setDetail(nextDetail);
      setSelectedAttemptId(summary.attemptId);
    }).catch((error: unknown) => {
      if (!active) return;
      if (invalidatesCachedAuthority(error)) {
        detailCache.delete(cacheKey);
        setDetail(null);
        setDetailError(visibleError(error));
      } else if (!cached) {
        setDetailError(visibleError(error));
      }
    }).finally(() => {
      if (!active) return;
      setDetailLoading(false);
      setRefreshing(false);
    });

    return () => { active = false; };
  }, [address, client, detailRetry, group, requestedAttemptId, viewerCacheKey]);

  React.useEffect(() => {
    if (viewerRole !== 'student'
      || !address
      || !detail
      || detail.attemptId !== selectedAttemptId) {
      return undefined;
    }
    setEvaluationError(null);
    if (detail.feedbackPolicy !== undefined) {
      // This exact detail has already passed the trusted Results release gate.
      const released = detail.feedback.release === 'released';
      setEvaluationProjection({
        attemptId: detail.attemptId,
        status: detail.evaluation.status === 'graded' ? 'graded' : 'pending_review',
        ...(released && detail.evaluation.score ? { score: detail.evaluation.score } : {}),
        ...(released && detail.feedback.text !== undefined ? { feedback: detail.feedback.text } : {}),
      });
      setEvaluationLoading(false);
      if (!released || !evaluationClient || detail.surface !== 'homework') return undefined;
    }
    if (!evaluationClient || detail.surface !== 'homework') {
      setEvaluationProjection({
        attemptId: detail.attemptId,
        status: 'hidden',
      });
      setEvaluationLoading(false);
      return undefined;
    }
    let active = true;
    setEvaluationLoading(true);
    void evaluationClient.readStudentResult({
      bookId: address.bookId,
      studentId: address.studentId,
      contextKind: 'homework',
      contextId: detail.contextId,
      placementId: detail.placementId,
      activityId: detail.activityId,
      activityVersionId: detail.activityVersionId,
      attemptId: detail.attemptId,
    }).then((projection) => {
      // Results owns release visibility. The legacy evaluation read may still
      // supply a newer grade after release, but it must never hide or reopen
      // feedback that the trusted Results detail has already exposed.
      if (active && projection.status === 'graded') {
        setEvaluationProjection((current) => {
          if (!current || detail.feedbackPolicy === undefined) return projection;
          return {
            ...current,
            status: 'graded',
            ...(!current.score && projection.score ? { score: projection.score } : {}),
            ...(current.feedback === undefined && projection.feedback !== undefined
              ? { feedback: projection.feedback }
              : {}),
          };
        });
      }
    }).catch(() => {
      if (active) setEvaluationError(visibleEvaluationError());
    }).finally(() => {
      if (active) setEvaluationLoading(false);
    });
    return () => { active = false; };
  }, [
    address,
    detail,
    evaluationClient,
    evaluationRetry,
    selectedAttemptId,
    viewerRole,
  ]);

  const selectAttempt = React.useCallback((attemptId: string) => {
    if (!group?.attempts.some((attempt) => attempt.attemptId === attemptId)) return;
    setEvaluationProjection(null);
    setEvaluationError(null);
    setRequestedAttemptId(attemptId);
    trackAction('selectAttempt', {
      surface: 'bookActivityResult',
      attemptNumber: group.attempts.find((attempt) => attempt.attemptId === attemptId)?.attemptNumber,
    });
  }, [group, trackAction]);

  const handleBackToHomework = React.useCallback(() => {
    trackAction('bookActivityResultBack', {
      surface: 'bookActivityResult',
      viewerRole,
    });
    onBackToHomework?.();
  }, [onBackToHomework, trackAction, viewerRole]);

  const retryResult = React.useCallback((retry: () => void) => {
    trackAction('bookActivityResultRetried', {
      surface: 'bookActivityResult',
    });
    toast.info('Refreshing Activity result…');
    retry();
  }, [trackAction]);

  const releaseFeedback = async (): Promise<void> => {
    if (releaseInFlight.current || viewerRole !== 'teacher' || !client || !address?.homeworkId
      || !detail || detail.attemptId !== selectedAttemptId || detail.feedbackPolicy !== 'manual'
      || detail.studentFeedbackRelease !== 'withheld') return;
    releaseInFlight.current = true;
    setReleasingFeedback(true);
    trackAction('bookActivityFeedbackReleased', { surface: 'bookActivityResult', attemptNumber: detail.attemptNumber });
    try {
      await client.releaseFeedback(address, detail.resultId);
      detailCache.delete(`${viewerCacheKey}:${detail.resultId}`);
      groupCache.delete(viewerCacheKey);
      setGroupRetry((value) => value + 1);
      setDetailRetry((value) => value + 1);
      toast.success('Feedback released for this attempt.');
    } catch {
      toast.error('Could not release feedback. Please try again.');
    } finally {
      releaseInFlight.current = false;
      setReleasingFeedback(false);
    }
  };

  let content: React.ReactNode;
  if (!address || !client || accessMismatch) {
    content = (
      <div className="book-result-adapter-state book-result-adapter-state--error" role="alert">
        You do not have access to this Activity result.
      </div>
    );
  } else if (groupLoading && !group) {
    content = <LoadingState />;
  } else if (groupError && !group) {
    content = (
      <div className="book-result-adapter-state book-result-adapter-state--error" role="alert">
        <p>{groupError}</p>
        <button
          type="button"
          style={resultActionStyle}
          onClick={() => retryResult(() => setGroupRetry((value) => value + 1))}
        >
          Try again
        </button>
      </div>
    );
  } else if (group) {
    const currentAttemptId = selectedAttemptId || group.latestAttemptId;
    content = viewerRole === 'student' ? (
      <StudentBookResultView
        group={group}
        selectedAttemptId={currentAttemptId}
        detail={detail}
        detailLoading={detailLoading}
        detailError={detailError}
        refreshing={refreshing}
        evaluationProjection={evaluationProjection}
        evaluationLoading={evaluationLoading}
        evaluationError={evaluationError}
        onAttemptChange={selectAttempt}
        onRetryDetail={() => retryResult(() => setDetailRetry((value) => value + 1))}
        onRetryEvaluation={() => retryResult(() => setEvaluationRetry((value) => value + 1))}
        onBackToHomework={onBackToHomework ? handleBackToHomework : undefined}
      />
    ) : (
      <BookGroupedResultView
        group={group}
        selectedAttemptId={currentAttemptId}
        detail={detail}
        detailLoading={detailLoading}
        switchingAttempt={detailLoading && requestedAttemptId !== selectedAttemptId}
        detailError={detailError}
        refreshing={refreshing}
        viewerRole={viewerRole}
        evaluationProjection={evaluationProjection}
        evaluationLoading={evaluationLoading}
        evaluationError={evaluationError}
        onAttemptChange={selectAttempt}
        onRetryDetail={() => retryResult(() => setDetailRetry((value) => value + 1))}
        onBackToHomework={onBackToHomework ? handleBackToHomework : undefined}
        onRetryEvaluation={() => retryResult(() => setEvaluationRetry((value) => value + 1))}
        onReviewAction={(action, metadata) => trackAction(action, {
          surface: 'bookActivityResult',
          ...metadata,
        })}
      />
    );
  } else {
    content = (
      <div className="book-result-adapter-state" role="status">
        No visible attempts are available.
      </div>
    );
  }

  if (viewerRole === 'student') {
    return (
      <StudentLayout
        mobileTitle="Activity results"
        sidebar={<StudentSidebar activePage="records" />}
      >
        <main className="book-result-adapter-main">{content}</main>
      </StudentLayout>
    );
  }

  return <div className="book-result-adapter-main">
    {viewerRole === 'teacher' && address?.homeworkId && detail
      && detail.attemptId === selectedAttemptId && detail.feedbackPolicy === 'manual'
      && detail.studentFeedbackRelease === 'withheld' && (
        <button type="button" style={resultActionStyle}
          disabled={releasingFeedback || detailLoading || refreshing}
          onClick={() => { void releaseFeedback(); }}>
          {releasingFeedback ? 'Releasing feedback…' : 'Release feedback for this attempt'}
        </button>
      )}
    {content}
  </div>;
};

export const BookResultAdapter: React.FC<BookResultAdapterProps> = (props) => (
  <BookResultAdapterState
    key={`${props.viewerRole}:${props.viewerId ?? 'missing'}:${props.routeHandle}`}
    {...props}
  />
);

export default BookResultAdapter;
