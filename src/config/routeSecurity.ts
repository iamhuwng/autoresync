/**
 * Route Security Configuration
 * 
 * Centralized security policy for all application routes.
 * This file serves as the single source of truth for route-role mappings.
 * 
 * @security This file should be reviewed in any PR that modifies App.jsx routes
 */

// Note: ROUTES and RouteName are available for future use when implementing route validation
// import { ROUTES, RouteName } from '../constants/routes';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type UserRole = 'student' | 'teacher' | 'super_admin' | 'guest';

export type RouteAccessLevel = 'public' | 'authenticated' | 'role-restricted';

export interface RouteSecurityConfig {
    path: string;
    accessLevel: RouteAccessLevel;
    allowedRoles: UserRole[];
    requiresOwnership?: boolean; // For routes with :userId or similar params
    ownershipField?: string; // Field to check for ownership (e.g., 'studentId', 'teacherId')
    description?: string;
}

// =============================================================================
// SECURITY POLICY
// =============================================================================

/**
 * Route Security Matrix
 * 
 * CRITICAL: When adding new routes to App.jsx:
 * 1. Add entry here FIRST
 * 2. Ensure PrivateRoute in App.jsx matches allowedRoles
 * 3. Run security tests
 */
export const ROUTE_SECURITY_CONFIG: Record<string, RouteSecurityConfig> = {
    // =========================================================================
    // PUBLIC ROUTES - No authentication required
    // =========================================================================
    '/': {
        path: '/',
        accessLevel: 'public',
        allowedRoles: ['guest', 'student', 'teacher', 'super_admin'],
        description: 'Login page'
    },
    '/guest-join': {
        path: '/guest-join',
        accessLevel: 'public',
        allowedRoles: ['guest'],
        description: 'Guest session join'
    },
    '/guest-results': {
        path: '/guest-results',
        accessLevel: 'public',
        allowedRoles: ['guest'],
        description: 'Guest results view'
    },
    '/teacher-invite': {
        path: '/teacher-invite',
        accessLevel: 'public',
        allowedRoles: ['guest'],
        description: 'Teacher invitation landing'
    },

    // =========================================================================
    // ADMIN ROUTES - super_admin ONLY
    // =========================================================================
    '/admin/users': {
        path: '/admin/users',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Full user management console'
    },
    '/admin/migration': {
        path: '/admin/migration',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Database migration tools'
    },
    '/admin/dashboard': {
        path: '/admin/dashboard',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Admin dashboard'
    },
    '/admin/materials': {
        path: '/admin/materials',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Materials management'
    },
    '/admin/sessions': {
        path: '/admin/sessions',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Session management'
    },
    '/admin/courses': {
        path: '/admin/courses',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Course management'
    },
    '/admin/classes': {
        path: '/admin/classes',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Class management'
    },
    '/admin/settings': {
        path: '/admin/settings',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Admin settings'
    },
    '/admin/backup': {
        path: '/admin/backup',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Backup & disaster recovery (PRD-0026)'
    },
    '/admin/reports': {
        path: '/admin/reports',
        accessLevel: 'role-restricted',
        allowedRoles: ['super_admin'],
        description: 'Production reporting & observability'
    },

    // =========================================================================
    // TEACHER-ONLY ROUTES - teacher role exclusively
    // =========================================================================
    '/teacher/students': {
        path: '/teacher/students',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher'],
        description: 'Teacher student management (filtered to assigned students)'
    },

    // =========================================================================
    // TEACHER + ADMIN ROUTES - Teachers and super_admins
    // =========================================================================
    '/lobby': {
        path: '/lobby',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher lobby / dashboard'
    },
    '/teacher-lobby/:sessionCode': {
        path: '/teacher-lobby/:sessionCode',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher session lobby'
    },
    '/sessions': {
        path: '/sessions',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Session management'
    },
    '/teacher/results': {
        path: '/teacher/results',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher results dashboard'
    },
    '/teacher/materials/books/:bookId': {
        path: '/teacher/materials/books/:bookId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Compatibility redirect to Teacher Materials Book editor modal'
    },
    '/create-test': {
        path: '/create-test',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Test builder'
    },
    '/teacher-wait/:gameSessionId': {
        path: '/teacher-wait/:gameSessionId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher waiting room'
    },
    '/teacher-quiz/:gameSessionId': {
        path: '/teacher-quiz/:gameSessionId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher quiz control'
    },
    '/teacher-test/:sessionCode': {
        path: '/teacher-test/:sessionCode',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher test monitor'
    },
    '/teacher-test-results/:sessionCode': {
        path: '/teacher-test-results/:sessionCode',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher test results view'
    },
    '/teacher-feedback/:gameSessionId': {
        path: '/teacher-feedback/:gameSessionId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher feedback management'
    },
    '/teacher-results/:gameSessionId': {
        path: '/teacher-results/:gameSessionId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher quiz results'
    },
    '/teacher/classes': {
        path: '/teacher/classes',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher class management'
    },
    '/teacher/courses': {
        path: '/teacher/courses',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Teacher course management'
    },
    '/teacher/courses/:courseId': {
        path: '/teacher/courses/:courseId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Course detail page'
    },
    '/material/:materialId': {
        path: '/material/:materialId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Material profile page'
    },
    '/teacher/classes/:classId': {
        path: '/teacher/classes/:classId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'Class detail page'
    },
    '/teacher/student/:studentId/history': {
        path: '/teacher/student/:studentId/history',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        requiresOwnership: true,
        ownershipField: 'studentId',
        description: 'Student history (should verify assignment)'
    },

    // =========================================================================
    // TEACHER THCS-THPT ROUTES (PRD-0027)
    // =========================================================================
    '/teacher/thcs-test/create': {
        path: '/teacher/thcs-test/create',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'THCS-THPT test editor — create new (PRD-0027)'
    },
    '/teacher/thcs-test/edit/:draftId': {
        path: '/teacher/thcs-test/edit/:draftId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'THCS-THPT test editor — edit existing draft (PRD-0027)'
    },

    // =========================================================================
    // TEACHER IELTS WRITING ROUTES (PRD-0030)
    // =========================================================================
    '/teacher/writing-test/create': {
        path: '/teacher/writing-test/create',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'IELTS Writing test builder — create new (PRD-0030)'
    },
    '/teacher/writing-test/edit/:draftId': {
        path: '/teacher/writing-test/edit/:draftId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'IELTS Writing test builder — edit existing draft (PRD-0030)'
    },
    '/teacher/grading/writing': {
        path: '/teacher/grading/writing',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'IELTS Writing grading queue (PRD-0030)'
    },
    '/teacher/grading/writing/:submissionId': {
        path: '/teacher/grading/writing/:submissionId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher', 'super_admin'],
        description: 'IELTS Writing grading detail (PRD-0030)'
    },

    // =========================================================================
    // STUDENT ROUTES - student role only
    // =========================================================================
    '/student': {
        path: '/student',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student dashboard redirect'
    },
    '/student/dashboard': {
        path: '/student/dashboard',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student main dashboard'
    },
    '/student/courses': {
        path: '/student/courses',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student enrolled courses'
    },
    '/student/courses/:courseId': {
        path: '/student/courses/:courseId',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student course detail'
    },
    '/student/courses/catalog': {
        path: '/student/courses/catalog',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Course catalog for enrollment'
    },
    '/student/classes/:classId': {
        path: '/student/classes/:classId',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student class detail'
    },
    '/student/academic-record': {
        path: '/student/academic-record',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Academic record page'
    },

    // =========================================================================
    // STUDENT SESSION ROUTES - PROTECTED (PRD-0016)
    // These routes are now wrapped with PrivateRoute in App.jsx
    // =========================================================================
    '/student-wait/:gameSessionId': {
        path: '/student-wait/:gameSessionId',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student waiting room'
    },
    '/student-quiz/:gameSessionId': {
        path: '/student-quiz/:gameSessionId',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student quiz page'
    },
    '/student-test/:sessionCode': {
        path: '/student-test/:sessionCode',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student test page'
    },
    '/student-test-results/:sessionCode': {
        path: '/student-test-results/:sessionCode',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student test results'
    },
    '/student-feedback/:gameSessionId': {
        path: '/student-feedback/:gameSessionId',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student feedback page'
    },
    '/student-results/:gameSessionId': {
        path: '/student-results/:gameSessionId',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student results page'
    },

    // =========================================================================
    // TEACHER HOMEWORK ROUTES (PRD-0016: Solo Study & Homework System)
    // =========================================================================
    '/teacher/homework': {
        path: '/teacher/homework',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher'],
        description: 'Teacher homework management dashboard'
    },
    '/teacher/homework/create': {
        path: '/teacher/homework/create',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher'],
        description: 'Create new homework assignment'
    },
    '/teacher/homework/student/:studentId': {
        path: '/teacher/homework/student/:studentId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher'],
        requiresOwnership: true,
        ownershipField: 'studentId',
        description: 'Teacher homework student profile (should verify assignment)'
    },
    '/teacher/homework/:homeworkId': {
        path: '/teacher/homework/:homeworkId',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher'],
        requiresOwnership: true,
        ownershipField: 'homeworkId',
        description: 'Homework detail (should verify teacher owns this homework)'
    },
    '/teacher/homework/:homeworkId/edit': {
        path: '/teacher/homework/:homeworkId/edit',
        accessLevel: 'role-restricted',
        allowedRoles: ['teacher'],
        requiresOwnership: true,
        ownershipField: 'homeworkId',
        description: 'Edit homework assignment (should verify teacher owns this homework)'
    },

    // =========================================================================
    // STUDENT HOMEWORK & LIBRARY ROUTES (PRD-0016: Solo Study & Homework System)
    // =========================================================================
    '/student/homework': {
        path: '/student/homework',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student homework list'
    },
    '/student/homework/:homeworkId': {
        path: '/student/homework/:homeworkId',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        requiresOwnership: true,
        ownershipField: 'homeworkId',
        description: 'Homework detail (should verify student is assigned this homework)'
    },
    '/student/library': {
        path: '/student/library',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Student material library for self-study'
    },
    '/student/practice/:materialId': {
        path: '/student/practice/:materialId',
        accessLevel: 'role-restricted',
        allowedRoles: ['student'],
        description: 'Solo practice page for self-study or course material (PRD-0025)'
    },

    // =========================================================================
    // SHARED ROUTES - Multiple roles
    // =========================================================================
    '/profile/complete': {
        path: '/profile/complete',
        accessLevel: 'authenticated',
        allowedRoles: ['student', 'teacher', 'super_admin'],
        description: 'Profile completion (any authenticated user)'
    },
    '/profile': {
        path: '/profile',
        accessLevel: 'authenticated',
        allowedRoles: ['student', 'teacher', 'super_admin'],
        description: 'Profile view/edit'
    },
    '/result/:resultId': {
        path: '/result/:resultId',
        accessLevel: 'role-restricted',
        allowedRoles: ['student', 'teacher', 'super_admin'],
        requiresOwnership: true,
        ownershipField: 'resultId',
        description: 'Result detail (needs ownership check)'
    }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a role is allowed to access a route
 */
export const isRoleAllowed = (route: string, role: UserRole): boolean => {
    const config = ROUTE_SECURITY_CONFIG[route];
    if (!config) {
        console.warn(`[Security] Unknown route: ${route}`);
        return false;
    }
    return config.allowedRoles.includes(role);
};

/**
 * Get allowed roles for a route
 */
export const getAllowedRoles = (route: string): UserRole[] => {
    return ROUTE_SECURITY_CONFIG[route]?.allowedRoles || [];
};

/**
 * Check if route requires ownership validation
 */
export const requiresOwnershipCheck = (route: string): boolean => {
    return ROUTE_SECURITY_CONFIG[route]?.requiresOwnership || false;
};

/**
 * Get all unprotected routes (for security audits)
 */
export const getUnprotectedRoutes = (): string[] => {
    return Object.entries(ROUTE_SECURITY_CONFIG)
        .filter(([_, config]) => config.accessLevel === 'public')
        .map(([path]) => path);
};

/**
 * Get routes with security warnings
 */
export const getSecurityWarnings = (): RouteSecurityConfig[] => {
    return Object.values(ROUTE_SECURITY_CONFIG)
        .filter(config => config.description?.includes('⚠️'));
};

/**
 * Validate route-role mapping against App.jsx routes
 * Call this during development to detect mismatches
 */
export const validateRouteSecurity = (
    appRoutes: Array<{ path: string; allowedRoles?: string[] }>
): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    for (const appRoute of appRoutes) {
        const config = ROUTE_SECURITY_CONFIG[appRoute.path];

        if (!config) {
            errors.push(`Route ${appRoute.path} not in security config`);
            continue;
        }

        if (appRoute.allowedRoles) {
            const configRoles = new Set(config.allowedRoles);
            const appRoles = new Set(appRoute.allowedRoles);

            for (const role of appRoute.allowedRoles) {
                if (!configRoles.has(role as UserRole)) {
                    errors.push(`Route ${appRoute.path}: App allows '${role}' but config doesn't`);
                }
            }

            for (const role of config.allowedRoles) {
                if (!appRoles.has(role)) {
                    errors.push(`Route ${appRoute.path}: Config allows '${role}' but App doesn't`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
};

// =============================================================================
// SECURITY AUDIT HELPERS
// =============================================================================

/**
 * Print security summary to console (development only)
 */
export const printSecuritySummary = (): void => {
    if (process.env.NODE_ENV !== 'development') return;

    console.group('🔒 Route Security Summary');

    const publicRoutes = Object.entries(ROUTE_SECURITY_CONFIG)
        .filter(([_, c]) => c.accessLevel === 'public').length;
    const protectedRoutes = Object.entries(ROUTE_SECURITY_CONFIG)
        .filter(([_, c]) => c.accessLevel === 'role-restricted').length;
    const warningRoutes = getSecurityWarnings().length;

    console.log(`📊 Total Routes: ${Object.keys(ROUTE_SECURITY_CONFIG).length}`);
    console.log(`🌐 Public: ${publicRoutes}`);
    console.log(`🔐 Protected: ${protectedRoutes}`);
    console.log(`⚠️ Warnings: ${warningRoutes}`);

    if (warningRoutes > 0) {
        console.group('⚠️ Routes with Warnings:');
        getSecurityWarnings().forEach(r => console.log(`  - ${r.path}: ${r.description}`));
        console.groupEnd();
    }

    console.groupEnd();
};

export default ROUTE_SECURITY_CONFIG;
