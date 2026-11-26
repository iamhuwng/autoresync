/**
 * Integration Tests for Release Student Functionality
 *
 * Tests releasing a student from a teacher assignment, including
 * authenticated actor attribution in assignment history.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { removeAssignment } from './assignmentManager';
import type { StudentTeacherAssignment } from '../types/assignment.types';

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockRef = vi.fn((_db: any, path: string) => ({ path }));
const mockPush = vi.fn(() => ({ key: 'mock-id-123' }));
const mockGetAuth = vi.fn(() => ({ currentUser: { uid: 'teacher-test-456' } }));

vi.mock('firebase/database', () => ({
    ref: (db: any, path: string) => mockRef(db, path),
    set: (ref: any, value: any) => mockSet(ref, value),
    get: (ref: any) => mockGet(ref),
    update: (ref: any, value: any) => mockUpdate(ref, value),
    push: () => mockPush(),
}));

vi.mock('firebase/auth', () => ({
    getAuth: () => mockGetAuth(),
}));

vi.mock('./firebase', () => ({
    database: {},
}));

describe('Release Student Integration Tests', () => {
    const mockStudentId = 'student-test-123';
    const mockTeacherId = 'teacher-test-456';
    const mockAdminId = 'admin-test-789';

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAuth.mockReturnValue({ currentUser: { uid: mockTeacherId } });
    });

    describe('Release Student Workflow', () => {
        it('soft-deletes assignment, removes link, and records the authenticated actor in history', async () => {
            const existingAssignment: StudentTeacherAssignment = {
                id: 'assignment-123',
                studentId: mockStudentId,
                teacherId: mockTeacherId,
                assignedBy: mockAdminId,
                assignedAt: Date.now() - 1000000,
                unassignedAt: null,
                status: 'active',
                coursesEnrolled: ['course-1', 'course-2']
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => existingAssignment
            });
            mockUpdate.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            const releaseResult = await removeAssignment('assignment-123', 'Released by teacher');

            expect(releaseResult.success).toBe(true);

            expect(mockUpdate).toHaveBeenCalledTimes(1);
            const updateCall = mockUpdate.mock.calls[0][1];
            expect(updateCall).toMatchObject({ status: 'removed' });
            expect(updateCall.unassignedAt).toBeGreaterThan(0);

            expect(mockSet).toHaveBeenCalledTimes(2);
            expect(mockSet.mock.calls[0][0]).toEqual({
                path: `student_teacher_links/${mockTeacherId}/${mockStudentId}`,
            });
            expect(mockSet.mock.calls[0][1]).toBeNull();

            const historyCall = mockSet.mock.calls[1][1];
            expect(historyCall).toMatchObject({
                studentId: mockStudentId,
                teacherId: mockTeacherId,
                action: 'unassigned',
                performedBy: mockTeacherId,
                reason: 'Released by teacher',
            });
            expect(historyCall.performedBy).not.toBe(mockAdminId);
        });

        it('defaults reason to Released when omitted', async () => {
            const existingAssignment: StudentTeacherAssignment = {
                id: 'assignment-456',
                studentId: mockStudentId,
                teacherId: mockTeacherId,
                assignedBy: mockAdminId,
                assignedAt: Date.now() - 1000000,
                unassignedAt: null,
                status: 'active',
                coursesEnrolled: []
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => existingAssignment
            });
            mockUpdate.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            const releaseResult = await removeAssignment('assignment-456');

            expect(releaseResult.success).toBe(true);
            const historyCall = mockSet.mock.calls[1][1];
            expect(historyCall.reason).toBe('Released');
            expect(historyCall.performedBy).toBe(mockTeacherId);
        });

        it('handles errors gracefully during release', async () => {
            mockGet.mockRejectedValueOnce(new Error('Database connection failed'));

            const releaseResult = await removeAssignment('assignment-789', 'Test release');

            expect(releaseResult.success).toBe(false);
            expect(releaseResult.error).toContain('Database connection failed');
        });

        it('validates assignment exists before releasing', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => false,
                val: () => null
            });

            const releaseResult = await removeAssignment('non-existent-id', 'Test');

            expect(releaseResult.success).toBe(false);
            expect(releaseResult.error).toContain('not found');
        });
    });
});
