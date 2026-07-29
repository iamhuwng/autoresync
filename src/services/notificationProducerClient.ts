import { getAuth } from 'firebase/auth';
import { buildRoute } from '../constants/routes';
import type { NotificationType } from '../types/notification.types';
import {
    createNotificationCommandClient,
    NotificationCommandClientError,
    type NotificationCommandProducerFamily,
} from './notificationCommandClient';

export interface TrustedProducerNotificationInput {
    readonly producerFamily: NotificationCommandProducerFamily;
    readonly authorityRecordId: string;
    readonly recipientId: string;
    readonly operationKey: string;
    readonly type: NotificationType;
    readonly title: string;
    readonly message: string;
    readonly link?: string;
}

export interface TrustedProducerClientOptions {
    readonly workerOrigin?: string;
    readonly getIdToken?: (forceRefresh?: boolean) => Promise<string>;
    readonly fetchImpl?: typeof fetch;
}

export interface TrustedProducerNotificationResult {
    readonly success: boolean;
    readonly notificationId?: string;
    readonly error?: string;
}

const hash32 = (value: string, seed: number): number => {
    let hash = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
    }
    return hash;
};

export const notificationOperationId = (operationKey: string): string => {
    const normalized = operationKey.trim();
    if (!normalized) throw new Error('notification_operation_key_required');
    const hex = [0, 1, 2, 3]
        .map((seed) => hash32(`${normalized}:${seed}`, seed).toString(16).padStart(8, '0'))
        .join('');
    const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
    return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const defaultGetIdToken = async (forceRefresh = false): Promise<string> => {
    const user = getAuth().currentUser;
    return user ? user.getIdToken(forceRefresh) : '';
};

const createClient = (options: TrustedProducerClientOptions) => {
    const workerOrigin = options.workerOrigin?.trim()
        || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim();
    if (!workerOrigin) return null;
    return createNotificationCommandClient({
        workerOrigin,
        getIdToken: options.getIdToken ?? defaultGetIdToken,
        fetchImpl: options.fetchImpl,
    });
};

export async function createTrustedNotification(
    input: TrustedProducerNotificationInput,
    options: TrustedProducerClientOptions = {},
): Promise<TrustedProducerNotificationResult> {
    try {
        const client = createClient(options);
        if (!client) return { success: false, error: 'notification_command_unavailable' };
        const operationId = notificationOperationId(`${input.operationKey}:${input.recipientId}`);
        const result = await client.create({
            schemaVersion: 1,
            commandType: 'create-notification',
            operationId,
            producerFamily: input.producerFamily,
            recipientId: input.recipientId,
            authority: {
                kind: input.producerFamily,
                recordId: input.authorityRecordId,
            },
            notification: {
                type: input.type,
                title: input.title,
                message: input.message,
                ...(input.link === undefined ? {} : { link: input.link }),
            },
        });
        return { success: true, notificationId: result.notificationId };
    } catch (error) {
        return {
            success: false,
            error: error instanceof NotificationCommandClientError
                ? error.code
                : error instanceof Error ? error.message : 'notification_command_failed',
        };
    }
}

export async function createTrustedBulkNotifications(
    recipientIds: readonly string[],
    input: Omit<TrustedProducerNotificationInput, 'recipientId'>,
    options: TrustedProducerClientOptions = {},
): Promise<{ success: boolean; notificationIds?: string[]; error?: string }> {
    const uniqueRecipientIds = [...new Set(recipientIds.filter(Boolean))];
    if (uniqueRecipientIds.length === 0) {
        return { success: false, error: 'notification_recipients_required' };
    }
    const results = await Promise.all(uniqueRecipientIds.map((recipientId) => createTrustedNotification({
        ...input,
        recipientId,
    }, options)));
    const notificationIds = results.flatMap((result) => result.notificationId ? [result.notificationId] : []);
    const failed = results.find((result) => !result.success);
    return failed
        ? { success: false, notificationIds, error: failed.error }
        : { success: true, notificationIds };
}

export const sendTrustedHomeworkReminderNotification = (
    studentId: string,
    homeworkId: string,
    homeworkTitle: string,
    teacherName?: string,
    reminderKey = String(Date.now()),
): Promise<TrustedProducerNotificationResult> => createTrustedNotification({
    producerFamily: 'deadline',
    authorityRecordId: homeworkId,
    recipientId: studentId,
    operationKey: `teacher-manual-reminder:${homeworkId}:${reminderKey}`,
    type: 'homework_reminder',
    title: '⚡ Homework Reminder',
    message: `${teacherName || 'Your teacher'} sent you a reminder for "${homeworkTitle}".`,
    link: buildRoute('STUDENT_HOMEWORK_DETAIL', { homeworkId }),
});
