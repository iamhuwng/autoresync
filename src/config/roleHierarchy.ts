/**
 * Role Hierarchy Configuration
 * 
 * Implements role-based access control with hierarchical permission inheritance.
 * Part of RBAC Security Hardening (PRD-0016).
 * 
 * Role Hierarchy: super_admin > teacher > student
 * - super_admin: Can access everything, inherits all lower role permissions
 * - teacher: Can access teacher routes, cannot access admin routes
 * - student: Can access student routes only
 * 
 * @security This file controls access decisions across the application
 */

import {
    UserRole,
    Permission,
    ROLE_HIERARCHY,
    ROLE_PERMISSIONS,
    isValidUserRole
} from '../types/security.types';

// =============================================================================
// ROLE HIERARCHY UTILITIES
// =============================================================================

/**
 * Get the numeric hierarchy level for a role.
 * Higher number = higher privilege.
 * 
 * @param role - The user role to check
 * @returns Numeric level (1 = student, 2 = teacher, 3 = super_admin)
 * 
 * @example
 * getRoleLevel('super_admin') // returns 3
 * getRoleLevel('student') // returns 1
 */
export const getRoleLevel = (role: UserRole): number => {
    return ROLE_HIERARCHY[role] || 0;
};

/**
 * Check if a user role has permission to access resources requiring one of the specified roles.
 * Implements role hierarchy where higher roles inherit lower role permissions.
 * 
 * @param userRole - The user's current role
 * @param requiredRoles - Array of roles that are allowed access
 * @returns true if the user has access
 * 
 * @example
 * // super_admin can access teacher routes
 * hasPermission('super_admin', ['teacher']) // returns true
 * 
 * // student cannot access teacher routes
 * hasPermission('student', ['teacher']) // returns false
 * 
 * // teacher can access routes requiring teacher OR student
 * hasPermission('teacher', ['student', 'teacher']) // returns true
 */
export const hasPermission = (userRole: UserRole, requiredRoles: UserRole[]): boolean => {
    if (!isValidUserRole(userRole)) {
        console.warn(`[Security] Invalid user role: ${userRole}`);
        return false;
    }

    if (requiredRoles.length === 0) {
        // No role restriction = any authenticated user can access
        return true;
    }

    const userLevel = getRoleLevel(userRole);

    // Check if user's role is directly in the list
    if (requiredRoles.includes(userRole)) {
        return true;
    }

    // Check hierarchy: higher roles can access lower role resources
    // BUT not vice versa (student can't access teacher routes)
    for (const requiredRole of requiredRoles) {
        const requiredLevel = getRoleLevel(requiredRole);

        // User can access if their level is >= required level
        // This means super_admin (3) can access teacher (2) routes
        if (userLevel >= requiredLevel) {
            return true;
        }
    }

    return false;
};

/**
 * Check if a user can access routes as a specific target role.
 * Used for role inheritance checks.
 * 
 * @param userRole - The user's actual role
 * @param targetRole - The role required by the resource
 * @returns true if userRole can act as targetRole
 * 
 * @example
 * // super_admin can act as teacher
 * canAccessAsRole('super_admin', 'teacher') // returns true
 * 
 * // teacher cannot act as super_admin
 * canAccessAsRole('teacher', 'super_admin') // returns false
 */
export const canAccessAsRole = (userRole: UserRole, targetRole: UserRole): boolean => {
    return getRoleLevel(userRole) >= getRoleLevel(targetRole);
};

/**
 * Get all roles that a user inherits (including their own).
 * 
 * @param userRole - The user's role
 * @returns Array of roles the user has access to
 * 
 * @example
 * getInheritedRoles('super_admin') // returns ['super_admin', 'teacher', 'student']
 * getInheritedRoles('teacher') // returns ['teacher', 'student']
 * getInheritedRoles('student') // returns ['student']
 */
export const getInheritedRoles = (userRole: UserRole): UserRole[] => {
    const userLevel = getRoleLevel(userRole);
    const allRoles: UserRole[] = ['student', 'teacher', 'super_admin'];

    return allRoles.filter(role => getRoleLevel(role) <= userLevel);
};

// =============================================================================
// PERMISSION-BASED UTILITIES (For future migration)
// =============================================================================

/**
 * Check if a role has a specific permission.
 * This is the foundation for future migration to capability-based permissions.
 * 
 * @param userRole - The user's role
 * @param permission - The permission to check
 * @returns true if the role has the permission
 */
export const hasCapability = (userRole: UserRole, permission: Permission): boolean => {
    // super_admin has all permissions
    if (userRole === 'super_admin') {
        return true;
    }

    const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
    return rolePermissions.includes(permission);
};

/**
 * Get all permissions for a role.
 * 
 * @param userRole - The user's role
 * @returns Array of permissions the role has
 */
export const getRolePermissions = (userRole: UserRole): Permission[] => {
    return ROLE_PERMISSIONS[userRole] || [];
};

/**
 * Check if a role can perform an action on a resource type.
 * Combines permission checking with ownership rules.
 * 
 * @param userRole - The user's role
 * @param action - The action being performed (read, write, delete)
 * @param resourceType - The type of resource being accessed
 * @param ownershipContext - Whether the user owns/is assigned the resource
 */
export const canPerformAction = (
    userRole: UserRole,
    action: 'read' | 'write' | 'delete',
    resourceType: 'student' | 'result' | 'course' | 'class',
    ownershipContext: 'own' | 'assigned' | 'other'
): boolean => {
    // super_admin can do anything
    if (userRole === 'super_admin') {
        return true;
    }

    // Build the permission key based on action and ownership
    let permissionKey: string;

    if (resourceType === 'student' || resourceType === 'result') {
        // For student and result data, check ownership-based permissions
        if (ownershipContext === 'own') {
            permissionKey = `${resourceType}s:${action}_own`;
        } else if (ownershipContext === 'assigned') {
            permissionKey = `${resourceType}s:${action}_assigned`;
        } else {
            permissionKey = `${resourceType}s:${action}_all`;
        }
    } else {
        // For courses and classes, simpler permission model
        permissionKey = `${resourceType}s:${action === 'read' ? 'manage' : action}`;
    }

    return hasCapability(userRole, permissionKey as Permission);
};

// =============================================================================
// CONSTANTS FOR DOCUMENTATION
// =============================================================================

/**
 * Permission mapping documentation.
 * This documents the capability system for future reference.
 */
export const PERMISSIONS_DOCUMENTATION = {
    'users:read': 'Read any user profile',
    'users:write': 'Create or update user profiles',
    'users:delete': 'Delete user accounts',
    'users:manage_roles': 'Change user roles',
    'students:read_own': 'Read own student profile',
    'students:read_assigned': 'Read profiles of assigned students',
    'students:read_all': 'Read all student profiles',
    'results:read_own': 'Read own test results',
    'results:read_assigned': 'Read results of assigned students',
    'results:read_all': 'Read all test results',
    'sessions:create': 'Create game/test sessions',
    'sessions:manage': 'Manage session lifecycle',
    'sessions:join': 'Join as participant in sessions',
    'admin:access': 'Access admin panel',
    'admin:migration': 'Run database migrations',
    'audit:read': 'Read audit logs',
} as const;

export default {
    hasPermission,
    getRoleLevel,
    canAccessAsRole,
    getInheritedRoles,
    hasCapability,
    getRolePermissions,
    canPerformAction,
};
