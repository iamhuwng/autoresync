import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BookMode2EditorShell from '../components/books/BookMode2EditorShell';
import { toast } from '../components/modern';
import { createFullPdfPublicationCommand } from '../services/book-assembly/fullPdfPublication.command';
import {
  InMemoryBookAssemblyPublicationRepository,
  type BookAssemblyPublicationScope,
} from '../services/book-assembly/publicationRepository';
import type { BookAssemblyPublicationResult } from '../services/book-assembly/publicationTransaction.service';
import type { UnitAssemblyRepository } from '../services/book-assembly/unitAssembly.repository';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from '../services/book-assembly/unitAssembly.types';
import type { ActivityAuthoringService } from '../services/book-activity/activityAuthoring.service';
import type { CandidateUnitPreviewProjection } from '../services/book-assembly/unitPreview.service';
import type { BookAssemblyManifestCandidate, TrustedBookSourceVersionProjection } from '../types/bookAssembly.types';
import { materialCatalogIds, type MaterialBookMetadata } from '../types/materialCatalog.types';
import { useAuth } from '../hooks/useAuth';
import {
  createBookTeacherAssemblyDocumentRoute,
  type BookTeacherAssemblyDocumentProjection,
} from '../services/book-delivery/bookTeacherAssemblyDocument.types';

const NOW = '2026-07-27T00:00:00.000Z';
const BOOK_ID = 'prd0062-ticket56-book';
const OWNER_ID = 'teacher-1';

const sourceVersions: readonly TrustedBookSourceVersionProjection[] = [
  { bookId: BOOK_ID, physicalPageCount: 48, sourceVersionId: 'source-full-ready', verifiedUsable: true },
  { bookId: BOOK_ID, physicalPageCount: 16, sourceVersionId: 'source-component-a', verifiedUsable: true },
  { bookId: BOOK_ID, physicalPageCount: 18, sourceVersionId: 'source-component-b', verifiedUsable: true },
  { bookId: BOOK_ID, physicalPageCount: 9, sourceVersionId: 'source-not-ready', verifiedUsable: false },
];

const smokeBook: MaterialBookMetadata = {
  bookId: materialCatalogIds.bookId(BOOK_ID),
  bookMode: 'pdf',
  ownerId: OWNER_ID,
  title: 'PRD0062 Ticket 56 Assembly Fixture',
  authors: ['Fixture Teacher'],
  testTypeIds: [],
  tags: ['prd0062', 'ticket56'],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: OWNER_ID,
  updatedBy: OWNER_ID,
};

const initialManifest: BookAssemblyManifestCandidate = {
  bookId: BOOK_ID,
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-full-ready', sourceOrder: 1 }],
  },
  nodes: [
    { nodeKey: 'section-fixture', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-fixture', parentNodeKey: 'section-fixture', nodeType: 'unit', order: 1 },
  ],
  units: [],
};

const componentMappingManifest: BookAssemblyManifestCandidate = {
  bookId: BOOK_ID,
  sourceSet: {
    sourceStrategy: 'component_pdfs',
    sources: [
      { sourceKey: 'source-source-component-a', sourceVersionId: 'source-component-a', sourceOrder: 1, ownerNodeKey: 'section-component-a' },
      { sourceKey: 'source-source-component-b', sourceVersionId: 'source-component-b', sourceOrder: 2, ownerNodeKey: 'section-component-b' },
    ],
  },
  nodes: [
    { nodeKey: 'section-component-a', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-component-a', parentNodeKey: 'section-component-a', nodeType: 'unit', order: 1 },
    { nodeKey: 'section-component-b', parentNodeKey: null, nodeType: 'section', order: 2 },
    { nodeKey: 'unit-component-b', parentNodeKey: 'section-component-b', nodeType: 'unit', order: 1 },
  ],
  units: [],
};

const ticket61Manifest: BookAssemblyManifestCandidate = {
  ...initialManifest,
  units: [{
    unitKey: 'unit-fixture',
    activitySlots: [{
      activityKey: 'activity-ticket61',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-full-2-activity'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-full-2-activity',
      sourceKey: 'full',
      pages: [2],
      defaultPhysicalPageNumber: 2,
      activityKeys: ['activity-ticket61'],
      mode: 'activity',
    }],
  }],
};

const ticket62Manifest: BookAssemblyManifestCandidate = {
  ...initialManifest,
  units: [{
    unitKey: 'unit-fixture',
    activitySlots: [{
      activityKey: 'activity-ticket62',
      order: 1,
      contextRequirement: 'optional',
      pageGroupKeys: [],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-ticket62',
      sourceKey: 'full',
      pages: [2, 1, 1],
      defaultPhysicalPageNumber: 1,
      activityKeys: ['activity-ticket62'],
      mode: 'activity',
    }],
  }],
};

const ticket62ComponentManifest: BookAssemblyManifestCandidate = {
  bookId: BOOK_ID,
  sourceSet: {
    sourceStrategy: 'component_pdfs',
    sources: [{ sourceKey: 'component-a', sourceVersionId: 'source-component-a', sourceOrder: 1, ownerNodeKey: 'section-component-a' }],
  },
  nodes: [
    { nodeKey: 'section-component-a', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-component-a', parentNodeKey: 'section-component-a', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-component-a',
    activitySlots: [{ activityKey: 'activity-ticket62-component', order: 1, contextRequirement: 'optional', pageGroupKeys: [] }],
    pageGroups: [{ pageGroupKey: 'pages-ticket62-component', sourceKey: 'component-a', pages: [2, 1, 1], defaultPhysicalPageNumber: 1, activityKeys: ['activity-ticket62-component'], mode: 'activity' }],
  }],
};

const ticket63Manifest: BookAssemblyManifestCandidate = {
  ...initialManifest,
  units: [{
    unitKey: 'unit-fixture',
    activitySlots: [{
      activityKey: 'activity-ticket63',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-ticket63'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-ticket63',
      sourceKey: 'full',
      pages: [2],
      defaultPhysicalPageNumber: 2,
      activityKeys: ['activity-ticket63'],
      mode: 'activity',
    }],
  }],
};

const ticket65Manifest: BookAssemblyManifestCandidate = {
  ...initialManifest,
  nodes: [
    { nodeKey: 'section-fixture', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-fixture', parentNodeKey: 'section-fixture', nodeType: 'unit', order: 1 },
    { nodeKey: 'unit-later-incomplete', parentNodeKey: 'section-fixture', nodeType: 'unit', order: 2 },
  ],
  units: [{
    unitKey: 'unit-fixture',
    activitySlots: [{
      activityKey: 'activity-ticket65',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-ticket65'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-ticket65',
      sourceKey: 'full',
      pages: [2, 3],
      defaultPhysicalPageNumber: 2,
      activityKeys: ['activity-ticket65'],
      mode: 'activity',
    }],
  }],
};

const createCandidate = (
  manifest: BookAssemblyManifestCandidate,
  revision: number,
): BookAssemblyCandidateRecord => ({
  bookId: BOOK_ID,
  bookRevision: 7,
  candidateId: 'candidate-ticket56',
  lifecycle: manifest === ticket63Manifest || manifest === ticket65Manifest ? 'validated' : 'draft',
  manifest,
  ownerId: OWNER_ID,
  revision,
  sourceSetRevision: 4,
  unitKey: manifest.nodes.find((node) => node.nodeType === 'unit')?.nodeKey ?? 'unit-fixture',
  updatedAt: NOW,
  validation: { valid: true, errors: [] },
});

const encodeCandidate = (candidate: BookAssemblyCandidateRecord): string =>
  encodeURIComponent(JSON.stringify(candidate));

type Ticket65PublicationSummary = {
  readonly publicationId: string | null;
  readonly versionCount: number;
  readonly activityVersionCount: number;
  readonly placementCount: number;
  readonly unitProjectionCount: number;
  readonly deliveryPlanCount: number;
  readonly laterUnitPublished: boolean;
};

const emptyTicket65PublicationSummary: Ticket65PublicationSummary = {
  publicationId: null,
  versionCount: 0,
  activityVersionCount: 0,
  placementCount: 0,
  unitProjectionCount: 0,
  deliveryPlanCount: 0,
  laterUnitPublished: false,
};

const summarizePublicationScope = (
  scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
): Ticket65PublicationSummary => ({
  publicationId: scope.current?.publicationId ?? null,
  versionCount: Object.keys(scope.versions ?? {}).length,
  activityVersionCount: Object.keys(scope.activityVersions ?? {}).length,
  placementCount: Object.keys(scope.placements ?? {}).length,
  unitProjectionCount: Object.keys(scope.unitProjections ?? {}).length,
  deliveryPlanCount: Object.keys(scope.deliveryPlans ?? {}).length,
  laterUnitPublished: Object.values(scope.unitProjections ?? {})
    .some((projection) => projection.unitKey === 'unit-later-incomplete'),
});

const encodePublicationSummary = (
  summary: Ticket65PublicationSummary,
): string => encodeURIComponent(JSON.stringify(summary));

const decodeCandidate = (value: string | null): BookAssemblyCandidateRecord | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as BookAssemblyCandidateRecord;
    return parsed?.bookId === BOOK_ID && parsed.manifest ? parsed : null;
  } catch {
    return null;
  }
};

const decodePublicationSummary = (
  value: string | null,
): Ticket65PublicationSummary => {
  if (!value) return emptyTicket65PublicationSummary;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<Ticket65PublicationSummary>;
    return {
      publicationId: typeof parsed.publicationId === 'string' ? parsed.publicationId : null,
      versionCount: Number.isSafeInteger(parsed.versionCount) ? parsed.versionCount : 0,
      activityVersionCount: Number.isSafeInteger(parsed.activityVersionCount) ? parsed.activityVersionCount : 0,
      placementCount: Number.isSafeInteger(parsed.placementCount) ? parsed.placementCount : 0,
      unitProjectionCount: Number.isSafeInteger(parsed.unitProjectionCount) ? parsed.unitProjectionCount : 0,
      deliveryPlanCount: Number.isSafeInteger(parsed.deliveryPlanCount) ? parsed.deliveryPlanCount : 0,
      laterUnitPublished: parsed.laterUnitPublished === true,
    };
  } catch {
    return emptyTicket65PublicationSummary;
  }
};

export default function BookAssemblyWorkspaceSmokePage() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const fixture = searchParams.get('fixture') ?? 'ticket56';
  const previewWorkerOrigin =
    import.meta.env.VITE_BOOK_DELIVERY_WORKER_URL?.trim() || window.location.origin;
  const componentFixture = fixture === 'ticket57-component' || fixture === 'ticket58-component';
  const ticket61Fixture = fixture.startsWith('ticket61');
  const ticket62Fixture = fixture.startsWith('ticket62');
  const ticket62ComponentFixture = fixture === 'ticket62-component';
  const ticket63Fixture = fixture === 'ticket63-preview';
  const ticket65Fixture = fixture === 'ticket65-full-pdf';
  const ticket58Fixture = fixture.startsWith('ticket58-');
  const candidateFixture = componentFixture
    ? createCandidate(componentMappingManifest, 1)
    : ticket61Fixture
      ? createCandidate(ticket61Manifest, 1)
      : ticket62ComponentFixture
        ? createCandidate(ticket62ComponentManifest, 1)
      : ticket62Fixture
        ? createCandidate(ticket62Manifest, 1)
      : ticket63Fixture
        ? createCandidate(ticket63Manifest, 1)
      : ticket65Fixture
        ? createCandidate(ticket65Manifest, 1)
      : fixture === 'ticket57-full' || ticket58Fixture
      ? createCandidate(initialManifest, 1)
      : null;
  const defaultCandidate = fixture === 'ticket58-stale' && candidateFixture
    ? { ...candidateFixture, revision: 2 }
    : fixture === 'ticket58-discarded' && candidateFixture
      ? { ...candidateFixture, lifecycle: 'discarded' as const }
      : candidateFixture;
  const [candidate, setCandidate] = useState<BookAssemblyCandidateRecord | null>(() =>
    decodeCandidate(searchParams.get('candidate')) ?? defaultCandidate);
  const [publicationScope, setPublicationScope] = useState<BookAssemblyPublicationScope<BookAssemblyPublicationResult>>({});
  const [publicationSummary, setPublicationSummary] = useState<Ticket65PublicationSummary>(() =>
    decodePublicationSummary(searchParams.get('publication')));
  const [previewApproval, setPreviewApproval] = useState<string | null>(null);
  const [publicationMessage, setPublicationMessage] = useState<string | null>(null);
  const forceConflictRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [stagedActivities, setStagedActivities] = useState<Array<{ activityKey?: string; evidenceRefs?: string[] }>>([]);
  const candidateRuntimePreview = useMemo<CandidateUnitPreviewProjection | null>(() => {
    if (!ticket63Fixture || !candidate) return null;
    return {
      bookId: BOOK_ID,
      candidateId: candidate.candidateId,
      candidateRevision: candidate.revision,
      sourceSetRevision: 4,
      unitKey: 'unit-fixture',
      registryVersion: 'ticket63-local-fixture-v1',
      activities: [{
        activityKey: 'activity-ticket63',
        sourceContext: { available: true, description: 'Candidate source context: full page 2.' },
        projection: {
          schemaVersion: 1,
          title: 'Ticket 63 source-assisted preview',
          taskProfile: { taxonomyId: 'ielts-reading', typeId: 'diagram-labeling', taxonomyVersion: 1 },
          presentationMode: 'source-assisted',
          contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
          instructions: [{ text: 'Use the candidate source context before choosing.' }],
          interaction: { family: 'choice', variant: 'diagram-label-choice' },
          answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
          stimulus: null,
          assetRefs: [],
          interactions: [{
            family: 'choice',
            interactionId: 'choice-ticket63',
            prompt: 'Choose candidate answer.',
            options: [{ itemId: 'option-a', label: 'A' }, { itemId: 'option-b', label: 'B' }],
            sourceAssisted: {
              questionLabel: '1',
              accessiblePrompt: 'Choose one candidate answer using source context.',
              sourceExerciseLabel: 'Ticket 63 source exercise',
              responseShape: 'single-choice',
            },
          }],
          scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
        },
      }],
    };
  }, [candidate, ticket63Fixture]);

  const persistCandidate = useCallback((next: BookAssemblyCandidateRecord) => {
    setCandidate(next);
    const nextParams: Record<string, string> = { fixture, candidate: encodeCandidate(next) };
    if (publicationSummary.publicationId) {
      nextParams.publication = encodePublicationSummary(publicationSummary);
    }
    setSearchParams(nextParams, { replace: true });
  }, [fixture, publicationSummary, setSearchParams]);

  const persistPublicationScope = useCallback((scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>) => {
    setPublicationScope(scope);
    const summary = summarizePublicationScope(scope);
    setPublicationSummary(summary);
    const nextParams: Record<string, string> = { fixture };
    if (candidate) nextParams.candidate = encodeCandidate(candidate);
    nextParams.publication = encodePublicationSummary(summary);
    setSearchParams(nextParams, { replace: true });
  }, [candidate, fixture, setSearchParams]);

  const repository = useMemo<UnitAssemblyRepository>(() => {
    const mutationResult = (
      status: BookAssemblyMutationResult['status'],
      nextCandidate?: BookAssemblyCandidateRecord,
    ): BookAssemblyMutationResult => ({
      status,
      candidate: nextCandidate,
      receipt: {
        createdAt: NOW,
        fingerprint: 'ticket56-fixture-fingerprint',
        operationId: 'ticket56-fixture-operation',
        status,
        ...(nextCandidate && {
          candidateId: nextCandidate.candidateId,
          candidateRevision: nextCandidate.revision,
        }),
      },
      currentRevision: candidate?.revision,
    });

    return {
      create: async (input) => {
        const next = createCandidate(input.manifest, 1);
        persistCandidate(next);
        return mutationResult('created', next);
      },
      replace: async (input) => {
        if (forceConflictRef.current) {
          const remote = createCandidate(candidate?.manifest ?? initialManifest, (candidate?.revision ?? 1) + 1);
          persistCandidate(remote);
          forceConflictRef.current = false;
          return mutationResult('conflict');
        }
        const next = createCandidate(input.manifest, (candidate?.revision ?? input.expectedCandidateRevision) + 1);
        persistCandidate(next);
        return mutationResult('replaced', next);
      },
      validate: async () => mutationResult('validated', candidate ?? createCandidate(initialManifest, 1)),
      discard: async () => mutationResult('discarded', candidate ?? createCandidate(initialManifest, 1)),
      load: async () => ({
        conflict: null,
        candidate: candidate ?? createCandidate(initialManifest, 1),
        status: 'loaded',
      }),
    };
  }, [candidate, persistCandidate]);

  const activityAuthoring = useMemo<ActivityAuthoringService>(() => ({
    stage: async (input) => {
      if (fixture === 'ticket61-stale-cas') throw new Error('Activity authoring conflict.');
      setStagedActivities((current) => [...current, {
        activityKey: input.targetActivityId,
        evidenceRefs: [...(input.evidenceRefs ?? []), ...(input.sourceEvidenceRefs ?? [])],
      }]);
      return {
        status: 'staged',
        candidateId: `candidate-${input.targetActivityId ?? 'generated'}`,
        targetActivityId: input.targetActivityId ?? 'activity-generated',
        revision: 1,
        lifecycle: 'staged',
        validation: { valid: true, errors: [] },
        diff: { classification: 'added', reasons: ['fixture import'], requiresRedo: false },
        evidenceRefs: [...(input.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
      };
    },
    validate: async (input) => ({
      status: 'validated',
      candidateId: input.candidateId,
      revision: input.expectedRevision + 1,
      lifecycle: 'validated',
      validation: { valid: true, errors: [] },
      diff: null,
      evidenceRefs: [...(input.evidenceRefs ?? [])],
      sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
      answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
    }),
    saveDraft: async (input) => ({
      status: 'saved',
      activityId: 'activity-ticket61',
      candidateId: input.candidateId,
      candidateRevision: input.expectedRevision,
      revision: input.expectedRevision + 1,
      lifecycle: 'saved',
      validation: { valid: true, errors: [] },
      diff: null,
      evidenceRefs: [...(input.evidenceRefs ?? [])],
      sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
      answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
    }),
    discard: async (input) => ({
      status: 'discarded',
      candidateId: input.candidateId,
      revision: input.expectedRevision + 1,
      lifecycle: 'discarded',
    }),
    loadCandidate: async (candidateId) => ({
      status: 'loaded',
      candidate: {
        candidateId,
        targetActivityId: 'activity-ticket61',
        ownerId: OWNER_ID,
        targetRevision: 0,
        revision: 1,
        lifecycle: 'staged',
        content: {},
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
        updatedAt: Date.parse(NOW),
      },
    }),
  }), [fixture]);

  const fixtureTitle = ticket63Fixture ? 'PRD0062 Ticket 63 Candidate Preview Fixture' : smokeBook.title;
  const publishFullPdfUnit = async () => {
    if (!ticket65Fixture || !candidate || !candidate.manifest || !previewApproval) return;
    const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>({
      [BOOK_ID]: publicationScope,
    });
    const authority: BookAssemblyBookAuthority = {
      bookId: BOOK_ID,
      ownerId: OWNER_ID,
      bookMode: 'pdf',
      bookRevision: 7,
      sourceSetRevision: 4,
      sourceSet: candidate.manifest.sourceSet,
      sourceVersionAuthority: {
        getSourceVersion: (sourceVersionId) =>
          sourceVersions.find((source) => source.sourceVersionId === sourceVersionId),
      },
    };
    const command = createFullPdfPublicationCommand({
      readAuthority: async () => authority,
      readCandidate: async () => candidate,
      readLineage: async () => ({}),
      publish: async (input) => {
        const service = await import('../services/book-assembly/publicationTransaction.service');
        return service.createBookAssemblyPublicationService(repository).publish(input);
      },
      allocateOperationId: () => globalThis.crypto.randomUUID(),
      allocateId: (kind, key) => `${kind}:${key}:ticket65`,
      now: () => NOW,
    });
    try {
      const receipt = await command({
        ownerId: OWNER_ID,
        bookId: BOOK_ID,
        unitKey: 'unit-fixture',
        candidateId: candidate.candidateId,
        expectedCandidateRevision: candidate.revision,
        expectedCurrentPublicationId: publicationSummary.publicationId,
        expectedBookRevision: 7,
        expectedSourceSetRevision: 4,
        previewApproval: {
          approvalId: previewApproval,
          approvalRevision: 1,
          approvedAt: '2026-07-26T00:00:00.000Z',
          expiresAt: '2026-07-28T00:00:00.000Z',
        },
      });
      const nextScope = await repository.readScope(BOOK_ID);
      persistPublicationScope(nextScope);
      const message = `Published full-PDF Unit ${receipt.publicationId}.`;
      setPublicationMessage(message);
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Full-PDF publication failed.';
      setPublicationMessage(message);
      toast.error('Full-PDF publication failed.');
    }
  };
  const signedInLabel = user
    ? `${profile?.role ?? 'user'} ${user.email ?? user.uid}`
    : 'not signed in';
  const canPreview = profile?.role === 'super_admin' || user?.email === 'teacher@test.com';
  const previewDocuments = useMemo<readonly BookTeacherAssemblyDocumentProjection[]>(() => {
    if (!candidate || !canPreview || !ticket58Fixture) return [];
    const projectedBookId = fixture === 'ticket58-copied' ? 'copied-book' : BOOK_ID;
    const projectedRevision = fixture === 'ticket58-stale' ? 1 : candidate.revision;
    const sourceBindings = candidate.manifest?.sourceSet.sources ?? [];
    return sourceBindings.map((source) => ({
      kind: 'teacher_assembly' as const,
      bookId: projectedBookId,
      bookRevision: 7,
      candidateId: candidate.candidateId,
      candidateRevision: projectedRevision,
      sourceSetRevision: 4,
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      route: createBookTeacherAssemblyDocumentRoute({
        workerOrigin: previewWorkerOrigin,
        bookId: BOOK_ID,
        unitKey: candidate.unitKey,
        candidateId: candidate.candidateId,
        candidateRevision: projectedRevision,
        sourceKey: source.sourceKey,
        sourceVersionId: source.sourceVersionId,
        sourceSetRevision: 4,
        bookRevision: 7,
        physicalPageNumber: 1,
      }),
    }));
  }, [canPreview, candidate, fixture, previewWorkerOrigin, ticket58Fixture]);

  return (
    <main style={{ display: 'grid', gap: 16, maxWidth: '100%', overflowX: 'clip', padding: 'clamp(12px, 4vw, 24px)' }}>
      <header>
        <p style={{ margin: 0, color: '#5d687b', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {ticket63Fixture ? 'Ticket 63 fixture' : 'Ticket 56 fixture'}
        </p>
        <h1 style={{ margin: '4px 0 0' }}>Assembly workspace browser proof</h1>
        <p style={{ margin: '8px 0 0' }}>Signed in: {signedInLabel}</p>
        <p style={{ margin: '8px 0 0' }} data-testid="ticket56-dirty-state">
          Draft dirty: {dirty ? 'yes' : 'no'}
        </p>
        <button type="button" onClick={() => {
          forceConflictRef.current = true;
        }}>
          Simulate remote conflict
        </button>
      </header>
      {(ticket61Fixture || ticket62Fixture) && (
        <section aria-label="Assembly fixture state">
          <p>Candidate revision: {candidate?.revision ?? 'none'}</p>
          <p>Published state: unchanged</p>
          <p>Staged Activity count: {stagedActivities.length}</p>
          <p>Staged Activity evidence: {stagedActivities.flatMap((entry) => entry.evidenceRefs ?? []).join(', ') || 'none'}</p>
        </section>
      )}
      {ticket65Fixture && (
        <section aria-label="Ticket 65 publication state">
          <h2>Full-PDF publication fixture</h2>
          <p>Trusted command layer allocates operation and publication IDs before adapter execution.</p>
          <p data-testid="ticket65-current-publication">
            Current publication: {publicationSummary.publicationId ?? 'none'}
          </p>
          <p data-testid="ticket65-version-count">
            Manifest Versions: {publicationSummary.versionCount}
          </p>
          <p data-testid="ticket65-activity-version-count">
            Activity Versions: {publicationSummary.activityVersionCount}
          </p>
          <p data-testid="ticket65-placement-count">
            Placements: {publicationSummary.placementCount}
          </p>
          <p data-testid="ticket65-unit-projection-count">
            Unit projections: {publicationSummary.unitProjectionCount}
          </p>
          <p data-testid="ticket65-delivery-plan-count">
            Delivery publication plans: {publicationSummary.deliveryPlanCount}
          </p>
          <p data-testid="ticket65-later-unit-state">
            Later Unit published: {publicationSummary.laterUnitPublished ? 'yes' : 'no'}
          </p>
          <p data-testid="ticket65-publication-message">{publicationMessage ?? 'No publication attempted.'}</p>
          <button
            type="button"
            onClick={() => {
              setPreviewApproval('ticket65-preview-approval');
              setPublicationMessage('Full-PDF preview approved.');
              toast.info('Full-PDF preview approved.');
            }}
          >
            Preview full PDF Unit
          </button>
          <button type="button" disabled={!previewApproval} onClick={() => void publishFullPdfUnit()}>
            Publish full PDF Unit
          </button>
        </section>
      )}
      <BookMode2EditorShell
        access="owner"
        activityAuthoring={activityAuthoring}
        assemblyBookRevision={7}
        assemblyInitialCandidate={candidate}
        assemblyCandidateRuntimePreview={candidateRuntimePreview}
        assemblyPreviewDocuments={previewDocuments}
        assemblyRepository={repository}
        assemblySourceSetRevision={4}
        assemblySourceVersions={sourceVersions}
        book={{ ...smokeBook, title: fixtureTitle }}
        onDirtyChange={setDirty}
        presentation="page-compat"
        uploadPresentationEnabled={false}
        uploadWorkflow={null}
      />
    </main>
  );
}
