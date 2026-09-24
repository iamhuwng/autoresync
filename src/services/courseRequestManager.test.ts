import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createCourseRequest,
    getRequestsByTeacher,
    processCourseRequest,
    cleanupExpiredRequests
} from './courseRequestManager';
import { get, set, ref, push, query, update } from 'firebase/database';

vi.mock('firebase/database');
vi.mock('firebase/auth', () => ({
    getAuth: () => ({ currentUser: { uid: 't1', getIdToken: async () => 'token' } }),
    GoogleAuthProvider: class { setCustomParameters() {} },
}));
vi.mock('./enrollmentActionClient', () => ({ wakeCourseRequestNotification: vi.fn() }));

describe('courseRequestManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (ref as any).mockReturnValue({});
        (push as any).mockReturnValue({ key: 'req_123' });
    });

    describe('createCourseRequest', () => {
        it('should create a new join request with 7-day expiration', async () => {
            (get as any).mockResolvedValue({ exists: () => false }); // No pending

            const result = await createCourseRequest(
                's1', 'Student A', 'c1', 'Course A', 't1', 'join'
            );

            expect(result.success).toBe(true);
            expect(result.requestId).toBe('req_123');
            expect(set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                studentId: 's1',
                type: 'join',
                status: 'pending',
                expiresAt: expect.any(Number)
            }));
        });

        it('should prevent multiple pending requests of same type', async () => {
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => ({ req1: { courseId: 'c1', type: 'join', status: 'pending' } })
            });

            const result = await createCourseRequest(
                's1', 'Student A', 'c1', 'Course A', 't1', 'join'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('already have a pending join request');
        });
    });

    describe('getRequestsByTeacher', () => {
        it('should return sorted requests for a teacher', async () => {
            const mockData = {
                r1: { teacherId: 't1', requestedAt: 1000 },
                r2: { teacherId: 't1', requestedAt: 2000 }
            };
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockData
            });

            const results = await getRequestsByTeacher('t1');
            expect(results).toHaveLength(2);
            expect(results[0].requestedAt).toBe(2000); // Descending
        });
    });

    describe('processCourseRequest', () => {
        it('should update request status to approved', async () => {
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => ({
                    id: 'req1', studentId: 's1', courseId: 'c1', teacherId: 't1',
                    type: 'join', status: 'pending', requestedAt: Date.now() - 1000,
                    expiresAt: Date.now() + 60_000,
                }),
            });
            const result = await processCourseRequest('req1', 'approved', 't1');
            expect(result.success).toBe(true);
            expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                status: 'approved', processedBy: 't1', notificationIntent: expect.objectContaining({
                    actionId: 'req1', kind: 'course-request-decision', attempts: 0, state: 'pending',
                }),
            }));
        });
    });

    describe('cleanupExpiredRequests', () => {
        it('should mark old pending requests as expired', async () => {
            const pastTime = Date.now() - 1000;
            const mockData = {
                r_old: { status: 'pending', expiresAt: pastTime }
            };
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockData
            });

            const expiredCount = await cleanupExpiredRequests();
            expect(expiredCount).toBe(1);
            expect(update).toHaveBeenCalledWith(expect.anything(), {
                'r_old/status': 'expired'
            });
        });
    });
});
