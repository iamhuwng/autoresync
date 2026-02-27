/**
 * Security Middleware
 * 
 * Central security validation layer for service operations.
 * Part of RBAC Security Hardening (PRD-0016).
 * 
 * Provides functions for:
 * - Role-based access validation
 * - Ownership validation
 * - Permission checking
 * 
 * @security This middleware should be called before any sensitive data operations
 */

import {
    SecurityAuthContext,
    UserRole,
    OwnershipResourceType,
    AccessDenialReason
} from '../types/security.types';
import { hasPermission, canAccessAsRole } from '../config/roleHierarchy';
import { isStudentAssignedToTeacher } from '../services/assignmentManager';

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

export interface ValidationResult {
    /** Whether access is allowed */
    allowed: boolean;
    /** Reason for denial if not allowed */
    reason?: AccessDenialReason;
    /** Human-readable message */
    message?: string;
}

// =============================================================================
// ACCESS VALIDATION
// =============================================================================

/**
 * Validate if the auth context has one of the required roles.
 * Uses role hierarchy (super_admin > teacher > student).
 * 
 * @param authContext - The security context from useSecureService
 * @param requiredRoles - Array of roles that are allowed access
 * @returns ValidationResult indicating if access is allowed
 * 
 * @example
 * ```ts
 * const result = validateAccess(authContext, ['teacher', 'super_admin']);
 * if (!result.allowed) {
 *   throw new AccessDeniedError(result.message);
 * }
 * ```
 */
export const validateAccess = (
    authContext: SecurityAuthContext | null,
    requiredRoles: UserRole[]
): ValidationResult => {
    // No context = no access
    if (!authContext) {
        return {
            allowed: false,
            reason: 'session',
            message: 'Authentication required',
        };
    }

    // Check if user is blocked
    if (!authContext.isActive) {
        return {
            allowed: false,
            reason: 'blocked',
            message: 'User account is blocked',
        };
    }

    // Use active role for permission check (supports role switching)
    const roleToCheck = authContext.activeRole || authContext.userRole;

    // Check role using hierarchy
    if (!hasPermission(roleToCheck, requiredRoles)) {
        return {
            allowed: false,
            reason: 'role',
            message: `Role ${roleToCheck} does not have access. Required: ${requiredRoles.join(' or ')}`,
        };
    }

    return { allowed: true };
};

/**
 * Validate if the auth context can perform admin-only operations.
 * Shorthand for validateAccess with super_admin role.
 */
export const validateAdminAccess = (
    authContext: SecurityAuthContext | null
): ValidationResult => {
    return validateAccess(authContext, ['super_admin']);
};

/**
 * Validate if the auth context can perform teacher operations.
 * Allows both teachers and super_admins.
 */
export const validateTeacherAccess = (
    authContext: SecurityAuthContext | null
): ValidationResult => {
    return validateAccess(authContext, ['teacher', 'super_admin']);
};

// =============================================================================
// OWNERSHIP VALIDATION
// =============================================================================

/**
 * Validate ownership of a resource.
 * 
 * @param authContext - The security context from useSecureService
 * @param resourceType - Type of resource being accessed
 * @param resourceOwnerId - The ID of the resource owner (e.g., studentId for a result)
 * @param resourceDetails - Optional additional details for complex checks
 * @returns Promise<ValidationResult>
 * 
 * @example
 * ```ts
 * // Check if user can view a test result
 * const result = await validateOwnership(authContext, 'result', resultOwnerId);
 * if (!result.allowed) {
 *   throw new AccessDeniedError(result.message);
 * }
 * ```
 */
export const validateOwnership = async (
    authContext: SecurityAuthContext | null,
    resourceType: OwnershipResourceType,
    resourceOwnerId: string,
    resourceDetails?: Record<string, unknown>
): Promise<ValidationResult> => {
    // No context = no access
    if (!authContext) {
        return {
            allowed: false,
            reason: 'session',
            message: 'Authentication required',
        };
    }

    // Check if user is blocked
    if (!authContext.isActive) {
        return {
            allowed: false,
            reason: 'blocked',
            message: 'User account is blocked',
        };
    }

    // Super admin can access anything
    if (authContext.userRole === 'super_admin') {
        return { allowed: true };
    }

    // Check based on resource type
    switch (resourceType) {
        case 'result':
        case 'test_result':
            return validateResultOwnership(authContext, resourceOwnerId);

        case 'student_data':
            return validateStudentDataAccess(authContext, resourceOwnerId);

        case 'course':
            return validateCourseAccess(authContext, resourceOwnerId, resourceDetails);

        case 'class':
            return validateClassAccess(authContext, resourceOwnerId, resourceDetails);

        case 'assignment':
            return validateAssignmentAccess(authContext, resourceOwnerId);

        default:
            // Unknown resource type - deny by default for security
            console.warn(`[Security] Unknown resource type: ${resourceType}`);
            return {
                allowed: false,
                reason: 'unknown',
                message: 'Unknown resource type',
            };
    }
};

/**
 * Validate access to a test result.
 * Allowed if: owner OR teacher with assignment to student OR super_admin
 */
const validateResultOwnership = async (
    authContext: SecurityAuthContext,
    resultOwnerId: string
): Promise<ValidationResult> => {
    // Student can view their own results
    if (authContext.userRole === 'student') {
        if (authContext.userId === resultOwnerId) {
            return { allowed: true };
        }
        return {
            allowed: false,
            reason: 'ownership',
            message: 'You can only view your own results',
        };
    }

    // Teacher can view results of assigned students
    if (authContext.userRole === 'teacher') {
        // Check if teacher has assignment to this student
        const hasAssignment = authContext.assignedStudentIds?.includes(resultOwnerId);

        if (hasAssignment) {
            return { allowed: true };
        }

        // Fallback: check database for assignment
        try {
            const isAssigned = await isStudentAssignedToTeacher(resultOwnerId, authContext.userId);
            if (isAssigned) {
                return { allowed: true };
            }
        } catch (err) {
            console.error('[Security] Assignment check failed:', err);
        }

        return {
            allowed: false,
            reason: 'ownership',
            message: 'You can only view results of your assigned students',
        };
    }

    return {
        allowed: false,
        reason: 'role',
        message: 'Invalid role for accessing results',
    };
};

/**
 * Validate access to student data (e.g., history page).
 * Allowed if: student viewing own data OR teacher with assignment OR super_admin
 */
const validateStudentDataAccess = async (
    authContext: SecurityAuthContext,
    studentId: string
): Promise<ValidationResult> => {
    // Student can view their own data
    if (authContext.userRole === 'student' && authContext.userId === studentId) {
        return { allowed: true };
    }

    // Teacher can view assigned students' data
    if (authContext.userRole === 'teacher') {
        const hasAssignment = authContext.assignedStudentIds?.includes(studentId);

        if (hasAssignment) {
            return { allowed: true };
        }

        // Fallback: check database
        try {
            const isAssigned = await isStudentAssignedToTeacher(studentId, authContext.userId);
            if (isAssigned) {
                return { allowed: true };
            }
        } catch (err) {
            console.error('[Security] Assignment check failed:', err);
        }

        return {
            allowed: false,
            reason: 'ownership',
            message: 'You are not assigned to this student',
        };
    }

    return {
        allowed: false,
        reason: 'ownership',
        message: 'Access denied to student data',
    };
};

/**
 * Validate course access.
 * Rules depend on ownership and enrollment.
 */
const validateCourseAccess = async (
    authContext: SecurityAuthContext,
    _courseId: string,
    _details?: Record<string, unknown>
): Promise<ValidationResult> => {
    // For now, allow if user has teaching role
    // Future: Check if teacher owns course or student is enrolled
    if (canAccessAsRole(authContext.userRole, 'teacher')) {
        return { allowed: true };
    }

    // Students can access courses they're enrolled in
    // This would need enrollment check from courseManager
    if (authContext.userRole === 'student') {
        // TODO: Check enrollment when courseManager is updated
        return { allowed: true };
    }

    return {
        allowed: false,
        reason: 'ownership',
        message: 'Access denied to course',
    };
};

/**
 * Validate class access.
 */
const validateClassAccess = async (
    authContext: SecurityAuthContext,
    _classId: string,
    _details?: Record<string, unknown>
): Promise<ValidationResult> => {
    // For now, allow if user has teaching role
    if (canAccessAsRole(authContext.userRole, 'teacher')) {
        return { allowed: true };
    }

    // Students can access classes they're in
    if (authContext.userRole === 'student') {
        // TODO: Check class membership
        return { allowed: true };
    }

    return {
        allowed: false,
        reason: 'ownership',
        message: 'Access denied to class',
    };
};

/**
 * Validate assignment access.
 */
const validateAssignmentAccess = async (
    authContext: SecurityAuthContext,
    _assignmentId: string
): Promise<ValidationResult> => {
    // Teachers and admins can manage assignments
    if (canAccessAsRole(authContext.userRole, 'teacher')) {
        return { allowed: true };
    }

    return {
        allowed: false,
        reason: 'role',
        message: 'Only teachers and admins can manage assignments',
    };
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a teacher can view a specific student's data.
 * Uses assignment relationship.
 */
export const canViewStudent = async (
    teacherId: string,
    studentId: string
): Promise<boolean> => {
    try {
        return await isStudentAssignedToTeacher(studentId, teacherId);
    } catch (err) {
        console.error('[Security] canViewStudent check failed:', err);
        return false;
    }
};

/**
 * Throw an error if validation fails.
 * Useful for cleaner code flow.
 */
export const assertAccess = (result: ValidationResult): void => {
    if (!result.allowed) {
        const error = new Error(result.message || 'Access denied');
        (error as any).reason = result.reason;
        throw error;
    }
};

export default {
    validateAccess,
    validateAdminAccess,
    validateTeacherAccess,
    validateOwnership,
    canViewStudent,
    assertAccess,
};
