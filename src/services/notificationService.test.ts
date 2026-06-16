
/**
 * Notification Service Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createNotification,
    getUserNotifications,
    getUnreadNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getPaginatedUserNotifications,
    subscribeToNotifications,
    sendSessionOpenedNotifications,
    sendTestStartedNotifications,
} from './notificationService';
import type { Notification } from '../types/notification.types';

// Mock Firebase
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockOnValue = vi.fn();
const mockRef = vi.fn((db: any, path: string) => path);
const mockPush = vi.fn(() => ({ key: 'mock-notif-id' }));

vi.mock('firebase/database', () => ({
    ref: (db: any, path: string) => mockRef(db, path),
    set: (ref: any, value: any) => mockSet(ref, value),
    get: (ref: any) => mockGet(ref),
    update: (ref: any, value: any) => mockUpdate(ref, value),
    push: () => mockPush(),
    onValue: (ref: any, callback: any) => mockOnValue(ref, callback),
    query: vi.fn(),
    orderByChild: vi.fn(),
    equalTo: vi.fn(),
    limitToLast: vi.fn(),
    endBefore: vi.fn(),
}));

vi.mock('./firebase', () => ({
    database: {},
}));

describe('notificationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createNotification', () => {
        it('should create notification successfully', async () => {
            mockSet.mockResolvedValueOnce(undefined);

            const result = await createNotification({
                userId: 'user-123',
                type: 'info',
                title: 'Test Notification',
                message: 'This is a test'
            });

            expect(result.success).toBe(true);
            expect(result.notificationId).toBe('mock-notif-id');
            expect(mockSet).toHaveBeenCalledWith(
                'notifications/user-123/mock-notif-id',
                expect.objectContaining({
                    title: 'Test Notification',
                    read: false
                })
            );
        });

        it('should validate required fields', async () => {
            const result = await createNotification({
                userId: '',
                type: 'info',
                title: '',
                message: ''
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required fields');
        });
    });

    describe('getUserNotifications', () => {
        it('should return user notifications sorted by date', async () => {
            const mockNotifs = {
                'n1': { id: 'n1', createdAt: 100, read: true },
                'n2': { id: 'n2', createdAt: 200, read: false }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockNotifs
            });

            const result = await getUserNotifications('user-123');

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('n2'); // Newer first
            expect(result[1].id).toBe('n1');
        });

        it('should return empty array if no notifications', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => false,
                val: () => null
            });

            const result = await getUserNotifications('user-123');
            expect(result).toEqual([]);
        });
    });

    describe('getUnreadNotifications', () => {
        it('should return only unread notifications', async () => {
            const mockNotifs = {
                'n1': { id: 'n1', createdAt: 100, read: true },
                'n2': { id: 'n2', createdAt: 200, read: false }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockNotifs
            });

            const result = await getUnreadNotifications('user-123');

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('n2');
        });
    });

    describe('markNotificationAsRead', () => {
        it('should mark notification as read', async () => {
            mockUpdate.mockResolvedValueOnce(undefined);

            const result = await markNotificationAsRead('user-123', 'n1');

            expect(result.success).toBe(true);
            expect(mockUpdate).toHaveBeenCalledWith(
                'notifications/user-123/n1',
                { read: true }
            );
        });
    });

    describe('getPaginatedUserNotifications', () => {
        it('should return paginated notifications and correctly set hasMore', async () => {
            const mockNotifs = {
                'n1': { id: 'n1', createdAt: 100 },
                'n2': { id: 'n2', createdAt: 200 },
                'n3': { id: 'n3', createdAt: 300 }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockNotifs
            });

            const result = await getPaginatedUserNotifications('user-123', 2);

            expect(result.notifications).toHaveLength(2); // Since we pass limitCount=2, it pops the 3rd one out
            expect(result.hasMore).toBe(true);
            expect(result.lastKey).toBe('n2');
        });

        it('should return hasMore=false if less than limitCount', async () => {
            const mockNotifs = {
                'n1': { id: 'n1', createdAt: 100 },
                'n2': { id: 'n2', createdAt: 200 }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockNotifs
            });

            const result = await getPaginatedUserNotifications('user-123', 5);

            expect(result.notifications).toHaveLength(2);
            expect(result.hasMore).toBe(false);
        });
    });

    describe('subscriptions', () => {
        it('does not log when attaching a real-time notification subscription', () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            mockOnValue.mockReturnValueOnce(() => {});

            subscribeToNotifications('user-123', vi.fn());

            expect(consoleSpy).not.toHaveBeenCalled();
            expect(mockOnValue).toHaveBeenCalledTimes(1);
        });
    });

    describe('live session links', () => {
        it('routes session-opened notifications through the waiting room', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'student-1': true,
                    'student-2': true
                })
            });
            mockUpdate.mockResolvedValueOnce(undefined);

            await sendSessionOpenedNotifications('class-1', 'LIVE123', 'test', 'IELTS Class');

            const [, updates] = mockUpdate.mock.calls[0];
            expect(updates['notifications/student-1/mock-notif-id'].link).toBe('/student-wait/LIVE123');
            expect(updates['notifications/student-2/mock-notif-id'].link).toBe('/student-wait/LIVE123');
        });

        it('routes test-started notifications through the waiting room', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'student-1': true
                })
            });
            mockUpdate.mockResolvedValueOnce(undefined);

            await sendTestStartedNotifications('class-1', 'LIVE456', 'IELTS Reading');

            const [, updates] = mockUpdate.mock.calls[0];
            expect(updates['notifications/student-1/mock-notif-id'].link).toBe('/student-wait/LIVE456');
        });
    });
});
