
/**
 * Notification Service
 * 
 * Manages in-app notifications for users.
 */

import { ref, set, get, query, onValue, onChildAdded, limitToLast, endBefore, startAfter, orderByChild } from 'firebase/database';
import { database } from './firebase';
import type { Notification } from '../types/notification.types';
import { adaptStoredNotification } from './notificationMetadata';
import { reportingService } from './reportingService';

export interface NotificationCursor { createdAt: number; id: string }
const newestFirst = (a: Notification, b: Notification) =>
    b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
const reportInboxFailure = (operation: string, error: unknown) => {
    reportingService.reportError(error instanceof Error ? error : new Error(String(error)), {
        source: 'notification_inbox', operation,
    });
};

const NOTIFICATIONS_REF = 'notifications';
/**
 * Get all notifications for a user
 */
export async function getUserNotifications(userId: string): Promise<Notification[]> {
    try {
        const notificationsRef = ref(database, `${NOTIFICATIONS_REF}/${userId}`);
        const snapshot = await get(notificationsRef);

        if (!snapshot.exists()) {
            return [];
        }

        const notifications = snapshot.val() as Record<string, unknown>;
        const result = Object.entries(notifications)
            .map(([notificationId, value]) => adaptStoredNotification(value, notificationId))
            .sort((a, b) => b.createdAt - a.createdAt);
        return result;
    } catch (error) {
        console.error('Error getting user notifications:', error);
        return [];
    }
}

/**
 * Get unread notifications for a user
 */
export async function getUnreadNotifications(userId: string): Promise<Notification[]> {
    try {
        const allNotifications = await getUserNotifications(userId);
        const unread = allNotifications.filter(n => !n.read);
        return unread;
    } catch (error) {
        console.error('Error getting unread notifications:', error);
        return [];
    }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(userId: string, notificationId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const readStateRef = ref(database, `${NOTIFICATIONS_REF}/${userId}/${notificationId}`);
        const readState = await get(readStateRef);
        if (!readState.exists()) return { success: false, error: 'Notification no longer exists' };
        if (readState.val()?.read === true) {
            return { success: true };
        }
        await set(ref(database, `${NOTIFICATIONS_REF}/${userId}/${notificationId}/read`), true);
        return { success: true };
    } catch (error) {
        reportInboxFailure('mark_read', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string, displayedNotifications: Notification[]): Promise<{ success: boolean; error?: string }> {
    try {
        const notifications = displayedNotifications.filter(notification => !notification.read);
        await Promise.all(notifications.map(notification =>
            set(
                ref(database, `${NOTIFICATIONS_REF}/${userId}/${notification.id}/read`),
                true
            )
        ));

        return { success: true };
    } catch (error) {
        reportInboxFailure('mark_displayed_read', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get paginated notifications for a user
 */
export async function getPaginatedUserNotifications(
    userId: string,
    limitCount: number = 20,
    cursor?: NotificationCursor,
): Promise<{ notifications: Notification[]; hasMore: boolean; cursor?: NotificationCursor }> {
    try {
        const pageSize = Math.min(30, Math.max(1, limitCount));
        const notificationsQuery = query(
            ref(database, `${NOTIFICATIONS_REF}/${userId}`),
            orderByChild('createdAt'),
            ...(cursor ? [endBefore(cursor.createdAt, cursor.id)] : []),
            limitToLast(pageSize + 1),
        );
        const snapshot = await get(notificationsQuery);
        const records = snapshot.exists() ? snapshot.val() as Record<string, unknown> : {};
        const ordered = Object.entries(records)
            .map(([id, value]) => adaptStoredNotification(value, id)).sort(newestFirst);
        const notifications = ordered.slice(0, pageSize);
        const oldest = notifications.at(-1);
        return {
            notifications,
            hasMore: ordered.length > pageSize,
            cursor: oldest ? { createdAt: oldest.createdAt, id: oldest.id } : undefined,
        };
    } catch (error) {
        reportInboxFailure('load_history', error);
        throw error;
    }
}

/** Bounded current inbox; the extra record tells the bell whether it can expand. */
export function subscribeToNotifications(
    userId: string,
    callback: (notifications: Notification[]) => void,
    limitCount: number = 10,
    onError?: (error: Error) => void,
): () => void {
    return onValue(query(
        ref(database, `${NOTIFICATIONS_REF}/${userId}`),
        orderByChild('createdAt'),
        limitToLast(Math.min(30, Math.max(1, limitCount)) + 1),
    ), snapshot => {
        const records = snapshot.exists() ? snapshot.val() as Record<string, unknown> : {};
        callback(Object.entries(records)
            .map(([id, value]) => adaptStoredNotification(value, id)).sort(newestFirst));
    }, error => {
        reportInboxFailure('subscribe', error);
        onError?.(error);
    });
}

/**
 * Subscribe to only NEW notifications created after the given timestamp.
 *
 * Uses onChildAdded + orderByChild('createdAt') + startAfter to ensure
 * we only stream items created AFTER the component mounts.  This preserves
 * existing "Load More" pagination — callers just prepend each new item to
 * their local state.
 *
 * @param userId     - The authenticated user's UID
 * @param sinceMs    - Epoch-ms threshold (typically Date.now() at mount)
 * @param callback   - Invoked once per new notification
 * @returns Unsubscribe function — call it on component unmount
 */
export function subscribeToNewNotifications(
    userId: string,
    sinceMs: number,
    callback: (notification: Notification) => void
): () => void {
    const notificationsRef = ref(database, `${NOTIFICATIONS_REF}/${userId}`);

    // orderByChild + startAfter limits the RTDB listener to only new documents
    const newNotificationsQuery = query(
        notificationsRef,
        orderByChild('createdAt'),
        startAfter(sinceMs),
        limitToLast(20)
    );


    const unsubscribe = onChildAdded(newNotificationsQuery, (snapshot) => {
        if (!snapshot.exists()) return;
        const notification = adaptStoredNotification(snapshot.val(), snapshot.key ?? undefined);
        callback(notification);
    }, error => { reportInboxFailure('subscribe_new', error); });

    return unsubscribe;
}
