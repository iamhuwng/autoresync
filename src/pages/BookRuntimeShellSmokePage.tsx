import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookRuntimeShell, type BookRuntimeViewerAdapter } from '../components/book-runtime';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { useAuth } from '../hooks/useAuth';
import { bookActivityRendererRegistry } from '../services/book-activity/runtime/activityRendererRegistry';
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

const viewer: BookRuntimeViewerAdapter = {
  title: 'Reference PDF',
  status: { state: 'ready', message: 'Reference PDF ready.' },
  render: ({ activeActivityId, pageGroupKey, request, view }) => (
    <section aria-label="Reference-only PDF" data-testid="reference-only-pdf">
      <p style={{ marginTop: 0, fontWeight: 700 }}>Reference-only PDF</p>
      <p>PDF focus: {view === 'pdf-focus' ? 'focused' : 'split'}.</p>
      <p>Page Group: {pageGroupKey}</p>
      <p>Activity anchor: {activeActivityId}</p>
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
  const [responses, setResponses] = useState<Readonly<Record<string, unknown>>>({});
  const requestedBookId = searchParams.get('bookId');
  const requestedUnitKey = searchParams.get('unitKey');
  const requestedActivityId = searchParams.get('activity');
  const requestedPageGroupKey = searchParams.get('pageGroup');
  const requestedActivity = fixtureActivities.find((activity) => activity.activityId === requestedActivityId);
  const requestedPageGroupExists = deliveryProjection.activities.some(
    (activity) => activity.nodeKey === requestedPageGroupKey,
  );
  const initialNavigation = useMemo<Partial<BookRuntimeNavigationState>>(() => ({
    activityId: searchParams.get('activity') ?? undefined,
    pageGroupKey: searchParams.get('pageGroup') ?? undefined,
  }), [searchParams]);
  const onNavigationStateChange = useCallback((state: BookRuntimeNavigationState) => {
    const next = new URLSearchParams(searchParams);
    next.set('bookId', deliveryProjection.book.bookId);
    next.set('unitKey', 'unit-fixture');
    next.set('pageGroup', state.pageGroupKey);
    next.set('activity', state.activityId);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const onResponseChange = useCallback((interactionId: string, response: unknown) => {
    setResponses((current) => ({ ...current, [interactionId]: response }));
  }, []);
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
    (requestedBookId && requestedBookId !== deliveryProjection.book.bookId) ||
    (requestedUnitKey && requestedUnitKey !== 'unit-fixture') ||
    (requestedActivityId && !requestedActivity) ||
    (requestedPageGroupKey && !requestedPageGroupExists) ||
    (requestedActivity && requestedPageGroupKey &&
      deliveryProjection.activities.find((activity) => activity.activityId === requestedActivity.activityId)?.nodeKey !== requestedPageGroupKey)
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
      <BookRuntimeShell
        activities={fixtureActivities}
        deliveryProjection={deliveryProjection}
        initialNavigation={initialNavigation}
        onAction={(action, metadata) => trackAction(action, metadata)}
        onNavigationStateChange={onNavigationStateChange}
        onResponseChange={onResponseChange}
        registry={bookActivityRendererRegistry}
        responses={responses}
        viewer={viewer}
      />
    </StudentLayout>
  );
}
