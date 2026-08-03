import {
    BOOK_NOTIFICATION_MAX_BYTES,
    BOOK_NOTIFICATION_SCHEMA_VERSION,
    type BookNotificationActionClass,
    type BookNotificationContextType,
    type BookNotificationDeadlineClass,
    type BookNotificationMetadata,
} from '../types/notification.types';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const CONTEXT_TYPES: readonly BookNotificationContextType[] = [
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
    | { readonly kind: 'book'; readonly metadata: BookNotificationMetadata }
    | { readonly kind: 'invalid'; readonly reason: NotificationMetadataRejectionReason };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const serializedSize = (value: unknown): number => {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
};
const hasOnlyStructuredKeys = (value: Record<string, unknown>): boolean =>
    Object.keys(value).every((key) => (STRUCTURED_KEYS as readonly string[]).includes(key));

const hasValue = <T extends string>(values: readonly T[], value: unknown): value is T =>
    typeof value === 'string' && values.includes(value as T);

export const parseNotificationMetadata = (raw: unknown): ParsedNotificationMetadata => {
    if (raw === undefined || raw === null) return { kind: 'none', metadata: undefined };
    if (!isRecord(raw)) return { kind: 'invalid', reason: 'not-an-object' };
    if (serializedSize(raw) > BOOK_NOTIFICATION_MAX_BYTES) {
        return { kind: 'invalid', reason: 'over-limit' };
    }
    if (raw.schemaVersion !== BOOK_NOTIFICATION_SCHEMA_VERSION) {
        return { kind: 'invalid', reason: 'unknown-schema-version' };
    }
    if (raw.kind !== 'book') return { kind: 'invalid', reason: 'unknown-type' };
    if (!hasOnlyStructuredKeys(raw)) return { kind: 'invalid', reason: 'unknown-field' };
    if (!hasValue(CONTEXT_TYPES, raw.contextType)) {
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
    if (!hasValue(DEADLINE_CLASSES, raw.deadlineClass)) {
        return { kind: 'invalid', reason: 'invalid-deadline-class' };
    }
    if (!hasValue(ACTION_CLASSES, raw.actionClass)) {
        return { kind: 'invalid', reason: 'invalid-action-class' };
    }

    const metadata: BookNotificationMetadata = {
        schemaVersion: BOOK_NOTIFICATION_SCHEMA_VERSION,
        kind: 'book',
        contextType: raw.contextType,
        contextId: raw.contextId,
        updateActionId: raw.updateActionId,
        checkpointAvailable: raw.checkpointAvailable,
        deadlineClass: raw.deadlineClass,
        actionClass: raw.actionClass,
    };
    return serializedSize(metadata) > BOOK_NOTIFICATION_MAX_BYTES
        ? { kind: 'invalid', reason: 'over-limit' }
        : { kind: 'book', metadata };
};
