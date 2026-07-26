import { useRoutes } from 'react-router-dom';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { withTrackedRoute } from './routeHelpers';

const LoginPage = lazyWithRetry(() => import('../pages/LoginPage.jsx'));
const GuestJoinPage = lazyWithRetry(() => import('../pages/GuestJoinPage.jsx'));
const GuestResultsPage = lazyWithRetry(() => import('../pages/GuestResultsPage'));
const AccessDeniedPage = lazyWithRetry(() => import('../pages/AccessDeniedPage'));
const BlockedUserPage = lazyWithRetry(() => import('../pages/BlockedUserPage'));
const TeacherInvitePage = lazyWithRetry(() => import('../pages/TeacherInvitePage.jsx'));
const AuthenticatedRoutes = lazyWithRetry(() => import('./AuthenticatedRoutes'));
const BookEditorSmokePage = lazyWithRetry(() => import('../pages/BookEditorSmokePage'));
const BookPdfViewerSmokePage = lazyWithRetry(() => import('../pages/BookPdfViewerSmokePage'));
const ReadingV2StudioSmokePage = lazyWithRetry(() => import('../pages/ReadingV2StudioSmokePage'));
const ReadingV2VerticalLoopSmokePage = lazyWithRetry(() => import('../pages/ReadingV2VerticalLoopSmokePage'));

export default function PublicRoutes() {
  const routes = [
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
  ];

  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    routes.splice(routes.length - 1, 0, {
      path: '/__smoke/book-editor',
      element: withTrackedRoute(<BookEditorSmokePage />, 'testCreation'),
    }, {
      path: '/__smoke/book-viewer',
      element: withTrackedRoute(<BookPdfViewerSmokePage />, 'testCreation'),
    }, {
      path: '/__smoke/reading-v2-studio',
      element: withTrackedRoute(<ReadingV2StudioSmokePage />, 'readingV2Studio'),
    }, {
      path: '/__smoke/reading-v2-vertical-loop',
      element: withTrackedRoute(<ReadingV2VerticalLoopSmokePage />, 'testTaking'),
    });
  }

  return useRoutes(routes);
}
