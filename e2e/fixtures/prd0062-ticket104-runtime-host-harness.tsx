import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import AuthContext from '../../src/contexts/AuthContext';
import { auth } from '../../src/services/firebase';
import { studentRoutes } from '../../src/routes/studentRoutes';

/**
 * Browser-only host for #104 acceptance.
 *
 * The route table and StudentPracticePage are production modules. The only
 * seam here is authentication: the worker and Firebase boundaries are mocked
 * by the Playwright test, while the browser auth client receives a stable
 * user/token so the real launch resolver can make its request.
 */
const user = {
  uid: 'student-1',
  email: 'student-1@example.test',
  displayName: 'PRD0062 #104 Student',
  getIdToken: async () => 'prd0062-ticket104-token',
};

const authValue = {
  user,
  profile: { uid: user.uid, role: 'student', status: 'active' },
  loading: false,
  error: null,
  login: async () => undefined,
  loginWithEmail: async () => undefined,
  registerWithEmail: async () => undefined,
  logout: async () => undefined,
  isBlocked: false,
  forceLogoutReason: null,
  activeRole: 'student',
  availableRoles: ['student'],
  hasMultipleRoles: false,
  switchRole: async () => undefined,
  getEffectiveRole: () => 'student',
  primaryRole: 'student',
  isAdmin: false,
  isTeacher: false,
  isStudent: true,
  isActive: true,
};

const StudentRouteTable = () => useRoutes(studentRoutes);

const Harness = () => {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void auth.authStateReady()
      .catch(() => undefined)
      .then(() => {
        // Browser clients intentionally read Firebase Auth's currentUser for
        // the bearer token. This is a test-only user; no auth endpoint is
        // contacted and no production auth state is persisted.
        (auth as unknown as { currentUser: typeof user }).currentUser = user;
        if (mounted) setAuthReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!authReady) {
    return <div role="status" aria-live="polite">Preparing #104 browser harness.</div>;
  }

  return (
    <AuthContext.Provider value={authValue}>
      <StudentRouteTable />
    </AuthContext.Provider>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing PRD0062 #104 fixture root.');

createRoot(root).render(
  <BrowserRouter>
    <Harness />
  </BrowserRouter>,
);
