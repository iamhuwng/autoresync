import { describe, expect, it, vi } from 'vitest';

import {
  BOOK_HOMEWORK_COMPATIBILITY_ROOT,
  BookHomeworkCompatibilityRepository,
  BookHomeworkCompatibilityRepositoryError,
  FirebaseRestBookHomeworkCompatibilityDocumentStore,
  InMemoryBookHomeworkCompatibilityDocumentStore,
  bookHomeworkCompatibilityPath,
} from '../src/upload-worker/book-homework/compatibility-repository.ts';
import {
  isBookHomeworkCompatibilityProjection,
} from '../../src/services/book-homework/bookHomeworkCompatibilityProjection.service';
import type {
  BookHomeworkCompatibilityProjection,
} from '../../src/types/homework.types';

const projection = (overrides: Partial<BookHomeworkCompatibilityProjection> = {}): BookHomeworkCompatibilityProjection => ({
  schemaVersion: 1,
  assignmentKind: 'book_homework_compatibility',
  id: 'assignment-1',
  createdBy: 'teacher-1',
  createdAt: 1_754_000_000_000,
  updatedAt: 1_754_000_001_000,
  materialId: 'book-1',
  materialTitle: 'Book One',
  materialType: 'book',
  materialSkill: 'mixed',
  title: 'Book Homework',
  target: { type: 'students', studentIds: ['student-1', 'student-2'] },
  scheduling: { availableFrom: 1_754_000_000_000, dueDate: 1_754_086_400_000 },
  config: {
    timerMinutes: null,
    maxAttempts: null,
    feedbackTiming: 'never',
    lateSubmissionAllowed: false,
  },
  visibility: {
    showTimer: false,
    showAttempts: false,
    showDueDate: true,
    showQuestionCount: false,
    showDuration: false,
  },
  archived: false,
  tags: [],
  bookHomeworkCompatibility: {
    schemaVersion: 1,
    assignmentId: 'assignment-1',
    sourceSagaRevision: 3,
    sourceFingerprint: 'sha256:source-3',
  },
  ...overrides,
});

class FakeStore extends InMemoryBookHomeworkCompatibilityDocumentStore {
  readonly reads: Array<{ path: string; ownerId: string }> = [];
  readonly writes: Array<{ path: string; updateTime?: string }> = [];
  rejectNextWriteWith: BookHomeworkCompatibilityProjection | undefined;
  mutateReadback: BookHomeworkCompatibilityProjection | undefined;
  private readbackOverride: BookHomeworkCompatibilityProjection | undefined;

  override async read(path: string, ownerId: string) {
    this.reads.push({ path, ownerId });
    if (this.readbackOverride) {
      const value = this.readbackOverride;
      this.readbackOverride = undefined;
      return { value, updateTime: 'mismatched-readback' };
    }
    return super.read(path, ownerId);
  }

  override async write(
    path: string,
    value: BookHomeworkCompatibilityProjection,
    updateTime?: string,
  ): Promise<boolean> {
    this.writes.push({ path, updateTime });
    if (this.rejectNextWriteWith) {
      const next = this.rejectNextWriteWith;
      this.rejectNextWriteWith = undefined;
      await super.write(path, next);
      return false;
    }
    const written = await super.write(path, value, updateTime);
    if (written && this.mutateReadback) {
      this.readbackOverride = this.mutateReadback;
      this.mutateReadback = undefined;
    }
    return written;
  }
}

describe('Book Homework compatibility projection', () => {
  it.each([
    ['dot', 'assignment.with.dot'],
    ['nested path', 'assignment/nested'],
    ['overlength', `assignment-${'a'.repeat(128)}`],
  ])('rejects %s assignment IDs before calling the store', async (_label, assignmentId) => {
    const store = new FakeStore();
    const repository = new BookHomeworkCompatibilityRepository(store);
    const invalid = projection({
      id: assignmentId,
      bookHomeworkCompatibility: {
        ...projection().bookHomeworkCompatibility,
        assignmentId,
      },
    });

    await expect(repository.ensureCommittedProjection({ projection: invalid })).rejects.toMatchObject({
      code: 'invalid-projection',
    } satisfies Partial<BookHomeworkCompatibilityRepositoryError>);
    expect(store.reads).toHaveLength(0);
    expect(store.writes).toHaveLength(0);

    await expect(repository.read(assignmentId, 'teacher-1')).rejects.toThrow(
      'invalid_book_homework_compatibility_assignment_id',
    );
    expect(store.reads).toHaveLength(0);
  });

  it('recognizes only the exact marker-aware shell shape', () => {
    const valid = projection();
    expect(isBookHomeworkCompatibilityProjection(valid)).toBe(true);
    expect(isBookHomeworkCompatibilityProjection({ ...valid, status: 'active' })).toBe(false);
    expect(isBookHomeworkCompatibilityProjection({ ...valid, stats: {} })).toBe(false);
    expect(isBookHomeworkCompatibilityProjection({ ...valid, bookManifest: {} })).toBe(false);
    expect(isBookHomeworkCompatibilityProjection({
      ...valid,
      bookHomeworkCompatibility: {
        ...valid.bookHomeworkCompatibility,
        assignmentId: 'assignment-2',
      },
    })).toBe(false);
  });

  it('creates at the exact path, uses an absent-document precondition, and replays', async () => {
    const store = new FakeStore();
    const repository = new BookHomeworkCompatibilityRepository(store);
    const value = projection();

    await expect(repository.ensureCommittedProjection({ projection: value })).resolves.toBe('created');
    expect(store.writes).toEqual([{
      path: `${BOOK_HOMEWORK_COMPATIBILITY_ROOT}/assignment-1`,
      updateTime: undefined,
    }]);
    await expect(repository.read('assignment-1', 'teacher-1')).resolves.toEqual(value);
    await expect(repository.read('assignment-1', 'teacher-2')).resolves.toBeNull();
    await expect(repository.ensureCommittedProjection(value)).resolves.toBe('replayed');
    expect(store.writes).toHaveLength(1);
    expect(bookHomeworkCompatibilityPath('assignment-1')).toBe('homework_assignments/assignment-1');
  });

  it('repairs only an older compatible source revision with an update-time CAS', async () => {
    const store = new FakeStore();
    const repository = new BookHomeworkCompatibilityRepository(store);
    const old = projection({
      updatedAt: 1_754_000_000_000,
      bookHomeworkCompatibility: {
        schemaVersion: 1,
        assignmentId: 'assignment-1',
        sourceSagaRevision: 2,
        sourceFingerprint: 'sha256:source-2',
      },
    });
    const currentPath = bookHomeworkCompatibilityPath('assignment-1');
    await store.write(currentPath, old);
    const newer = projection();

    await expect(repository.ensureCommittedProjection({ projection: newer })).resolves.toBe('updated');
    expect(store.writes.at(-1)).toMatchObject({ path: currentPath, updateTime: 'memory-1' });
    await expect(repository.read('assignment-1', 'teacher-1')).resolves.toEqual(newer);
  });

  it('rejects legacy, other-assignment, newer, and equal-fingerprint conflicts without overwrite', async () => {
    const cases: Array<{ name: string; current: unknown }> = [
      { name: 'legacy', current: { id: 'assignment-1', assignmentKind: 'book_activity_bundle' } },
      {
        name: 'other assignment',
        current: projection({
          id: 'assignment-2',
          bookHomeworkCompatibility: {
            ...projection().bookHomeworkCompatibility,
            assignmentId: 'assignment-2',
          },
        }),
      },
      {
        name: 'newer source',
        current: projection({
          bookHomeworkCompatibility: {
            ...projection().bookHomeworkCompatibility,
            sourceSagaRevision: 4,
            sourceFingerprint: 'sha256:source-4',
          },
        }),
      },
      {
        name: 'equal different fingerprint',
        current: projection({
          materialTitle: 'Do not overwrite',
          bookHomeworkCompatibility: {
            ...projection().bookHomeworkCompatibility,
            sourceFingerprint: 'sha256:other',
          },
        }),
      },
    ];

    for (const testCase of cases) {
      const store = new FakeStore();
      const repository = new BookHomeworkCompatibilityRepository(store);
      const path = bookHomeworkCompatibilityPath('assignment-1');
      await store.write(path, testCase.current as BookHomeworkCompatibilityProjection);
      const writesBefore = store.writes.length;
      await expect(repository.ensureCommittedProjection(projection())).resolves.toBe('conflict');
      expect(store.writes).toHaveLength(writesBefore);
      expect(testCase.name).toBeTruthy();
    }
  });

  it('rechecks after a failed CAS and never overwrites a concurrent newer projection', async () => {
    const store = new FakeStore();
    const repository = new BookHomeworkCompatibilityRepository(store);
    store.rejectNextWriteWith = projection({
      bookHomeworkCompatibility: {
        ...projection().bookHomeworkCompatibility,
        sourceSagaRevision: 4,
        sourceFingerprint: 'sha256:source-4',
      },
    });

    await expect(repository.ensureCommittedProjection(projection())).resolves.toBe('conflict');
    await expect(repository.read('assignment-1', 'teacher-1')).resolves.toMatchObject({
      materialTitle: 'Book One',
      bookHomeworkCompatibility: { sourceSagaRevision: 4 },
    });
    expect(store.writes).toHaveLength(1);
  });

  it('does not replay a same-marker projection whose derived body is stale', async () => {
    const store = new FakeStore();
    const repository = new BookHomeworkCompatibilityRepository(store);
    const stale = projection({
      title: 'Stale title',
      scheduling: { dueDate: 1_754_000_000_000 },
    });
    await store.write(bookHomeworkCompatibilityPath('assignment-1'), stale);

    await expect(repository.ensureCommittedProjection(projection())).rejects.toMatchObject({
      code: 'readback-mismatch',
    } satisfies Partial<BookHomeworkCompatibilityRepositoryError>);
    expect(store.writes).toHaveLength(1);
  });

  it('fails closed when successful storage does not read back exactly', async () => {
    const store = new FakeStore();
    const repository = new BookHomeworkCompatibilityRepository(store);
    store.mutateReadback = projection({ title: 'Unexpected readback' });

    await expect(repository.ensureCommittedProjection(projection())).rejects.toMatchObject({
      code: 'readback-mismatch',
    } satisfies Partial<BookHomeworkCompatibilityRepositoryError>);
  });

  it('uses the exact Firestore document path and current-document preconditions', async () => {
    const requests: Array<{ url: string; method: string; token: string | null }> = [];
    const claims: Array<{ service: string; assignmentId: string; ownerId: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        method: String(init?.method ?? 'GET'),
        token: new Headers(init?.headers).get('authorization'),
      });
      return new Response('{}', { status: 200 });
    };
    const store = new FirebaseRestBookHomeworkCompatibilityDocumentStore({
      env: { FIREBASE_PROJECT_ID: 'project-1' },
      fetchImpl,
      getFirebaseIdToken: async (claim) => {
        claims.push(claim);
        return 'token-1';
      },
    });
    const value = projection();
    const path = bookHomeworkCompatibilityPath(value.id);

    await expect(store.write(path, value)).resolves.toBe(true);
    await expect(store.write(path, value, '2026-08-14T00:00:00.000Z')).resolves.toBe(true);
    expect(requests).toHaveLength(2);
    expect(new URL(requests[0].url).pathname).toBe(
      '/v1/projects/project-1/databases/(default)/documents/homework_assignments/assignment-1',
    );
    expect(new URL(requests[0].url).search).toBe('?currentDocument.exists=false');
    expect(new URL(requests[1].url).search).toBe(
      '?currentDocument.updateTime=2026-08-14T00%3A00%3A00.000Z',
    );
    expect(requests.every((request) => request.method === 'PATCH' && request.token === 'Bearer token-1')).toBe(true);
    expect(claims).toEqual([
      { service: 'book_homework_compatibility', assignmentId: 'assignment-1', ownerId: 'teacher-1' },
      { service: 'book_homework_compatibility', assignmentId: 'assignment-1', ownerId: 'teacher-1' },
    ]);
  });

  it.each([
    {
      label: 'token exchange',
      invoke: (store: FirebaseRestBookHomeworkCompatibilityDocumentStore) => store.read(
        bookHomeworkCompatibilityPath('assignment-1'), 'teacher-1',
      ),
      token: async () => { throw new Error('secret-provider-body'); },
      fetch: async () => new Response('{}', { status: 200 }),
      diagnostic: { stage: 'token_exchange', errorClass: 'token-authentication' },
    },
    {
      label: 'Firestore GET',
      invoke: (store: FirebaseRestBookHomeworkCompatibilityDocumentStore) => store.read(
        bookHomeworkCompatibilityPath('assignment-1'), 'teacher-1',
      ),
      token: async () => 'secret-token',
      fetch: async () => new Response('{}', { status: 500 }),
      diagnostic: { stage: 'firestore_get', errorClass: 'firestore-read' },
    },
    {
      label: 'Firestore PATCH',
      invoke: (store: FirebaseRestBookHomeworkCompatibilityDocumentStore) => store.write(
        bookHomeworkCompatibilityPath('assignment-1'), projection(),
      ),
      token: async () => 'secret-token',
      fetch: async () => new Response('{}', { status: 500 }),
      diagnostic: { stage: 'firestore_patch', errorClass: 'firestore-write' },
    },
  ])('classifies $label without retaining provider bodies or tokens', async (testCase) => {
    const store = new FirebaseRestBookHomeworkCompatibilityDocumentStore({
      env: { FIREBASE_PROJECT_ID: 'project-1' },
      getFirebaseIdToken: testCase.token,
      fetchImpl: testCase.fetch as typeof fetch,
    });

    await expect(testCase.invoke(store)).rejects.toMatchObject({ diagnostic: testCase.diagnostic });
    await expect(testCase.invoke(store)).rejects.not.toThrow(/secret/u);
  });
});
