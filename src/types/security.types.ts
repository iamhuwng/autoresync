/**
 * Security Type Definitions
 * 
 * Centralized type definitions for the RBAC security system.
 * Part of RBAC Security Hardening (PRD-0016).
 * 
 * @security This file defines the type contracts for all security-related code
 */

// =============================================================================
// ROLE DEFINITIONS
// =============================================================================

/**
 * Valid user roles in the system.
 * Hierarchy: super_admin > teacher > student
 */
export type UserRole = 'student' | 'teacher' | 'super_admin';

/**
 * Extended role type including guest for public routes
 */
export type ExtendedUserRole = UserRole | 'guest';

/**
 * Numeric hierarchy levels for role comparison
 * Higher number = higher privilege
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
    student: 1,
    teacher: 2,
    super_admin: 3,
} as const;

// =============================================================================
// MULTI-ROLE CONTEXT SWITCHING (Task 7.0)
// =============================================================================

/**
 * Extended user profile with multi-role support
 * Primary role is stored in `role`, additional roles in `roles` array
 */
export interface MultiRoleUserProfile {
    /** User's unique ID */
    uid: string;
    /** Primary role (used when activeRole is not set) */
    role: UserRole;
    /** Array of all roles this user has access to */
    roles?: UserRole[];
    /** Currently active role (for multi-role users) */
    activeRole?: UserRole;
    /** When the role was last switched */
    lastRoleSwitchAt?: number;
}

/**
 * Role switch context for AuthContext
 */
export interface RoleSwitchContext {
    /** Current active role (may differ from profile.role) */
    activeRole: UserRole;
    /** List of all available roles for this user */
    availableRoles: UserRole[];
    /** Whether user has multiple roles */
    hasMultipleRoles: boolean;
    /** Switch to a different role */
    switchRole: (role: UserRole) => Promise<void>;
    /** Get the effective role (activeRole or default role) */
    getEffectiveRole: () => UserRole;
}

/**
 * Session storage keys for role context persistence
 */
export const ROLE_STORAGE_KEYS = {
    ACTIVE_ROLE: 'kahoot_active_role',
    LAST_ROLE_SWITCH: 'kahoot_last_role_switch',
} as const;

// =============================================================================
// PERMISSION DEFINITIONS
// =============================================================================

/**
 * Permission types for future capability-based system
 * Currently using role-based, but designed for easy migration
 */
export type Permission =
    // User Management
    | 'users:read'
    | 'users:write'
    | 'users:delete'
    | 'users:manage_roles'
    // Student Data
    | 'students:read_own'
    | 'students:read_assigned'
    | 'students:read_all'
    // Results
    | 'results:read_own'
    | 'results:read_assigned'
    | 'results:read_all'
    | 'results:write'
    // Sessions
    | 'sessions:create'
    | 'sessions:manage'
    | 'sessions:join'
    // Courses
    | 'courses:create'
    | 'courses:manage'
    | 'courses:enroll'
    // Classes
    | 'classes:create'
    | 'classes:manage'
    | 'classes:join'
    // Admin
    | 'admin:access'
    | 'admin:migration'
    | 'audit:read';

/**
 * Role to permission mapping
 * Defines what permissions each role has
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    student: [
        'students:read_own',
        'results:read_own',
        'sessions:join',
        'courses:enroll',
        'classes:join',
    ],
    teacher: [
        'students:read_own',
        'students:read_assigned',
        'results:read_own',
        'results:read_assigned',
        'results:write',
        'sessions:create',
        'sessions:manage',
        'courses:create',
        'courses:manage',
        'classes:create',
        'classes:manage',
    ],
    super_admin: [
        // All permissions
        'users:read',
        'users:write',
        'users:delete',
        'users:manage_roles',
        'students:read_own',
        'students:read_assigned',
        'students:read_all',
        'results:read_own',
        'results:read_assigned',
        'results:read_all',
        'results:write',
        'sessions:create',
        'sessions:manage',
        'sessions:join',
        'courses:create',
        'courses:manage',
        'courses:enroll',
        'classes:create',
        'classes:manage',
        'classes:join',
        'admin:access',
        'admin:migration',
        'audit:read',
    ],
};

// =============================================================================
// AUTH CONTEXT
// =============================================================================

/**
 * Security context passed to services for authorization
 */
export interface SecurityAuthContext {
    /** Current user's Firebase UID */
    userId: string;
    /** Current user's primary role from profile */
    userRole: UserRole;
    /** Active role for permission checks (may differ from userRole in multi-role scenarios) */
    activeRole: UserRole;
    /** List of all roles the user has */
    roles: UserRole[];
    /** Teacher-student assignment IDs for ownership checks */
    assignedStudentIds?: string[];
    /** Student's assigned teacher IDs */
    assignedTeacherIds?: string[];
    /** Whether the user is verified/active */
    isActive: boolean;
}

/**
 * Result of an ownership check
 */
export interface OwnershipCheckResult {
    /** Whether access is allowed */
    allowed: boolean;
    /** Loading state for async checks */
    loading: boolean;
    /** Error message if check failed */
    error?: string;
    /** Reason for denial (for logging/debugging) */
    denialReason?: 'not_owner' | 'no_assignment' | 'blocked' | 'error';
}

/**
 * Resource types that support ownership checks
 */
export type OwnershipResourceType =
    | 'result'
    | 'test_result'
    | 'student_data'
    | 'course'
    | 'class'
    | 'assignment';

// =============================================================================
// ACCESS CONTROL
// =============================================================================

/**
 * Access denial reasons for logging and UI
 */
export type AccessDenialReason =
    | 'role'           // User's role doesn't allow access
    | 'ownership'      // User doesn't own the resource
    | 'blocked'        // User account is blocked
    | 'session'        // Session expired or invalid
    | 'unknown';       // Unknown reason

/**
 * Configuration for route access
 */
export interface RouteAccessConfig {
    /** Path pattern */
    path: string;
    /** Roles allowed to access */
    allowedRoles: UserRole[];
    /** Whether ownership check is required */
    requiresOwnership?: boolean;
    /** Field to check for ownership */
    ownershipField?: string;
    /** Resource type for ownership check */
    resourceType?: OwnershipResourceType;
}

// =============================================================================
// AUDIT
// =============================================================================

/**
 * Audit event types
 */
export type AuditAction =
    | 'CREATE'
    | 'READ'
    | 'UPDATE'
    | 'DELETE'
    | 'ACCESS_DENIED'
    | 'LOGIN'
    | 'LOGOUT'
    | 'ROLE_CHANGE'
    | 'STATUS_CHANGE';

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
    /** Unique ID for the log entry */
    id: string;
    /** Type of action performed */
    action: AuditAction;
    /** User who performed the action */
    userId: string;
    /** Role of user at time of action */
    userRole: UserRole;
    /** Target resource type */
    target: string;
    /** Target resource ID */
    targetId: string;
    /** ISO timestamp */
    timestamp: string;
    /** Additional details */
    details?: Record<string, unknown>;
    /** Client IP (if available) */
    ip?: string;
}

// =============================================================================
// SESSION & FORCE REAUTH
// =============================================================================

/**
 * Session state for authentication
 */
export interface SessionState {
    /** Whether user needs to re-authenticate */
    forceReauth: boolean;
    /** Message to show on forced reauth */
    reauthMessage?: string;
    /** When the session was last validated */
    lastValidated: string;
}

/**
 * User status values
 */
export type UserStatus = 'active' | 'blocked' | 'pending';

// =============================================================================
// HELPER TYPE GUARDS
// =============================================================================

/**
 * Check if a value is a valid UserRole
 */
export const isValidUserRole = (value: unknown): value is UserRole => {
    return typeof value === 'string' && ['student', 'teacher', 'super_admin'].includes(value);
};

/**
 * Check if a value is a valid Permission
 */
export const isValidPermission = (value: unknown): value is Permission => {
    const validPermissions = Object.values(ROLE_PERMISSIONS).flat();
    return typeof value === 'string' && validPermissions.includes(value as Permission);
};
