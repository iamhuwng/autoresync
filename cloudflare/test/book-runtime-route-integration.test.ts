import { describe, expect, it } from 'vitest';
import { createBookRouter } from '../src/upload-worker/book-router.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import { createBookRuntimeWorkerHandlers } from '../src/upload-worker/book-runtime/worker.ts';
import { InMemoryBookRuntimeRepository } from '../src/upload-worker/book-runtime/repository.ts';
import {
  BOOK_DELIVERY_SCHEMA_VERSION,
  type BookDeliveryBinding,
} from '../../src/services/book-delivery/bookDelivery.types.ts';

const operationId = '00000000-0000-4000-8000-000000000074';

const normalizedActivity = () => ({
  schemaVersion: 1 as const,
  title: 'Runtime activity',
  taskProfile: null,
  presentationMode: 'structured' as const,
  contextRequirement: { mode: 'required' as const, acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Answer.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'text-entry' as const, variant: 'generic' },
  answerRule: { defaultPoints: 1, normalization: 'exact' as const },
  scoring: { mode: 'auto-where-possible' as const },
  interactions: [{
    family: 'text-entry' as const,
    interactionId: 'interaction-1',
    prompt: 'Answer',
    itemIdentities: { family: 'text-entry' as const, itemIds: [] as const },
    answerKey: { family: 'text-entry' as const, acceptedAnswers: ['draft'] },
  }],
});

const binding = (): BookDeliveryBinding => ({
  schemaVersion: BOOK_DELIVERY_SCHEMA_VERSION,
  bindingId: 'binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  context: {
    kind: 'solo',
    contextId: 'context-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    entitlementBasis: 'solo',
  },
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
    activityVersionId: 'activity-1-v1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['group-1'],
    sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'solo', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-07-27T00:00:00.000Z',
});

const command = () => ({
  operationId,
  commandKind: 'autosave',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextId: 'context-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  clientRevision: 0,
  response: { text: 'draft' },
});

const env = {
  BOOK_RUNTIME_ROUTES_ENABLED: 'enabled',
  BOOK_RUNTIME_SERVICE_IDENTITY: 'book-runtime@test.iam.gserviceaccount.com',
  BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({
    client_email: 'book-runtime@test.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nredacted\n-----END PRIVATE KEY-----',
  }),
  BOOK_ROUTE_RATE_LIMITER: { limit: () => ({ success: true }) },
};

describe('Ticket 28A runtime route integration', () => {
  it('routes authenticated student runtime command through the canonical dispatcher seam', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const handlers = createBookRouteHandlers({
      runtimeHandlers: createBookRuntimeWorkerHandlers({
        repository,
        resolveBinding: async () => binding(),
        resolveActivity: async () => normalizedActivity(),
        now: () => '2026-07-27T00:00:00.000Z',
      }),
    });
    const router = createBookRouter({
      handlers,
      firebaseVerifier: {
        verifyAuthorizationHeader: () => ({ valid: true, uid: 'student-1' }),
      },
    });
    const response = await router.fetch(new Request('https://worker.test/book-runtime/commands', {
      method: 'POST',
      headers: {
        authorization: 'Bearer redacted',
        'content-type': 'application/json',
      },
      body: JSON.stringify(command()),
    }), env);

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      status: 'accepted',
      receipt: {
        operationId,
        bindingId: 'binding-1',
        draftRevision: 1,
      },
    });
  });

  it('keeps the route disabled and unavailable without approved gate or service identity', async () => {
    const router = createBookRouter({
      handlers: createBookRouteHandlers({ runtimeHandlers: { command: () => ({ ok: true }) } }),
      firebaseVerifier: {
        verifyAuthorizationHeader: () => ({ valid: true, uid: 'student-1' }),
      },
    });
    const response = await router.fetch(new Request('https://worker.test/book-runtime/commands', {
      method: 'POST',
      headers: { authorization: 'Bearer redacted', 'content-type': 'application/json' },
      body: JSON.stringify(command()),
    }), {
      BOOK_RUNTIME_ROUTES_ENABLED: 'disabled',
      BOOK_ROUTE_RATE_LIMITER: { limit: () => ({ success: true }) },
    });
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({ code: 'book_route_disabled' });
  });
});
