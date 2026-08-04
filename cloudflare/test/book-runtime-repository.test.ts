import { describe, expect, it } from 'vitest';
import {
  FirebaseRestBookRuntimeRepository,
  InMemoryBookRuntimeRepository,
} from '../src/upload-worker/book-runtime/repository.ts';
import type {
  BookRuntimeAttemptRecord,
  BookRuntimeAttemptIndexRecord,
  BookRuntimeCommandPayload,
  BookRuntimeCompletionRecord,
  BookRuntimeOperationReceipt,
  BookRuntimeResultRecord,
  BookRuntimeTrustedCommandContext,
} from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import { vi } from 'vitest';

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
  scope: { kind: 'placements', nodeKeys: ['unit-1'], placementIds: ['placement-1'] },
  outline: [],
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
    activityVersionId: 'activity-version-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['page-group-1'],
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

const terminalRecords = (
  attemptId: string,
  attemptNumber: number,
  operationId: string,
): {
  attempt: BookRuntimeAttemptRecord;
  result: BookRuntimeResultRecord;
  completion: BookRuntimeCompletionRecord;
  index: BookRuntimeAttemptIndexRecord;
  receipt: BookRuntimeOperationReceipt;
} => {
  const base = {
    bindingId: 'binding-1',
    bindingRevision: 1,
    recipientId: 'student-1',
    contextId: 'context-1',
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    activityVersionId: 'activity-version-1',
    interactionId: 'interaction-1',
    acknowledgedDraftRevision: 1,
    attemptNumber,
    pageGroupKeys: ['page-group-1'],
    createdByOperationId: operationId,
    createdAt: `2026-07-27T00:0${attemptNumber}:00.000Z`,
  } as const;
  const sourceProvenance = [{
    sourceKey: 'full',
    sourceVersionId: 'source-v1',
    pages: [1],
  }] as const;
  const resultId = `${attemptId}:result`;
  return {
    attempt: {
      schemaVersion: 1,
      attemptId,
      ...base,
      sourceProvenance,
      feedbackRelease: 'pending',
      response: { text: `attempt ${attemptNumber}` },
    },
    result: {
      schemaVersion: 1,
      resultId,
      attemptId,
      ...base,
      sourceProvenance,
      feedbackRelease: 'pending',
      status: 'pending_review',
    },
    completion: {
      schemaVersion: 1,
      completionId: `${attemptId}:completion`,
      attemptId,
      resultId,
      ...base,
      sourceProvenance,
      status: 'completed',
    },
    index: {
      schemaVersion: 1,
      attemptId,
      resultId,
      ...base,
    },
    receipt: {
      operationId,
      fingerprint: `fixture:${operationId}`,
      status: 'accepted',
      bindingId: 'binding-1',
      attemptId,
      attemptNumber,
      createdAt: base.createdAt,
    },
  };
};

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
    await expect(repository.applyCommand({
      command: command({
        operationId: '00000000-0000-4000-8000-000000000078',
        bindingRevision: 2,
        clientRevision: 1,
        response: { text: 'new binding' },
      }),
      context: {
        ...context(),
        binding: { ...binding(), revision: 2 },
        now: '2026-07-27T00:02:00.000Z',
      },
      attemptId: 'attempt-3',
    })).resolves.toMatchObject({ status: 'conflict' });
    expect(repository.snapshot().drafts).toMatchObject({
      'student-1/context-1/placement-1/interaction-1': {
        bindingRevision: 1,
        revision: 1,
        response: { text: 'draft' },
      },
    });
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
      attemptPolicy: { maxAttempts: 2 },
    })).resolves.toMatchObject({
      status: 'accepted',
      attempt: {
        attemptId: 'attempt-1',
        attemptNumber: 1,
        acknowledgedDraftRevision: 0,
        activityVersionId: 'activity-version-1',
        pageGroupKeys: ['page-group-1'],
        createdByOperationId: '00000000-0000-4000-8000-000000000076',
      },
      result: { resultId: 'attempt-1:result', status: 'pending_review' },
      receipt: { attemptNumber: 1 },
    });
    const firstSnapshot = repository.snapshot();
    const second = command({
      commandKind: 'submit',
      operationId: '00000000-0000-4000-8000-000000000077',
    });
    await expect(repository.applyCommand({
      command: second,
      context: { ...context(), operationKind: 'submit', now: '2026-07-27T00:01:00.000Z' },
      attemptId: 'attempt-2',
      attemptPolicy: { maxAttempts: 2 },
    })).resolves.toMatchObject({
      status: 'accepted',
      attempt: { attemptId: 'attempt-2', attemptNumber: 2 },
      receipt: { attemptNumber: 2 },
    });
    const afterSecond = repository.snapshot();
    expect(afterSecond.attempts?.['attempt-1']).toEqual(firstSnapshot.attempts?.['attempt-1']);
    expect(afterSecond.results?.['attempt-1:result']).toEqual(firstSnapshot.results?.['attempt-1:result']);
    expect(afterSecond.completions?.['attempt-1:completion'])
      .toEqual(firstSnapshot.completions?.['attempt-1:completion']);
    expect(afterSecond.indexes?.['attempt-1']).toEqual(firstSnapshot.indexes?.['attempt-1']);
    await expect(repository.applyCommand({
      command: second,
      context: { ...context(), operationKind: 'submit', now: '2026-07-27T00:01:00.000Z' },
      attemptId: 'attempt-2',
      attemptPolicy: { maxAttempts: 2 },
    })).resolves.toMatchObject({
      status: 'replayed',
      attempt: { attemptId: 'attempt-2', attemptNumber: 2 },
      receipt: { attemptNumber: 2 },
    });
    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000078',
      }),
      context: { ...context(), operationKind: 'submit', now: '2026-07-27T00:02:00.000Z' },
      attemptId: 'attempt-3',
      attemptPolicy: { maxAttempts: 2 },
    })).resolves.toMatchObject({ status: 'denied' });
    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000078',
      }),
      context: { ...context(), operationKind: 'submit', now: '2026-07-27T00:03:00.000Z' },
      attemptId: 'attempt-3',
      attemptPolicy: { maxAttempts: 3 },
    })).resolves.toMatchObject({ status: 'denied' });
    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000078',
        response: { text: 'conflicting reuse' },
      }),
      context: { ...context(), operationKind: 'submit', now: '2026-07-27T00:03:00.000Z' },
      attemptId: 'attempt-3',
      attemptPolicy: { maxAttempts: 3 },
    })).resolves.toMatchObject({ status: 'conflict' });
    await expect(repository.listAttempts({
      recipientId: 'student-1',
      contextId: 'context-1',
      placementId: 'placement-1',
      bindingId: 'binding-1',
      bindingRevision: 1,
      limit: 5,
    })).resolves.toHaveLength(2);
    await expect(repository.listAttempts({
      recipientId: 'student-1',
      contextId: 'context-1',
      limit: 500,
    })).rejects.toMatchObject({ code: 'runtime_attempt_query_unbounded' });
  });

  it('fails closed on a gapped persisted attempt sequence', async () => {
    const first = terminalRecords(
      'attempt-1',
      1,
      '00000000-0000-4000-8000-000000000071',
    );
    const third = terminalRecords(
      'attempt-3',
      3,
      '00000000-0000-4000-8000-000000000073',
    );
    const repository = new InMemoryBookRuntimeRepository({
      attempts: {
        'attempt-1': first.attempt,
        'attempt-3': third.attempt,
      },
      results: {
        'attempt-1:result': first.result,
        'attempt-3:result': third.result,
      },
      completions: {
        'attempt-1:completion': first.completion,
        'attempt-3:completion': third.completion,
      },
      indexes: {
        'attempt-1': first.index,
        'attempt-3': third.index,
      },
      operations: {
        [first.receipt.operationId]: first.receipt,
        [third.receipt.operationId]: third.receipt,
      },
    });

    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000079',
      }),
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-4',
      attemptPolicy: { maxAttempts: null },
    })).rejects.toMatchObject({ code: 'runtime_attempt_sequence_invalid' });
  });

  it('fails closed when an associated terminal row disagrees with its attempt number', async () => {
    const first = terminalRecords(
      'attempt-1',
      1,
      '00000000-0000-4000-8000-000000000071',
    );
    const repository = new InMemoryBookRuntimeRepository({
      attempts: { 'attempt-1': first.attempt },
      results: {
        'attempt-1:result': { ...first.result, attemptNumber: 2 },
      },
      completions: { 'attempt-1:completion': first.completion },
      indexes: { 'attempt-1': first.index },
      operations: { [first.receipt.operationId]: first.receipt },
    });

    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000079',
      }),
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-2',
      attemptPolicy: { maxAttempts: null },
    })).rejects.toMatchObject({ code: 'runtime_attempt_sequence_invalid' });
  });

  it('leaves terminal maps unchanged when protected operation capacity is exhausted', async () => {
    const operations = Object.fromEntries(Array.from({ length: 128 }, (_, index) => {
      const operationId = `protected-denial-${String(index).padStart(3, '0')}`;
      return [operationId, {
        operationId,
        fingerprint: `fixture-${index}`,
        status: 'denied' as const,
        bindingId: 'binding-1',
        createdAt: '2026-07-27T00:00:00.000Z',
      }];
    }));
    const repository = new InMemoryBookRuntimeRepository({ operations });
    const before = repository.snapshot();

    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000079',
      }),
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-capacity',
      attemptPolicy: { maxAttempts: null },
    })).rejects.toMatchObject({ code: 'runtime_operation_capacity_exceeded' });
    const after = repository.snapshot();
    expect(after.attempts).toEqual(before.attempts);
    expect(after.results).toEqual(before.results);
    expect(after.completions).toEqual(before.completions);
    expect(after.indexes).toEqual(before.indexes);
    expect(after.operations).toEqual(before.operations);
  });

  it.each(['none', 'optional'] as const)(
    'persists empty source provenance for a valid %s placement',
    async (contextMode) => {
      const emptyContextBinding: BookDeliveryBinding = {
        ...binding(),
        placements: [{
          ...binding().placements[0],
          contextMode,
          pageGroupKeys: [],
          sourcePageScopes: [],
        }],
      };
      const repository = new InMemoryBookRuntimeRepository();

      await expect(repository.applyCommand({
        command: command({
          commandKind: 'submit',
          operationId: '00000000-0000-4000-8000-000000000079',
        }),
        context: {
          ...context(),
          operationKind: 'submit',
          binding: emptyContextBinding,
        },
        attemptId: `attempt-${contextMode}`,
        attemptPolicy: { maxAttempts: 1 },
      })).resolves.toMatchObject({
        status: 'accepted',
        attempt: {
          activityVersionId: 'activity-version-1',
          pageGroupKeys: [],
          sourceProvenance: [],
        },
      });
    },
  );
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
        const segments = storedPath.slice(prefix.length).split('/');
        let cursor = children;
        for (const segment of segments.slice(0, -1)) {
          cursor[segment] = cursor[segment] ?? {};
          cursor = cursor[segment] as Record<string, unknown>;
        }
        cursor[segments.at(-1)!] = storedValue;
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
      draft: { bindingRevision: 1, revision: 1 },
    });
    await expect(repository.applyCommand({
      command: command({
        operationId: '00000000-0000-4000-8000-000000000079',
        bindingRevision: 2,
        clientRevision: 1,
      }),
      context: {
        ...context(),
        binding: { ...binding(), revision: 2 },
        now: '2026-07-27T00:00:30.000Z',
      },
      attemptId: 'attempt-stale-binding',
    })).resolves.toMatchObject({ status: 'conflict' });
    expect(firebase.values.get(
      'book_runtime/scopes/student-1/context-1/placement-1/interaction-1',
    )).toMatchObject({
      draft: { bindingRevision: 1, revision: 1 },
    });

    const terminal = command({
      commandKind: 'submit',
      operationId: '00000000-0000-4000-8000-000000000076',
      clientRevision: 1,
    });
    firebase.rejectNextWrite();
    const result = await repository.applyCommand({
      command: terminal,
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-durable',
      attemptPolicy: { maxAttempts: 2 },
    });
    expect(result).toMatchObject({
      status: 'accepted',
      attempt: {
        attemptId: 'attempt-durable',
        acknowledgedDraftRevision: 1,
        activityVersionId: 'activity-version-1',
        submissionScope: 'activity',
        requiredInteractionIds: ['interaction-1'],
        pageGroupKeys: ['page-group-1'],
      },
      result: { resultId: 'attempt-durable:result' },
      completion: { completionId: 'attempt-durable:completion', status: 'completed' },
      index: { attemptId: 'attempt-durable' },
    });

    const replay = await repository.applyCommand({
      command: terminal,
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-durable',
      attemptPolicy: { maxAttempts: 2 },
    });
    expect(replay.status).toBe('replayed');
    const firstTerminalSnapshot = structuredClone(firebase.values.get(
      'book_runtime/scopes/student-1/context-1/placement-1/interaction-1',
    )) as {
      attempts: Record<string, unknown>;
      results: Record<string, unknown>;
      completions: Record<string, unknown>;
      indexes: Record<string, unknown>;
    };

    const secondTerminal = command({
      commandKind: 'submit',
      operationId: '00000000-0000-4000-8000-000000000077',
      clientRevision: 1,
    });
    await expect(repository.applyCommand({
      command: secondTerminal,
      context: { ...context(), operationKind: 'submit', now: '2026-07-27T00:01:00.000Z' },
      attemptId: 'attempt-durable-2',
      attemptPolicy: { maxAttempts: 2 },
    })).resolves.toMatchObject({
      status: 'accepted',
      attempt: { attemptId: 'attempt-durable-2', attemptNumber: 2 },
      receipt: { attemptNumber: 2 },
    });
    await expect(repository.replayCommand({
      command: secondTerminal,
      actorUid: 'student-1',
    })).resolves.toMatchObject({
      status: 'replayed',
      attempt: { attemptId: 'attempt-durable-2', attemptNumber: 2 },
      receipt: { attemptNumber: 2 },
    });
    const afterSecondTerminal = firebase.values.get(
      'book_runtime/scopes/student-1/context-1/placement-1/interaction-1',
    ) as {
      attempts: Record<string, unknown>;
      results: Record<string, unknown>;
      completions: Record<string, unknown>;
      indexes: Record<string, unknown>;
    };
    expect(afterSecondTerminal.attempts['attempt-durable'])
      .toEqual(firstTerminalSnapshot.attempts['attempt-durable']);
    expect(afterSecondTerminal.results['attempt-durable:result'])
      .toEqual(firstTerminalSnapshot.results['attempt-durable:result']);
    expect(afterSecondTerminal.completions['attempt-durable:completion'])
      .toEqual(firstTerminalSnapshot.completions['attempt-durable:completion']);
    expect(afterSecondTerminal.indexes['attempt-durable'])
      .toEqual(firstTerminalSnapshot.indexes['attempt-durable']);
    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000078',
        clientRevision: 1,
      }),
      context: { ...context(), operationKind: 'submit', now: '2026-07-27T00:02:00.000Z' },
      attemptId: 'attempt-durable-3',
      attemptPolicy: { maxAttempts: 2 },
    })).resolves.toMatchObject({ status: 'denied' });
    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000078',
        clientRevision: 1,
      }),
      context: { ...context(), operationKind: 'submit', now: '2026-07-27T00:03:00.000Z' },
      attemptId: 'attempt-durable-3',
      attemptPolicy: { maxAttempts: 3 },
    })).resolves.toMatchObject({ status: 'denied' });
    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000078',
        clientRevision: 1,
        response: { text: 'conflicting durable reuse' },
      }),
      context: { ...context(), operationKind: 'submit', now: '2026-07-27T00:03:00.000Z' },
      attemptId: 'attempt-durable-3',
      attemptPolicy: { maxAttempts: 3 },
    })).resolves.toMatchObject({ status: 'conflict' });

    const persisted = [...firebase.values.values()].find((value) =>
      value && typeof value === 'object' && 'attempts' in value);
    expect(persisted).toMatchObject({
      attempts: {
        'attempt-durable': { attemptId: 'attempt-durable', attemptNumber: 1 },
        'attempt-durable-2': { attemptId: 'attempt-durable-2', attemptNumber: 2 },
      },
      results: {
        'attempt-durable:result': { attemptId: 'attempt-durable', attemptNumber: 1 },
        'attempt-durable-2:result': { attemptId: 'attempt-durable-2', attemptNumber: 2 },
      },
      completions: {
        'attempt-durable:completion': { resultId: 'attempt-durable:result', attemptNumber: 1 },
        'attempt-durable-2:completion': {
          resultId: 'attempt-durable-2:result',
          attemptNumber: 2,
        },
      },
      indexes: {
        'attempt-durable': { resultId: 'attempt-durable:result', attemptNumber: 1 },
        'attempt-durable-2': { resultId: 'attempt-durable-2:result', attemptNumber: 2 },
      },
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
      bindingId: 'binding-1',
      bindingRevision: 1,
      limit: 5,
    })).resolves.toHaveLength(2);
  });

  it('counts legacy sibling-scope attempts before allocating the canonical Activity anchor', async () => {
    const legacy = terminalRecords(
      'attempt-legacy',
      1,
      '00000000-0000-4000-8000-000000000071',
    );
    const withInteraction = <T extends { interactionId: string }>(record: T): T => ({
      ...record,
      interactionId: 'interaction-2',
    });
    const anchorPath = 'book_runtime/scopes/student-1/context-1/placement-1/interaction-1';
    const siblingPath = 'book_runtime/scopes/student-1/context-1/placement-1/interaction-2';
    const firebase = createFirebaseFetch({
      [anchorPath]: {
        draft: {
          schemaVersion: 1,
          bindingId: 'binding-1',
          bindingRevision: 1,
          recipientId: 'student-1',
          contextId: 'context-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersion: 1,
          interactionId: 'interaction-1',
          revision: 1,
          response: [
            { interactionId: 'interaction-1', answer: 'first' },
            { interactionId: 'interaction-2', answer: 'second' },
          ],
          updatedByOperationId: '00000000-0000-4000-8000-000000000070',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
      },
      [siblingPath]: {
        attempts: { 'attempt-legacy': withInteraction(legacy.attempt) },
        results: { 'attempt-legacy:result': withInteraction(legacy.result) },
        completions: { 'attempt-legacy:completion': withInteraction(legacy.completion) },
        indexes: { 'attempt-legacy': withInteraction(legacy.index) },
        operations: { [legacy.receipt.operationId]: legacy.receipt },
      },
    });
    const repository = new FirebaseRestBookRuntimeRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
      },
      getAccessToken: async () => 'runtime-token',
      fetchImpl: firebase.fetchImpl,
    });
    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000072',
        clientRevision: 1,
        response: [
          { interactionId: 'interaction-1', answer: 'first' },
          { interactionId: 'interaction-2', answer: 'second' },
        ],
      }),
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-anchor',
      attemptPolicy: { maxAttempts: 2 },
      activitySubmissionBoundary: {
        submissionScope: 'activity',
        requiredInteractionIds: ['interaction-1', 'interaction-2'],
        submittedInteractionIds: ['interaction-1', 'interaction-2'],
      },
    })).resolves.toMatchObject({
      status: 'accepted',
      attempt: { attemptId: 'attempt-anchor', attemptNumber: 2 },
    });
  });

  it('serializes concurrent durable operation-key reuse across interaction scopes', async () => {
    const firebase = createFirebaseFetch();
    const repository = new FirebaseRestBookRuntimeRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
      },
      getAccessToken: async () => 'runtime-token',
      fetchImpl: firebase.fetchImpl,
    });
    const outcomes = await Promise.all([
      repository.applyCommand({
        command: command(),
        context: context(),
        attemptId: 'attempt-first-scope',
      }),
      repository.applyCommand({
        command: command({
          interactionId: 'interaction-2',
          response: { text: 'different scope' },
        }),
        context: { ...context(), interactionId: 'interaction-2' },
        attemptId: 'attempt-second-scope',
      }),
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual(['accepted', 'conflict']);
    expect([
      'book_runtime/scopes/student-1/context-1/placement-1/interaction-1',
      'book_runtime/scopes/student-1/context-1/placement-1/interaction-2',
    ].filter((path) => firebase.values.has(path))).toHaveLength(1);
  });

  it('fails closed when a missing receipt collides with an immutable durable attempt id', async () => {
    const path = 'book_runtime/scopes/student-1/context-1/placement-1/interaction-1';
    const collision = terminalRecords(
      'attempt-collision',
      1,
      '00000000-0000-4000-8000-000000000071',
    );
    const firebase = createFirebaseFetch({
      [path]: {
        draft: {
          schemaVersion: 1,
          bindingId: 'binding-1',
          bindingRevision: 1,
          recipientId: 'student-1',
          contextId: 'context-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersion: 1,
          interactionId: 'interaction-1',
          revision: 1,
          response: { text: 'draft' },
          updatedByOperationId: '00000000-0000-4000-8000-000000000070',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
        attempts: {
          'attempt-collision': collision.attempt,
        },
        results: { 'attempt-collision:result': collision.result },
        completions: { 'attempt-collision:completion': collision.completion },
        indexes: { 'attempt-collision': collision.index },
        operations: { [collision.receipt.operationId]: collision.receipt },
      },
    });
    const repository = new FirebaseRestBookRuntimeRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
      },
      getAccessToken: async () => 'runtime-token',
      fetchImpl: firebase.fetchImpl,
    });

    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000079',
        clientRevision: 1,
      }),
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-collision',
      attemptPolicy: { maxAttempts: null },
    })).rejects.toMatchObject({ code: 'runtime_attempt_duplicate' });
  });

  it('retains terminal receipts while pruning old autosave receipts at the durable bound', async () => {
    const firebase = createFirebaseFetch();
    const path = 'book_runtime/scopes/student-1/context-1/placement-1/interaction-1';
    const repository = new FirebaseRestBookRuntimeRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
      },
      getAccessToken: async () => 'runtime-token',
      fetchImpl: firebase.fetchImpl,
    });
    await repository.applyCommand({
      command: command(),
      context: context(),
      attemptId: 'attempt-autosave',
    });
    const terminal = command({
      commandKind: 'submit',
      operationId: '00000000-0000-4000-8000-000000000076',
      clientRevision: 1,
    });
    await repository.applyCommand({
      command: terminal,
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-terminal',
      attemptPolicy: { maxAttempts: 2 },
    });

    const persisted = structuredClone(firebase.values.get(path)) as {
      operations: Record<string, BookRuntimeOperationReceipt>;
    };
    for (let index = 0; Object.keys(persisted.operations).length < 128; index += 1) {
      const operationId = `fixture-autosave-${String(index).padStart(3, '0')}`;
      persisted.operations[operationId] = {
        operationId,
        fingerprint: `fixture-${index}`,
        status: 'accepted',
        bindingId: 'binding-1',
        draftRevision: 1,
        createdAt: '2026-07-27T00:00:00.000Z',
      };
    }
    firebase.values.set(path, persisted);

    await expect(repository.applyCommand({
      command: command({
        operationId: '00000000-0000-4000-8000-000000000079',
        clientRevision: 1,
        response: { text: 'new draft' },
      }),
      context: context(),
      attemptId: 'attempt-unused',
    })).resolves.toMatchObject({ status: 'accepted' });
    await expect(repository.applyCommand({
      command: terminal,
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-terminal',
      attemptPolicy: { maxAttempts: 2 },
    })).resolves.toMatchObject({
      status: 'replayed',
      attempt: { attemptId: 'attempt-terminal', attemptNumber: 1 },
    });
    const after = firebase.values.get(path) as {
      operations: Record<string, BookRuntimeOperationReceipt>;
    };
    expect(Object.keys(after.operations)).toHaveLength(128);
    expect(after.operations[terminal.operationId]).toMatchObject({
      attemptId: 'attempt-terminal',
      attemptNumber: 1,
    });
  });

  it('fails closed on an orphan terminal row even when its embedded identity is forged', async () => {
    const path = 'book_runtime/scopes/student-1/context-1/placement-1/interaction-1';
    const orphan = terminalRecords(
      'attempt-orphan',
      1,
      '00000000-0000-4000-8000-000000000071',
    );
    const firebase = createFirebaseFetch({
      [path]: {
        draft: {
          schemaVersion: 1,
          bindingId: 'binding-1',
          bindingRevision: 1,
          recipientId: 'student-1',
          contextId: 'context-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersion: 1,
          interactionId: 'interaction-1',
          revision: 1,
          response: { text: 'draft' },
          updatedByOperationId: '00000000-0000-4000-8000-000000000070',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
        results: {
          'attempt-orphan:result': {
            ...orphan.result,
            activityId: 'forged-activity',
            interactionId: 'forged-interaction',
          },
        },
      },
    });
    const repository = new FirebaseRestBookRuntimeRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
      },
      getAccessToken: async () => 'runtime-token',
      fetchImpl: firebase.fetchImpl,
    });

    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000079',
        clientRevision: 1,
      }),
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-new',
      attemptPolicy: { maxAttempts: null },
    })).rejects.toMatchObject({ code: 'runtime_attempt_sequence_invalid' });
  });

  it('fails closed when complete durable terminal rows have lost their accepted receipt', async () => {
    const path = 'book_runtime/scopes/student-1/context-1/placement-1/interaction-1';
    const terminal = terminalRecords(
      'attempt-without-receipt',
      1,
      '00000000-0000-4000-8000-000000000071',
    );
    const firebase = createFirebaseFetch({
      [path]: {
        draft: {
          schemaVersion: 1,
          bindingId: 'binding-1',
          bindingRevision: 1,
          recipientId: 'student-1',
          contextId: 'context-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersion: 1,
          interactionId: 'interaction-1',
          revision: 1,
          response: { text: 'draft' },
          updatedByOperationId: '00000000-0000-4000-8000-000000000070',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
        attempts: { [terminal.attempt.attemptId]: terminal.attempt },
        results: { [terminal.result.resultId]: terminal.result },
        completions: { [terminal.completion.completionId]: terminal.completion },
        indexes: { [terminal.index.attemptId]: terminal.index },
      },
    });
    const repository = new FirebaseRestBookRuntimeRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
      },
      getAccessToken: async () => 'runtime-token',
      fetchImpl: firebase.fetchImpl,
    });
    const before = structuredClone(firebase.values.get(path));

    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000079',
        clientRevision: 1,
      }),
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-new',
      attemptPolicy: { maxAttempts: null },
    })).rejects.toMatchObject({ code: 'runtime_attempt_sequence_invalid' });
    expect(firebase.values.get(path)).toEqual(before);
  });

  it('fails closed when an accepted durable terminal receipt has lost its rows', async () => {
    const path = 'book_runtime/scopes/student-1/context-1/placement-1/interaction-1';
    const terminal = terminalRecords(
      'attempt-missing-rows',
      1,
      '00000000-0000-4000-8000-000000000071',
    );
    const firebase = createFirebaseFetch({
      [path]: {
        draft: {
          schemaVersion: 1,
          bindingId: 'binding-1',
          bindingRevision: 1,
          recipientId: 'student-1',
          contextId: 'context-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersion: 1,
          interactionId: 'interaction-1',
          revision: 1,
          response: { text: 'draft' },
          updatedByOperationId: '00000000-0000-4000-8000-000000000070',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
        operations: { [terminal.receipt.operationId]: terminal.receipt },
      },
    });
    const repository = new FirebaseRestBookRuntimeRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
      },
      getAccessToken: async () => 'runtime-token',
      fetchImpl: firebase.fetchImpl,
    });
    const before = structuredClone(firebase.values.get(path));

    await expect(repository.applyCommand({
      command: command({
        commandKind: 'submit',
        operationId: '00000000-0000-4000-8000-000000000079',
        clientRevision: 1,
      }),
      context: { ...context(), operationKind: 'submit' },
      attemptId: 'attempt-new',
      attemptPolicy: { maxAttempts: null },
    })).rejects.toMatchObject({ code: 'runtime_attempt_sequence_invalid' });
    expect(firebase.values.get(path)).toEqual(before);
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
