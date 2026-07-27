import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BookAssemblySourceStrategySuccessorPanel from '../components/books/assembly/BookAssemblySourceStrategySuccessorPanel';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPublicationPointer,
  BookSourceVersionAuthority,
  SourceSetCandidate,
  TrustedBookSourceVersionProjection,
} from '../types/bookAssembly.types';
import type { BookAssemblyPublicationScope } from '../services/book-assembly/publicationRepository';
import {
  InMemoryBookAssemblyPublicationRepository,
} from '../services/book-assembly/publicationRepository';
import {
  createBookAssemblyPublicationService,
  type BookAssemblyPublicationResult,
} from '../services/book-assembly/publicationTransaction.service';
import {
  createSourceStrategySuccessorPublicationPlan,
  type SourceStrategySuccessorPublicationIds,
} from '../services/book-assembly/sourceStrategySuccessor.service';
import type {
  BookAssemblySourceStrategySuccessorClient,
  BookAssemblySourceStrategySuccessorResult,
} from '../services/book-assembly/assemblyClient.browser';

const NOW = '2026-07-28T00:00:00.000Z';
const BOOK_ID = 'prd0062-ticket71-book';
const OWNER_ID = 'teacher-1';
const sourceVersions: readonly TrustedBookSourceVersionProjection[] = [
  { sourceVersionId: 'source-full-v1', bookId: BOOK_ID, physicalPageCount: 20, verifiedUsable: true },
  { sourceVersionId: 'source-component-v1', bookId: BOOK_ID, physicalPageCount: 12, verifiedUsable: true },
];

const fullSources: SourceSetCandidate = {
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId: 'source-full-v1', sourceOrder: 1 }],
};
const componentSources: SourceSetCandidate = {
  sourceStrategy: 'component_pdfs',
  sources: [{ sourceKey: 'component-a', sourceVersionId: 'source-component-v1', sourceOrder: 1, ownerNodeKey: 'section-1' }],
};
const authority: BookSourceVersionAuthority = {
  getSourceVersion: (sourceVersionId) => sourceVersions.find((source) => source.sourceVersionId === sourceVersionId),
};

const manifestFor = (sourceSet: SourceSetCandidate) => ({
  bookId: BOOK_ID,
  sourceSet,
  nodes: [
    { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section' as const, order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit' as const, order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pages-1'] }],
    pageGroups: [{
      pageGroupKey: 'pages-1',
      sourceKey: sourceSet.sourceStrategy === 'full_pdf' ? 'full' : 'component-a',
      pages: [sourceSet.sourceStrategy === 'full_pdf' ? 2 : 1],
      activityKeys: ['activity-1'],
      mode: 'activity' as const,
    }],
  }],
});

const predecessorFor = (strategy: 'full_pdf' | 'component_pdfs'): BookAssemblyImmutableManifestVersion => {
  const sourceSet = strategy === 'full_pdf' ? fullSources : componentSources;
  const manifest = manifestFor(sourceSet);
  return {
    schemaVersion: 1,
    manifestVersionId: `manifest-before-${strategy}`,
    publicationId: `publication-before-${strategy}`,
    publicationRevision: 4,
    lifecycle: 'published',
    ownerId: OWNER_ID,
    bookId: BOOK_ID,
    bookRevision: 7,
    sourceSetRevision: 4,
    candidateId: `candidate-before-${strategy}`,
    candidateRevision: 3,
    strategy,
    adapterTicket: strategy === 'full_pdf' ? '16' : '17',
    inputFingerprint: `fnv1a64:before-${strategy}`,
    createdByCommandId: '00000000-0000-4000-8000-000000000064',
    createdAt: NOW,
    manifest,
    studentSafeProjection: {
      schemaVersion: 1,
      bookId: BOOK_ID,
      publicationId: `publication-before-${strategy}`,
      publicationRevision: 4,
      sourceStrategy: strategy,
      sourceSet,
      units: manifest.units,
    },
  };
};

const predecessorScope = (predecessor: BookAssemblyImmutableManifestVersion): BookAssemblyPublicationScope<BookAssemblyPublicationResult> => {
  const unit = predecessor.manifest.units[0]!;
  const group = unit.pageGroups[0]!;
  const sourceVersionId = predecessor.strategy === 'full_pdf' ? 'source-full-v1' : 'source-component-v1';
  const physicalPageNumber = group.pages[0]!;
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
  return {
    versions: { [predecessor.manifestVersionId]: predecessor },
    current: pointer,
    activityVersions: {
      'activity-before': {
        schemaVersion: 1,
        activityId: 'activity-1',
        activityVersionId: 'activity-before',
        activityVersion: 1,
        ownerId: OWNER_ID,
        bookId: BOOK_ID,
        manifestVersionId: predecessor.manifestVersionId,
        publicationId: predecessor.publicationId,
        publicationRevision: predecessor.publicationRevision,
        unitKey: unit.unitKey,
        activityKey: 'activity-1',
        createdByCommandId: predecessor.createdByCommandId,
        createdAt: NOW,
        sourcePages: [{ sourceKey: group.sourceKey, sourceVersionId, physicalPageNumber }],
        payloadFingerprint: 'fnv1a64:activity-before',
      },
    },
  };
};

const idsFor = (predecessor: BookAssemblyImmutableManifestVersion, operationId: string): SourceStrategySuccessorPublicationIds => ({
  planId: `plan-71-${operationId.slice(-6)}`,
  manifestVersionId: `manifest-successor-${operationId.slice(-6)}`,
  publicationId: `publication-successor-${operationId.slice(-6)}`,
  publicationRevision: predecessor.publicationRevision + 1,
  unitProjectionIds: { 'unit-1': `unit-projection-${operationId.slice(-6)}` },
  deliveryPlanIds: { 'unit-1': `delivery-plan-${operationId.slice(-6)}` },
  activitiesByKey: {
    'unit-1:activity-1': {
      activityId: 'activity-1',
      activityVersionId: `activity-version-${operationId.slice(-6)}`,
      activityVersion: 2,
      projectionId: `activity-projection-${operationId.slice(-6)}`,
      placementId: `placement-${operationId.slice(-6)}`,
    },
  },
});

const createLocalClient = (predecessor: BookAssemblyImmutableManifestVersion): BookAssemblySourceStrategySuccessorClient => {
  const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>({
    [BOOK_ID]: predecessorScope(predecessor),
  });
  const service = createBookAssemblyPublicationService(repository);
  return {
    publishSuccessor: async (input) => {
      const scope = await repository.readScope(BOOK_ID);
      const current = scope.versions?.[scope.current?.manifestVersionId ?? ''];
      if (!current) throw new Error('predecessor_missing');
      const planned = createSourceStrategySuccessorPublicationPlan({
        operationId: input.operationId,
        now: NOW,
        ownerId: OWNER_ID,
        authority: {
          bookId: BOOK_ID,
          ownerId: OWNER_ID,
          bookMode: 'pdf',
          bookRevision: 7,
          sourceSetRevision: current.sourceSetRevision,
          sourceSet: current.manifest.sourceSet,
          sourceVersionAuthority: authority,
        },
        predecessor: current,
        predecessorScope: scope,
        target: { sourceSetRevision: input.targetSourceSetRevision, sourceSet: input.targetSourceSet },
        remaps: input.remaps,
        ids: idsFor(current, input.operationId),
        previewApproval: input.previewApproval,
      });
      const result = await service.publish({
        operationId: input.operationId,
        expectedCurrentPublicationId: input.expectedCurrentPublicationId,
        manifestVersionId: planned.plan.studentSafeProjection.publicationId.replace('publication-', 'manifest-'),
        publicationId: planned.plan.studentSafeProjection.publicationId,
        publicationRevision: planned.plan.studentSafeProjection.publicationRevision,
        plan: planned.plan,
        now: NOW,
      });
      return { ...result, impact: planned.impact };
    },
  };
};

export default function BookAssemblySourceStrategySuccessorSmokePage() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const fixture = searchParams.get('fixture') === 'ticket71-component' ? 'ticket71-component' : 'ticket71-full';
  const predecessorStrategy = fixture === 'ticket71-full' ? 'full_pdf' : 'component_pdfs';
  const targetStrategy = predecessorStrategy === 'full_pdf' ? 'component_pdfs' : 'full_pdf';
  const predecessor = useMemo(() => predecessorFor(predecessorStrategy), [predecessorStrategy]);
  const client = useMemo(() => createLocalClient(predecessor), [predecessor]);
  const state = searchParams.get('state') ?? 'review';
  const [lastAction, setLastAction] = useState('review-opened');
  const publishedRef = useRef(false);
  const signedInLabel = profile?.displayName || profile?.email || user?.email || 'dev fixture';

  const setState = (next: string) => {
    if (next === 'review') publishedRef.current = false;
    setSearchParams({ fixture, state: next }, { replace: true });
  };

  const previewApproval = {
    approvalId: 'ticket71-preview-approval',
    approvalRevision: 1,
    approvedAt: '2026-07-27T23:00:00.000Z',
    expiresAt: '2026-07-29T00:00:00.000Z',
  } as const;

  return (
    <main style={{ display: 'grid', gap: 16, maxWidth: 960, margin: '0 auto', overflowX: 'clip', padding: 'clamp(12px, 4vw, 24px)' }}>
      <header>
        <p style={{ margin: 0, color: '#5d687b', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ticket 71 fixture</p>
        <h1 style={{ margin: '4px 0 0' }}>Published source-strategy successor proof</h1>
        <p style={{ margin: '8px 0 0' }}>Signed in: {signedInLabel}</p>
        <p data-testid="ticket71-last-action">Last action: {lastAction}</p>
      </header>
      {state === 'review' && (
        <BookAssemblySourceStrategySuccessorPanel
          bookId={BOOK_ID}
          bookRevision={7}
          currentSourceSetRevision={4}
          predecessor={predecessor}
          sourceVersions={sourceVersions}
          targetStrategy={targetStrategy}
          previewApproval={previewApproval}
          successorClient={client}
          onPublished={() => {
            publishedRef.current = true;
            setLastAction('successor-published');
            setState('published');
          }}
          onClosed={() => {
            if (!publishedRef.current) setState('cancelled');
          }}
          onAction={(action) => setLastAction(action)}
        />
      )}
      {state === 'cancelled' && (
        <section aria-label="Ticket 71 canceled state">
          <h2>Successor canceled</h2>
          <p data-testid="ticket71-current-state">Predecessor remains active and unchanged.</p>
          <button type="button" onClick={() => setState('review')}>Reopen successor review</button>
        </section>
      )}
      {state === 'published' && (
        <section aria-label="Ticket 71 published state">
          <h2>Successor published</h2>
          <p data-testid="ticket71-current-state">Current publication: successor ({targetStrategy})</p>
          <p data-testid="ticket71-predecessor-state">Predecessor remains active, immutable, and readable: {predecessor.publicationId}</p>
          <p data-testid="ticket71-successor-strategy">Successor strategy: {targetStrategy}</p>
          <button type="button" onClick={() => setState('review')}>Open another successor review</button>
        </section>
      )}
    </main>
  );
}
