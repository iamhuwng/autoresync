import { describe, expect, it } from 'vitest';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository';
import { createBookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.entitlementFactory';
import { createBookDeliveryWorkerHandlers } from '../src/upload-worker/book-delivery/worker';

const operation = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const makeBookDeliveryTestBinding = () => createBookDeliveryBinding({
  bindingId: 'binding-worker',
  revision: 1,
  status: 'draft',
  recipient: { recipientId: 'teacher-1', recipientKind: 'preview-user' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  context: {
    kind: 'preview',
    contextId: 'preview-1',
    recipientId: 'teacher-1',
    ownerId: 'teacher-1',
    entitlementBasis: 'preview',
  },
  publication: {
    bookId: 'book-pdf-1',
    bookMode: 'pdf',
    bookRevision: 3,
    publicationId: 'publication-1',
    publicationRevision: 4,
    publicationStatus: 'published',
    ownerId: 'teacher-1',
    scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
    sourceSet: {
      strategy: 'full_pdf',
      sources: [{
        sourceKey: 'full',
        sourceVersionId: 'source-v1',
        lifecycle: 'verified-usable',
        localPageScope: { kind: 'all', pages: [] },
      }],
    },
    placements: [{
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: 1,
      nodeKey: 'unit-1',
      order: 1,
      contextMode: 'required',
      sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
    }],
    schedulePolicy: { policyId: 'schedule-1', policyRevision: 1, basis: 'immutable-reference' },
  },
  createdAt: '2026-07-25T00:00:00.000Z',
});

const env = {
  BOOK_DELIVERY_SERVICE_IDENTITY: 'book-delivery@example.iam.gserviceaccount.com',
  readDatabaseValue: async () => ({ role: 'teacher' }),
} as any;

describe('Book Delivery Worker contract', () => {
  it('allows only the trusted owner to create and activate', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const handlers = createBookDeliveryWorkerHandlers({ repository: repository as any, now: () => '2026-07-25T00:00:00.000Z' });
    const create = await handlers.create({
      env,
      uid: 'teacher-1',
      request: new Request('https://worker.test/book-delivery/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ binding: makeBookDeliveryTestBinding(), operationId: operation(1) }),
      }),
    });
    expect(create.init.status).toBe(200);
    const activate = await handlers.activate({
      env,
      uid: 'teacher-1',
      request: new Request('https://worker.test/book-delivery/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bindingId: 'binding-worker', expectedRecordRevision: 0, operationId: operation(2) }),
      }),
    });
    expect(activate.init.status).toBe(200);
    const resolved = await handlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    const resolvedAgain = await handlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    expect(resolved.init.status).toBe(200);
    expect(resolvedAgain).toEqual(resolved);
    expect(resolved.body).toMatchObject({
      projectionKind: 'book-runtime-delivery',
      bindingId: 'binding-worker',
      recipientId: 'teacher-1',
      book: {
        publicationId: 'publication-1',
        publicationStatus: 'published',
      },
      provenance: {
        publicationId: 'publication-1',
        publicationRevision: 4,
        bindingId: 'binding-worker',
        bindingRevision: 1,
      },
    });
    expect(JSON.stringify(resolved.body)).not.toMatch(/answerKey|teacherNotes|objectKey|credentials|providerAuthority|private/iu);
  });

  it('denies forged issuer ownership and future-live payloads', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const handlers = createBookDeliveryWorkerHandlers({ repository: repository as any });
    const forged = structuredClone(makeBookDeliveryTestBinding()) as any;
    forged.issuer.ownerId = 'other-owner';
    const denied = await handlers.create({
      env,
      uid: 'teacher-1',
      request: new Request('https://worker.test/book-delivery/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ binding: forged, operationId: operation(3) }),
      }),
    });
    expect(denied.init.status).toBe(403);
    const future = structuredClone(makeBookDeliveryTestBinding()) as any;
    future.context = { ...future.context, kind: 'future_live', entitlementBasis: 'reserved' };
    const rejected = await handlers.create({
      env,
      uid: 'teacher-1',
      request: new Request('https://worker.test/book-delivery/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ binding: future, operationId: operation(4) }),
      }),
    });
    expect(rejected.init.status).toBe(400);
  });

  it('bounds payloads and rejects malformed recipient/context authority', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const handlers = createBookDeliveryWorkerHandlers({ repository: repository as any });
    const oversized = await handlers.create({
      env,
      uid: 'teacher-1',
      request: new Request('https://worker.test/book-delivery/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(300 * 1024) },
        body: JSON.stringify({ binding: makeBookDeliveryTestBinding(), operationId: operation(5) }),
      }),
    });
    expect(oversized.init.status).toBe(413);
    const malformed = structuredClone(makeBookDeliveryTestBinding()) as any;
    malformed.recipient.recipientId = 'other-student';
    const rejected = await handlers.create({
      env,
      uid: 'teacher-1',
      request: new Request('https://worker.test/book-delivery/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ binding: malformed, operationId: operation(6) }),
      }),
    });
    expect(rejected.init.status).toBe(400);
  });

  it('fails closed when resolving cross-recipient or missing delivery projection', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const handlers = createBookDeliveryWorkerHandlers({ repository: repository as any, now: () => '2026-07-25T00:00:00.000Z' });
    await handlers.create({
      env,
      uid: 'teacher-1',
      request: new Request('https://worker.test/book-delivery/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ binding: makeBookDeliveryTestBinding(), operationId: operation(7) }),
      }),
    });
    await handlers.activate({
      env,
      uid: 'teacher-1',
      request: new Request('https://worker.test/book-delivery/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bindingId: 'binding-worker', expectedRecordRevision: 0, operationId: operation(8) }),
      }),
    });

    await expect(handlers.resolve({
      env,
      uid: 'other-student',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    })).resolves.toEqual({
      body: { code: 'book-delivery-forbidden' },
      init: { status: 403 },
    });
    await expect(handlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'missing-context',
    })).resolves.toEqual({
      body: { code: 'book-delivery-not-found' },
      init: { status: 404 },
    });
  });
});
