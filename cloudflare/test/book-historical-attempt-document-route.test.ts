import { describe, expect, it, vi } from 'vitest';
import {
  createBookHistoricalAttemptDocumentDeliveryHandler,
  type BookSourceDocumentRuntime,
} from '../src/upload-worker/book-source/document';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types';
import type { BookResultDetail } from '../src/upload-worker/book-results/types';
import {
  projectBookAttemptSourceContext,
} from '../../src/services/book-delivery/attemptSourceContextProjection.service';
import type {
  BookRuntimeAttemptRecord,
  BookRuntimeResultRecord,
} from '../../src/services/book-activity/activityRuntimeAttempt.types';
import { createBookRouter } from '../src/upload-worker/book-router';
import { canonicalBookRouteManifest } from '../src/upload-worker/book-routes/manifest';

const bindingId = `bd_${'a'.repeat(40)}`;
const routeKey = `${bindingId}-4-component-a-source-version-4`;
const bytes = Uint8Array.from({ length: 16 }, (_, index) => index);
const source = {
  bookId: 'book-1',
  sourceVersionId: 'source-version-4',
  storageLocationId: 'location-historical',
  providerKind: 'backblaze-b2-s3' as const,
  privateBucketId: 'private-bucket',
  providerObjectKey: 'private/book-1/source-version-4.pdf',
  providerFileId: 'file-historical',
  providerFileVersionId: 'file-version-historical',
  checksum: {
    algorithm: 'sha-256' as const,
    value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
  byteSize: bytes.length,
  provider: 'b2' as const,
  bucket: 'book-source',
  objectKey: 'private/book-1/source-version-4.pdf',
};

const binding: BookDeliveryBinding = {
  schemaVersion: 3,
  bindingId,
  revision: 4,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 4,
    publicationId: 'publication-4',
    publicationRevision: 4,
    publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: ['node-1'], placementIds: ['placement-1'] },
  outline: [],
  context: {
    kind: 'homework',
    contextId: 'homework-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'component_pdfs',
    sources: [{
      sourceKey: 'component-a',
      sourceVersionId: 'source-version-4',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'pages', pages: [7] },
    }],
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-3',
    activityVersion: 3,
    nodeKey: 'node-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['page-group-1'],
    sourcePageScopes: [{ sourceKey: 'component-a', pages: [7] }],
  }],
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-07-30T00:00:00.000Z',
};

const detail = {
  bookId: 'book-1',
  studentId: 'student-1',
  resultId: 'result-1',
  attemptId: 'attempt-1',
  bindingId,
  bindingRevision: 4,
  attemptSourceContext: {
    schemaVersion: 1,
    state: 'available',
    metadata: {
      attemptId: 'attempt-1',
      resultId: 'result-1',
      bookId: 'book-1',
      studentId: 'student-1',
      surface: 'homework',
      contextId: 'homework-1',
      ownerId: 'teacher-1',
      componentId: 'component-a',
      sourceKey: 'component-a',
      sourceVersionId: 'source-version-4',
      physicalPageNumber: 7,
      pageGroupId: 'page-group-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-3',
      activityVersion: 3,
      interactionFocusId: 'interaction-1',
      correspondence: 'source-assisted',
    },
    documentResource: {
      sourceKey: 'component-a',
      sourceVersionId: 'source-version-4',
      opaqueRouteKey: routeKey,
      localPageScope: { kind: 'pages', pages: [7] },
    },
  },
} as unknown as BookResultDetail;

const runtime = (
  profile: 'student' | 'teacher' = 'student',
  availability: 'available' | 'deleted' | 'revoked' = 'available',
): BookSourceDocumentRuntime => ({
  repository: {
    readBinding: vi.fn(async () => ({
      binding,
      recordRevision: 1,
      status: 'active',
      createdAt: binding.createdAt,
      updatedAt: binding.createdAt,
    })),
    resolveCurrent: vi.fn(),
  } as BookSourceDocumentRuntime['repository'],
  provider: {
    readObjectMetadata: vi.fn(async () => ({ identity: source, contentType: 'application/pdf' as const })),
    readBounded: vi.fn(async ({ range }) => ({
      bytes: bytes.slice(range.offset, range.offset + range.length),
      totalByteSize: bytes.length,
      offset: range.offset,
    })),
  },
  readProfile: vi.fn(async () => ({ role: profile, status: 'active' })),
  readCurrentAuthority: vi.fn(),
  readResultDetail: vi.fn(async () => detail),
  readHomeworkAuthority: vi.fn(async () => ({
    homeworkId: 'homework-1',
    ownerId: 'teacher-1',
    studentIds: ['student-1'],
    status: 'current',
  })),
  readHistoricalSource: vi.fn(async () => ({
    availability,
    source: availability === 'available' ? source : null,
  })),
});

const invoke = async (
  selectedRuntime: BookSourceDocumentRuntime,
  uid = 'student-1',
  params: Record<string, string> = {},
) => createBookHistoricalAttemptDocumentDeliveryHandler({
  runtimeFactory: () => selectedRuntime,
})({
  request: new Request(
    `https://worker.test/v1/book-delivery/historical-document/book-1/student-1/result-1/${routeKey}`,
    { method: 'GET' },
  ),
  env: {},
  uid,
  params: {
    bookId: 'book-1',
    studentId: 'student-1',
    resultId: 'result-1',
    opaqueRouteKey: routeKey,
    ...params,
  },
  descriptor: {} as never,
}) as Promise<Response>;

describe('historical attempt document byte route', () => {
  it('carries real immutable projection through the canonical contributor to exact bytes only', async () => {
    const terminalAttempt: BookRuntimeAttemptRecord = {
      schemaVersion: 1,
      attemptId: 'attempt-1',
      bindingId,
      bindingRevision: 4,
      recipientId: 'student-1',
      contextId: 'homework-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: 3,
      interactionId: 'interaction-1',
      activityVersionId: 'activity-version-3',
      acknowledgedDraftRevision: 1,
      attemptNumber: 1,
      pageGroupKeys: ['page-group-1'],
      sourceProvenance: [{
        sourceKey: 'component-a',
        sourceVersionId: 'source-version-4',
        pages: [7],
      }],
      feedbackRelease: 'pending',
      response: { value: 'preserved-answer' },
      createdByOperationId: 'operation-1',
      createdAt: '2026-07-31T00:00:00.000Z',
    };
    const terminalResult: BookRuntimeResultRecord = {
      schemaVersion: 1,
      resultId: 'result-1',
      attemptId: terminalAttempt.attemptId,
      bindingId,
      bindingRevision: 4,
      recipientId: 'student-1',
      contextId: 'homework-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: 3,
      interactionId: 'interaction-1',
      activityVersionId: 'activity-version-3',
      acknowledgedDraftRevision: 1,
      attemptNumber: 1,
      pageGroupKeys: ['page-group-1'],
      sourceProvenance: terminalAttempt.sourceProvenance,
      feedbackRelease: 'pending',
      status: 'submitted',
      createdByOperationId: 'operation-1',
      createdAt: '2026-07-31T00:00:00.000Z',
    };
    const project = (sourceVersionId: string) => projectBookAttemptSourceContext({
      attempt: terminalAttempt,
      result: terminalResult,
      historicalDelivery: {
        binding,
        recordRevision: 1,
        status: 'active',
        createdAt: binding.createdAt,
        updatedAt: binding.createdAt,
      },
      sources: [{
        sourceKey: 'component-a',
        sourceVersionId,
        availability: 'available',
        documentRequest: {
          sourceKey: 'component-a',
          sourceVersionId,
          opaqueRouteKey: routeKey,
          localPageScope: { kind: 'pages', pages: [7] },
        },
      }],
    });
    let selectedProjection = project('source-version-4');
    const selectedRuntime: BookSourceDocumentRuntime = {
      ...runtime(),
      readResultDetail: vi.fn(async () => ({
        ...detail,
        attemptSourceContext: selectedProjection,
      })),
    };
    const handler = createBookHistoricalAttemptDocumentDeliveryHandler({
      runtimeFactory: () => selectedRuntime,
    });
    const historicalRoute = canonicalBookRouteManifest.find(
      (candidate) => candidate.id === 'book.document-delivery.serve-historical-attempt-document',
    )!;
    const router = createBookRouter({
      manifest: [historicalRoute],
      handlers: { serveHistoricalAttemptDocument: handler },
      firebaseVerifier: {
        verifyAuthorizationHeader: () => ({ valid: true, uid: 'student-1' }),
      },
    });
    const env = {
      BOOK_HISTORICAL_DOCUMENT_ROUTES_ENABLED: 'enabled',
      BOOK_DELIVERY_SERVICE_IDENTITY: 'ticket80-test@invalid.example',
      BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'ticket80-test@invalid.example',
        private_key: 'test-only-noncredential',
      }),
      BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    };
    const request = (resultId = 'result-1') => new Request(
      `https://worker.test/v1/book-delivery/historical-document`
        + `/book-1/student-1/${resultId}/${routeKey}`,
      { headers: { authorization: 'Bearer verified-by-test' } },
    );

    const available = await router.fetch(request(), env);
    expect(available?.status).toBe(200);
    expect(new Uint8Array(await available!.arrayBuffer())).toEqual(bytes);

    vi.mocked(selectedRuntime.provider.readBounded).mockClear();
    selectedProjection = project('source-version-current');
    const unavailable = await router.fetch(request(), env);
    expect(unavailable?.status).toBe(404);
    expect(await unavailable?.json()).toEqual({ code: 'historical_source_unavailable' });
    expect(selectedRuntime.provider.readBounded).not.toHaveBeenCalled();

    const neighboring = await router.fetch(request('result-neighbor'), env);
    expect(neighboring?.status).toBe(404);
    expect(selectedRuntime.provider.readBounded).not.toHaveBeenCalled();
    expect(selectedRuntime.repository.resolveCurrent).not.toHaveBeenCalled();
  });

  it('streams exact historical bytes for the owning student', async () => {
    const selectedRuntime = runtime();
    const response = await invoke(selectedRuntime);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(selectedRuntime.repository.resolveCurrent).not.toHaveBeenCalled();
    expect(selectedRuntime.readHistoricalSource).toHaveBeenCalledWith({
      binding,
      sourceVersionId: 'source-version-4',
    });
  });

  it('streams exact historical bytes for the current owning Homework teacher', async () => {
    const response = await invoke(runtime('teacher'), 'teacher-1');
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it.each(['deleted', 'revoked'] as const)(
    'denies %s historical bytes without calling the provider',
    async (availability) => {
      const selectedRuntime = runtime('student', availability);
      const response = await invoke(selectedRuntime);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'historical_source_unavailable' });
      expect(selectedRuntime.provider.readObjectMetadata).not.toHaveBeenCalled();
      expect(selectedRuntime.provider.readBounded).not.toHaveBeenCalled();
    },
  );

  it('denies copied or crafted result/source routes before byte access', async () => {
    const copied = runtime();
    expect((await invoke(copied, 'student-1', { resultId: 'result-copied' })).status).toBe(404);
    expect(copied.provider.readBounded).not.toHaveBeenCalled();

    const crafted = runtime();
    expect((await invoke(crafted, 'student-1', { opaqueRouteKey: `${routeKey}-neighbor` })).status)
      .toBe(403);
    expect(crafted.provider.readBounded).not.toHaveBeenCalled();

    const crossScoped = runtime();
    vi.mocked(crossScoped.repository.readBinding).mockResolvedValue({
      binding: {
        ...binding,
        recipient: { recipientId: 'student-neighbor', recipientKind: 'student' },
        context: {
          ...binding.context,
          recipientId: 'student-neighbor',
        },
      },
      recordRevision: 1,
      status: 'active',
      createdAt: binding.createdAt,
      updatedAt: binding.createdAt,
    });
    expect((await invoke(crossScoped)).status).toBe(403);
    expect(crossScoped.provider.readBounded).not.toHaveBeenCalled();
  });
});
