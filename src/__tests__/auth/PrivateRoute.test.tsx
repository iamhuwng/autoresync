import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import PrivateRoute from '../../components/PrivateRoute';
import * as useAuthModule from '../../hooks/useAuth';

// Mock the useAuth hook
vi.mock('../../hooks/useAuth');

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      <BrowserRouter>{component}</BrowserRouter>
    </MantineProvider>
  );
};

describe('PrivateRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loader when loading', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: null,
      profile: null,
      loading: true,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
      isTeacher: false
    });

    renderWithRouter(
      <PrivateRoute>
        <div>Protected Content</div>
      </PrivateRoute>
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should redirect to / when user is not authenticated', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
      isTeacher: false
    });

    renderWithRouter(
      <PrivateRoute>
        <div>Protected Content</div>
      </PrivateRoute>
    );

    // Should not render protected content
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should redirect when user has wrong role', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { uid: 'test-uid', email: 'student@test.com' } as any,
      profile: {
        uid: 'test-uid',
        email: 'student@test.com',
        displayName: 'Test Student',
        photoURL: null,
        role: 'student',
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        status: 'active'
      },
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
      isTeacher: false
    });

    renderWithRouter(
      <PrivateRoute allowedRoles={['teacher', 'super_admin']}>
        <div>Teacher Only Content</div>
      </PrivateRoute>
    );

    // Should not render protected content
    expect(screen.queryByText('Teacher Only Content')).not.toBeInTheDocument();
  });

  it('should render children when user has correct role', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { uid: 'teacher-uid', email: 'teacher@test.com' } as any,
      profile: {
        uid: 'teacher-uid',
        email: 'teacher@test.com',
        displayName: 'Test Teacher',
        photoURL: null,
        role: 'teacher',
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        status: 'active'
      },
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
      isTeacher: true
    });

    renderWithRouter(
      <PrivateRoute allowedRoles={['teacher', 'super_admin']}>
        <div>Teacher Only Content</div>
      </PrivateRoute>
    );

    // Should render protected content
    expect(screen.getByText('Teacher Only Content')).toBeInTheDocument();
  });

  it('should render children when no roles specified and user is authenticated', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { uid: 'test-uid', email: 'test@test.com' } as any,
      profile: {
        uid: 'test-uid',
        email: 'test@test.com',
        displayName: 'Test User',
        photoURL: null,
        role: 'student',
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        status: 'active'
      },
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
      isTeacher: false
    });

    renderWithRouter(
      <PrivateRoute>
        <div>Any Authenticated User Content</div>
      </PrivateRoute>
    );

    // Should render content for any authenticated user
    expect(screen.getByText('Any Authenticated User Content')).toBeInTheDocument();
  });

  it('should redirect when user is authenticated but profile does not exist', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { uid: 'test-uid', email: 'test@test.com' } as any,
      profile: null,
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
      isTeacher: false
    });

    renderWithRouter(
      <PrivateRoute allowedRoles={['teacher']}>
        <div>Protected Content</div>
      </PrivateRoute>
    );

    // Should not render protected content when profile is missing
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should allow super_admin to access teacher routes', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { uid: 'admin-uid', email: 'admin@test.com' } as any,
      profile: {
        uid: 'admin-uid',
        email: 'admin@test.com',
        displayName: 'Super Admin',
        photoURL: null,
        role: 'super_admin',
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        status: 'active'
      },
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAdmin: true,
      isTeacher: false
    });

    renderWithRouter(
      <PrivateRoute allowedRoles={['teacher', 'super_admin']}>
        <div>Teacher Content</div>
      </PrivateRoute>
    );

    // Super admin should access teacher routes
    expect(screen.getByText('Teacher Content')).toBeInTheDocument();
  });

  it('should only allow super_admin to access admin routes', () => {
    // Test with teacher trying to access admin route
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { uid: 'teacher-uid', email: 'teacher@test.com' } as any,
      profile: {
        uid: 'teacher-uid',
        email: 'teacher@test.com',
        displayName: 'Test Teacher',
        photoURL: null,
        role: 'teacher',
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        status: 'active'
      },
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
      isTeacher: true
    });

    renderWithRouter(
      <PrivateRoute allowedRoles={['super_admin']}>
        <div>Admin Only Content</div>
      </PrivateRoute>
    );

    // Teacher should not access admin routes
    expect(screen.queryByText('Admin Only Content')).not.toBeInTheDocument();
  });
});
