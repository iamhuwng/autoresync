/**
 * Security Middleware Tests
 * 
 * Comprehensive tests for the security middleware functions.
 * Part of RBAC Security Hardening (PRD-0016), Task 3.15.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    validateAccess,
    validateAdminAccess,
    validateTeacherAccess,
    validateOwnership,
    canViewStudent,
    assertAccess,
    ValidationResult
} from './securityMiddleware';
import { SecurityAuthContext } from '../types/security.types';

// Mock assignmentManager
vi.mock('../services/assignmentManager', () => ({
    isStudentAssignedToTeacher: vi.fn()
}));

import { isStudentAssignedToTeacher } from '../services/assignmentManager';

// =============================================================================
// TEST HELPERS
// =============================================================================

const createAuthContext = (
    role: 'student' | 'teacher' | 'super_admin',
    overrides?: Partial<SecurityAuthContext>
): SecurityAuthContext => ({
    userId: 'test-user-id',
    userRole: role,
    activeRole: role,
    roles: [role],
    isActive: true,
    ...overrides,
});

// =============================================================================
// validateAccess Tests
// =============================================================================

describe('validateAccess', () => {
    describe('Basic validation', () => {
        it('should deny access when authContext is null', () => {
            const result = validateAccess(null, ['student']);
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('session');
        });

        it('should deny access when user is blocked', () => {
            const ctx = createAuthContext('student', { isActive: false });
            const result = validateAccess(ctx, ['student']);
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('blocked');
        });

        it('should allow access when no roles required', () => {
            const ctx = createAuthContext('student');
            const result = validateAccess(ctx, []);
            expect(result.allowed).toBe(true);
        });
    });

    describe('Role-based access', () => {
        it('should allow student to access student routes', () => {
            const ctx = createAuthContext('student');
            const result = validateAccess(ctx, ['student']);
            expect(result.allowed).toBe(true);
        });

        it('should allow teacher to access teacher routes', () => {
            const ctx = createAuthContext('teacher');
            const result = validateAccess(ctx, ['teacher']);
            expect(result.allowed).toBe(true);
        });

        it('should allow super_admin to access admin routes', () => {
            const ctx = createAuthContext('super_admin');
            const result = validateAccess(ctx, ['super_admin']);
            expect(result.allowed).toBe(true);
        });
    });

    describe('Role hierarchy', () => {
        it('should allow super_admin to access teacher routes (hierarchy)', () => {
            const ctx = createAuthContext('super_admin');
            const result = validateAccess(ctx, ['teacher']);
            expect(result.allowed).toBe(true);
        });

        it('should allow super_admin to access student routes (hierarchy)', () => {
            const ctx = createAuthContext('super_admin');
            const result = validateAccess(ctx, ['student']);
            expect(result.allowed).toBe(true);
        });

        it('should allow teacher to access student routes (hierarchy)', () => {
            const ctx = createAuthContext('teacher');
            const result = validateAccess(ctx, ['student']);
            expect(result.allowed).toBe(true);
        });

        it('should deny student access to teacher routes', () => {
            const ctx = createAuthContext('student');
            const result = validateAccess(ctx, ['teacher']);
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('role');
        });

        it('should deny student access to admin routes', () => {
            const ctx = createAuthContext('student');
            const result = validateAccess(ctx, ['super_admin']);
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('role');
        });

        it('should deny teacher access to admin-only routes', () => {
            const ctx = createAuthContext('teacher');
            const result = validateAccess(ctx, ['super_admin']);
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('role');
        });
    });

    describe('Multiple allowed roles', () => {
        it('should allow access when user has one of multiple allowed roles', () => {
            const ctx = createAuthContext('teacher');
            const result = validateAccess(ctx, ['teacher', 'super_admin']);
            expect(result.allowed).toBe(true);
        });
    });
});

// =============================================================================
// validateAdminAccess Tests
// =============================================================================

describe('validateAdminAccess', () => {
    it('should allow super_admin', () => {
        const ctx = createAuthContext('super_admin');
        const result = validateAdminAccess(ctx);
        expect(result.allowed).toBe(true);
    });

    it('should deny teacher', () => {
        const ctx = createAuthContext('teacher');
        const result = validateAdminAccess(ctx);
        expect(result.allowed).toBe(false);
    });

    it('should deny student', () => {
        const ctx = createAuthContext('student');
        const result = validateAdminAccess(ctx);
        expect(result.allowed).toBe(false);
    });
});

// =============================================================================
// validateTeacherAccess Tests
// =============================================================================

describe('validateTeacherAccess', () => {
    it('should allow teacher', () => {
        const ctx = createAuthContext('teacher');
        const result = validateTeacherAccess(ctx);
        expect(result.allowed).toBe(true);
    });

    it('should allow super_admin (hierarchy)', () => {
        const ctx = createAuthContext('super_admin');
        const result = validateTeacherAccess(ctx);
        expect(result.allowed).toBe(true);
    });

    it('should deny student', () => {
        const ctx = createAuthContext('student');
        const result = validateTeacherAccess(ctx);
        expect(result.allowed).toBe(false);
    });
});

// =============================================================================
// validateOwnership Tests
// =============================================================================

describe('validateOwnership', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Basic validation', () => {
        it('should deny when authContext is null', async () => {
            const result = await validateOwnership(null, 'result', 'test-owner');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('session');
        });

        it('should deny when user is blocked', async () => {
            const ctx = createAuthContext('student', { isActive: false });
            const result = await validateOwnership(ctx, 'result', 'test-owner');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('blocked');
        });

        it('should allow super_admin for any resource', async () => {
            const ctx = createAuthContext('super_admin');
            const result = await validateOwnership(ctx, 'result', 'any-owner');
            expect(result.allowed).toBe(true);
        });
    });

    describe('Result ownership', () => {
        it('should allow student to view own result', async () => {
            const ctx = createAuthContext('student', { userId: 'student-123' });
            const result = await validateOwnership(ctx, 'result', 'student-123');
            expect(result.allowed).toBe(true);
        });

        it('should deny student viewing other student result', async () => {
            const ctx = createAuthContext('student', { userId: 'student-123' });
            const result = await validateOwnership(ctx, 'result', 'other-student');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('ownership');
        });

        it('should allow teacher with assignment to view student result', async () => {
            const ctx = createAuthContext('teacher', {
                userId: 'teacher-456',
                assignedStudentIds: ['student-123']
            });
            const result = await validateOwnership(ctx, 'result', 'student-123');
            expect(result.allowed).toBe(true);
        });

        it('should fallback to DB check when not in assignedStudentIds', async () => {
            const mockedCheck = vi.mocked(isStudentAssignedToTeacher);
            mockedCheck.mockResolvedValue(true);

            const ctx = createAuthContext('teacher', {
                userId: 'teacher-456',
                assignedStudentIds: []
            });
            const result = await validateOwnership(ctx, 'result', 'student-123');
            expect(result.allowed).toBe(true);
            expect(mockedCheck).toHaveBeenCalledWith('student-123', 'teacher-456');
        });

        it('should deny teacher without assignment', async () => {
            const mockedCheck = vi.mocked(isStudentAssignedToTeacher);
            mockedCheck.mockResolvedValue(false);

            const ctx = createAuthContext('teacher', {
                userId: 'teacher-456',
                assignedStudentIds: []
            });
            const result = await validateOwnership(ctx, 'result', 'student-123');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('ownership');
        });
    });

    describe('Student data access', () => {
        it('should allow student to view own data', async () => {
            const ctx = createAuthContext('student', { userId: 'student-123' });
            const result = await validateOwnership(ctx, 'student_data', 'student-123');
            expect(result.allowed).toBe(true);
        });

        it('should allow teacher with assignment to view student data', async () => {
            const ctx = createAuthContext('teacher', {
                userId: 'teacher-456',
                assignedStudentIds: ['student-123']
            });
            const result = await validateOwnership(ctx, 'student_data', 'student-123');
            expect(result.allowed).toBe(true);
        });
    });
});

// =============================================================================
// canViewStudent Tests
// =============================================================================

describe('canViewStudent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return true when teacher is assigned to student', async () => {
        const mockedCheck = vi.mocked(isStudentAssignedToTeacher);
        mockedCheck.mockResolvedValue(true);

        const result = await canViewStudent('teacher-id', 'student-id');
        expect(result).toBe(true);
        expect(mockedCheck).toHaveBeenCalledWith('student-id', 'teacher-id');
    });

    it('should return false when teacher is not assigned', async () => {
        const mockedCheck = vi.mocked(isStudentAssignedToTeacher);
        mockedCheck.mockResolvedValue(false);

        const result = await canViewStudent('teacher-id', 'student-id');
        expect(result).toBe(false);
    });

    it('should return false on error', async () => {
        const mockedCheck = vi.mocked(isStudentAssignedToTeacher);
        mockedCheck.mockRejectedValue(new Error('DB Error'));

        const result = await canViewStudent('teacher-id', 'student-id');
        expect(result).toBe(false);
    });
});

// =============================================================================
// assertAccess Tests
// =============================================================================

describe('assertAccess', () => {
    it('should not throw when allowed', () => {
        const result: ValidationResult = { allowed: true };
        expect(() => assertAccess(result)).not.toThrow();
    });

    it('should throw when not allowed', () => {
        const result: ValidationResult = {
            allowed: false,
            reason: 'role',
            message: 'Access denied'
        };
        expect(() => assertAccess(result)).toThrow('Access denied');
    });

    it('should include reason in error', () => {
        const result: ValidationResult = {
            allowed: false,
            reason: 'ownership',
            message: 'Not owner'
        };

        try {
            assertAccess(result);
            expect.fail('Should have thrown');
        } catch (error: any) {
            expect(error.reason).toBe('ownership');
        }
    });
});
