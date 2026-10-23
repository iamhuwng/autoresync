import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from '../../src/services/book-assembly/unitAssembly.types.ts';
import type { BookAssemblyPublicationResult } from '../../src/services/book-assembly/publicationTransaction.service.ts';
import { InMemoryBookAssemblyPublicationRepository } from '../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyManifestCandidate } from '../../src/types/bookAssembly.types.ts';
import type { NormalizedActivity } from '../../src/types/bookActivity.types.ts';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPublicationPointer,
} from '../../src/types/bookAssembly.types.ts';
import { InMemoryCanonicalActivityVersionRepository } from '../../src/services/book-assembly/canonicalPublicationRepository.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import { createBookRouter } from '../src/upload-worker/book-router.ts';
import { createBookAssemblyPublicationRouteHandlers } from '../src/upload-worker/book-assembly/publication-route-handlers.ts';
import {
  createCandidateUnitPreview,
  createPreviewApproval,
  wholeActivationApprovalFingerprint,
} from '../../src/services/book-assembly/unitPreview.service.ts';
import { createComponentStudentDocument } from '../../src/services/book-assembly/componentStudentDocument.types.ts';

const operationId = '00000000-0000-4000-8000-000000000265';
const now = '2026-07-27T13:00:00.000Z';

const activity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Choose safely',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Read source.' }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId: 'choice-1',
    prompt: 'Choose A',
    options: ['A', 'B'],
    sourceAssisted: {
      questionLabel: '1',
      sourceExerciseLabel: 'Exercise 1',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
    },
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const readActivities = async (input: { readonly activityKeys: readonly string[] }) => Object.fromEntries(
  input.activityKeys.map((activityKey) => [activityKey, {
    activityKey,
    ownerId: 'teacher-1',
    revision: 1,
    lifecycle: 'draft' as const,
    activity: activity(),
  }]),
);

const request = (
  path = '/book-assembly/full-pdf-publications',
  body: unknown = {},
  extraHeaders: Record<string, string> = {},
) => new Request(`https://worker.test${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...extraHeaders },
  body: JSON.stringify(body),
});

const manifest = (strategy: 'full_pdf' | 'component_pdfs'): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: strategy,
    sources: strategy === 'full_pdf'
      ? [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }]
      : [
          { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'root' },
          { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'root' },
        ],
  },
  nodes: [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
    ...(strategy === 'component_pdfs'
      ? [{ nodeKey: 'unit-2', parentNodeKey: 'root', nodeType: 'unit' as const, order: 2 }]
      : []),
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'slot-a',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-a'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-a',
      sourceKey: strategy === 'full_pdf' ? 'full' : 'component-a',
      pages: [1],
      activityKeys: ['slot-a'],
      mode: 'activity',
    }],
  }, ...(strategy === 'component_pdfs' ? [{
    unitKey: 'unit-2',
    activitySlots: [{
      activityKey: 'slot-b',
      order: 1,
      contextRequirement: 'required' as const,
      pageGroupKeys: ['pages-b'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-b',
      sourceKey: 'component-b',
      pages: [1],
      activityKeys: ['slot-b'],
      mode: 'activity' as const,
    }],
  }] : [])],
});

const authority = (strategy: 'full_pdf' | 'component_pdfs'): BookAssemblyBookAuthority => ({
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 9,
  sourceSetRevision: 3,
  sourceSet: manifest(strategy).sourceSet,
  sourceVersionAuthority: {
    getSourceVersion: (sourceVersionId) => sourceVersionId.startsWith('source-')
      ? { sourceKey: sourceVersionId === 'source-v1' ? 'full' : sourceVersionId === 'source-a-v1' ? 'component-a' : 'component-b',
          sourceVersionId, bookId: 'book-1', checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
          purpose: 'book-source' as const, studentSafeStatus: 'ready' as const,
          studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: '2026-07-27T00:00:00.000Z', sourceVersionId,
            sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed' as const },
          physicalPageCount: 12, verifiedUsable: true }
      : undefined,
  },
});

const candidate = (
  strategy: 'full_pdf' | 'component_pdfs', unitKey = 'unit-1',
): BookAssemblyCandidateRecord => ({
  candidateId: unitKey === 'unit-1' ? 'candidate-1' : 'candidate-2',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 9,
  sourceSetRevision: 3,
  unitKey,
  revision: unitKey === 'unit-1' ? 6 : 7,
  lifecycle: 'validated',
  manifest: manifest(strategy),
  validation: { valid: true, errors: [] },
  updatedAt: now,
});

const body = () => ({
  bookId: 'book-1',
  unitKey: 'unit-1',
  candidateId: 'candidate-1',
  expectedCandidateRevision: 6,
  expectedCurrentPublicationId: null,
  expectedBookRevision: 9,
  expectedSourceSetRevision: 3,
  previewApproval: {
    approvalId: 'approval-1',
    approvalRevision: 1,
    approvedAt: '2026-07-27T12:00:00.000Z',
    expiresAt: '2026-07-27T14:00:00.000Z',
  },
});

const componentBody = () => ({
  bookId: 'book-1',
  expectedCurrentPublicationId: null,
  expectedBookRevision: 9,
  expectedSourceSetRevision: 3,
  unitApprovals: [
    { unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 6,
      approvalId: 'approval-1', approvalRevision: 1,
      approvedAt: '2026-07-27T12:00:00.000Z', expiresAt: '2026-07-27T14:00:00.000Z' },
    { unitKey: 'unit-2', candidateId: 'candidate-2', candidateRevision: 7,
      approvalId: 'approval-2', approvalRevision: 1,
      approvedAt: '2026-07-27T12:00:00.000Z', expiresAt: '2026-07-27T14:00:00.000Z' },
  ],
});

const studentDocument = createComponentStudentDocument({
  sourceVersionId: 'student-v1', descriptorRevision: 2, sha256Hex: 'a'.repeat(64), byteSize: 20,
  physicalPageCount: 20, compositionFingerprint: 'composition-1', components: [
    { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'root', localPageCount: 10, combinedStartPage: 1, combinedEndPage: 10 },
    { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'root', localPageCount: 10, combinedStartPage: 11, combinedEndPage: 20 },
  ],
});

const wholeInput = () => ({
  ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 9, sourceSetRevision: 3,
  sourceSet: manifest('component_pdfs').sourceSet,
  activationReceipt: {
    schemaVersion: 1 as const, operationId: 'activation-1', inputFingerprint: 'fnv1a64:1111111111111111',
    ownerId: 'teacher-1', bookId: 'book-1' as never, bookRevision: 9, sourceSetRevision: 3,
    sourceSet: manifest('component_pdfs').sourceSet,
    unitCandidates: [
      { unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 6, manifestFingerprint: 'fnv1a64:2222222222222222' },
      { unitKey: 'unit-2', candidateId: 'candidate-2', candidateRevision: 7, manifestFingerprint: 'fnv1a64:2222222222222222' },
    ],
    studentDocument: { sourceVersionId: 'student-v1', descriptorRevision: 2, descriptorFingerprint: 'fnv1a64:3333333333333333' },
    activities: [
      { unitKey: 'unit-1', activityKey: 'slot-a', activityId: 'activity-a', activityCandidateId: 'activity-candidate-a', activityCandidateRevision: 1, activityPayloadFingerprint: 'fnv1a64:4444444444444444' },
      { unitKey: 'unit-2', activityKey: 'slot-b', activityId: 'activity-b', activityCandidateId: 'activity-candidate-b', activityCandidateRevision: 1, activityPayloadFingerprint: 'fnv1a64:4444444444444444' },
    ],
    activatedAt: now,
  },
  units: [
    { unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 6, manifestFingerprint: 'fnv1a64:2222222222222222', manifest: manifest('component_pdfs') },
    { unitKey: 'unit-2', candidateId: 'candidate-2', candidateRevision: 7, manifestFingerprint: 'fnv1a64:2222222222222222', manifest: manifest('component_pdfs') },
  ],
  studentDocument,
  registryVersion: 'registry-1',
  activities: [
    { unitKey: 'unit-1', activityKey: 'slot-a', activityId: 'activity-a', activityCandidateId: 'activity-candidate-a', activityCandidateRevision: 1, activityPayloadFingerprint: 'fnv1a64:4444444444444444' },
    { unitKey: 'unit-2', activityKey: 'slot-b', activityId: 'activity-b', activityCandidateId: 'activity-candidate-b', activityCandidateRevision: 1, activityPayloadFingerprint: 'fnv1a64:4444444444444444' },
  ],
});

const currentApproval = (
  strategy: 'full_pdf' | 'component_pdfs' = 'full_pdf', unitKey = 'unit-1',
) => createPreviewApproval({
  approvalId: unitKey === 'unit-1' ? 'approval-1' : 'approval-2',
  approvalRevision: 1,
  actorId: 'teacher-1',
  approvedAt: '2026-07-27T12:00:00.000Z',
  expiresAt: '2026-07-27T14:00:00.000Z',
  preview: createCandidateUnitPreview({
    candidate: candidate(strategy, unitKey),
    sourceVersions: strategy === 'full_pdf'
      ? [{
          sourceVersionId: 'source-v1',
          bookId: 'book-1',
          physicalPageCount: 12,
          verifiedUsable: true,
        }]
      : [
          {
            sourceVersionId: 'source-a-v1',
            bookId: 'book-1',
            physicalPageCount: 12,
            verifiedUsable: true,
          },
          {
            sourceVersionId: 'source-b-v1',
            bookId: 'book-1',
            physicalPageCount: 12,
            verifiedUsable: true,
          },
        ],
    sourceIsPreviewReady: () => true,
    activitiesByKey: { [unitKey === 'unit-1' ? 'slot-a' : 'slot-b']: activity() },
    registryVersion: 'registry-1',
    ...(strategy === 'component_pdfs' ? {
      studentDocument: { descriptor: studentDocument, request: { opaqueRouteKey: 'doc', expectedByteLength: 20, expectedEtag: 'etag' } },
    } : {}),
  }),
  canonicalActivitiesByKey: { [unitKey === 'unit-1' ? 'slot-a' : 'slot-b']: activity() },
  ...(strategy === 'component_pdfs'
    ? { wholeActivationFingerprint: wholeActivationApprovalFingerprint(wholeInput()) }
    : {}),
});

const fullPdfApprovalPorts = {
  readPreviewApproval: vi.fn(async () => currentApproval()),
  sourceIsPreviewReady: async () => true,
};

const componentPdfApprovalPorts = {
  readPreviewApproval: vi.fn(async (input: { readonly unitKey: string }) => currentApproval('component_pdfs', input.unitKey)),
  readWholeActivationApprovalInput: vi.fn(async () => wholeInput()),
  sourceIsPreviewReady: async () => true,
};

const currentPointer = (): BookAssemblyPublicationPointer => ({
  publicationId: 'publication-1',
  publicationRevision: 2,
  manifestVersionId: 'manifest-1',
  bookRevision: 9,
  sourceSetRevision: 3,
  inputFingerprint: 'fingerprint-1',
  updatedAt: now,
  updatedByCommandId: operationId,
});

const currentVersion = (ownerId = 'teacher-1'): BookAssemblyImmutableManifestVersion => ({
  bookId: 'book-1',
  ownerId,
  candidateId: 'candidate-1',
  candidateRevision: 4,
  publicationId: 'publication-1',
  publicationRevision: 2,
  studentSafeProjection: {
    schemaVersion: 1,
    bookId: 'book-1',
    publicationId: 'publication-1',
    publicationRevision: 2,
    sourceStrategy: 'full_pdf',
    sourceSet: manifest('full_pdf').sourceSet,
    units: manifest('full_pdf').units,
  },
} as BookAssemblyImmutableManifestVersion);

const currentPublicationInput = (uid = 'teacher-1') => ({
  request: request('/book-assembly/books/book-1/current-publication'),
  env: {},
  uid,
  bookId: 'book-1',
});

describe('Book publication route composition', () => {
  it('creates fresh component proof readers for every authenticated command', async () => {
    const reads: string[][] = [];
    const componentPdf = vi.fn((_env, _owner, _scope) => {
      const current: string[] = [];
      reads.push(current);
      return {
        readUser: async (context: { actorId: string }) => { current.push(context.actorId); return { role: 'teacher', status: 'active' }; },
        readAuthority: async () => null, readWholeActivationApprovalInput: async () => null,
        readActivities: async () => ({}), readPreviewApproval: async () => null, sourceIsPreviewReady: async () => false,
      };
    });
    const handler = createBookAssemblyPublicationRouteHandlers({ componentPdf,
      repositoryFactory: () => new InMemoryBookAssemblyPublicationRepository(),
      activityVersionWriterFactory: () => new InMemoryCanonicalActivityVersionRepository(),
    }).componentPdfPublish;
    for (const uid of ['teacher-1', 'teacher-2']) {
      expect((await handler({ request: request('/book-assembly/component-pdf-publications'), env: {}, uid })).init.status).toBe(503);
    }
    expect(componentPdf).toHaveBeenCalledTimes(2);
    expect(reads).toEqual([['teacher-1'], ['teacher-2']]);
  });

  it('binds both publication descriptors to the canonical bookAssembly namespace', () => {
    const handlers = createBookRouteHandlers({
      assemblyPublication: {},
    });

    expect(typeof handlers['bookAssembly.fullPdfPublish']).toBe('function');
    expect(typeof handlers['bookAssembly.componentPdfPublish']).toBe('function');
  });

  it('returns the current publication pointer for its owning teacher without writing', async () => {
    const pointer = currentPointer();
    const transaction = vi.fn();
    const readScope = vi.fn(async () => ({
      current: pointer,
      versions: { [pointer.manifestVersionId]: currentVersion() },
    }));
    const handler = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: vi.fn(() => ({ readScope, transaction })),
    }).currentPublication;

    const result = await handler(currentPublicationInput());

    expect(result).toEqual({
      body: { status: 'published', pointer, units: manifest('full_pdf').units },
      init: { status: 200, headers: { 'Cache-Control': 'no-store' } },
    });
    expect(readScope).toHaveBeenCalledWith('book-1');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns an empty status when no current publication pointer exists', async () => {
    const handler = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: () => ({ readScope: async () => ({}) }),
    }).currentPublication;

    await expect(handler(currentPublicationInput())).resolves.toEqual({
      body: { status: 'empty' },
      init: { status: 200, headers: { 'Cache-Control': 'no-store' } },
    });
  });

  it('rejects a current pointer whose immutable version belongs to another owner', async () => {
    const pointer = currentPointer();
    const handler = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: () => ({
        readScope: async () => ({
          current: pointer,
          versions: { [pointer.manifestVersionId]: currentVersion('another-teacher') },
        }),
      }),
    }).currentPublication;

    await expect(handler(currentPublicationInput())).resolves.toEqual({
      body: { code: 'book_assembly_publication_owner_required' },
      init: { status: 403 },
    });
  });

  it('injects the durable repository into the Full-PDF worker seam', async () => {
    const repository = {
      readScope: vi.fn(async () => ({})),
      transaction: vi.fn(),
    };
    const repositoryFactory = vi.fn(() => repository);
    const readAuthority = vi.fn(async () => null);
    const env = {
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.test',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'book-assembly@example.test',
        private_key: 'private-key',
      }),
      BOOK_FULL_PDF_PUBLICATION_ENABLED: 'false',
      BOOK_ASSEMBLY_REGISTRY_VERSION: 'registry-1',
      readDatabaseValue: vi.fn(async () => ({ role: 'teacher', status: 'active' })),
    };
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory,
      activityVersionWriterFactory: () => new InMemoryCanonicalActivityVersionRepository(),
      fullPdf: { readUser: async () => ({ role: 'teacher', status: 'active' }), readAuthority, readActivities, ...fullPdfApprovalPorts },
    });

    const result = await handlers.fullPdfPublish({
      request: request('/book-assembly/full-pdf-publications', body()),
      env,
      uid: 'teacher-1',
    });

    expect(result.init.status).toBe(503);
    expect(repositoryFactory).toHaveBeenCalledWith(env, 'teacher-1');
    expect(readAuthority).not.toHaveBeenCalled();
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it.each(['full_pdf', 'component_pdfs'] as const)('publishes through the injected repository for %s', async (strategy) => {
    const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const transaction = vi.spyOn(repository, 'transaction');
    const activityVersionWriter = new InMemoryCanonicalActivityVersionRepository();
    const prepare = vi.spyOn(activityVersionWriter, 'prepare');
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: vi.fn(() => repository),
      activityVersionWriterFactory: () => activityVersionWriter,
      allocateOperationId: () => operationId,
      allocateId: (kind, key) => `${kind}:${key}`,
      now: () => now,
      ...(strategy === 'full_pdf' ? {
        fullPdf: {
          readUser: async () => ({ role: 'teacher', status: 'active' }),
          readAuthority: async () => authority(strategy),
          readCandidate: async () => candidate(strategy),
          readActivities,
          ...fullPdfApprovalPorts,
        },
      } : {
        componentPdf: {
          readUser: async () => ({ role: 'teacher', status: 'active' }),
          readAuthority: async () => authority(strategy),
          readCandidate: async (context) => candidate(strategy, context.unitKey),
          readActivities,
          ...componentPdfApprovalPorts,
        },
      }),
    });
    const env = {
      ...(strategy === 'full_pdf'
        ? { BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true' }
        : { BOOK_COMPONENT_PDF_PUBLICATION_ENABLED: 'true' }),
      BOOK_ASSEMBLY_REGISTRY_VERSION: 'registry-1',
      readDatabaseValue: vi.fn(async () => ({ role: 'teacher', status: 'active' })),
    };
    const handler = strategy === 'full_pdf' ? handlers.fullPdfPublish : handlers.componentPdfPublish;
    const result = await handler({
      request: request(
        strategy === 'full_pdf'
          ? '/book-assembly/full-pdf-publications'
          : '/book-assembly/component-pdf-publications',
        strategy === 'full_pdf' ? body() : componentBody(),
      ),
      env,
      uid: 'teacher-1',
    });

    expect(result.init.status).toBe(200);
    expect((strategy === 'full_pdf' ? fullPdfApprovalPorts : componentPdfApprovalPorts)
      .readPreviewApproval).toHaveBeenCalledWith({
        env,
        actorId: 'teacher-1',
        bookId: 'book-1',
        unitKey: 'unit-1',
        approvalId: 'approval-1',
      });
    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledWith(
      'book-1',
      expect.any(Function),
      operationId,
      expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    );
    expect(prepare).toHaveBeenCalledTimes(strategy === 'full_pdf' ? 1 : 2);
  });

  it('authorizes Full-PDF publication through its injected actor reader with plain Wrangler env', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const transaction = vi.spyOn(repository, 'transaction');
    const readUser = vi.fn(async () => ({ role: 'teacher', status: 'active' }));
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: () => repository,
      activityVersionWriterFactory: () => new InMemoryCanonicalActivityVersionRepository(),
      allocateOperationId: () => operationId,
      allocateId: (kind, key) => `${kind}:${key}`,
      now: () => now,
      fullPdf: {
        readUser,
        readAuthority: async () => authority('full_pdf'),
        readCandidate: async () => candidate('full_pdf'),
        readActivities,
        readPreviewApproval: async () => currentApproval(),
        sourceIsPreviewReady: async () => true,
      },
    });
    const env = {
      BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true',
      BOOK_ASSEMBLY_REGISTRY_VERSION: 'registry-1',
    };

    const published = await handlers.fullPdfPublish({
      request: request('/book-assembly/full-pdf-publications', body()),
      env,
      uid: 'teacher-1',
    });

    expect(published.init.status).toBe(200);
    expect(readUser).toHaveBeenCalledExactlyOnceWith({ env, actorId: 'teacher-1' });
    expect(transaction).toHaveBeenCalledOnce();

    readUser.mockResolvedValueOnce({ role: 'teacher', status: 'blocked' });
    const forbidden = await handlers.fullPdfPublish({
      request: request('/book-assembly/full-pdf-publications', body()),
      env,
      uid: 'teacher-1',
    });

    expect(forbidden).toEqual({
      body: { code: 'full_pdf_publication_forbidden' },
      init: { status: 403 },
    });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('maps a durable approval revocation read to the publication fence', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const transaction = vi.spyOn(repository, 'transaction');
    const readPreviewApproval = vi.fn(async () => ({
      approval: currentApproval(),
      revocation: {
        approvalId: 'approval-1',
        bookId: 'book-1',
        unitKey: 'unit-1',
        actorId: 'teacher-1',
        revokedAt: '2026-07-27T12:45:00.000Z',
      },
    }));
    const env = {
      BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true',
      BOOK_ASSEMBLY_REGISTRY_VERSION: 'registry-1',
      readDatabaseValue: vi.fn(async () => ({ role: 'teacher', status: 'active' })),
    };
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: vi.fn(() => repository),
      activityVersionWriterFactory: () => new InMemoryCanonicalActivityVersionRepository(),
      fullPdf: {
        readUser: async () => ({ role: 'teacher', status: 'active' }),
        readAuthority: async () => authority('full_pdf'),
        readCandidate: async () => candidate('full_pdf'),
        readActivities,
        readPreviewApproval,
        sourceIsPreviewReady: async () => true,
      },
      allocateOperationId: () => operationId,
      allocateId: (kind, key) => `${kind}:${key}`,
      now: () => now,
    });

    const result = await handlers.fullPdfPublish({
      request: request('/book-assembly/full-pdf-publications', body()),
      env,
      uid: 'teacher-1',
    });

    expect(result.init.status).toBe(422);
    expect(transaction).not.toHaveBeenCalled();
    expect(readPreviewApproval).toHaveBeenCalledWith({
      env,
      actorId: 'teacher-1',
      bookId: 'book-1',
      unitKey: 'unit-1',
      approvalId: 'approval-1',
    });
  });

  it('keeps published ActivityVersion references in the immutable publication scope', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const writer = new InMemoryCanonicalActivityVersionRepository();
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: () => repository,
      activityVersionWriterFactory: () => writer,
      allocateOperationId: () => operationId,
      allocateId: (kind, key) => `${kind}:${key}`,
      now: () => now,
      fullPdf: {
        readUser: async () => ({ role: 'teacher', status: 'active' }),
        readAuthority: async () => authority('full_pdf'), readCandidate: async () => candidate('full_pdf'),
        readActivities, ...fullPdfApprovalPorts,
      },
    });
    const result = await handlers.fullPdfPublish({
      request: request(undefined, body(), { 'Idempotency-Key': operationId }),
      env: { BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true', readDatabaseValue: async () => ({ role: 'teacher', status: 'active' }) },
      uid: 'teacher-1',
    });

    expect(result.init.status).toBe(200);
    const published = await repository.readScope('book-1');
    expect(Object.values(published.activityVersions ?? {})).toEqual([expect.objectContaining({
      activityId: 'activity:slot-a', activityVersionId: 'activity-version:slot-a',
    })]);
  });
  it.each([
    ['/book-assembly/full-pdf-publications', 'BOOK_FULL_PDF_PUBLICATION_ROUTES_ENABLED', 'book_full_pdf_publication_dependencies_unavailable'],
    ['/book-assembly/component-pdf-publications', 'BOOK_COMPONENT_PDF_PUBLICATION_ROUTES_ENABLED', 'book_component_pdf_publication_dependencies_unavailable'],
  ] as const)('routes %s through canonical resolution and fails closed without ports', async (path, gate, dependencyCode) => {
    const router = createBookRouter({
      routeHandlers: { assemblyPublication: {} },
      firebaseVerifier: { verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid: 'teacher-1' })) },
    });
    const identity = JSON.stringify({
      client_email: 'book-assembly@example.test',
      private_key: 'private-key',
    });
    const env = {
      [gate]: 'enabled',
      BOOK_ASSEMBLY_REGISTRY_VERSION: 'registry-1',
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.test',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: identity,
      BOOK_ROUTE_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    };
    const requestBody = JSON.stringify({ bookId: 'book-1' });
    const routeRequest = () => new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/json',
        'Content-Length': String(new TextEncoder().encode(requestBody).byteLength),
      },
      body: requestBody,
    });
    const response = await router(routeRequest(), env);

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({ code: dependencyCode });

    const disabledResponse = await router(routeRequest(), { ...env, [gate]: 'disabled' });
    expect(disabledResponse?.status).toBe(503);
    await expect(disabledResponse?.json()).resolves.toEqual({ code: 'book_route_disabled' });
  });

  it('enforces the declared publication control-body limit before route handlers', async () => {
    const router = createBookRouter({
      routeHandlers: { assemblyPublication: {} },
      firebaseVerifier: { verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid: 'teacher-1' })) },
    });
    const response = await router(new Request('https://worker.test/book-assembly/full-pdf-publications', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/json',
        'Content-Length': String(256 * 1024 + 1),
      },
    }), {
      BOOK_FULL_PDF_PUBLICATION_ROUTES_ENABLED: 'enabled',
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.test',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'book-assembly@example.test',
        private_key: 'private-key',
      }),
      BOOK_ROUTE_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    });

    expect(response?.status).toBe(413);
    await expect(response?.json()).resolves.toEqual({ code: 'body_too_large' });
  });

  it('keeps both publication handlers fail-closed until destination reader ports exist', async () => {
    const handlers = createBookAssemblyPublicationRouteHandlers();
    const env = { readDatabaseValue: vi.fn(async () => ({ role: 'teacher', status: 'active' })) };

    await expect(handlers.fullPdfPublish({ request: request(), env, uid: 'teacher-1' }))
      .resolves.toEqual({
        body: { code: 'book_full_pdf_publication_dependencies_unavailable' },
        init: { status: 503 },
      });
    await expect(handlers.componentPdfPublish({ request: request(), env, uid: 'teacher-1' }))
      .resolves.toEqual({
        body: { code: 'book_component_pdf_publication_dependencies_unavailable' },
        init: { status: 503 },
      });
  });
});
