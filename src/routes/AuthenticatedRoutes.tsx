import React from 'react';
import { Navigate, useRoutes, type RouteObject } from 'react-router-dom';
import { lazyWithRetry } from '../utils/lazyWithRetry.ts';
import { useAuth } from '../hooks/useAuth';
import { auth, database } from '../services/firebaseCore';
import { reportingService } from '../services/reportingService';
import { useDeferredIdleTask } from '../core/platform/hooks/useDeferredIdleTask.ts';
import PrivateRoute from '../components/PrivateRoute.jsx';
import { ProfileCompletionGuard } from '../components/ProfileCompletionGuard.tsx';
import { withTrackedRoute } from './routeHelpers.tsx';

const ProfileCompletionPage = lazyWithRetry(() => import('../pages/ProfileCompletionPage.tsx'));
const ProfilePage = lazyWithRetry(() => import('../components/profile/ProfilePage.tsx'));
const ResultDetailPage = lazyWithRetry(() => import('../pages/ResultDetailPage.tsx'));
const AuthenticatedChrome = lazyWithRetry(() => import('./AuthenticatedChrome.tsx'));
const AdminRoleRoutes = lazyWithRetry(() => import('./AdminRoleRoutes.tsx'));
const TeacherRoleRoutes = lazyWithRetry(() => import('./TeacherRoleRoutes.tsx'));
const StudentRoleRoutes = lazyWithRetry(() => import('./StudentRoleRoutes.tsx'));

function asProtectedPage(
  children: React.ReactNode,
  featureName?: string,
  allowedRoles: string[] = []
) {
  return (
    <PrivateRoute allowedRoles={allowedRoles}>
      {withTrackedRoute(children, featureName)}
    </PrivateRoute>
  );
}

function RoleScopedRoutes() {
  const { profile } = useAuth();

  if (profile?.role === 'super_admin') {
    return <AdminRoleRoutes />;
  }

  if (profile?.role === 'teacher') {
    return <TeacherRoleRoutes />;
  }

  if (profile?.role === 'student') {
    return <StudentRoleRoutes />;
  }

  return <Navigate to="/" replace />;
}

export default function AuthenticatedRoutes() {
  const { user, profile } = useAuth();

  useDeferredIdleTask(
    () => {
      if (!user?.uid) {
        return;
      }

      void reportingService.initAuthenticated(auth, database);
    },
    {
      enabled: Boolean(user?.uid),
      timeoutMs: 1500,
    }
  );

  const routes: RouteObject[] = [
    {
      path: '/profile/complete',
      element: asProtectedPage(<ProfileCompletionPage />, 'results'),
    },
    {
      path: '/profile',
      element: asProtectedPage(
        <ProfileCompletionGuard>
          <ProfilePage />
        </ProfileCompletionGuard>,
        'profile'
      ),
    },
    {
      path: '/result/:resultId',
      element: asProtectedPage(<ResultDetailPage />, 'results', ['student', 'teacher', 'super_admin']),
    },
    {
      path: '*',
      element: (
        <PrivateRoute>
          <RoleScopedRoutes />
        </PrivateRoute>
      ),
    },
  ];

  const routedContent = useRoutes(routes);

  return (
    <AuthenticatedChrome>
      {routedContent}
    </AuthenticatedChrome>
  );
}
