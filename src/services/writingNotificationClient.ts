import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN, notificationWorkerOrigin } from './notificationCommandClient';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;

export const dispatchWritingNotification = async (
    submissionId: string,
    eventId: string,
    options: { readonly fetchImpl?: typeof fetch; readonly workerOrigin?: string } = {},
): Promise<void> => {
    if (!ID.test(submissionId) || !ID.test(eventId)) throw new Error('writing_notification_invalid_event');
    const origin = options.workerOrigin?.trim()
        || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
        || DEFAULT_NOTIFICATION_WORKER_ORIGIN;
    const token = await getAuth().currentUser?.getIdToken() || '';
    if (!token) throw new Error('writing_notification_unauthenticated');
    const response = await (options.fetchImpl ?? globalThis.fetch)(
        `${notificationWorkerOrigin(origin)}/writing-notifications/actions`,
        {
            method: 'POST',
            credentials: 'omit',
            redirect: 'error',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': eventId,
            },
            body: JSON.stringify({ schemaVersion: 1, actionType: 'writing-notification', eventId, submissionId }),
        },
    );
    if (!response.ok) throw new Error(`writing_notification_http_${response.status}`);
};
