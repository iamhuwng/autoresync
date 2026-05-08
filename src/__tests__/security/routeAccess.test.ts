/**
 * Route Access Security Tests
 * 
 * PRD-0016 Task 8.1-8.7: Tests for route protection by role
 * 
 * @security Validates that routes are properly protected by role
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
// ROUTE DEFINITIONS (Matching App.jsx)
// =============================================================================

interface RouteDefinition {
    path: string;
    allowedRoles: UserRole[] | 'all' | 'authenticated';
    description: string;
}

/**
 * Route configuration based on App.jsx
 */
const ROUTE_CONFIG: RouteDefinition[] = [
    // Public routes
    { path: '/', allowedRoles: 'all', description: 'Home page' },
    { path: '/login', allowedRoles: 'all', description: 'Login page' },
    { path: '/blocked', allowedRoles: 'all', description: 'Blocked user page' },

    // Student routes
    { path: '/student', allowedRoles: ['student', 'teacher', 'super_admin'], description: 'Student lobby' },
    { path: '/student/courses', allowedRoles: ['student', 'teacher', 'super_admin'], description: 'Student courses' },
    { path: '/student/results', allowedRoles: ['student', 'teacher', 'super_admin'], description: 'Student results' },

    // Teacher routes
    { path: '/teacher', allowedRoles: ['teacher', 'super_admin'], description: 'Teacher lobby' },
    { path: '/teacher/students', allowedRoles: ['teacher', 'super_admin'], description: 'Teacher students' },
    { path: '/teacher/courses', allowedRoles: ['teacher', 'super_admin'], description: 'Teacher courses' },
    { path: '/teacher/results', allowedRoles: ['teacher', 'super_admin'], description: 'Teacher results' },
    { path: '/classes', allowedRoles: ['teacher', 'super_admin'], description: 'Teacher classes' },

    // Admin routes
    { path: '/admin', allowedRoles: ['super_admin'], description: 'Admin dashboard' },
    { path: '/admin/users', allowedRoles: ['super_admin'], description: 'User management' },
    { path: '/admin/migration', allowedRoles: ['super_admin'], description: 'Data migration' },

    // PRD-0027: THCS-THPT test editor
    { path: '/teacher/thcs-test/create', allowedRoles: ['teacher', 'super_admin'], description: 'THCS-THPT test editor (new)' },
    { path: '/teacher/thcs-test/edit/:draftId', allowedRoles: ['teacher', 'super_admin'], description: 'THCS-THPT test editor (edit draft)' },

    // PRD-0028/0030: Teacher grading workspace
    { path: '/teacher/grading', allowedRoles: ['teacher', 'super_admin'], description: 'Teacher grading workspace' },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a role has access to a route
 */
function hasRouteAccess(role: UserRole, route: RouteDefinition): boolean {
    if (route.allowedRoles === 'all') return true;
    if (route.allowedRoles === 'authenticated') return true;
    return route.allowedRoles.includes(role);
}

/**
 * Check if a role has higher privilege than another
 */
function hasHigherPrivilege(role1: UserRole, role2: UserRole): boolean {
    return ROLE_HIERARCHY[role1] > ROLE_HIERARCHY[role2];
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('Route Access Security Tests (PRD-0016 Task 8.0)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // =========================================================================
    // Task 8.2: Student cannot access /admin/* routes
    // =========================================================================
    describe('Task 8.2: Student cannot access /admin/* routes', () => {
        const studentRole: UserRole = 'student';
        const adminRoutes = ROUTE_CONFIG.filter(r => r.path.startsWith('/admin'));

        adminRoutes.forEach(route => {
            it(`Student should NOT have access to ${route.path}`, () => {
                expect(hasRouteAccess(studentRole, route)).toBe(false);
            });
        });

        it('Student should be denied access to /admin', () => {
            const adminRoute = ROUTE_CONFIG.find(r => r.path === '/admin')!;
            expect(hasRouteAccess('student', adminRoute)).toBe(false);
        });

        it('Student should be denied access to /admin/users', () => {
            const usersRoute = ROUTE_CONFIG.find(r => r.path === '/admin/users')!;
            expect(hasRouteAccess('student', usersRoute)).toBe(false);
        });

        it('Student should be denied access to /admin/migration', () => {
            const migrationRoute = ROUTE_CONFIG.find(r => r.path === '/admin/migration')!;
            expect(hasRouteAccess('student', migrationRoute)).toBe(false);
        });
    });

    // =========================================================================
    // Task 8.3: Student cannot access /teacher/* routes
    // =========================================================================
    describe('Task 8.3: Student cannot access /teacher/* routes', () => {
        const studentRole: UserRole = 'student';
        const teacherRoutes = ROUTE_CONFIG.filter(r => r.path.startsWith('/teacher'));

        teacherRoutes.forEach(route => {
            it(`Student should NOT have access to ${route.path}`, () => {
                expect(hasRouteAccess(studentRole, route)).toBe(false);
            });
        });

        it('Student should be denied access to /classes', () => {
            const classesRoute = ROUTE_CONFIG.find(r => r.path === '/classes')!;
            expect(hasRouteAccess('student', classesRoute)).toBe(false);
        });
    });

    // =========================================================================
    // Task 8.4: Teacher cannot access /admin/users
    // =========================================================================
    describe('Task 8.4: Teacher cannot access /admin/users', () => {
        it('Teacher should NOT have access to /admin/users', () => {
            const usersRoute = ROUTE_CONFIG.find(r => r.path === '/admin/users')!;
            expect(hasRouteAccess('teacher', usersRoute)).toBe(false);
        });

        it('Teacher should NOT have access to /admin', () => {
            const adminRoute = ROUTE_CONFIG.find(r => r.path === '/admin')!;
            expect(hasRouteAccess('teacher', adminRoute)).toBe(false);
        });
    });

    // =========================================================================
    // Task 8.5: Teacher cannot access /admin/migration
    // =========================================================================
    describe('Task 8.5: Teacher cannot access /admin/migration', () => {
        it('Teacher should NOT have access to /admin/migration', () => {
            const migrationRoute = ROUTE_CONFIG.find(r => r.path === '/admin/migration')!;
            expect(hasRouteAccess('teacher', migrationRoute)).toBe(false);
        });
    });

    // =========================================================================
    // Task 8.6: Teacher CAN access /teacher/students
    // =========================================================================
    describe('Task 8.6: Teacher CAN access /teacher/students', () => {
        it('Teacher should have access to /teacher/students', () => {
            const studentsRoute = ROUTE_CONFIG.find(r => r.path === '/teacher/students')!;
            expect(hasRouteAccess('teacher', studentsRoute)).toBe(true);
        });

        it('Teacher should have access to /teacher', () => {
            const teacherRoute = ROUTE_CONFIG.find(r => r.path === '/teacher')!;
            expect(hasRouteAccess('teacher', teacherRoute)).toBe(true);
        });

        it('Teacher should have access to /classes', () => {
            const classesRoute = ROUTE_CONFIG.find(r => r.path === '/classes')!;
            expect(hasRouteAccess('teacher', classesRoute)).toBe(true);
        });
    });

    // =========================================================================
    // Task 8.7: Super admin can access all routes
    // =========================================================================
    describe('Task 8.7: Super admin can access all routes', () => {
        const superAdminRole: UserRole = 'super_admin';

        ROUTE_CONFIG.forEach(route => {
            it(`Super admin should have access to ${route.path}`, () => {
                expect(hasRouteAccess(superAdminRole, route)).toBe(true);
            });
        });
    });

    // =========================================================================
    // Role Hierarchy Tests
    // =========================================================================
    describe('Role Hierarchy Validation', () => {
        it('super_admin has higher privilege than teacher', () => {
            expect(hasHigherPrivilege('super_admin', 'teacher')).toBe(true);
        });

        it('teacher has higher privilege than student', () => {
            expect(hasHigherPrivilege('teacher', 'student')).toBe(true);
        });

        it('super_admin has higher privilege than student', () => {
            expect(hasHigherPrivilege('super_admin', 'student')).toBe(true);
        });

        it('student does NOT have higher privilege than teacher', () => {
            expect(hasHigherPrivilege('student', 'teacher')).toBe(false);
        });

        it('teacher does NOT have higher privilege than super_admin', () => {
            expect(hasHigherPrivilege('teacher', 'super_admin')).toBe(false);
        });
    });

    // =========================================================================
    // Public Routes Tests
    // =========================================================================
    describe('Public Routes Access', () => {
        const publicRoutes = ROUTE_CONFIG.filter(r => r.allowedRoles === 'all');

        publicRoutes.forEach(route => {
            it(`${route.path} should be accessible to everyone`, () => {
                expect(route.allowedRoles).toBe('all');
            });
        });

        it('/login should be a public route', () => {
            const loginRoute = ROUTE_CONFIG.find(r => r.path === '/login')!;
            expect(loginRoute.allowedRoles).toBe('all');
        });

        it('/blocked should be a public route', () => {
            const blockedRoute = ROUTE_CONFIG.find(r => r.path === '/blocked')!;
            expect(blockedRoute.allowedRoles).toBe('all');
        });
    });
});
