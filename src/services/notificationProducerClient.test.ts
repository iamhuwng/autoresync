import { describe, expect, it, vi } from 'vitest';
import {
    createTrustedBulkNotifications,
    createTrustedNotification,
    notificationOperationId,
} from './notificationProducerClient';

const notification = {
    producerFamily: 'course' as const,
    authorityRecordId: 'course-1',
    recipientId: 'student-1',
    operationKey: 'course-archived:course-1',
    type: 'info' as const,
    title: 'Course Archived',
    message: 'The course is no longer accessible.',
    link: '/student/courses',
};

const responseFor = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const command = JSON.parse(String(init?.body)) as { operationId: string };
    return new Response(JSON.stringify({
        status: 'created',
        operationId: command.operationId,
        notificationId: command.operationId,
    }), { status: 200 });
};

describe('notificationProducerClient', () => {
    it('creates a stable valid operation ID from a domain event key', () => {
        const first = notificationOperationId('course-archived:course-1:student-1');
        expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u);
        expect(notificationOperationId('course-archived:course-1:student-1')).toBe(first);
        expect(notificationOperationId('course-archived:course-1:student-2')).not.toBe(first);
    });

    it('emits only a bounded #94 command with producer authority', async () => {
        const fetchImpl = vi.fn(responseFor);
        await expect(createTrustedNotification(notification, {
            workerOrigin: 'https://worker.example',
            getIdToken: async () => 'token',
            fetchImpl,
        })).resolves.toMatchObject({ success: true });

        const [, init] = fetchImpl.mock.calls[0]!;
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
            schemaVersion: 1,
            commandType: 'create-notification',
            producerFamily: 'course',
            recipientId: 'student-1',
            authority: { kind: 'course', recordId: 'course-1' },
            notification: {
                type: 'info',
                title: 'Course Archived',
                message: 'The course is no longer accessible.',
                link: '/student/courses',
            },
        });
        expect(body.notification.metadata).toBeUndefined();
        expect(body.operationId).toMatch(/^[0-9a-f-]{36}$/u);
    });

    it('deduplicates recipients and sends one idempotent command per recipient', async () => {
        const fetchImpl = vi.fn(responseFor);
        const result = await createTrustedBulkNotifications(['student-1', 'student-1', 'student-2'], {
            ...notification,
            operationKey: 'course-archived:course-1',
        }, {
            workerOrigin: 'http://localhost:8787',
            getIdToken: async () => 'token',
            fetchImpl,
        });

        expect(result.success).toBe(true);
        expect(result.notificationIds).toHaveLength(2);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('fails closed when the trusted route is not configured', async () => {
        const fetchImpl = vi.fn();
        await expect(createTrustedNotification(notification, {
            getIdToken: async () => 'token',
            fetchImpl,
        })).resolves.toEqual({ success: false, error: 'notification_command_unavailable' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
