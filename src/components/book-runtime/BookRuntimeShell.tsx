import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import type { ActivityResponseValidationState } from '../../services/book-activity/runtime/activityRenderer.types';
import type {
  BookRuntimeDeliveryDocumentRequest,
  BookRuntimeProjection,
} from '../../services/book-delivery/bookDelivery.types';
import {
  createBookDeliveryComponentProjection,
} from '../../services/book-delivery/bookDeliveryComponentProjection.service';
import type { BookDeliveryComponentProjection } from '../../services/book-delivery/bookDeliveryComponentProjection.types';
import {
  useBookRuntimeNavigation,
  type BookRuntimeDesktopView,
  type BookRuntimeMobileTab,
  type BookRuntimeNavigationComponent,
  type BookRuntimeNavigationReason,
  type BookRuntimeNavigationState,
} from '../../hooks/book-runtime/useBookRuntimeNavigation';
import type {
  BookActivityRuntimeStatus,
  BookRuntimeConflict,
} from '../../hooks/book-runtime/useBookActivityRuntime';
import {
  useBookIntegrityCapture,
} from '../../hooks/book-runtime/useBookIntegrityCapture';
import type {
  BookIntegrityCaptureClient,
  BookIntegrityFrozenPolicy,
  BookIntegrityWarning,
} from '../../services/book-activity/bookIntegrityCapture.types';
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
  readonly componentId: string;
  readonly componentOrder: number;
  readonly componentCount: number;
  readonly physicalPageNumber: number;
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
  | 'bookRuntimeReturn'
  | 'bookRuntimePageGroupSelected'
  | 'bookRuntimeComponentSelected'
  | 'bookRuntimeComponentPageChanged'
  | 'bookRuntimeActivitySelected'
  | 'bookRuntimeActivityNavigated'
  | 'bookRuntimePdfFocused'
  | 'bookRuntimeSplitRestored'
  | 'bookRuntimeNavigatorToggled'
  | 'bookRuntimeTabSwitched'
  | 'bookRuntimeResponseChanged';

export interface BookRuntimeIntegrityCaptureSeam {
  readonly client: BookIntegrityCaptureClient;
  readonly frozenPoliciesByPlacementId: Readonly<Record<string, BookIntegrityFrozenPolicy>>;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly onWarning: (warning: BookIntegrityWarning) => void;
}

export interface BookRuntimeShellProps {
  readonly deliveryProjection: BookRuntimeProjection;
  readonly display?: {
    readonly bookTitle?: string;
    readonly unitTitle?: string;
    readonly contextLabel?: string;
  };
  readonly activities: readonly BookRuntimeShellActivity[];
  readonly registry: ActivityRendererRegistry;
  readonly viewer: BookRuntimeViewerAdapter;
  readonly responses: Readonly<Record<string, unknown>>;
  readonly validationByInteractionId?: Readonly<Record<string, ActivityResponseValidationState>>;
  readonly onResponseChange: (interactionId: string, response: unknown) => void;
  /** Candidate previews may be interactive without enabling persistence. */
  readonly responseMode?: 'editable' | 'read-only';
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
  readonly personalTimer?: ReactNode;
  /**
   * Dedicated Book-only integrity seam. The shell derives the exact active
   * placement target; the host supplies only frozen trusted policy snapshots.
   */
  readonly integrityCapture?: BookRuntimeIntegrityCaptureSeam;
  readonly persistence?: {
    readonly status: BookActivityRuntimeStatus;
    readonly message: string;
    readonly isDirty: boolean;
    readonly conflict: BookRuntimeConflict | null;
    readonly onRetry: () => void | Promise<void>;
    readonly onReload: () => void | Promise<void>;
    readonly onDiscardLocal: () => void | Promise<void>;
  };
}

interface ResolvedRuntimeActivity extends BookRuntimeShellActivity {
  readonly pageGroupKey: string;
  readonly componentIds: readonly string[];
  readonly label: string;
  readonly placement: BookRuntimeProjection['activities'][number];
}

interface ActivityResolution {
  readonly activities: readonly ResolvedRuntimeActivity[];
  readonly componentProjection: BookDeliveryComponentProjection | null;
  readonly error: string | null;
}

const resolveActivities = (
  deliveryProjection: BookRuntimeProjection,
  activities: readonly BookRuntimeShellActivity[],
): ActivityResolution => {
  let componentProjection: BookDeliveryComponentProjection;
  try {
    componentProjection = createBookDeliveryComponentProjection(deliveryProjection);
  } catch {
    return {
      activities: [],
      componentProjection: null,
      error: 'Book Delivery component projection is unavailable or stale.',
    };
  }
  const byId = new Map<string, BookRuntimeShellActivity>();
  for (const activity of activities) {
    if (byId.has(activity.activityId)) {
      return {
        activities: [],
        componentProjection: null,
        error: 'Book Activity projection contains a duplicate Activity ID.',
      };
    }
    byId.set(activity.activityId, activity);
  }

  const placements = [...deliveryProjection.activities].sort(
    (left, right) => left.order - right.order || left.activityId.localeCompare(right.activityId),
  );
  if (placements.length === 0) {
    return {
      activities: [],
      componentProjection: null,
      error: 'Book Delivery projection contains no Activities.',
    };
  }
  const componentIdForSource = new Map(
    componentProjection.components.map((component) => [component.sourceKey, component.componentId]),
  );
  const defaultComponentId = componentProjection.components[0]?.componentId ?? 'full-pdf';
  const resolved = placements.map((placement): ResolvedRuntimeActivity | null => {
    const activity = byId.get(placement.activityId);
    if (!activity) return null;
    const componentIds = placement.sourceContext.sourcePageScopes
      .map((scope) => componentIdForSource.get(scope.sourceKey))
      .filter((componentId): componentId is string => componentId !== undefined);
    return {
      ...activity,
      pageGroupKey: placement.nodeKey,
      componentIds: Object.freeze(componentIds.length > 0 ? componentIds : [defaultComponentId]),
      label: activity.label?.trim() || placement.activityId,
      placement,
    };
  });
  if (resolved.some((activity) => activity === null) || byId.size !== placements.length) {
    return {
      activities: [],
      componentProjection: null,
      error: 'Book Delivery projection and Activity projections do not match.',
    };
  }
  return {
    activities: resolved as ResolvedRuntimeActivity[],
    componentProjection,
    error: null,
  };
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

const BookRuntimeIntegrityBoundary = ({
  children,
  options,
}: {
  readonly children: ReactNode;
  readonly options: Parameters<typeof useBookIntegrityCapture>[0];
}) => {
  useBookIntegrityCapture(options);
  return (
    <div
      data-book-integrity-copy-protected={
        options.frozenPolicy.signals.protected_copy ? 'true' : undefined
      }
      data-testid="book-integrity-protected-content"
      style={{ display: 'contents' }}
    >
      {children}
    </div>
  );
};

export const BookRuntimeShell = (props: BookRuntimeShellProps) => {
  const resolution = useMemo(
    () => resolveActivities(props.deliveryProjection, props.activities),
    [props.activities, props.deliveryProjection],
  );
  if (resolution.error) return <ShellFailure message={resolution.error} />;
  return (
    <BookRuntimeShellReady
      {...props}
      activities={resolution.activities}
      componentProjection={resolution.componentProjection!}
    />
  );
};

interface BookRuntimeShellReadyProps extends Omit<BookRuntimeShellProps, 'activities'> {
  readonly activities: readonly ResolvedRuntimeActivity[];
  readonly componentProjection: BookDeliveryComponentProjection;
}

const BookRuntimeShellReady = ({
  deliveryProjection,
  display,
  activities,
  componentProjection,
  registry,
  viewer,
  responses,
  validationByInteractionId = {},
  onResponseChange,
  responseMode,
  initialNavigation,
  onFlushBeforeNavigate,
  onNavigationStateChange,
  onNavigationError,
  onAction,
  personalTimer,
  integrityCapture,
  persistence,
}: BookRuntimeShellReadyProps) => {
  const navigationActivities = useMemo(
    () => activities.map(({ activityId, pageGroupKey, componentIds, placement }) => {
      const componentPageById = Object.fromEntries(placement.sourceContext.sourcePageScopes.flatMap((scope) => {
        const componentId = componentProjection.components.find((component) => component.sourceKey === scope.sourceKey)?.componentId
          ?? (componentProjection.fullPdfRequest?.sourceKey === scope.sourceKey ? 'full-pdf' : null);
        const page = scope.pages.find((candidate) => Number.isSafeInteger(candidate) && candidate > 0);
        return componentId && page ? [[componentId, page]] : [];
      }));
      return { activityId, pageGroupKey, componentIds, componentPageById };
    }),
    [activities, componentProjection],
  );
  const navigationComponents = useMemo<readonly BookRuntimeNavigationComponent[]>(
    () => componentProjection.components.map(({ componentId, sourceOrder, activityIds, localPageScope }) => ({
      componentId,
      sourceOrder,
      activityIds,
      localPageScope,
    })),
    [componentProjection],
  );
  const navigation = useBookRuntimeNavigation({
    activities: navigationActivities,
    components: navigationComponents,
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
  const activeComponent = componentProjection.components.find(
    (component) => component.componentId === navigation.state.componentId,
  );
  const request = activeComponent?.documentRequest
    ?? componentProjection.fullPdfRequest
    ?? (activeActivity.placement.sourceContext.sourcePageScopes[0]
      ? deliveryProjection.documentRequests.find(
        (candidate) => candidate.sourceKey === activeActivity.placement.sourceContext.sourcePageScopes[0]?.sourceKey,
      ) ?? null
      : deliveryProjection.documentRequests[0] ?? null);
  const activeComponentOrder = activeComponent?.sourceOrder ?? 1;
  const activeComponentPage = navigation.state.componentPageById[navigation.state.componentId] ?? 1;
  const activeComponentPageScope = activeComponent?.localPageScope;
  const activeGroupActivities = activities.filter(
    (activity) => activity.pageGroupKey === activeActivity.pageGroupKey,
  );
  const status = statusMessage(activeActivity, responses);
  const isSourceReferenceOnly = activeActivity.placement.contextMode === 'required'
    || activeActivity.placement.sourceContext.available;
  const isViewerLoading = viewer.status?.state === 'loading';
  const isViewerError = viewer.status?.state === 'error';
  const isCandidatePreview = deliveryProjection.projectionKind === 'book-runtime-candidate-preview';
  const bookTitle = display?.bookTitle?.trim() || deliveryProjection.book.bookId;
  const unitTitle = display?.unitTitle?.trim()
    || (isCandidatePreview ? deliveryProjection.unitKey : activeActivity.placement.nodeKey);
  const contextLabel = display?.contextLabel?.trim()
    || (isCandidatePreview
      ? 'Unpublished candidate · answers are temporary'
      : `${deliveryProjection.context.kind} · ${deliveryProjection.book.publicationId}`);

  const handleResponseChange = (interactionId: string, response: unknown) => {
    onAction?.('bookRuntimeResponseChanged', { interactionId });
    onResponseChange(interactionId, response);
  };

  const shell = (
    <div
      className="book-runtime-shell"
      data-desktop-view={navigation.state.desktopView}
      data-mobile-tab={navigation.state.mobileTab}
      data-navigator-collapsed={navigation.state.navigatorCollapsed}
      data-testid="book-runtime-shell"
    >
      <header className="book-runtime-shell__header">
        <div>
          <p className="book-runtime-shell__eyebrow">{isCandidatePreview ? 'Student preview' : 'Published unit'}</p>
          <h1>{bookTitle}</h1>
          <p className="book-runtime-shell__context">
            {unitTitle} · {contextLabel}
          </p>
        </div>
        <div className="book-runtime-shell__header-tools">
          {personalTimer ? <div className="book-runtime-shell__personal-timer">{personalTimer}</div> : null}
          <div className="book-runtime-shell__header-status" aria-label="Book runtime status">
            <span>{deliveryProjection.activities.length} activities</span>
            <span>{deliveryProjection.actionFlags.canSubmit ? 'Local response state' : 'Reference-only'}</span>
          </div>
        </div>
      </header>

      {persistence ? (
        <section
          aria-label="Activity save status"
          className={`book-runtime-shell__persistence book-runtime-shell__persistence--${persistence.status}`}
          data-dirty={persistence.isDirty}
          data-status={persistence.status}
          data-testid="book-runtime-persistence"
          role={['conflict', 'error', 'unsafe-to-leave'].includes(persistence.status) ? 'alert' : 'status'}
        >
          <span>{persistence.message || persistence.status}</span>
          {persistence.conflict ? <span>Local response retained.</span> : null}
          {['conflict', 'error', 'offline', 'retrying', 'unsafe-to-leave'].includes(persistence.status) ? (
            <div className="book-runtime-shell__persistence-actions">
              <button onClick={() => void persistence.onRetry()} type="button">Retry</button>
              {persistence.conflict ? (
                <button onClick={() => void persistence.onReload()} type="button">Reload current</button>
              ) : null}
              <button onClick={() => void persistence.onDiscardLocal()} type="button">Discard local</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {(deliveryProjection.outline ?? []).length > 0 ? (
        <nav aria-label="Book outline" className="book-runtime-shell__outline" data-testid="book-runtime-outline">
          <p className="book-runtime-shell__eyebrow">Book outline</p>
          <ol>
            {[...(deliveryProjection.outline ?? [])]
              .sort((left, right) => left.order - right.order || left.nodeKey.localeCompare(right.nodeKey))
              .map((node) => (
                <li
                  aria-current={isCandidatePreview && node.nodeKey === deliveryProjection.unitKey ? 'page' : undefined}
                  key={node.nodeKey}
                >
                  <span>{node.titleSnapshot?.trim() || node.nodeKey}</span>
                  <small>{node.nodeType}</small>
                </li>
              ))}
          </ol>
        </nav>
      ) : null}

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

      {componentProjection.components.length > 0 ? (
        <section
          aria-label="Authorized components"
          className="book-runtime-shell__component-selector"
          data-testid="book-runtime-component-selector"
        >
          <div className="book-runtime-shell__panel-heading">
            <div>
              <p className="book-runtime-shell__eyebrow">Book components</p>
              <h2>Authorized source order</h2>
            </div>
            <span className="book-runtime-shell__activity-position">
              Component {activeComponentOrder} / {componentProjection.components.length}
            </span>
          </div>
          <nav aria-label="Authorized Book components" className="book-runtime-shell__component-list">
            {componentProjection.components.map((component) => (
              <button
                aria-current={navigation.state.componentId === component.componentId ? 'page' : undefined}
                className={navigation.state.componentId === component.componentId ? 'is-active' : ''}
                data-component-id={component.componentId}
                disabled={navigation.isTransitioning}
                key={component.componentId}
                onClick={() => {
                  onAction?.('bookRuntimeComponentSelected', {
                    componentId: component.componentId,
                    sourceOrder: component.sourceOrder,
                  });
                  navigation.selectComponent(component.componentId);
                }}
                type="button"
              >
                <span className="book-runtime-shell__group-number">{component.sourceOrder}</span>
                <span>Component {component.sourceOrder}</span>
              </button>
            ))}
          </nav>
          <label className="book-runtime-shell__component-page">
            Page in Component {activeComponentOrder}
            <input
              aria-label={`Page in Component ${activeComponentOrder}`}
              max={activeComponentPageScope?.kind === 'pages'
                ? Math.max(...activeComponentPageScope.pages)
                : undefined}
              min={1}
              onChange={(event) => {
                const page = Number(event.currentTarget.value);
                if (
                  !Number.isSafeInteger(page)
                  || page < 1
                  || (activeComponentPageScope?.kind === 'pages' && !activeComponentPageScope.pages.includes(page))
                ) return;
                navigation.setComponentPage(navigation.state.componentId, page);
                onAction?.('bookRuntimeComponentPageChanged', {
                  componentId: navigation.state.componentId,
                  page,
                });
                onNavigationStateChange?.({
                  ...navigation.state,
                  componentPageById: {
                    ...navigation.state.componentPageById,
                    [navigation.state.componentId]: page,
                  },
                }, 'component-page-selected');
              }}
              type="number"
              value={activeComponentPage}
            />
          </label>
        </section>
      ) : null}

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
              mode: responseMode ?? (deliveryProjection.actionFlags.canAutosave ? 'editable' : 'read-only'),
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
              componentId: navigation.state.componentId,
              componentOrder: activeComponentOrder,
              componentCount: componentProjection.components.length || 1,
              physicalPageNumber: activeComponentPage,
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
  if (!integrityCapture || deliveryProjection.projectionKind !== 'book-runtime-delivery') return shell;
  if (!('activityVersion' in activeActivity.placement)) return shell;
  const frozenPolicy = integrityCapture.frozenPoliciesByPlacementId[
    activeActivity.placement.placementId
  ];
  if (!frozenPolicy) return shell;
  return (
    <BookRuntimeIntegrityBoundary
      options={{
        client: integrityCapture.client,
        target: {
          bookId: deliveryProjection.book.bookId,
          bindingId: deliveryProjection.bindingId,
          bindingRevision: deliveryProjection.bindingRevision,
          contextKind: 'homework',
          contextId: deliveryProjection.context.contextId,
          placementId: activeActivity.placement.placementId,
          activityId: activeActivity.placement.activityId,
          activityVersion: activeActivity.placement.activityVersion,
        },
        frozenPolicy,
        enabled: integrityCapture.enabled,
        active: integrityCapture.active,
        onWarning: integrityCapture.onWarning,
      }}
    >
      {shell}
    </BookRuntimeIntegrityBoundary>
  );
};

export default BookRuntimeShell;
