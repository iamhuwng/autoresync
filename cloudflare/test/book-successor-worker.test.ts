import { describe, expect, it } from 'vitest';
import fragment from '../src/upload-worker/book-rules/fragments/20A.json';
import { createBookSuccessorWorkerHandlers } from '../src/upload-worker/book-rules/successor/worker.ts';
import type {
  BookSuccessorRepository,
  BookSuccessorRoot,
  BookSuccessorTransaction,
} from '../src/upload-worker/book-rules/successor/repository.ts';
import { FirebaseRestBookSuccessorRepository } from '../src/upload-worker/book-rules/successor/repository.ts';

const NOW = '2026-07-25T00:00:00.000Z';
const NEXT = '2026-07-25T00:01:00.000Z';
const operation = (n: string): string => `00000000-0000-4000-8000-0000000000${n}`;
const book = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  bookId: 'book-original',
  ownerId: 'teacher-1',
  title: 'Grammar Book',
  subtitle: 'Safe metadata',
  authors: ['Author'],
  publisher: 'Publisher',
  edition: '2',
  series: 'Series',
  isbn: '123',
  coverUrl: 'https://example.test/cover.png',
  primaryTestTypeId: 'ielts',
  testTypeIds: ['ielts'],
  tags: ['grammar'],
  description: 'Description',
  visibility: 'private',
  status: 'draft-in-progress',
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  ...overrides,
});

const repository = (initial: BookSuccessorRoot = {}): {
  repository: BookSuccessorRepository;
  state: BookSuccessorRoot;
} => {
  let state = structuredClone(initial);
  return {
    repository: {
      async readValue(path: string): Promise<unknown> {
        const uid = path.split('/').at(-1);
        return uid === 'teacher-1' || uid === 'teacher-2'
          ? { uid, role: 'teacher' }
          : null;
      },
      async transaction<T>(
        mutate: (current: BookSuccessorRoot) => BookSuccessorTransaction<T>,
        options: { beforeWrite?: () => Promise<void> } = {},
      ): Promise<T> {
        const mutation = mutate(structuredClone(state));
        if (mutation.write) {
          await options.beforeWrite?.();
          state = structuredClone(mutation.next ?? {});
        }
        return mutation.outcome;
      },
    },
    get state() { return state; },
  };
};

const request = (body: unknown, operationId?: string): Request => new Request('https://worker.test', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(operationId ? { 'Idempotency-Key': operationId } : {}),
  },
  body: JSON.stringify(body),
});

const worker = (state: BookSuccessorRoot, createBookId = () => 'book-successor') => {
  const current = repository(state);
  return {
    handlers: createBookSuccessorWorkerHandlers({
      repository: current.repository,
      now: () => NEXT,
      createBookId,
    }),
    get state() { return current.state; },
  };
};

describe('20A trusted Book successor Worker', () => {
  it('requires key identity to match dedicated successor service identity even with injected token provider', () => {
    expect(() => new FirebaseRestBookSuccessorRepository({
      env: { BOOK_SUCCESSOR_SERVICE_IDENTITY: 'successor@example.test' },
      getAccessToken: async () => 'token-from-somewhere-else',
    })).toThrow('missing_book_successor_google_sa_key');
    expect(() => new FirebaseRestBookSuccessorRepository({
      env: {
        BOOK_SUCCESSOR_SERVICE_IDENTITY: 'successor@example.test',
        BOOK_SUCCESSOR_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'other@example.test' }),
      },
      getAccessToken: async () => 'token',
    })).toThrow('book_successor_service_identity_mismatch');
    expect(() => new FirebaseRestBookSuccessorRepository({
      env: {
        BOOK_SUCCESSOR_SERVICE_IDENTITY: 'successor@example.test',
        BOOK_SUCCESSOR_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'successor@example.test' }),
      },
      getAccessToken: async () => 'token',
    })).not.toThrow();
  });

  it('creates materials to pdf successor with legacy default, safe metadata, explicit refs, and unchanged predecessor', async () => {
    const original = book();
    const current = worker({
      books: { 'book-original': original },
      book_nodes: {
        'book-original': {
          'node-1': {
            title: 'must stay',
            materialRefs: [{
              materialKind: 'interactive-activity',
              materialId: 'activity-1',
              snapshotVersionId: 'version-1',
              availability: 'available',
              ownerIdSnapshot: 'teacher-1',
            }],
          },
        },
      },
      material_summary_indexes: {
        v1: {
          by_id: {
            'activity-1': {
              materialId: 'activity-1',
              activityId: 'activity-1',
              materialKind: 'interactive-activity',
              ownerId: 'teacher-1',
              lifecycleState: 'published',
              publishedVersionId: 'version-1',
            },
          },
        },
      },
      sources: { 'book-original': { source: 'must stay' } },
    });
    const before = structuredClone(current.state);
    const result = await current.handlers.create({
      request: request({
        predecessorBookId: 'book-original', expectedUpdatedAt: NOW, targetMode: 'pdf', reason: 'Need PDF assembly',
        activityRefs: [{ activityId: 'activity-1', versionId: 'version-1' }], operationId: operation('01'),
      }, operation('01')),
      env: {}, verifiedUid: 'teacher-1',
    });

    expect(result.init.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'created', predecessorUpdatedAt: NOW });
    expect(current.state.books?.['book-original']).toEqual(before.books?.['book-original']);
    expect(current.state.book_nodes).toEqual(before.book_nodes);
    expect(current.state.sources).toEqual(before.sources);
    expect(current.state.books?.['book-successor']).toMatchObject({
      bookMode: 'pdf', ownerId: 'teacher-1', title: 'Grammar Book', status: 'draft-empty', visibility: 'private',
      reusedActivityRefs: [{ activityId: 'activity-1', versionId: 'version-1' }],
      modeSuccessorLineage: {
        kind: 'mode-successor', predecessorBookId: 'book-original', fromMode: 'materials', toMode: 'pdf',
        reason: 'Need PDF assembly', actorId: 'teacher-1', createdAt: NEXT,
      },
    });
    expect(current.state.books?.['book-successor']).not.toHaveProperty('book_nodes');
    expect(current.state.books?.['book-successor']).not.toHaveProperty('sourceStrategy');
    expect(current.state.books?.['book-successor']).not.toHaveProperty('mappings');
    expect(current.state).toMatchObject({
      book_indexes: {
        by_owner: {
          'teacher-1': {
            'book-successor': { bookId: 'book-successor', bookMode: 'pdf' },
          },
        },
      },
      material_summary_indexes: {
        v1: {
          by_id: {
            'book-successor': { materialId: 'book-successor', materialKind: 'book' },
          },
        },
      },
    });
    expect(current.state).not.toHaveProperty('material_catalog');
  });

  it('rejects Activity reuse unless an exact available predecessor placement and published version exist', async () => {
    const operationId = operation('14');
    const base = {
      books: { 'book-original': book() },
      book_nodes: {
        'book-original': {
          'node-1': {
            materialRefs: [{
              materialKind: 'interactive-activity',
              materialId: 'activity-1',
              snapshotVersionId: 'version-1',
              availability: 'available',
              ownerIdSnapshot: 'teacher-1',
            }],
          },
        },
      },
      material_summary_indexes: {
        v1: {
          by_id: {
            'activity-1': {
              materialId: 'activity-1',
              activityId: 'activity-1',
              materialKind: 'interactive-activity',
              ownerId: 'teacher-1',
              lifecycleState: 'published',
              publishedVersionId: 'version-1',
            },
          },
        },
      },
    };
    const command = {
      predecessorBookId: 'book-original',
      expectedUpdatedAt: NOW,
      targetMode: 'pdf',
      reason: 'Reuse selected Activity',
      activityRefs: [{ activityId: 'activity-1', versionId: 'version-1' }],
      operationId,
    };
    const mutations = [
      { ...base, book_nodes: {} },
      {
        ...base,
        material_summary_indexes: {
          v1: {
            by_id: {
              'activity-1': {
                ...base.material_summary_indexes.v1.by_id['activity-1'],
                publishedVersionId: 'version-2',
              },
            },
          },
        },
      },
      {
        ...base,
        material_summary_indexes: {
          v1: {
            by_id: {
              'activity-1': {
                ...base.material_summary_indexes.v1.by_id['activity-1'],
                lifecycleState: 'draft',
              },
            },
          },
        },
      },
    ];

    for (const initial of mutations) {
      const current = worker(initial);
      const before = structuredClone(current.state);
      await expect(current.handlers.create({
        request: request(command, operationId),
        env: {},
        verifiedUid: 'teacher-1',
      })).resolves.toMatchObject({
        init: { status: 409 },
        body: { code: 'activity_ref_not_reusable' },
      });
      expect(current.state).toEqual(before);
    }
  });

  it('supports pdf to materials without copying PDF/source fields or changing published predecessor', async () => {
    const current = worker({ books: {
      'book-original': book({
        bookMode: 'pdf', visibility: 'public-library-published', status: 'ready',
        sourceStrategy: 'full_pdf', sourceVersionId: 'source-1', mappings: { page: 1 },
      }),
    } });
    const before = structuredClone(current.state.books?.['book-original']);
    const result = await current.handlers.create({
      request: request(
        { predecessorBookId: 'book-original', expectedUpdatedAt: NOW, targetMode: 'materials', reason: 'Use materials editor', operationId: operation('02') },
        operation('02'),
      ),
      env: {}, verifiedUid: 'teacher-1',
    });
    expect(result.body).toMatchObject({ status: 'created', successor: { bookMode: 'materials' } });
    expect(current.state.books?.['book-original']).toEqual(before);
    expect(current.state.books?.['book-successor']).not.toHaveProperty('sourceStrategy');
    expect(current.state.books?.['book-successor']).not.toHaveProperty('sourceVersionId');
    expect(current.state.books?.['book-successor']).not.toHaveProperty('mappings');
  });

  it('rejects malformed/ancestor-shaped, same-mode, cross-owner, and stale commands before mutation', async () => {
    const current = worker({ books: { 'book-original': book() } });
    const base = { predecessorBookId: 'book-original', expectedUpdatedAt: NOW, targetMode: 'pdf', reason: 'reason', operationId: operation('03') };
    await expect(current.handlers.create({ request: request({ ...base, extra: true }, base.operationId), env: {}, verifiedUid: 'teacher-1' })).resolves.toMatchObject({ init: { status: 400 }, body: { code: 'invalid_request' } });
    await expect(current.handlers.create({ request: request({ ...base, targetMode: 'materials', operationId: operation('04') }, operation('04')), env: {}, verifiedUid: 'teacher-1' })).resolves.toMatchObject({ init: { status: 409 }, body: { code: 'same_mode' } });
    await expect(current.handlers.create({ request: request({ ...base, operationId: operation('05') }, operation('05')), env: {}, verifiedUid: 'teacher-2' })).resolves.toMatchObject({ init: { status: 403 }, body: { code: 'forbidden' } });
    await expect(current.handlers.create({ request: request({ ...base, operationId: operation('06') }, operation('06')), env: {} })).resolves.toMatchObject({ init: { status: 400 }, body: { code: 'invalid_verified_uid' } });
    await expect(current.handlers.create({ request: request({ ...base, expectedUpdatedAt: NEXT, operationId: operation('07') }, operation('07')), env: {}, verifiedUid: 'teacher-1' })).resolves.toMatchObject({ init: { status: 409 }, body: { code: 'stale' } });
    expect(current.state.books).toEqual({ 'book-original': expect.anything() });
  });

  it('fails closed on unsafe persisted metadata before any indexed path can be written', async () => {
    for (const unsafeTestTypeId of ['../../users/teacher-1', 'constructor', '__proto__']) {
      const current = worker({ books: {
        'book-original': book({ testTypeIds: [unsafeTestTypeId] }),
      } });
      const command = {
        predecessorBookId: 'book-original',
        expectedUpdatedAt: NOW,
        targetMode: 'pdf',
        reason: 'reason',
        operationId: operation('11'),
      };
      const before = structuredClone(current.state);
      await expect(current.handlers.create({
        request: request(command, command.operationId),
        env: {},
        verifiedUid: 'teacher-1',
      })).resolves.toMatchObject({ init: { status: 500 }, body: { code: 'book_successor_failed' } });
      expect(current.state).toEqual(before);
    }
  });

  it('replays exact UUID operation, rejects conflicting replay and ID collision', async () => {
    const current = worker({ books: { 'book-original': book() } });
    const command = { predecessorBookId: 'book-original', expectedUpdatedAt: NOW, targetMode: 'pdf', reason: 'same', operationId: operation('08') };
    const first = await current.handlers.create({ request: request(command, command.operationId), env: {}, verifiedUid: 'teacher-1' });
    const replay = await current.handlers.create({ request: request(command, command.operationId), env: {}, verifiedUid: 'teacher-1' });
    expect(first.body).toMatchObject({ status: 'created' });
    expect(replay.body).toMatchObject({ status: 'replayed', successor: (first.body as Record<string, unknown>).successor });
    await expect(current.handlers.create({ request: request({ ...command, reason: 'different' }, command.operationId), env: {}, verifiedUid: 'teacher-1' })).resolves.toMatchObject({ init: { status: 409 }, body: { code: 'idempotency-conflict' } });

    const collision = worker({ books: { 'book-original': book(), 'book-successor': book({ bookId: 'book-successor' }) } });
    await expect(collision.handlers.create({ request: request({ ...command, operationId: operation('09') }, operation('09')), env: {}, verifiedUid: 'teacher-1' })).resolves.toMatchObject({ init: { status: 409 }, body: { code: 'id-collision' } });
  });

  it('archives only an unpublished successor and keeps predecessor unchanged', async () => {
    const current = worker({ books: { 'book-original': book(), 'book-successor': {
      bookId: 'book-successor', ownerId: 'teacher-1', title: 'Successor', bookMode: 'pdf', visibility: 'private', status: 'draft-empty',
      authors: [], testTypeIds: ['ielts'], tags: [], createdAt: NOW, createdBy: 'teacher-1', updatedBy: 'teacher-1',
      updatedAt: NEXT, modeSuccessorLineage: {
        kind: 'mode-successor', predecessorBookId: 'book-original', fromMode: 'materials', toMode: 'pdf', reason: 'reason', actorId: 'teacher-1', createdAt: NOW,
      },
    } } });
    const predecessor = structuredClone(current.state.books?.['book-original']);
    const result = await current.handlers.archive({
      request: request(
        { successorBookId: 'book-successor', expectedUpdatedAt: NEXT, operationId: operation('10') },
        operation('10'),
      ),
      env: {}, verifiedUid: 'teacher-1',
    });
    expect(result.body).toEqual({ status: 'archived', successorBookId: 'book-successor' });
    expect(current.state.books?.['book-successor']).toMatchObject({ status: 'archived', updatedAt: NEXT });
    expect(current.state.books?.['book-original']).toEqual(predecessor);
  });

  it('rejects archive after successor leaves private draft lifecycle', async () => {
    for (const successor of [
      book({
        bookId: 'book-successor',
        bookMode: 'pdf',
        visibility: 'public-library-pending-review',
        status: 'draft-in-progress',
        updatedAt: NEXT,
        modeSuccessorLineage: {
          kind: 'mode-successor', predecessorBookId: 'book-original', fromMode: 'materials',
          toMode: 'pdf', reason: 'reason', actorId: 'teacher-1', createdAt: NOW,
        },
      }),
      book({
        bookId: 'book-successor',
        bookMode: 'pdf',
        visibility: 'private',
        status: 'ready',
        updatedAt: NEXT,
        modeSuccessorLineage: {
          kind: 'mode-successor', predecessorBookId: 'book-original', fromMode: 'materials',
          toMode: 'pdf', reason: 'reason', actorId: 'teacher-1', createdAt: NOW,
        },
      }),
    ]) {
      const current = worker({ books: { 'book-original': book(), 'book-successor': successor } });
      const command = {
        successorBookId: 'book-successor',
        expectedUpdatedAt: NEXT,
        operationId: operation('12'),
      };
      await expect(current.handlers.archive({
        request: request(command, command.operationId),
        env: {},
        verifiedUid: 'teacher-1',
      })).resolves.toMatchObject({ init: { status: 409 }, body: { code: 'successor-not-draft' } });
      expect(current.state.books?.['book-successor']).toEqual(successor);
    }
  });

  it('rejects archive when successor lineage is malformed', async () => {
    const current = worker({ books: {
      'book-original': book(),
      'book-successor': book({
        bookId: 'book-successor',
        bookMode: 'pdf',
        status: 'draft-empty',
        updatedAt: NEXT,
        modeSuccessorLineage: {
          kind: 'mode-successor',
          predecessorBookId: 'book-original',
          fromMode: 'pdf',
          toMode: 'pdf',
          reason: 'reason',
          actorId: 'teacher-1',
          createdAt: NOW,
        },
      }),
    } });
    const command = {
      successorBookId: 'book-successor',
      expectedUpdatedAt: NEXT,
      operationId: operation('13'),
    };
    await expect(current.handlers.archive({
      request: request(command, command.operationId),
      env: {},
      verifiedUid: 'teacher-1',
    })).resolves.toMatchObject({ init: { status: 409 }, body: { code: 'successor-not-draft' } });
  });

  it('denies browser ancestor writes and grants only scoped trusted service writes in fragment', () => {
    expect(fragment.owner).toMatchObject({ ticketId: '20A', issue: 69, serviceIdentity: 'material_book_successor_service' });
    const rootDeny = fragment.operations.find((entry) => entry.path === 'material_catalog/books' && entry.rule === '.write');
    const bookWrite = fragment.operations.find((entry) => entry.path === 'material_catalog/books/$bookId' && entry.rule === '.write');
    expect(rootDeny?.expression).toBe('false');
    expect(bookWrite?.expression).toContain("auth.token.material_book_successor_service == true");
    expect(bookWrite?.expression).toContain("!data.exists()");
    expect(bookWrite?.expression).toContain("newData.child('modeSuccessorLineage')");
    expect(bookWrite?.expression).toContain("child('fromMode').val() == 'materials'");
    expect(bookWrite?.expression).toContain("child('actorId').val() == newData.child('ownerId').val()");
    expect(fragment.operations.filter((entry) => entry.expression === 'false').map((entry) => entry.path)).toEqual(expect.arrayContaining([
      'material_catalog/books', 'material_catalog/book_successor_operations',
    ]));
  });
});
