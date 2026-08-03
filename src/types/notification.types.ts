export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'feedback' | 'homework_reminder';

export const BOOK_NOTIFICATION_SCHEMA_VERSION = 1 as const;
export const BOOK_NOTIFICATION_MAX_BYTES = 1024;

export type BookNotificationContextType = 'book' | 'book-activity' | 'book-homework';
export type BookNotificationDeadlineClass = 'none' | 'upcoming' | 'overdue' | 'closed';
export type BookNotificationActionClass = 'open' | 'resume' | 'review' | 'due';

/** Metadata that is safe to expose in a Book notification. */
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

export interface Notification {
    id: string;
    /** @deprecated Stored in path after migration. Present in legacy data only. */
    userId?: string;
    type: NotificationType;
    title: string;
    message: string;
    read: boolean;
    createdAt: number;
    link?: string; // Optional link to navigate to
    metadata?: Record<string, any>; // Optional metadata for tracking
}

export interface NotificationCreate {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, any>;
}
