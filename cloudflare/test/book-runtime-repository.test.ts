import { describe, expect, it } from 'vitest';
import {
  FirebaseRestBookRuntimeRepository,
  InMemoryBookRuntimeRepository,
} from '../src/upload-worker/book-runtime/repository.ts';
import type {
  BookRuntimeCommandPayload,
  BookRuntimeTrustedCommandContext,
} from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import { vi } from 'vitest';

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

const createFirebaseFetch = (initial: Record<string, unknown> = {}) => {
  const values = new Map(Object.entries(initial));
  let version = 0;
  let rejectNextWrite = false;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname.replace(/^\/|\.json$/g, ''));
    if (init.method === 'PUT') {
      if (rejectNextWrite) {
        rejectNextWrite = false;
        return new Response('', { status: 412 });
      }
      if (init.headers && String(new Headers(init.headers).get('if-match')) !== `"v${version}"`) {
        return new Response('', { status: 412 });
      }
      values.set(path, JSON.parse(String(init.body)));
      version += 1;
      return new Response('', { status: 200 });
    }
    let body = values.get(path) ?? null;
    if (body === null) {
      const prefix = `${path}/`;
      const children: Record<string, unknown> = {};
      for (const [storedPath, storedValue] of values.entries()) {
        if (!storedPath.startsWith(prefix)) continue;
        const remainder = storedPath.slice(prefix.length);
        if (!remainder.includes('/')) children[remainder] = storedValue;
      }
      if (Object.keys(children).length > 0) body = children;
    }
    const headers = new Headers({ 'content-type': 'application/json' });
    if (new Headers(init.headers).get('X-Firebase-ETag')) headers.set('etag', `"v${version}"`);
    return new Response(JSON.stringify(body), { status: 200, headers });
  });
  return {
    fetchImpl,
    values,
    rejectNextWrite: () => { rejectNextWrite = true; },
  };
};

describe('Ticket 28A durable Firebase runtime repository', () => {
  it('persists draft, terminal records, completion, index, and replay through one scoped ETag aggregate', async () => {
    const firebase = createFirebaseFetch();
    const env = {
      FIREBASE_DB_URL: 'https://firebase.test',
      BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
    };
    const repository = new FirebaseRestBookRuntimeRepository({
      env,
      getAccessToken: async () => 'runtime-token',
      fetchImpl: firebase.fetchImpl,
    });

    await expect(repository.applyCommand({
      command: command(),
      context: context(),
      attemptId: 'attempt-durable',
    })).resolves.toMatchObject({
      status: 'accepted',
      draft: { revision: 1 },
    });

    const terminal = command({
      commandKind: 'submit',
      operationId: '00000000-0000-4000-8000-000000000076',
      clientRevision: 1,
    });
    const result = await repository.applyCommand({
      command: terminal,
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-durable',
    });
    expect(result).toMatchObject({
      status: 'accepted',
      attempt: { attemptId: 'attempt-durable' },
      result: { resultId: 'attempt-durable:result' },
      completion: { completionId: 'attempt-durable:completion', status: 'completed' },
      index: { attemptId: 'attempt-durable' },
    });

    const replay = await repository.applyCommand({
      command: terminal,
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-durable',
    });
    expect(replay.status).toBe('replayed');

    const persisted = [...firebase.values.values()].find((value) =>
      value && typeof value === 'object' && 'attempts' in value);
    expect(persisted).toMatchObject({
      attempts: { 'attempt-durable': { attemptId: 'attempt-durable' } },
      results: { 'attempt-durable:result': { attemptId: 'attempt-durable' } },
      completions: { 'attempt-durable:completion': { resultId: 'attempt-durable:result' } },
      indexes: { 'attempt-durable': { resultId: 'attempt-durable:result' } },
    });
    await expect(repository.readDraft({
      recipientId: 'student-1',
      contextId: 'context-1',
      placementId: 'placement-1',
      interactionId: 'interaction-1',
    })).resolves.toMatchObject({ revision: 1 });
    await expect(repository.listAttempts({
      recipientId: 'student-1',
      contextId: 'context-1',
      placementId: 'placement-1',
      limit: 5,
    })).resolves.toHaveLength(1);
  });

  it('retries a Firebase ETag conflict and denies a changed service identity before writing', async () => {
    const firebase = createFirebaseFetch();
    const env = {
      FIREBASE_DB_URL: 'https://firebase.test',
      BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
    };
    const repository = new FirebaseRestBookRuntimeRepository({
      env,
      getAccessToken: async () => 'runtime-token',
      fetchImpl: firebase.fetchImpl,
      maxRetries: 2,
    });
    firebase.rejectNextWrite();
    await expect(repository.applyCommand({
      command: command(),
      context: context(),
      attemptId: 'attempt-retry',
    })).resolves.toMatchObject({ status: 'accepted' });

    env.BOOK_RUNTIME_SERVICE_IDENTITY = 'wrong@example.test';
    await expect(repository.applyCommand({
      command: command({
        operationId: '00000000-0000-4000-8000-000000000077',
        clientRevision: 1,
      }),
      context: context(),
      attemptId: 'attempt-denied',
    })).rejects.toMatchObject({ code: 'runtime_service_identity_changed' });
  });

  it('rejects a service-account identity mismatch before constructing a durable client', () => {
    expect(() => new FirebaseRestBookRuntimeRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
        BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'other@example.test',
          private_key: 'not-used-in-this-test',
        }),
      },
      fetchImpl: fetch,
    })).toThrowError('runtime_service_identity_mismatch');
  });
});
