import type {
    BookNotificationActionClass,
    BookNotificationContextType,
    BookNotificationDeadlineClass,
    BookNotificationMetadata,
    LegacyNotificationMetadata,
    Notification,
    NotificationMetadata,
    NotificationType,
} from '../types/notification.types';
import {
    BOOK_NOTIFICATION_MAX_BYTES,
    BOOK_NOTIFICATION_SCHEMA_VERSION,
} from '../types/notification.types';

const BOOK_CONTEXT_TYPES: readonly BookNotificationContextType[] = [
    'book',
    'book-activity',
    'book-homework',
];

const DEADLINE_CLASSES: readonly BookNotificationDeadlineClass[] = [
    'none',
    'upcoming',
    'overdue',
    'closed',
];

const ACTION_CLASSES: readonly BookNotificationActionClass[] = [
    'open',
    'resume',
    'review',
    'due',
];

const STRUCTURED_KEYS = [
    'schemaVersion',
    'kind',
    'contextType',
    'contextId',
    'updateActionId',
    'checkpointAvailable',
    'deadlineClass',
    'actionClass',
] as const;

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export type NotificationMetadataRejectionReason =
    | 'not-an-object'
    | 'unknown-schema-version'
    | 'unknown-type'
    | 'unknown-field'
    | 'invalid-context-type'
    | 'invalid-context-id'
    | 'invalid-action-id'
    | 'invalid-checkpoint'
    | 'invalid-deadline-class'
    | 'invalid-action-class'
    | 'over-limit';

export type ParsedNotificationMetadata =
    | { readonly kind: 'none'; readonly metadata: undefined }
    | { readonly kind: 'legacy'; readonly metadata: LegacyNotificationMetadata }
    | { readonly kind: 'book'; readonly metadata: BookNotificationMetadata }
    | { readonly kind: 'invalid'; readonly reason: NotificationMetadataRejectionReason };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringFrom = <T extends string>(values: readonly T[], value: unknown): value is T =>
    typeof value === 'string' && values.includes(value as T);

const serializedSize = (value: unknown): number => {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
};

const hasOnlyStructuredKeys = (value: Record<string, unknown>): boolean =>
    Object.keys(value).every((key) => (STRUCTURED_KEYS as readonly string[]).includes(key));

export function parseNotificationMetadata(raw: unknown): ParsedNotificationMetadata {
    if (raw === undefined || raw === null) {
        return { kind: 'none', metadata: undefined };
    }

    if (!isRecord(raw)) {
        return { kind: 'invalid', reason: 'not-an-object' };
    }

    const hasStructuredMarker = 'schemaVersion' in raw || 'kind' in raw;
    if (!hasStructuredMarker) {
        return { kind: 'legacy', metadata: { ...raw } };
    }

    if (serializedSize(raw) > BOOK_NOTIFICATION_MAX_BYTES) {
        return { kind: 'invalid', reason: 'over-limit' };
    }

    if (raw.schemaVersion !== BOOK_NOTIFICATION_SCHEMA_VERSION) {
        return { kind: 'invalid', reason: 'unknown-schema-version' };
    }
    if (raw.kind !== 'book') {
        return { kind: 'invalid', reason: 'unknown-type' };
    }
    if (!hasOnlyStructuredKeys(raw)) {
        return { kind: 'invalid', reason: 'unknown-field' };
    }
    if (!isStringFrom(BOOK_CONTEXT_TYPES, raw.contextType)) {
        return { kind: 'invalid', reason: 'invalid-context-type' };
    }
    if (typeof raw.contextId !== 'string' || !SAFE_ID.test(raw.contextId)) {
        return { kind: 'invalid', reason: 'invalid-context-id' };
    }
    if (typeof raw.updateActionId !== 'string' || !SAFE_ID.test(raw.updateActionId)) {
        return { kind: 'invalid', reason: 'invalid-action-id' };
    }
    if (typeof raw.checkpointAvailable !== 'boolean') {
        return { kind: 'invalid', reason: 'invalid-checkpoint' };
    }
    if (!isStringFrom(DEADLINE_CLASSES, raw.deadlineClass)) {
        return { kind: 'invalid', reason: 'invalid-deadline-class' };
    }
    if (!isStringFrom(ACTION_CLASSES, raw.actionClass)) {
        return { kind: 'invalid', reason: 'invalid-action-class' };
    }

    const metadata = {
        schemaVersion: BOOK_NOTIFICATION_SCHEMA_VERSION,
        kind: 'book',
        contextType: raw.contextType,
        contextId: raw.contextId,
        updateActionId: raw.updateActionId,
        checkpointAvailable: raw.checkpointAvailable,
        deadlineClass: raw.deadlineClass,
        actionClass: raw.actionClass,
    } satisfies BookNotificationMetadata;

    if (serializedSize(metadata) > BOOK_NOTIFICATION_MAX_BYTES) {
        return { kind: 'invalid', reason: 'over-limit' };
    }

    return { kind: 'book', metadata };
}

export const normalizeNotificationMetadata = (raw: unknown): NotificationMetadata | undefined => {
    const parsed = parseNotificationMetadata(raw);
    return parsed.kind === 'none' || parsed.kind === 'invalid' ? undefined : parsed.metadata;
};

const NOTIFICATION_TYPES: readonly NotificationType[] = [
    'info',
    'success',
    'warning',
    'error',
    'feedback',
    'homework_reminder',
];

const isNotificationType = (value: unknown): value is NotificationType =>
    isStringFrom(NOTIFICATION_TYPES, value);

export function adaptStoredNotification(raw: unknown, fallbackId?: string): Notification {
    const source = isRecord(raw) ? raw : {};
    const parsedMetadata = parseNotificationMetadata(source.metadata);
    const notification: Notification = {
        id: typeof source.id === 'string' && source.id.length > 0 ? source.id : fallbackId ?? '',
        type: isNotificationType(source.type) ? source.type : 'info',
        title: typeof source.title === 'string' ? source.title : '',
        message: typeof source.message === 'string' ? source.message : '',
        read: source.read === true,
        createdAt: typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
            ? source.createdAt
            : 0,
    };

    if (typeof source.userId === 'string') notification.userId = source.userId;
    if (typeof source.link === 'string') notification.link = source.link;
    if (parsedMetadata.kind !== 'none' && parsedMetadata.kind !== 'invalid') {
        notification.metadata = parsedMetadata.metadata;
    }

    return notification;
}
