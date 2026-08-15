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
  it('creates, replays, advances the current candidate, and publishes one exact version', async () => {
    const fixture = harness();
    await expect(fixture.repo.bindCandidate(binding())).resolves.toBe('created');
    await expect(fixture.repo.bindCandidate(binding())).resolves.toBe('replayed');
    await expect(fixture.repo.bindCandidate(binding({ candidateId: 'activity-candidate-2', candidateRevision: 1, candidateLifecycle: 'staged' }))).resolves.toBe('updated');
    await expect(fixture.repo.recordPublication({
      ownerId: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', activityKey: 'slot-1',
      activityId: 'activity-1', candidateId: 'activity-candidate-2', candidateRevision: 1,
      activityVersionId: 'activity-version-1', activityVersion: 1,
    })).resolves.toBe('updated');
    expect(fixture.value).toMatchObject({ activityId: 'activity-1', candidateId: 'activity-candidate-2', activityVersionId: 'activity-version-1' });
    expect(fixture.tokenPaths).toHaveLength(7);
    expect(fixture.tokenPaths.every((requestPath) => requestPath === path)).toBe(true);
  });

  it('fails closed on a stable-Activity remap, stale revision, or post-publication candidate change', async () => {
    const fixture = harness();
    await fixture.repo.bindCandidate(binding());
    await expect(fixture.repo.bindCandidate(binding({ activityId: 'activity-2' }))).resolves.toBe('conflict');
    await fixture.repo.bindCandidate(binding({ candidateRevision: 3 }));
    await expect(fixture.repo.bindCandidate(binding({ candidateRevision: 2 }))).resolves.toBe('stale');
    await fixture.repo.recordPublication({
      ownerId: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', activityKey: 'slot-1', activityId: 'activity-1',
      candidateId: 'activity-candidate-1', candidateRevision: 3, activityVersionId: 'activity-version-1', activityVersion: 1,
    });
    await expect(fixture.repo.bindCandidate(binding({ candidateId: 'activity-candidate-2', candidateRevision: 1 }))).resolves.toBe('conflict');
  });
});
