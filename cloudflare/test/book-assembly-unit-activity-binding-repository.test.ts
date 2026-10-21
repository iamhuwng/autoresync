import { describe, expect, it } from 'vitest';
import {
  BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT,
  FirebaseRestUnitActivityBindingRepository,
} from '../src/upload-worker/book-assembly/unit-activity-binding-repository.ts';

const binding = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const, ownerId: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', activityKey: 'slot-1',
  activityId: 'activity-1', candidateId: 'activity-candidate-1', candidateRevision: 2,
  candidateLifecycle: 'validated' as const, ...overrides,
});
const path = `${BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT}/teacher-1/books/book-1/units/unit-1/activities/slot-1`;

const harness = () => {
  let value: unknown = null; let etag = '"null"';
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const method = String(init?.method ?? 'GET');
    expect(decodeURIComponent(url.pathname.replace(/^\/|\.json$/gu, ''))).toBe(path);
    if (method === 'GET') return new Response(JSON.stringify(value), { headers: { etag } });
    if (method === 'PUT') {
      if (new Headers(init?.headers).get('if-match') !== etag) return new Response('', { status: 412 });
      value = JSON.parse(String(init?.body)); etag = '"updated"'; return new Response('', { status: 200 });
    }
    return new Response('', { status: 405 });
  };
  const tokenPaths: string[] = [];
  return { get value() { return value; }, tokenPaths, repo: new FirebaseRestUnitActivityBindingRepository({
    env: { FIREBASE_DB_URL: 'https://firebase.test' }, fetchImpl,
    getFirebaseAuthToken: async (request) => { tokenPaths.push(request?.path ?? ''); return 'token'; },
  }) };
};

describe('durable Unit Activity binding repository', () => {
  it('creates, replays, and monotonically advances only the authoring head', async () => {
    const fixture = harness();
    await expect(fixture.repo.bindCandidate(binding())).resolves.toBe('created');
    await expect(fixture.repo.bindCandidate(binding())).resolves.toBe('replayed');
    await expect(fixture.repo.bindCandidate(binding({ candidateId: 'activity-candidate-2', candidateRevision: 3, candidateLifecycle: 'saved' }))).resolves.toBe('updated');
    await expect(fixture.repo.bindCandidate(binding({ candidateId: 'activity-candidate-3', candidateRevision: 3 }))).resolves.toBe('stale');
    expect(fixture.value).toEqual(binding({ candidateId: 'activity-candidate-2', candidateRevision: 3, candidateLifecycle: 'saved' }));
    expect(fixture.tokenPaths).toHaveLength(6);
    expect(fixture.tokenPaths.every((requestPath) => requestPath === path)).toBe(true);
  });

  it('fails closed on stable-Activity remaps and stale revisions', async () => {
    const fixture = harness();
    await fixture.repo.bindCandidate(binding());
    await expect(fixture.repo.bindCandidate(binding({ activityId: 'activity-2' }))).resolves.toBe('conflict');
    await fixture.repo.bindCandidate(binding({ candidateRevision: 3 }));
    await expect(fixture.repo.bindCandidate(binding({ candidateRevision: 2 }))).resolves.toBe('stale');
    await expect(fixture.repo.bindCandidate(binding({ candidateId: 'activity-candidate-2', candidateRevision: 1 }))).resolves.toBe('stale');
    await expect(fixture.repo.bindCandidate(binding({ activityVersionId: 'version-1', activityVersion: 1 }))).rejects.toThrow('invalid_book_assembly_activity_binding');
  });
});
