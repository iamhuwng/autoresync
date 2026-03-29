/**
 * Integration Tests for Release Student Functionality
 * 
 * Tests the complete flow of releasing a student from a teacher assignment
 * with optional course unenrollment.
 * 
 * Note: Unit tests for removeAssignment are in assignmentManager.test.ts
 * These tests focus on the integration workflow.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { removeAssignment } from './assignmentManager';
import type { StudentTeacherAssignment } from '../types/assignment.types';

// Mock Firebase
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockRef = vi.fn();
const mockPush = vi.fn(() => ({ key: 'mock-id-123' }));

vi.mock('firebase/database', () => ({
    ref: (db: any, path: string) => mockRef(db, path),
    set: (ref: any, value: any) => mockSet(ref, value),
    get: (ref: any) => mockGet(ref),
    update: (ref: any, value: any) => mockUpdate(ref, value),
    push: () => mockPush(),
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
    });

    describe('Release Student Workflow', () => {
        it('should successfully release student and track unenrollment in history', async () => {
            // Arrange: Mock existing assignment
            const existingAssignment: StudentTeacherAssignment = {
                id: 'assignment-123',
                studentId: mockStudentId,
                teacherId: mockTeacherId,
                assignedBy: mockAdminId,
                assignedAt: Date.now() - 1000000,
                unassignedAt: null,
                status: 'active',
                coursesEnrolled: ['course-1', 'course-2', 'course-3']
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => existingAssignment
            });
            mockUpdate.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined); // History entry

            // Act: Release with course unenrollment
            const coursesToUnenroll = ['course-1', 'course-2'];
            const releaseResult = await removeAssignment(
                'assignment-123',
                'Released by admin',
                coursesToUnenroll
            );

            // Assert: Release was successful
            expect(releaseResult.success).toBe(true);

            // Verify assignment was updated with soft delete
            expect(mockUpdate).toHaveBeenCalled();
            const updateCall = mockUpdate.mock.calls[0][1];
            expect(updateCall).toMatchObject({
                status: 'removed'
            });
            expect(updateCall.unassignedAt).toBeGreaterThan(0);

            // Verify history entry includes unenrollment information
            expect(mockSet).toHaveBeenCalledTimes(2);
            const historyCall = mockSet.mock.calls[1][1];
            expect(historyCall).toMatchObject({
                studentId: mockStudentId,
                teacherId: mockTeacherId,
                action: 'unassigned',
                coursesEnrolled: coursesToUnenroll,
                reason: 'Released by admin' // Custom reason is used as-is
            });
            // Courses are tracked in coursesEnrolled field
            expect(historyCall.coursesEnrolled).toEqual(coursesToUnenroll);
        });

        it('should release student without course unenrollment when no courses specified', async () => {
            // Arrange
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

            // Act: Release without course unenrollment
            const releaseResult = await removeAssignment(
                'assignment-456',
                'Student completed program'
            );

            // Assert
            expect(releaseResult.success).toBe(true);

            // Verify history shows simple release
            const historyCall = mockSet.mock.calls[1][1];
            expect(historyCall.reason).toBe('Student completed program');
            expect(historyCall.coursesEnrolled).toBeUndefined();
        });

        it('should handle errors gracefully during release', async () => {
            // Arrange: Mock Firebase error
            mockGet.mockRejectedValueOnce(new Error('Database connection failed'));

            // Act
            const releaseResult = await removeAssignment(
                'assignment-789',
                'Test release'
            );

            // Assert: Error handled gracefully
            expect(releaseResult.success).toBe(false);
            expect(releaseResult.error).toBeDefined();
            expect(releaseResult.error).toContain('Database connection failed');
        });

        it('should validate assignment exists before releasing', async () => {
            // Arrange: Mock non-existent assignment
            mockGet.mockResolvedValueOnce({
                exists: () => false,
                val: () => null
            });

            // Act
            const releaseResult = await removeAssignment(
                'non-existent-id',
                'Test'
            );

            // Assert
            expect(releaseResult.success).toBe(false);
            expect(releaseResult.error).toContain('not found');
        });

        it('should track multiple course unenrollments in history', async () => {
            // Arrange
            const manyCourses = ['course-1', 'course-2', 'course-3', 'course-4', 'course-5'];
            const existingAssignment: StudentTeacherAssignment = {
                id: 'assignment-multi',
                studentId: mockStudentId,
                teacherId: mockTeacherId,
                assignedBy: mockAdminId,
                assignedAt: Date.now() - 1000000,
                unassignedAt: null,
                status: 'active',
                coursesEnrolled: manyCourses
            };

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => existingAssignment
            });
            mockUpdate.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);
            mockSet.mockResolvedValueOnce(undefined);

            // Act: Release and unenroll from all courses WITHOUT custom reason
            // This will trigger auto-generation of reason with course count
            const releaseResult = await removeAssignment(
                'assignment-multi',
                undefined, // No custom reason, so it will auto-generate
                manyCourses
            );

            // Assert
            expect(releaseResult.success).toBe(true);

            const historyCall = mockSet.mock.calls[1][1];
            expect(historyCall.coursesEnrolled).toEqual(manyCourses);
            expect(historyCall.reason).toContain(`${manyCourses.length} course(s)`);
        });
    });
});
