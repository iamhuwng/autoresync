import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFirebaseBookSubmissionRepository, createInMemoryBookSubmissionRepository } from '../src/upload-worker/book-submission/repository.ts';

const fingerprint = 'a'.repeat(64);
const paused = () => {
  let release!: () => void;
  let entered!: () => void;
  const done = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  return { release, ready, commit: async () => { entered(); await done; } };
};

const firebaseRepository = () => {
  let state: unknown = null;
  let revision = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    expect(new URL(url).hostname).toBe('localhost');
    if (init.method === 'PUT') {
      if (new Headers(init.headers).get('If-Match') !== String(revision)) return new Response(null, { status: 412 });
      state = JSON.parse(String(init.body));
      revision += 1;
    }
    return new Response(JSON.stringify(state), { headers: { etag: String(revision) } });
  }));
  return createFirebaseBookSubmissionRepository({
    FIREBASE_DB_URL: 'http://localhost:9000?ns=demo-luyentap-local',
    LOCAL_EMULATOR_AUTH: 'true',
    BOOK_SUBMISSION_SERVICE_IDENTITY: 'worker@test.invalid',
    BOOK_SUBMISSION_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'worker@test.invalid', private_key: 'unused-local-key' }),
  });
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each([
  ['in-memory', createInMemoryBookSubmissionRepository],
  ['Firebase REST transactions', firebaseRepository],
] as const)('Book submission lease fencing: %s', (_label, createRepository) => {
  it('prevents an expired finalizer from committing a newer attempt’s lease', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const repository = createRepository();
    const { operation } = await repository.begin({ ownerId: 'teacher-1', fingerprint, idempotencyKey: 'draft-1' });
    const input = { ownerId: operation.ownerId, operationId: operation.operationId, fingerprint };
    const first = paused();
    const firstResult = repository.commit({ ...input, commit: first.commit });
    await first.ready;
    clock.mockReturnValue(1_120_001);
    const second = paused();
    const secondResult = repository.commit({ ...input, commit: second.commit });
    await second.ready;
    const newLease = (await repository.status(input)).operation.commitLeaseId;
    const rejected = expect(firstResult).rejects.toThrow('invalid_transition');
    first.release();
    await rejected;
    expect((await repository.status(input)).operation).toMatchObject({ state: 'committing', commitLeaseId: newLease });
    second.release();
    expect((await secondResult).operation.state).toBe('committed');
  });

  it('preserves cancellation when an expired finalizer eventually returns', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const repository = createRepository();
    const { operation } = await repository.begin({ ownerId: 'teacher-1', fingerprint, idempotencyKey: 'draft-1' });
    const input = { ownerId: operation.ownerId, operationId: operation.operationId, fingerprint };
    const finalizer = paused();
    const result = repository.commit({ ...input, commit: finalizer.commit });
    await finalizer.ready;
    clock.mockReturnValue(1_120_001);
    await repository.cancel(input);
    const rejected = expect(result).rejects.toThrow('invalid_transition');
    finalizer.release();
    await rejected;
    expect((await repository.status(input)).operation.state).toBe('canceled');
  });
});
