import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BookMode2EditorShell from '../components/books/BookMode2EditorShell';
import { toast } from '../components/modern';
import { createComponentPdfPublicationCommand } from '../services/book-assembly/componentPdfPublication.command';
import { createFullPdfPublicationCommand } from '../services/book-assembly/fullPdfPublication.command';
import { createCanonicalBookAssemblyPublicationService } from '../services/book-assembly/canonicalPublication.service';
import { InMemoryCanonicalActivityVersionRepository } from '../services/book-assembly/canonicalPublicationRepository';
import type { CanonicalPublishedActivityVersionRecord } from '../services/book-assembly/canonicalActivityVersion.service';
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
import type {
  BookAssemblyMigrationClient,
  MigrateAssemblySourceStrategyInput,
} from '../services/book-assembly/assemblyClient.browser';
import type { BookAssemblyPreviewClient } from '../services/book-assembly/assemblyPublication.client';
import { planSourceStrategyMigration } from '../services/book-assembly/sourceStrategyMigration.service';
import type { ActivityAuthoringService } from '../services/book-activity/activityAuthoring.service';
import {
  createCandidateUnitPreview,
  createPreviewApproval,
  type CandidateUnitPreviewProjection,
} from '../services/book-assembly/unitPreview.service';
import type { SourceUploadBrowserWorkflow } from '../services/book-source-delivery/sourceUpload.browserWorkflow';
import type { SourceUploadSafeOperationState } from '../services/book-source-delivery/sourceUpload.client';
import type { BookAssemblyManifestCandidate, TrustedBookSourceVersionProjection } from '../types/bookAssembly.types';
import type { NormalizedActivity } from '../types/bookActivity.types';
import { materialCatalogIds, type MaterialBookMetadata } from '../types/materialCatalog.types';
import { useAuth } from '../hooks/useAuth';
import {
  createBookTeacherAssemblyDocumentRoute,
  type BookTeacherAssemblyDocumentProjection,
} from '../services/book-delivery/bookTeacherAssemblyDocument.types';

const NOW = '2026-07-27T00:00:00.000Z';
const BOOK_ID = 'prd0062-ticket56-book';
const OWNER_ID = 'teacher-1';
const ticket50CleanupState: SourceUploadSafeOperationState = Object.freeze({
  schemaVersion: 1,
  bookId: BOOK_ID,
  operationId: 'ticket50-cleanup-operation',
  reservationId: 'ticket50-cleanup-reservation',
  sourceVersionId: 'ticket50-unusable-source-version',
  sourceKey: 'main',
  kind: 'initial',
  displayFilename: 'ticket50-disposable.pdf',
  exactByteSize: 1024,
  sha256Hex: 'a'.repeat(64),
  phase: 'cancel_requested',
});

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
  units: [
    {
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
    },
    { unitKey: 'unit-later-incomplete', activitySlots: [], pageGroups: [] },
  ],
};

const ticket65Activity: NormalizedActivity = {
  schemaVersion: 1,
  title: 'Ticket 65 canonical Activity',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Read the pinned source pages.' }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId: 'ticket65-choice-1',
    prompt: 'Choose the supported answer.',
    options: ['Supported', 'Unsupported'],
    sourceAssisted: {
      questionLabel: '1',
      sourceExerciseLabel: 'Ticket 65',
      accessiblePrompt: 'Choose one answer from the pinned source.',
      responseShape: 'single-choice',
    },
    itemIdentities: {
      family: 'choice',
      optionIds: ['ticket65-option-supported', 'ticket65-option-unsupported'],
    },
    answerKey: {
      family: 'choice',
      acceptedOptionItemIds: ['ticket65-option-supported'],
    },
  }],
  scoring: { mode: 'auto-where-possible' },
};

const ticket66Manifest: BookAssemblyManifestCandidate = {
  bookId: BOOK_ID,
  sourceSet: {
    sourceStrategy: 'component_pdfs',
    sources: [
      { sourceKey: 'component-a', sourceVersionId: 'source-component-a', sourceOrder: 1, ownerNodeKey: 'section-component-a' },
      { sourceKey: 'component-b', sourceVersionId: 'source-component-b', sourceOrder: 2, ownerNodeKey: 'section-component-a' },
    ],
  },
  nodes: [
    { nodeKey: 'section-component-a', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-component-a', parentNodeKey: 'section-component-a', nodeType: 'unit', order: 1 },
    { nodeKey: 'unit-later-incomplete', parentNodeKey: 'section-component-a', nodeType: 'unit', order: 2 },
  ],
  units: [
    {
      unitKey: 'unit-component-a',
      activitySlots: [
        {
          activityKey: 'activity-ticket66-a',
          order: 1,
          contextRequirement: 'required',
          pageGroupKeys: ['pages-ticket66-a'],
        },
        {
          activityKey: 'activity-ticket66-b',
          order: 2,
          contextRequirement: 'required',
          pageGroupKeys: ['pages-ticket66-b'],
        },
      ],
      pageGroups: [
        {
          pageGroupKey: 'pages-ticket66-a',
          sourceKey: 'component-a',
          pages: [1],
          defaultPhysicalPageNumber: 1,
          activityKeys: ['activity-ticket66-a'],
          mode: 'activity',
        },
        {
          pageGroupKey: 'pages-ticket66-b',
          sourceKey: 'component-b',
          pages: [1],
          defaultPhysicalPageNumber: 1,
          activityKeys: ['activity-ticket66-b'],
          mode: 'activity',
        },
      ],
    },
    { unitKey: 'unit-later-incomplete', activitySlots: [], pageGroups: [] },
  ],
};

const ticket66Activity = (suffix: 'a' | 'b'): NormalizedActivity => ({
  schemaVersion: 1,
  title: `Ticket 66 component ${suffix.toUpperCase()} Activity`,
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: `Read the pinned component ${suffix.toUpperCase()} page.` }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId: `ticket66-choice-${suffix}`,
    prompt: `Choose the component ${suffix.toUpperCase()} answer.`,
    options: ['Supported', 'Unsupported'],
    sourceAssisted: {
      questionLabel: suffix.toUpperCase(),
      sourceExerciseLabel: `Ticket 66 component ${suffix.toUpperCase()}`,
      accessiblePrompt: `Choose one answer from component ${suffix.toUpperCase()}.`,
      responseShape: 'single-choice',
    },
    itemIdentities: {
      family: 'choice',
      optionIds: [`ticket66-${suffix}-supported`, `ticket66-${suffix}-unsupported`],
    },
    answerKey: {
      family: 'choice',
      acceptedOptionItemIds: [`ticket66-${suffix}-supported`],
    },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const ticket70FullManifest: BookAssemblyManifestCandidate = {
  ...initialManifest,
  units: [{
    unitKey: 'unit-fixture',
    activitySlots: [],
    pageGroups: [{
      pageGroupKey: 'pages-ticket70',
      sourceKey: 'full',
      pages: [2],
      defaultPhysicalPageNumber: 2,
      activityKeys: [],
      mode: 'reference_only',
    }],
  }],
};

const ticket70ComponentManifest: BookAssemblyManifestCandidate = {
  ...ticket70FullManifest,
  sourceSet: {
    sourceStrategy: 'component_pdfs',
    sources: [{
      sourceKey: 'component-a',
      sourceVersionId: 'source-component-a',
      sourceOrder: 1,
      ownerNodeKey: 'section-fixture',
    }],
  },
  units: [{
    ...ticket70FullManifest.units[0],
    pageGroups: [{
      ...ticket70FullManifest.units[0].pageGroups[0],
      sourceKey: 'component-a',
      pages: [2],
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
  lifecycle: manifest === ticket63Manifest || manifest === ticket65Manifest || manifest === ticket66Manifest ? 'validated' : 'draft',
  manifest,
  ownerId: OWNER_ID,
  revision,
  sourceSetRevision: 4,
  unitKey: manifest.nodes.find((node) => node.nodeType === 'unit')?.nodeKey ?? 'unit-fixture',
  updatedAt: NOW,
  validation: { valid: true, errors: [] },
});

const createTicket70Candidate = (
  manifest: BookAssemblyManifestCandidate,
): BookAssemblyCandidateRecord => ({
  ...createCandidate(manifest, 1),
  candidateId: manifest.sourceSet.sourceStrategy === 'full_pdf'
    ? 'candidate-ticket70-full'
    : 'candidate-ticket70-component',
  lifecycle: 'validated',
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
  readonly componentOrder: readonly string[];
  readonly componentOwners: readonly string[];
  readonly sourceVersionIds: readonly string[];
  readonly canonicalReadbacks: readonly string[];
};

const emptyTicket65PublicationSummary: Ticket65PublicationSummary = {
  publicationId: null,
  versionCount: 0,
  activityVersionCount: 0,
  placementCount: 0,
  unitProjectionCount: 0,
  deliveryPlanCount: 0,
  laterUnitPublished: false,
  componentOrder: [],
  componentOwners: [],
  sourceVersionIds: [],
  canonicalReadbacks: [],
};

const summarizePublicationScope = (
  scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
  canonicalRecords: readonly CanonicalPublishedActivityVersionRecord[] = [],
): Ticket65PublicationSummary => {
  const manifest = scope.current
    ? scope.versions?.[scope.current.manifestVersionId]
    : undefined;
  const sources = [...(manifest?.manifest.sourceSet.sources ?? [])]
    .sort((left, right) => left.sourceOrder - right.sourceOrder);
  return {
    publicationId: scope.current?.publicationId ?? null,
    versionCount: Object.keys(scope.versions ?? {}).length,
    activityVersionCount: Object.keys(scope.activityVersions ?? {}).length,
    placementCount: Object.keys(scope.placements ?? {}).length,
    unitProjectionCount: Object.keys(scope.unitProjections ?? {}).length,
    deliveryPlanCount: Object.keys(scope.deliveryPlans ?? {}).length,
    laterUnitPublished: Object.values(scope.unitProjections ?? {})
      .some((projection) => projection.unitKey === 'unit-later-incomplete'),
    componentOrder: sources.map((source) => source.sourceKey),
    componentOwners: sources.map((source) => `${source.sourceKey}=${source.ownerNodeKey}`),
    sourceVersionIds: sources.map((source) => source.sourceVersionId),
    canonicalReadbacks: [...canonicalRecords]
      .sort((left, right) => left.activityId.localeCompare(right.activityId))
      .map((record) => [
        record.activityId,
        record.activityVersionId,
        String(record.activityVersion),
        record.ownerId,
        record.createdByOperationId,
        record.payloadFingerprint,
        record.placementIds.join('+'),
        (record.provenance.kind === 'initial-book-publication'
          ? record.provenance.sourcePages
          : [])
          .map((page) => `${page.sourceKey}@${page.sourceVersionId}:${page.physicalPageNumber}`)
          .join('+'),
        record.activity.interactions.map((interaction) => interaction.interactionId).join('+'),
        record.provenance.kind === 'initial-book-publication'
          ? [
            record.provenance.bookId,
            record.provenance.manifestVersionId,
            record.provenance.publicationId,
            String(record.provenance.publicationRevision),
            record.provenance.unitKey,
            record.provenance.activityKey,
          ].join('@')
          : 'revision',
      ].join('|')),
  };
};

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
      versionCount: typeof parsed.versionCount === 'number' && Number.isSafeInteger(parsed.versionCount) ? parsed.versionCount : 0,
      activityVersionCount: typeof parsed.activityVersionCount === 'number' && Number.isSafeInteger(parsed.activityVersionCount) ? parsed.activityVersionCount : 0,
      placementCount: typeof parsed.placementCount === 'number' && Number.isSafeInteger(parsed.placementCount) ? parsed.placementCount : 0,
      unitProjectionCount: typeof parsed.unitProjectionCount === 'number' && Number.isSafeInteger(parsed.unitProjectionCount) ? parsed.unitProjectionCount : 0,
      deliveryPlanCount: typeof parsed.deliveryPlanCount === 'number' && Number.isSafeInteger(parsed.deliveryPlanCount) ? parsed.deliveryPlanCount : 0,
      laterUnitPublished: parsed.laterUnitPublished === true,
      componentOrder: Array.isArray(parsed.componentOrder)
        ? parsed.componentOrder.filter((value): value is string => typeof value === 'string')
        : [],
      componentOwners: Array.isArray(parsed.componentOwners)
        ? parsed.componentOwners.filter((value): value is string => typeof value === 'string')
        : [],
      sourceVersionIds: Array.isArray(parsed.sourceVersionIds)
        ? parsed.sourceVersionIds.filter((value): value is string => typeof value === 'string')
        : [],
      canonicalReadbacks: Array.isArray(parsed.canonicalReadbacks)
        ? parsed.canonicalReadbacks.filter((value): value is string => typeof value === 'string')
        : [],
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
  const ticket66Fixture = fixture === 'ticket66-component-pdf';
  const pdfUploadFixture = fixture === 'pdf-upload';
  const ticket70Fixture = fixture === 'ticket70-full' || fixture === 'ticket70-component';
  const ticket50Fixture = fixture === 'ticket50-reconciliation';
  const ticket50CleanupReleased = searchParams.get('cleanup') === 'released';
  const ticket70OriginalSourceVersionIds = fixture === 'ticket70-full'
    ? ['source-full-ready']
    : ['source-component-a'];
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
      : ticket66Fixture
        ? createCandidate(ticket66Manifest, 1)
      : fixture === 'ticket70-full'
        ? createTicket70Candidate(ticket70FullManifest)
      : fixture === 'ticket70-component'
        ? createTicket70Candidate(ticket70ComponentManifest)
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
  const [ticket70StagedCandidate, setTicket70StagedCandidate] = useState<BookAssemblyCandidateRecord | null>(() =>
    ticket70Fixture ? decodeCandidate(searchParams.get('stagedCandidate')) : null);
  const [publicationScope, setPublicationScope] = useState<BookAssemblyPublicationScope<BookAssemblyPublicationResult>>({});
  const [publicationSummary, setPublicationSummary] = useState<Ticket65PublicationSummary>(() =>
    decodePublicationSummary(searchParams.get('publication')));
  const [previewApproval, setPreviewApproval] = useState<string | null>(null);
  const [publicationMessage, setPublicationMessage] = useState<string | null>(null);
  const forceConflictRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [stagedActivities, setStagedActivities] = useState<Array<{ activityKey?: string; evidenceRefs?: string[] }>>([]);
  const ticket70CandidateRef = useRef(candidate);
  const ticket70StagedCandidateRef = useRef(ticket70StagedCandidate);
  ticket70CandidateRef.current = candidate;
  ticket70StagedCandidateRef.current = ticket70StagedCandidate;
  const candidateRuntimePreview = useMemo<CandidateUnitPreviewProjection | null>(() => {
    if (!ticket63Fixture || !candidate) return null;
    return {
      bookId: BOOK_ID,
      bookRevision: candidate.bookRevision,
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

  const smokeAssemblyPreviewClient = useMemo<BookAssemblyPreviewClient | null>(() => {
    if (!ticket65Fixture && !ticket66Fixture) return null;
    const activitiesByKey = ticket65Fixture
      ? { 'activity-ticket65': ticket65Activity }
      : {
          'activity-ticket66-a': ticket66Activity('a'),
          'activity-ticket66-b': ticket66Activity('b'),
        };
    const registryVersion = ticket65Fixture ? 'ticket65-local-fixture-v1' : 'ticket66-local-fixture-v1';
    const preview = () => {
      if (!candidate) throw new Error('The fixture candidate is unavailable.');
      return createCandidateUnitPreview({
        candidate,
        sourceVersions,
        sourceIsPreviewReady: () => true,
        activitiesByKey,
        registryVersion,
      });
    };
    const flowPrefix = ticket65Fixture ? 'ticket65' : 'ticket66';
    const receipt = (mode: 'full' | 'component', candidateId: string) => ({
      operationId: `${flowPrefix}-flow-${mode}-operation`,
      manifestVersionId: `${flowPrefix}-flow-${mode}-manifest`,
      publicationId: `${flowPrefix}-flow-${mode}-publication`,
      publicationRevision: 1,
      result: { mode, candidateId, fixture: true },
    });
    return {
      preview: async () => ({ preview: preview() }),
      approve: async () => ({
        approval: createPreviewApproval({
          approvalId: `${ticket65Fixture ? 'ticket65' : 'ticket66'}-flow-preview-approval`,
          approvalRevision: 1,
          actorId: OWNER_ID,
          approvedAt: '2026-07-27T00:00:00.000Z',
          expiresAt: '2026-08-27T00:00:00.000Z',
          preview: preview(),
          canonicalActivitiesByKey: activitiesByKey,
        }),
      }),
      publishFull: async (input) => {
        const result = receipt('full', input.candidateId);
        setPublicationMessage('Mock full-PDF publication completed.');
        return result;
      },
      publishComponent: async (input) => {
        const result = receipt('component', input.candidateId);
        setPublicationMessage('Mock component-PDF publication completed.');
        return result;
      },
    };
  }, [candidate, ticket65Fixture, ticket66Fixture]);

  const persistTicket70State = useCallback((
    nextCandidate: BookAssemblyCandidateRecord,
    nextStagedCandidate: BookAssemblyCandidateRecord | null,
  ) => {
    setCandidate(nextCandidate);
    setTicket70StagedCandidate(nextStagedCandidate);
    setSearchParams({
      fixture,
      candidate: encodeCandidate(nextCandidate),
      ...(nextStagedCandidate ? { stagedCandidate: encodeCandidate(nextStagedCandidate) } : {}),
    }, { replace: true });
  }, [fixture, setSearchParams]);

  const ticket70MigrationClient = useMemo<BookAssemblyMigrationClient | null>(() => {
    if (!ticket70Fixture) return null;
    const mutationResult = (
      status: BookAssemblyMutationResult['status'],
      nextCandidate?: BookAssemblyCandidateRecord,
    ): BookAssemblyMutationResult => ({
      status,
      candidate: nextCandidate,
      receipt: {
        createdAt: NOW,
        fingerprint: 'ticket70-local-migration-fingerprint',
        operationId: 'ticket70-local-migration-operation',
        status,
        ...(nextCandidate && {
          candidateId: nextCandidate.candidateId,
          candidateRevision: nextCandidate.revision,
        }),
      },
      currentRevision: ticket70CandidateRef.current?.revision,
    });
    const sourceVersionAuthority = {
      getSourceVersion: (sourceVersionId: string) =>
        sourceVersions.find((source) => source.sourceVersionId === sourceVersionId),
    };

    return {
      migrate: async (input: MigrateAssemblySourceStrategyInput) => {
        const current = ticket70CandidateRef.current;
        if (!current?.manifest) return mutationResult('not-found');
        const currentManifest = current.manifest;
        const plan = planSourceStrategyMigration({
          bookId: BOOK_ID,
          bookMode: 'pdf',
          bookRevision: 7,
          sourceSetRevision: 4,
          sourceSet: currentManifest.sourceSet,
          candidate: {
            candidateId: current.candidateId,
            revision: current.revision,
            bookRevision: current.bookRevision,
            sourceSetRevision: current.sourceSetRevision,
            manifest: currentManifest,
          },
          target: {
            sourceSetRevision: input.targetSourceSetRevision,
            sourceSet: input.targetSourceSet,
          },
          remaps: input.remaps,
          published: false,
          hasPublication: false,
          sourceVersionAuthority,
        });
        if (!plan.canApply) return mutationResult('invalid');
        const staged = {
          ...current,
          candidateId: `migration-${current.candidateId}`,
          revision: current.revision + 1,
          sourceSetRevision: input.targetSourceSetRevision,
          manifest: plan.targetManifest,
          lifecycle: 'draft' as const,
          updatedAt: NOW,
        };
        persistTicket70State(current, staged);
        return mutationResult('replaced', staged);
      },
      confirm: async () => {
        const current = ticket70CandidateRef.current;
        const staged = ticket70StagedCandidateRef.current;
        if (!current || !staged) return mutationResult('not-found');
        persistTicket70State(staged, null);
        return mutationResult('replaced', staged);
      },
      discardMigration: async () => {
        const current = ticket70CandidateRef.current;
        const staged = ticket70StagedCandidateRef.current;
        if (current) persistTicket70State(current, null);
        return mutationResult('discarded', staged ?? undefined);
      },
    };
  }, [persistTicket70State, ticket70Fixture]);

  const ticket50UploadWorkflow = useMemo<SourceUploadBrowserWorkflow | null>(() => {
    if (!ticket50Fixture) return null;
    return {
      load: async () => ticket50CleanupReleased ? null : ticket50CleanupState,
      start: async () => { throw new Error('ticket50_fresh_upload_disabled'); },
      retryBytes: async () => { throw new Error('ticket50_byte_upload_owned_by_ticket49'); },
      retryCompletion: async () => { throw new Error('ticket50_completion_owned_by_ticket49'); },
      requestCancellation: async () => true,
      retryCleanup: async () => {
        setSearchParams({ fixture, cleanup: 'released' }, { replace: true });
        return 'released';
      },
    };
  }, [fixture, setSearchParams, ticket50CleanupReleased, ticket50Fixture]);

  const pdfUploadWorkflow = useMemo<SourceUploadBrowserWorkflow | null>(() => {
    if (!pdfUploadFixture) return null;
    const verified = async (input: Parameters<SourceUploadBrowserWorkflow['start']>[0]) => ({
      state: {
        schemaVersion: 1 as const,
        bookId: input.bookId,
        operationId: 'pdf-upload-fixture-operation',
        reservationId: 'pdf-upload-fixture-reservation',
        sourceVersionId: `source-uploaded-${input.sourceKey}`,
        sourceKey: input.sourceKey,
        kind: input.kind,
        displayFilename: input.claim.displayFilename,
        exactByteSize: input.claim.exactByteSize,
        sha256Hex: input.claim.sha256Hex,
        providerFileId: 'pdf-upload-fixture-file',
        providerFileVersionId: 'pdf-upload-fixture-version',
        phase: 'verified' as const,
      },
      completion: {
        status: 'verified_completed' as const,
        reservationId: 'pdf-upload-fixture-reservation',
        sourceVersionId: `source-uploaded-${input.sourceKey}`,
      },
    });
    return {
      load: async () => null,
      start: verified,
      retryBytes: verified,
      retryCompletion: async () => {
        throw new Error('pdf_upload_fixture_completion_retry_not_needed');
      },
      requestCancellation: async () => true,
      retryCleanup: async () => 'released' as const,
    };
  }, [pdfUploadFixture]);

  const persistPublicationScope = useCallback((
    scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
    canonicalRecords: readonly CanonicalPublishedActivityVersionRecord[] = [],
  ) => {
    setPublicationScope(scope);
    const summary = summarizePublicationScope(scope, canonicalRecords);
    setPublicationSummary(summary);
    const nextParams: Record<string, string> = { fixture };
    if (candidate) nextParams.candidate = encodeCandidate(candidate);
    nextParams.publication = encodePublicationSummary(summary);
    setSearchParams(nextParams, { replace: true });
  }, [candidate, fixture, setSearchParams]);

  const repository = useMemo<UnitAssemblyRepository>(() => {
    let workingCandidate = candidate;
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
        workingCandidate = next;
        persistCandidate(next);
        return mutationResult('created', next);
      },
      replace: async (input) => {
        if (forceConflictRef.current) {
          const remote = createCandidate(workingCandidate?.manifest ?? initialManifest, (workingCandidate?.revision ?? 1) + 1);
          workingCandidate = remote;
          persistCandidate(remote);
          forceConflictRef.current = false;
          return mutationResult('conflict');
        }
        const next = createCandidate(input.manifest, (workingCandidate?.revision ?? input.expectedCandidateRevision) + 1);
        workingCandidate = next;
        persistCandidate(next);
        return mutationResult('replaced', next);
      },
      validate: async () => {
        const base = workingCandidate ?? createCandidate(initialManifest, 1);
        const next = { ...base, lifecycle: 'validated' as const, revision: base.revision + 1, validation: { valid: true, errors: [] } };
        workingCandidate = next;
        persistCandidate(next);
        return mutationResult('validated', next);
      },
      discard: async () => mutationResult('discarded', workingCandidate ?? createCandidate(initialManifest, 1)),
      load: async () => ({
        conflict: null,
        candidate: workingCandidate ?? createCandidate(initialManifest, 1),
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

  const fixtureTitle = ticket50Fixture
    ? 'PRD0062 Ticket 50 Reconciliation Fixture'
    : ticket63Fixture
      ? 'PRD0062 Ticket 63 Candidate Preview Fixture'
      : smokeBook.title;
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
    const approvalRecord = createPreviewApproval({
      approvalId: previewApproval,
      approvalRevision: 1,
      actorId: OWNER_ID,
      approvedAt: '2026-07-26T00:00:00.000Z',
      expiresAt: '2026-07-28T00:00:00.000Z',
      preview: createCandidateUnitPreview({
        candidate,
        sourceVersions,
        sourceIsPreviewReady: () => true,
        activitiesByKey: { 'activity-ticket65': ticket65Activity },
        registryVersion: 'ticket65-local-fixture-v1',
      }),
      canonicalActivitiesByKey: { 'activity-ticket65': ticket65Activity },
    });
    const command = createFullPdfPublicationCommand({
      readAuthority: async () => authority,
      readCandidate: async () => candidate,
      readLineage: async () => ({}),
      readActivities: async () => ({
        'activity-ticket65': {
          activityKey: 'activity-ticket65',
          ownerId: OWNER_ID,
          revision: 1,
          lifecycle: 'draft',
          activity: ticket65Activity,
        },
      }),
      readPreviewApproval: async () => approvalRecord,
      sourceIsPreviewReady: async () => true,
      publish: async (input) => {
        const activityVersions = new InMemoryCanonicalActivityVersionRepository();
        return createCanonicalBookAssemblyPublicationService(repository, activityVersions).publish(input);
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
  const publishComponentPdfUnit = async () => {
    if (!ticket66Fixture || !candidate || !candidate.manifest || !previewApproval) return;
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
    const activitiesByKey = {
      'activity-ticket66-a': ticket66Activity('a'),
      'activity-ticket66-b': ticket66Activity('b'),
    };
    const approvalRecord = createPreviewApproval({
      approvalId: previewApproval,
      approvalRevision: 1,
      actorId: OWNER_ID,
      approvedAt: '2026-07-26T00:00:00.000Z',
      expiresAt: '2026-07-28T00:00:00.000Z',
      preview: createCandidateUnitPreview({
        candidate,
        sourceVersions,
        sourceIsPreviewReady: () => true,
        activitiesByKey,
        registryVersion: 'ticket66-local-fixture-v1',
      }),
      canonicalActivitiesByKey: activitiesByKey,
    });
    const activityVersions = new InMemoryCanonicalActivityVersionRepository();
    const command = createComponentPdfPublicationCommand({
      readAuthority: async () => authority,
      readCandidate: async () => candidate,
      readLineage: async () => ({}),
      readActivities: async () => Object.fromEntries(
        Object.entries(activitiesByKey).map(([activityKey, activity]) => [activityKey, {
          activityKey,
          ownerId: OWNER_ID,
          revision: 1,
          lifecycle: 'draft' as const,
          activity,
        }]),
      ),
      readPreviewApproval: async () => approvalRecord,
      sourceIsPreviewReady: async () => true,
      publish: async (input) => {
        return createCanonicalBookAssemblyPublicationService(repository, activityVersions).publish(input);
      },
      allocateOperationId: () => globalThis.crypto.randomUUID(),
      allocateId: (kind, key) => `${kind}:${key}:ticket66`,
      now: () => NOW,
    });
    try {
      const receipt = await command({
        ownerId: OWNER_ID,
        bookId: BOOK_ID,
        unitKey: 'unit-component-a',
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
      const canonicalRecords = await Promise.all(
        Object.values(nextScope.activityVersions ?? {}).map((reference) =>
          activityVersions.readPrepared(reference)),
      );
      if (canonicalRecords.some((record) => record === null)) {
        throw new Error('Component-PDF canonical Activity readback failed.');
      }
      persistPublicationScope(
        nextScope,
        canonicalRecords.filter((record): record is CanonicalPublishedActivityVersionRecord => record !== null),
      );
      const message = `Published component-PDF Unit ${receipt.publicationId}.`;
      setPublicationMessage(message);
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Component-PDF publication failed.';
      setPublicationMessage(message);
      toast.error('Component-PDF publication failed.');
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
      {ticket70Fixture && candidate?.manifest && (
        <section aria-label="Ticket 70 local migration proof" style={{ display: 'grid', gap: 8 }}>
          <h2>Ticket 70 local source-strategy migration proof</h2>
          <p data-testid="ticket70-current-candidate">
            Current candidate: {candidate.candidateId} ({candidate.manifest.sourceSet.sourceStrategy})
          </p>
          <p data-testid="ticket70-staged-candidate">
            Staged candidate: {ticket70StagedCandidate?.candidateId ?? 'none'}
          </p>
          <p data-testid="ticket70-source-bytes">
            Source bytes: {ticket70OriginalSourceVersionIds.join(', ') || 'none'} (preserved)
          </p>
          <p data-testid="ticket70-publication-state">Publication state: disabled (local proof only)</p>
          {ticket70StagedCandidate && (
            <div>
              <button type="button" onClick={() => void ticket70MigrationClient?.confirm({
                operationId: '00000000-0000-4000-8000-000000000070',
                bookId: BOOK_ID,
                unitKey: candidate.unitKey,
                migrationCandidateId: ticket70StagedCandidate.candidateId,
                expectedCurrentCandidateId: candidate.candidateId,
                expectedCurrentCandidateRevision: candidate.revision,
                expectedMigrationCandidateRevision: ticket70StagedCandidate.revision,
              })}>
                Confirm reloaded migration
              </button>
              <button type="button" onClick={() => void ticket70MigrationClient?.discardMigration({
                operationId: '00000000-0000-4000-8000-000000000070',
                bookId: BOOK_ID,
                unitKey: candidate.unitKey,
                migrationCandidateId: ticket70StagedCandidate.candidateId,
                expectedCurrentCandidateId: candidate.candidateId,
                expectedCurrentCandidateRevision: candidate.revision,
                expectedMigrationCandidateRevision: ticket70StagedCandidate.revision,
              })}>
                Discard reloaded migration
              </button>
            </div>
          )}
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
      {ticket66Fixture && (
        <section aria-label="Ticket 66 publication state">
          <h2>Component-PDF publication fixture</h2>
          <p>Trusted command layer allocates operation and publication IDs before adapter execution.</p>
          <p data-testid="ticket66-component-order">
            Component order: {(publicationSummary.publicationId
              ? publicationSummary.componentOrder
              : [...ticket66Manifest.sourceSet.sources]
                .sort((left, right) => left.sourceOrder - right.sourceOrder)
                .map((source) => source.sourceKey)).join(', ')}
          </p>
          <p data-testid="ticket66-component-owners">
            Component owners: {(publicationSummary.publicationId
              ? publicationSummary.componentOwners
              : [...ticket66Manifest.sourceSet.sources]
                .sort((left, right) => left.sourceOrder - right.sourceOrder)
                .map((source) => `${source.sourceKey}=${source.ownerNodeKey}`)).join(', ')}
          </p>
          <p data-testid="ticket66-source-pins">
            Source Versions: {(publicationSummary.publicationId
              ? publicationSummary.sourceVersionIds
              : [...ticket66Manifest.sourceSet.sources]
                .sort((left, right) => left.sourceOrder - right.sourceOrder)
                .map((source) => source.sourceVersionId)).join(', ')}
          </p>
          <p data-testid="ticket66-canonical-readbacks">
            Canonical Activity readbacks: {publicationSummary.canonicalReadbacks.join('; ')}
          </p>
          <p data-testid="ticket66-current-publication">
            Current publication: {publicationSummary.publicationId ?? 'none'}
          </p>
          <p data-testid="ticket66-version-count">
            Manifest Versions: {publicationSummary.versionCount}
          </p>
          <p data-testid="ticket66-activity-version-count">
            Activity Versions: {publicationSummary.activityVersionCount}
          </p>
          <p data-testid="ticket66-placement-count">
            Placements: {publicationSummary.placementCount}
          </p>
          <p data-testid="ticket66-unit-projection-count">
            Unit projections: {publicationSummary.unitProjectionCount}
          </p>
          <p data-testid="ticket66-delivery-plan-count">
            Delivery publication plans: {publicationSummary.deliveryPlanCount}
          </p>
          <p data-testid="ticket66-later-unit-state">
            Later Unit published: {publicationSummary.laterUnitPublished ? 'yes' : 'no'}
          </p>
          <p data-testid="ticket66-publication-message">{publicationMessage ?? 'No publication attempted.'}</p>
          <button
            type="button"
            onClick={() => {
              setPreviewApproval('ticket66-preview-approval');
              setPublicationMessage('Component-PDF preview approved.');
              toast.info('Component-PDF preview approved.');
            }}
          >
            Preview component PDF Unit
          </button>
          <button type="button" disabled={!previewApproval} onClick={() => void publishComponentPdfUnit()}>
            Publish component PDF Unit
          </button>
        </section>
      )}
      <BookMode2EditorShell
        access="owner"
        activityAuthoring={activityAuthoring}
        assemblyBookRevision={7}
        assemblyInitialCandidate={candidate}
        assemblyCandidateRuntimePreview={candidateRuntimePreview}
        assemblyPreviewClient={smokeAssemblyPreviewClient}
        assemblyPreviewDocuments={previewDocuments}
        assemblyRepository={repository}
        assemblyMigrationClient={ticket70MigrationClient}
        assemblySourceSetRevision={4}
        assemblySourceVersions={sourceVersions}
        book={{ ...smokeBook, title: fixtureTitle }}
        onDirtyChange={setDirty}
        presentation="page-compat"
        uploadPresentationEnabled={pdfUploadFixture || false}
        uploadWorkflow={pdfUploadFixture ? pdfUploadWorkflow : ticket50UploadWorkflow}
      />
    </main>
  );
}
