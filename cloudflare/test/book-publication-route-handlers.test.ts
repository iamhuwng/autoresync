import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from '../../src/services/book-assembly/unitAssembly.types.ts';
import type { BookAssemblyPublicationResult } from '../../src/services/book-assembly/publicationTransaction.service.ts';
import { InMemoryBookAssemblyPublicationRepository } from '../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyManifestCandidate } from '../../src/types/bookAssembly.types.ts';
import type { NormalizedActivity } from '../../src/types/bookActivity.types.ts';
import { InMemoryCanonicalActivityVersionRepository } from '../../src/services/book-assembly/canonicalPublicationRepository.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import { createBookRouter } from '../src/upload-worker/book-router.ts';
import { createBookAssemblyPublicationRouteHandlers } from '../src/upload-worker/book-assembly/publication-route-handlers.ts';
import type { UnitActivityBinding, UnitActivityBindingRepository } from '../../src/services/book-assembly/unitActivityBinding.repository.ts';
import {
  createCandidateUnitPreview,
  createPreviewApproval,
} from '../../src/services/book-assembly/unitPreview.service.ts';

const operationId = '00000000-0000-4000-8000-000000000265';
const now = '2026-07-27T13:00:00.000Z';

const pilotEnv = {
  BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
  BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
  BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({
    schemaVersion: 'v1',
    environment: 'test',
    revision: 'book-publication-route-test-1',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    teacherId: 'teacher-1',
    bookId: 'book-1',
    assignmentId: 'assignment-1',
    studentIds: ['student-1'],
    maxStudents: 30,
  }),
};

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

const readActivities = async () => ({
  'slot-a': {
    activityKey: 'slot-a',
    ownerId: 'teacher-1',
    revision: 1,
    lifecycle: 'draft' as const,
    activity: activity(),
  },
});

const request = (path = '/book-assembly/full-pdf-publications', body: unknown = {}) => new Request(`https://worker.test${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
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
  }],
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
      ? { sourceVersionId, bookId: 'book-1', physicalPageCount: 12, verifiedUsable: true }
      : undefined,
  },
});

const candidate = (strategy: 'full_pdf' | 'component_pdfs'): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 9,
  sourceSetRevision: 3,
  unitKey: 'unit-1',
  revision: 6,
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

const currentApproval = (strategy: 'full_pdf' | 'component_pdfs' = 'full_pdf') => createPreviewApproval({
  approvalId: 'approval-1',
  approvalRevision: 1,
  actorId: 'teacher-1',
  approvedAt: '2026-07-27T12:00:00.000Z',
  expiresAt: '2026-07-27T14:00:00.000Z',
  preview: createCandidateUnitPreview({
    candidate: candidate(strategy),
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
    activitiesByKey: { 'slot-a': activity() },
    registryVersion: 'registry-1',
  }),
  canonicalActivitiesByKey: { 'slot-a': activity() },
});

const fullPdfApprovalPorts = {
  readPreviewApproval: vi.fn(async () => currentApproval()),
  sourceIsPreviewReady: async () => true,
};

const componentPdfApprovalPorts = {
  readPreviewApproval: vi.fn(async () => currentApproval('component_pdfs')),
  sourceIsPreviewReady: async () => true,
};

describe('Book publication route composition', () => {
  it('binds both publication descriptors to the canonical bookAssembly namespace', () => {
    const handlers = createBookRouteHandlers({
      assemblyPublication: {},
    });

    expect(typeof handlers['bookAssembly.fullPdfPublish']).toBe('function');
    expect(typeof handlers['bookAssembly.componentPdfPublish']).toBe('function');
  });

  it('injects the durable repository into the Full-PDF worker seam', async () => {
    const repository = {
      readScope: vi.fn(async () => ({})),
      transaction: vi.fn(),
    };
    const repositoryFactory = vi.fn(() => repository);
    const readAuthority = vi.fn(async () => null);
    const env = {
      ...pilotEnv,
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.test',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'book-assembly@example.test',
        private_key: 'private-key',
      }),
      BOOK_FULL_PDF_PUBLICATION_ENABLED: 'false',
      BOOK_ASSEMBLY_REGISTRY_VERSION: 'registry-1',
      readDatabaseValue: vi.fn(async () => ({ role: 'teacher' })),
    };
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory,
      activityVersionWriterFactory: () => new InMemoryCanonicalActivityVersionRepository(),
      fullPdf: { readUser: async () => ({ role: 'teacher' }), readAuthority, readActivities, ...fullPdfApprovalPorts },
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
          readUser: async () => ({ role: 'teacher' }),
          readAuthority: async () => authority(strategy),
          readCandidate: async () => candidate(strategy),
          readActivities,
          ...fullPdfApprovalPorts,
        },
      } : {
        componentPdf: {
          readAuthority: async () => authority(strategy),
          readCandidate: async () => candidate(strategy),
          readActivities,
          ...componentPdfApprovalPorts,
        },
      }),
    });
    const env = {
      ...pilotEnv,
      ...(strategy === 'full_pdf'
        ? { BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true' }
        : { BOOK_COMPONENT_PDF_PUBLICATION_ENABLED: 'true' }),
      BOOK_ASSEMBLY_REGISTRY_VERSION: 'registry-1',
      readDatabaseValue: vi.fn(async () => ({ role: 'teacher' })),
    };
    const handler = strategy === 'full_pdf' ? handlers.fullPdfPublish : handlers.componentPdfPublish;
    const result = await handler({
      request: request(
        strategy === 'full_pdf'
          ? '/book-assembly/full-pdf-publications'
          : '/book-assembly/component-pdf-publications',
        body(),
      ),
      env,
      uid: 'teacher-1',
    });

    expect(result.init.status).toBe(200);
    expect((strategy === 'full_pdf' ? fullPdfApprovalPorts : componentPdfApprovalPorts)
      .readPreviewApproval).toHaveBeenLastCalledWith({
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
      expect.stringMatching(
        strategy === 'component_pdfs'
          ? /^sha256:[0-9a-f]{64}$/u
          : /^fnv1a64:/u,
      ),
    );
    expect(prepare).toHaveBeenCalledOnce();
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
      ...pilotEnv,
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
      ...pilotEnv,
      BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true',
      BOOK_ASSEMBLY_REGISTRY_VERSION: 'registry-1',
      readDatabaseValue: vi.fn(async () => ({ role: 'teacher' })),
    };
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: vi.fn(() => repository),
      activityVersionWriterFactory: () => new InMemoryCanonicalActivityVersionRepository(),
      fullPdf: {
        readUser: async () => ({ role: 'teacher' }),
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

  it('reconciles a response-loss binding failure on publication replay without another publication version', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const writer = new InMemoryCanonicalActivityVersionRepository();
    const prepare = vi.spyOn(writer, 'prepare');
    const retryOperationId = '22222222-2222-4222-8222-222222222222';
    let operationAllocations = 0;
    let failOnce = true;
    let recordCalls = 0;
    let binding: UnitActivityBinding = {
      schemaVersion: 1, ownerId: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', activityKey: 'slot-a',
      activityId: 'activity:slot-a', candidateId: 'activity-candidate-1', candidateRevision: 3, candidateLifecycle: 'saved',
    };
    const bindings: UnitActivityBindingRepository = {
      read: async () => structuredClone(binding),
      bindCandidate: async () => 'replayed',
      recordPublication: async (value) => {
        recordCalls += 1;
        if (failOnce) { failOnce = false; throw new Error('response_lost_after_commit'); }
        binding = { ...binding, activityVersionId: value.activityVersionId, activityVersion: value.activityVersion };
        return recordCalls === 2 ? 'updated' : 'replayed';
      },
    };
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: () => repository,
      activityVersionWriterFactory: () => writer,
      bindingRepositoryFactory: () => bindings,
      allocateOperationId: () => operationAllocations++ === 0 ? operationId : retryOperationId,
      allocateId: (kind, key) => kind === 'activity' ? `activity:${key}` : `${kind}:${key}`,
      now: () => now,
      fullPdf: {
        readUser: async () => ({ role: 'teacher' }),
        readAuthority: async () => authority('full_pdf'), readCandidate: async () => candidate('full_pdf'),
        readActivities, ...fullPdfApprovalPorts,
      },
    });
    const env = { ...pilotEnv, BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true', readDatabaseValue: async () => ({ role: 'teacher' }) };
    const first = await handlers.fullPdfPublish({ request: request(undefined, body()), env, uid: 'teacher-1' });
    expect(first).toMatchObject({ init: { status: 503 }, body: { code: 'book_assembly_activity_binding_unavailable' } });
    const committed = await repository.readScope('book-1');
    expect(Object.keys(committed.versions ?? {})).toHaveLength(1);
    expect(Object.keys(committed.activityVersions ?? {})).toHaveLength(1);

    const mismatched = await handlers.fullPdfPublish({
      request: request(undefined, { ...body(), expectedCandidateRevision: 5 }), env, uid: 'teacher-1',
    });
    expect(mismatched).toMatchObject({ init: { status: 422 }, body: { code: 'full_pdf_revision_conflict' } });
    expect(recordCalls).toBe(1);

    const retried = await handlers.fullPdfPublish({ request: request(undefined, body()), env, uid: 'teacher-1' });
    expect(retried.init.status).toBe(200);
    expect((retried.body as { result: { status: string } }).result.status).toBe('replayed');
    expect((retried.body as { operationId: string }).operationId).toBe(operationId);
    expect(recordCalls).toBe(2);
    expect(prepare).toHaveBeenCalledOnce();
    expect(binding.activityVersionId).toBe('activity-version:slot-a');
    const after = await repository.readScope('book-1');
    expect(Object.keys(after.versions ?? {})).toHaveLength(1);
    expect(Object.keys(after.activityVersions ?? {})).toHaveLength(1);
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
      ...pilotEnv,
      [gate]: 'enabled',
      BOOK_ASSEMBLY_REGISTRY_VERSION: 'registry-1',
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.test',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: identity,
      BOOK_ROUTE_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    };
    const pilotRequestBody = JSON.stringify({ bookId: 'book-1' });
    const routeRequest = () => new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/json',
        'Content-Length': String(new TextEncoder().encode(pilotRequestBody).byteLength),
      },
      body: pilotRequestBody,
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
    const env = { readDatabaseValue: vi.fn(async () => ({ role: 'teacher' })) };

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
