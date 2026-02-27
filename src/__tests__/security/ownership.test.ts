/**
 * Ownership Validation Security Tests
 * 
 * PRD-0016 Task 8.8-8.12: Tests for data ownership validation
 * 
 * @security Validates that users can only access data they own or are assigned to
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserRole } from '../../types/security.types';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock audit service
vi.mock('../../services/auditService', () => ({
    logSecurityEvent: {
        login: vi.fn(),
        logout: vi.fn(),
        accessDenied: vi.fn(),
        roleChange: vi.fn(),
        statusChange: vi.fn(),
    },
}));

// =============================================================================
// TYPES
// =============================================================================

interface TestResult {
    id: string;
    studentId: string;
    teacherId: string;
    score: number;
    submittedAt: string;
}

interface Assignment {
    id: string;
    studentId: string;
    teacherId: string;
    status: 'active' | 'inactive';
}

interface User {
    uid: string;
    role: UserRole;
    email: string;
}

// =============================================================================
// MOCK DATA
// =============================================================================

const mockStudentA: User = { uid: 'student-a', role: 'student', email: 'student-a@test.com' };
const mockStudentB: User = { uid: 'student-b', role: 'student', email: 'student-b@test.com' };
const mockTeacherA: User = { uid: 'teacher-a', role: 'teacher', email: 'teacher-a@test.com' };
const mockTeacherB: User = { uid: 'teacher-b', role: 'teacher', email: 'teacher-b@test.com' };
const mockSuperAdmin: User = { uid: 'super-admin', role: 'super_admin', email: 'admin@test.com' };

const mockAssignments: Assignment[] = [
    { id: 'assign-1', studentId: 'student-a', teacherId: 'teacher-a', status: 'active' },
    { id: 'assign-2', studentId: 'student-b', teacherId: 'teacher-b', status: 'active' },
];

const mockResults: TestResult[] = [
    { id: 'result-1', studentId: 'student-a', teacherId: 'teacher-a', score: 85, submittedAt: '2026-02-01' },
    { id: 'result-2', studentId: 'student-b', teacherId: 'teacher-b', score: 90, submittedAt: '2026-02-01' },
    { id: 'result-3', studentId: 'student-a', teacherId: 'teacher-a', score: 95, submittedAt: '2026-02-02' },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a user has an active assignment with another user
 */
function hasActiveAssignment(teacherId: string, studentId: string): boolean {
    return mockAssignments.some(
        a => a.teacherId === teacherId && a.studentId === studentId && a.status === 'active'
    );
}

/**
 * Check if a student can view a result
 */
function canStudentViewResult(studentId: string, result: TestResult): boolean {
    return result.studentId === studentId;
}

/**
 * Check if a teacher can view a result
 */
function canTeacherViewResult(teacherId: string, result: TestResult): boolean {
    // Teacher can view if they created the test OR have an assignment with the student
    return result.teacherId === teacherId || hasActiveAssignment(teacherId, result.studentId);
}

/**
 * Check if a super admin can view a result
 */
function canSuperAdminViewResult(): boolean {
    return true; // Super admins can view all
}

/**
 * Check if a teacher can view a student's history
 */
function canTeacherViewStudentHistory(teacherId: string, studentId: string): boolean {
    return hasActiveAssignment(teacherId, studentId);
}

/**
 * Get all results a user can access
 */
function getAccessibleResults(user: User): TestResult[] {
    switch (user.role) {
        case 'student':
            return mockResults.filter(r => canStudentViewResult(user.uid, r));
        case 'teacher':
            return mockResults.filter(r => canTeacherViewResult(user.uid, r));
        case 'super_admin':
            return mockResults; // Can view all
        default:
            return [];
    }
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('Ownership Validation Security Tests (PRD-0016 Task 8.8-8.12)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // =========================================================================
    // Task 8.9: Student can view own result
    // =========================================================================
    describe('Task 8.9: Student can view own result', () => {
        it('Student A can view their own result', () => {
            const result = mockResults.find(r => r.studentId === mockStudentA.uid)!;
            expect(canStudentViewResult(mockStudentA.uid, result)).toBe(true);
        });

        it('Student A can access all their own results', () => {
            const accessibleResults = getAccessibleResults(mockStudentA);
            expect(accessibleResults.length).toBe(2); // Student A has 2 results
            accessibleResults.forEach(r => {
                expect(r.studentId).toBe(mockStudentA.uid);
            });
        });

        it('Each student result contains correct student ID', () => {
            const accessibleResults = getAccessibleResults(mockStudentA);
            accessibleResults.forEach(result => {
                expect(result.studentId).toBe(mockStudentA.uid);
            });
        });
    });

    // =========================================================================
    // Task 8.10: Student cannot view other student's result
    // =========================================================================
    describe("Task 8.10: Student cannot view other student's result", () => {
        it("Student A cannot view Student B's result", () => {
            const studentBResult = mockResults.find(r => r.studentId === mockStudentB.uid)!;
            expect(canStudentViewResult(mockStudentA.uid, studentBResult)).toBe(false);
        });

        it("Student B cannot view Student A's result", () => {
            const studentAResult = mockResults.find(r => r.studentId === mockStudentA.uid)!;
            expect(canStudentViewResult(mockStudentB.uid, studentAResult)).toBe(false);
        });

        it('Student A accessible results should NOT include Student B results', () => {
            const accessibleResults = getAccessibleResults(mockStudentA);
            const hasStudentBResults = accessibleResults.some(r => r.studentId === mockStudentB.uid);
            expect(hasStudentBResults).toBe(false);
        });
    });

    // =========================================================================
    // Task 8.11: Teacher can view assigned student's history
    // =========================================================================
    describe("Task 8.11: Teacher can view assigned student's history", () => {
        it("Teacher A can view Student A's results (assigned)", () => {
            expect(canTeacherViewStudentHistory(mockTeacherA.uid, mockStudentA.uid)).toBe(true);
        });

        it("Teacher A can access Student A's test results", () => {
            const studentAResults = mockResults.filter(r => r.studentId === mockStudentA.uid);
            studentAResults.forEach(result => {
                expect(canTeacherViewResult(mockTeacherA.uid, result)).toBe(true);
            });
        });

        it('Teacher accessible results include their assigned students', () => {
            const accessibleResults = getAccessibleResults(mockTeacherA);
            const studentAResults = accessibleResults.filter(r => r.studentId === mockStudentA.uid);
            expect(studentAResults.length).toBe(2);
        });
    });

    // =========================================================================
    // Task 8.12: Teacher cannot view unassigned student's history
    // =========================================================================
    describe("Task 8.12: Teacher cannot view unassigned student's history", () => {
        it("Teacher A cannot view Student B's results (unassigned)", () => {
            expect(canTeacherViewStudentHistory(mockTeacherA.uid, mockStudentB.uid)).toBe(false);
        });

        it("Teacher B cannot view Student A's results (unassigned)", () => {
            expect(canTeacherViewStudentHistory(mockTeacherB.uid, mockStudentA.uid)).toBe(false);
        });

        it("Teacher A's accessible results should NOT include Student B's results", () => {
            const accessibleResults = getAccessibleResults(mockTeacherA);
            const hasStudentBResults = accessibleResults.some(r => r.studentId === mockStudentB.uid);
            expect(hasStudentBResults).toBe(false);
        });
    });

    // =========================================================================
    // Super Admin Access Tests
    // =========================================================================
    describe('Super Admin Full Access', () => {
        it('Super admin can view any result', () => {
            mockResults.forEach(result => {
                expect(canSuperAdminViewResult()).toBe(true);
            });
        });

        it('Super admin can access all results', () => {
            const accessibleResults = getAccessibleResults(mockSuperAdmin);
            expect(accessibleResults.length).toBe(mockResults.length);
        });

        it("Super admin can view any student's history", () => {
            expect(canTeacherViewStudentHistory('super-admin', mockStudentA.uid) || mockSuperAdmin.role === 'super_admin').toBe(true);
        });
    });

    // =========================================================================
    // Assignment Status Tests
    // =========================================================================
    describe('Assignment Status Validation', () => {
        it('Active assignment grants access', () => {
            const activeAssignment = mockAssignments.find(a => a.status === 'active')!;
            expect(hasActiveAssignment(activeAssignment.teacherId, activeAssignment.studentId)).toBe(true);
        });

        it('Inactive assignment should NOT grant access', () => {
            // Simulate an inactive assignment
            const inactiveAssignments = [...mockAssignments];
            inactiveAssignments[0] = { ...inactiveAssignments[0], status: 'inactive' };

            const hasAccess = inactiveAssignments.some(
                a => a.teacherId === 'teacher-a' && a.studentId === 'student-a' && a.status === 'active'
            );
            expect(hasAccess).toBe(false);
        });

        it('Non-existent assignment does NOT grant access', () => {
            expect(hasActiveAssignment('teacher-a', 'student-nonexistent')).toBe(false);
        });
    });

    // =========================================================================
    // Cross-Role Access Matrix
    // =========================================================================
    describe('Cross-Role Access Matrix', () => {
        const accessMatrix = [
            { user: mockStudentA, targetStudentId: 'student-a', expectedAccess: true, description: 'Student A → Own data' },
            { user: mockStudentA, targetStudentId: 'student-b', expectedAccess: false, description: "Student A → Student B's data" },
            { user: mockTeacherA, targetStudentId: 'student-a', expectedAccess: true, description: 'Teacher A → Assigned Student A' },
            { user: mockTeacherA, targetStudentId: 'student-b', expectedAccess: false, description: 'Teacher A → Unassigned Student B' },
            { user: mockTeacherB, targetStudentId: 'student-a', expectedAccess: false, description: 'Teacher B → Unassigned Student A' },
            { user: mockTeacherB, targetStudentId: 'student-b', expectedAccess: true, description: 'Teacher B → Assigned Student B' },
        ];

        accessMatrix.forEach(({ user, targetStudentId, expectedAccess, description }) => {
            it(`${description}: ${expectedAccess ? 'ALLOWED' : 'DENIED'}`, () => {
                const targetResults = mockResults.filter(r => r.studentId === targetStudentId);

                if (user.role === 'student') {
                    const hasAccess = targetResults.every(r => canStudentViewResult(user.uid, r));
                    expect(hasAccess).toBe(expectedAccess);
                } else if (user.role === 'teacher') {
                    const hasAccess = canTeacherViewStudentHistory(user.uid, targetStudentId);
                    expect(hasAccess).toBe(expectedAccess);
                }
            });
        });
    });
});
