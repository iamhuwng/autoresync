import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import type { ActivityResponseValidationState } from '../../services/book-activity/runtime/activityRenderer.types';
import type {
  BookRuntimeDeliveryDocumentRequest,
  BookRuntimeDeliveryProjection,
} from '../../services/book-delivery/bookDelivery.types';
import {
  useBookRuntimeNavigation,
  type BookRuntimeDesktopView,
  type BookRuntimeMobileTab,
  type BookRuntimeNavigationReason,
  type BookRuntimeNavigationState,
} from '../../hooks/book-runtime/useBookRuntimeNavigation';
import { ActivityRendererHost } from './interactions/ActivityRendererHost';
import './BookRuntimeShell.css';

export interface BookRuntimeShellActivity {
  readonly activityId: string;
  /** Validated student-safe Activity projection supplied by the launch boundary. */
  readonly projection: unknown;
  readonly label?: string;
}

export interface BookRuntimeViewerRenderInput {
  readonly activeActivityId: string;
  readonly pageGroupKey: string;
  readonly request: BookRuntimeDeliveryDocumentRequest | null;
  readonly view: BookRuntimeDesktopView;
}

export interface BookRuntimeViewerAdapter {
  readonly title: string;
  readonly status?: {
    readonly state: 'loading' | 'ready' | 'error';
    readonly message: string;
  };
  readonly render: (input: BookRuntimeViewerRenderInput) => ReactNode;
}

export type BookRuntimeAction =
  | 'bookRuntimePageGroupSelected'
  | 'bookRuntimeActivitySelected'
  | 'bookRuntimeActivityNavigated'
  | 'bookRuntimePdfFocused'
  | 'bookRuntimeSplitRestored'
  | 'bookRuntimeNavigatorToggled'
  | 'bookRuntimeTabSwitched'
  | 'bookRuntimeResponseChanged';

export interface BookRuntimeShellProps {
  readonly deliveryProjection: BookRuntimeDeliveryProjection;
  readonly activities: readonly BookRuntimeShellActivity[];
  readonly registry: ActivityRendererRegistry;
  readonly viewer: BookRuntimeViewerAdapter;
  readonly responses: Readonly<Record<string, unknown>>;
  readonly validationByInteractionId?: Readonly<Record<string, ActivityResponseValidationState>>;
  readonly onResponseChange: (interactionId: string, response: unknown) => void;
  readonly initialNavigation?: Partial<BookRuntimeNavigationState>;
  readonly onFlushBeforeNavigate?: (
    reason: BookRuntimeNavigationReason,
    state: BookRuntimeNavigationState,
  ) => void | Promise<void>;
  readonly onNavigationStateChange?: (
    state: BookRuntimeNavigationState,
    reason: BookRuntimeNavigationReason,
  ) => void;
  readonly onNavigationError?: (error: unknown, reason: BookRuntimeNavigationReason) => void;
  readonly onAction?: (action: BookRuntimeAction, metadata?: Record<string, unknown>) => void;
}

interface ResolvedRuntimeActivity extends BookRuntimeShellActivity {
  readonly pageGroupKey: string;
  readonly label: string;
  readonly placement: BookRuntimeDeliveryProjection['activities'][number];
}

interface ActivityResolution {
  readonly activities: readonly ResolvedRuntimeActivity[];
  readonly error: string | null;
}

const resolveActivities = (
  deliveryProjection: BookRuntimeDeliveryProjection,
  activities: readonly BookRuntimeShellActivity[],
): ActivityResolution => {
  const byId = new Map<string, BookRuntimeShellActivity>();
  for (const activity of activities) {
    if (byId.has(activity.activityId)) {
      return { activities: [], error: 'Book Activity projection contains a duplicate Activity ID.' };
    }
    byId.set(activity.activityId, activity);
  }

  const placements = [...deliveryProjection.activities].sort(
    (left, right) => left.order - right.order || left.activityId.localeCompare(right.activityId),
  );
  if (placements.length === 0) {
    return { activities: [], error: 'Book Delivery projection contains no Activities.' };
  }
  const resolved = placements.map((placement): ResolvedRuntimeActivity | null => {
    const activity = byId.get(placement.activityId);
    if (!activity) return null;
    return {
      ...activity,
      pageGroupKey: placement.nodeKey,
      label: activity.label?.trim() || placement.activityId,
      placement,
    };
  });
  if (resolved.some((activity) => activity === null) || byId.size !== placements.length) {
    return {
      activities: [],
      error: 'Book Delivery projection and Activity projections do not match.',
    };
  }
  return { activities: resolved as ResolvedRuntimeActivity[], error: null };
};

const ShellFailure = ({ message }: { message: string }) => (
  <section className="book-runtime-shell__failure" role="alert">
    <h1>Book unavailable</h1>
    <p>{message}</p>
  </section>
);

const statusMessage = (
  activity: ResolvedRuntimeActivity,
  responses: Readonly<Record<string, unknown>>,
): string | null => {
  const projection = activity.projection as { scoring?: { mode?: unknown }; interactions?: unknown } | null;
  const hasResponse = Array.isArray(projection?.interactions) && projection.interactions.some((interaction) => (
    interaction !== null &&
    typeof interaction === 'object' &&
    'interactionId' in interaction &&
    typeof interaction.interactionId === 'string' &&
    Object.hasOwn(responses, interaction.interactionId) &&
    (() => {
      const response = responses[interaction.interactionId];
      if (response === null || response === undefined) return false;
      if (typeof response === 'string') return response.trim().length > 0;
      if (typeof response === 'object' && 'text' in response && typeof response.text === 'string') {
        return response.text.trim().length > 0;
      }
      return true;
    })()
  ));
  if (projection?.scoring?.mode === 'review-required' && hasResponse) {
    return 'Pending review — objective scoring is unavailable for this Activity.';
  }
  return null;
};

export const BookRuntimeShell = (props: BookRuntimeShellProps) => {
  const resolution = useMemo(
    () => resolveActivities(props.deliveryProjection, props.activities),
    [props.activities, props.deliveryProjection],
  );
  if (resolution.error) return <ShellFailure message={resolution.error} />;
  return <BookRuntimeShellReady {...props} activities={resolution.activities} />;
};

interface BookRuntimeShellReadyProps extends Omit<BookRuntimeShellProps, 'activities'> {
  readonly activities: readonly ResolvedRuntimeActivity[];
}

const BookRuntimeShellReady = ({
  deliveryProjection,
  activities,
  registry,
  viewer,
  responses,
  validationByInteractionId = {},
  onResponseChange,
  initialNavigation,
  onFlushBeforeNavigate,
  onNavigationStateChange,
  onNavigationError,
  onAction,
}: BookRuntimeShellReadyProps) => {
  const navigationActivities = useMemo(
    () => activities.map(({ activityId, pageGroupKey }) => ({ activityId, pageGroupKey })),
    [activities],
  );
  const navigation = useBookRuntimeNavigation({
    activities: navigationActivities,
    initialState: initialNavigation,
    onFlushBeforeNavigate,
    onNavigate: onNavigationStateChange,
    onNavigationError,
  });
  const activeActivity = activities.find(
    (activity) => activity.activityId === navigation.state.activityId,
  ) ?? activities[0];
  const activityPanelRef = useRef<HTMLElement | null>(null);
  const previousActivityIdRef = useRef(activeActivity.activityId);

  useEffect(() => {
    if (previousActivityIdRef.current === activeActivity.activityId) return;
    previousActivityIdRef.current = activeActivity.activityId;
    activityPanelRef.current?.focus();
  }, [activeActivity.activityId]);

  const pageGroups = navigation.pageGroups;
  const request = activeActivity.placement.sourceContext.sourcePageScopes[0]
    ? deliveryProjection.documentRequests.find(
      (candidate) => candidate.sourceKey === activeActivity.placement.sourceContext.sourcePageScopes[0]?.sourceKey,
    ) ?? null
    : deliveryProjection.documentRequests[0] ?? null;
  const activeGroupActivities = activities.filter(
    (activity) => activity.pageGroupKey === activeActivity.pageGroupKey,
  );
  const status = statusMessage(activeActivity, responses);
  const isSourceReferenceOnly = activeActivity.placement.contextMode === 'required'
    || activeActivity.placement.sourceContext.available;
  const isViewerLoading = viewer.status?.state === 'loading';
  const isViewerError = viewer.status?.state === 'error';

  const handleResponseChange = (interactionId: string, response: unknown) => {
    onAction?.('bookRuntimeResponseChanged', { interactionId });
    onResponseChange(interactionId, response);
  };

  return (
    <div
      className="book-runtime-shell"
      data-desktop-view={navigation.state.desktopView}
      data-mobile-tab={navigation.state.mobileTab}
      data-navigator-collapsed={navigation.state.navigatorCollapsed}
      data-testid="book-runtime-shell"
    >
      <header className="book-runtime-shell__header">
        <div>
          <p className="book-runtime-shell__eyebrow">Published unit</p>
          <h1>{deliveryProjection.book.bookId}</h1>
          <p className="book-runtime-shell__context">
            {deliveryProjection.context.kind} · {deliveryProjection.book.publicationId}
          </p>
        </div>
        <div className="book-runtime-shell__header-status" aria-label="Book runtime status">
          <span>{deliveryProjection.activities.length} activities</span>
          <span>{deliveryProjection.actionFlags.canSubmit ? 'Local response state' : 'Reference-only'}</span>
        </div>
      </header>

      <div className="book-runtime-shell__mobile-tabs" role="tablist" aria-label="Book runtime panels">
        <button
          aria-controls="book-runtime-page-panel"
          aria-selected={navigation.state.mobileTab === 'page'}
          className={navigation.state.mobileTab === 'page' ? 'is-active' : ''}
          onClick={() => {
            onAction?.('bookRuntimeTabSwitched', { tab: 'page' });
            navigation.setMobileTab('page');
          }}
          role="tab"
          type="button"
        >
          Book Page
        </button>
        <button
          aria-controls="book-runtime-activity-panel"
          aria-selected={navigation.state.mobileTab === 'activity'}
          className={navigation.state.mobileTab === 'activity' ? 'is-active' : ''}
          onClick={() => {
            onAction?.('bookRuntimeTabSwitched', { tab: 'activity' });
            navigation.setMobileTab('activity');
          }}
          role="tab"
          type="button"
        >
          Activity
        </button>
      </div>

      <div className="book-runtime-shell__workspace">
        <aside className="book-runtime-shell__page-navigator" aria-label="Book page groups">
          <div className="book-runtime-shell__panel-heading">
            {!navigation.state.navigatorCollapsed ? <span>Page Groups</span> : null}
            <button
              aria-label={navigation.state.navigatorCollapsed ? 'Expand page navigator' : 'Collapse page navigator'}
              className="book-runtime-shell__icon-button"
              onClick={() => {
                const collapsed = !navigation.state.navigatorCollapsed;
                onAction?.('bookRuntimeNavigatorToggled', { collapsed });
                navigation.setNavigatorCollapsed(collapsed);
              }}
              type="button"
            >
              {navigation.state.navigatorCollapsed ? '→' : '←'}
            </button>
          </div>
          <nav className="book-runtime-shell__group-list">
            {pageGroups.map((pageGroupKey, index) => (
              <button
                aria-current={activeActivity.pageGroupKey === pageGroupKey ? 'page' : undefined}
                aria-label={`Page Group ${index + 1}`}
                className={activeActivity.pageGroupKey === pageGroupKey ? 'is-active' : ''}
                disabled={navigation.isTransitioning}
                key={pageGroupKey}
                onClick={() => {
                  onAction?.('bookRuntimePageGroupSelected', { pageGroupKey });
                  navigation.selectPageGroup(pageGroupKey);
                }}
                type="button"
              >
                <span className="book-runtime-shell__group-number">{index + 1}</span>
                <span className="book-runtime-shell__group-label">{pageGroupKey}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section
          aria-labelledby="book-runtime-activity-title"
          className="book-runtime-shell__activity-pane"
          id="book-runtime-activity-panel"
          ref={activityPanelRef}
          role="tabpanel"
          tabIndex={-1}
        >
          <div className="book-runtime-shell__panel-heading">
            <div>
              <p className="book-runtime-shell__eyebrow">Activity</p>
              <h2 id="book-runtime-activity-title">{activeActivity.label}</h2>
            </div>
            <span className="book-runtime-shell__activity-position">
              {activities.findIndex((activity) => activity.activityId === activeActivity.activityId) + 1} / {activities.length}
            </span>
          </div>

          <nav className="book-runtime-shell__mobile-activity-list" aria-label="Activities in this Page Group">
            {activeGroupActivities.map((activity) => (
              <button
                aria-current={activity.activityId === activeActivity.activityId ? 'page' : undefined}
                className={activity.activityId === activeActivity.activityId ? 'is-active' : ''}
                disabled={navigation.isTransitioning}
                key={activity.activityId}
                onClick={() => {
                  onAction?.('bookRuntimeActivitySelected', { activityId: activity.activityId });
                  navigation.selectActivity(activity.activityId);
                }}
                type="button"
              >
                {activity.label}
              </button>
            ))}
          </nav>

          {isSourceReferenceOnly ? (
            <p className="book-runtime-shell__reference-state">
              Reference context: {activeActivity.placement.sourceContext.description}
            </p>
          ) : null}
          {status ? <p className="book-runtime-shell__pending-state" role="status">{status}</p> : null}

          <ActivityRendererHost
            context={{
              mode: deliveryProjection.actionFlags.canAutosave ? 'editable' : 'read-only',
              sourceContext: activeActivity.placement.sourceContext,
              surface: 'student-runtime',
            }}
            onResponseChange={handleResponseChange}
            projection={activeActivity.projection}
            registry={registry}
            responses={responses}
            validationByInteractionId={validationByInteractionId}
          />

          <nav className="book-runtime-shell__activity-navigation" aria-label="Activity navigation">
            <button
              disabled={navigation.isTransitioning || activeActivity.activityId === activities[0]?.activityId}
              onClick={() => {
                onAction?.('bookRuntimeActivityNavigated', { direction: 'previous' });
                navigation.previousActivity();
              }}
              type="button"
            >
              Previous Activity
            </button>
            <button
              disabled={navigation.isTransitioning || activeActivity.activityId === activities.at(-1)?.activityId}
              onClick={() => {
                onAction?.('bookRuntimeActivityNavigated', { direction: 'next' });
                navigation.nextActivity();
              }}
              type="button"
            >
              Next Activity
            </button>
          </nav>
        </section>

        <aside
          aria-labelledby="book-runtime-viewer-title"
          className="book-runtime-shell__viewer-pane"
          id="book-runtime-page-panel"
          role="tabpanel"
        >
          <div className="book-runtime-shell__panel-heading">
            <div>
              <p className="book-runtime-shell__eyebrow">Book Page</p>
              <h2 id="book-runtime-viewer-title">{viewer.title}</h2>
            </div>
            {navigation.state.desktopView === 'pdf-focus' ? (
              <button
                onClick={() => {
                  onAction?.('bookRuntimeSplitRestored');
                  navigation.restoreSplitView();
                }}
                type="button"
              >
                Restore split view
              </button>
            ) : (
              <button
                onClick={() => {
                  onAction?.('bookRuntimePdfFocused');
                  navigation.setDesktopView('pdf-focus');
                }}
                type="button"
              >
                Focus PDF
              </button>
            )}
          </div>
          {isViewerLoading ? <p role="status">{viewer.status?.message}</p> : null}
          {isViewerError ? <p role="alert">{viewer.status?.message}</p> : null}
          <div className="book-runtime-shell__viewer-content" data-testid="book-runtime-viewer">
            {viewer.render({
              activeActivityId: activeActivity.activityId,
              pageGroupKey: activeActivity.pageGroupKey,
              request,
              view: navigation.state.desktopView,
            })}
          </div>
          <p className="book-runtime-shell__viewer-safety">
            Reference-only viewer. No answer, Delivery, or publication writes occur here.
          </p>
        </aside>
      </div>
    </div>
  );
};

export default BookRuntimeShell;
