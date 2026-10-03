import { afterEach, expect, it, vi } from 'vitest';
import { notifyCommittedEvent } from './notificationProducerClient';
const f = vi.hoisted(() => ({ source: vi.fn(), notice: vi.fn(), report: vi.fn() }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'teacher' } }) }));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path?: string) => path, get: vi.fn(), update: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`, getDoc: f.source }));
vi.mock('./firebase', () => ({ database: {}, firestore: {} }));
vi.mock('./restoreGuard', () => ({ isRestoreInProgress: async () => false }));
vi.mock('./reportingService', () => ({ reportingService: { reportNotificationFailure: f.report } }));
vi.mock('./homeworkNotificationClient', () => ({ notifyHomeworkCommitted: f.notice }));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it('derives assignment recipients from its committed source, with at most two concurrent bridge requests', async () => {
    vi.stubEnv('VITE_HOMEWORK_NOTIFICATION_URL', 'https://bridge.test');
    f.source.mockResolvedValue({ data: () => ({ id: 'homework', createdBy: 'teacher', materialType: 'thcs-test',
        target: { type: 'students', studentIds: ['student-3', 'student-1', 'student-2', 'student-1'] } }) });
    let active = 0, maximum = 0;
    f.notice.mockImplementation(async () => {
        maximum = Math.max(maximum, ++active);
        await Promise.resolve();
        active--;
        return { status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 };
    });
    await expect(notifyCommittedEvent({ eventKind: 'thcs-homework-assigned', homeworkId: 'homework' }))
        .resolves.toMatchObject({ status: 'written', delivered: 3, unattempted: 0 });
    expect(maximum).toBe(2);
    expect(f.notice.mock.calls).toEqual(['student-1', 'student-2', 'student-3'].map(uid => ['thcs-homework-assigned', 'homework', uid]));
    expect(f.source).toHaveBeenCalledWith('homework_assignments/homework');
});

it('reports an expired source lookup and prevents a late snapshot from starting delivery', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_HOMEWORK_NOTIFICATION_URL', 'https://bridge.test');
    f.notice.mockClear();
    let resolveSource!: (source: unknown) => void;
    f.source.mockReturnValueOnce(new Promise(resolve => { resolveSource = resolve; }));
    const attempt = notifyCommittedEvent({ eventKind: 'thcs-homework-assigned', homeworkId: 'timeout-homework' });
    await vi.advanceTimersByTimeAsync(15001);
    await expect(attempt).resolves.toMatchObject({ status: 'failed', delivered: 0, unattempted: 1, code: 'homework_notification_timeout' });
    resolveSource({ data: () => ({ id: 'timeout-homework', createdBy: 'teacher', materialType: 'thcs-test', target: { type: 'students', studentIds: ['student'] } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.notice).not.toHaveBeenCalled();
});

it('holds notices without source reads when only the product verifier is configured', async () => {
    vi.stubEnv('VITE_HOMEWORK_RESULT_AUTHORITY_URL', 'https://product.test');
    vi.stubEnv('VITE_HOMEWORK_NOTIFICATION_URL', '');
    f.notice.mockClear(); f.source.mockClear();
    await expect(notifyCommittedEvent({ eventKind: 'homework-reset', eventId: 'reset' }))
        .resolves.toMatchObject({ delivered: 0, unattempted: 1, code: 'homework_notification_not_qualified' });
    expect(f.notice).not.toHaveBeenCalled(); expect(f.source).not.toHaveBeenCalled();
});
