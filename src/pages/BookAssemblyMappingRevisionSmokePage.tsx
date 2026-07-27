import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import BookAssemblyMappingRevisionPanel from '../components/books/assembly/BookAssemblyMappingRevisionPanel';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookAssemblyPublicationPointer,
  BookAssemblyPreviewApprovalReference,
  BookSourceVersionAuthority,
  SourceSetCandidate,
  TrustedBookSourceVersionProjection,
} from '../types/bookAssembly.types';
import type { BookAssemblyBookAuthority } from '../services/book-assembly/unitAssembly.types';
import type { BookAssemblyPublicationScope } from '../services/book-assembly/publicationRepository';
import { InMemoryBookAssemblyPublicationRepository } from '../services/book-assembly/publicationRepository';
import {
  createBookAssemblyPublicationService,
  type BookAssemblyPublicationResult as PublicationResult,
} from '../services/book-assembly/publicationTransaction.service';
import { createMappingRevisionPublicationPlan } from '../services/book-assembly/mappingRevision.service';

const NOW = '2026-07-28T00:00:00.000Z';
const BOOK_ID = 'prd0062-ticket67-book';
const OWNER_ID = 'teacher-1';
const OPERATION_ID = '00000000-0000-4000-8000-000000000067';
const IDS = {
  planId: 'plan-67',
  manifestVersionId: 'manifest-67',
  publicationId: 'publication-67',
  publicationRevision: 2,
  unitProjectionIds: { 'unit-1': 'unit-projection-67' },
  deliveryPlanIds: { 'unit-1': 'delivery-plan-67' },
  activitiesByKey: {
    'unit-1:activity-1': { projectionId: 'activity-projection-67', placementId: 'placement-67' },
  },
} as const;

const sourceSet: SourceSetCandidate = {
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId: 'source-full-v1', sourceOrder: 1 }],
};

const sourceVersions: readonly TrustedBookSourceVersionProjection[] = [
  { sourceVersionId: 'source-full-v1', bookId: BOOK_ID, physicalPageCount: 20, verifiedUsable: true },
];

const sourceVersionAuthority: BookSourceVersionAuthority = {
  getSourceVersion: (sourceVersionId) => sourceVersions.find((source) => source.sourceVersionId === sourceVersionId),
};

const authority: BookAssemblyBookAuthority = {
  bookId: BOOK_ID,
  ownerId: OWNER_ID,
  bookMode: 'pdf',
  bookRevision: 7,
  sourceSetRevision: 4,
  sourceSet,
  sourceVersionAuthority,
};

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: BOOK_ID,
  sourceSet,
  nodes: [
    { nodeKey: 'section-root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'section-root', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'activity-1',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['activity-pages'],
    }],
    pageGroups: [
      {
        pageGroupKey: 'activity-pages',
        sourceKey: 'full',
        pages: [2],
        activityKeys: ['activity-1'],
        mode: 'activity',
      },
      {
        pageGroupKey: 'reference-pages',
        sourceKey: 'full',
        pages: [3],
        activityKeys: [],
        mode: 'reference_only',
        defaultPhysicalPageNumber: 3,
      },
    ],
  }],
});

const predecessor: BookAssemblyImmutableManifestVersion = {
  schemaVersion: 1,
  manifestVersionId: 'manifest-before-67',
  publicationId: 'publication-before-67',
  publicationRevision: 1,
  lifecycle: 'published',
  ownerId: OWNER_ID,
  bookId: BOOK_ID,
  bookRevision: 7,
  sourceSetRevision: 4,
  candidateId: 'candidate-before-67',
  candidateRevision: 3,
  strategy: 'full_pdf',
  adapterTicket: '16',
  inputFingerprint: 'fnv1a64:before-67',
  createdByCommandId: '00000000-0000-4000-8000-000000000016',
  createdAt: NOW,
  manifest: manifest(),
  studentSafeProjection: {
    schemaVersion: 1,
    bookId: BOOK_ID,
    publicationId: 'publication-before-67',
    publicationRevision: 1,
    sourceStrategy: 'full_pdf',
    sourceSet,
    units: manifest().units,
  },
};

const pointer: BookAssemblyPublicationPointer = {
  publicationId: predecessor.publicationId,
  publicationRevision: predecessor.publicationRevision,
  manifestVersionId: predecessor.manifestVersionId,
  bookRevision: predecessor.bookRevision,
  sourceSetRevision: predecessor.sourceSetRevision,
  inputFingerprint: predecessor.inputFingerprint,
  updatedAt: NOW,
  updatedByCommandId: predecessor.createdByCommandId,
};

const publicationScope = (): BookAssemblyPublicationScope<PublicationResult> => ({
  versions: { [predecessor.manifestVersionId]: predecessor },
  current: pointer,
  activityVersions: {
    'activity-1-v1': {
      schemaVersion: 1,
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      activityVersion: 1,
      ownerId: OWNER_ID,
      bookId: BOOK_ID,
      manifestVersionId: predecessor.manifestVersionId,
      publicationId: predecessor.publicationId,
      publicationRevision: predecessor.publicationRevision,
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      createdByCommandId: predecessor.createdByCommandId,
      createdAt: NOW,
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-full-v1', physicalPageNumber: 2 }],
      payloadFingerprint: 'fnv1a64:activity-before-67',
    },
  },
  placements: {
    'placement-before-67': {
      schemaVersion: 1,
      placementId: 'placement-before-67',
      ownerId: OWNER_ID,
      bookId: BOOK_ID,
      manifestVersionId: predecessor.manifestVersionId,
      publicationId: predecessor.publicationId,
      publicationRevision: predecessor.publicationRevision,
      unitKey: 'unit-1',
      nodeKey: 'unit-1',
      activityKey: 'activity-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      order: 1,
      pageGroupKeys: ['activity-pages'],
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-full-v1', physicalPageNumber: 2 }],
    },
  },
});

const createPublisher = () => {
  const repository = new InMemoryBookAssemblyPublicationRepository<PublicationResult>({
    [BOOK_ID]: publicationScope(),
  });
  const service = createBookAssemblyPublicationService(repository);
  return {
    publishMapping: async (input: {
      readonly targetManifest: BookAssemblyManifestCandidate;
      readonly previewApproval?: BookAssemblyPreviewApprovalReference;
    }): Promise<PublicationResult & { readonly impact?: unknown }> => {
      const scope = await repository.readScope(BOOK_ID);
      const current = scope.versions?.[scope.current?.manifestVersionId ?? ''];
      if (!current) throw new Error('predecessor_missing');
      const publishNow = new Date().toISOString();
      const planned = createMappingRevisionPublicationPlan({
        operationId: OPERATION_ID,
        now: publishNow,
        ownerId: OWNER_ID,
        authority,
        predecessor: current,
        predecessorScope: scope,
        targetManifest: input.targetManifest,
        ids: IDS,
        previewApproval: input.previewApproval,
      });
      const result = await service.publish({
        operationId: OPERATION_ID,
        expectedCurrentPublicationId: current.publicationId,
        manifestVersionId: IDS.manifestVersionId,
        publicationId: IDS.publicationId,
        publicationRevision: IDS.publicationRevision,
        plan: planned.plan,
        now: publishNow,
      });
      return { ...result, impact: planned.impact };
    },
  };
};

export default function BookAssemblyMappingRevisionSmokePage() {
  const { user, profile } = useAuth();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const [searchParams, setSearchParams] = useSearchParams();
  const state = searchParams.get('state') ?? 'review';
  const [lastAction, setLastAction] = useState('review-opened');
  const [publishedPublicationId, setPublishedPublicationId] = useState('publication-67');
  const publishedRef = useRef(false);
  const publisher = useMemo(createPublisher, []);
  const signedInLabel = profile?.displayName || profile?.email || user?.email || 'dev fixture';

  const setState = (next: string) => {
    if (next === 'review') publishedRef.current = false;
    setSearchParams({ state: next }, { replace: true });
  };

  const onAction = (action: string, metadata?: Record<string, unknown>) => {
    setLastAction(action);
    trackAction(action, metadata);
  };

  return (
    <main style={{ display: 'grid', gap: 16, maxWidth: 960, margin: '0 auto', overflowX: 'clip', padding: 'clamp(12px, 4vw, 24px)' }}>
      <header>
        <p style={{ margin: 0, color: '#5d687b', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ticket 67 fixture</p>
        <h1 style={{ margin: '4px 0 0' }}>Published mapping-revision proof</h1>
        <p style={{ margin: '8px 0 0' }}>Signed in: {signedInLabel}</p>
        <p data-testid="ticket67-last-action">Last action: {lastAction}</p>
      </header>
      {state === 'review' && (
        <BookAssemblyMappingRevisionPanel
          predecessor={predecessor}
          sourceVersionAuthority={sourceVersionAuthority}
          preservedActivityVersionIds={['activity-1-v1']}
          publisher={publisher}
          onPublished={(result) => {
            publishedRef.current = true;
            setPublishedPublicationId(result.pointer?.publicationId ?? IDS.publicationId);
            setLastAction('mapping-revision-published');
            setState('published');
          }}
          onClosed={() => {
            if (!publishedRef.current) setState('canceled');
          }}
          onAction={onAction}
        />
      )}
      {state === 'canceled' && (
        <section aria-label="Ticket 67 canceled state">
          <h2>Mapping repair canceled</h2>
          <p data-testid="ticket67-current-state">Predecessor remains active and unchanged.</p>
          <p data-testid="ticket67-predecessor-state">{predecessor.publicationId}</p>
          <p data-testid="ticket67-activity-version-state">Activity Version remains unchanged: activity-1-v1</p>
          <button type="button" onClick={() => setState('review')}>Reopen mapping review</button>
        </section>
      )}
      {state === 'published' && (
        <section aria-label="Ticket 67 published state">
          <h2>Mapping revision published</h2>
          <p data-testid="ticket67-current-state">Mapping revision published; predecessor remains readable.</p>
          <p data-testid="ticket67-predecessor-state">Predecessor remains active, immutable, and readable: {predecessor.publicationId}</p>
          <p data-testid="ticket67-activity-version-state">Activity Version remains unchanged: activity-1-v1</p>
          <p data-testid="ticket67-publication-state">Current publication: {publishedPublicationId}</p>
          <button type="button" onClick={() => setState('review')}>Open another mapping review</button>
        </section>
      )}
    </main>
  );
}
