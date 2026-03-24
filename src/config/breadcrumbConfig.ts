/**
 * Breadcrumb Hierarchy Configuration
 * Defines parent-child relationships for all teacher and admin routes
 * Used by useNavigationContext to build breadcrumb trails
 */

import { ROUTES, RouteName } from '@/constants/routes';

export interface BreadcrumbItem {
    route: RouteName;
    label: string;
    path: string;
}

export interface BreadcrumbConfig {
    parent?: RouteName;
    label: string;
    /** Dynamic label resolver for routes with params (e.g., class names) */
    labelResolver?: (params: Record<string, string>) => Promise<string>;
}

/**
 * Breadcrumb hierarchy mapping
 * Format: [route]: { parent, label }
 */
export const BREADCRUMB_HIERARCHY: Record<string, BreadcrumbConfig> = {
    // ===========================
    // Teacher Routes
    // ===========================

    // Root: Lobby (Materials page) - no parent
    LOBBY: {
        label: 'Materials',
    },

    // Management Group (parent: LOBBY)
    TEACHER_STUDENTS: {
        parent: 'LOBBY',
        label: 'Students',
    },

    TEACHER_STUDENT_HISTORY: {
        parent: 'TEACHER_STUDENTS',
        label: 'Student History',
        labelResolver: async (params) => {
            return `Student ${params.studentId || 'History'}`;
        },
    },

    TEACHER_CLASSES: {
        parent: 'LOBBY',
        label: 'Classes',
    },

    TEACHER_CLASS_DETAIL: {
        parent: 'TEACHER_CLASSES',
        label: 'Class Detail',
        labelResolver: async (params) => {
            // TODO: Fetch class name from Firebase using params.classId
            // For now, return the ID
            return `Class ${params.classId || 'Detail'}`;
        },
    },

    TEACHER_COURSES: {
        parent: 'LOBBY',
        label: 'Courses',
    },

    TEACHER_COURSE_DETAIL: {
        parent: 'TEACHER_COURSES',
        label: 'Course Detail',
        labelResolver: async (params) => {
            // TODO: Fetch course name from Firebase using params.courseId
            // For now, return the ID
            return `Course ${params.courseId || 'Detail'}`;
        },
    },

    // Activity Group (parent: LOBBY)
    SESSIONS: {
        parent: 'LOBBY',
        label: 'Sessions',
    },

    TEACHER_TEST_MONITOR: {
        parent: 'SESSIONS',
        label: 'Test Monitor',
        labelResolver: async (params) => {
            return `Monitor: ${params.sessionCode || 'Session'}`;
        },
    },

    TEACHER_TEST_RESULTS: {
        parent: 'SESSIONS',
        label: 'Test Results',
        labelResolver: async (params) => {
            return `Results: ${params.sessionCode || 'Session'}`;
        },
    },

    TEACHER_LOBBY: {
        parent: 'SESSIONS',
        label: 'Active Session',
        labelResolver: async (params) => {
            return `Session: ${params.sessionCode || 'Active'}`;
        },
    },

    // Quiz routes (parent: SESSIONS)
    TEACHER_QUIZ: {
        parent: 'SESSIONS',
        label: 'Quiz',
        labelResolver: async (params) => {
            return `Quiz: ${params.gameSessionId || 'Game'}`;
        },
    },

    TEACHER_FEEDBACK: {
        parent: 'TEACHER_QUIZ',
        label: 'Feedback',
    },

    TEACHER_RESULTS: {
        parent: 'TEACHER_QUIZ',
        label: 'Results',
    },

    TEACHER_WAITING: {
        parent: 'TEACHER_QUIZ',
        label: 'Waiting',
    },

    CREATE_TEST: {
        parent: 'LOBBY',
        label: 'Create Test',
    },

    // ===========================
    // Admin Routes
    // ===========================

    // Root: Admin Dashboard - no parent (super admin landing page)
    ADMIN_DASHBOARD: {
        label: 'Dashboard',
    },

    ADMIN_MATERIALS: {
        parent: 'ADMIN_DASHBOARD',
        label: 'Materials',
    },

    ADMIN_SESSIONS: {
        parent: 'ADMIN_DASHBOARD',
        label: 'Sessions',
    },

    ADMIN_USERS: {
        parent: 'ADMIN_DASHBOARD',
        label: 'User Management',
    },

    ADMIN_COURSES: {
        parent: 'ADMIN_DASHBOARD',
        label: 'Courses',
    },

    ADMIN_CLASSES: {
        parent: 'ADMIN_DASHBOARD',
        label: 'Classes',
    },
};

/**
 * Build breadcrumb trail for a given route
 * @param currentRoute - Current route name
 * @param params - Route parameters for dynamic labels
 * @returns Array of breadcrumb items from root to current
 */
export const buildBreadcrumbTrail = async (
    currentRoute: RouteName,
    params: Record<string, string> = {}
): Promise<BreadcrumbItem[]> => {
    const trail: BreadcrumbItem[] = [];
    let route: RouteName | undefined = currentRoute;

    // Walk up the hierarchy from current route to root
    while (route) {
        const config = BREADCRUMB_HIERARCHY[route];

        if (!config) {
            // Route not in hierarchy, stop here
            break;
        }

        // Resolve label (static or dynamic)
        let label = config.label;
        if (config.labelResolver && params) {
            try {
                label = await config.labelResolver(params);
            } catch (error) {
                console.warn(`Failed to resolve label for ${route}:`, error);
                // Fallback to static label
            }
        }

        // Add to trail (we'll reverse at the end)
        trail.unshift({
            route,
            label,
            path: ROUTES[route],
        });

        // Move to parent
        route = config.parent as RouteName | undefined;
    }

    return trail;
};

/**
 * Get parent route for back button navigation
 * @param currentRoute - Current route name
 * @returns Parent route name or undefined if at root
 */
export const getParentRoute = (currentRoute: RouteName): RouteName | undefined => {
    const config = BREADCRUMB_HIERARCHY[currentRoute];
    return config?.parent as RouteName | undefined;
};

/**
 * Check if a route is a root route (no parent)
 * @param route - Route name to check
 * @returns True if route has no parent
 */
export const isRootRoute = (route: RouteName): boolean => {
    const config = BREADCRUMB_HIERARCHY[route];
    return !config?.parent;
};
