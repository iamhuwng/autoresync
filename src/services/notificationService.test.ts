
/**
 * Notification Service Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getUserNotifications,
    getUnreadNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getPaginatedUserNotifications,
    subscribeToNotifications,
} from './notificationService';
import { endBefore, limitToLast, orderByChild } from 'firebase/database';
import { reportingService } from './reportingService';
import type { Notification } from '../types/notification.types';

// Mock Firebase
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockOnValue = vi.fn();
const mockRef = vi.fn((db: any, path: string) => path);

vi.mock('firebase/database', () => ({
    ref: (db: any, path: string) => mockRef(db, path),
    set: (ref: any, value: any) => mockSet(ref, value),
    get: (ref: any) => mockGet(ref),
    update: (ref: any, value: any) => mockUpdate(ref, value),
    onValue: (ref: any, callback: any) => mockOnValue(ref, callback),
    query: vi.fn(),
    orderByChild: vi.fn(),
    equalTo: vi.fn(),
    limitToLast: vi.fn(),
    endBefore: vi.fn(),
}));

vi.mock('./reportingService', () => ({ reportingService: { reportError: vi.fn() } }));

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

        it('adapts invalid stored metadata without trusting it', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'n1': {
                        title: 'Stored notification',
                        message: 'Legacy fields remain',
                        metadata: { schemaVersion: 99, token: 'secret' },
                        createdAt: 100,
                    },
                }),
            });

            const result = await getUserNotifications('user-123');

            expect(result[0]).toEqual({
                id: 'n1',
                type: 'info',
                title: 'Stored notification',
                message: 'Legacy fields remain',
                read: false,
                createdAt: 100,
            });
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
        it('writes only the notification read leaf', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => false,
            });
            mockSet.mockResolvedValueOnce(undefined);

            const result = await markNotificationAsRead('user-123', 'n1');

            expect(result.success).toBe(true);
            expect(mockSet).toHaveBeenCalledWith(
                'notifications/user-123/n1/read',
                true
            );
            expect(mockUpdate).not.toHaveBeenCalled();
        });

        it('does not rewrite an already-read notification', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({ read: true }),
            });

            const result = await markNotificationAsRead('user-123', 'n1');

            expect(result.success).toBe(true);
            expect(mockSet).not.toHaveBeenCalled();
            expect(mockUpdate).not.toHaveBeenCalled();
        });
    });

    describe('markAllNotificationsAsRead', () => {
        it('writes each unread notification read leaf without a root update', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    n1: {
                        id: 'n1',
                        userId: 'user-123',
                        type: 'info',
                        title: 'Legacy title',
                        message: 'Legacy message',
                        createdAt: 100,
                        read: false,
                        link: '/student/homework/legacy',
                        metadata: { legacy: true },
                    },
                    n2: {
                        id: 'n2',
                        type: 'success',
                        title: 'Current title',
                        message: 'Current message',
                        createdAt: 200,
                        read: false,
                        metadata: { schemaVersion: 1, kind: 'book' },
                    },
                    n3: { id: 'n3', createdAt: 300, read: true },
                }),
            });
            mockSet.mockResolvedValue(undefined);

            const result = await markAllNotificationsAsRead('user-123', [{ id: 'n1', read: false }, { id: 'n2', read: false }, { id: 'n3', read: true }] as Notification[]);

            expect(result.success).toBe(true);
            expect(mockSet).toHaveBeenCalledTimes(2);
            expect(mockSet).toHaveBeenCalledWith('notifications/user-123/n1/read', true);
            expect(mockSet).toHaveBeenCalledWith('notifications/user-123/n2/read', true);
            expect(mockSet.mock.calls.every(([, value]) => value === true)).toBe(true);
            expect(mockUpdate).not.toHaveBeenCalled();
        });

        it('does not write when every notification is already read', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    n1: { id: 'n1', createdAt: 100, read: true },
                }),
            });

            const result = await markAllNotificationsAsRead('user-123', [{ id: 'n1', read: true }] as Notification[]);

            expect(result.success).toBe(true);
            expect(mockSet).not.toHaveBeenCalled();
            expect(mockUpdate).not.toHaveBeenCalled();
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
            expect(result.cursor).toEqual({ createdAt: 200, id: 'n2' });
            expect(orderByChild).toHaveBeenCalledWith('createdAt');
            expect(limitToLast).toHaveBeenCalledWith(3);
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

    it('orders equal timestamps by inbox key and excludes the exact boundary on the next page', async () => {
        mockGet.mockResolvedValue({ exists: () => true, val: () => ({ z: { id: 'wrong-id', createdAt: 100 }, a: { createdAt: 100 }, middle: { createdAt: 200 } }) });
        const page = await getPaginatedUserNotifications('user-123', 2);
        expect(page.notifications.map(item => item.id)).toEqual(['middle', 'z']);
        expect(page.cursor).toEqual({ createdAt: 100, id: 'z' });
        await getPaginatedUserNotifications('user-123', 20, page.cursor);
        expect(endBefore).toHaveBeenCalledWith(100, 'z');
    });

    it('rejects unread writes for missing notifications and surfaces history read failures', async () => {
        mockGet.mockResolvedValueOnce({ exists: () => false });
        expect(await markNotificationAsRead('user-123', 'missing')).toEqual({ success: false, error: 'Notification no longer exists' });
        expect(mockSet).not.toHaveBeenCalled();
        mockGet.mockRejectedValueOnce(new Error('permission-denied'));
        await expect(getPaginatedUserNotifications('user-123')).rejects.toThrow('permission-denied');
        expect(reportingService.reportError).toHaveBeenCalledTimes(1);
        expect(reportingService.reportError).toHaveBeenCalledWith(expect.any(Error), { source: 'notification_inbox', operation: 'load_history' });
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

});
