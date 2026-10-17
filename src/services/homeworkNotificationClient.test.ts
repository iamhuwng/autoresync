import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
    saved: new Map<string, Record<string, unknown>>(), read: vi.fn(), write: vi.fn(),
    user: { uid: 'teacher', getIdToken: vi.fn(async () => 'token') }, report: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: f.user }) }));
vi.mock('firebase/firestore', () => ({
    doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
    getDoc: (path: string) => { f.read(path); const value = f.saved.get(path); return Promise.resolve({ exists: () => Boolean(value), data: () => value }); },
    setDoc: async (path: string, data: Record<string, unknown>) => { f.write(path, data); f.saved.set(path, data); },
}));
vi.mock('./firebase', () => ({ firestore: {} }));
vi.mock('./reportingService', () => ({ reportingService: { reportNotificationFailure: f.report } }));
vi.mock('../config/featureRegistry', () => ({ FEATURE_IDS: { homework: 'homework' } }));
import { notifyHomeworkCommitted } from './homeworkNotificationClient';

describe('homework post-commit bridge port', () => {
    beforeEach(() => { vi.clearAllMocks(); f.saved.clear(); f.user.uid = 'teacher'; });
    it('captures one minimal actor proof for concurrent selected recipients and sends only candidate IDs', async () => {
        f.saved.set('homework_assignments/homework', { id: 'homework', createdAt: 123, title: 'private title' });
        const fetchImpl = vi.fn(async () => Response.json({ status: 'created' }));
        const options = { workerOrigin: 'https://bridge.test', fetchImpl };
        expect(await Promise.all(['student1', 'student2'].map(id => notifyHomeworkCommitted('thcs-homework-assigned', 'homework', id, options))))
            .toEqual([1, 1].map(() => ({ status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 })));
        expect(f.write).toHaveBeenCalledTimes(1);
        expect(f.saved.get('homework_notification_proofs/homework')).toEqual({ eventId: 'homework', kind: 'thcs-homework-assigned', actorUid: 'teacher', homeworkId: 'homework', occurredAt: 123 });
        expect(fetchImpl.mock.calls.map(call => JSON.parse((call as unknown as [string, RequestInit])[1].body as string)))
            .toEqual(['student1', 'student2'].map(studentId => ({ kind: 'thcs-homework-assigned', eventId: 'homework', studentId })));
    });
    it('reports immutable proof conflict without calling the bridge', async () => {
        f.saved.set('homework_assignments/homework', { createdAt: 123 });
        f.saved.set('homework_notification_proofs/homework', { actorUid: 'other' });
        const fetchImpl = vi.fn();
        expect(await notifyHomeworkCommitted('thcs-homework-assigned', 'homework', 'student', { workerOrigin: 'https://bridge.test', fetchImpl })).toEqual({ status: 'failed', delivered: 0, failed: 0, unknown: 0, unattempted: 1, code: 'homework_proof_conflict' });
        expect(fetchImpl).not.toHaveBeenCalled(); expect(f.write).not.toHaveBeenCalled(); expect(f.report).toHaveBeenCalledTimes(1);
    });
    it('reminder/reset reuse existing product proofs and unknown delivery reports failure', async () => {
        const fetchImpl = vi.fn(async () => Response.json({ status: 'delivery_unknown' }, { status: 503 }));
        expect(await notifyHomeworkCommitted('homework-reset', 'reset', undefined, { workerOrigin: 'https://bridge.test', fetchImpl })).toEqual({ status: 'unknown', delivered: 0, failed: 0, unknown: 1, unattempted: 0, code: 'delivery_unknown' });
        expect(f.read).not.toHaveBeenCalled(); expect(f.write).not.toHaveBeenCalled(); expect(f.report).toHaveBeenCalledTimes(1);
    });
});
