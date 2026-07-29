import type {
    NotificationType,
    StructuredNotificationMetadata,
} from '../types/notification.types';

const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RESPONSE_BYTES = 32 * 1024;

export const NOTIFICATION_COMMAND_PRODUCER_FAMILIES = [
    'course',
    'class',
    'assignment',
    'enrollment',
    'deadline',
    'course-announcement',
    'homework',
    'result',
    'feedback',
    'writing',
    'thcs-practice',
    'thcs-grading',
    'session',
    'monitor',
] as const;

export type NotificationCommandProducerFamily =
    typeof NOTIFICATION_COMMAND_PRODUCER_FAMILIES[number];

export interface NotificationCreateCommand {
    readonly schemaVersion: 1;
    readonly commandType: 'create-notification';
    readonly operationId: string;
    readonly producerFamily: NotificationCommandProducerFamily;
    readonly recipientId: string;
    readonly authority: {
        readonly kind: NotificationCommandProducerFamily;
        readonly recordId: string;
    };
    readonly notification: {
        readonly type: NotificationType;
        readonly title: string;
        readonly message: string;
        readonly link?: string;
        readonly metadata?: StructuredNotificationMetadata;
    };
}

export interface NotificationCommandResult {
    readonly status: 'created' | 'replayed';
    readonly operationId: string;
    readonly notificationId: string;
}

export class NotificationCommandClientError extends Error {
    constructor(readonly code: string, readonly status: number) {
        super(code);
        this.name = 'NotificationCommandClientError';
    }
}

const origin = (value: string): string => {
    let parsed: URL;
    try {
        parsed = new URL(value.trim());
    } catch {
        throw new NotificationCommandClientError('notification_command_origin_invalid', 0);
    }
    if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost'))
        || parsed.username || parsed.password || parsed.search || parsed.hash
        || !/^\/+$/u.test(parsed.pathname)) {
        throw new NotificationCommandClientError('notification_command_origin_invalid', 0);
    }
    return parsed.origin;
};

const assertCommand = (command: NotificationCreateCommand): void => {
    if (!OPERATION_ID.test(command.operationId)
        || !ID.test(command.recipientId)
        || command.authority.kind !== command.producerFamily
        || !ID.test(command.authority.recordId)) {
        throw new NotificationCommandClientError('notification_command_invalid', 0);
    }
};

export const createNotificationCommandClient = (options: {
    readonly workerOrigin: string;
    readonly getIdToken: (forceRefresh?: boolean) => Promise<string>;
    readonly fetchImpl?: typeof fetch;
}) => {
    const endpoint = `${origin(options.workerOrigin)}/book-notifications/commands`;
    return {
        async create(command: NotificationCreateCommand): Promise<NotificationCommandResult> {
            assertCommand(command);
            const token = (await options.getIdToken(false)).trim();
            if (!token) throw new NotificationCommandClientError('notification_command_unauthenticated', 401);
            const response = await (options.fetchImpl ?? globalThis.fetch)(endpoint, {
                method: 'POST',
                credentials: 'omit',
                redirect: 'error',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': command.operationId,
                },
                body: JSON.stringify(command),
            });
            const text = await response.text();
            if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
                throw new NotificationCommandClientError('notification_command_response_too_large', 502);
            }
            let body: Record<string, unknown>;
            try {
                const parsed = JSON.parse(text);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
                body = parsed as Record<string, unknown>;
            } catch {
                throw new NotificationCommandClientError('notification_command_response_invalid', 502);
            }
            if (!response.ok) {
                throw new NotificationCommandClientError(
                    typeof body.code === 'string' ? body.code : `http_${response.status}`,
                    response.status,
                );
            }
            if ((body.status !== 'created' && body.status !== 'replayed')
                || body.operationId !== command.operationId
                || typeof body.notificationId !== 'string') {
                throw new NotificationCommandClientError('notification_command_response_invalid', 502);
            }
            return body as unknown as NotificationCommandResult;
        },
    };
};
