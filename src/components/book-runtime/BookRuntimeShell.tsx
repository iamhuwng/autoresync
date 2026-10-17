import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { storage } from '../../core/platform/storage';
import type { ActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import type { ActivityResponseValidationState } from '../../services/book-activity/runtime/activityRenderer.types';
import type {
  BookRuntimeDeliveryDocumentRequest,
  BookRuntimeProjection,
  BookRuntimePageGroupContext,
  BookRuntimeStudentDocumentRequest,
} from '../../services/book-delivery/bookDelivery.types';
import {
  useBookRuntimeNavigation,
  type BookRuntimeDesktopView,
  type BookRuntimeMobileTab,
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
  readonly activityVersionId?: string;
  /** Validated student-safe Activity projection supplied by the launch boundary. */
  readonly projection: unknown;
  readonly label?: string;
}

export interface BookRuntimeViewerRenderInput {
  readonly activeActivityId: string;
  readonly pageGroupKey: string;
  readonly combinedPhysicalPage: number;
  readonly request: BookRuntimeDeliveryDocumentRequest | BookRuntimeStudentDocumentRequest;
  readonly view: BookRuntimeDesktopView;
  readonly allowedPages?: readonly number[];
  readonly onPageChange?: (page: number) => void;
  readonly onPageReady?: (page: number) => void;
}

export interface BookRuntimeViewerAdapter {
  readonly title: string;
  readonly status?: {
    readonly state: 'loading' | 'ready' | 'error';
    readonly message: string;
  };
  readonly render: (input: BookRuntimeViewerRenderInput) => ReactNode;
  readonly reportsPageReady?: boolean;
}

export interface BookRuntimeActivitySummary {
  readonly answered: readonly string[];
  readonly status: string;
  readonly dirty: boolean;
  readonly submitted: boolean;
  readonly reviewRequired: boolean;
  readonly captureActive: boolean;
}

export type BookRuntimeAction =
  | 'bookRuntimeReturn'
  | 'bookRuntimePageGroupSelected'
  | 'bookRuntimeCombinedPageSelected'
  | 'bookRuntimeActivitySelected'
  | 'bookRuntimeActivityNavigated'
  | 'bookRuntimePdfFocused'
  | 'bookRuntimeSplitRestored'
  | 'bookRuntimeNavigatorToggled'
  | 'bookRuntimeTabSwitched'
  | 'bookRuntimeResponseChanged'
  | 'bookRuntimeMetricRecorded'
  | 'bookRuntimeSubmitActivity'
  | 'bookRuntimeAutosaveRetry' | 'bookRuntimeAutosaveReload' | 'bookRuntimeAutosaveDiscard'
  | 'bookRuntimeQuestionFocused' | 'bookRuntimeQuestionFlagged' | 'bookRuntimeSplitResized' | 'bookRuntimeSubmitCancelled';

export interface BookRuntimeIntegrityCaptureSeam {
  readonly client: BookIntegrityCaptureClient;
  readonly frozenPoliciesByPlacementId: Readonly<Record<string, BookIntegrityFrozenPolicy>>;
  readonly captureSlotsByPlacementId?: Readonly<Record<string, {
    readonly captureSlotId: string;
    readonly captureAttemptNumber: number;
  }>>;
  readonly enabledByPlacementId?: Readonly<Record<string, boolean>>;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly activeByPlacementId?: Readonly<Record<string, boolean>>;
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
  readonly onReturn?: () => void;
  readonly activitySummaries?: Readonly<Record<string, BookRuntimeActivitySummary>>;
  readonly renderActivity?: (activity: ResolvedRuntimeActivity, questionTools: (interactionId: string, index: number) => ReactNode) => ReactNode;
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

export interface ResolvedRuntimeActivity extends BookRuntimeShellActivity {
  readonly runtimeKey: string;
  readonly pageGroupKeys: readonly string[];
  readonly label: string;
  readonly placement: BookRuntimeProjection['activities'][number];
}

interface ActivityResolution {
  readonly activities: readonly ResolvedRuntimeActivity[];
  readonly pageGroups: readonly BookRuntimePageGroupContext[];
  readonly request: BookRuntimeDeliveryDocumentRequest | BookRuntimeStudentDocumentRequest | null;
  readonly error: string | null;
}

const resolveActivities = (
  deliveryProjection: BookRuntimeProjection,
  activities: readonly BookRuntimeShellActivity[],
): ActivityResolution => {
  const candidateRequest = deliveryProjection.documentRequests[0];
  const source = deliveryProjection.sourceSet.sources[0];
  const request = deliveryProjection.documentRequests.length === 1 && candidateRequest
    && (!('sourceKey' in candidateRequest)
      ? deliveryProjection.sourceSet.strategy === 'component_pdfs'
      : deliveryProjection.sourceSet.strategy === 'full_pdf'
        && deliveryProjection.sourceSet.sources.length === 1
        && source?.sourceKey === candidateRequest.sourceKey
        && source.sourceVersionId === candidateRequest.sourceVersionId)
    ? candidateRequest : null;
  const pageGroups = Array.isArray(deliveryProjection.pageGroups) ? deliveryProjection.pageGroups : [];
  if (!request || pageGroups.length === 0) return { activities: [], pageGroups, request, error: 'Book document context is unavailable or stale.' };
  const byId = new Map<string, BookRuntimeShellActivity[]>();
  for (const activity of activities) {
    byId.set(activity.activityId, [...(byId.get(activity.activityId) ?? []), activity]);
  }

  const placements = [...deliveryProjection.activities].sort(
    (left, right) => left.order - right.order || left.activityId.localeCompare(right.activityId),
  );
  if (placements.length === 0) {
    return {
      activities: [],
      pageGroups,
      request,
      error: 'Book Delivery projection contains no Activities.',
    };
  }
  const resolved = placements.map((placement): ResolvedRuntimeActivity | null => {
    const candidates = byId.get(placement.activityId) ?? [];
    const activity = candidates.find((candidate) => {
      if (deliveryProjection.projectionKind === 'book-runtime-candidate-preview') return true;
      if (!('activityVersionId' in placement) || typeof placement.activityVersionId !== 'string'
        || !placement.activityVersionId || !Number.isSafeInteger(placement.activityVersion)) return false;
      const value = candidate.projection;
      const content = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
      const versionId = candidate.activityVersionId ?? content.activityVersionId;
      return versionId === placement.activityVersionId
        && (content.activityVersionId === undefined || content.activityVersionId === placement.activityVersionId)
        && (content.activityVersion === undefined || content.activityVersion === placement.activityVersion);
    });
    if (!activity) return null;
    const declaredPageGroupKeys = placement.sourceContext.pageGroupKeys.filter((pageGroupKey) => (
      pageGroups.some((pageGroup) => pageGroup.pageGroupKey === pageGroupKey)
    ));
    const pageGroupKeys = declaredPageGroupKeys.length > 0
      ? declaredPageGroupKeys
      : placement.contextMode === 'none'
        ? pageGroups.map((pageGroup) => pageGroup.pageGroupKey)
        : [];
    if (pageGroupKeys.length === 0) return null;
    return {
      ...activity,
      runtimeKey: JSON.stringify([placement.placementId, placement.activityId,
        'activityVersionId' in placement ? placement.activityVersionId : null]),
      pageGroupKeys: Object.freeze(pageGroupKeys),
      label: (activity.label?.trim() && activity.label !== placement.activityId ? activity.label.trim() : '')
        || (activity.projection && typeof activity.projection === 'object' && 'title' in activity.projection && typeof activity.projection.title === 'string' ? activity.projection.title.trim() : '') || 'Activity',
      placement,
    };
  });
  if (resolved.some((activity) => activity === null)) {
    return {
      activities: [],
      pageGroups,
      request,
      error: 'Book Delivery projection and Activity projections do not match.',
    };
  }
  return {
    activities: resolved as ResolvedRuntimeActivity[],
    pageGroups,
    request,
    error: null,
  };
};

const ShellFailure = ({ message }: { message: string }) => (
  <section className="book-runtime-shell__failure" role="alert">
    <h1>Book unavailable</h1>
    <p>{message}</p>
  </section>
);

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
  const scopeKey = JSON.stringify([
    props.deliveryProjection.projectionKind === 'book-runtime-delivery' ? props.deliveryProjection.recipientId
      : [props.deliveryProjection.candidateId, props.deliveryProjection.candidateRevision],
    props.deliveryProjection.context.contextId, resolution.activities.map((activity) => activity.runtimeKey),
  ]);
  return (
    <BookRuntimeShellReady key={scopeKey}
      {...props}
      activities={resolution.activities}
      pageGroups={resolution.pageGroups}
      request={resolution.request!}
    />
  );
};

interface BookRuntimeShellReadyProps extends Omit<BookRuntimeShellProps, 'activities'> {
  readonly activities: readonly ResolvedRuntimeActivity[];
  readonly pageGroups: readonly BookRuntimePageGroupContext[];
  readonly request: BookRuntimeDeliveryDocumentRequest | BookRuntimeStudentDocumentRequest;
}

const BookRuntimeShellReady = ({ deliveryProjection, display, activities, pageGroups, request, registry, viewer, responses,
  validationByInteractionId = {}, onResponseChange, responseMode, initialNavigation, onFlushBeforeNavigate,
  onNavigationStateChange, onNavigationError, onAction, personalTimer, integrityCapture, persistence,
  renderActivity, activitySummaries = {}, onReturn }: BookRuntimeShellReadyProps) => {
  const navigationActivities = useMemo(() => activities.map((activity) => ({ runtimeKey: activity.runtimeKey!, activityId: activity.activityId, pageGroupKeys: activity.pageGroupKeys! })), [activities]);
  const navigation = useBookRuntimeNavigation({ activities: navigationActivities, pageGroups, initialState: initialNavigation,
    onFlushBeforeNavigate, onNavigate: onNavigationStateChange, onNavigationError });
  const allowedPages = useMemo(() => [...new Set(pageGroups.flatMap((group) => group.combinedPhysicalPages))].sort((a, b) => a - b), [pageGroups]);
  const documentKey = JSON.stringify([deliveryProjection.context.contextId, request]);
  const [successfulPage, setSuccessfulPage] = useState<{ key: string; page: number } | null>(null);
  const displayedPage = viewer.reportsPageReady ? successfulPage?.key === documentKey ? successfulPage.page : null : navigation.state.combinedPhysicalPage;
  const mappedActivities = useMemo(() => activities.filter((activity) => pageGroups.some((group) => group.combinedPhysicalPages.includes(displayedPage ?? -1) && activity.pageGroupKeys.includes(group.pageGroupKey))), [activities, displayedPage, pageGroups]);
  const mappedKeys = useMemo(() => mappedActivities.map((item) => item.runtimeKey), [mappedActivities]);
  const [visited, setVisited] = useState<readonly string[]>([]);
  useEffect(() => setVisited((current) => mappedKeys.every((key) => current.includes(key)) ? current : [...new Set([...current, ...mappedKeys])]), [mappedKeys]);
  const retainedKeys = new Set([...visited, ...mappedKeys]);
  const [focusedRuntimeKey, setFocusedRuntimeKey] = useState(navigation.state.runtimeKey);
  const [focusedQuestion, setFocusedQuestion] = useState<string | null>(null);
  const activeActivity = mappedActivities.find((activity) => activity.runtimeKey === focusedRuntimeKey)
    ?? mappedActivities.find((activity) => activity.runtimeKey === navigation.state.runtimeKey) ?? activities[0];
  const activityPanelRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [splitRatio, setSplitRatio] = useState(46);
  const ratioRef = useRef(splitRatio);
  ratioRef.current = splitRatio;
  const resize = (requested: number) => {
    const width = workspaceRef.current?.getBoundingClientRect().width || 1200;
    const minimum = Math.max(30, 320 / width * 100);
    const maximum = Math.min(70, 100 - 320 / width * 100);
    setSplitRatio(Math.max(minimum, Math.min(maximum, requested)));
  };
  const candidatePreview = deliveryProjection.projectionKind === 'book-runtime-candidate-preview';
  const identity = candidatePreview ? `${deliveryProjection.candidateId}:${deliveryProjection.candidateRevision}`
    : `${deliveryProjection.recipientId}:${deliveryProjection.context.contextId}:${deliveryProjection.book.bookId}`;
  const flagsKey = `book-runtime-review-flags:${identity}:${activities.map((item) => item.placement.placementId + (('activityVersionId' in item.placement) ? ':' + item.placement.activityVersionId : '')).join('|')}`;
  const [flagsState, setFlagsState] = useState<{ key: string; values: Record<string, boolean>; loaded: boolean }>({ key: flagsKey, values: {}, loaded: false });
  useEffect(() => {
    let current = true;
    void storage.get(flagsKey).then((value) => {
      const values = value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).filter(([, flag]) => flag === true)) : {};
      if (current) setFlagsState({ key: flagsKey, values, loaded: true });
    }).catch(() => { if (current) setFlagsState({ key: flagsKey, values: {}, loaded: true }); });
    return () => { current = false; };
  }, [flagsKey]);
  const flags = flagsState.key === flagsKey ? flagsState.values : {};
  useEffect(() => { if (flagsState.loaded && flagsState.key === flagsKey) void storage.set(flagsKey, flagsState.values).catch(() => undefined); }, [flagsKey, flagsState]);
  const questions = mappedActivities.flatMap((activity) => {
    const resolution = registry.resolve(activity.projection, { mode: 'read-only', sourceContext: activity.placement.sourceContext, surface: 'student-runtime' });
    return resolution.supported ? resolution.projection.interactions.map((interaction, index) => ({ activity,
      interactionId: interaction.interactionId, label: interaction.sourceAssisted?.questionLabel || String(index + 1),
      key: `${activity.runtimeKey}:${interaction.interactionId}` })) : [];
  });
  const isAnswered = (activity: ResolvedRuntimeActivity, id: string) => {
    if (activitySummaries[activity.runtimeKey]) return activitySummaries[activity.runtimeKey].answered.includes(id);
    const resolution = registry.resolve(activity.projection, { mode: 'read-only', sourceContext: activity.placement.sourceContext, surface: 'student-runtime' });
    if (!resolution.supported) return false;
    const codec = resolution.registration.codec;
    const decoded = codec.decode(responses[id] ?? codec.createEmpty());
    if (!decoded.valid || !codec.validate(decoded.value).valid) return false;
    const review = codec.toReviewProjection(decoded.value);
    return review.text.trim().length > 0 || Boolean(review.items?.length);
  };
  const focusQuestion = (runtimeKey: string, interactionId: string) => {
    const focused = activities.find((activity) => activity.runtimeKey === runtimeKey);
    if (!focused) return;
    setFocusedRuntimeKey(runtimeKey);
    setFocusedQuestion(`${runtimeKey}:${interactionId}`);
    if (navigation.state.mobileTab !== 'activity' || navigation.state.desktopView === 'pdf-focus') navigation.focusActivity();
    requestAnimationFrame(() => {
      const card = [...(activityPanelRef.current?.querySelectorAll<HTMLElement>('[data-book-activity]') ?? [])].find((node) => node.dataset.bookActivity === runtimeKey);
      const question = [...(card?.querySelectorAll<HTMLElement>('[data-book-interaction]') ?? [])].find((node) => node.dataset.bookInteraction === interactionId);
      question?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
      (question?.querySelector<HTMLElement>('input, textarea, select') ?? question)?.focus();
    });
    onAction?.('bookRuntimeQuestionFocused', { activityId: focused.activityId, runtimeKey, interactionId });
  };
  const questionTools = (activity: ResolvedRuntimeActivity) => (id: string, index: number) => {
    const key = `${activity.runtimeKey}:${id}`;
    return <div className="book-runtime-shell__question-tools"><span>Question {questions.find((item) => item.key === key)?.label ?? index + 1}</span>
      <button type="button" aria-label={`Flag question ${index + 1}`} aria-pressed={Boolean(flags[key])} disabled={!flagsState.loaded || flagsState.key !== flagsKey}
        onClick={() => { setFlagsState((current) => ({ ...current, values: { ...current.values, [key]: !current.values[key] } }));
          onAction?.('bookRuntimeQuestionFlagged', { activityId: activity.activityId, interactionId: id, flagged: !flags[key] }); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V3h14l-3 5 3 5H5" fill={flags[key] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" /></svg>
        <span>{flags[key] ? 'Flagged' : 'Flag'}</span>
      </button></div>;
  };
  const onPageReady = useCallback((page: number) => { if (page === navigation.state.combinedPhysicalPage) setSuccessfulPage({ key: documentKey, page }); }, [documentKey, navigation.state.combinedPhysicalPage]);
  const referenceOnly = displayedPage !== null && mappedActivities.length === 0;
  const onlyBook = navigation.state.desktopView === 'pdf-focus';
  const bookTitle = display?.bookTitle?.trim() || 'Book study';
  const unitTitle = display?.unitTitle?.trim() || deliveryProjection.outline?.find((node) => node.nodeKey === activeActivity.placement.nodeKey)?.titleSnapshot?.trim() || 'Activity workspace';
  const contextLabel = display?.contextLabel?.trim() || (candidatePreview ? 'Student preview' : `${deliveryProjection.context.kind === 'homework' ? 'Book Homework' : 'Book study'}`);
  const deadline = 'scheduleWindow' in activeActivity.placement ? activeActivity.placement.scheduleWindow?.deadline.at : undefined;
  const shell = <div className="book-runtime-shell" data-testid="book-runtime-shell" data-desktop-view={navigation.state.desktopView}
    data-mobile-tab={referenceOnly ? 'page' : navigation.state.mobileTab} data-reference-only={referenceOnly} style={{ '--book-split': `${splitRatio}%` } as CSSProperties}>
    <header className="book-runtime-shell__header">
      {onReturn && <button className="book-runtime-shell__return" type="button" aria-label="Return" onClick={onReturn}>← <span>{deliveryProjection.context.kind === 'homework' ? 'Homework' : 'Return'}</span></button>}
      <div className="book-runtime-shell__title"><h1>{bookTitle} · {unitTitle}</h1><p>{contextLabel}{deadline ? ` · Due ${new Date(deadline).toLocaleString()}` : ''}</p></div>
      <div className="book-runtime-shell__header-tools">
        <span className="book-runtime-shell__save-chip" role="status">{Object.values(activitySummaries).some((item) => item.dirty) ? 'Saving work…' : Object.values(activitySummaries).length ? 'Draft status in each Activity' : candidatePreview ? 'Read-only preview' : 'Loading work…'}</span>
        {personalTimer}
        <button className="book-runtime-shell__only-book" type="button" aria-pressed={onlyBook} onClick={() => {
          onAction?.(onlyBook ? 'bookRuntimeSplitRestored' : 'bookRuntimePdfFocused'); navigation.setDesktopView(onlyBook ? 'split' : 'pdf-focus');
        }}>{onlyBook ? 'Restore Activities' : 'Only book'}</button>
      </div>
    </header>
    <nav className="book-runtime-shell__mobile-tabs" role="tablist" aria-label="Book runtime panels">
      {(['page', 'activity'] as const).map((tab) => <button key={tab} type="button" role="tab" disabled={referenceOnly && tab === 'activity'} aria-controls={`book-runtime-${tab}-panel`} aria-selected={(referenceOnly ? 'page' : navigation.state.mobileTab) === tab}
        onClick={() => { onAction?.('bookRuntimeTabSwitched', { tab }); navigation.setMobileTab(tab); }}>{tab === 'page' ? 'Book Page' : 'Activity'}</button>)}
    </nav>
    <div className="book-runtime-shell__workspace" ref={workspaceRef}>
      <section className="book-runtime-shell__viewer-pane" aria-label="Book page viewer" id="book-runtime-page-panel" role="tabpanel">
        <div className="book-runtime-shell__viewer-content" data-testid="book-runtime-viewer">{viewer.render({ activeActivityId: activeActivity.activityId,
          pageGroupKey: navigation.state.pageGroupKey, combinedPhysicalPage: navigation.state.combinedPhysicalPage, request,
          view: navigation.state.desktopView, allowedPages, onPageReady,
          onPageChange: (page) => { onAction?.('bookRuntimeCombinedPageSelected', { combinedPhysicalPage: page }); navigation.selectCombinedPhysicalPage(page); } })}</div>
        {viewer.status?.state === 'loading' && <p role="status">{viewer.status.message}</p>}{viewer.status?.state === 'error' && <p role="alert">{viewer.status.message}</p>}
      </section>
      <div className="book-runtime-shell__splitter" role="separator" aria-label="Resize Book and Activity panels" aria-orientation="vertical" tabIndex={0}
        aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(splitRatio)}
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); }}
        onPointerMove={(event) => { if (!(event.buttons & 1)) return; const bounds = workspaceRef.current?.getBoundingClientRect(); if (bounds) resize((event.clientX - bounds.left) / bounds.width * 100); }}
        onPointerUp={() => onAction?.('bookRuntimeSplitResized', { percent: Math.round(ratioRef.current) })}
        onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) { event.preventDefault(); resize(event.key === 'Home' ? 46 : ratioRef.current + (event.key === 'ArrowLeft' ? -2 : 2)); onAction?.('bookRuntimeSplitResized'); } }} />
      <section className="book-runtime-shell__activity-pane" id="book-runtime-activity-panel" aria-label="Mapped Activities" role="tabpanel" ref={activityPanelRef}
        onFocusCapture={(event) => { const card = (event.target as HTMLElement).closest<HTMLElement>('[data-book-activity]');
          const question = (event.target as HTMLElement).closest<HTMLElement>('[data-book-interaction]');
          if (card?.dataset.bookActivity) setFocusedRuntimeKey(card.dataset.bookActivity);
          if (card?.dataset.bookActivity && question?.dataset.bookInteraction) setFocusedQuestion(`${card.dataset.bookActivity}:${question.dataset.bookInteraction}`);
        }}>
        <header className="book-runtime-shell__activity-page-head"><p className="book-runtime-shell__eyebrow">Page {displayedPage ?? navigation.state.combinedPhysicalPage} · {mappedActivities.length} mapped Activities</p>
          <h2>Work beside the Book</h2><p>Your answers stay here. Each Activity saves and submits independently.</p></header>
        {displayedPage === null && <p role="status">Preparing the Book page…</p>}
        {activities.filter((activity) => retainedKeys.has(activity.runtimeKey)).map((activity) => <article className="book-runtime-shell__activity-card" key={activity.runtimeKey}
          hidden={!mappedKeys.includes(activity.runtimeKey)} data-book-activity={activity.runtimeKey} data-submitted={activitySummaries[activity.runtimeKey]?.submitted}>
          <header className="book-runtime-shell__card-title"><h3>{activity.label}</h3><span>{activitySummaries[activity.runtimeKey]?.reviewRequired ? 'Submitted for review' : activitySummaries[activity.runtimeKey]?.submitted ? 'Submitted' : 'Open'}</span></header>
          {activity.placement.sourceContext.available && <p className="book-runtime-shell__source-cue">{activity.placement.contextMode === 'required' ? 'Source required' : 'Source context'} · {activity.placement.sourceContext.description}</p>}
          {renderActivity ? renderActivity(activity, questionTools(activity)) : <ActivityRendererHost registry={registry} projection={activity.projection}
            context={{ mode: candidatePreview ? 'read-only' : responseMode ?? (deliveryProjection.actionFlags.canAutosave ? 'editable' : 'read-only'), sourceContext: activity.placement.sourceContext, surface: 'student-runtime' }}
            responses={responses} validationByInteractionId={validationByInteractionId} questionTools={questionTools(activity)}
            onResponseChange={(id, value) => { onAction?.('bookRuntimeResponseChanged', { interactionId: id }); onResponseChange(id, value); }} />}
        </article>)}
        {persistence && <div className="book-runtime-shell__persistence" role="status" data-testid="book-runtime-persistence" data-status={persistence.status} data-dirty={persistence.isDirty}>{persistence.message}</div>}
      </section>
      {(onlyBook || referenceOnly) && <button type="button" className="book-runtime-shell__restore" aria-label="Restore Activity panel" disabled={referenceOnly} onClick={() => { onAction?.('bookRuntimeSplitRestored'); navigation.restoreSplitView(); }}>↤ <span>Activities</span></button>}
    </div>
    <footer className="book-runtime-shell__footer">
      <details className="book-runtime-shell__outline"><summary>Pages</summary><nav aria-label="Book page groups">
        {pageGroups.map((group, index) => <button type="button" key={group.pageGroupKey} aria-current={navigation.state.pageGroupKey === group.pageGroupKey ? 'page' : undefined}
          disabled={navigation.isTransitioning} onClick={() => { onAction?.('bookRuntimePageGroupSelected', { pageGroupKey: group.pageGroupKey }); navigation.selectPageGroup(group.pageGroupKey); }}>Page Group {index + 1} · {group.combinedPhysicalPages.join(', ')}</button>)}
        {(deliveryProjection.outline ?? []).map((node) => <p key={node.nodeKey}>{node.titleSnapshot || 'Book section'}</p>)}</nav></details>
      <nav className="book-runtime-shell__question-navigator" aria-label="Activity and question navigator">{questions.map((question) => <button type="button" key={question.key}
        aria-label={`${question.activity.label}, question ${question.label}${isAnswered(question.activity, question.interactionId) ? ', answered' : ', unanswered'}${flags[question.key] ? ', flagged' : ''}${activitySummaries[question.activity.runtimeKey]?.submitted ? ', submitted' : ''}`}
        aria-current={focusedQuestion === question.key ? 'true' : undefined} data-answered={isAnswered(question.activity, question.interactionId)} data-flagged={Boolean(flags[question.key])} data-submitted={activitySummaries[question.activity.runtimeKey]?.submitted}
        onClick={() => focusQuestion(question.activity.runtimeKey, question.interactionId)}>{question.label}{flags[question.key] ? ' ⚑' : ''}{activitySummaries[question.activity.runtimeKey]?.submitted ? ' ✓' : ''}</button>)}</nav>
      {referenceOnly ? <p>Reference-only page · no answer work here</p> : <p className="book-runtime-shell__footer-summary">{questions.filter((question) => isAnswered(question.activity, question.interactionId)).length} / {questions.length} answered · {questions.filter((question) => flags[question.key]).length} flagged</p>}
    </footer>
  </div>;
  if (!integrityCapture || deliveryProjection.projectionKind !== 'book-runtime-delivery' || !('activityVersion' in activeActivity.placement)) return shell;
  const focusedPlacement = activeActivity.placement;
  const placement = integrityCapture.frozenPoliciesByPlacementId[focusedPlacement.placementId] && integrityCapture.captureSlotsByPlacementId?.[focusedPlacement.placementId]
    ? focusedPlacement : activities.find((activity) => integrityCapture.frozenPoliciesByPlacementId[activity.placement.placementId] && integrityCapture.captureSlotsByPlacementId?.[activity.placement.placementId])?.placement;
  if (!placement || !('activityVersion' in placement)) return shell;
  const frozenPolicy = integrityCapture.frozenPoliciesByPlacementId[placement.placementId];
  const captureSlot = integrityCapture.captureSlotsByPlacementId?.[placement.placementId];
  if (!frozenPolicy || !captureSlot) return shell;
  return <BookRuntimeIntegrityBoundary options={{ client: integrityCapture.client,
    target: { bookId: deliveryProjection.book.bookId, bindingId: deliveryProjection.bindingId, bindingRevision: deliveryProjection.bindingRevision,
      contextKind: 'homework', contextId: deliveryProjection.context.contextId, placementId: placement.placementId, activityId: placement.activityId, activityVersion: Number(placement.activityVersion) },
    frozenPolicy, captureSlotId: captureSlot.captureSlotId, captureAttemptNumber: captureSlot.captureAttemptNumber,
    enabled: placement === focusedPlacement && integrityCapture.enabled && (integrityCapture.enabledByPlacementId?.[placement.placementId] ?? true),
    active: integrityCapture.active && mappedKeys.includes(activeActivity.runtimeKey) && (integrityCapture.activeByPlacementId?.[placement.placementId] ?? true), onWarning: integrityCapture.onWarning }}>{shell}</BookRuntimeIntegrityBoundary>;
};

export default BookRuntimeShell;
