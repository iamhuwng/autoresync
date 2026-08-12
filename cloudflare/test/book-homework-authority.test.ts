import { describe, expect, it } from 'vitest';

import {
  BOOK_HOMEWORK_ASSIGNMENT_KIND,
  BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION,
  type BookHomeworkManifest,
} from '../../src/types/homework.types';
import type {
  BookHomeworkAuthoritySchedule,
  BookHomeworkCreateCommand,
  BookHomeworkStudentState,
} from '../../src/services/book-homework/bookHomeworkAuthority.types';
import {
  BookHomeworkAuthorityError,
  fingerprint,
} from '../src/upload-worker/book-homework/authority';
import {
  BookHomeworkAuthorityRepository,
  FirebaseRestBookHomeworkDocumentStore,
  InMemoryBookHomeworkDocumentStore,
  type BookHomeworkDocumentStore,
  type BookHomeworkStoredDocument,
} from '../src/upload-worker/book-homework/repository';

const createdAt = '2026-07-28T00:00:00.000Z';

const manifest: BookHomeworkManifest = {
  schemaVersion: BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION,
  assignmentKind: BOOK_HOMEWORK_ASSIGNMENT_KIND,
  manifestVersionId: 'manifest-1',
  ownerId: 'teacher-1',
  createdByCommandId: 'command-create',
  createdAt,
  bindingRevision: 1,
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 2,
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  context: {
    contextId: 'assignment-1',
    recipientId: 'student-1',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  selectedTarget: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' }],
  scheduleRules: [{ nodeKey: 'unit-1', dueAt: '2026-08-20T00:00:00.000Z' }],
  bindings: [{
    bindingId: 'binding-1',
    placementId: 'placement-1',
    activityId: 'activity-1',
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'none',
    pageGroupKeys: [],
    sourceReadiness: 'not-required',
    state: 'required',
    activityVersion: 1,
    activityVersionId: 'activity-version-1',
    sourceContext: [],
  }],
  completion: {
    aggregation: 'required-activities-submitted-over-required-activities',
    requiredBindingCount: 1,
    excludedBindingCount: 0,
    legacyScoreFields: 'untouched',
  },
};

const schedule = (dueAt = '2026-08-20T00:00:00.000Z'): BookHomeworkAuthoritySchedule => ({
  schemaVersion: 1,
  resolverVersion: 1,
  finalDueAt: '2026-08-30T00:00:00.000Z',
  scheduleRules: [{ nodeKey: 'unit-1', dueAt }],
});

const createCommand = (): BookHomeworkCreateCommand => ({
  assignmentId: 'assignment-1',
  ownerId: 'teacher-1',
  manifest,
  schedule: schedule(),
  activityPolicies: {
    'placement-1': {
      schemaVersion: 1,
      policyId: 'policy-1',
      policyRevision: 1,
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-1',
      activityVersion: 1,
      lateSubmissionAllowed: false,
      maxAttempts: 2,
    },
  },
  sagaId: 'saga-1',
  commandId: 'command-create',
  idempotencyKey: 'operation-create',
  expectedRevision: 0,
  createdAt,
});

const expectAuthorityError = async (promise: Promise<unknown>, code: BookHomeworkAuthorityError['code']) => {
  await expect(promise).rejects.toMatchObject({ code });
};

const createRepository = (
  states: readonly BookHomeworkStudentState[] = ['not-started'],
  store: BookHomeworkDocumentStore = new InMemoryBookHomeworkDocumentStore(),
) => new BookHomeworkAuthorityRepository(store, {
  resolveAffectedStudentStates: async () => states,
  resolveCommittedRoot: async (record) => record.saga.state === 'committed',
});

describe('Book Homework Firestore authority', () => {
  it('keeps prepared records invisible, commits through trusted CAS, and replays idempotently', async () => {
    const repository = createRepository();
    const created = await repository.create(createCommand());
    expect(created).toMatchObject({ status: 'created', revision: 1, visibility: 'prepared' });
    await expect(repository.readStudentProjection('assignment-1', 'student-1')).resolves.toBeNull();

    const committed = await repository.setVisibility({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', state: 'committed',
      commandId: 'command-commit', idempotencyKey: 'operation-commit', expectedRevision: 1,
      updatedAt: '2026-07-28T00:01:00.000Z',
    });
    expect(committed).toMatchObject({ status: 'committed', revision: 2, visibility: 'committed' });
    await expect(repository.readStudentProjection('assignment-1', 'student-1')).resolves.toMatchObject({
      assignmentId: 'assignment-1',
      bookManifest: { manifestVersionId: 'manifest-1' },
    });

    await expect(repository.create(createCommand())).resolves.toMatchObject({ status: 'replayed', revision: 1 });
    await expectAuthorityError(repository.setVisibility({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', state: 'committed',
      commandId: 'command-other', idempotencyKey: 'operation-create', expectedRevision: 2,
      updatedAt: '2026-07-28T00:02:00.000Z',
    }), 'idempotency-conflict');
  });

  it('rejects a policy snapshot that does not match the frozen Activity Version', async () => {
    const current = createCommand();
    const policy = current.activityPolicies['placement-1']!;
    await expect(createRepository().create({
      ...current,
      activityPolicies: {
        'placement-1': { ...policy, activityVersionId: 'forged-version' },
      },
    })).rejects.toMatchObject({ code: 'invalid-record' });
  });

  it('requires policy snapshots on new records', async () => {
    await expect(createRepository().create({
      ...createCommand(),
      activityPolicies: undefined,
    } as unknown as BookHomeworkCreateCommand)).rejects.toMatchObject({ code: 'invalid-command' });
  });

  it('enforces owner, revision, immutable manifest, and started-student deadline gates', async () => {
    const repository = createRepository(['in-progress']);
    await repository.create(createCommand());

    await expectAuthorityError(repository.updateSchedule({
      assignmentId: 'assignment-1', ownerId: 'teacher-2', schedule: schedule('2026-08-21T00:00:00.000Z'),
      changedNodeKey: 'unit-1', commandId: 'command-owner', idempotencyKey: 'operation-owner', expectedRevision: 1,
      updatedAt: '2026-07-28T00:01:00.000Z',
    }), 'owner-mismatch');

    await expectAuthorityError(repository.updateSchedule({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', schedule: schedule('2026-08-21T00:00:00.000Z'),
      changedNodeKey: 'unit-1', commandId: 'command-stale', idempotencyKey: 'operation-stale', expectedRevision: 9,
      updatedAt: '2026-07-28T00:02:00.000Z',
    }), 'revision-conflict');

    await expectAuthorityError(repository.updateSchedule({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', schedule: schedule('2026-08-19T00:00:00.000Z'),
      changedNodeKey: 'unit-1', commandId: 'command-shorten',
      idempotencyKey: 'operation-shorten', expectedRevision: 1, updatedAt: '2026-07-28T00:03:00.000Z',
    }), 'unsafe-deadline');

    const extended = await repository.updateSchedule({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', schedule: schedule('2026-08-21T00:00:00.000Z'),
      changedNodeKey: 'unit-1', commandId: 'command-extend',
      idempotencyKey: 'operation-extend', expectedRevision: 1, updatedAt: '2026-07-28T00:04:00.000Z',
    });
    expect(extended).toMatchObject({ status: 'updated', revision: 2 });
    await expectAuthorityError(repository.updateSchedule({
      assignmentId: 'assignment-1', ownerId: 'teacher-1',
      schedule: { ...schedule('2026-08-22T00:00:00.000Z'), finalDueAt: '2026-08-31T00:00:00.000Z' },
      changedNodeKey: 'unit-1', commandId: 'command-partial',
      idempotencyKey: 'operation-partial', expectedRevision: 2, updatedAt: '2026-07-28T00:05:00.000Z',
    }), 'invalid-command');
    await expect(repository.read('assignment-1')).resolves.toMatchObject({ bookManifest: manifest });
    await expectAuthorityError(repository.updateSchedule({
      assignmentId: 'assignment-1', ownerId: 'teacher-1',
      schedule: { ...schedule('2026-08-23T00:00:00.000Z'), availableFrom: '2026-08-01T00:00:00.000Z' },
      changedNodeKey: 'unit-1', commandId: 'command-availability', idempotencyKey: 'operation-availability',
      expectedRevision: 2, updatedAt: '2026-07-28T00:06:00.000Z',
    }), 'invalid-command');
  });

  it('uses inherited parent deadlines for nested student extensions', async () => {
    const nestedManifest: BookHomeworkManifest = {
      ...manifest,
      selectedTarget: { kind: 'section', bookId: 'book-1', nodeKey: 'section-1' },
      outline: [
        { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1, titleSnapshot: 'Section 1' },
        { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' },
      ],
      scheduleRules: [{ nodeKey: 'section-1', dueAt: '2026-08-20T00:00:00.000Z' }],
      bindings: [{ ...manifest.bindings[0], nodeKey: 'unit-1' }],
    };
    const nestedSchedule: BookHomeworkAuthoritySchedule = {
      schemaVersion: 1,
      resolverVersion: 1,
      finalDueAt: '2026-08-30T00:00:00.000Z',
      scheduleRules: [{ nodeKey: 'section-1', dueAt: '2026-08-20T00:00:00.000Z' }],
    };
    const repository = createRepository();
    await repository.create({
      ...createCommand(), assignmentId: 'assignment-nested', manifest: nestedManifest, schedule: nestedSchedule,
      sagaId: 'saga-nested', commandId: 'command-nested-create', idempotencyKey: 'operation-nested-create',
    });
    await expect(repository.updateStudentExtension({
      assignmentId: 'assignment-nested', ownerId: 'teacher-1', studentId: 'student-1', nodeKey: 'unit-1',
      dueAt: '2026-08-21T00:00:00.000Z', commandId: 'command-nested-extension',
      idempotencyKey: 'operation-nested-extension', expectedRevision: 1, updatedAt: '2026-07-28T00:01:00.000Z',
    })).resolves.toMatchObject({ status: 'updated', revision: 2 });
  });

  it('supports trusted student extensions and deterministic compensation recovery', async () => {
    const repository = createRepository();
    await repository.create(createCommand());
    const extension = await repository.updateStudentExtension({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', studentId: 'student-1', nodeKey: 'unit-1',
      dueAt: '2026-08-25T00:00:00.000Z', commandId: 'command-extension', idempotencyKey: 'operation-extension',
      expectedRevision: 1, updatedAt: '2026-07-28T00:01:00.000Z',
    });
    expect(extension.revision).toBe(2);
    await expectAuthorityError(repository.updateStudentExtension({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', studentId: 'student-1', nodeKey: 'unit-1',
      dueAt: '2026-08-24T00:00:00.000Z', commandId: 'command-extension-shorter', idempotencyKey: 'operation-extension-shorter',
      expectedRevision: 2, updatedAt: '2026-07-28T00:02:00.000Z',
    }), 'unsafe-deadline');

    await expectAuthorityError(repository.updateStudentExtension({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', studentId: 'student-2', nodeKey: 'unit-1',
      dueAt: '2026-08-25T00:00:00.000Z', commandId: 'command-other-student', idempotencyKey: 'operation-other-student',
      expectedRevision: 2, updatedAt: '2026-07-28T00:02:30.000Z',
    }), 'invalid-command');

    const recovered = await repository.recover({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', state: 'compensating', commandId: 'command-recover',
      idempotencyKey: 'operation-recover', expectedRevision: 2, updatedAt: '2026-07-28T00:03:00.000Z',
    });
    expect(recovered).toMatchObject({ status: 'recovered', visibility: 'compensating' });
    await expect(repository.readStudentProjection('assignment-1', 'student-1')).resolves.toBeNull();
  });

  it('retries a Firestore CAS conflict without duplicating the operation', async () => {
    const inner = new InMemoryBookHomeworkDocumentStore();
    let firstWrite = true;
    const conflictedStore: BookHomeworkDocumentStore = {
      read: (id): Promise<BookHomeworkStoredDocument | null> => inner.read(id),
      write: async (id, value, updateTime) => {
        if (firstWrite) {
          firstWrite = false;
          return false;
        }
        return inner.write(id, value, updateTime);
      },
    };
    const repository = createRepository(['not-started'], conflictedStore);
    await expect(repository.create(createCommand())).resolves.toMatchObject({ status: 'created', revision: 1 });
    await expect(repository.read('assignment-1')).resolves.toMatchObject({ revision: 1 });
  });

  it('reconciles a lost CAS response without duplicating committed visibility', async () => {
    const inner = new InMemoryBookHomeworkDocumentStore();
    let loseNextWrite = false;
    const flakyStore: BookHomeworkDocumentStore = {
      read: (id): Promise<BookHomeworkStoredDocument | null> => inner.read(id),
      write: async (id, value, updateTime) => {
        const accepted = await inner.write(id, value, updateTime);
        if (accepted && loseNextWrite) {
          loseNextWrite = false;
          return false;
        }
        return accepted;
      },
    };
    const repository = createRepository(['not-started'], flakyStore);
    await repository.create(createCommand());
    loseNextWrite = true;
    await expect(repository.setVisibility({
      assignmentId: 'assignment-1', ownerId: 'teacher-1', state: 'committed',
      commandId: 'command-commit-lost-response', idempotencyKey: 'operation-commit-lost-response', expectedRevision: 1,
      updatedAt: '2026-07-28T00:01:00.000Z',
    })).resolves.toMatchObject({ status: 'replayed', revision: 2, visibility: 'committed' });
    await expect(repository.read('assignment-1')).resolves.toMatchObject({ revision: 2, visibility: { status: 'committed' } });
  });

  it('uses a dedicated Firestore REST document path and precondition without exposing credentials', async () => {
    const record = {
      assignmentId: 'assignment-1', assignmentKind: 'book_activity_bundle' as const, schemaVersion: 1 as const,
      ownerId: 'teacher-1', bookManifest: manifest, schedule: schedule(), studentExtensions: {},
      saga: { sagaId: 'saga-1', state: 'prepared' as const, lastCommandId: 'command-create' },
      visibility: { status: 'prepared' as const, pointerId: 'manifest-1', manifestVersionId: 'manifest-1', revision: 1 },
      revision: 1, createdAt, updatedAt: createdAt,
    };
    let encodedFields: Record<string, unknown> | undefined;
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      expect(url).toContain('/projects/demo-project/databases/(default)/documents/homework_assignments/assignment-1');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
      if (init?.method === 'PATCH') {
        expect(url).toContain('currentDocument.exists=false');
        encodedFields = (JSON.parse(String(init.body)) as { fields: Record<string, unknown> }).fields;
        expect(String(init.body)).toContain('assignmentKind');
        return new Response('{}', { status: 200 });
      }
      expect(encodedFields).toBeDefined();
      return new Response(JSON.stringify({ fields: encodedFields, updateTime: '2026-07-28T00:01:00.000000Z' }), { status: 200 });
    };
    const store = new FirebaseRestBookHomeworkDocumentStore({
      env: {
        FIREBASE_PROJECT_ID: 'demo-project',
        BOOK_HOMEWORK_SERVICE_IDENTITY: 'book-homework@example.iam.gserviceaccount.com',
      },
      fetchImpl: fetchMock,
      getAccessToken: async () => 'test-token',
    });
    await expect(store.write('assignment-1', record)).resolves.toBe(true);
    await expect(store.read('assignment-1')).resolves.toMatchObject({
      updateTime: '2026-07-28T00:01:00.000000Z',
      value: { assignmentId: 'assignment-1', assignmentKind: 'book_activity_bundle', revision: 1 },
    });
  });

  it('requires authoritative state resolution and rejects mismatched service identity', () => {
    expect(() => new BookHomeworkAuthorityRepository(
      new InMemoryBookHomeworkDocumentStore(),
      undefined as never,
    )).toThrow('authoritative student-state resolver');
    expect(() => new FirebaseRestBookHomeworkDocumentStore({
      env: {
        FIREBASE_PROJECT_ID: 'demo-project',
        BOOK_HOMEWORK_SERVICE_IDENTITY: 'book-homework@example.iam.gserviceaccount.com',
        BOOK_HOMEWORK_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'wrong@example.iam.gserviceaccount.com',
          private_key: 'not-used',
        }),
      },
    })).toThrow('book_homework_service_identity_mismatch');
  });

  it('treats Firestore FAILED_PRECONDITION 400 responses as retryable CAS conflicts', async () => {
    const store = new FirebaseRestBookHomeworkDocumentStore({
      env: {
        FIREBASE_PROJECT_ID: 'demo-project',
        BOOK_HOMEWORK_SERVICE_IDENTITY: 'book-homework@example.iam.gserviceaccount.com',
      },
      fetchImpl: async () => new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 400 }),
      getAccessToken: async () => 'test-token',
    });
    await expect(store.write('assignment-1', {
      assignmentId: 'assignment-1', assignmentKind: 'book_activity_bundle', schemaVersion: 1,
      ownerId: 'teacher-1', bookManifest: manifest, schedule: schedule(), studentExtensions: {},
      saga: { sagaId: 'saga-1', state: 'prepared', lastCommandId: 'command-create' },
      visibility: { status: 'prepared', pointerId: 'manifest-1', manifestVersionId: 'manifest-1', revision: 1 },
      revision: 1, createdAt, updatedAt: createdAt,
    })).resolves.toBe(false);
  });

  it('creates stable command fingerprints for replay checks', () => {
    expect(fingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(fingerprint({ a: { c: 3, d: 4 }, b: 2 }));
  });
});
