import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyWritingCommitted } from './writingNotificationClient';

const state = vi.hoisted(() => ({ actor: 'student-1', setDoc: vi.fn(), getDoc: vi.fn(), report: vi.fn(), fetch: vi.fn() }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: state.actor, getIdToken: async () => 'token' } }) }));
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, ...parts: string[]) => parts.join('/'), getDoc: state.getDoc, setDoc: state.setDoc }));
vi.mock('./firebase', () => ({ firestore: {} }));
vi.mock('./reportingService', () => ({ reportingService: { reportNotificationFailure: state.report } }));

beforeEach(() => {
    vi.clearAllMocks();
    state.actor = 'student-1';
    state.fetch.mockResolvedValue(Response.json({ status: 'created' }));
    state.getDoc.mockResolvedValue({ exists: () => false });
    state.setDoc.mockResolvedValue(undefined);
    vi.stubEnv('VITE_WRITING_NOTIFICATION_URL', 'https://bridge.test');
    vi.stubGlobal('fetch', state.fetch);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Writing committed notification adapter', () => {
    it('saves a minimal immutable submission receipt before sending only event identity', async () => {
        await expect(notifyWritingCommitted({ eventKind: 'writing-submitted', submissionId: 'source-1',
            occurredAt: 123, audience: 'teacher' })).resolves.toMatchObject({ status: 'written', delivered: 1 });
        expect(state.setDoc).toHaveBeenCalledWith('writing_notification_intents/writing-source-1-submitted-teacher', {
            schemaVersion: 1, eventId: 'writing-source-1-submitted-teacher', kind: 'writing-submitted-teacher',
            authorityRecordId: 'source-1', occurrenceId: 'writing-source-1-submitted-teacher',
            actorUid: 'student-1', occurredAt: 123,
        });
        expect(JSON.parse(state.fetch.mock.calls[0][1].body)).toEqual({
            kind: 'writing-submitted-teacher', eventId: 'writing-source-1-submitted-teacher',
        });
    });


    it('keeps activation off by default and does not create proof without its explicit URL', async () => {
        vi.stubEnv('VITE_WRITING_NOTIFICATION_URL', '');
        await expect(notifyWritingCommitted({ eventKind: 'writing-submitted', submissionId: 'source-1',
            occurredAt: 123, audience: 'student' })).resolves.toMatchObject({ status: 'skipped', unattempted: 1 });
        expect(state.setDoc).not.toHaveBeenCalled();
        expect(state.fetch).not.toHaveBeenCalled();
    });

    it('bounds a pending proof replay read and prevents delivery after the read resolves late', async () => {
        vi.useFakeTimers();
        state.setDoc.mockRejectedValue(new Error('proof may already exist'));
        let resolveRead!: (value: { exists: () => boolean; data: () => Record<string, unknown> }) => void;
        state.getDoc.mockImplementation(() => new Promise(resolve => { resolveRead = resolve; }));

        const pending = notifyWritingCommitted({ eventKind: 'writing-submitted', submissionId: 'source-1',
            occurredAt: 123, audience: 'student' });
        await vi.advanceTimersByTimeAsync(0);
        expect(state.getDoc).toHaveBeenCalledOnce();

        await vi.advanceTimersByTimeAsync(15_000);
        await expect(pending).resolves.toMatchObject({
            status: 'failed', failed: 0, unknown: 0, unattempted: 1, code: 'writing_notification_timeout',
        });
        const proof = state.setDoc.mock.calls[0][1] as Record<string, unknown>;
        resolveRead({ exists: () => true, data: () => proof });
        await Promise.resolve();
        await Promise.resolve();
        expect(state.fetch).not.toHaveBeenCalled();
    });
});
