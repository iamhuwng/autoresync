import { describe, expect, it, vi } from 'vitest';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import {
  createBookRuntimeCanonicalHandlers,
  type BookRuntimeCanonicalDependencies,
} from '../src/upload-worker/book-runtime/canonical.ts';
import type { BookRuntimeRepository } from '../src/upload-worker/book-runtime/repository.ts';

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
  schemaVersion: 3,
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
  outline: [],
  context: {
    contextId: 'context-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    kind: 'solo',
    entitlementBasis: 'solo',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'source-1',
      sourceVersionId: 'source-version-1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: [],
    sourcePageScopes: [{ sourceKey: 'source-1', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-07-30T00:00:00.000Z',
});

const repository = (): BookRuntimeRepository => ({
  readDraft: vi.fn(async () => null),
  applyCommand: vi.fn(async () => ({
    status: 'accepted' as const,
    receipt: {
      operationId: '00000000-0000-4000-8000-000000000059',
      status: 'accepted' as const,
      bindingId: 'binding-1',
      draftRevision: 1,
      createdAt: '2026-07-30T00:00:00.000Z',
    },
  })),
  listAttempts: vi.fn(async () => []),
});

const dependencies = (runtimeRepository: BookRuntimeRepository): BookRuntimeCanonicalDependencies => ({
  repository: runtimeRepository,
  resolveBinding: vi.fn(async ({ bindingId, recipientId, contextId }) => (
    bindingId === 'binding-1' && recipientId === 'student-1' && contextId === 'context-1'
      ? binding()
      : null
  )),
  schedulePolicy: { authorize: () => ({ outcome: 'allowed' }) },
  resolveActivity: async () => normalizedActivity(),
});

const env = {
  BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
  BOOK_RUNTIME_GOOGLE_SA_KEY: '{}',
  BOOK_DELIVERY_SERVICE_IDENTITY: 'delivery@example.test',
  BOOK_DELIVERY_GOOGLE_SA_KEY: '{}',
  FIREBASE_DB_URL: 'https://database.example.test',
};

describe('Ticket #59 canonical Book Runtime composition', () => {
  it('registers runtime handlers through the default route composition', () => {
    const handlers = createBookRouteHandlers();
    expect(typeof handlers['bookRuntime.command']).toBe('function');
    expect(typeof handlers['bookRuntime.readDraft']).toBe('function');
  });

  it('injects the durable runtime repository and current Delivery binding resolver', async () => {
    const runtimeRepository = repository();
    const resolveBinding = vi.fn(async () => binding());
    const handlers = createBookRuntimeCanonicalHandlers({
      createDependencies: () => ({
        repository: runtimeRepository,
        resolveBinding,
        schedulePolicy: { authorize: () => ({ outcome: 'allowed' }) },
        resolveActivity: async () => normalizedActivity(),
      }),
    });

    const result = await handlers.command({
      request: new Request('https://worker.test/book-runtime/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId: '00000000-0000-4000-8000-000000000059',
          commandKind: 'autosave',
          bindingId: 'binding-1',
          bindingRevision: 1,
          contextId: 'context-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersion: 1,
          interactionId: 'interaction-1',
          clientRevision: 0,
          response: 'draft',
        }),
      }),
      env,
      uid: 'student-1',
    });

    expect(result).toMatchObject({ init: { status: 200 } });
    expect(runtimeRepository.applyCommand).toHaveBeenCalledOnce();
    expect(resolveBinding).toHaveBeenCalledWith(expect.objectContaining({
      bindingId: 'binding-1',
      recipientId: 'student-1',
      contextId: 'context-1',
    }));
  });

  it('fails closed when production repository credentials are absent', async () => {
    const handlers = createBookRuntimeCanonicalHandlers();
    const result = await handlers.command({
      request: new Request('https://worker.test/book-runtime/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      env: {},
      uid: 'student-1',
    });
    expect(result).toEqual({
      body: { code: 'book_runtime_dependencies_unavailable' },
      init: { status: 503 },
    });
  });
});
