/**
 * Assignment Manager Service Unit Tests
 * Tests student-teacher assignment operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createAssignment,
    removeAssignment,
    getAssignmentsByTeacher,
    getAssignmentsByStudent,
    getAssignmentHistory,
    isStudentAssignedToTeacher,
    subscribeToAssignments,
    createStudentRequest,
    getAllAssignmentRequests,
    approveStudentRequest,
    denyStudentRequest
} from './assignmentManager';
import type { StudentTeacherAssignment, AssignmentRequest } from '../types/assignment.types';

// Mock Firebase
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockOnValue = vi.fn();
const mockRef = vi.fn();
const mockPush = vi.fn(() => ({ key: 'mock-id-123' }));

vi.mock('firebase/database', () => ({
    ref: (db: any, path: string) => mockRef(db, path),
    set: (ref: any, value: any) => mockSet(ref, value),
    get: (ref: any) => mockGet(ref),
    update: (ref: any, value: any) => mockUpdate(ref, value),
    push: () => mockPush(),
    onValue: (ref: any, callback: any) => mockOnValue(ref, callback),
}));

vi.mock('./firebase', () => ({
    database: {},
}));

vi.mock('./userService', () => ({
    getUserByEmail: vi.fn(),
    getUserById: vi.fn(),
}));

vi.mock('./notificationService', () => ({
    createNotification: vi.fn(),
}));

import { getUserByEmail, getUserById } from './userService';
import { createNotification } from './notificationService';

describe('assignmentManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ============================================================================
    // CREATE ASSIGNMENT TESTS
    // ============================================================================

    describe('createAssignment', () => {
        it('should create a new assignment successfully', async () => {
            // Mock: No existing assignment
            mockGet.mockResolvedValueOnce({ exists: () => false, val: () => null });
            // Mock: Set assignment
            mockSet.mockResolvedValueOnce(undefined);
            // Mock: Set history
            mockSet.mockResolvedValueOnce(undefined);

            const result = await createAssignment(
                'student-123',
                'teacher-456',
                'admin-789',
                ['course-1', 'course-2']
            );

            expect(result.success).toBe(true);
            expect(result.assignmentId).toBeTruthy();
            expect(mockSet).toHaveBeenCalledTimes(2); // Assignment + History
        });

        it('should validate required fields', async () => {
            const result = await createAssignment('', '', '');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required fields');
        });

        it('should prevent duplicate assignments', async () => {
            const existingAssignment: StudentTeacherAssignment = {
                id: 'existing-123',
                studentId: 'student-123',
                teacherId: 'teacher-456',
                assignedBy: 'admin-789',
                assignedAt: Date.now(),
                unassignedAt: null,
                status: 'active',
                coursesEnrolled: []
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({ 'existing-123': existingAssignment })
            });

            const result = await createAssignment(
                'student-123',
                'teacher-456',
                'admin-789'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
        });

        it('should create assignment with correct structure', async () => {
            mockGet.mockResolvedValueOnce({ exists: () => false, val: () => null });
            mockSet.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            const studentId = 'student-123';
            const teacherId = 'teacher-456';
            const assignedBy = 'admin-789';
            const courseIds = ['course-1'];

            await createAssignment(studentId, teacherId, assignedBy, courseIds);

            // Verify assignment structure
            const assignmentCall = mockSet.mock.calls[0][1];
            expect(assignmentCall).toMatchObject({
                studentId,
                teacherId,
                assignedBy,
                status: 'active',
                coursesEnrolled: courseIds
            });
            expect(assignmentCall.assignedAt).toBeGreaterThan(0);
            expect(assignmentCall.unassignedAt).toBeNull();
        });

        it('should handle empty courseIds array', async () => {
            mockGet.mockResolvedValueOnce({ exists: () => false, val: () => null });
            mockSet.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            const result = await createAssignment(
                'student-123',
                'teacher-456',
                'admin-789'
            );

            expect(result.success).toBe(true);
            const assignmentCall = mockSet.mock.calls[0][1];
            expect(assignmentCall.coursesEnrolled).toEqual([]);
        });

        it('should handle Firebase errors gracefully', async () => {
            // Mock: No existing assignment
            mockGet.mockResolvedValueOnce({ exists: () => false, val: () => null });
            // Mock: Set fails with error
            mockSet.mockRejectedValueOnce(new Error('Firebase connection failed'));

            const result = await createAssignment(
                'student-123',
                'teacher-456',
                'admin-789'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Firebase connection failed');
        });
    });

    // ============================================================================
    // REMOVE ASSIGNMENT TESTS
    // ============================================================================

    describe('removeAssignment', () => {
        it('should soft delete assignment successfully', async () => {
            const existingAssignment: StudentTeacherAssignment = {
                id: 'assignment-123',
                studentId: 'student-123',
                teacherId: 'teacher-456',
                assignedBy: 'admin-789',
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
            mockSet.mockResolvedValueOnce(undefined); // History

            const result = await removeAssignment('assignment-123', 'No longer needed');

            expect(result.success).toBe(true);
            // Verify update was called with the correct data structure
            expect(mockUpdate).toHaveBeenCalled();
            const updateCall = mockUpdate.mock.calls[0][1];
            expect(updateCall).toMatchObject({
                status: 'removed'
            });
            expect(updateCall.unassignedAt).toBeGreaterThan(0);
        });

        it('should set unassignedAt timestamp', async () => {
            const existingAssignment: StudentTeacherAssignment = {
                id: 'assignment-123',
                studentId: 'student-123',
                teacherId: 'teacher-456',
                assignedBy: 'admin-789',
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

            const beforeTime = Date.now();
            await removeAssignment('assignment-123');
            const afterTime = Date.now();

            const updateCall = mockUpdate.mock.calls[0][1];
            expect(updateCall.unassignedAt).toBeGreaterThanOrEqual(beforeTime);
            expect(updateCall.unassignedAt).toBeLessThanOrEqual(afterTime);
        });

        it('should validate assignment ID', async () => {
            const result = await removeAssignment('');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Assignment ID is required');
        });

        it('should handle non-existent assignment', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => false,
                val: () => null
            });

            const result = await removeAssignment('non-existent-123');

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should create history entry on removal', async () => {
            const existingAssignment: StudentTeacherAssignment = {
                id: 'assignment-123',
                studentId: 'student-123',
                teacherId: 'teacher-456',
                assignedBy: 'admin-789',
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

            await removeAssignment('assignment-123', 'Test reason');

            // Verify history entry was created
            expect(mockSet).toHaveBeenCalledTimes(1);
            const historyCall = mockSet.mock.calls[0][1];
            expect(historyCall).toMatchObject({
                studentId: 'student-123',
                teacherId: 'teacher-456',
                action: 'unassigned',
                reason: 'Test reason'
            });
        });
    });

    // ============================================================================
    // GET ASSIGNMENTS BY TEACHER TESTS
    // ============================================================================

    describe('getAssignmentsByTeacher', () => {
        it('should return all active assignments for a teacher', async () => {
            const mockAssignments = {
                'assign-1': {
                    id: 'assign-1',
                    studentId: 'student-1',
                    teacherId: 'teacher-123',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    status: 'active',
                    coursesEnrolled: []
                },
                'assign-2': {
                    id: 'assign-2',
                    studentId: 'student-2',
                    teacherId: 'teacher-123',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    status: 'active',
                    coursesEnrolled: []
                },
                'assign-3': {
                    id: 'assign-3',
                    studentId: 'student-3',
                    teacherId: 'teacher-456', // Different teacher
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    status: 'active',
                    coursesEnrolled: []
                }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockAssignments
            });

            const result = await getAssignmentsByTeacher('teacher-123');

            expect(result).toHaveLength(2);
            expect(result.every(a => a.teacherId === 'teacher-123')).toBe(true);
            expect(result.every(a => a.status === 'active')).toBe(true);
        });

        it('should exclude removed assignments', async () => {
            const mockAssignments = {
                'assign-1': {
                    id: 'assign-1',
                    studentId: 'student-1',
                    teacherId: 'teacher-123',
                    status: 'active',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    coursesEnrolled: []
                },
                'assign-2': {
                    id: 'assign-2',
                    studentId: 'student-2',
                    teacherId: 'teacher-123',
                    status: 'removed',
                    assignedBy: 'admin',
                    assignedAt: Date.now() - 1000000,
                    unassignedAt: Date.now(),
                    coursesEnrolled: []
                }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockAssignments
            });

            const result = await getAssignmentsByTeacher('teacher-123');

            expect(result).toHaveLength(1);
            expect(result[0].status).toBe('active');
        });

        it('should return empty array for teacher with no assignments', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => false,
                val: () => null
            });

            const result = await getAssignmentsByTeacher('teacher-no-students');

            expect(result).toEqual([]);
        });

        it('should validate teacher ID', async () => {
            const result = await getAssignmentsByTeacher('');

            expect(result).toEqual([]);
        });
    });

    // ============================================================================
    // GET ASSIGNMENTS BY STUDENT TESTS
    // ============================================================================

    describe('getAssignmentsByStudent', () => {
        it('should return all active assignments for a student', async () => {
            const mockAssignments = {
                'assign-1': {
                    id: 'assign-1',
                    studentId: 'student-123',
                    teacherId: 'teacher-1',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    status: 'active',
                    coursesEnrolled: []
                },
                'assign-2': {
                    id: 'assign-2',
                    studentId: 'student-123',
                    teacherId: 'teacher-2',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    status: 'active',
                    coursesEnrolled: []
                }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockAssignments
            });

            const result = await getAssignmentsByStudent('student-123');

            expect(result).toHaveLength(2);
            expect(result.every(a => a.studentId === 'student-123')).toBe(true);
        });

        it('should support students with multiple teachers', async () => {
            const mockAssignments = {
                'assign-1': {
                    id: 'assign-1',
                    studentId: 'student-123',
                    teacherId: 'teacher-1',
                    status: 'active',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    coursesEnrolled: []
                },
                'assign-2': {
                    id: 'assign-2',
                    studentId: 'student-123',
                    teacherId: 'teacher-2',
                    status: 'active',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    coursesEnrolled: []
                },
                'assign-3': {
                    id: 'assign-3',
                    studentId: 'student-123',
                    teacherId: 'teacher-3',
                    status: 'active',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    coursesEnrolled: []
                }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockAssignments
            });

            const result = await getAssignmentsByStudent('student-123');

            expect(result).toHaveLength(3);
            const teacherIds = result.map(a => a.teacherId);
            expect(teacherIds).toContain('teacher-1');
            expect(teacherIds).toContain('teacher-2');
            expect(teacherIds).toContain('teacher-3');
        });
    });

    // ============================================================================
    // IS STUDENT ASSIGNED TO TEACHER TESTS
    // ============================================================================

    describe('isStudentAssignedToTeacher', () => {
        it('should return true when assignment exists', async () => {
            const mockAssignments = {
                'assign-1': {
                    id: 'assign-1',
                    studentId: 'student-123',
                    teacherId: 'teacher-456',
                    status: 'active',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    coursesEnrolled: []
                }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockAssignments
            });

            const result = await isStudentAssignedToTeacher('student-123', 'teacher-456');

            expect(result).toBe(true);
        });

        it('should return false when assignment does not exist', async () => {
            mockGet.mockResolvedValueOnce({
                exists: () => false,
                val: () => null
            });

            const result = await isStudentAssignedToTeacher('student-123', 'teacher-456');

            expect(result).toBe(false);
        });

        it('should return false for removed assignments', async () => {
            const mockAssignments = {
                'assign-1': {
                    id: 'assign-1',
                    studentId: 'student-123',
                    teacherId: 'teacher-456',
                    status: 'removed',
                    assignedBy: 'admin',
                    assignedAt: Date.now() - 1000000,
                    unassignedAt: Date.now(),
                    coursesEnrolled: []
                }
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => mockAssignments
            });

            const result = await isStudentAssignedToTeacher('student-123', 'teacher-456');

            expect(result).toBe(false);
        });
    });

    // ============================================================================
    // SUBSCRIPTION TESTS
    // ============================================================================

    describe('subscribeToAssignments', () => {
        it('should call callback with user assignments', () => {
            const mockCallback = vi.fn();
            const mockAssignments = {
                'assign-1': {
                    id: 'assign-1',
                    studentId: 'student-123',
                    teacherId: 'teacher-456',
                    status: 'active',
                    assignedBy: 'admin',
                    assignedAt: Date.now(),
                    unassignedAt: null,
                    coursesEnrolled: []
                }
            };

            mockOnValue.mockImplementation((ref, callback) => {
                callback({
                    exists: () => true,
                    val: () => mockAssignments
                });
                return vi.fn(); // Unsubscribe function
            });

            subscribeToAssignments('student-123', mockCallback);

            expect(mockCallback).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        studentId: 'student-123'
                    })
                ])
            );
        });

        it('should return unsubscribe function', () => {
            const mockUnsubscribe = vi.fn();
            mockOnValue.mockReturnValue(mockUnsubscribe);

            const unsubscribe = subscribeToAssignments('student-123', vi.fn());

            expect(typeof unsubscribe).toBe('function');
            expect(unsubscribe).toBe(mockUnsubscribe);
        });

        it('should handle empty assignments', () => {
            const mockCallback = vi.fn();

            mockOnValue.mockImplementation((ref, callback) => {
                callback({
                    exists: () => false,
                    val: () => null
                });
                return vi.fn();
            });

            subscribeToAssignments('student-123', mockCallback);

            expect(mockCallback).toHaveBeenCalledWith([]);
        });
    });

    // ============================================================================
    // CREATE STUDENT REQUEST TESTS
    // ============================================================================

    describe('createStudentRequest', () => {
        it('should create request successfully', async () => {
            mockGet.mockResolvedValueOnce({ exists: () => false, val: () => null });
            mockSet.mockResolvedValueOnce(undefined);

            const result = await createStudentRequest('teacher-123', 'student@example.com');

            expect(result.success).toBe(true);
            expect(result.requestId).toBeTruthy();
            expect(mockSet).toHaveBeenCalledTimes(1);
        });

        it('should validate required fields', async () => {
            const result = await createStudentRequest('', '');

            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        it('should prevent duplicate pending requests', async () => {
            const existingRequest: AssignmentRequest = {
                id: 'request-123',
                teacherId: 'teacher-123',
                studentEmail: 'student@example.com',
                requestedAt: Date.now(),
                status: 'pending'
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => { return { 'request-123': existingRequest }; }
            });

            const result = await createStudentRequest('teacher-123', 'student@example.com');

            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
        });

        it('should create request with correct structure', async () => {
            mockGet.mockResolvedValueOnce({ exists: () => false, val: () => null });
            mockSet.mockResolvedValueOnce(undefined);

            await createStudentRequest('teacher-123', 'student@example.com');

            const requestCall = mockSet.mock.calls[0][1];
            expect(requestCall).toMatchObject({
                teacherId: 'teacher-123',
                studentEmail: 'student@example.com',
                status: 'pending'
            });
            expect(requestCall).toMatchObject({
                teacherId: 'teacher-123',
                studentEmail: 'student@example.com',
                status: 'pending'
            });
            expect(requestCall.requestedAt).toBeGreaterThan(0);
        });
    });

    // ============================================================================
    // APPROVE/DENY REQUEST TESTS
    // ============================================================================

    describe('requestManagement', () => {
        const mockRequest: AssignmentRequest = {
            id: 'request-123',
            teacherId: 'teacher-1',
            studentEmail: 'student@example.com',
            requestedAt: Date.now(),
            status: 'pending'
        };

        const mockStudent = {
            uid: 'student-123',
            email: 'student@example.com',
            displayName: 'Student Name',
            role: 'student'
        };

        describe('getAllAssignmentRequests', () => {
            it('should return all requests sorted by date', async () => {
                const req1 = { ...mockRequest, id: 'r1', requestedAt: 100 };
                const req2 = { ...mockRequest, id: 'r2', requestedAt: 200 };

                mockGet.mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({ r1: req1, r2: req2 })
                });

                const result = await getAllAssignmentRequests();
                expect(result).toHaveLength(2);
                expect(result[0].id).toBe('r2'); // Newer first
                expect(result[1].id).toBe('r1');
            });

            it('should return empty array if no requests', async () => {
                mockGet.mockResolvedValueOnce({
                    exists: () => false,
                    val: () => null
                });

                const result = await getAllAssignmentRequests();
                expect(result).toEqual([]);
            });
        });

        describe('approveStudentRequest', () => {
            it('should approve request and create assignment', async () => {
                // 1. Get request
                const mockRequestSnapshot = {
                    exists: () => true,
                    val: () => mockRequest
                };
                mockGet.mockResolvedValueOnce(mockRequestSnapshot);

                // 2. Find student (Mock userService)
                const mockStudentUser = { uid: 'student-123', email: 'student@example.com', displayName: 'Student Name' };
                (getUserByEmail as any).mockResolvedValue(mockStudentUser);

                // Mock getUserById for teacher
                (getUserById as any).mockResolvedValue({ uid: 'teacher-1', displayName: 'Teacher Name', email: 'teacher@example.com' });

                // 3. Create assignment mocks (get existing failure, set assignment success, set history success)
                mockGet.mockResolvedValueOnce({ exists: () => false, val: () => null }); // check exists assignment
                mockSet.mockResolvedValueOnce(undefined); // set assignment
                mockSet.mockResolvedValueOnce(undefined); // set history

                // 4. Update request status
                mockUpdate.mockResolvedValueOnce(undefined);

                // 5. Create notifications (mock)
                (createNotification as any).mockResolvedValue({ success: true });

                const result = await approveStudentRequest('request-123', 'admin-1');

                expect(result.success).toBe(true);
                expect(mockUpdate).toHaveBeenCalled();
                const updateArgs = mockUpdate.mock.calls[0];
                expect(updateArgs[1]).toMatchObject({ status: 'approved' });

                // Check notifications
                expect(createNotification).toHaveBeenCalledTimes(2);
            });

            it('should handle student not found', async () => {
                mockGet.mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockRequest
                });

                (getUserByEmail as any).mockResolvedValueOnce(null);

                const result = await approveStudentRequest('request-123', 'admin-1');

                expect(result.success).toBe(false);
                expect(result.error).toContain('not found');
            });

            it('should handle non-pending requests', async () => {
                mockGet.mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({ ...mockRequest, status: 'approved' })
                });

                const result = await approveStudentRequest('request-123', 'admin-1');

                expect(result.success).toBe(false);
                expect(result.error).toContain('not pending');
            });
        });

        describe('denyStudentRequest', () => {
            it('should deny request', async () => {
                mockGet.mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockRequest
                });

                mockUpdate.mockResolvedValueOnce(undefined);

                const result = await denyStudentRequest('request-123', 'admin-1');

                expect(result.success).toBe(true);
                if (mockUpdate.mock.calls.length === 0) {
                    console.error('mockUpdate was NOT called for deny');
                }

                expect(mockUpdate).toHaveBeenCalled();
                const updateArgs = mockUpdate.mock.calls[0];
                expect(updateArgs[1]).toMatchObject({ status: 'denied' });
            });
        });
    });
});
