import { describe, expect, it, vi } from 'vitest';
import {
  createBookRuntimeWorkerHandlers,
} from '../src/upload-worker/book-runtime/worker.ts';
import {
  InMemoryBookRuntimeRepository,
} from '../src/upload-worker/book-runtime/repository.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';

const operationId = '00000000-0000-4000-8000-000000000074';

const binding = (recipientId = 'student-1'): BookDeliveryBinding => ({
  schemaVersion: 2,
  bindingId: 'binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId, recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: ['unit-1'], placementIds: ['placement-1'] },
  context: {
    kind: 'solo',
    contextId: 'context-1',
    recipientId,
    ownerId: 'teacher-1',
    entitlementBasis: 'solo',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full',
      sourceVersionId: 'source-v1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'pages', pages: [1] },
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
  schedulePolicy: { policyId: 'solo', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-07-27T00:00:00.000Z',
});

const body = (override: Record<string, unknown> = {}) => ({
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
  ...override,
});

const request = (value: unknown) => new Request('https://worker.test/book-runtime/commands', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

const parse = async (result: Awaited<ReturnType<ReturnType<typeof createBookRuntimeWorkerHandlers>['command']>>) => ({
  status: result.init.status,
  body: result.body,
});

describe('Ticket 28A runtime Worker boundary', () => {
  it('revalidates binding, writes through repository, and returns privacy-safe receipt only', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const resolveBinding = vi.fn(async () => binding());
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding,
      now: () => '2026-07-27T00:00:00.000Z',
      allocateAttemptId: () => 'attempt-1',
    });

    await expect(parse(await handlers.command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    }))).resolves.toEqual({
      status: 200,
      body: {
        status: 'accepted',
        receipt: {
          operationId,
          status: 'accepted',
          bindingId: 'binding-1',
          draftRevision: 1,
          attemptId: undefined,
          createdAt: '2026-07-27T00:00:00.000Z',
        },
      },
    });
    expect(resolveBinding).toHaveBeenCalledWith(expect.objectContaining({
      bindingId: 'binding-1',
      recipientId: 'student-1',
      contextId: 'context-1',
    }));
  });

  it('denies malformed command, disabled actor, and cross-user binding without repository mutation', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding('student-2'),
      readActor: async () => ({ uid: 'student-1', disabled: false }),
    });
    await expect(parse(await handlers.command({
      request: request({ ...body(), extra: true }),
      env: {},
      uid: 'student-1',
    }))).resolves.toMatchObject({
      status: 400,
      body: { code: 'runtime_command_unknown_field' },
    });
    await expect(parse(await createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      readActor: async () => ({ uid: 'student-1', disabled: true }),
    }).command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    }))).resolves.toMatchObject({
      status: 401,
      body: { code: 'runtime_actor_denied' },
    });
    await expect(parse(await handlers.command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    }))).resolves.toMatchObject({
      status: 403,
      body: { code: 'runtime_recipient_forbidden' },
    });
    expect(repository.snapshot()).toMatchObject({ drafts: {}, attempts: {}, operations: {} });
  });
});
