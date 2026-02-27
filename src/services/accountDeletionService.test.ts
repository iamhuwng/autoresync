/**
 * Unit Tests for Account Deletion Service
 * PRD-0015: Phase 9 & 10 - GDPR Compliance Testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    requestDeletion,
    cancelDeletion,
    hardDelete,
    getDeletedUsers,
    getPendingDeletions,
    scheduledHardDelete,
    hasPendingDeletion,
    getDaysUntilDeletion,
    DeletedUser
} from './accountDeletionService';
import { ref, get, update, remove } from 'firebase/database';

// Mock Firebase
vi.mock('./firebase', () => ({
    database: {}
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    query: vi.fn(),
    orderByChild: vi.fn(),
    equalTo: vi.fn()
}));

describe('Account Deletion Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('requestDeletion', () => {
        it('should create deletion request with grace period', async () => {
            const now = Date.now();
            vi.setSystemTime(now);

            const mockUser = {
                userId: 'user-123',
                email: 'test@example.com',
                displayName: 'Test User'
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUser
            });

            await requestDeletion('user-123', 'User requested deletion');

            // Check deletion record was created
            expect(update).toHaveBeenCalledTimes(2);

            // First call should be to deleted_users
            const deletionCall = (update as any).mock.calls[0];
            const deletionData = deletionCall[1];

            expect(deletionData.userId).toBe('user-123');
            expect(deletionData.status).toBe('pending');
            expect(deletionData.requestedAt).toBe(now);
            expect(deletionData.scheduledDeletionAt).toBe(now + 30 * 24 * 60 * 60 * 1000);
            expect(deletionData.reason).toBe('User requested deletion');

            // Second call should mark user
            const userCall = (update as any).mock.calls[1];
            const userData = userCall[1];

            expect(userData.deletionRequested).toBe(true);
            expect(userData.deletionRequestedAt).toBe(now);
        });

        it('should throw error if user not found', async () => {
            (get as any).mockResolvedValue({
                exists: () => false,
                val: () => null
            });

            await expect(requestDeletion('non-existent'))
                .rejects.toThrow('User not found');
        });

        it('should throw error if userId is missing', async () => {
            await expect(requestDeletion(''))
                .rejects.toThrow('User ID is required');
        });
    });

    describe('cancelDeletion', () => {
        it('should cancel pending deletion', async () => {
            const mockUser = {
                userId: 'user-123',
                email: 'test@example.com',
                deletionRequested: true,
                deletionRequestedAt: Date.now(),
                scheduledDeletionAt: Date.now() + 1000000
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUser
            });

            await cancelDeletion('user-123');

            expect(update).toHaveBeenCalledTimes(2);

            // Verify user flags removed
            const userCall = (update as any).mock.calls[0];
            const userData = userCall[1];

            expect(userData.deletionRequested).toBe(false);
            expect(userData.deletionRequestedAt).toBeNull();
            expect(userData.scheduledDeletionAt).toBeNull();

            // Verify deletion record updated
            const deletionCall = (update as any).mock.calls[1];
            const deletionData = deletionCall[1];

            expect(deletionData.status).toBe('cancelled');
            expect(deletionData.cancelledAt).toBeDefined();
        });

        it('should throw error if no deletion request found', async () => {
            const mockUser = {
                userId: 'user-123',
                deletionRequested: false
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUser
            });

            await expect(cancelDeletion('user-123'))
                .rejects.toThrow('No deletion request found for this user');
        });
    });

    describe('hardDelete', () => {
        it('should permanently delete all user data', async () => {
            await hardDelete('user-123', 'admin-1');

            // Should delete from multiple locations
            // User, results, academic records, badges, notifications
            expect(remove).toHaveBeenCalledTimes(5);

            // Should update deletion record
            expect(update).toHaveBeenCalledTimes(1);

            const updateCall = (update as any).mock.calls[0];
            const deletionData = updateCall[1];

            expect(deletionData.status).toBe('completed');
            expect(deletionData.completedBy).toBe('admin-1');
            expect(deletionData.completedAt).toBeDefined();
        });

        it('should throw error if userId missing', async () => {
            await expect(hardDelete('', 'admin-1'))
                .rejects.toThrow('User ID is required');
        });

        it('should throw error if adminId missing', async () => {
            await expect(hardDelete('user-123', ''))
                .rejects.toThrow('Admin ID is required');
        });
    });

    describe('getDeletedUsers', () => {
        it('should return all deleted users sorted by date', async () => {
            const mockUsers = {
                'user-1': {
                    userId: 'user-1',
                    requestedAt: 1000,
                    status: 'pending'
                },
                'user-2': {
                    userId: 'user-2',
                    requestedAt: 2000,
                    status: 'cancelled'
                },
                'user-3': {
                    userId: 'user-3',
                    requestedAt: 1500,
                    status: 'pending'
                }
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUsers
            });

            const result = await getDeletedUsers();

            expect(result).toHaveLength(3);
            // Should be sorted newest first
            expect(result[0].requestedAt).toBe(2000);
            expect(result[1].requestedAt).toBe(1500);
            expect(result[2].requestedAt).toBe(1000);
        });

        it('should return empty array if no deleted users', async () => {
            (get as any).mockResolvedValue({
                exists: () => false,
                val: () => null
            });

            const result = await getDeletedUsers();
            expect(result).toEqual([]);
        });
    });

    describe('getPendingDeletions', () => {
        it('should return only pending deletions', async () => {
            const mockUsers = {
                'user-1': {
                    userId: 'user-1',
                    requestedAt: 1000,
                    status: 'pending'
                },
                'user-2': {
                    userId: 'user-2',
                    requestedAt: 2000,
                    status: 'cancelled'
                },
                'user-3': {
                    userId: 'user-3',
                    requestedAt: 1500,
                    status: 'completed'
                },
                'user-4': {
                    userId: 'user-4',
                    requestedAt: 3000,
                    status: 'pending'
                }
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUsers
            });

            const result = await getPendingDeletions();

            expect(result).toHaveLength(2);
            expect(result.every(u => u.status === 'pending')).toBe(true);
        });
    });

    describe('scheduledHardDelete', () => {
        it('should process expired deletions only', async () => {
            const now = Date.now();
            vi.setSystemTime(now);

            const mockUsers = {
                'user-1': {
                    userId: 'user-1',
                    scheduledDeletionAt: now - 1000, // Expired
                    status: 'pending'
                },
                'user-2': {
                    userId: 'user-2',
                    scheduledDeletionAt: now + 100000, // Not expired
                    status: 'pending'
                },
                'user-3': {
                    userId: 'user-3',
                    scheduledDeletionAt: now - 5000, // Expired
                    status: 'pending'
                }
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUsers
            });

            const result = await scheduledHardDelete('system');

            // Should process 2 expired users
            expect(result.processed).toBe(2);
            expect(result.failed).toBe(0);

            // Should call remove for each user's data (5 calls per user)
            // 2 users × 5 = 10 remove calls
            expect(remove).toHaveBeenCalledTimes(10);
        });

        it('should handle deletion failures gracefully', async () => {
            const now = Date.now();
            vi.setSystemTime(now);

            const mockUsers = {
                'user-1': {
                    userId: 'user-1',
                    scheduledDeletionAt: now - 1000,
                    status: 'pending'
                }
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUsers
            });

            // Mock remove to fail
            (remove as any).mockRejectedValue(new Error('Database error'));

            const result = await scheduledHardDelete('system');

            expect(result.processed).toBe(0);
            expect(result.failed).toBe(1);
        });
    });

    describe('hasPendingDeletion', () => {
        it('should return true if deletion is pending', async () => {
            const mockUser = {
                deletionRequested: true
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUser
            });

            const result = await hasPendingDeletion('user-123');
            expect(result).toBe(true);
        });

        it('should return false if no deletion pending', async () => {
            const mockUser = {
                deletionRequested: false
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUser
            });

            const result = await hasPendingDeletion('user-123');
            expect(result).toBe(false);
        });

        it('should return false if user not found', async () => {
            (get as any).mockResolvedValue({
                exists: () => false,
                val: () => null
            });

            const result = await hasPendingDeletion('user-123');
            expect(result).toBe(false);
        });
    });

    describe('getDaysUntilDeletion', () => {
        it('should return correct days remaining', async () => {
            const now = Date.now();
            vi.setSystemTime(now);

            const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;

            const mockUser = {
                deletionRequested: true,
                scheduledDeletionAt: now + fiveDaysInMs
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUser
            });

            const result = await getDaysUntilDeletion('user-123');
            expect(result).toBe(5);
        });

        it('should return 0 if deletion time passed', async () => {
            const now = Date.now();
            vi.setSystemTime(now);

            const mockUser = {
                deletionRequested: true,
                scheduledDeletionAt: now - 1000
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUser
            });

            const result = await getDaysUntilDeletion('user-123');
            expect(result).toBe(0);
        });

        it('should return null if no deletion pending', async () => {
            const mockUser = {
                deletionRequested: false
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUser
            });

            const result = await getDaysUntilDeletion('user-123');
            expect(result).toBeNull();
        });

        it('should round up to next day', async () => {
            const now = Date.now();
            vi.setSystemTime(now);

            // 2.5 days should round up to 3
            const twoDaysAndHalfMs = 2.5 * 24 * 60 * 60 * 1000;

            const mockUser = {
                deletionRequested: true,
                scheduledDeletionAt: now + twoDaysAndHalfMs
            };

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockUser
            });

            const result = await getDaysUntilDeletion('user-123');
            expect(result).toBe(3);
        });
    });
});
