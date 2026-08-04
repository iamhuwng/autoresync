import { describe, expect, it } from 'vitest';
import { FirebaseCourseBookPlacementRepository } from '../src/upload-worker/course-book-placement/repository.ts';

describe('durable Course Book placement repository', () => {
  it('writes one exact placement and revisioned release using conditional paths', async () => {
    const values = new Map<string, unknown>(); const versions = new Map<string, number>();
    const fetchImpl: typeof fetch = async (input, init) => { const url = new URL(String(input)); const path = url.pathname.replace(/^\/+|\.json$/gu, ''); if (init?.method === 'GET') return new Response(JSON.stringify(values.get(path) ?? null), { headers: { etag: `"${versions.get(path) ?? 0}"` } }); if (init?.method === 'PUT') { const expected = new Headers(init.headers).get('if-match'); if (expected !== `"${versions.get(path) ?? 0}"`) return new Response('', { status: 412 }); values.set(path, JSON.parse(String(init.body))); versions.set(path, (versions.get(path) ?? 0) + 1); return new Response('{}'); } throw new Error('unexpected'); };
    const repo = new FirebaseCourseBookPlacementRepository({ env: { FIREBASE_DB_URL: 'https://db.test' }, fetchImpl, getAccessToken: async () => 'token' });
    const placement: any = { courseMaterialId: 'course-material-1', courseId: 'course-1', moduleId: 'module-1', ownerId: 'teacher-1', bindingId: 'binding-1', placementRevision: 1, completionAggregationPolicy: 'all-activities', status: 'active', pins: { bookId: 'book-1', publicationId: 'pub-1', manifestVersionId: 'manifest-1', unitStableKey: 'unit-1', unitVersionId: 'unitv-1', sourceVersionId: 'source-1', activityId: 'activity-1', activityVersionId: 'activityv-1', bindingRevision: 'revision-1' } };
    expect(await repo.create(placement)).toBe('created'); expect(await repo.create(placement)).toBe('replayed');
    expect(await repo.transitionRelease({ courseId: 'course-1', moduleId: 'module-1', studentId: 'student-1', released: true, revision: 1, operationId: 'operation-1' })).toBe('transitioned');
    expect((await repo.readRelease('course-1', 'module-1', 'student-1'))?.released).toBe(true);
  });
});
