import React from 'react';
import { useRoutes } from 'react-router-dom';
import { lazyWithRetry } from '../utils/lazyWithRetry.ts';
import { withTrackedRoute } from './routeHelpers.tsx';

const LoginPage = lazyWithRetry(() => import('../pages/LoginPage.jsx'));
const GuestJoinPage = lazyWithRetry(() => import('../pages/GuestJoinPage.jsx'));
const GuestResultsPage = lazyWithRetry(() => import('../pages/GuestResultsPage.tsx'));
const AccessDeniedPage = lazyWithRetry(() => import('../pages/AccessDeniedPage.tsx'));
const BlockedUserPage = lazyWithRetry(() => import('../pages/BlockedUserPage.tsx'));
const TeacherInvitePage = lazyWithRetry(() => import('../pages/TeacherInvitePage.jsx'));
const AuthenticatedRoutes = lazyWithRetry(() => import('./AuthenticatedRoutes.tsx'));

export default function PublicRoutes() {
  return useRoutes([
    {
      path: '/',
      element: <LoginPage />,
    },
    {
      path: '/access-denied',
      element: <AccessDeniedPage />,
    },
    {
      path: '/blocked',
      element: <BlockedUserPage />,
    },
    {
      path: '/guest-join',
      element: <GuestJoinPage />,
    },
    {
      path: '/guest-results',
      element: withTrackedRoute(<GuestResultsPage />, 'results'),
    },
    {
      path: '/teacher-invite',
      element: <TeacherInvitePage />,
    },
    {
      path: '*',
      element: <AuthenticatedRoutes />,
    },
  ]);
}
