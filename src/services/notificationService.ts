
/**
 * Notification Service
 * 
 * Manages in-app notifications for users.
 */

import { ref, push, set, get, update, query, onValue, onChildAdded, limitToLast, endBefore, startAfter, orderByChild } from 'firebase/database';
import { database } from './firebase';
import type { Notification, NotificationCreate } from '../types/notification.types';
import { withRestoreGuard } from './restoreGuard';

const NOTIFICATIONS_REF = 'notifications';

export const createNotification = withRestoreGuard(
    'Notification',
    { success: true, notificationId: undefined } as { success: boolean; notificationId?: string; error?: string }
)(async function _createNotification(
    data: NotificationCreate
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!data.userId || !data.title || !data.message) {
            return { success: false, error: 'Missing required fields' };
        }

        const notificationId = push(ref(database, NOTIFICATIONS_REF)).key;
        if (!notificationId) {
            return { success: false, error: 'Failed to generate notification ID' };
        }

        // Omit userId from the body — it is encoded in the Firebase path
        const notificationBody = {
            id: notificationId,
            type: data.type,
            title: data.title,
            message: data.message,
            read: false,
            createdAt: Date.now(),
            ...(data.link !== undefined && { link: data.link }),
            ...(data.metadata !== undefined && { metadata: data.metadata }),
        };

        await set(ref(database, `${NOTIFICATIONS_REF}/${data.userId}/${notificationId}`), notificationBody);
        console.log(`📢 [NotificationService] Created notification ${notificationId} for user ${data.userId} at path ${NOTIFICATIONS_REF}/${data.userId}/${notificationId}`);

        return { success: true, notificationId };
    } catch (error) {
        console.error('Error creating notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
});

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

        const notifications = snapshot.val();
        const result = Object.values(notifications).sort((a: any, b: any) => b.createdAt - a.createdAt) as Notification[];
        console.log(`📢 [NotificationService] Fetched ${result.length} notifications for user ${userId}`);
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
        console.log(`📢 [NotificationService] Found ${unread.length} unread notifications for user ${userId}`);
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
        const notificationRef = ref(database, `${NOTIFICATIONS_REF}/${userId}/${notificationId}`);
        await update(notificationRef, { read: true });
        console.log(`📢 [NotificationService] Marked notification ${notificationId} as read for user ${userId}`);
        return { success: true };
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const notifications = await getUnreadNotifications(userId);
        const updates: Record<string, any> = {};

        notifications.forEach(notification => {
            updates[`${NOTIFICATIONS_REF}/${userId}/${notification.id}/read`] = true;
        });

        if (Object.keys(updates).length > 0) {
            await update(ref(database), updates);
        }
        console.log(`📢 [NotificationService] Marked ${notifications.length} notifications as read for user ${userId}`);

        return { success: true };
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get paginated notifications for a user
 */
export async function getPaginatedUserNotifications(
    userId: string,
    limitCount: number = 20,
    lastKey?: string
): Promise<{ notifications: Notification[]; hasMore: boolean; lastKey?: string }> {
    try {
        const notificationsRef = ref(database, `${NOTIFICATIONS_REF}/${userId}`);

        let notificationsQuery;
        if (lastKey) {
            notificationsQuery = query(notificationsRef, endBefore(null, lastKey), limitToLast(limitCount + 1));
        } else {
            notificationsQuery = query(notificationsRef, limitToLast(limitCount + 1));
        }

        const snapshot = await get(notificationsQuery);

        if (!snapshot.exists()) {
            console.log(`📢 [NotificationService] Paginated fetch: 0 notifications for user ${userId}, hasMore=false, cursor=undefined`);
            return { notifications: [], hasMore: false, lastKey: undefined };
        }

        const notifications = snapshot.val();
        let notificationsArr = Object.values(notifications) as Notification[];

        // Sort newest first
        notificationsArr.sort((a, b) => b.createdAt - a.createdAt);

        let hasMore = false;
        if (notificationsArr.length > limitCount) {
            hasMore = true;
            notificationsArr.pop(); // Remove the oldest item which we fetched just to know if there's more
        }

        const newLastKey = notificationsArr.length > 0 ? notificationsArr[notificationsArr.length - 1]?.id : undefined;

        console.log(`📢 [NotificationService] Paginated fetch: ${notificationsArr.length} notifications for user ${userId}, hasMore=${hasMore}, cursor=${newLastKey}`);

        return {
            notifications: notificationsArr,
            hasMore,
            lastKey: newLastKey
        };
    } catch (error) {
        console.error('Error in getPaginatedUserNotifications:', error);
        return { notifications: [], hasMore: false, lastKey: undefined };
    }
}

/**
 * Subscribe to new notifications for a user (real-time)
 */
export function subscribeToNotifications(
    userId: string,
    callback: (notifications: Notification[]) => void
): () => void {
    const notificationsRef = ref(database, `${NOTIFICATIONS_REF}/${userId}`);

    console.log(`📢 [NotificationService] Subscribed to real-time notifications for user ${userId}`);
    const unsubscribe = onValue(notificationsRef, (snapshot) => {
        if (!snapshot.exists()) {
            callback([]);
            return;
        }

        const notifications = snapshot.val();
        const userNotifications = Object.values(notifications).sort((a: any, b: any) => b.createdAt - a.createdAt) as Notification[];
        callback(userNotifications);
    });

    return unsubscribe;
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
        startAfter(sinceMs)
    );

    console.log(`📢 [NotificationService] Subscribed to new notifications for user ${userId} since ${sinceMs}`);

    const unsubscribe = onChildAdded(newNotificationsQuery, (snapshot) => {
        if (!snapshot.exists()) return;
        const notification = snapshot.val() as Notification;
        callback(notification);
    });

    return unsubscribe;
}


export const createBulkNotifications = withRestoreGuard(
    'BulkNotification',
    { success: true, notificationIds: [] } as { success: boolean; notificationIds?: string[]; error?: string }
)(async function _createBulkNotifications(
    userIds: string[],
    data: Omit<NotificationCreate, 'userId'>
): Promise<{ success: boolean; notificationIds?: string[]; error?: string }> {
    try {
        if (!data.title || !data.message || userIds.length === 0) {
            return { success: false, error: 'Missing required fields or empty user list' };
        }

        const updates: Record<string, Notification> = {};
        const notificationIds: string[] = [];
        const now = Date.now();

        userIds.forEach(userId => {
            const notificationId = push(ref(database, `${NOTIFICATIONS_REF}/${userId}`)).key;
            if (!notificationId) return;

            updates[`${NOTIFICATIONS_REF}/${userId}/${notificationId}`] = {
                id: notificationId,
                type: data.type,
                title: data.title,
                message: data.message,
                read: false,
                createdAt: now,
                ...(data.link !== undefined && { link: data.link }),
                ...(data.metadata !== undefined && { metadata: data.metadata }),
            } as Notification;

            notificationIds.push(notificationId);
        });

        if (Object.keys(updates).length > 0) {
            await update(ref(database), updates);
        }

        console.log(`📢 [NotificationService] Bulk-created ${notificationIds.length} notifications for ${userIds.length} users`);
        console.log(`✅ [Notification] Created ${notificationIds.length} bulk notifications`);
        return { success: true, notificationIds };
    } catch (error) {
        console.error('Error creating bulk notifications:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
});

/**
 * Send feedback notification to student
 * 
 * Notifies a student when a teacher has added feedback to their test result.
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 * 
 * @param studentId - The student's user ID
 * @param resultId - The test result ID
 * @param testName - The name of the test
 * @param teacherName - Optional teacher name for personalization
 * @returns Promise with success status
 */
export async function sendFeedbackNotification(
    studentId: string,
    resultId: string,
    testName: string,
    teacherName?: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !resultId || !testName) {
            return { success: false, error: 'Missing required parameters' };
        }

        const teacherPrefix = teacherName ? `${teacherName} has` : 'Your teacher has';

        const notificationData: NotificationCreate = {
            userId: studentId,
            type: 'feedback',
            title: 'New Feedback Available',
            message: `${teacherPrefix} provided feedback on "${testName}"`,
            link: `/student/results/${resultId}`,
            metadata: {
                resultId,
                testName,
                teacherName
            }
        };

        const result = await createNotification(notificationData);

        if (result.success) {
            console.log(`✅ [Notification] Feedback notification sent to student ${studentId} for result ${resultId}`);
        }

        return result;
    } catch (error) {
        console.error('Error sending feedback notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Send reviewed notification to student
 * 
 * Notifies a student when their Writing/Speaking test has been reviewed.
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 7 & 8
 * 
 * @param studentId - The student's user ID
 * @param resultId - The test result ID
 * @param testName - The name of the test
 * @param skill - The test skill (writing or speaking)
 * @param teacherName - Optional teacher name for personalization
 * @returns Promise with success status
 */
export async function sendReviewedNotification(
    studentId: string,
    resultId: string,
    testName: string,
    skill: 'writing' | 'speaking',
    teacherName?: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !resultId || !testName) {
            return { success: false, error: 'Missing required parameters' };
        }

        const teacherPrefix = teacherName ? `${teacherName} has` : 'Your teacher has';
        const skillCapitalized = skill.charAt(0).toUpperCase() + skill.slice(1);

        const notificationData: NotificationCreate = {
            userId: studentId,
            type: 'success',
            title: `${skillCapitalized} Test Reviewed`,
            message: `${teacherPrefix} reviewed your ${skill} test "${testName}". View your score.`,
            link: `/student/results/${resultId}`,
            metadata: {
                resultId,
                testName,
                skill,
                teacherName,
                reviewedAt: Date.now()
            }
        };

        const result = await createNotification(notificationData);

        if (result.success) {
            console.log(`✅ [Notification] Reviewed notification sent to student ${studentId} for ${skill} test ${resultId}`);
        }

        return result;
    } catch (error) {
        console.error('Error sending reviewed notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// THCS GRADING NOTIFICATIONS (PRD-0028: THCS Grading Tab)
// ============================================================================

/**
 * Send grade updated notification to student
 * 
 * Notifies a student when a teacher has graded their THCS writing answer.
 * Part of PRD-0028: THCS-THPT Test System Phase 2 — Task 7.9
 * 
 * @param studentId - The student's user ID
 * @param testName - The name of the test
 * @param questionNumber - The question number that was graded
 * @param score - The score given by the teacher
 * @returns Promise with success status
 */
export async function sendGradeUpdatedNotification(
    studentId: string,
    testName: string,
    questionNumber: number,
    score: number
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !testName) {
            return { success: false, error: 'Missing required parameters' };
        }

        const notificationData: NotificationCreate = {
            userId: studentId,
            type: 'success',
            title: 'Grade Updated',
            message: `Your answer for Q${questionNumber} in "${testName}" has been graded: ${score} points.`,
            metadata: {
                testName,
                questionNumber,
                score,
                gradedAt: Date.now()
            }
        };

        const result = await createNotification(notificationData);

        if (result.success) {
            console.log(`✅ [Notification] Grade updated notification sent to student ${studentId} for Q${questionNumber} in ${testName}`);
        }

        return result;
    } catch (error) {
        console.error('Error sending grade updated notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// HOMEWORK NOTIFICATIONS (PRD-0016: Solo Study & Homework System)
// ============================================================================

/**
 * Send homework assigned notification to student(s)
 * 
 * Notifies students when new homework is assigned to them.
 * 
 * @param studentIds - Array of student IDs to notify
 * @param homeworkId - The homework assignment ID
 * @param homeworkTitle - Title of the homework
 * @param dueDate - Due date timestamp
 * @param teacherName - Optional teacher name for personalization
 */
export async function sendHomeworkAssignedNotification(
    studentIds: string[],
    homeworkId: string,
    homeworkTitle: string,
    dueDate: number,
    teacherName?: string
): Promise<{ success: boolean; notificationIds?: string[]; error?: string }> {
    try {
        if (!homeworkId || !homeworkTitle || studentIds.length === 0) {
            return { success: false, error: 'Missing required parameters' };
        }

        const dueDateStr = new Date(dueDate).toLocaleDateString();
        const teacherPrefix = teacherName || 'Your teacher';

        const result = await createBulkNotifications(studentIds, {
            type: 'info',
            title: '📝 New Homework Assigned',
            message: `${teacherPrefix} has assigned "${homeworkTitle}". Due: ${dueDateStr}`,
            link: `/student/homework/${homeworkId}`,
            metadata: {
                homeworkId,
                homeworkTitle,
                dueDate,
                teacherName
            }
        });

        if (result.success) {
            console.log(`✅ [Notification] Homework assigned notifications sent to ${studentIds.length} students`);
        }

        return result;
    } catch (error) {
        console.error('Error sending homework assigned notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Send homework due soon reminder notification
 * 
 * Reminds a student about upcoming homework deadline.
 * 
 * @param studentId - The student's user ID
 * @param homeworkId - The homework assignment ID
 * @param homeworkTitle - Title of the homework
 * @param hoursRemaining - Hours remaining until due
 */
export async function sendHomeworkDueSoonNotification(
    studentId: string,
    homeworkId: string,
    homeworkTitle: string,
    hoursRemaining: number
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !homeworkId || !homeworkTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        const timeStr = hoursRemaining < 24
            ? `${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`
            : `${Math.floor(hoursRemaining / 24)} day${Math.floor(hoursRemaining / 24) !== 1 ? 's' : ''}`;

        const notificationData: NotificationCreate = {
            userId: studentId,
            type: 'warning',
            title: '⏰ Homework Due Soon',
            message: `"${homeworkTitle}" is due in ${timeStr}. Don't forget to submit!`,
            link: `/student/homework/${homeworkId}`,
            metadata: {
                homeworkId,
                homeworkTitle,
                hoursRemaining,
                reminderType: 'due_soon'
            }
        };

        const result = await createNotification(notificationData);

        if (result.success) {
            console.log(`✅ [Notification] Homework due soon reminder sent to student ${studentId}`);
        }

        return result;
    } catch (error) {
        console.error('Error sending homework due soon notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Send homework submitted confirmation notification
 * 
 * Confirms to a student that their homework was successfully submitted.
 * 
 * @param studentId - The student's user ID
 * @param homeworkId - The homework assignment ID
 * @param homeworkTitle - Title of the homework
 * @param score - The score achieved (if available)
 * @param maxScore - Maximum possible score
 */
export async function sendHomeworkSubmittedNotification(
    studentId: string,
    homeworkId: string,
    homeworkTitle: string,
    score?: number,
    maxScore?: number
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !homeworkId || !homeworkTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        let message = `You have successfully submitted "${homeworkTitle}"`;
        if (score !== undefined && maxScore !== undefined) {
            const percentage = Math.round((score / maxScore) * 100);
            message += `. Score: ${score}/${maxScore} (${percentage}%)`;
        }

        const notificationData: NotificationCreate = {
            userId: studentId,
            type: 'success',
            title: '✅ Homework Submitted',
            message,
            link: `/student/homework/${homeworkId}`,
            metadata: {
                homeworkId,
                homeworkTitle,
                score,
                maxScore,
                submittedAt: Date.now()
            }
        };

        const result = await createNotification(notificationData);

        if (result.success) {
            console.log(`✅ [Notification] Homework submitted confirmation sent to student ${studentId}`);
        }

        return result;
    } catch (error) {
        console.error('Error sending homework submitted notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Send homework graded notification to student
 * 
 * Notifies a student when their homework has been graded/reviewed by a teacher.
 * 
 * @param studentId - The student's user ID
 * @param homeworkId - The homework assignment ID
 * @param homeworkTitle - Title of the homework
 * @param score - The final score
 * @param maxScore - Maximum possible score
 * @param teacherName - Optional teacher name
 */
export async function sendHomeworkGradedNotification(
    studentId: string,
    homeworkId: string,
    homeworkTitle: string,
    score: number,
    maxScore: number,
    teacherName?: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !homeworkId || !homeworkTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        const percentage = Math.round((score / maxScore) * 100);
        const teacherPrefix = teacherName ? `${teacherName} has` : 'Your teacher has';

        const notificationData: NotificationCreate = {
            userId: studentId,
            type: 'success',
            title: '📊 Homework Graded',
            message: `${teacherPrefix} graded "${homeworkTitle}". Score: ${score}/${maxScore} (${percentage}%)`,
            link: `/student/homework/${homeworkId}`,
            metadata: {
                homeworkId,
                homeworkTitle,
                score,
                maxScore,
                percentage,
                teacherName,
                gradedAt: Date.now()
            }
        };

        const result = await createNotification(notificationData);

        if (result.success) {
            console.log(`✅ [Notification] Homework graded notification sent to student ${studentId}`);
        }

        return result;
    } catch (error) {
        console.error('Error sending homework graded notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// SESSION / TEST LIFECYCLE NOTIFICATIONS (Feed triggers)
// ============================================================================

/**
 * Get the list of authenticated student UIDs enrolled in a class.
 * Reads from `classes/{classId}/students` — returns only entries that have a uid field.
 * @internal
 */
async function getClassStudentIds(classId: string): Promise<string[]> {
    try {
        const snapshot = await get(ref(database, `classes/${classId}/students`));
        if (!snapshot.exists()) return [];
        const students = snapshot.val() as Record<string, any>;
        // Each entry has uid === key for authenticated students
        return Object.keys(students).filter(key => !!key);
    } catch (err) {
        console.warn(`📢 [NotificationService] Could not fetch students for class ${classId}:`, err);
        return [];
    }
}

/**
 * Notify all students in a class that a new session has been opened.
 *
 * Called when a teacher creates a new session linked to a class.
 *
 * @param classId     - The class ID to look up students for
 * @param sessionCode - The newly created session code
 * @param sessionMode - 'quiz' or 'test'
 * @param className   - Optional display name for the class
 */
export async function sendSessionOpenedNotifications(
    classId: string,
    sessionCode: string,
    sessionMode: 'quiz' | 'test',
    className?: string
): Promise<void> {
    try {
        const studentIds = await getClassStudentIds(classId);
        if (studentIds.length === 0) return;

        const displayName = className ?? 'Your class';
        const modeLabel = sessionMode === 'test' ? 'test' : 'quiz';

        await createBulkNotifications(studentIds, {
            type: 'info',
            title: '📚 New Session Available',
            message: `${displayName} has a new ${modeLabel} session ready. Join with code ${sessionCode}.`,
            // Use real routes so navigation works directly in the dashboard
            link: sessionMode === 'test' ? `/student-test/${sessionCode}` : `/student-wait/${sessionCode}`,
            metadata: { classId, sessionCode, sessionMode },
        });

        console.log(`📢 [NotificationService] Session-opened notifications sent to ${studentIds.length} students (class ${classId})`);
    } catch (error) {
        console.warn('📢 [NotificationService] Failed to send session-opened notifications (non-blocking):', error);
    }
}

/**
 * Notify all students in a class that a test has started.
 *
 * Called when a teacher presses "Start Test" in the monitor page.
 *
 * @param classId     - The class ID to look up students for
 * @param sessionCode - The active session code
 * @param testName    - Display name of the test
 */
export async function sendTestStartedNotifications(
    classId: string,
    sessionCode: string,
    testName: string
): Promise<void> {
    try {
        const studentIds = await getClassStudentIds(classId);
        if (studentIds.length === 0) return;

        await createBulkNotifications(studentIds, {
            type: 'info',
            title: '📝 Test Started',
            message: `"${testName}" has started in your class. Join now if you haven't already.`,
            link: `/student-test/${sessionCode}`,
            metadata: { classId, sessionCode, testName, sessionMode: 'test' },
        });

        console.log(`📢 [NotificationService] Test-started notifications sent to ${studentIds.length} students (class ${classId})`);
    } catch (error) {
        console.warn('📢 [NotificationService] Failed to send test-started notifications (non-blocking):', error);
    }
}

/**
 * Notify all students in a class that a test session has ended.
 *
 * Called when a teacher ends the test from the monitor page.
 *
 * @param classId     - The class ID to look up students for
 * @param sessionCode - The session code that just ended
 * @param testName    - Display name of the test
 */
export async function sendTestEndedNotifications(
    classId: string,
    sessionCode: string,
    testName: string
): Promise<void> {
    try {
        const studentIds = await getClassStudentIds(classId);
        if (studentIds.length === 0) return;

        await createBulkNotifications(studentIds, {
            type: 'success',
            title: '✅ Test Completed',
            message: `"${testName}" session has ended. View your results.`,
            link: `/student/results`,
            metadata: { classId, sessionCode, testName },
        });

        console.log(`📢 [NotificationService] Test-ended notifications sent to ${studentIds.length} students (class ${classId})`);
    } catch (error) {
        console.warn('📢 [NotificationService] Failed to send test-ended notifications (non-blocking):', error);
    }
}

// ============================================================================
// HOMEWORK RESET NOTIFICATION
// ============================================================================

/**
 * Send homework reset notification to student
 * 
 * Notifies a student that their homework has been reset by a teacher
 * and they need to retake it.
 * 
 * @param studentId - The student's user ID
 * @param homeworkId - The homework assignment ID
 * @param homeworkTitle - Title of the homework
 * @returns Promise with success status
 */
export async function sendHomeworkResetNotification(
    studentId: string,
    homeworkId: string,
    homeworkTitle: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !homeworkId || !homeworkTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        const notificationData: NotificationCreate = {
            userId: studentId,
            type: 'warning',
            title: '🔄 Homework Reset',
            message: `Your homework "${homeworkTitle}" has been reset by your teacher. You can now retake it.`,
            link: `/student/homework/${homeworkId}`,
            metadata: {
                homeworkId,
                homeworkTitle,
                resetAt: Date.now()
            }
        };

        const result = await createNotification(notificationData);

        if (result.success) {
            console.log(`✅ [Notification] Homework reset notification sent to student ${studentId} for homework ${homeworkId}`);
        }

        return result;
    } catch (error) {
        console.error('Error sending homework reset notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// THCS HOMEWORK NOTIFICATIONS (PRD-0029: Phase 3 — Tasks 3.1–3.6)
// ============================================================================


/**
 * Task 3.1: Send THCS homework assigned notification to student(s)
 * 
 * @param studentIds - Array of student IDs to notify
 * @param homeworkId - The homework assignment ID
 * @param testTitle - Title of the THCS test
 * @param dueDate - Due date timestamp
 * @param teacherName - Optional teacher name
 */
export async function sendThcsHomeworkAssignedNotification(
    studentIds: string[],
    homeworkId: string,
    testTitle: string,
    dueDate: number,
    teacherName?: string
): Promise<{ success: boolean; notificationIds?: string[]; error?: string }> {
    try {
        if (!homeworkId || !testTitle || studentIds.length === 0) {
            return { success: false, error: 'Missing required parameters' };
        }

        const dueDateStr = new Date(dueDate).toLocaleDateString();
        const teacherPrefix = teacherName || 'Your teacher';

        const result = await createBulkNotifications(studentIds, {
            type: 'info',
            title: '📝 New THCS Homework Assigned',
            message: `${teacherPrefix} has assigned "${testTitle}". Due: ${dueDateStr}`,
            link: `/student/homework/${homeworkId}`,
            metadata: { homeworkId, testTitle, dueDate, teacherName, notifType: 'thcs_homework_assigned' }
        });

        if (result.success) {
            console.log(`✅ [Notification] THCS homework assigned notifications sent to ${studentIds.length} students`);
        }
        return result;
    } catch (error) {
        console.error('Error sending THCS homework assigned notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Task 3.2: Send THCS grade updated notification (with debounce)
 * 
 * @param studentId - The student's user ID
 * @param testTitle - Test title
 * @param questionNumber - Question number that was graded
 * @param score - Score given
 * @param resultId - Result ID for navigation
 */
// Debounce state for grade notifications (Task 3.7 edge case - notification spam prevention)
const _gradeNotifDebounceMap = new Map<string, { count: number; timer: ReturnType<typeof setTimeout> }>();

export async function sendThcsGradeUpdatedNotification(
    studentId: string,
    testTitle: string,
    questionNumber: number,
    score: number,
    resultId: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    const debounceKey = `${studentId}_${resultId}`;
    const existing = _gradeNotifDebounceMap.get(debounceKey);

    if (existing) {
        // Increment counter and reset timer
        existing.count += 1;
        clearTimeout(existing.timer);
        existing.timer = setTimeout(async () => {
            const count = existing.count;
            _gradeNotifDebounceMap.delete(debounceKey);
            // Send batched notification
            await createNotification({
                userId: studentId,
                type: 'success',
                title: '📝 Grades Updated',
                message: `${count} answers in "${testTitle}" have been graded.`,
                link: `/student/results/${resultId}`,
                metadata: { testTitle, gradedCount: count, resultId, notifType: 'thcs_grade_updated' }
            });
        }, 10000); // 10s debounce window (PRD §9 EC11)
        return { success: true };
    }

    // First grade notification — set up debounce
    const timer = setTimeout(async () => {
        const entry = _gradeNotifDebounceMap.get(debounceKey);
        _gradeNotifDebounceMap.delete(debounceKey);
        if (entry && entry.count > 1) {
            await createNotification({
                userId: studentId,
                type: 'success',
                title: '📝 Grades Updated',
                message: `${entry.count} answers in "${testTitle}" have been graded.`,
                link: `/student/results/${resultId}`,
                metadata: { testTitle, gradedCount: entry.count, resultId, notifType: 'thcs_grade_updated' }
            });
        } else {
            await createNotification({
                userId: studentId,
                type: 'success',
                title: '📝 Grade Updated',
                message: `Your answer for Q${questionNumber} in "${testTitle}" has been graded: ${score} points.`,
                link: `/student/results/${resultId}`,
                metadata: { testTitle, questionNumber, score, resultId, notifType: 'thcs_grade_updated' }
            });
        }
    }, 10000);

    _gradeNotifDebounceMap.set(debounceKey, { count: 1, timer });
    return { success: true };
}

/**
 * Task 3.3: Send THCS fully graded notification
 * 
 * @param studentId - Student's UID
 * @param testTitle - Test title
 * @param totalScore - Final scaled score (0-10)
 * @param resultId - Result ID for navigation
 */
export async function sendThcsFullyGradedNotification(
    studentId: string,
    testTitle: string,
    totalScore: number,
    resultId: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !testTitle || !resultId) {
            return { success: false, error: 'Missing required parameters' };
        }

        const result = await createNotification({
            userId: studentId,
            type: 'success',
            title: '✅ Test Fully Graded',
            message: `All answers in "${testTitle}" have been graded. Your score: ${totalScore}/10.`,
            link: `/student/results/${resultId}`,
            metadata: { testTitle, totalScore, resultId, notifType: 'thcs_fully_graded' }
        });

        if (result.success) {
            console.log(`✅ [Notification] THCS fully graded notification sent to student ${studentId}`);
        }
        return result;
    } catch (error) {
        console.error('Error sending THCS fully graded notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Task 3.4: Send THCS homework due soon notification
 * 
 * @param studentId - Student's UID
 * @param homeworkId - Homework assignment ID
 * @param testTitle - Test title
 * @param hoursRemaining - Hours remaining until deadline
 */
export async function sendThcsHomeworkDueSoonNotification(
    studentId: string,
    homeworkId: string,
    testTitle: string,
    hoursRemaining: number
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !homeworkId || !testTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        const result = await createNotification({
            userId: studentId,
            type: 'warning',
            title: '⏰ THCS Homework Due Soon',
            message: `"${testTitle}" is due in ${hoursRemaining} hours.`,
            link: `/student/homework/${homeworkId}`,
            metadata: { homeworkId, testTitle, hoursRemaining, notifType: 'thcs_homework_due_soon' }
        });

        if (result.success) {
            console.log(`✅ [Notification] THCS homework due soon reminder sent to student ${studentId}`);
        }
        return result;
    } catch (error) {
        console.error('Error sending THCS homework due soon notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Task 3.5: Send THCS homework submitted notification
 * 
 * @param studentId - Student's UID
 * @param testTitle - Test title
 * @param homeworkId - Homework assignment ID
 */
export async function sendThcsSubmittedNotification(
    studentId: string,
    testTitle: string,
    homeworkId: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !testTitle || !homeworkId) {
            return { success: false, error: 'Missing required parameters' };
        }

        const result = await createNotification({
            userId: studentId,
            type: 'success',
            title: '📤 THCS Homework Submitted',
            message: `You've submitted "${testTitle}". Results will be available after grading.`,
            link: `/student/homework/${homeworkId}`,
            metadata: { testTitle, homeworkId, notifType: 'thcs_submitted' }
        });

        if (result.success) {
            console.log(`✅ [Notification] THCS submitted notification sent to student ${studentId}`);
        }
        return result;
    } catch (error) {
        console.error('Error sending THCS submitted notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Task 3.6: Send THCS late submission notification
 * 
 * Sends TWO notifications:
 * 1. To the student: submission was received late
 * 2. To the teacher: student submitted late
 * 
 * @param studentId - Student's UID
 * @param teacherId - Teacher's UID
 * @param testTitle - Test title
 * @param studentName - Student's display name
 * @param homeworkId - Homework assignment ID
 */
export async function sendThcsLateSubmissionNotification(
    studentId: string,
    teacherId: string,
    testTitle: string,
    studentName: string,
    homeworkId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!studentId || !teacherId || !testTitle || !homeworkId) {
            return { success: false, error: 'Missing required parameters' };
        }

        // 1. Notify student
        await createNotification({
            userId: studentId,
            type: 'warning',
            title: '⚠️ Late Submission',
            message: `Your submission for "${testTitle}" was received late.`,
            link: `/student/homework/${homeworkId}`,
            metadata: { testTitle, homeworkId, notifType: 'thcs_late_submission' }
        });

        // 2. Notify teacher
        await createNotification({
            userId: teacherId,
            type: 'info',
            title: '⚠️ Late Submission Received',
            message: `${studentName} submitted "${testTitle}" late.`,
            link: `/teacher/homework/${homeworkId}`,
            metadata: { testTitle, homeworkId, studentId, studentName, notifType: 'thcs_late_submission' }
        });

        console.log(`✅ [Notification] THCS late submission notifications sent (student: ${studentId}, teacher: ${teacherId})`);
        return { success: true };
    } catch (error) {
        console.error('Error sending THCS late submission notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// IELTS WRITING NOTIFICATIONS (PRD-0030: IELTS Writing Test System)
// ============================================================================

/**
 * Notify student that their writing submission was received.
 * Sent after the student submits a writing practice or homework.
 *
 * createNotification is already wrapped in withRestoreGuard (Safety Rule 11).
 */
export async function notifyWritingSubmitted(
    studentId: string,
    submissionId: string,
    testTitle: string,
    contextType: 'solo-practice' | 'homework' | 'class-session'
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !submissionId || !testTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        const contextLabel = contextType === 'homework' ? 'homework' : contextType === 'class-session' ? 'class session' : 'solo practice';

        const result = await createNotification({
            userId: studentId,
            type: 'success',
            title: '✍️ Writing Submitted',
            message: `Your ${contextLabel} essay for "${testTitle}" has been submitted. A teacher will review it soon.`,
            link: `/student/academic-record`,
            metadata: { submissionId, testTitle, contextType, submittedAt: Date.now() }
        });

        if (result.success) {
            console.log(`✅ [Notification] Writing submitted notification sent to ${studentId}`);
        }
        return result;
    } catch (error) {
        console.error('Error sending writing submitted notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Notify student that their writing has been fully graded.
 * Sent when all tasks have received band scores from the teacher.
 */
export async function notifyWritingGraded(
    studentId: string,
    submissionId: string,
    testTitle: string,
    overallBand: number,
    teacherName?: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !submissionId || !testTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        const teacherPrefix = teacherName ? `${teacherName} has` : 'Your teacher has';

        const result = await createNotification({
            userId: studentId,
            type: 'success',
            title: '📊 Writing Graded',
            message: `${teacherPrefix} graded your essay "${testTitle}". Overall Band: ${overallBand.toFixed(1)}`,
            link: `/student/academic-record`,
            metadata: { submissionId, testTitle, overallBand, teacherName, gradedAt: Date.now() }
        });

        if (result.success) {
            console.log(`✅ [Notification] Writing graded notification sent to ${studentId} (band ${overallBand})`);
        }
        return result;
    } catch (error) {
        console.error('Error sending writing graded notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Notify student that one task in a full test has been graded.
 * Used when a teacher grades Task 1 but hasn't graded Task 2 yet (or vice versa).
 */
export async function notifyWritingPartiallyGraded(
    studentId: string,
    submissionId: string,
    testTitle: string,
    gradedTaskNumber: 1 | 2,
    taskBand: number,
    teacherName?: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !submissionId || !testTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        const teacherPrefix = teacherName ? `${teacherName} has` : 'Your teacher has';

        const result = await createNotification({
            userId: studentId,
            type: 'info',
            title: `✍️ Task ${gradedTaskNumber} Graded`,
            message: `${teacherPrefix} graded Task ${gradedTaskNumber} of "${testTitle}". Band: ${taskBand.toFixed(1)}. Waiting for remaining task.`,
            link: `/student/academic-record`,
            metadata: { submissionId, testTitle, gradedTaskNumber, taskBand, teacherName, gradedAt: Date.now() }
        });

        if (result.success) {
            console.log(`✅ [Notification] Writing partially graded notification sent to ${studentId} (Task ${gradedTaskNumber})`);
        }
        return result;
    } catch (error) {
        console.error('Error sending writing partially graded notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Notify student that their writing submission has been reopened for re-attempt.
 * Used when a teacher sends the essay back for the student to rewrite.
 */
export async function notifyWritingReopened(
    studentId: string,
    submissionId: string,
    testTitle: string,
    teacherNote?: string,
    teacherName?: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !submissionId || !testTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        const teacherPrefix = teacherName ? `${teacherName} has` : 'Your teacher has';
        let message = `${teacherPrefix} sent "${testTitle}" back for revision.`;
        if (teacherNote) {
            message += ` Note: "${teacherNote}"`;
        }

        const result = await createNotification({
            userId: studentId,
            type: 'warning',
            title: '🔄 Writing Reopened',
            message,
            link: `/student/academic-record`,
            metadata: { submissionId, testTitle, teacherNote, teacherName, reopenedAt: Date.now() }
        });

        if (result.success) {
            console.log(`✅ [Notification] Writing reopened notification sent to ${studentId}`);
        }
        return result;
    } catch (error) {
        console.error('Error sending writing reopened notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Notify student that their writing has been re-graded (band score updated).
 * Used when a teacher updates the band score after initial grading.
 */
export async function notifyWritingReGraded(
    studentId: string,
    submissionId: string,
    testTitle: string,
    newOverallBand: number,
    previousBand?: number,
    teacherName?: string
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        if (!studentId || !submissionId || !testTitle) {
            return { success: false, error: 'Missing required parameters' };
        }

        const teacherPrefix = teacherName ? `${teacherName} has` : 'Your teacher has';
        const bandChange = previousBand !== undefined
            ? ` (${previousBand.toFixed(1)} → ${newOverallBand.toFixed(1)})`
            : `: ${newOverallBand.toFixed(1)}`;

        const result = await createNotification({
            userId: studentId,
            type: 'info',
            title: '📝 Writing Re-Graded',
            message: `${teacherPrefix} updated your grade for "${testTitle}"${bandChange}`,
            link: `/student/academic-record`,
            metadata: { submissionId, testTitle, newOverallBand, previousBand, teacherName, reGradedAt: Date.now() }
        });

        if (result.success) {
            console.log(`✅ [Notification] Writing re-graded notification sent to ${studentId}`);
        }
        return result;
    } catch (error) {
        console.error('Error sending writing re-graded notification:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
