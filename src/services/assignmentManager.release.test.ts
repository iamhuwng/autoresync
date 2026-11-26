/**
 * Integration Tests for Release Student Functionality
 *
 * Tests atomic assignment soft-removal, shared teacher-student link
 * reconciliation, and authenticated actor attribution in assignment history.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { removeAssignment, removeAssignments } from './assignmentManager';
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
                })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'assignment-1': { ...assignmentOne, status: 'removed' },
                        'assignment-2': assignmentTwo,
                    }),
                });
            mockUpdate.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            const releaseResult = await removeAssignment('assignment-1', 'Remove duplicate');

            expect(releaseResult.success).toBe(true);
            expect(mockUpdate).toHaveBeenCalledTimes(1);
            const patch = mockUpdate.mock.calls[0][1];
            expect(patch['student_teacher_assignments/assignment-1/status']).toBe('removed');
            expect(patch).not.toHaveProperty(`student_teacher_links/${mockTeacherId}/${mockStudentId}`);
        });

        it('reconciles and clears the shared link if a concurrent client removed the last remaining assignment', async () => {
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
                })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'assignment-1': { ...assignmentOne, status: 'removed' },
                        'assignment-2': { ...assignmentTwo, status: 'removed' },
                    }),
                });
            mockUpdate.mockResolvedValue(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            const releaseResult = await removeAssignment('assignment-1', 'Concurrent release');

            expect(releaseResult.success).toBe(true);
            expect(mockUpdate).toHaveBeenCalledTimes(2);
            expect(mockUpdate.mock.calls[1][1]).toEqual({
                [`student_teacher_links/${mockTeacherId}/${mockStudentId}`]: null,
            });
        });

        it('atomically releases all selected assignments for a pair and clears the shared link in one update', async () => {
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
                .mockResolvedValueOnce({ exists: () => true, val: () => assignmentTwo })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'assignment-1': assignmentOne,
                        'assignment-2': assignmentTwo,
                    }),
                });
            mockUpdate.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValue(undefined);

            const result = await removeAssignments(['assignment-1', 'assignment-2'], 'Bulk release');

            expect(result).toEqual({
                success: true,
                releasedIds: ['assignment-1', 'assignment-2'],
                failed: [],
            });
            expect(mockUpdate).toHaveBeenCalledTimes(1);
            expect(mockUpdate.mock.calls[0][1]).toMatchObject({
                'student_teacher_assignments/assignment-1/status': 'removed',
                'student_teacher_assignments/assignment-2/status': 'removed',
                [`student_teacher_links/${mockTeacherId}/${mockStudentId}`]: null,
            });
            expect(mockSet).toHaveBeenCalledTimes(2);
        });

        it('serializes concurrent removeAssignment calls for the same teacher-student pair so the shared link is cleared', async () => {
            const state: Record<string, StudentTeacherAssignment> = {
                'assignment-1': {
                    id: 'assignment-1',
                    studentId: mockStudentId,
                    teacherId: mockTeacherId,
                    assignedBy: mockAdminId,
                    assignedAt: 1000,
                    unassignedAt: null,
                    status: 'active',
                    coursesEnrolled: [],
                },
                'assignment-2': {
                    id: 'assignment-2',
                    studentId: mockStudentId,
                    teacherId: mockTeacherId,
                    assignedBy: mockAdminId,
                    assignedAt: 2000,
                    unassignedAt: null,
                    status: 'active',
                    coursesEnrolled: [],
                },
            };

            mockGet.mockImplementation(async (refArg: any) => {
                if (refArg?.path === 'student_teacher_assignments/assignment-1') {
                    return { exists: () => true, val: () => ({ ...state['assignment-1'] }) };
                }
                if (refArg?.path === 'student_teacher_assignments/assignment-2') {
                    return { exists: () => true, val: () => ({ ...state['assignment-2'] }) };
                }
                return {
                    exists: () => true,
                    val: () => JSON.parse(JSON.stringify(state)),
                };
            });
            mockUpdate.mockImplementation(async (_refArg: any, patch: Record<string, unknown>) => {
                await Promise.resolve();
                for (const [key, value] of Object.entries(patch)) {
                    const match = key.match(/^student_teacher_assignments\/([^/]+)\/status$/);
                    if (match && state[match[1]]) {
                        state[match[1]].status = value as StudentTeacherAssignment['status'];
                    }
                }
            });
            mockSet.mockResolvedValue(undefined);

            const [first, second] = await Promise.all([
                removeAssignment('assignment-1', 'Concurrent 1'),
                removeAssignment('assignment-2', 'Concurrent 2'),
            ]);

            expect(first.success).toBe(true);
            expect(second.success).toBe(true);
            const patches = mockUpdate.mock.calls.map((call) => call[1] as Record<string, unknown>);
            expect(
                patches.some(
                    (patch) => patch[`student_teacher_links/${mockTeacherId}/${mockStudentId}`] === null
                )
            ).toBe(true);
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
