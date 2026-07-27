import { describe, expect, it } from 'vitest';
import {
  InMemoryBookRuntimeRepository,
} from '../src/upload-worker/book-runtime/repository.ts';
import type {
  BookRuntimeCommandPayload,
  BookRuntimeTrustedCommandContext,
} from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';

const binding = (): BookDeliveryBinding => ({
  schemaVersion: 2,
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
  scope: { kind: 'placements', nodeKeys: ['unit-1'], placementIds: ['placement-1'] },
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

const context = (): BookRuntimeTrustedCommandContext => ({
  actorUid: 'student-1',
  operationKind: 'autosave',
  binding: binding(),
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  now: '2026-07-27T00:00:00.000Z',
});

const command = (overrides: Partial<BookRuntimeCommandPayload> = {}): BookRuntimeCommandPayload => ({
  operationId: '00000000-0000-4000-8000-000000000074',
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
  ...overrides,
});

describe('Ticket 28A runtime repository', () => {
  it('performs CAS draft write, conflict, and exact idempotent replay', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    await expect(repository.applyCommand({
      command: command(),
      context: context(),
      attemptId: 'attempt-1',
    })).resolves.toMatchObject({
      status: 'accepted',
      draft: { revision: 1, updatedByOperationId: command().operationId },
      receipt: { draftRevision: 1 },
    });
    await expect(repository.applyCommand({
      command: command(),
      context: context(),
      attemptId: 'attempt-1',
    })).resolves.toMatchObject({ status: 'replayed' });
    await expect(repository.applyCommand({
      command: command({
        operationId: '00000000-0000-4000-8000-000000000075',
        clientRevision: 0,
        response: { text: 'stale' },
      }),
      context: { ...context(), now: '2026-07-27T00:01:00.000Z' },
      attemptId: 'attempt-2',
    })).resolves.toMatchObject({ status: 'conflict' });
  });

  it('appends immutable attempts/results and supports bounded indexed reads', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000076',
      }),
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-1',
    })).resolves.toMatchObject({
      status: 'accepted',
      attempt: { attemptId: 'attempt-1', createdByOperationId: '00000000-0000-4000-8000-000000000076' },
      result: { resultId: 'attempt-1:result', status: 'pending_review' },
    });
    await expect(repository.listAttempts({
      recipientId: 'student-1',
      contextId: 'context-1',
      placementId: 'placement-1',
      limit: 5,
    })).resolves.toHaveLength(1);
    await expect(repository.listAttempts({
      recipientId: 'student-1',
      contextId: 'context-1',
      limit: 500,
    })).rejects.toMatchObject({ code: 'runtime_attempt_query_unbounded' });
  });
});
