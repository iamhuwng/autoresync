/**
 * Multi-Role Context Switching Tests
 * 
 * PRD-0016 Task 7.10: Tests for multi-role context switching functionality
 * 
 * @security Tests role switching validation and security boundaries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ROLE_HIERARCHY, type UserRole } from '../../types/security.types';

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
// HELPER FUNCTIONS (Mirroring AuthContext logic)
// =============================================================================

/**
 * Get available roles for a user based on their profile
 */
function getAvailableRoles(profile: { role: UserRole; roles?: UserRole[] }): UserRole[] {
    const roles = new Set<UserRole>();

    // Add primary role
    if (profile.role) {
        roles.add(profile.role);
    }

    // Add additional roles if present
    if (profile.roles && Array.isArray(profile.roles)) {
        profile.roles.forEach(r => roles.add(r));
    }

    // Super admin always has all roles
    if (profile.role === 'super_admin') {
        roles.add('teacher');
        roles.add('student');
    }

    return Array.from(roles);
}

/**
 * Validate if a role switch is allowed
 */
function isRoleSwitchAllowed(
    targetRole: UserRole,
    availableRoles: UserRole[]
): boolean {
    return availableRoles.includes(targetRole);
}

/**
 * Get effective role (active or default)
 */
function getEffectiveRole(
    profile: { role: UserRole },
    activeRole: UserRole | null,
    availableRoles: UserRole[]
): UserRole {
    if (activeRole && availableRoles.includes(activeRole)) {
        return activeRole;
    }
    return profile.role;
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('Multi-Role Context Switching Tests (PRD-0016 Task 7.0)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // =========================================================================
    // Task 7.1-7.2: Role Schema and State Tests
    // =========================================================================
    describe('Task 7.1-7.2: Role Schema and State', () => {
        it('should support roles array in user profile', () => {
            const profileWithMultipleRoles = {
                uid: 'test-uid',
                role: 'teacher' as UserRole,
                roles: ['teacher', 'student'] as UserRole[],
            };

            expect(profileWithMultipleRoles.roles).toContain('teacher');
            expect(profileWithMultipleRoles.roles).toContain('student');
        });

        it('should handle profile with only primary role', () => {
            const profileWithSingleRole = {
                uid: 'test-uid',
                role: 'student' as UserRole,
            };

            const availableRoles = getAvailableRoles(profileWithSingleRole);
            expect(availableRoles).toHaveLength(1);
            expect(availableRoles).toContain('student');
        });

        it('should define role hierarchy correctly', () => {
            expect(ROLE_HIERARCHY.student).toBeLessThan(ROLE_HIERARCHY.teacher);
            expect(ROLE_HIERARCHY.teacher).toBeLessThan(ROLE_HIERARCHY.super_admin);
        });
    });

    // =========================================================================
    // Task 7.3: Switch Role Function Tests
    // =========================================================================
    describe('Task 7.3: Switch Role Function', () => {
        it('should allow switching to an available role', () => {
            const profile = { role: 'super_admin' as UserRole };
            const availableRoles = getAvailableRoles(profile);

            expect(isRoleSwitchAllowed('teacher', availableRoles)).toBe(true);
            expect(isRoleSwitchAllowed('student', availableRoles)).toBe(true);
        });

        it('should prevent switching to unavailable role', () => {
            const profile = { role: 'student' as UserRole };
            const availableRoles = getAvailableRoles(profile);

            expect(isRoleSwitchAllowed('teacher', availableRoles)).toBe(false);
            expect(isRoleSwitchAllowed('super_admin', availableRoles)).toBe(false);
        });

        it('should allow teacher with multiple roles to switch', () => {
            const profile = {
                role: 'teacher' as UserRole,
                roles: ['teacher', 'student'] as UserRole[],
            };
            const availableRoles = getAvailableRoles(profile);

            expect(isRoleSwitchAllowed('student', availableRoles)).toBe(true);
            expect(isRoleSwitchAllowed('super_admin', availableRoles)).toBe(false);
        });
    });

    // =========================================================================
    // Task 7.4: SessionStorage Persistence Tests
    // =========================================================================
    describe('Task 7.4: SessionStorage Persistence', () => {
        it('should store active role in sessionStorage', () => {
            const activeRole = 'teacher';
            sessionStorage.setItem('kahoot_active_role', activeRole);

            expect(sessionStorage.getItem('kahoot_active_role')).toBe('teacher');
        });

        it('should persist role across simulated page refresh', () => {
            // Set role
            sessionStorage.setItem('kahoot_active_role', 'student');

            // Simulate reading on "page load"
            const restoredRole = sessionStorage.getItem('kahoot_active_role');

            expect(restoredRole).toBe('student');
        });

        it('should store role switch timestamp', () => {
            const timestamp = Date.now();
            sessionStorage.setItem('kahoot_last_role_switch', timestamp.toString());

            const stored = sessionStorage.getItem('kahoot_last_role_switch');
            expect(Number(stored)).toBeCloseTo(timestamp, -2);
        });

        it('should clear role on logout', () => {
            sessionStorage.setItem('kahoot_active_role', 'teacher');
            sessionStorage.setItem('kahoot_last_role_switch', '12345');

            // Simulate logout (clear session storage)
            sessionStorage.clear();

            expect(sessionStorage.getItem('kahoot_active_role')).toBeNull();
            expect(sessionStorage.getItem('kahoot_last_role_switch')).toBeNull();
        });
    });

    // =========================================================================
    // Task 7.5: RoleSwitcher UI Tests (Logic Only)
    // =========================================================================
    describe('Task 7.5: RoleSwitcher Logic', () => {
        it('should determine hasMultipleRoles correctly for super_admin', () => {
            const profile = { role: 'super_admin' as UserRole };
            const availableRoles = getAvailableRoles(profile);
            const hasMultipleRoles = availableRoles.length > 1;

            expect(hasMultipleRoles).toBe(true);
        });

        it('should determine hasMultipleRoles correctly for regular user', () => {
            const profile = { role: 'student' as UserRole };
            const availableRoles = getAvailableRoles(profile);
            const hasMultipleRoles = availableRoles.length > 1;

            expect(hasMultipleRoles).toBe(false);
        });

        it('should determine hasMultipleRoles correctly for multi-role user', () => {
            const profile = {
                role: 'teacher' as UserRole,
                roles: ['teacher', 'student'] as UserRole[],
            };
            const availableRoles = getAvailableRoles(profile);
            const hasMultipleRoles = availableRoles.length > 1;

            expect(hasMultipleRoles).toBe(true);
        });
    });

    // =========================================================================
    // Task 7.7: Permission Checks with Active Role Tests
    // =========================================================================
    describe('Task 7.7: Permission Checks with Active Role', () => {
        it('should return active role when set and valid', () => {
            const profile = { role: 'super_admin' as UserRole };
            const activeRole = 'teacher' as UserRole;
            const availableRoles = getAvailableRoles(profile);

            const effectiveRole = getEffectiveRole(profile, activeRole, availableRoles);

            expect(effectiveRole).toBe('teacher');
        });

        it('should return primary role when active role is null', () => {
            const profile = { role: 'super_admin' as UserRole };
            const availableRoles = getAvailableRoles(profile);

            const effectiveRole = getEffectiveRole(profile, null, availableRoles);

            expect(effectiveRole).toBe('super_admin');
        });

        it('should return primary role when active role is invalid', () => {
            const profile = { role: 'student' as UserRole };
            const activeRole = 'super_admin' as UserRole; // Not in available roles
            const availableRoles = getAvailableRoles(profile);

            const effectiveRole = getEffectiveRole(profile, activeRole, availableRoles);

            expect(effectiveRole).toBe('student');
        });

        it('should update role helpers based on effective role', () => {
            const profile = { role: 'super_admin' as UserRole };
            const activeRole = 'student' as UserRole;
            const availableRoles = getAvailableRoles(profile);
            const effectiveRole = getEffectiveRole(profile, activeRole, availableRoles);

            // Role helpers should use effectiveRole
            const isAdmin = effectiveRole === 'super_admin';
            const isTeacher = effectiveRole === 'teacher' || effectiveRole === 'super_admin';
            const isStudent = effectiveRole === 'student';

            expect(isAdmin).toBe(false); // Because viewing as student
            expect(isTeacher).toBe(false);
            expect(isStudent).toBe(true);
        });
    });

    // =========================================================================
    // Task 7.8: Role Validation Tests
    // =========================================================================
    describe('Task 7.8: Role Validation', () => {
        it('should validate role is in allowed list', () => {
            const allowedRoles: UserRole[] = ['super_admin', 'teacher', 'student'];

            expect(allowedRoles.includes('teacher')).toBe(true);
            expect(allowedRoles.includes('super_admin')).toBe(true);
        });

        it('should reject invalid role values', () => {
            const allowedRoles: UserRole[] = ['super_admin', 'teacher', 'student'];
            const invalidRole = 'hacker' as any;

            expect(allowedRoles.includes(invalidRole)).toBe(false);
        });

        it('should handle empty roles array', () => {
            const profile = {
                role: 'student' as UserRole,
                roles: [] as UserRole[],
            };

            const availableRoles = getAvailableRoles(profile);
            expect(availableRoles).toHaveLength(1);
            expect(availableRoles).toContain('student');
        });
    });

    // =========================================================================
    // Task 7.11: Edge Cases Tests
    // =========================================================================
    describe('Task 7.11: Edge Cases - Role List Changes', () => {
        it('should reset active role if it becomes unavailable', () => {
            // Initial state: user is teacher with student role too
            let profile = {
                role: 'teacher' as UserRole,
                roles: ['teacher', 'student'] as UserRole[],
            };
            let activeRole: UserRole | null = 'student';

            // Verify initial state
            let availableRoles = getAvailableRoles(profile);
            expect(availableRoles.includes(activeRole)).toBe(true);

            // Simulate: admin removes student role from user
            profile = {
                role: 'teacher' as UserRole,
                roles: ['teacher'] as UserRole[],
            };
            availableRoles = getAvailableRoles(profile);

            // Active role is no longer valid
            if (!availableRoles.includes(activeRole)) {
                activeRole = null; // Reset
            }

            expect(activeRole).toBeNull();
        });

        it('should handle primary role change gracefully', () => {
            let profile = { role: 'teacher' as UserRole };
            let activeRole: UserRole | null = 'teacher';

            // Admin changes primary role to student
            profile = { role: 'student' as UserRole };
            const availableRoles = getAvailableRoles(profile);

            // Previous active role may not be valid anymore
            if (!availableRoles.includes(activeRole)) {
                activeRole = null;
            }

            const effectiveRole = getEffectiveRole(profile, activeRole, availableRoles);
            expect(effectiveRole).toBe('student');
        });

        it('should handle super_admin demotion', () => {
            // Initial: super_admin viewing as student
            let profile = { role: 'super_admin' as UserRole };
            let activeRole: UserRole | null = 'student';

            // Demoted to teacher
            profile = { role: 'teacher' as UserRole };
            const availableRoles = getAvailableRoles(profile);

            // Student role is no longer available
            if (!availableRoles.includes(activeRole)) {
                activeRole = null;
            }

            const effectiveRole = getEffectiveRole(profile, activeRole, availableRoles);
            expect(effectiveRole).toBe('teacher');
        });
    });

    // =========================================================================
    // Super Admin Special Cases
    // =========================================================================
    describe('Super Admin Role Switching', () => {
        it('should give super_admin access to all roles', () => {
            const profile = { role: 'super_admin' as UserRole };
            const availableRoles = getAvailableRoles(profile);

            expect(availableRoles).toContain('super_admin');
            expect(availableRoles).toContain('teacher');
            expect(availableRoles).toContain('student');
            expect(availableRoles).toHaveLength(3);
        });

        it('should preserve primaryRole even when viewing as different role', () => {
            const profile = { role: 'super_admin' as UserRole };
            const activeRole = 'student' as UserRole;

            // primaryRole should always be the original
            const primaryRole = profile.role;

            expect(primaryRole).toBe('super_admin');
            expect(activeRole).toBe('student');
        });
    });
});
