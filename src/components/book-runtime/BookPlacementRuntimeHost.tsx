import { useEffect, useMemo, useState } from 'react';
import {
  BookRuntimeShell,
  type BookRuntimeAction,
  type BookRuntimeShellActivity,
  type BookRuntimeViewerAdapter,
} from './BookRuntimeShell';
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
import { useNavigation } from '../../hooks/useNavigation';

export interface BookPlacementRuntimeHostProps {
  readonly projection: BookRuntimeDeliveryProjection;
  readonly activityClient?: Pick<BookActivityLaunchBrowserClient, 'readActivities'>;
  readonly registry?: ActivityRendererRegistry;
  readonly viewer?: BookRuntimeViewerAdapter;
  readonly launchError?: string | null;
  readonly onAction?: (action: BookRuntimeAction, metadata?: Record<string, unknown>) => void;
  readonly onReturn?: () => void;
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
  <main style={pageStyle} data-testid="book-placement-runtime-host">
    <section style={panelStyle} role={error ? 'alert' : 'status'} aria-live="polite">
      <h1 style={{ marginTop: 0, fontSize: '1.5rem' }}>{title}</h1>
      <p>{message}</p>
      <ReturnButton onClick={onReturn} />
    </section>
  </main>
);

export const BookPlacementRuntimeHost = ({
  projection,
  activityClient,
  registry = bookActivityRendererRegistry,
  viewer,
  launchError = null,
  onAction,
  onReturn,
}: BookPlacementRuntimeHostProps) => {
  const { navigateTo } = useNavigation('student');
  const [activities, setActivities] = useState<readonly BookRuntimeShellActivity[]>([]);
  const [loading, setLoading] = useState(!launchError);
  const [error, setError] = useState<string | null>(launchError);
  const [responses, setResponses] = useState<Readonly<Record<string, unknown>>>({});

  const client = useMemo(
    () => activityClient ?? createBookActivityLaunchBrowserClient(),
    [activityClient?.readActivities],
  );
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
    () => viewer ?? createBookRuntimeViewerAdapter({ title: projection.book.bookId }),
    [projection.book.bookId, viewer],
  );

  const returnToEntry = () => {
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
    setActivities([]);
    setResponses({});

    void client.readActivities(launchInput)
      .then((loaded) => {
        if (!mounted) return;
        setActivities(loaded);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        setError(reason instanceof Error ? reason.message : 'Book Activities could not be loaded.');
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [client, launchError, launchInput]);

  if (loading) {
    return <StateView title="Loading Book" message="Loading the published Activities for this Book." onReturn={returnToEntry} />;
  }

  if (error) {
    return <StateView title="Book unavailable" message={error} onReturn={returnToEntry} error />;
  }

  return (
    <main data-testid="book-placement-runtime-host" style={{ minHeight: '100vh' }}>
      <div style={{ padding: '12px 24px' }}>
        <ReturnButton onClick={returnToEntry} />
      </div>
      <BookRuntimeShell
        activities={activities}
        deliveryProjection={projection}
        onAction={onAction}
        onResponseChange={(interactionId, response) => {
          setResponses((previous) => ({ ...previous, [interactionId]: response }));
        }}
        registry={registry}
        responses={responses}
        viewer={runtimeViewer}
      />
    </main>
  );
};

export default BookPlacementRuntimeHost;
