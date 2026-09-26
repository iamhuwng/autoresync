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

    it.each([
        [{ eventKind: 'test-completed', recordId: 'result-1' }, '/test-complete-notifications/actions', { schemaVersion: 1, resultId: 'result-1' }, 'test-completed:result-1'],
        [{ eventKind: 'homework-reset', recordId: '00000000-0000-4000-8000-000000000123' }, '/homework-reset-notifications/actions', { eventId: '00000000-0000-4000-8000-000000000123' }, '00000000-0000-4000-8000-000000000123'],
        [{ eventKind: 'writing-notification', recordId: 'submission-1', occurrenceId: 'writing-submission-1-graded-1' }, '/writing-notifications/actions', { schemaVersion: 1, actionType: 'writing-notification', eventId: 'writing-submission-1-graded-1', submissionId: 'submission-1' }, 'writing-submission-1-graded-1'],
    ] as const)('routes %j through the shared identity port', async (event, path, body, key) => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 'delivered' }), { status: 200 }));
        await expect(dispatchCommittedNotification(event, {
            workerOrigin: 'https://worker.example', getIdToken: async () => 'token', fetchImpl,
        })).resolves.toMatchObject({ success: true, status: 'delivered' });
        const [url, init] = fetchImpl.mock.calls[0]!;
        expect(url).toBe(`https://worker.example${path}`);
        expect(init?.headers).toMatchObject({ 'Idempotency-Key': key });
        expect(JSON.parse(String(init?.body))).toEqual(body);
    });

    it.each([
        ['assignment-approved', '/assignment-notifications/actions', { schemaVersion: 1, actionId: 'request-1' }],
        ['course-request-decided', '/enrollment-notifications/actions', { schemaVersion: 1, actionId: 'request-1' }],
        ['course-type-decided', '/notifications/course-type-decisions/dispatch', { schemaVersion: 1, actionType: 'dispatch-course-type-decision', requestId: 'request-1' }],
    ] as const)('dispatches committed %s from saved identity only', async (eventKind, path, body) => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 'committed' }), { status: 200 }));
        await expect(dispatchCommittedNotification({ eventKind, recordId: 'request-1' }, {
            workerOrigin: 'https://worker.example', getIdToken: async () => 'token', fetchImpl,
        })).resolves.toMatchObject({ success: true });
        const [url, init] = fetchImpl.mock.calls[0]!;
        expect(url).toBe(`https://worker.example${path}`);
        expect(JSON.parse(String(init?.body))).toEqual(body);
    });

    it.each([
        ['manual-homework-reminder', '/deadline-notifications/actions', { eventId: '00000000-0000-4000-8000-000000000123' }, '00000000-0000-4000-8000-000000000123'],
        ['thcs-homework-assigned', '/thcs-notifications/actions', { schemaVersion: 1, kind: 'homework-assigned', authorityRecordId: '00000000-0000-4000-8000-000000000123' }, 'homework-assigned:00000000-0000-4000-8000-000000000123'],
        ['thcs-fully-graded', '/thcs-notifications/actions', { schemaVersion: 1, kind: 'fully-graded', authorityRecordId: '00000000-0000-4000-8000-000000000123' }, 'fully-graded:00000000-0000-4000-8000-000000000123'],
    ] as const)('preserves the HTTP acknowledgement for %s', async (eventKind, path, body, key) => {
        const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
        const input = { eventKind, recordId: '00000000-0000-4000-8000-000000000123' };
        const options = { workerOrigin: 'https://worker.example', getIdToken: async () => 'token', fetchImpl };
        await expect(dispatchCommittedNotification(input, options)).resolves.toEqual({ success: true });
        expect(fetchImpl).toHaveBeenCalledWith(`https://worker.example${path}`, expect.objectContaining({
            headers: expect.objectContaining({ 'Idempotency-Key': key }), body: JSON.stringify(body),
        }));
        fetchImpl.mockImplementation(async () => new Response('', { status: 503 }));
        await expect(dispatchCommittedNotification(input, options)).resolves.toEqual({ success: false, error: 'http_503' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('requires the matching bounded session acknowledgement without another attempt', async () => {
        const recordId = '00000000-0000-4000-8000-000000000123';
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 'committed', eventId: recordId })));
        const options = { workerOrigin: 'https://worker.example', getIdToken: async () => 'token', fetchImpl };
        await expect(dispatchCommittedNotification({ eventKind: 'session-notification', recordId }, options)).resolves.toMatchObject({ success: true });
        expect(fetchImpl).toHaveBeenCalledWith('https://worker.example/session-notifications/action', expect.objectContaining({
            headers: expect.objectContaining({ 'Idempotency-Key': recordId }),
            body: JSON.stringify({ schemaVersion: 1, actionType: 'deliver-session-notification', eventId: recordId }),
        }));
        fetchImpl.mockImplementation(async () => new Response(JSON.stringify({ status: 'committed', eventId: 'wrong-event' })));
        await expect(dispatchCommittedNotification({ eventKind: 'session-notification', recordId }, options)).resolves.toMatchObject({ success: false });
        fetchImpl.mockImplementation(async () => new Response(JSON.stringify({ status: 'committed', eventId: recordId, padding: 'x'.repeat(4096) })));
        await expect(dispatchCommittedNotification({ eventKind: 'session-notification', recordId }, options)).resolves.toMatchObject({ success: false, error: 'notification_command_response_too_large' });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });
});
