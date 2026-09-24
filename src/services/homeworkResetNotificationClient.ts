import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN, notificationWorkerOrigin } from './notificationCommandClient';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const dispatchHomeworkResetNotification = async (
    eventId: string,
    options: { readonly workerOrigin?: string; readonly fetchImpl?: typeof fetch } = {},
): Promise<'delivered' | 'retry_scheduled' | 'replayed'> => {
    if (!UUID.test(eventId)) throw new Error('homework_reset_event_invalid');
    const user = getAuth().currentUser;
    if (!user) throw new Error('homework_reset_unauthenticated');
    const origin = notificationWorkerOrigin(
        options.workerOrigin?.trim() || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim() || DEFAULT_NOTIFICATION_WORKER_ORIGIN,
    );
    const response = await (options.fetchImpl ?? globalThis.fetch)(`${origin}/homework-reset-notifications/actions`, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': eventId,
        },
        body: JSON.stringify({ eventId }),
    });
    const body = await response.json() as { status?: unknown; code?: unknown };
    if (!response.ok || !['delivered', 'retry_scheduled', 'replayed'].includes(String(body.status))) {
        throw new Error(typeof body.code === 'string' ? body.code : `homework_reset_notification_${response.status}`);
    }
    return body.status as 'delivered' | 'retry_scheduled' | 'replayed';
};
