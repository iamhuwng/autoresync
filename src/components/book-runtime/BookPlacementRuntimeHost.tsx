import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  BookRuntimeShell,
  type BookRuntimeAction,
  type BookRuntimeShellActivity,
  type BookRuntimeViewerAdapter,
  type BookRuntimeActivitySummary,
} from './BookRuntimeShell';
import { BookRuntimeActivityCard } from './BookRuntimeActivityCard';
import { PersonalTimer } from './PersonalTimer';
import {
  createBookRuntimeViewerAdapter,
} from './BookRuntimeViewerAdapter';
import type { ActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import { bookActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import {
  createBookActivityLaunchBrowserClient,
  type BookActivityLaunchBrowserClient,
  type BookActivityLaunchInput,
} from '../../services/book-activity/activityLaunch.browser';
import type { BookRuntimeDeliveryProjection } from '../../services/book-delivery/bookDelivery.types';
import { resolveBookDeliveryWorkerOrigin } from '../../services/book-delivery/bookDelivery.browser';
import { createBookIntegrityCaptureClient } from '../../services/book-activity/bookIntegrityCapture.service';
import type { BookIntegrityCaptureClient } from '../../services/book-activity/bookIntegrityCapture.types';
import { useNavigation } from '../../hooks/useNavigation';
import { toast } from '../modern';

export interface BookPlacementRuntimeHostProps {
  readonly projection: BookRuntimeDeliveryProjection;
  readonly activityClient?: Pick<BookActivityLaunchBrowserClient, 'readActivities'>
    & Partial<Pick<BookActivityLaunchBrowserClient, 'readHomeworkActivities'>>;
  readonly registry?: ActivityRendererRegistry;
  readonly viewer?: BookRuntimeViewerAdapter;
  readonly launchError?: string | null;
  readonly onAction?: (action: BookRuntimeAction, metadata?: Record<string, unknown>) => void;
  readonly onReturn?: () => void;
  readonly onProjectionExpired?: (reason: 'not-found' | 'stale-binding') => void | Promise<void>;
}

const pageStyle = {
  minHeight: '100vh',
  padding: 24,
  background: '#f8f9fa',
  color: '#2b3437',
  boxSizing: 'border-box' as const,
};

const panelStyle = {
  maxWidth: 560,
  margin: '48px auto',
  padding: 24,
  background: '#fff',
  border: '1px solid #e1e6e8',
  borderRadius: 12,
};

const ReturnButton = ({ onClick }: { readonly onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      minHeight: 44,
      padding: '10px 16px',
      border: 0,
      borderRadius: 8,
      background: '#4d44e3',
      color: '#fff',
      fontWeight: 700,
      cursor: 'pointer',
    }}
  >
    Return
  </button>
);

const StateView = ({
  title,
  message,
  onReturn,
  error = false,
}: {
  readonly title: string;
  readonly message: string;
  readonly onReturn: () => void;
  readonly error?: boolean;
}) => (
  <main className="student-view-root" style={pageStyle} data-testid="book-placement-runtime-host">
    <section style={panelStyle} role={error ? 'alert' : 'status'} aria-live="polite">
      <h1 style={{ marginTop: 0, fontSize: '1.5rem' }}>{title}</h1>
      <p>{message}</p>
      <ReturnButton onClick={onReturn} />
    </section>
  </main>
);

const BookPersistentRuntimeReady = ({ activities, projection, registry, viewer, onAction, integrityClient, onFlushRegistration, onReturn }: {
  readonly activities: readonly BookRuntimeShellActivity[];
  readonly projection: BookRuntimeDeliveryProjection;
  readonly registry: ActivityRendererRegistry;
  readonly viewer: BookRuntimeViewerAdapter;
  readonly onAction?: BookPlacementRuntimeHostProps['onAction'];
  readonly integrityClient: BookIntegrityCaptureClient;
  readonly onFlushRegistration: (flush: (() => Promise<void>) | null) => void;
  readonly onReturn: () => void;
}) => {
  const flushers = useRef(new Map<string, () => Promise<void>>());
  const [summaries, setSummaries] = useState<Record<string, BookRuntimeActivitySummary>>({});
  const registerActivityFlush = useCallback((id: string, flush: (() => Promise<void>) | null) => {
    if (flush) flushers.current.set(id, flush);
    else flushers.current.delete(id);
  }, []);
  const flushAll = useCallback(async () => { await Promise.all([...flushers.current.values()].map((flush) => flush())); }, []);
  useEffect(() => { onFlushRegistration(flushAll); return () => onFlushRegistration(null); }, [flushAll, onFlushRegistration]);
  const onSummary = useCallback((id: string, summary: BookRuntimeActivitySummary) => {
    setSummaries((current) => current[id] === summary ? current : { ...current, [id]: summary });
  }, []);
  const integrityCapture = useMemo(() => {
    if (projection.context.kind !== 'homework') return undefined;
    const placements = projection.activities.flatMap((activity) => activity.integrityCapture ? [[activity.placementId, activity.integrityCapture] as const] : []);
    if (!placements.length) return undefined;
    return { client: integrityClient,
      frozenPoliciesByPlacementId: Object.fromEntries(placements.map(([id, capture]) => [id, capture.frozenPolicy])),
      captureSlotsByPlacementId: Object.fromEntries(placements.map(([id, capture]) => [id, { captureSlotId: capture.captureSlotId, captureAttemptNumber: capture.captureAttemptNumber }])),
      enabledByPlacementId: Object.fromEntries(placements.map(([id, capture]) => [id, capture.enabled])),
      activeByPlacementId: Object.fromEntries(projection.activities.map((item) => [item.placementId, summaries[JSON.stringify([item.placementId, item.activityId, item.activityVersionId])]?.captureActive ?? false])),
      enabled: true, active: true, onWarning: (warning: { readonly message: string }) => toast.warning(warning.message) };
  }, [integrityClient, projection, summaries]);
  return <BookRuntimeShell activities={activities} deliveryProjection={projection} registry={registry} viewer={viewer}
    responses={{}} onResponseChange={() => {}} onAction={onAction} onReturn={onReturn}
    onFlushBeforeNavigate={flushAll} onNavigationError={() => toast.error('Navigation stopped. Save or recover the affected Activity before leaving.')}
    activitySummaries={summaries} integrityCapture={integrityCapture}
    personalTimer={<PersonalTimer timerKey={`${projection.recipientId}:${projection.context.contextId}:${projection.book.bookId}`} countdownMs={20 * 60_000} compact />}
    renderActivity={(activity, questionTools) => {
      const placement = activity.placement;
      if (!('activityVersion' in placement) || !('activityVersionId' in placement)) return <p role="alert">Activity version is unavailable.</p>;
      return <BookRuntimeActivityCard key={`${projection.recipientId}:${projection.context.contextId}:${activity.runtimeKey}`} activity={{ ...activity, placement }} projection={projection} registry={registry}
        onAction={onAction} registerFlush={registerActivityFlush} onSummary={onSummary} questionTools={questionTools} />;
    }} />;
};
export const BookPlacementRuntimeHost = ({
  projection,
  activityClient,
  registry = bookActivityRendererRegistry,
  viewer,
  launchError = null,
  onAction,
  onReturn,
  onProjectionExpired,
}: BookPlacementRuntimeHostProps) => {
  const { navigateTo } = useNavigation('student');
  const [activities, setActivities] = useState<readonly BookRuntimeShellActivity[]>([]);
  const [loading, setLoading] = useState(!launchError);
  const [error, setError] = useState<string | null>(launchError);
  const flushBeforeProjectionRefresh = useRef<(() => Promise<void>) | null>(null);
  const activityPinsKey = projection.activities
    .map(({ placementId, activityId, activityVersionId }) => `${placementId}:${activityId}:${activityVersionId}`)
    .join('|');
  const loadedActivityPinsKey = useRef<string | null>(null);
  const registerFlush = useCallback((flush: (() => Promise<void>) | null) => {
    flushBeforeProjectionRefresh.current = flush;
  }, []);

  const client = useMemo(
    () => activityClient ?? createBookActivityLaunchBrowserClient(),
    [activityClient?.readActivities],
  );
  const integrityClient = useMemo(() => createBookIntegrityCaptureClient({
    baseUrl: resolveBookDeliveryWorkerOrigin(),
    getIdToken: async () => {
      const user = getAuth().currentUser;
      if (!user) throw new Error('book_integrity_authentication_required');
      return user.getIdToken();
    },
  }), []);
  const launchInput = useMemo<BookActivityLaunchInput>(() => ({
    bindingId: projection.bindingId,
    bindingRevision: projection.bindingRevision,
    contextId: projection.context.contextId,
    activityPins: projection.activities.map((activity) => ({
      activityId: activity.activityId,
      activityVersionId: activity.activityVersionId,
    })),
    recipientId: projection.recipientId,
  }), [projection]);
  const runtimeViewer = useMemo(
    () => viewer ?? createBookRuntimeViewerAdapter({
      title: projection.book.bookId,
      onRouteExpired: (reason) => {
        void (async () => {
          try {
            await flushBeforeProjectionRefresh.current?.();
            await onProjectionExpired?.(reason);
          } catch {
            toast.error('Save your Activity response before refreshing this Book.');
          }
        })();
      },
    }),
    [onProjectionExpired, projection.book.bookId, viewer],
  );

  const returnToEntry = async () => {
    try { await flushBeforeProjectionRefresh.current?.(); }
    catch { toast.error('Save or recover the affected Activity before leaving.'); return; }
    onAction?.('bookRuntimeReturn', {
      surface: projection.context.kind,
      contextId: projection.context.contextId,
      bindingId: projection.bindingId,
      destination: onReturn ? 'entry-callback' : 'courses',
      outcome: 'returned',
    });
    if (onReturn) {
      onReturn();
      return;
    }
    navigateTo('STUDENT_COURSES', undefined, {
      force: true,
      reason: 'book_runtime_return',
    });
  };

  useEffect(() => {
    if (launchError) {
      setLoading(false);
      setError(launchError);
      setActivities([]);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);
    if (activities.length > 0 && loadedActivityPinsKey.current === activityPinsKey) {
      setLoading(false);
      return;
    }
    setActivities([]);

    const load = projection.context.kind === 'homework'
      ? client.readHomeworkActivities?.({
        assignmentId: projection.context.contextId,
        placements: projection.activities.map((activity) => ({
          placementId: activity.placementId,
          activityId: activity.activityId,
          activityVersionId: activity.activityVersionId,
        })),
      }) ?? Promise.reject(new Error('book_homework_context_unavailable'))
      : client.readActivities(launchInput);
    void load
      .then((loaded) => {
        if (!mounted) return;
        setActivities(loaded);
        loadedActivityPinsKey.current = activityPinsKey;
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setError('Book Activities could not be loaded. Please retry or return.');
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activities.length, activityPinsKey, client, launchError, launchInput, projection]);

  if (loading) {
    return <StateView title="Loading Book" message="Loading the published Activities for this Book." onReturn={returnToEntry} />;
  }

  if (error) {
    return <StateView title="Book unavailable" message={error} onReturn={returnToEntry} error />;
  }

  return (
    <main className="student-view-root book-runtime-host" data-testid="book-placement-runtime-host">
        <BookPersistentRuntimeReady key={`${projection.recipientId}:${projection.context.contextId}:${activityPinsKey}`}
          activities={activities}
          onAction={onAction}
          onFlushRegistration={registerFlush}
          projection={projection}
          integrityClient={integrityClient}
          registry={registry}
          viewer={runtimeViewer}
          onReturn={() => void returnToEntry()}
        />
    </main>
  );
};

export default BookPlacementRuntimeHost;
