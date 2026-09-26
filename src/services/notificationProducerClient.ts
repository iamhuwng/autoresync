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
    readonly status?: string;
    readonly error?: string;
}

export type CommittedNotificationEvent =
    | { readonly eventKind: 'homework-submitted' | 'test-completed' | 'homework-reset'; readonly recordId: string }
    | { readonly eventKind: 'assignment-approved' | 'course-request-decided' | 'course-type-decided'; readonly recordId: string }
    | { readonly eventKind: 'manual-homework-reminder' | 'session-notification' | 'thcs-homework-assigned' | 'thcs-fully-graded'; readonly recordId: string }
    | { readonly eventKind: 'writing-notification'; readonly recordId: string; readonly occurrenceId: string };

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const requestFor = (input: CommittedNotificationEvent): { path: string; body: Record<string, unknown>; key?: string } => {
    if (!ID.test(input.recordId)) throw new Error('notification_record_invalid');
    switch (input.eventKind) {
        case 'homework-submitted':
            return { path: '/book-notifications/commands', body: { schemaVersion: 1, eventKind: input.eventKind, recordId: input.recordId } };
        case 'test-completed':
            return { path: '/test-complete-notifications/actions', body: { schemaVersion: 1, resultId: input.recordId }, key: `test-completed:${input.recordId}` };
        case 'assignment-approved':
            return { path: '/assignment-notifications/actions', body: { schemaVersion: 1, actionId: input.recordId }, key: input.recordId };
        case 'course-request-decided':
            return { path: '/enrollment-notifications/actions', body: { schemaVersion: 1, actionId: input.recordId }, key: input.recordId };
        case 'course-type-decided':
            return { path: '/notifications/course-type-decisions/dispatch', body: { schemaVersion: 1, actionType: 'dispatch-course-type-decision', requestId: input.recordId } };
        case 'homework-reset':
            if (!UUID.test(input.recordId)) throw new Error('notification_occurrence_invalid');
            return { path: '/homework-reset-notifications/actions', body: { eventId: input.recordId }, key: input.recordId };
        case 'writing-notification':
            if (!ID.test(input.occurrenceId)) throw new Error('notification_occurrence_invalid');
            return { path: '/writing-notifications/actions', body: { schemaVersion: 1, actionType: 'writing-notification', eventId: input.occurrenceId, submissionId: input.recordId }, key: input.occurrenceId };
        case 'manual-homework-reminder':
        case 'session-notification':
            if (!UUID.test(input.recordId)) throw new Error('notification_occurrence_invalid');
            return input.eventKind === 'manual-homework-reminder'
                ? { path: '/deadline-notifications/actions', body: { eventId: input.recordId }, key: input.recordId }
                : { path: '/session-notifications/action', body: { schemaVersion: 1, actionType: 'deliver-session-notification', eventId: input.recordId }, key: input.recordId };
        case 'thcs-homework-assigned':
        case 'thcs-fully-graded': {
            const kind = input.eventKind === 'thcs-homework-assigned' ? 'homework-assigned' : 'fully-graded';
            return { path: '/thcs-notifications/actions', body: { schemaVersion: 1, kind, authorityRecordId: input.recordId }, key: `${kind}:${input.recordId}` };
        }
    }
};

const defaultGetIdToken = async (forceRefresh = false): Promise<string> => {
    const user = getAuth().currentUser;
    return user ? user.getIdToken(forceRefresh) : '';
};

/** Dispatch a saved product event; recipient and content are resolved in the Worker. */
export async function dispatchCommittedNotification(
    input: CommittedNotificationEvent,
    options: TrustedProducerClientOptions = {},
): Promise<TrustedProducerNotificationResult> {
    try {
        const command = requestFor(input);
        const origin = options.workerOrigin?.trim()
            || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
            || DEFAULT_NOTIFICATION_WORKER_ORIGIN;
        const token = (await (options.getIdToken ?? defaultGetIdToken)(false)).trim();
        if (!token) throw new NotificationCommandClientError('notification_command_unauthenticated', 401);
        const response = await (options.fetchImpl ?? globalThis.fetch)(
            `${notificationWorkerOrigin(origin)}${command.path}`, {
                method: 'POST', credentials: 'omit', redirect: 'error',
                headers: {
                    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
                    ...(command.key ? { 'Idempotency-Key': command.key } : {}),
                },
                body: JSON.stringify(command.body),
            },
        );
        // These existing wake routes acknowledge via HTTP status only.
        if (input.eventKind === 'manual-homework-reminder' || input.eventKind === 'thcs-homework-assigned'
            || input.eventKind === 'thcs-fully-graded') {
            return response.ok ? { success: true } : { success: false, error: `http_${response.status}` };
        }
        const text = await response.text();
        const responseLimit = input.eventKind === 'session-notification' ? 4096 : 32 * 1024;
        if (new TextEncoder().encode(text).byteLength > responseLimit) throw new Error('notification_command_response_too_large');
        const body = JSON.parse(text) as { code?: unknown; notificationId?: unknown; status?: unknown; eventId?: unknown };
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('notification_command_response_invalid');
        if (!response.ok) throw new NotificationCommandClientError(
            typeof body.code === 'string' ? body.code : `http_${response.status}`, response.status,
        );
        if (input.eventKind === 'homework-submitted' && typeof body.notificationId !== 'string') {
            throw new Error('notification_command_response_invalid');
        }
        if (input.eventKind !== 'homework-submitted' && typeof body.status !== 'string') {
            throw new Error('notification_command_response_invalid');
        }
        if (input.eventKind === 'session-notification'
            && (!['committed', 'replayed'].includes(String(body.status)) || body.eventId !== input.recordId)) {
            throw new Error('notification_command_response_invalid');
        }
        return { success: true,
            ...(typeof body.notificationId === 'string' ? { notificationId: body.notificationId } : {}),
            ...(typeof body.status === 'string' ? { status: body.status } : {}),
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'notification_command_failed' };
    }
}
