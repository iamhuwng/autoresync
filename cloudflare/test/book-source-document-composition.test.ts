import { describe, expect, it, vi } from 'vitest';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository';
import {
  createBookDeliveryProjectionResolver,
} from '../../src/services/book-delivery/bookDelivery.service';
import type {
  BookDeliveryBinding,
} from '../../src/services/book-delivery/bookDelivery.types';
import type {
  BookDocumentAuthorizedSource,
  LiveBookDocumentAuthority,
} from '../src/upload-worker/book-delivery/documentAuthorization';
import {
  createBookRouteHandlers,
} from '../src/upload-worker/book-route-handlers';
import { createBookRouter } from '../src/upload-worker/book-router';
import {
  deriveRevokedBookSourceVersionIds,
  isBookHomeworkDocumentScheduleOpen,
} from '../src/upload-worker/book-source/document';
import {
  makeBookDeliveryTestBinding,
} from './book-delivery.fixture';

const operation = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const canonicalBindingId = `bd_${'a'.repeat(40)}`;

const studentBinding = (): BookDeliveryBinding => {
  const binding = structuredClone(makeBookDeliveryTestBinding()) as BookDeliveryBinding;
  return {
    ...binding,
    bindingId: canonicalBindingId,
    status: 'draft',
    recipient: { recipientId: 'student-1', recipientKind: 'student' },
    context: {
      kind: 'solo',
      contextId: 'solo-1',
      recipientId: 'student-1',
      ownerId: binding.issuer.ownerId,
      entitlementBasis: 'solo',
    },
  };
};

const readyRepository = async () => {
  const repository = new InMemoryBookDeliveryRepository();
  await repository.createDraft({
    binding: studentBinding(),
    operationId: operation(1),
    now: '2026-07-30T00:00:00.000Z',
  });
  await repository.activate({
    bindingId: canonicalBindingId,
    expectedRecordRevision: 0,
    operationId: operation(2),
    now: '2026-07-30T00:01:00.000Z',
  });
  return repository;
};

const sourceLocation = (): BookDocumentAuthorizedSource => ({
  bookId: 'book-pdf-1',
  sourceVersionId: 'source-v1',
  storageLocationId: 'b2-book-primary',
  providerKind: 'backblaze-b2-s3',
  privateBucketId: 'bucket-id',
  providerObjectKey: 'book-source/source-v1.pdf',
  providerFileId: '4_zprovider-version',
  providerFileVersionId: '4_zprovider-version',
  checksum: {
    algorithm: 'sha-256',
    value: 'a'.repeat(64),
  },
  byteSize: 578,
  provider: 'b2',
  bucket: 'bookpdf',
  objectKey: 'book-source/source-v1.pdf',
});

const liveAuthority = (
  overrides: Partial<LiveBookDocumentAuthority> = {},
): LiveBookDocumentAuthority => ({
  publicationStatus: 'published',
  scheduleOpen: true,
  sourceVersionIds: ['source-v1'],
  revokedSourceVersionIds: [],
  sourceLocations: [sourceLocation()],
  ...overrides,
});

const handlerInput = (
  opaqueRouteKey: string,
  uid = 'student-1',
  method = 'HEAD',
) => ({
  request: new Request(
    `https://worker.test/v1/book-delivery/document/${encodeURIComponent(opaqueRouteKey)}`,
    {
      method,
      headers: { origin: 'http://localhost:5174' },
    },
  ),
  env: {},
  uid,
  params: { opaqueRouteKey },
  descriptor: {} as never,
});

describe('Ticket #49 canonical source document composition', () => {
  it('fails closed with a stable configuration error when the disabled preview is not provisioned', async () => {
    const response = await createBookRouteHandlers().serveAuthorizedDocument!(
      handlerInput(`${canonicalBindingId}-1-full-source-v1`),
    ) as Response;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'document_configuration_unavailable' });
  });

  it('resolves a canonical projection route by indexed binding and invokes #51/#52', async () => {
    const repository = await readyRepository();
    const projection = await createBookDeliveryProjectionResolver({ repository }).resolve({
      recipientId: 'student-1',
      contextId: 'solo-1',
      actor: { uid: 'student-1' },
    });
    const readObjectMetadata = vi.fn(async ({ identity }) => ({
      identity,
      contentType: 'application/pdf' as const,
    }));
    const readBounded = vi.fn();
    const handlers = createBookRouteHandlers({
      sourceDocument: {
        runtimeFactory: () => ({
          repository,
          provider: { readObjectMetadata, readBounded },
          readProfile: async () => ({ role: 'student', status: 'active' }),
          readCurrentAuthority: async () => liveAuthority(),
        }),
      },
    });

    const response = await handlers.serveAuthorizedDocument!(
      handlerInput(projection.documentRequests[0]!.opaqueRouteKey),
    ) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-length')).toBe('578');
    expect(readObjectMetadata).toHaveBeenCalledTimes(1);
    expect(readBounded).not.toHaveBeenCalled();
  });

  it('denies noncanonical, copied-user, and stale-source routes before B2 access', async () => {
    const repository = await readyRepository();
    const projection = await createBookDeliveryProjectionResolver({ repository }).resolve({
      recipientId: 'student-1',
      contextId: 'solo-1',
      actor: { uid: 'student-1' },
    });
    const readObjectMetadata = vi.fn();
    const readBounded = vi.fn();
    const authority = vi.fn(async () => liveAuthority());
    const handlers = createBookRouteHandlers({
      sourceDocument: {
        runtimeFactory: () => ({
          repository,
          provider: { readObjectMetadata, readBounded },
          readProfile: async () => ({ role: 'student', status: 'active' }),
          readCurrentAuthority: authority,
        }),
      },
    });

    const malformed = await handlers.serveAuthorizedDocument!(
      handlerInput('binding-worker-1-full-source-v1'),
    ) as Response;
    expect(malformed.status).toBe(404);

    const copied = await handlers.serveAuthorizedDocument!(
      handlerInput(projection.documentRequests[0]!.opaqueRouteKey, 'student-2'),
    ) as Response;
    expect(copied.status).toBe(401);

    authority.mockResolvedValueOnce(liveAuthority({ sourceLocations: [] }));
    const stale = await handlers.serveAuthorizedDocument!(
      handlerInput(projection.documentRequests[0]!.opaqueRouteKey),
    ) as Response;
    expect(stale.status).toBe(409);

    expect(readObjectMetadata).not.toHaveBeenCalled();
    expect(readBounded).not.toHaveBeenCalled();
  });

  it('checks the active student profile before any Delivery lookup', async () => {
    const repository = await readyRepository();
    const readBinding = vi.spyOn(repository, 'readBinding');
    const resolveCurrent = vi.spyOn(repository, 'resolveCurrent');
    const provider = {
      readObjectMetadata: vi.fn(),
      readBounded: vi.fn(),
    };
    const handlers = createBookRouteHandlers({
      sourceDocument: {
        runtimeFactory: () => ({
          repository,
          provider,
          readProfile: async () => ({ role: 'student', status: 'disabled' }),
          readCurrentAuthority: async () => liveAuthority(),
        }),
      },
    });

    const response = await handlers.serveAuthorizedDocument!(
      handlerInput(`${canonicalBindingId}-1-full-source-v1`),
    ) as Response;

    expect(response.status).toBe(403);
    expect(readBinding).not.toHaveBeenCalled();
    expect(resolveCurrent).not.toHaveBeenCalled();
    expect(provider.readObjectMetadata).not.toHaveBeenCalled();
  });

  it('reaches the composed handler only after canonical auth and gate checks', async () => {
    const handler = vi.fn(async () => new Response('ok', {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-length': '2' },
    }));
    const router = createBookRouter({
      firebaseVerifier: {
        verifyAuthorizationHeader: async (authorization) => (
          authorization === 'Bearer student-token'
            ? { valid: true, uid: 'student-1' }
            : { valid: false }
        ),
      },
      routeHandlers: { documentHandler: handler },
    });
    const env = {
      BOOK_DOCUMENT_DELIVERY_ROUTES_ENABLED: 'enabled',
      BOOK_DELIVERY_SERVICE_IDENTITY: 'book-delivery-runtime@temp-a1437.iam.gserviceaccount.com',
      BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'book-delivery-runtime@temp-a1437.iam.gserviceaccount.com',
        private_key: 'test-only',
      }),
      BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    };
    const route = `/v1/book-delivery/document/${encodeURIComponent(
      `${canonicalBindingId}-1-full-source-v1`,
    )}`;
    const denied = await router.fetch(new Request(`https://worker.test${route}`, {
      method: 'HEAD',
      headers: { origin: 'http://localhost:5174' },
    }), env);
    expect(denied?.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();

    const allowed = await router.fetch(new Request(`https://worker.test${route}`, {
      method: 'HEAD',
      headers: {
        origin: 'http://localhost:5174',
        authorization: 'Bearer student-token',
      },
    }), env);
    expect(allowed?.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].params.opaqueRouteKey).toBe(
      `${canonicalBindingId}-1-full-source-v1`,
    );
  });

  it('derives revoked source versions from cleanup and release operations', () => {
    const revoked = deriveRevokedBookSourceVersionIds({
      cleanup: { sourceVersionId: 'source-v1', status: 'cleanup_pending' },
      released: { sourceVersionId: 'source-v2', status: 'released' },
      active: { sourceVersionId: 'source-v3', status: 'verified_completed' },
    } as never, ['source-v1', 'source-v2', 'source-v3', 'source-v4']);
    expect(revoked).toEqual(['source-v1', 'source-v2']);
  });

  it('requires every descendant in a homework subtree to be released', () => {
    const binding = {
      ...studentBinding(),
      context: {
        kind: 'homework',
        contextId: 'homework-1',
        recipientId: 'student-1',
        ownerId: 'teacher-1',
        entitlementBasis: 'assignment',
      },
      scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
      outline: [
        {
          nodeKey: 'unit-1',
          parentNodeKey: null,
          nodeType: 'unit',
          order: 1,
        },
        {
          nodeKey: 'activity-container-1',
          parentNodeKey: 'unit-1',
          nodeType: 'section',
          order: 1,
        },
      ],
    } as BookDeliveryBinding;
    const authority = {
      assignmentId: 'homework-1',
      ownerId: 'teacher-1',
      visibility: { status: 'committed' },
      saga: { state: 'committed' },
      bookManifest: {
        bindingRevision: 1,
        book: {
          bookId: 'book-pdf-1',
          bookRevision: 3,
          publicationId: 'publication-1',
          publicationRevision: 4,
        },
        context: { contextId: 'homework-1', recipientId: 'student-1' },
        outline: binding.outline,
      },
      schedule: {
        availableFrom: '2026-07-30T00:00:00.000Z',
        finalDueAt: '2026-08-01T00:00:00.000Z',
        scheduleRules: [{
          nodeKey: 'activity-container-1',
          availableFrom: '2026-07-31T00:00:00.000Z',
        }],
      },
    } as never;

    expect(isBookHomeworkDocumentScheduleOpen(
      binding,
      authority,
      new Date('2026-07-30T12:00:00.000Z'),
    )).toBe(false);
    expect(isBookHomeworkDocumentScheduleOpen(
      binding,
      authority,
      new Date('2026-07-31T12:00:00.000Z'),
    )).toBe(true);
  });
});
