import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookRuntimeShell, PersonalTimer, type BookRuntimeViewerAdapter } from '../components/book-runtime';
import { toast } from '../components/modern';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { useAuth } from '../hooks/useAuth';
import { bookActivityRendererRegistry } from '../services/book-activity/runtime/activityRendererRegistry';
import { createBookRuntimeClient } from '../services/book-activity/activityRuntime.browser';
import { useBookActivityRuntime } from '../hooks/book-runtime/useBookActivityRuntime';
import { storage } from '../core/platform/storage';
import type { BookRuntimeDeliveryProjection } from '../services/book-delivery/bookDelivery.types';
import type { BookRuntimeNavigationState } from '../hooks/book-runtime/useBookRuntimeNavigation';
import { FEATURE_IDS } from '../config/featureRegistry';
import { ROUTES } from '../constants/routes';

const deliveryProjection: BookRuntimeDeliveryProjection = {
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-student-fixture',
  bindingRevision: 3,
  recipientId: 'student-fixture',
  context: { contextId: 'homework-fixture', kind: 'homework', entitlementBasis: 'assignment' },
  book: {
    bookId: 'book-runtime-fixture',
    bookMode: 'pdf',
    bookRevision: 2,
    publicationId: 'publication-fixture-v2',
    publicationRevision: 2,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['group-1', 'group-2'], placementIds: ['placement-choice', 'placement-source', 'placement-long'] },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full-pdf',
      sourceVersionId: 'source-fixture-v2',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  documentRequests: [{
    sourceKey: 'full-pdf',
    sourceVersionId: 'source-fixture-v2',
    opaqueRouteKey: 'fixture-route-v2',
    localPageScope: { kind: 'all', pages: [] },
  }],
  activities: [
    {
      placementId: 'placement-choice',
      activityId: 'activity-choice',
      activityVersion: 1,
      nodeKey: 'group-1',
      order: 1,
      contextMode: 'none',
      sourceContext: { available: false, description: 'No source context required.', sourcePageScopes: [] },
    },
    {
      placementId: 'placement-source',
      activityId: 'activity-source',
      activityVersion: 1,
      nodeKey: 'group-1',
      order: 2,
      contextMode: 'required',
      sourceContext: {
        available: true,
        description: 'Book Page 3 · Exercise 1.',
        sourcePageScopes: [{ sourceKey: 'full-pdf', pages: [3] }],
      },
    },
    {
      placementId: 'placement-long',
      activityId: 'activity-long',
      activityVersion: 1,
      nodeKey: 'group-2',
      order: 3,
      contextMode: 'optional',
      sourceContext: {
        available: true,
        description: 'Book Page 6 · Writing prompt.',
        sourcePageScopes: [{ sourceKey: 'full-pdf', pages: [6] }],
      },
    },
  ],
  actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
  provenance: {
    publicationId: 'publication-fixture-v2',
    publicationRevision: 2,
    bindingId: 'binding-student-fixture',
    bindingRevision: 3,
  },
};

const componentDeliveryProjection: BookRuntimeDeliveryProjection = {
  ...deliveryProjection,
  bindingId: 'binding-student-components-fixture',
  bindingRevision: 4,
  sourceSet: {
    strategy: 'component_pdfs',
    sources: [
      {
        sourceKey: 'component-pdf-2',
        sourceVersionId: 'source-component-v2',
        lifecycle: 'verified-usable',
        sourceOrder: 2,
        ownerNodeKey: 'group-2',
        localPageScope: { kind: 'pages', pages: [1, 2] },
      },
      {
        sourceKey: 'component-pdf-1',
        sourceVersionId: 'source-component-v1',
        lifecycle: 'verified-usable',
        sourceOrder: 1,
        ownerNodeKey: 'group-1',
        localPageScope: { kind: 'pages', pages: [1, 2, 3] },
      },
    ],
  },
  documentRequests: [
    {
      sourceKey: 'component-pdf-2',
      sourceVersionId: 'source-component-v2',
      opaqueRouteKey: 'component-route-v2',
      localPageScope: { kind: 'pages', pages: [1, 2] },
    },
    {
      sourceKey: 'component-pdf-1',
      sourceVersionId: 'source-component-v1',
      opaqueRouteKey: 'component-route-v1',
      localPageScope: { kind: 'pages', pages: [1, 2, 3] },
    },
  ],
  activities: [
    {
      ...deliveryProjection.activities[0]!,
      sourceContext: {
        available: true,
        description: 'Component 1 Â· Book Page 1.',
        sourcePageScopes: [{ sourceKey: 'component-pdf-1', pages: [1] }],
      },
    },
    {
      ...deliveryProjection.activities[1]!,
      sourceContext: {
        available: true,
        description: 'Component 1 Â· Book Page 2.',
        sourcePageScopes: [{ sourceKey: 'component-pdf-1', pages: [2] }],
      },
    },
    {
      ...deliveryProjection.activities[2]!,
      sourceContext: {
        available: true,
        description: 'Component 2 Â· Book Page 1.',
        sourcePageScopes: [{ sourceKey: 'component-pdf-2', pages: [1] }],
      },
    },
  ],
  provenance: {
    ...deliveryProjection.provenance,
    bindingId: 'binding-student-components-fixture',
    bindingRevision: 4,
  },
};

const choiceProjection = {
  schemaVersion: 1,
  title: 'Choose the best answer.',
  taskProfile: { taxonomyId: 'ielts-reading', typeId: 'multiple-choice', taxonomyVersion: 1 },
  presentationMode: 'structured' as const,
  contextRequirement: { mode: 'none' as const, acceptedKinds: [] },
  instructions: [{ text: 'Select one answer.' }],
  interaction: { family: 'choice' as const, variant: 'single-choice' },
  answerRule: { defaultPoints: 1, normalization: 'exact' as const, requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    interactionId: 'choice-1',
    family: 'choice' as const,
    prompt: 'Which statement is supported?',
    options: [
      { itemId: 'a', label: 'Statement A' },
      { itemId: 'b', label: 'Statement B' },
    ],
  }],
  scoring: { mode: 'auto-where-possible' as const, feedbackVisibility: 'none' as const },
};

const sourceProjection = {
  schemaVersion: 1,
  title: 'Complete the source-assisted sentence.',
  taskProfile: { taxonomyId: 'ielts-reading', typeId: 'table-completion', taxonomyVersion: 1 },
  presentationMode: 'source-assisted' as const,
  contextRequirement: { mode: 'required' as const, acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Use the Book Page reference while answering.' }],
  interaction: { family: 'text-entry' as const, variant: 'table-cell-blank' },
  answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' as const },
  stimulus: { kind: 'embedded-text', text: 'The source describes ____.' },
  assetRefs: [],
  interactions: [{
    interactionId: 'source-1',
    family: 'text-entry' as const,
    prompt: 'Enter the missing phrase.',
    sourceAssisted: {
      questionLabel: '1.1',
      accessiblePrompt: 'Enter the missing phrase for question 1.1.',
      responseShape: 'text',
      sourceExerciseLabel: 'Exercise 1',
    },
  }],
  scoring: { mode: 'auto-where-possible' as const, feedbackVisibility: 'none' as const },
};

const longResponseProjection = {
  schemaVersion: 1,
  title: 'Write a response for review.',
  taskProfile: null,
  presentationMode: 'structured' as const,
  contextRequirement: { mode: 'optional' as const, acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Draft a response. A teacher reviews this Activity.' }],
  interaction: { family: 'long-response' as const, variant: 'v1' },
  answerRule: { defaultPoints: 0, normalization: 'trim-case-and-spacing' as const },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    interactionId: 'long-1',
    family: 'long-response' as const,
    prompt: 'Explain the author’s main claim.',
  }],
  scoring: { mode: 'review-required' as const, feedbackVisibility: 'after-review' as const },
};

const fixtureActivities = [
  { activityId: 'activity-choice', projection: choiceProjection, label: 'Main claim' },
  { activityId: 'activity-source', projection: sourceProjection, label: 'Source detail' },
  { activityId: 'activity-long', projection: longResponseProjection, label: 'Written response' },
];

type FixtureRuntimeMode = 'none' | 'failure' | 'conflict';
let fixtureRuntimeMode: FixtureRuntimeMode = 'none';

const FIXTURE_RUNTIME_STORE_KEY = 'prd0062-book-runtime-worker-fixture-v1';
const FIXTURE_RUNTIME_TERMINAL_STORE_KEY = 'prd0062-book-runtime-terminal-fixture-v1';

const componentPagesFromSearchParams = (searchParams: URLSearchParams): Readonly<Record<string, number>> => {
  const pages: Record<string, number> = {};
  const serialized = searchParams.get('componentPages') ?? '';
  serialized.split(',').forEach((entry) => {
    const separator = entry.lastIndexOf(':');
    if (separator <= 0) return;
    const componentId = entry.slice(0, separator);
    const page = Number(entry.slice(separator + 1));
    if (componentId && Number.isSafeInteger(page) && page > 0) pages[componentId] = page;
  });
  const activeComponentId = searchParams.get('component');
  const activePage = Number(searchParams.get('componentPage'));
  if (activeComponentId && Number.isSafeInteger(activePage) && activePage > 0) {
    pages[activeComponentId] = activePage;
  }
  return pages;
};

const componentPagesToSearchParam = (pages: Readonly<Record<string, number>>): string => Object.entries(pages)
  .filter(([, page]) => Number.isSafeInteger(page) && page > 0)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([componentId, page]) => `${componentId}:${page}`)
  .join(',');

const fixtureRuntimeFetch: typeof fetch = async (input, init) => {
  const requestUrl = new URL(input instanceof Request ? input.url : String(input));
  if (!requestUrl.pathname.startsWith('/book-runtime/')) {
    return new Response(JSON.stringify({ code: 'book_route_not_found' }), { status: 404 });
  }
  if (requestUrl.pathname === '/book-runtime/commands' && init?.method === 'POST') {
    if (fixtureRuntimeMode === 'failure') {
      fixtureRuntimeMode = 'none';
      return new Response(JSON.stringify({ code: 'book_route_unavailable' }), { status: 503 });
    }
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    const key = [payload.contextId, payload.placementId, payload.interactionId].join(':');
    const records = await storage.get<Record<string, Record<string, unknown>>>(FIXTURE_RUNTIME_STORE_KEY) ?? {};
    const current = records[key];
    if (payload.commandKind === 'submit') {
      const terminals = await storage.get<Record<string, Record<string, unknown>>>(
        FIXTURE_RUNTIME_TERMINAL_STORE_KEY,
      ) ?? {};
      const terminalKey = [payload.contextId, payload.placementId, payload.interactionId].join(':');
      const existing = terminals[terminalKey];
      if (existing) {
        return new Response(JSON.stringify({ ...existing, status: 'replayed' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (!current || current.revision !== payload.clientRevision) {
        return new Response(JSON.stringify({ code: 'runtime_submit_draft_unavailable' }), { status: 409 });
      }
      const result = {
        status: 'accepted',
        resultStatus: payload.activityId === 'activity-long' ? 'pending_review' : 'submitted',
        completionStatus: 'completed',
        receipt: {
          operationId: payload.operationId,
          status: 'accepted',
          bindingId: payload.bindingId,
          attemptId: `attempt-${payload.activityId}`,
          createdAt: new Date().toISOString(),
        },
      };
      terminals[terminalKey] = result;
      await storage.set(FIXTURE_RUNTIME_TERMINAL_STORE_KEY, terminals);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (fixtureRuntimeMode === 'conflict') {
      fixtureRuntimeMode = 'none';
      records[key] = {
        ...(current ?? {}),
        revision: Number(current?.revision ?? 0) + 1,
        response: { interactionId: payload.interactionId, text: 'server version changed' },
        updatedByOperationId: '00000000-0000-4000-8000-000000000099',
        updatedAt: new Date().toISOString(),
      };
      await storage.set(FIXTURE_RUNTIME_STORE_KEY, records);
      return new Response(JSON.stringify({ code: 'runtime_cas_conflict', currentRevision: records[key].revision }), { status: 409 });
    }
    const revision = Number(current?.revision ?? 0) + 1;
    records[key] = {
      schemaVersion: 1,
      bindingId: payload.bindingId,
      recipientId: deliveryProjection.recipientId,
      contextId: payload.contextId,
      placementId: payload.placementId,
      activityId: payload.activityId,
      activityVersion: payload.activityVersion,
      interactionId: payload.interactionId,
      revision,
      response: payload.response,
      updatedByOperationId: payload.operationId,
      updatedAt: new Date().toISOString(),
    };
    await storage.set(FIXTURE_RUNTIME_STORE_KEY, records);
    return new Response(JSON.stringify({
      status: 'accepted',
      receipt: {
        operationId: payload.operationId,
        status: 'accepted',
        bindingId: payload.bindingId,
        draftRevision: revision,
        createdAt: new Date().toISOString(),
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (requestUrl.pathname.startsWith('/book-runtime/drafts/') && init?.method === 'GET') {
    const parts = requestUrl.pathname.split('/').filter(Boolean).slice(2);
    const key = [parts[2], parts[3], parts[6]].join(':');
    const records = await storage.get<Record<string, Record<string, unknown>>>(FIXTURE_RUNTIME_STORE_KEY) ?? {};
    return new Response(JSON.stringify({ draft: records[key] ?? null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ code: 'book_route_not_found' }), { status: 404 });
};

const viewer: BookRuntimeViewerAdapter = {
  title: 'Reference PDF',
  status: { state: 'ready', message: 'Reference PDF ready.' },
  render: ({ activeActivityId, pageGroupKey, componentId, physicalPageNumber, request, view }) => (
    <section aria-label="Reference-only PDF" data-testid="reference-only-pdf">
      <p style={{ marginTop: 0, fontWeight: 700 }}>Reference-only PDF</p>
      <p>PDF focus: {view === 'pdf-focus' ? 'focused' : 'split'}.</p>
      <p>Page Group: {pageGroupKey}</p>
      <p>Activity anchor: {activeActivityId}</p>
      <p>Component: {componentId}</p>
      <p>Component page: {physicalPageNumber}</p>
      <p>Source: {request?.sourceVersionId ?? 'unavailable'}</p>
      <div
        aria-label="PDF page canvas"
        role="img"
        style={{ minHeight: 220, padding: 24, background: '#eaeff1', borderRadius: 8 }}
      >
        Authorized student-safe PDF fixture
      </div>
    </section>
  ),
};

export default function BookRuntimeShellSmokePage() {
  const { user, profile } = useAuth();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.testTaking);
  const [searchParams, setSearchParams] = useSearchParams();
  const componentMode = searchParams.get('strategy') === 'components';
  const activeProjection = componentMode ? componentDeliveryProjection : deliveryProjection;
  const requestedComponentId = searchParams.get('component');
  const initialActivityId = searchParams.get('activity')
    ?? (requestedComponentId
      ? activeProjection.activities.find((activity) => activity.sourceContext.sourcePageScopes.some(
        (scope) => scope.sourceKey === requestedComponentId,
      ))?.activityId
      : undefined)
    ?? fixtureActivities[0]!.activityId;
  const [activeActivityId, setActiveActivityId] = useState(
    initialActivityId,
  );
  const previousPersistenceStatus = useRef<string | null>(null);
  const requestedBookId = searchParams.get('bookId');
  const requestedUnitKey = searchParams.get('unitKey');
  const requestedActivityId = searchParams.get('activity');
  const requestedPageGroupKey = searchParams.get('pageGroup');
  const requestedActivity = fixtureActivities.find((activity) => activity.activityId === requestedActivityId);
  const requestedPageGroupExists = activeProjection.activities.some(
    (activity) => activity.nodeKey === requestedPageGroupKey,
  );
  const activeFixtureActivity = fixtureActivities.find(
    (activity) => activity.activityId === activeActivityId,
  ) ?? fixtureActivities[0]!;
  const activePlacement = activeProjection.activities.find(
    (activity) => activity.activityId === activeFixtureActivity.activityId,
  ) ?? activeProjection.activities[0]!;
  const activeInteractionIds = useMemo(() => (
    Array.isArray((activeFixtureActivity.projection as { interactions?: unknown }).interactions)
      ? ((activeFixtureActivity.projection as { interactions: Array<{ interactionId: string }> }).interactions)
        .map((interaction) => interaction.interactionId)
      : []
  ), [activeFixtureActivity]);
  const runtimeAddress = useMemo(() => ({
    bindingId: activeProjection.bindingId,
    bindingRevision: activeProjection.bindingRevision,
    contextId: activeProjection.context.contextId,
    placementId: activePlacement.placementId,
    activityId: activePlacement.activityId,
    activityVersion: activePlacement.activityVersion,
  }), [activePlacement, activeProjection]);
  const runtimeClient = useMemo(() => createBookRuntimeClient({
    baseUrl: typeof window === 'undefined' ? 'http://localhost:5174' : window.location.origin,
    getIdToken: async () => 'student-fixture-token',
    fetchImpl: fixtureRuntimeFetch,
  }), []);
  const serializeResponse = useCallback((interactionId: string, response: unknown) => {
    const resolution = bookActivityRendererRegistry.resolve(
      activeFixtureActivity.projection,
      {
        mode: 'editable',
        sourceContext: activePlacement.sourceContext,
        surface: 'student-runtime',
      },
    );
    if (!resolution.supported) throw new Error(`Activity renderer unavailable: ${interactionId}`);
    return resolution.registration.codec.serialize(response);
  }, [activeFixtureActivity, activePlacement]);
  const runtime = useBookActivityRuntime({
    client: runtimeClient,
    recipientId: activeProjection.recipientId,
    address: runtimeAddress,
    interactionIds: activeInteractionIds,
    serializeResponse,
    onMetric: (metric) => trackAction('bookRuntimeMetricRecorded', {
      event: metric.event,
      ...(metric.attempt === undefined ? {} : { attempt: metric.attempt }),
      ...(metric.durationMs === undefined ? {} : { durationMs: metric.durationMs }),
      ...(metric.payloadBytes === undefined ? {} : { payloadBytes: metric.payloadBytes }),
    }),
  });
  const initialNavigation = useMemo<Partial<BookRuntimeNavigationState>>(() => ({
    activityId: searchParams.get('activity') ?? undefined,
    pageGroupKey: searchParams.get('pageGroup') ?? undefined,
    componentId: searchParams.get('component') ?? undefined,
    componentPageById: componentMode ? componentPagesFromSearchParams(searchParams) : undefined,
  }), [componentMode, searchParams]);
  const onNavigationStateChange = useCallback((state: BookRuntimeNavigationState) => {
    setActiveActivityId(state.activityId);
    const next = new URLSearchParams(searchParams);
    next.set('bookId', activeProjection.book.bookId);
    next.set('unitKey', 'unit-fixture');
    next.set('pageGroup', state.pageGroupKey);
    next.set('activity', state.activityId);
    if (componentMode) {
      next.set('component', state.componentId);
      next.set('componentPage', String(state.componentPageById[state.componentId] ?? 1));
      next.set('componentPages', componentPagesToSearchParam(state.componentPageById));
    } else {
      next.delete('component');
      next.delete('componentPage');
      next.delete('componentPages');
    }
    setSearchParams(next, { replace: true });
  }, [activeProjection, componentMode, searchParams, setSearchParams]);
  const onResponseChange = useCallback((interactionId: string, response: unknown) => {
    runtime.change(interactionId, response);
  }, [runtime]);
  const onFlushBeforeNavigate = useCallback(async () => {
    const result = await runtime.flush('navigation');
    if (!result.safeToLeave) throw new Error('Activity response is not safely saved.');
  }, [runtime]);
  useEffect(() => {
    if (requestedActivityId && fixtureActivities.some((activity) => activity.activityId === requestedActivityId)) {
      setActiveActivityId(requestedActivityId);
    }
  }, [requestedActivityId]);
  useEffect(() => {
    const key = `${runtime.status}:${runtime.message}`;
    if (previousPersistenceStatus.current === key) return;
    previousPersistenceStatus.current = key;
    if (runtime.status === 'conflict' || runtime.status === 'error' || runtime.status === 'unsafe-to-leave') {
      toast.error(runtime.message);
    }
  }, [runtime.message, runtime.status]);
  const shellData = useMemo(() => ({
    enrolledClasses: [],
    classLiveSessions: [],
    sortedAssignments: [],
  }), []);

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Student quick-login required</h1>
        <p>Sign in through the Student dev shortcut before opening this fixture.</p>
        <Link to={ROUTES.LOGIN}>Open login</Link>
      </main>
    );
  }

  if (profile?.role && profile.role !== 'student') {
    return (
      <main style={{ padding: 24 }}>
        <h1>Student fixture unavailable</h1>
        <p>This assembled runtime proof requires the Student account.</p>
      </main>
    );
  }

  if (
    (requestedBookId && requestedBookId !== activeProjection.book.bookId) ||
    (requestedUnitKey && requestedUnitKey !== 'unit-fixture') ||
    (requestedActivityId && !requestedActivity) ||
    (requestedPageGroupKey && !requestedPageGroupExists) ||
    (requestedActivity && requestedPageGroupKey &&
      activeProjection.activities.find((activity) => activity.activityId === requestedActivity.activityId)?.nodeKey !== requestedPageGroupKey)
  ) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Student fixture unavailable</h1>
        <p>This runtime fixture does not match the requested Book or Unit.</p>
      </main>
    );
  }

  return (
    <StudentLayout
      mobileTitle="Book Runtime"
      rightPanel={null}
      shellData={shellData}
      sidebar={<StudentSidebar activePage="library" />}
    >
      <div aria-label="Runtime proof controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => { fixtureRuntimeMode = 'failure'; }}
          style={{ minHeight: 44 }}
          type="button"
        >
          Force next Worker failure
        </button>
        <button
          onClick={() => { fixtureRuntimeMode = 'conflict'; }}
          style={{ minHeight: 44 }}
          type="button"
        >
          Force stale conflict
        </button>
        <button
          aria-label={`Submit ${activeFixtureActivity.label}`}
          data-testid="book-runtime-submit"
          disabled={runtime.terminalResult !== null}
          onClick={() => {
            const interactionId = activeInteractionIds[0];
            if (!interactionId) return;
            trackAction('bookRuntimeSubmitActivity', {
              activityId: activeFixtureActivity.activityId,
            });
            void runtime.submitActivity(interactionId)
              .then((result) => {
                if (result.resultStatus === 'pending_review') {
                  toast.info('Activity submitted for teacher review.');
                } else {
                  toast.success('Activity submitted.');
                }
              })
              .catch(() => {
                toast.error('Could not submit Activity; your saved response remains available.');
              });
          }}
          style={{ minHeight: 44 }}
          type="button"
        >
          {runtime.terminalResult?.resultStatus === 'pending_review'
            ? 'Submitted for review'
            : runtime.terminalResult
              ? 'Activity submitted'
              : 'Submit Activity'}
        </button>
      </div>
      <BookRuntimeShell
        activities={fixtureActivities}
        deliveryProjection={activeProjection}
        initialNavigation={initialNavigation}
        onAction={(action, metadata) => trackAction(action, metadata)}
        onFlushBeforeNavigate={onFlushBeforeNavigate}
        onNavigationStateChange={onNavigationStateChange}
        onResponseChange={onResponseChange}
        personalTimer={(
          <PersonalTimer
            timerKey={`${activeProjection.recipientId}:${activeProjection.bindingId}:${activeProjection.context.contextId}`}
          />
        )}
        registry={bookActivityRendererRegistry}
        persistence={{
          status: runtime.status,
          message: runtime.message,
          isDirty: runtime.isDirty,
          conflict: runtime.conflict,
          onRetry: () => {
            trackAction('bookRuntimeAutosaveRetry');
            return runtime.retry().then(() => undefined);
          },
          onReload: () => {
            trackAction('bookRuntimeAutosaveReload');
            return runtime.reload();
          },
          onDiscardLocal: () => {
            trackAction('bookRuntimeAutosaveDiscard');
            return runtime.discardLocal();
          },
        }}
        responses={runtime.responses}
        viewer={viewer}
      />
    </StudentLayout>
  );
}
