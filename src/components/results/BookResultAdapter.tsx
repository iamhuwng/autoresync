import React from 'react';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import type {
  BookResultAttemptDetail,
  BookResultGroupSummary,
} from '../../services/book-activity/results/bookResult.types';
import {
  BookResultBrowserError,
  createBookResultBrowserClient,
  parseBookResultRouteHandle,
  type BookResultBrowserClient,
} from '../../services/bookResult.browser';
import { StudentLayout } from '../layout/StudentLayout';
import { StudentSidebar } from '../layout/StudentSidebar';
import { BookGroupedResultView } from './BookGroupedResultView';
import './BookResultAdapter.css';

export interface BookResultAdapterProps {
  readonly routeHandle: string;
  readonly viewerRole: 'student' | 'teacher';
  readonly viewerId?: string;
  readonly client?: BookResultBrowserClient;
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

const BookResultAdapterState: React.FC<BookResultAdapterProps> = ({
  routeHandle,
  viewerRole,
  viewerId,
  client: clientOverride,
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

  const selectAttempt = React.useCallback((attemptId: string) => {
    if (!group?.attempts.some((attempt) => attempt.attemptId === attemptId)) return;
    setRequestedAttemptId(attemptId);
    trackAction('selectAttempt', {
      surface: 'bookActivityResult',
      attemptNumber: group.attempts.find((attempt) => attempt.attemptId === attemptId)?.attemptNumber,
    });
  }, [group, trackAction]);

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
        <button type="button" onClick={() => setGroupRetry((value) => value + 1)}>
          Try again
        </button>
      </div>
    );
  } else if (group) {
    content = (
      <BookGroupedResultView
        group={group}
        selectedAttemptId={selectedAttemptId || group.latestAttemptId}
        detail={detail}
        detailLoading={detailLoading}
        switchingAttempt={detailLoading && requestedAttemptId !== selectedAttemptId}
        detailError={detailError}
        refreshing={refreshing}
        onAttemptChange={selectAttempt}
        onRetryDetail={() => setDetailRetry((value) => value + 1)}
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

  return <div className="book-result-adapter-main">{content}</div>;
};

export const BookResultAdapter: React.FC<BookResultAdapterProps> = (props) => (
  <BookResultAdapterState
    key={`${props.viewerRole}:${props.viewerId ?? 'missing'}:${props.routeHandle}`}
    {...props}
  />
);

export default BookResultAdapter;
