export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'feedback' | 'homework_reminder';

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
