/**
 * Central Route Definitions
 * Single source of truth for all application routes
 * 
 * Usage:
 *   import { ROUTES, buildRoute } from '@/constants/routes';
 *   const path = buildRoute('STUDENT_TEST', { sessionCode: 'ABC123' });
 */

export const ROUTES = {
  // Authentication
  LOGIN: '/',

  // Teacher Routes
  TEACHER_LOBBY: '/teacher-lobby/:sessionCode',
  TEACHER_TEST_MONITOR: '/teacher-test/:sessionCode',
  TEACHER_TEST_RESULTS: '/teacher-test-results/:sessionCode',
  TEACHER_QUIZ: '/teacher-quiz/:gameSessionId',
  TEACHER_FEEDBACK: '/teacher-feedback/:gameSessionId',
  TEACHER_RESULTS: '/teacher-results/:gameSessionId',
  TEACHER_WAITING: '/teacher-wait/:gameSessionId',
  TEACHER_CLASSES: '/teacher/classes',
  TEACHER_CLASS_DETAIL: '/teacher/classes/:classId',
  TEACHER_COURSES: '/teacher/courses',
  TEACHER_COURSE_DETAIL: '/teacher/courses/:courseId',

  // Student Routes
  STUDENT_DASHBOARD: '/student/dashboard',
  STUDENT_COURSES: '/student/courses',
  STUDENT_COURSE_DETAIL: '/student/courses/:courseId',
  STUDENT_COURSE_CATALOG: '/student/courses/catalog',
  STUDENT_CLASS_DETAIL: '/student/classes/:classId',
  STUDENT_WAITING: '/student-wait/:gameSessionId',
  STUDENT_TEST: '/student-test/:sessionCode',
  STUDENT_TEST_RESULTS: '/student-test-results/:sessionCode',
  STUDENT_QUIZ: '/student-quiz/:gameSessionId',
  STUDENT_FEEDBACK: '/student-feedback/:gameSessionId',
  STUDENT_RESULTS: '/student-results/:gameSessionId',

  // Admin Routes (Super Admin Only)
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_MATERIALS: '/admin/materials',
  ADMIN_SESSIONS: '/admin/sessions',
  ADMIN_USERS: '/admin/users',
  ADMIN_COURSES: '/admin/courses',
  ADMIN_CLASSES: '/admin/classes',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_BACKUP: '/admin/backup',

  // Teacher Routes - Student Management
  TEACHER_STUDENTS: '/teacher/students',

  // Teacher Routes - Homework (PRD-0016)
  TEACHER_HOMEWORK: '/teacher/homework',
  TEACHER_HOMEWORK_CREATE: '/teacher/homework/create',
  TEACHER_HOMEWORK_DETAIL: '/teacher/homework/:homeworkId',
  TEACHER_HOMEWORK_EDIT: '/teacher/homework/:homeworkId/edit',

  // Teacher Routes - Test Creation (PRD-0020)
  TEACHER_TEST_CREATE: '/teacher/test/create',

  // Teacher Routes - Test Review (PRD-0022)
  TEACHER_TEST_REVIEW: '/teacher/test/review/:draftId',

  // Teacher Routes - THCS-THPT Test Editor (PRD-0027)
  TEACHER_THCS_CREATE: '/teacher/thcs-test/create',
  TEACHER_THCS_EDIT: '/teacher/thcs-test/edit/:draftId',

  // Teacher Routes - THCS Grading Tab (PRD-0028)
  TEACHER_GRADING: '/teacher/grading',

  // Teacher Routes - IELTS Writing (PRD-0030)
  TEACHER_WRITING_CREATE: '/teacher/writing-test/create',
  TEACHER_WRITING_EDIT: '/teacher/writing-test/edit/:draftId',
  TEACHER_GRADING_QUEUE: '/teacher/grading/writing',
  TEACHER_GRADING_DETAIL: '/teacher/grading/writing/:submissionId',

  SESSIONS: '/sessions',

  CREATE_TEST: '/create-test',

  // LOBBY route - used for "back to lobby" when no session is active
  LOBBY: '/lobby',

  // Student Routes - Homework & Library (PRD-0016)
  STUDENT_HOMEWORK: '/student/homework',
  STUDENT_HOMEWORK_DETAIL: '/student/homework/:homeworkId',
  STUDENT_LIBRARY: '/student/library',
  STUDENT_PRACTICE: '/student/practice/:materialId',
} as const;

// Type-safe route names
export type RouteName = keyof typeof ROUTES;

// Route parameters interface
export interface RouteParams {
  sessionCode?: string;
  gameSessionId?: string;
  quizId?: string;
  testId?: string;
  id?: string;
  classId?: string;
  teacherId?: string; // For filtering students by teacher
  courseId?: string;
  // PRD-0016: Homework & Solo Study
  homeworkId?: string;
  materialId?: string;
  // PRD-0022: Draft Management
  draftId?: string;
  // PRD-0030: IELTS Writing
  submissionId?: string;
}

/**
 * Build a route path with parameters
 * @param route - Route name from ROUTES constant
 * @param params - Route parameters to inject
 * @returns Complete route path with parameters injected
 * 
 * @example
 * buildRoute('STUDENT_TEST', { sessionCode: 'ABC123' })
 * // Returns: '/student-test/ABC123'
 */
export const buildRoute = (
  route: RouteName,
  params?: RouteParams
): string => {
  let path: string = ROUTES[route];

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      // Only replace if value is defined and not null
      if (value !== undefined && value !== null) {
        path = path.replace(`:${key}`, String(value));
      }
    });
  }

  return path;
};

/**
 * Extract parameters from a route path
 * @param route - Route name
 * @param path - Actual path to extract from
 * @returns Extracted parameters or null if no match
 * 
 * @example
 * extractParams('STUDENT_TEST', '/student-test/ABC123')
 * // Returns: { sessionCode: 'ABC123' }
 */
export const extractParams = (
  route: RouteName,
  path: string
): RouteParams | null => {
  const template = ROUTES[route];
  const templateParts = template.split('/');
  const pathParts = path.split('/');

  if (templateParts.length !== pathParts.length) {
    return null;
  }

  const params: RouteParams = {};

  for (let i = 0; i < templateParts.length; i++) {
    const templatePart = templateParts[i];
    const pathPart = pathParts[i];

    if (!templatePart || !pathPart) continue;

    if (templatePart.startsWith(':')) {
      const paramName = templatePart.slice(1) as keyof RouteParams;
      params[paramName] = pathPart;
    } else if (templatePart !== pathPart) {
      return null;
    }
  }

  return params;
};

/**
 * Check if a path matches a route pattern
 * @param route - Route name to check against
 * @param path - Path to validate
 * @returns True if path matches route pattern
 */
export const matchesRoute = (route: RouteName, path: string): boolean => {
  return extractParams(route, path) !== null;
};
