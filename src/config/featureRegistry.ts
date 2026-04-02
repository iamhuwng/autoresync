/**
 * Feature Registry — Central registry of all tracked features
 * PRD-0037: Production Reporting & Observability System
 *
 * Exports:
 * - FEATURE_REGISTRY: array of all feature definitions
 * - resolveFeatureFromRoute(pathname): maps URL → feature ID
 * - validateFeatureId(id): checks if a feature ID is registered
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FeatureDefinition {
  id: string;
  name: string;
  routes: string[];
  actions: string[];
  description: string;
}

export const FEATURE_IDS = {
  antiCheat: 'antiCheat',
  classes: 'classes',
  grading: 'grading',
  homework: 'homework',
  results: 'results',
  studentDashboard: 'studentDashboard',
  testCreation: 'testCreation',
} as const;

// ─── Registry ───────────────────────────────────────────────────────────────

export const FEATURE_REGISTRY: FeatureDefinition[] = [
  {
    id: 'testTaking',
    name: 'Test Taking',
    routes: [
      '/student-test/:sessionCode',
      '/student/practice/:materialId',
      '/student/solo-test/:materialId',
      '/student/homework/:homeworkId/test',
    ],
    actions: [
      'startTest',
      'submitAnswer',
      'nextQuestion',
      'previousQuestion',
      'finishTest',
      'timeOut',
      'abandonTest',
    ],
    description: 'Student test-taking and practice sessions',
  },
  {
    id: FEATURE_IDS.testCreation,
    name: 'Test Creation',
    routes: [
      '/teacher/test/create',
      '/teacher/test/create-standalone',
      '/teacher/test/review/:draftId',
      '/teacher/thcs-test/create',
      '/teacher/thcs-test/edit/:draftId',
      '/teacher/writing-test/create',
      '/teacher/writing-test/edit/:draftId',
    ],
    actions: [
      'createTest',
      'editTest',
      'toggleVisibility',
      'saveDraft',
      'publishTest',
      'deleteTest',
      'uploadDocument',
      'parseDocument',
      'aiGenerate',
    ],
    description: 'Teacher test creation and editing workflows',
  },
  {
    id: FEATURE_IDS.homework,
    name: 'Homework',
    routes: [
      '/teacher/homework',
      '/teacher/homework/:homeworkId',
      '/teacher/homework/student/:studentId',
      '/student/homework',
      '/student/homework/:homeworkId',
    ],
    actions: [
      'assignHomework',
      'submitHomework',
      'reviewHomework',
      'viewIntegrityDetails',
      'archiveHomework',
      'bulkAssign',
    ],
    description: 'Homework assignment and management',
  },
  {
    id: 'courses',
    name: 'Courses',
    routes: [
      '/teacher/courses',
      '/teacher/courses/:courseId',
      '/student/courses',
      '/student/courses/:courseId',
      '/student/courses/catalog',
    ],
    actions: [
      'createCourse',
      'editCourse',
      'enrollStudent',
      'syncCourse',
      'addMaterial',
      'addAnnouncement',
    ],
    description: 'Course management for teachers and students',
  },
  {
    id: FEATURE_IDS.classes,
    name: 'Classes',
    routes: [
      '/teacher/classes',
      '/teacher/classes/:classId',
      '/student/classes/:classId',
    ],
    actions: [
      'createClass',
      'editClass',
      'addStudent',
      'removeStudent',
      'viewHomeworkTab',
      'openHomeworkCreateModal',
      'openHomeworkDetail',
      'openHomeworkDashboard',
    ],
    description: 'Class management and viewing',
  },
  {
    id: 'liveSessions',
    name: 'Live Sessions',
    routes: [
      '/teacher-wait/:gameSessionId',
      '/teacher-test/:sessionCode',
      '/teacher-quiz/:gameSessionId',
      '/student-wait/:gameSessionId',
      '/student-quiz/:gameSessionId',
    ],
    actions: [
      'createSession',
      'joinSession',
      'startSession',
      'endSession',
      'forceSubmitStudent',
      'viewIntegrityDetails',
      'refreshIntegrityLogs',
      'resetStudentSubmission',
    ],
    description: 'Real-time quiz and game sessions',
  },
  {
    id: FEATURE_IDS.antiCheat,
    name: 'Anti-Cheat',
    routes: [],
    actions: [
      'initializeProtection',
      'restoreIntegrityState',
      'recordViolation',
      'recordSignal',
      'escalateWarning',
      'triggerAutoSubmit',
      'flushIntegrityLogs',
      'persistIntegritySnapshot',
      'persistSessionIntegrity',
      'persistHomeworkIntegrity',
      'handleTeacherForceSubmit',
      'blockHomeworkEntry',
    ],
    description:
      'High-signal runtime telemetry for integrity detection, persistence, and teacher-triggered anti-cheat flows',
  },
  {
    id: FEATURE_IDS.grading,
    name: 'Grading',
    routes: [
      '/teacher/grading',
      '/teacher/grading/writing',
      '/teacher/grading/writing/:submissionId',
    ],
    actions: [
      'openSubmission',
      'startRegrade',
      'acquireLock',
      'lockExpired',
      'discardDraftTakeover',
      'cancelDraftTakeover',
      'saveDraft',
      'submitGrading',
      'cancelRegrade',
      'switchTask',
      'switchTab',
      'toggleOriginalView',
      'addComment',
      'addCorrection',
      'editCorrection',
      'deleteCorrection',
      'resolveComment',
      'deleteComment',
      'recoverComment',
      'useQuickComment',
      'viewSuggestions',
      'generateSuggestions',
      'reloadSuggestions',
      'focusSuggestion',
      'injectSuggestionComment',
      'injectSuggestionCorrection',
      'discardChanges',
      'cancelLeave',
      'bulkGrade',
    ],
    description: 'Teacher grading workflows',
  },
  {
    id: 'aiOperations',
    name: 'AI Operations',
    routes: [],
    actions: [
      'generateFeedback',
      'parseDocument',
      'classifyQuestion',
      'generateQuiz',
      'aiRetry',
      'aiFailure',
    ],
    description: 'AI-powered operations across features',
  },
  {
    id: 'authentication',
    name: 'Authentication',
    routes: ['/'],
    actions: [
      'login',
      'logout',
      'register',
      'resetPassword',
      'toggleDevQuickLogin',
      'roleSwitch',
    ],
    description: 'User authentication and authorization',
  },
  {
    id: 'adminPanel',
    name: 'Admin Panel',
    routes: ['/admin/*'],
    actions: [
      'viewDashboard',
      'manageUsers',
      'manageClasses',
      'viewBackups',
      'triggerBackup',
      'updateReportingMode',
      'toggleReportingCategory',
      'toggleReportingAdvancedPanel',
      'saveReportingRetention',
      'purgeReports',
      'viewReports',
    ],
    description: 'Super admin management panel',
  },
  {
    id: FEATURE_IDS.studentDashboard,
    name: 'Student Dashboard',
    routes: [
      '/student',
      '/student/dashboard',
    ],
    actions: [
      'filterFeed',
      'searchFeed',
      'toggleUnreadFeed',
      'loadMoreFeed',
      'markAllFeedRead',
      'openJoinClassModal',
      'closeJoinClassModal',
      'submitJoinClass',
      'joinLiveSession',
      'joinPublicSession',
      'expandPublicSessions',
      'openAcademicHistory',
      'openFeedResult',
      'openSessionNotification',
      'openFeedLink',
      'openHomeworkList',
      'openHomeworkAssignment',
      'closeResultSlidePanel',
    ],
    description: 'Student dashboard feed, activity, live sessions, and join-class workflows',
  },
  {
    id: 'academicRecords',
    name: 'Academic Records',
    routes: ['/student/academic-record'],
    actions: [
      'viewRecords',
      'viewFeedback',
      'requestFeedback',
      'openSlidePanel',
      'closeSlidePanel',
      'switchResultTab',
      'selectAttempt',
      'jumpToQuestion',
      'retryAiFeedback',
      'returnToDashboard',
    ],
    description: 'Student academic record viewing',
  },
  {
    id: FEATURE_IDS.results,
    name: 'Results',
    routes: [
      '/guest-results',
      '/teacher/results',
      '/teacher/student/:studentId/history',
      '/teacher-results/:gameSessionId',
      '/student-results/:gameSessionId',
      '/teacher-test-results/:sessionCode',
      '/student-test-results/:sessionCode',
      '/student/results/:sessionCode',
      '/submission-complete',
      '/result/:resultId',
      '/profile/complete',
    ],
    actions: [
        'viewResults',
        'viewIntegrityDetails',
        'generateFeedback',
        'viewQuestion',
        'toggleSessionDetails',
        'exportResultsCsv',
        'exportResultsPdf',
        'openStudentHistory',
        'markResultReviewed',
        'openWritingGrading',
        // PRD-0039 Task 9.14: Slide panel actions
      'openSlidePanel',
      'closeSlidePanel',
      'switchResultTab',
      'selectAttempt',
      'jumpToQuestion',
      'retryAiFeedback',
      'returnToDashboard',
      'printWritingResults',
      'switchWritingMarkupMode',
      'toggleWritingCriteriaFeedback',
    ],
    description: 'Quiz and test result viewing',
  },
  {
    id: 'feedback',
    name: 'Feedback',
    routes: [
      '/teacher-feedback/:gameSessionId',
      '/student-feedback/:gameSessionId',
    ],
    actions: [
      'viewFeedback',
      'submitFeedback',
    ],
    description: 'Session feedback collection and viewing',
  },
  {
    id: 'profile',
    name: 'Profile',
    routes: ['/profile'],
    actions: [
      'editProfile',
      'changePassword',
      'updateAvatar',
    ],
    description: 'User profile management',
  },
  {
    id: 'materials',
    name: 'Materials',
    routes: [
      '/material/:materialId',
      '/student/library',
    ],
    actions: [
      'viewMaterial',
      'searchMaterials',
      'startPractice',
    ],
    description: 'Material browsing and library access',
  },
  {
    id: 'sessions',
    name: 'Session Management',
    routes: ['/sessions'],
    actions: [
      'viewSessions',
      'archiveSession',
      'deleteSession',
    ],
    description: 'Teacher session management',
  },
  // DEVELOPER NOTE: When adding a new feature, also:
  // 1. Add a new entry here with id, name, routes, actions, description
  // 2. Add the useFeatureTracking hook call in the page component
  // 3. Add trackAction calls for user-facing actions
  // 4. Update documentation/rules/observability.md if needed
];

// ─── Route Resolution ─────────────────────────────────────────────────────

/**
 * Resolve a pathname to a feature ID from the registry.
 * Returns null if no match found.
 */
export function resolveFeatureFromRoute(pathname: string): string | null {
  for (const feature of FEATURE_REGISTRY) {
    for (const route of feature.routes) {
      // Special case for /admin/* wildcard
      if (route === '/admin/*') {
        if (pathname.startsWith('/admin/')) {
          return feature.id;
        }
        continue;
      }

      // Convert :param segments to regex wildcards
      const regexStr = '^' + route.replace(/:[^/]+/g, '[^/]+') + '$';
      try {
        const regex = new RegExp(regexStr);
        if (regex.test(pathname)) {
          return feature.id;
        }
      } catch {
        // Invalid regex — skip this route
      }
    }
  }
  return null;
}

/**
 * Validate that a feature ID exists in the registry.
 * In development, logs a warning for unknown IDs.
 */
export function validateFeatureId(featureId: string): boolean {
  const exists = FEATURE_REGISTRY.some((f) => f.id === featureId);
  if (!exists && import.meta.env.DEV) {
    console.warn('[FeatureRegistry] Unknown feature ID: ' + featureId);
  }
  return exists;
}
