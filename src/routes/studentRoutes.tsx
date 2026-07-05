import React from 'react';
import type { RouteObject } from 'react-router-dom';
import { lazyWithRetry } from '../utils/lazyWithRetry.ts';
import PrivateRoute from '../components/PrivateRoute.jsx';
import { ProfileCompletionGuard } from '../components/ProfileCompletionGuard.tsx';
import { ROUTES } from '../constants/routes.ts';
import { withTrackedRoute } from './routeHelpers.tsx';
import StudentShellRoute from './StudentShellRoute.tsx';
import RetiredMaterialNoticePage from '../pages/RetiredMaterialNoticePage';

const StudentDashboardPage = lazyWithRetry(() => import('../pages/StudentDashboardPage.jsx'));
const StudentCoursesPage = lazyWithRetry(() => import('../pages/StudentCoursesPage.tsx'));
const StudentCourseDetailPage = lazyWithRetry(() => import('../pages/StudentCourseDetailPage.tsx'));
const StudentClassDetailPage = lazyWithRetry(() => import('../pages/StudentClassDetailPage.jsx'));
const StudentLibraryPage = lazyWithRetry(() => import('../pages/StudentLibraryPage.tsx'));
const StudentHomeworkListPage = lazyWithRetry(() => import('../pages/StudentHomeworkListPage.tsx'));
const AcademicRecordPage = lazyWithRetry(() => import('../pages/AcademicRecordPage.tsx'));
const StudentWaitingRoomPage = lazyWithRetry(() => import('../pages/StudentWaitingRoomPage.jsx'));
const TestPageRouter = lazyWithRetry(() => import('../pages/TestPageRouter.tsx'));
const StudentTestResultsPage = lazyWithRetry(() => import('../pages/StudentTestResultsPage.tsx'));
const StudentPracticePage = lazyWithRetry(() => import('../pages/StudentPracticePage.tsx'));
const StudentCourseCatalogPage = lazyWithRetry(() => import('../pages/CourseCatalogPage.tsx'));
const StudentHomeworkDetailPage = lazyWithRetry(() => import('../pages/StudentHomeworkDetailPage.tsx'));
const SubmissionCompletePage = lazyWithRetry(() => import('../pages/SubmissionCompletePage.tsx'));

function asStudentPage(children: React.ReactNode, featureName?: string) {
  return (
    <PrivateRoute allowedRoles={['student']}>
      {withTrackedRoute(children, featureName)}
    </PrivateRoute>
  );
}

function asStudentProfilePage(children: React.ReactNode, featureName?: string) {
  return asStudentPage(
    <ProfileCompletionGuard>{children}</ProfileCompletionGuard>,
    featureName
  );
}

export const studentRoutes: RouteObject[] = [
  {
    path: '/student',
    element: <StudentShellRoute />,
    children: [
      {
        index: true,
        element: asStudentProfilePage(<StudentDashboardPage />),
      },
      {
        path: 'dashboard',
        element: asStudentProfilePage(<StudentDashboardPage />),
      },
      {
        path: 'courses',
        element: asStudentPage(<StudentCoursesPage />, 'courses'),
      },
      {
        path: 'courses/:courseId',
        element: asStudentPage(<StudentCourseDetailPage />, 'courses'),
      },
      {
        path: 'courses/catalog',
        element: asStudentPage(<StudentCourseCatalogPage />, 'courses'),
      },
      {
        path: 'classes/:classId',
        element: asStudentPage(<StudentClassDetailPage />, 'classes'),
      },
      {
        path: 'library',
        element: asStudentPage(<StudentLibraryPage />, 'materials'),
      },
      {
        path: 'homework',
        element: asStudentPage(<StudentHomeworkListPage />, 'homework'),
      },
      {
        path: 'homework/:homeworkId',
        element: asStudentPage(<StudentHomeworkDetailPage />, 'homework'),
      },
      {
        path: 'homework/:homeworkId/test',
        element: asStudentPage(<StudentPracticePage />, 'testTaking'),
      },
      {
        path: 'academic-record',
        element: asStudentPage(<AcademicRecordPage />, 'academicRecords'),
      },
      {
        path: 'results/:sessionCode',
        element: asStudentPage(<StudentTestResultsPage />, 'results'),
      },
    ],
  },
  {
    path: '/student-wait/:gameSessionId',
    element: asStudentPage(<StudentWaitingRoomPage />, 'liveSessions'),
  },
  {
    path: '/student-quiz/:gameSessionId',
    element: asStudentPage(<RetiredMaterialNoticePage audience="student" retiredFeature="quiz" />),
  },
  {
    path: '/student-test/:sessionCode',
    element: asStudentPage(<TestPageRouter />, 'testTaking'),
  },
  {
    path: '/student-test-results/:sessionCode',
    element: asStudentPage(<StudentTestResultsPage />, 'results'),
  },
  {
    path: '/student-feedback/:gameSessionId',
    element: asStudentPage(<RetiredMaterialNoticePage audience="student" retiredFeature="quiz" />),
  },
  {
    path: '/student-results/:gameSessionId',
    element: asStudentPage(<RetiredMaterialNoticePage audience="student" retiredFeature="quiz" />),
  },
  {
    path: ROUTES.MATERIAL_UNAVAILABLE,
    element: asStudentPage(
      <RetiredMaterialNoticePage audience="student" retiredFeature="material" />,
      'materials',
    ),
  },
  {
    path: '/student/practice/:materialId',
    element: asStudentPage(<StudentPracticePage />, 'testTaking'),
  },
  {
    path: '/student/solo-test/:materialId',
    element: asStudentPage(<StudentPracticePage />, 'testTaking'),
  },
  {
    path: '/submission-complete',
    element: asStudentPage(<SubmissionCompletePage />, 'results'),
  },
];
