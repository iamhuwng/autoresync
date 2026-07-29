import { describe, expect, it, vi } from 'vitest';
import {
    createNotificationCommandClient,
    NotificationCommandClientError,
    type NotificationCreateCommand,
} from './notificationCommandClient';

const operationId = '00000000-0000-4000-8000-000000000094';
const command: NotificationCreateCommand = {
    schemaVersion: 1,
    commandType: 'create-notification',
    operationId,
    producerFamily: 'assignment',
    recipientId: 'student-1',
    authority: { kind: 'assignment', recordId: 'assignment-1' },
    notification: {
        type: 'info',
        title: 'Homework assigned',
        message: 'A new assignment is ready.',
        link: '/student/homework/homework-1',
    },
};

describe('notificationCommandClient', () => {
    it('posts one authenticated idempotent command to the trusted seam', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            status: 'created',
            operationId,
            notificationId: operationId,
        }), { status: 200 }));
        const client = createNotificationCommandClient({
            workerOrigin: 'https://worker.example/',
            getIdToken: async () => 'token',
            fetchImpl,
        });

        await expect(client.create(command)).resolves.toEqual({
            status: 'created',
            operationId,
            notificationId: operationId,
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://worker.example/book-notifications/commands',
            expect.objectContaining({
                method: 'POST',
                credentials: 'omit',
                redirect: 'error',
                headers: expect.objectContaining({
                    Authorization: 'Bearer token',
                    'Idempotency-Key': operationId,
                }),
            }),
        );
    });

    it('rejects malformed authority before network access', async () => {
        const fetchImpl = vi.fn();
        const client = createNotificationCommandClient({
            workerOrigin: 'http://localhost:8787',
            getIdToken: async () => 'token',
            fetchImpl,
        });
        await expect(client.create({
            ...command,
            authority: { kind: 'course', recordId: 'assignment-1' },
        })).rejects.toBeInstanceOf(NotificationCommandClientError);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('accepts Firebase push IDs with a leading hyphen', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            status: 'created',
            operationId,
            notificationId: operationId,
        }), { status: 200 }));
        const client = createNotificationCommandClient({
            workerOrigin: 'https://worker.example',
            getIdToken: async () => 'token',
            fetchImpl,
        });

        await expect(client.create({
            ...command,
            recipientId: '-Ostudent-1',
            authority: { kind: 'assignment', recordId: '-Oassignment-1' },
        })).resolves.toMatchObject({ status: 'created' });
    });

    it('fails closed on unsafe origins and invalid responses', async () => {
        expect(() => createNotificationCommandClient({
            workerOrigin: 'http://worker.example',
            getIdToken: async () => 'token',
        })).toThrow('notification_command_origin_invalid');
        const client = createNotificationCommandClient({
            workerOrigin: 'https://worker.example',
            getIdToken: async () => 'token',
            fetchImpl: async () => new Response('{}', { status: 200 }),
        });
        await expect(client.create(command)).rejects.toThrow('notification_command_response_invalid');
    });
});
