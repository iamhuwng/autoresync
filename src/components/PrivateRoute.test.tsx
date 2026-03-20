/**
 * PrivateRoute Tests
 * 
 * Tests for the PrivateRoute component with role hierarchy.
 * Part of RBAC Security Hardening (PRD-0016).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import PrivateRoute from './PrivateRoute';

// Mock data
let mockUser: { uid: string } | null = { uid: 'test-user-id' };
let mockProfile: { role: string; status?: string } | null = { role: 'student' };
let mockLoading = false;

// Mock useAuth hook
vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: mockLoading ? null : mockUser,
        profile: mockProfile,
        loading: mockLoading,
    }),
}));

// Helper component for testing
const TestComponent = () => <div data-testid="protected-content">Protected Content</div>;
const AccessDeniedComponent = () => <div data-testid="access-denied">Access Denied</div>;

// Helper to render with router
const renderWithRouter = (
    allowedRoles: string[] = [],
    initialRoute: string = '/test'
) => {
    return render(
        <MemoryRouter initialEntries={[initialRoute]}>
            <MantineProvider>
                <Routes>
                    <Route
                        path="/test"
                        element={
                            <PrivateRoute allowedRoles={allowedRoles}>
                                <TestComponent />
                            </PrivateRoute>
                        }
                    />
                    <Route path="/access-denied" element={<AccessDeniedComponent />} />
                    <Route path="/" element={<div data-testid="login">Login</div>} />
                </Routes>
            </MantineProvider>
        </MemoryRouter>
    );
};

describe('PrivateRoute', () => {
    beforeEach(() => {
        // Reset mocks to defaults
        mockUser = { uid: 'test-user-id' };
        mockProfile = { role: 'student' };
        mockLoading = false;
        vi.clearAllMocks();
    });

    describe('Loading State', () => {
        it('should show loader when auth is loading', () => {
            mockLoading = true;
            renderWithRouter();
            // Loader should be visible (Center with Loader)
            expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
        });
    });

    describe('Unauthenticated Users', () => {
        it('should redirect to login when user is not authenticated', () => {
            mockUser = null;
            mockProfile = null;
            mockLoading = false;
            renderWithRouter();
            expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
        });
    });

    describe('Role-based Access', () => {
        it('should allow student to access student-only routes', () => {
            mockProfile = { role: 'student' };
            renderWithRouter(['student']);
            expect(screen.getByTestId('protected-content')).toBeInTheDocument();
        });

        it('should allow teacher to access teacher routes', () => {
            mockProfile = { role: 'teacher' };
            renderWithRouter(['teacher']);
            expect(screen.getByTestId('protected-content')).toBeInTheDocument();
        });

        it('should allow super_admin to access admin routes', () => {
            mockProfile = { role: 'super_admin' };
            renderWithRouter(['super_admin']);
            expect(screen.getByTestId('protected-content')).toBeInTheDocument();
        });
    });

    describe('Role Hierarchy', () => {
        it('should allow super_admin to access teacher routes (hierarchy)', () => {
            mockProfile = { role: 'super_admin' };
            renderWithRouter(['teacher']);
            expect(screen.getByTestId('protected-content')).toBeInTheDocument();
        });

        it('should allow super_admin to access student routes (hierarchy)', () => {
            mockProfile = { role: 'super_admin' };
            renderWithRouter(['student']);
            expect(screen.getByTestId('protected-content')).toBeInTheDocument();
        });

        it('should allow teacher to access student routes (hierarchy)', () => {
            mockProfile = { role: 'teacher' };
            renderWithRouter(['student']);
            expect(screen.getByTestId('protected-content')).toBeInTheDocument();
        });

        it('should deny student access to teacher routes', () => {
            mockProfile = { role: 'student' };
            renderWithRouter(['teacher']);
            // Should redirect to access-denied
            expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
        });

        it('should deny student access to admin routes', () => {
            mockProfile = { role: 'student' };
            renderWithRouter(['super_admin']);
            expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
        });

        it('should deny teacher access to admin-only routes', () => {
            mockProfile = { role: 'teacher' };
            renderWithRouter(['super_admin']);
            expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
        });
    });

    describe('Blocked Users', () => {
        it('should redirect blocked users to access-denied', () => {
            mockProfile = { role: 'student', status: 'blocked' };
            renderWithRouter(['student']);
            expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
        });
    });

    describe('Routes Without Role Restriction', () => {
        it('should allow any authenticated user when no roles specified', () => {
            mockProfile = { role: 'student' };
            renderWithRouter([]);
            expect(screen.getByTestId('protected-content')).toBeInTheDocument();
        });
    });

    describe('Multiple Allowed Roles', () => {
        it('should allow access when user has one of multiple allowed roles', () => {
            mockProfile = { role: 'teacher' };
            renderWithRouter(['teacher', 'super_admin']);
            expect(screen.getByTestId('protected-content')).toBeInTheDocument();
        });
    });
});

describe('Security Scenarios', () => {
    beforeEach(() => {
        mockLoading = false;
        vi.clearAllMocks();
    });

    it('Scenario: Student tries to access /admin/users', () => {
        mockProfile = { role: 'student' };
        renderWithRouter(['super_admin']);
        expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('Scenario: Teacher tries to access /admin/users', () => {
        mockProfile = { role: 'teacher' };
        renderWithRouter(['super_admin']);
        expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('Scenario: Super admin accesses any route', () => {
        mockProfile = { role: 'super_admin' };
        // Should work for student route
        renderWithRouter(['student']);
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
});
