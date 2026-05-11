import React from 'react';
import type { RouteObject } from 'react-router-dom';
import { lazyWithRetry } from '../utils/lazyWithRetry.ts';
import PrivateRoute from '../components/PrivateRoute.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { ProfileCompletionGuard } from '../components/ProfileCompletionGuard.tsx';
import { isReadingV2TeacherRouteExposureAllowed } from '../config/readingV2FeatureFlags.ts';
import { withTrackedRoute } from './routeHelpers.tsx';

const TeacherLobbyPage = lazyWithRetry(() => import('../pages/TeacherLobbyPage.jsx'));
const SessionManagementPage = lazyWithRetry(() => import('../pages/SessionManagementPage.tsx'));
const TeacherResultsDashboard = lazyWithRetry(() => import('../pages/TeacherResultsDashboard.jsx'));
const TestBuilderRouter = lazyWithRetry(() => import('../pages/TestBuilderRouter'));
const TeacherWaitingRoomPage = lazyWithRetry(() => import('../pages/TeacherWaitingRoomPage.jsx'));
const TeacherQuizPage = lazyWithRetry(() => import('../pages/TeacherQuizPage.jsx'));
const TeacherTestMonitorPage = lazyWithRetry(() => import('../pages/TeacherTestMonitorPage.tsx'));
const TeacherTestResultsPage = lazyWithRetry(() => import('../pages/TeacherTestResultsPage.tsx'));
const TeacherFeedbackPage = lazyWithRetry(() => import('../pages/TeacherFeedbackPage.jsx'));
const TeacherResultsPage = lazyWithRetry(() => import('../pages/TeacherResultsPage.jsx'));
const TeacherClassesPage = lazyWithRetry(() => import('../pages/TeacherClassesPage.tsx'));
const TeacherCoursesPage = lazyWithRetry(() => import('../pages/TeacherCoursesPage.tsx'));
const TeacherCourseProfilePage = lazyWithRetry(() => import('../pages/TeacherCourseProfilePage.tsx'));
const MaterialProfilePage = lazyWithRetry(() => import('../pages/MaterialProfilePage.tsx'));
const TeacherClassDetailPage = lazyWithRetry(() => import('../pages/TeacherClassDetailPage.tsx'));
const TeacherStudentHistoryPage = lazyWithRetry(() => import('../pages/TeacherStudentHistoryPage.tsx'));
const StudentHomeworkProfile = lazyWithRetry(() => import('../pages/StudentHomeworkProfile.tsx'));
const TeacherHomeworkDetailPage = lazyWithRetry(() => import('../pages/TeacherHomeworkDetailPage.tsx'));
const TeacherHomeworkListPage = lazyWithRetry(() => import('../pages/TeacherHomeworkListPage.tsx'));
const TestCreationRedirectPage = lazyWithRetry(() => import('../pages/TestCreationRedirectPage.tsx'));
const TestCreationPage = lazyWithRetry(() => import('../pages/TestCreationPage.tsx'));
const TestReviewPage = lazyWithRetry(() => import('../pages/TestReviewPage.tsx'));
const ReadingV2StudioPage = lazyWithRetry(() => import('../pages/ReadingV2StudioPage.tsx'));
const THCSTestEditorPage = lazyWithRetry(() => import('../pages/THCSTestEditorPage.tsx'));
const TeacherGradingPage = lazyWithRetry(() => import('../pages/TeacherGradingPage.tsx'));
const WritingTestBuilder = lazyWithRetry(() => import('../pages/WritingTestBuilder.tsx'));
const WritingGradingPage = lazyWithRetry(() => import('../pages/WritingGradingPage.tsx'));
const TeacherStudentsPage = lazyWithRetry(() => import('../pages/TeacherStudentsPage.tsx'));

function asTeacherPage(
  children: React.ReactNode,
  featureName?: string,
  allowedRoles: string[] = ['teacher']
) {
  return (
    <PrivateRoute allowedRoles={allowedRoles}>
      <ErrorBoundary>
        {withTrackedRoute(children, featureName)}
      </ErrorBoundary>
    </PrivateRoute>
  );
}

function asTeacherProfilePage(
  children: React.ReactNode,
  featureName?: string,
  allowedRoles: string[] = ['teacher']
) {
  return asTeacherPage(
    <ProfileCompletionGuard>{children}</ProfileCompletionGuard>,
    featureName,
    allowedRoles
  );
}

function asTeacherErrorBoundaryPage(
  children: React.ReactNode,
  featureName?: string,
  allowedRoles: string[] = ['teacher']
) {
  return asTeacherPage(children, featureName, allowedRoles);
}

const readingV2StudioRoutes = (): RouteObject[] => [
  {
    path: '/teacher/reading-v2/create',
    element: asTeacherErrorBoundaryPage(<ReadingV2StudioPage />, 'readingV2Studio', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher/reading-v2/import',
    element: asTeacherErrorBoundaryPage(<ReadingV2StudioPage />, 'readingV2Studio', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher/reading-v2/drafts/:draftId',
    element: asTeacherErrorBoundaryPage(<ReadingV2StudioPage />, 'readingV2Studio', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher/reading-v2/materials/:materialId/revise',
    element: asTeacherErrorBoundaryPage(<ReadingV2StudioPage />, 'readingV2Studio', ['teacher', 'super_admin']),
  },
];

export interface TeacherRoutesOptions {
  readonly exposeReadingV2StudioRoutes?: boolean;
}

export const createTeacherRoutes = (
  options: TeacherRoutesOptions = {},
): RouteObject[] => {
  const exposeReadingV2StudioRoutes =
    options.exposeReadingV2StudioRoutes ?? isReadingV2TeacherRouteExposureAllowed();

  return [
  {
    path: '/teacher/students',
    element: asTeacherPage(<TeacherStudentsPage />),
  },
  {
    path: '/teacher/homework/student/:studentId',
    element: asTeacherErrorBoundaryPage(<StudentHomeworkProfile />, 'homework'),
  },
  {
    path: '/teacher/homework/:homeworkId',
    element: asTeacherErrorBoundaryPage(<TeacherHomeworkDetailPage />, 'homework'),
  },
  {
    path: '/teacher/homework',
    element: asTeacherErrorBoundaryPage(<TeacherHomeworkListPage />, 'homework'),
  },
  {
    path: '/lobby',
    element: asTeacherProfilePage(<TeacherLobbyPage />),
  },
  {
    path: '/teacher-lobby/:sessionCode',
    element: asTeacherProfilePage(<TeacherLobbyPage />),
  },
  {
    path: '/sessions',
    element: asTeacherPage(<SessionManagementPage />, 'sessions'),
  },
  {
    path: '/teacher/results',
    element: asTeacherPage(<TeacherResultsDashboard />, 'results', ['teacher', 'super_admin']),
  },
  {
    path: '/create-test',
    element: asTeacherPage(<TestBuilderRouter />, 'testCreation'),
  },
  {
    path: '/teacher-wait/:gameSessionId',
    element: asTeacherPage(<TeacherWaitingRoomPage />, 'liveSessions'),
  },
  {
    path: '/teacher-quiz/:gameSessionId',
    element: asTeacherPage(<TeacherQuizPage />, 'liveSessions'),
  },
  {
    path: '/teacher-test/:sessionCode',
    element: asTeacherPage(<TeacherTestMonitorPage />),
  },
  {
    path: '/teacher-test-results/:sessionCode',
    element: asTeacherPage(<TeacherTestResultsPage />, 'results', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher-feedback/:gameSessionId',
    element: asTeacherPage(<TeacherFeedbackPage />, 'feedback'),
  },
  {
    path: '/teacher-results/:gameSessionId',
    element: asTeacherPage(<TeacherResultsPage />, 'results'),
  },
  {
    path: '/teacher/classes',
    element: asTeacherPage(<TeacherClassesPage />, 'classes'),
  },
  {
    path: '/teacher/courses',
    element: asTeacherPage(<TeacherCoursesPage />, 'courses'),
  },
  {
    path: '/teacher/courses/:courseId',
    element: asTeacherPage(<TeacherCourseProfilePage />, 'courses'),
  },
  {
    path: '/material/:materialId',
    element: asTeacherPage(<MaterialProfilePage />, 'materials'),
  },
  {
    path: '/teacher/classes/:classId',
    element: asTeacherPage(<TeacherClassDetailPage />, 'classes'),
  },
  {
    path: '/teacher/student/:studentId/history',
    element: asTeacherPage(<TeacherStudentHistoryPage />, 'results'),
  },
  {
    path: '/teacher/test/create',
    element: asTeacherPage(<TestCreationRedirectPage />, 'testCreation', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher/test/create-standalone',
    element: asTeacherErrorBoundaryPage(<TestCreationPage />, 'testCreation', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher/test/review/:draftId',
    element: asTeacherErrorBoundaryPage(<TestReviewPage />, 'testCreation', ['teacher', 'super_admin']),
  },
  // Reading V2 route URLs remain registered for feature ownership, but the
  // route table mounts them only after the rollout mode allows teacher entry.
  ...(exposeReadingV2StudioRoutes ? readingV2StudioRoutes() : []),
  {
    path: '/teacher/thcs-test/create',
    element: asTeacherErrorBoundaryPage(<THCSTestEditorPage />, 'testCreation'),
  },
  {
    path: '/teacher/thcs-test/edit/:draftId',
    element: asTeacherErrorBoundaryPage(<THCSTestEditorPage />, 'testCreation'),
  },
  {
    path: '/teacher/grading',
    element: asTeacherErrorBoundaryPage(<TeacherGradingPage />, 'grading', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher/writing-test/create',
    element: asTeacherErrorBoundaryPage(<WritingTestBuilder />, 'testCreation', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher/writing-test/edit/:draftId',
    element: asTeacherErrorBoundaryPage(<WritingTestBuilder />, 'testCreation', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher/grading/writing',
    element: asTeacherErrorBoundaryPage(<TeacherGradingPage />, 'grading', ['teacher', 'super_admin']),
  },
  {
    path: '/teacher/grading/writing/:submissionId',
    element: asTeacherErrorBoundaryPage(<WritingGradingPage />, 'grading', ['teacher', 'super_admin']),
  },
  ];
};

export const teacherRoutes: RouteObject[] = createTeacherRoutes();
