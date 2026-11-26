/**
 * Integration Tests for Release Student Functionality
 *
 * Tests atomic assignment soft-removal, shared teacher-student link
 * reconciliation, and authenticated actor attribution in assignment history.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { removeAssignment } from './assignmentManager';
import type { StudentTeacherAssignment } from '../types/assignment.types';

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockRef = vi.fn((_db: any, path?: string) => ({ path }));
const mockPush = vi.fn(() => ({ key: 'mock-id-123' }));
const mockQuery = vi.fn((...args: any[]) => ({ args }));
const mockOrderByChild = vi.fn((field: string) => ({ orderByChild: field }));
const mockEqualTo = vi.fn((value: any) => ({ equalTo: value }));
const mockGetAuth = vi.fn(() => ({ currentUser: { uid: 'teacher-test-456' } as { uid: string } | null }));

vi.mock('firebase/database', () => ({
    ref: (db: any, path?: string) => mockRef(db, path),
    set: (refArg: any, value: any) => mockSet(refArg, value),
    get: (refArg: any) => mockGet(refArg),
    update: (refArg: any, value: any) => mockUpdate(refArg, value),
    push: () => mockPush(),
    query: (...args: any[]) => mockQuery(...args),
    orderByChild: (field: string) => mockOrderByChild(field),
    equalTo: (value: any) => mockEqualTo(value),
    serverTimestamp: () => 1234567890,
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
        it('atomically soft-deletes assignment and clears link when no other active assignment exists', async () => {
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

            mockGet
                .mockResolvedValueOnce({ exists: () => true, val: () => existingAssignment })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({ 'assignment-123': existingAssignment }),
                });
            mockUpdate.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            const releaseResult = await removeAssignment('assignment-123', 'Released by teacher');

            expect(releaseResult.success).toBe(true);

            expect(mockUpdate).toHaveBeenCalledTimes(1);
            const patch = mockUpdate.mock.calls[0][1];
            expect(patch).toMatchObject({
                'student_teacher_assignments/assignment-123/status': 'removed',
                [`student_teacher_links/${mockTeacherId}/${mockStudentId}`]: null,
            });
            expect(patch['student_teacher_assignments/assignment-123/unassignedAt']).toBeGreaterThan(0);

            expect(mockSet).toHaveBeenCalledTimes(1);
            const historyCall = mockSet.mock.calls[0][1];
            expect(historyCall).toMatchObject({
                studentId: mockStudentId,
                teacherId: mockTeacherId,
                action: 'unassigned',
                performedBy: mockTeacherId,
                reason: 'Released by teacher',
            });
            expect(historyCall.performedBy).not.toBe(mockAdminId);
        });

        it('retains the shared teacher-student link when another active assignment remains', async () => {
            const assignmentOne: StudentTeacherAssignment = {
                id: 'assignment-1',
                studentId: mockStudentId,
                teacherId: mockTeacherId,
                assignedBy: mockAdminId,
                assignedAt: Date.now() - 1000000,
                unassignedAt: null,
                status: 'active',
                coursesEnrolled: [],
            };
            const assignmentTwo: StudentTeacherAssignment = {
                ...assignmentOne,
                id: 'assignment-2',
            };

            mockGet
                .mockResolvedValueOnce({ exists: () => true, val: () => assignmentOne })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'assignment-1': assignmentOne,
                        'assignment-2': assignmentTwo,
                    }),
                });
            mockUpdate.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            const releaseResult = await removeAssignment('assignment-1', 'Remove duplicate');

            expect(releaseResult.success).toBe(true);
            const patch = mockUpdate.mock.calls[0][1];
            expect(patch['student_teacher_assignments/assignment-1/status']).toBe('removed');
            expect(patch).not.toHaveProperty(`student_teacher_links/${mockTeacherId}/${mockStudentId}`);
        });

        it('rejects release when no authenticated user is signed in', async () => {
            mockGetAuth.mockReturnValue({ currentUser: null });

            const releaseResult = await removeAssignment('assignment-123', 'Unauthenticated');

            expect(releaseResult.success).toBe(false);
            expect(releaseResult.error).toContain('Authentication required');
            expect(mockGet).not.toHaveBeenCalled();
            expect(mockUpdate).not.toHaveBeenCalled();
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

            mockGet
                .mockResolvedValueOnce({ exists: () => true, val: () => existingAssignment })
                .mockResolvedValueOnce({ exists: () => false, val: () => null });
            mockUpdate.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            const releaseResult = await removeAssignment('assignment-456');

            expect(releaseResult.success).toBe(true);
            const historyCall = mockSet.mock.calls[0][1];
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
