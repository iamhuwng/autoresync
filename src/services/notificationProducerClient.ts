import { getAuth } from 'firebase/auth';
import {
    DEFAULT_NOTIFICATION_WORKER_ORIGIN,
    NotificationCommandClientError,
    notificationWorkerOrigin,
} from './notificationCommandClient';

export interface TrustedProducerClientOptions {
    readonly workerOrigin?: string;
    readonly getIdToken?: (forceRefresh?: boolean) => Promise<string>;
    readonly fetchImpl?: typeof fetch;
}

export interface TrustedProducerNotificationResult {
    readonly success: boolean;
    readonly notificationId?: string;
    readonly error?: string;
}

const defaultGetIdToken = async (forceRefresh = false): Promise<string> => {
    const user = getAuth().currentUser;
    return user ? user.getIdToken(forceRefresh) : '';
};

/** Dispatch a saved product event; recipient and content are resolved in the Worker. */
export async function dispatchCommittedNotification(
    input: { readonly eventKind: 'homework-submitted'; readonly recordId: string },
    options: TrustedProducerClientOptions = {},
): Promise<TrustedProducerNotificationResult> {
    try {
        if (!/^[A-Za-z0-9_-]{1,128}$/u.test(input.recordId)) throw new Error('notification_record_invalid');
        const origin = options.workerOrigin?.trim()
            || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
            || DEFAULT_NOTIFICATION_WORKER_ORIGIN;
        const token = (await (options.getIdToken ?? defaultGetIdToken)(false)).trim();
        if (!token) throw new NotificationCommandClientError('notification_command_unauthenticated', 401);
        const response = await (options.fetchImpl ?? globalThis.fetch)(
            `${notificationWorkerOrigin(origin)}/book-notifications/commands`, {
                method: 'POST', credentials: 'omit', redirect: 'error',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ schemaVersion: 1, eventKind: input.eventKind, recordId: input.recordId }),
            },
        );
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > 32 * 1024) throw new Error('notification_command_response_too_large');
        const body = JSON.parse(text) as { code?: unknown; notificationId?: unknown };
        if (!response.ok) throw new NotificationCommandClientError(
            typeof body.code === 'string' ? body.code : `http_${response.status}`, response.status,
        );
        if (typeof body.notificationId !== 'string') throw new Error('notification_command_response_invalid');
        return { success: true, notificationId: body.notificationId };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'notification_command_failed' };
    }
}
