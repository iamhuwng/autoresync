import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductionBookIntegrityWorkerOptions } from '../src/upload-worker/book-activity-integrity/production-composition';

const mocks = vi.hoisted(() => ({ read: vi.fn(), detail: vi.fn() }));
vi.mock('../src/upload-worker/book-activity-integrity/report-repository', () => ({
  FirebaseRestBookIntegrityReportRepository: class { readReportForTeacher = mocks.read; },
}));
vi.mock('../src/upload-worker/book-results/production-composition', () => ({
  createBookResultReadProductionHandlers: () => ({ resultDetail: mocks.detail }),
}));

const terminal = {
  ownerId: 'teacher', recipientId: 'student', bookId: 'book',
  terminalId: 'attempt:completion', completionId: 'attempt:completion',
  attemptId: 'attempt', resultId: 'attempt:result', contextKind: 'homework',
  contextId: 'homework', bindingId: 'binding', bindingRevision: 2,
  placementId: 'placement', activityId: 'activity', activityVersion: 1,
  activityVersionId: 'version', attemptNumber: 1,
};
const input = { actorUid: 'teacher', bookId: 'book', terminalId: 'attempt:completion', env: {} };
const resolve = () => createProductionBookIntegrityWorkerOptions().resolveTeacherOwnerId!;

describe('production integrity teacher authority', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.read.mockResolvedValue({ terminal });
    mocks.detail.mockResolvedValue({ body: { detail: { ...terminal } }, init: { status: 200 } });
  });
  it('uses the actor-scoped report index and the current trusted Results authority', async () => {
    expect(await resolve()(input)).toBe('teacher');
    expect(mocks.read).toHaveBeenCalledWith({ ownerId: 'teacher', terminalId: 'attempt:completion' });
    expect(mocks.detail).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'teacher', bookId: 'book', studentId: 'student', homeworkId: 'homework', resultId: 'attempt:result',
    }));
  });
  it.each([
    { actorUid: 'other-teacher' }, { actorUid: 'student' },
    { bookId: 'other-book' }, { terminalId: 'other:completion' },
  ])('denies cross-owner, student, Book and terminal targets: %j', async (change) => {
    expect(await resolve()({ ...input, ...change })).toBeNull();
    expect(mocks.detail).not.toHaveBeenCalled();
  });
  it('denies a missing teacher index', async () => {
    mocks.read.mockResolvedValue(null);
    expect(await resolve()(input)).toBeNull();
  });
  it.each([403, 404])('denies Results authorization failure %s', async (status) => {
    mocks.detail.mockResolvedValue({ init: { status } });
    expect(await resolve()(input)).toBeNull();
  });
  it.each(['bindingRevision', 'contextId', 'recipientId', 'attemptId', 'activityVersionId'])('denies a mismatched %s', async (key) => {
    mocks.detail.mockResolvedValue({ body: { detail: { ...terminal, [key]: 'wrong' } } });
    expect(await resolve()(input)).toBeNull();
  });
  it('preserves unavailable authority as an operational failure', async () => {
    mocks.detail.mockResolvedValue({ init: { status: 503 } });
    await expect(resolve()(input)).rejects.toThrow('integrity_report_authority_unavailable');
  });
});
