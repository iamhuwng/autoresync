import { describe, expect, it, vi } from 'vitest';
import { wakeManualHomeworkReminder } from './manualHomeworkReminderClient';

describe('wakeManualHomeworkReminder', () => {
    it('sends only the saved event ID to the trusted endpoint', async () => {
        const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
        await expect(wakeManualHomeworkReminder('e0f4bd82-4693-4c85-a384-7a949e1216da', {
            workerOrigin: 'https://worker.example', getIdToken: async () => 'token', fetchImpl,
        })).resolves.toBe(true);
        expect(fetchImpl).toHaveBeenCalledWith('https://worker.example/deadline-notifications/actions', expect.objectContaining({
            headers: expect.objectContaining({ 'Idempotency-Key': 'e0f4bd82-4693-4c85-a384-7a949e1216da' }),
            body: JSON.stringify({ eventId: 'e0f4bd82-4693-4c85-a384-7a949e1216da' }),
        }));
    });

    it('returns false when the wake fails; the saved intent remains queued', async () => {
        const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }));
        await expect(wakeManualHomeworkReminder('e0f4bd82-4693-4c85-a384-7a949e1216da', {
            workerOrigin: 'https://worker.example', getIdToken: async () => 'token', fetchImpl,
        })).resolves.toBe(false);
    });
});
