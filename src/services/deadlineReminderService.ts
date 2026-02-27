/**
 * deadlineReminderService.ts
 * 
 * Service for managing homework deadline reminders.
 * Uses client-side checks on dashboard load rather than server-side cron jobs.
 * 
 * Per PRD-0016, Task 7.1:
 * - Send reminders at 24h and 1h before deadline
 * - Check on login/dashboard load
 * 
 * @module services/deadlineReminderService
 */

import {
    doc,
    getDoc,
    setDoc,
} from 'firebase/firestore';
// @ts-ignore - firebase.js doesn't have type declarations
import { firestore as db } from './firebase';
import type { HomeworkAssignment } from '../types/homework.types';
import { createNotification, sendThcsHomeworkDueSoonNotification } from './notificationService';

// ============================================================================
// TYPES
// ============================================================================

export interface ReminderConfig {
    /** Hours before deadline to send reminder */
    hoursBefore: number;
    /** Notification message template */
    messageTemplate: string;
    /** Notification type */
    type: 'deadline_24h' | 'deadline_1h' | 'deadline_custom';
}

export interface ReminderStatus {
    homeworkId: string;
    studentId: string;
    /** Reminders that have been sent */
    sentReminders: {
        type: ReminderConfig['type'];
        sentAt: number;
    }[];
    /** Last check timestamp */
    lastChecked: number;
}

export interface PendingReminder {
    homework: HomeworkAssignment;
    reminderType: ReminderConfig['type'];
    hoursRemaining: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REMINDER_CONFIGS: ReminderConfig[] = [
    {
        hoursBefore: 24,
        messageTemplate: 'Homework "{title}" is due in 24 hours',
        type: 'deadline_24h'
    },
    {
        hoursBefore: 1,
        messageTemplate: 'Homework "{title}" is due in 1 hour!',
        type: 'deadline_1h'
    }
];

const REMINDER_STATUS_COLLECTION = 'homework_reminder_status';
const MS_PER_HOUR = 60 * 60 * 1000;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the reminder status document ID
 */
function getReminderStatusId(homeworkId: string, studentId: string): string {
    return `${homeworkId}_${studentId}`;
}

/**
 * Calculate hours remaining until deadline
 */
function getHoursUntilDeadline(deadline: number): number {
    const now = Date.now();
    const msRemaining = deadline - now;
    return msRemaining / MS_PER_HOUR;
}

/**
 * Format reminder message
 */
function formatReminderMessage(template: string, homework: HomeworkAssignment): string {
    return template.replace('{title}', homework.title || homework.materialTitle);
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get reminder status for a specific homework-student pair
 */
export async function getReminderStatus(
    homeworkId: string,
    studentId: string
): Promise<ReminderStatus | null> {
    try {
        const statusId = getReminderStatusId(homeworkId, studentId);
        const statusRef = doc(db, REMINDER_STATUS_COLLECTION, statusId);
        const statusSnap = await getDoc(statusRef);

        if (!statusSnap.exists()) {
            return null;
        }

        return statusSnap.data() as ReminderStatus;
    } catch (error) {
        console.error('Error getting reminder status:', error);
        return null;
    }
}

/**
 * Update reminder status after sending a reminder
 */
export async function updateReminderStatus(
    homeworkId: string,
    studentId: string,
    reminderType: ReminderConfig['type']
): Promise<void> {
    try {
        const statusId = getReminderStatusId(homeworkId, studentId);
        const statusRef = doc(db, REMINDER_STATUS_COLLECTION, statusId);
        const existingStatus = await getReminderStatus(homeworkId, studentId);

        const sentReminders = existingStatus?.sentReminders || [];
        sentReminders.push({
            type: reminderType,
            sentAt: Date.now()
        });

        await setDoc(statusRef, {
            homeworkId,
            studentId,
            sentReminders,
            lastChecked: Date.now()
        }, { merge: true });
    } catch (error) {
        console.error('Error updating reminder status:', error);
    }
}

/**
 * Check if a specific reminder has already been sent
 */
export async function hasReminderBeenSent(
    homeworkId: string,
    studentId: string,
    reminderType: ReminderConfig['type']
): Promise<boolean> {
    const status = await getReminderStatus(homeworkId, studentId);
    if (!status) return false;

    return status.sentReminders.some(r => r.type === reminderType);
}

/**
 * Get pending reminders for a student
 * Called on dashboard load to check and send due reminders
 */
export async function getPendingReminders(
    studentId: string,
    activeHomework: HomeworkAssignment[]
): Promise<PendingReminder[]> {
    const pending: PendingReminder[] = [];
    const now = Date.now();

    for (const homework of activeHomework) {
        const deadline = homework.scheduling?.dueDate;
        if (!deadline || deadline < now) {
            // Skip if no deadline or already past
            continue;
        }

        const hoursRemaining = getHoursUntilDeadline(deadline);

        for (const config of REMINDER_CONFIGS) {
            // Check if we're within the reminder window
            if (hoursRemaining <= config.hoursBefore && hoursRemaining > 0) {
                // Check if already sent
                const alreadySent = await hasReminderBeenSent(
                    homework.id,
                    studentId,
                    config.type
                );

                if (!alreadySent) {
                    pending.push({
                        homework,
                        reminderType: config.type,
                        hoursRemaining
                    });
                }
            }
        }
    }

    return pending;
}

/**
 * Send a deadline reminder notification
 */
export async function sendDeadlineReminder(
    studentId: string,
    homework: HomeworkAssignment,
    reminderType: ReminderConfig['type']
): Promise<boolean> {
    try {
        const config = REMINDER_CONFIGS.find(c => c.type === reminderType);
        if (!config) {
            console.warn(`Unknown reminder type: ${reminderType}`);
            return false;
        }

        const hoursRemaining = homework.scheduling?.dueDate ? getHoursUntilDeadline(homework.scheduling.dueDate) : 0;

        // Phase 3 Task 3.4: Route THCS homework through THCS-specific notification
        if ((homework as any).materialType === 'thcs-test') {
            await sendThcsHomeworkDueSoonNotification(
                studentId,
                homework.id,
                homework.title || homework.materialTitle || 'THCS Homework',
                Math.round(hoursRemaining)
            );
        } else {
            const message = formatReminderMessage(config.messageTemplate, homework);

            // Send notification using existing service
            await createNotification({
                type: 'warning',
                userId: studentId,
                title: 'Homework Due Soon',
                message,
                metadata: {
                    homeworkId: homework.id,
                    deadline: homework.scheduling?.dueDate,
                    reminderType
                }
            });
        }

        // Mark as sent
        await updateReminderStatus(homework.id, studentId, reminderType);

        return true;
    } catch (error) {
        console.error('Error sending deadline reminder:', error);
        return false;
    }
}

/**
 * Process all pending reminders for a student
 * Main entry point - call on dashboard load
 */
export async function processStudentReminders(
    studentId: string,
    activeHomework: HomeworkAssignment[]
): Promise<{
    sent: number;
    failed: number;
    pending: PendingReminder[];
}> {
    const pending = await getPendingReminders(studentId, activeHomework);
    let sent = 0;
    let failed = 0;

    for (const reminder of pending) {
        const success = await sendDeadlineReminder(
            studentId,
            reminder.homework,
            reminder.reminderType
        );

        if (success) {
            sent++;
        } else {
            failed++;
        }
    }

    // Return remaining pending (shouldn't be any if all sent successfully)
    const remainingPending = await getPendingReminders(studentId, activeHomework);

    return {
        sent,
        failed,
        pending: remainingPending
    };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all upcoming deadlines for a student (for dashboard widget)
 */
export async function getUpcomingDeadlines(
    _studentId: string,
    activeHomework: HomeworkAssignment[],
    maxResults: number = 5
): Promise<{
    homework: HomeworkAssignment;
    hoursRemaining: number;
    isUrgent: boolean;
}[]> {
    const now = Date.now();

    const upcomingDeadlines = activeHomework
        .filter(hw => hw.scheduling?.dueDate && hw.scheduling.dueDate > now)
        .map(hw => ({
            homework: hw,
            hoursRemaining: getHoursUntilDeadline(hw.scheduling.dueDate!),
            isUrgent: getHoursUntilDeadline(hw.scheduling.dueDate!) <= 24
        }))
        .sort((a, b) => a.hoursRemaining - b.hoursRemaining)
        .slice(0, maxResults);

    return upcomingDeadlines;
}

/**
 * Format hours remaining in human-readable format
 */
export function formatTimeRemaining(hoursRemaining: number): string {
    if (hoursRemaining < 0) {
        return 'Overdue';
    }

    if (hoursRemaining < 1) {
        const minutes = Math.round(hoursRemaining * 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
    }

    if (hoursRemaining < 24) {
        const hours = Math.round(hoursRemaining);
        return `${hours} hour${hours !== 1 ? 's' : ''} remaining`;
    }

    const days = Math.round(hoursRemaining / 24);
    return `${days} day${days !== 1 ? 's' : ''} remaining`;
}

export default {
    getPendingReminders,
    sendDeadlineReminder,
    processStudentReminders,
    getUpcomingDeadlines,
    formatTimeRemaining,
    getReminderStatus,
    hasReminderBeenSent
};
