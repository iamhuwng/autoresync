import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN, notificationWorkerOrigin } from './notificationCommandClient';

export const wakeManualHomeworkReminder = async (
    eventId: string,
    options: {
        readonly workerOrigin?: string;
        readonly getIdToken?: () => Promise<string>;
        readonly fetchImpl?: typeof fetch;
    } = {},
): Promise<boolean> => {
    const workerOrigin = options.workerOrigin?.trim()
        || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
        || DEFAULT_NOTIFICATION_WORKER_ORIGIN;
    const token = (await (options.getIdToken ?? (() => getAuth().currentUser?.getIdToken(false) ?? Promise.resolve('')))()).trim();
    if (!token) return false;
    try {
        const response = await (options.fetchImpl ?? globalThis.fetch)(
            `${notificationWorkerOrigin(workerOrigin)}/deadline-notifications/actions`,
            {
                method: 'POST', credentials: 'omit', redirect: 'error',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': eventId,
                },
                body: JSON.stringify({ eventId }),
            },
        );
        return response.ok;
    } catch {
        return false;
    }
};
