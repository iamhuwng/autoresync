import React from 'react';
import type { RouteObject } from 'react-router-dom';
import { lazyWithRetry } from '../utils/lazyWithRetry.ts';
import PrivateRoute from '../components/PrivateRoute.jsx';
import { withTrackedRoute } from './routeHelpers.tsx';

const AdminMigrationPage = lazyWithRetry(() => import('../pages/AdminMigrationPage.tsx'));
const AdminDashboardPage = lazyWithRetry(() => import('../pages/AdminDashboardPage.tsx'));
const AdminMaterialsPage = lazyWithRetry(() => import('../pages/AdminMaterialsPage.tsx'));
const AdminSessionsPage = lazyWithRetry(() => import('../pages/AdminSessionsPage.tsx'));
const AdminCoursesPage = lazyWithRetry(() => import('../pages/AdminCoursesPage.tsx'));
const AdminClassesPage = lazyWithRetry(() => import('../pages/AdminClassesPage.tsx'));
const AdminSettingsPage = lazyWithRetry(() => import('../pages/AdminSettingsPage.tsx'));
const AdminBackupPage = lazyWithRetry(() => import('../pages/AdminBackupPage.tsx'));
const AdminReportsPage = lazyWithRetry(() => import('../pages/AdminReportsPage.tsx'));
const AdminUserManagementPage = lazyWithRetry(() => import('../pages/AdminUserManagementPage.jsx'));

function asAdminPage(children: React.ReactNode, featureName?: string) {
  return (
    <PrivateRoute allowedRoles={['super_admin']}>
      {withTrackedRoute(children, featureName)}
    </PrivateRoute>
  );
}

export const adminRoutes: RouteObject[] = [
  {
    path: '/admin/dashboard',
    element: asAdminPage(<AdminDashboardPage />),
  },
  {
    path: '/admin/materials',
    element: asAdminPage(<AdminMaterialsPage />),
  },
  {
    path: '/admin/sessions',
    element: asAdminPage(<AdminSessionsPage />),
  },
  {
    path: '/admin/users',
    element: asAdminPage(<AdminUserManagementPage />),
  },
  {
    path: '/admin/migration',
    element: asAdminPage(<AdminMigrationPage />),
  },
  {
    path: '/admin/courses',
    element: asAdminPage(<AdminCoursesPage />),
  },
  {
    path: '/admin/classes',
    element: asAdminPage(<AdminClassesPage />),
  },
  {
    path: '/admin/settings',
    element: asAdminPage(<AdminSettingsPage />),
  },
  {
    path: '/admin/backup',
    element: asAdminPage(<AdminBackupPage />),
  },
  {
    path: '/admin/reports',
    element: asAdminPage(<AdminReportsPage />),
  },
];
