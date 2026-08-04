import { describe, expect, it, vi } from 'vitest';
import { FirebaseCourseBookPlacementRepository } from '../src/upload-worker/course-book-placement/repository.ts';

const release = {
  actorUid: 'teacher-1',
  courseId: 'course-1',
  moduleId: 'module-1',
  studentId: 'student-1',
  released: true,
  revision: 1,
  operationId: '00000000-0000-4000-8000-000000000201',
} as const;

const placement = {
  courseMaterialId: 'course-material-1',
  courseId: 'course-1',
  moduleId: 'module-1',
  ownerId: 'teacher-1',
  bindingId: 'binding-1',
  placementRevision: 1,
  completionAggregationPolicy: 'all-activities',
  status: 'active',
  pins: {
    bookId: 'book-1',
    publicationId: 'pub-1',
    manifestVersionId: 'manifest-1',
    unitStableKey: 'unit-1',
    unitVersionId: 'unitv-1',
    sourceVersionId: 'source-1',
    activityId: 'activity-1',
    activityVersionId: 'activityv-1',
    bindingRevision: 'revision-1',
  },
} as const;

const operationPath = `course_book_authority/operations/${release.operationId}`;
const releasePath = `course_book_authority/releases/${release.courseId}/${release.moduleId}/${release.studentId}`;

describe('durable Course Book placement repository', () => {
  it('keeps placement creation on its existing ETag path', async () => {
    const values = new Map<string, unknown>();
    const versions = new Map<string, number>();
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/+|\.json$/gu, '');
      if (init?.method === 'GET') {
        return new Response(JSON.stringify(values.get(path) ?? null), {
          headers: { etag: `"${versions.get(path) ?? 0}"` },
        });
      }
      if (init?.method === 'PUT') {
        const expected = new Headers(init.headers).get('if-match');
        if (expected !== `"${versions.get(path) ?? 0}"`) return new Response('', { status: 412 });
        values.set(path, JSON.parse(String(init.body)));
        versions.set(path, (versions.get(path) ?? 0) + 1);
        return new Response('{}');
      }
      throw new Error('unexpected');
    };
    const repo = new FirebaseCourseBookPlacementRepository({
      env: { FIREBASE_DB_URL: 'https://db.test' },
      fetchImpl,
      getAccessToken: async () => 'token',
      now: () => 1_786_000_000_000,
    });
    expect(await repo.create(placement as never)).toBe('created');
    expect(values.get('course_materials/course-material-1')).toMatchObject({
      id: 'course-material-1', materialId: 'book-1', materialKind: 'book-delivery',
      order: 1_786_000_000_000, linkedAt: 1_786_000_000_000,
    });
    expect(await repo.create(placement as never)).toBe('replayed');
    expect(await repo.revoke({
      courseMaterialId: placement.courseMaterialId,
      actorUid: placement.ownerId,
      operationId: '00000000-0000-4000-8000-000000000203',
    })).toBe('revoked');
    expect(await repo.revoke({
      courseMaterialId: placement.courseMaterialId,
      actorUid: placement.ownerId,
      operationId: '00000000-0000-4000-8000-000000000203',
    })).toBe('replayed');
  });

  it('point-reads release and receipt, then atomically replays or rejects without another write', async () => {
    const values = new Map<string, unknown>([[releasePath, null], [operationPath, null]]);
    const patch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('PATCH');
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      for (const [path, value] of Object.entries(payload)) values.set(path, value);
      return new Response('{}');
    });
    const tokenProvider = vi.fn(async () => 'release-scoped-token');
    const repo = new FirebaseCourseBookPlacementRepository({
      env: {
        FIREBASE_DB_URL: 'https://db.test',
        readDatabaseValue: async (path) => values.get(path) ?? null,
      },
      fetchImpl: patch as typeof fetch,
      getAccessToken: vi.fn(async () => { throw new Error('oauth-write-forbidden'); }),
      tokenProvider,
    });

    expect(await repo.transitionRelease(release)).toBe('transitioned');
    expect(patch).toHaveBeenCalledTimes(1);
    expect(tokenProvider).toHaveBeenCalledWith({
      operation: 'release-transition',
      actorUid: release.actorUid,
      courseId: release.courseId,
      moduleId: release.moduleId,
      studentId: release.studentId,
      expectedReleaseRevision: 0,
      operationId: release.operationId,
    });
    expect((await repo.readRelease(release.courseId, release.moduleId, release.studentId))?.released).toBe(true);

    expect(await repo.transitionRelease(release)).toBe('replayed');
    expect(patch).toHaveBeenCalledTimes(1);

    expect(await repo.transitionRelease({ ...release, released: false })).toBe('conflict');
    expect(await repo.transitionRelease({
      ...release,
      revision: 3,
      operationId: '00000000-0000-4000-8000-000000000202',
    })).toBe('conflict');
    expect(patch).toHaveBeenCalledTimes(1);
    expect(tokenProvider).toHaveBeenCalledTimes(1);
  });

  it('does not report a transition after a failed Firebase-auth PATCH', async () => {
    const values = new Map<string, unknown>([[releasePath, null], [operationPath, null]]);
    const patch = vi.fn(async () => new Response('', { status: 500 }));
    const repo = new FirebaseCourseBookPlacementRepository({
      env: {
        FIREBASE_DB_URL: 'https://db.test',
        readDatabaseValue: async (path) => values.get(path) ?? null,
      },
      fetchImpl: patch as typeof fetch,
      tokenProvider: async () => 'release-scoped-token',
    });

    await expect(repo.transitionRelease(release)).rejects
      .toThrow('firebase_rtdb_multi_location_patch_failed:500');
    expect(patch).toHaveBeenCalledTimes(1);
    expect(values.get(releasePath)).toBeNull();
    expect(values.get(operationPath)).toBeNull();
  });
});
