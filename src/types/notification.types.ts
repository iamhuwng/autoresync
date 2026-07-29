export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'feedback' | 'homework_reminder';

export const BOOK_NOTIFICATION_SCHEMA_VERSION = 1 as const;
export const BOOK_NOTIFICATION_MAX_BYTES = 1024;

export type BookNotificationContextType = 'book' | 'book-activity' | 'book-homework';
export type BookNotificationDeadlineClass = 'none' | 'upcoming' | 'overdue' | 'closed';
export type BookNotificationActionClass = 'open' | 'resume' | 'review' | 'due';

/**
 * Legacy metadata remains readable for existing producers. New Book writes
 * use the bounded discriminated union below instead.
 */
export type LegacyNotificationMetadata = Readonly<Record<string, unknown>>;

export interface BookNotificationMetadata {
    readonly schemaVersion: typeof BOOK_NOTIFICATION_SCHEMA_VERSION;
    readonly kind: 'book';
    readonly contextType: BookNotificationContextType;
    readonly contextId: string;
    readonly updateActionId: string;
    readonly checkpointAvailable: boolean;
    readonly deadlineClass: BookNotificationDeadlineClass;
    readonly actionClass: BookNotificationActionClass;
}

export type StructuredNotificationMetadata = BookNotificationMetadata;
export type NotificationMetadata = LegacyNotificationMetadata | StructuredNotificationMetadata;

export interface Notification {
    id: string;
    /** @deprecated Stored in path after migration. Present in legacy data only. */
    userId?: string;
    type: NotificationType;
    title: string;
    message: string;
    read: boolean;
    createdAt: number;
    /** @deprecated Legacy links are retained for reads and resolved through the route registry. */
    link?: string;
    metadata?: NotificationMetadata;
}

export interface LegacyNotificationCreate {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    metadata?: LegacyNotificationMetadata;
}

export interface StructuredNotificationCreate extends Omit<LegacyNotificationCreate, 'metadata'> {
    metadata: StructuredNotificationMetadata;
}

export type NotificationCreate = LegacyNotificationCreate | StructuredNotificationCreate;
