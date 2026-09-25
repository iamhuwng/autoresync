import { describe, expect, it, vi } from 'vitest';
import { dispatchCommittedNotification } from './notificationProducerClient';

describe('notificationProducerClient', () => {
    it('sends only a saved event identifier to the Worker', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ notificationId: 'notice-1' }), { status: 200 }));
        await expect(dispatchCommittedNotification({ eventKind: 'homework-submitted', recordId: 'result-1' }, {
            workerOrigin: 'https://worker.example', getIdToken: async () => 'token', fetchImpl,
        })).resolves.toEqual({ success: true, notificationId: 'notice-1' });
        const [url, init] = fetchImpl.mock.calls[0]!;
        expect(url).toBe('https://worker.example/book-notifications/commands');
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer token' });
        expect(JSON.parse(String(init?.body))).toEqual({
            schemaVersion: 1, eventKind: 'homework-submitted', recordId: 'result-1',
        });
    });

    it('rejects a malformed record before network access', async () => {
        const fetchImpl = vi.fn();
        await expect(dispatchCommittedNotification({ eventKind: 'homework-submitted', recordId: '../x' }, {
            getIdToken: async () => 'token', fetchImpl,
        })).resolves.toMatchObject({ success: false, error: 'notification_record_invalid' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
