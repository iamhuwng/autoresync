/**
 * WebMCP Core Tools — Navigation
 * 
 * Tools for navigating between pages in the app.
 * Always available regardless of route.
 * 
 * @dev-only
 */

import type { ToolRegistration } from '../types';

/** All valid routes in the application for AI agent reference */
const VALID_ROUTES = [
    '/',
    '/lobby',
    '/student',
    '/student/dashboard',
    '/student/library',
    '/student/homework',
    '/student/courses',
    '/student/courses/catalog',
    '/student/academic-record',
    '/profile',
    '/profile/complete',
    '/teacher/homework',
    '/teacher/classes',
    '/teacher/courses',
    '/teacher/students',
    '/teacher/results',
    '/teacher/grading',
    '/teacher/test/create',
    '/teacher/thcs-test/create',
    '/sessions',
    '/admin/dashboard',
    '/admin/users',
    '/admin/materials',
    '/admin/sessions',
    '/admin/courses',
    '/admin/classes',
    '/admin/settings',
    '/admin/backup',
    '/admin/migration',
    '/demo',
] as const;

export const navigationTools: ToolRegistration[] = [
    {
        category: 'navigation',
        tool: {
            name: 'navigate_to_page',
            description: 'Navigate to a specific page in the app by its route path. Use this instead of clicking navigation links.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The route path to navigate to. Must be one of the valid routes.',
                        enum: [...VALID_ROUTES],
                    },
                },
                required: ['path'],
            },
            execute: async ({ path }) => {
                const pathStr = String(path);
                // Validate route exists
                if (!VALID_ROUTES.includes(pathStr as typeof VALID_ROUTES[number]) &&
                    !pathStr.match(/^\/(student|teacher|admin)\//)) {
                    return {
                        content: [{ type: 'text', text: `Invalid route: ${pathStr}. Use get_available_routes to see valid routes.` }],
                        isError: true,
                    };
                }
                window.location.href = pathStr;
                // Wait a bit for React Router to process
                await new Promise(resolve => setTimeout(resolve, 500));
                return { content: [{ type: 'text', text: `Navigated to ${pathStr}` }] };
            },
        },
    },
    {
        category: 'navigation',
        tool: {
            name: 'get_current_page',
            description: 'Get information about the current page: URL path, page title, and query parameters.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            path: window.location.pathname,
                            search: window.location.search,
                            hash: window.location.hash,
                            title: document.title,
                            fullUrl: window.location.href,
                        }),
                    }],
                };
            },
        },
    },
    {
        category: 'navigation',
        tool: {
            name: 'get_available_routes',
            description: 'List all valid routes in the application. Useful for knowing where you can navigate.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            routes: VALID_ROUTES,
                            parameterizedRoutes: [
                                '/student/courses/:courseId',
                                '/student/classes/:classId',
                                '/student/homework/:homeworkId',
                                '/student/practice/:materialId',
                                '/student-test/:sessionCode',
                                '/teacher/classes/:classId',
                                '/teacher/courses/:courseId',
                                '/teacher-test/:sessionCode',
                                '/teacher-test-results/:sessionCode',
                                '/material/:materialId',
                                '/result/:resultId',
                            ],
                        }),
                    }],
                };
            },
        },
    },
    {
        category: 'navigation',
        tool: {
            name: 'go_back',
            description: 'Navigate back to the previous page (browser back button equivalent).',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                window.history.back();
                await new Promise(resolve => setTimeout(resolve, 500));
                return { content: [{ type: 'text', text: `Navigated back to ${window.location.pathname}` }] };
            },
        },
    },
];
