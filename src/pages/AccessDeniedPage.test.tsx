/**
 * AccessDeniedPage Tests
 * 
 * Tests for the AccessDeniedPage component.
 * Part of RBAC Security Hardening (PRD-0016).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import AccessDeniedPage from './AccessDeniedPage';

// Mock the useAuth hook
const mockLogout = vi.fn();
const mockProfile = { role: 'student' };

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        profile: mockProfile,
        logout: mockLogout,
    }),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Helper to render with providers
const renderWithProviders = (locationState?: { from?: string; reason?: string }) => {
    return render(
        <MemoryRouter initialEntries={[{ pathname: '/access-denied', state: locationState }]}>
            <MantineProvider>
                <AccessDeniedPage />
            </MantineProvider>
        </MemoryRouter>
    );
};

describe('AccessDeniedPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Rendering', () => {
        it('should render the access denied title', () => {
            renderWithProviders();
            expect(screen.getByText('Access Denied')).toBeInTheDocument();
        });

        it('should render the lock icon', () => {
            renderWithProviders();
            // The ThemeIcon with lock is present
            const container = document.querySelector('svg');
            expect(container).toBeInTheDocument();
        });

        it('should render action buttons', () => {
            renderWithProviders();
            expect(screen.getByText('Go Back')).toBeInTheDocument();
            expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
            expect(screen.getByText('Log Out')).toBeInTheDocument();
        });

        it('should render the possible reasons list', () => {
            renderWithProviders();
            expect(screen.getByText('This could be because:')).toBeInTheDocument();
            expect(screen.getByText(/admin-only or teacher-only page/i)).toBeInTheDocument();
        });
    });

    describe('Reason Messages', () => {
        it('should show role-based message when reason is role', () => {
            renderWithProviders({ reason: 'role' });
            expect(screen.getByText(/account role does not have permission/i)).toBeInTheDocument();
        });

        it('should show ownership message when reason is ownership', () => {
            renderWithProviders({ reason: 'ownership' });
            expect(screen.getByText(/data that belongs to you/i)).toBeInTheDocument();
        });

        it('should show blocked message when reason is blocked', () => {
            renderWithProviders({ reason: 'blocked' });
            expect(screen.getByText(/temporarily blocked/i)).toBeInTheDocument();
        });

        it('should show session message when reason is session', () => {
            renderWithProviders({ reason: 'session' });
            expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
        });

        it('should show default message when reason is unknown', () => {
            renderWithProviders({ reason: 'unknown' });
            expect(screen.getByText(/do not have the required permissions/i)).toBeInTheDocument();
        });
    });

    describe('Navigation', () => {
        it('should navigate to dashboard when clicking "Go to Dashboard"', () => {
            renderWithProviders();
            fireEvent.click(screen.getByText('Go to Dashboard'));
            // For student role, should navigate to /student/dashboard
            expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard');
        });

        it('should call logout and navigate to home when clicking "Log Out"', async () => {
            mockLogout.mockResolvedValue(undefined);
            renderWithProviders();
            fireEvent.click(screen.getByText('Log Out'));
            expect(mockLogout).toHaveBeenCalled();
        });

        it('should navigate back when clicking "Go Back" and history exists', () => {
            // Mock window.history.length
            Object.defineProperty(window, 'history', {
                value: { length: 5 },
                writable: true,
            });
            renderWithProviders();
            fireEvent.click(screen.getByText('Go Back'));
            expect(mockNavigate).toHaveBeenCalledWith(-1);
        });
    });

    describe('Debug Info', () => {
        it('should show debug info in development mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            renderWithProviders({ from: '/admin/users', reason: 'role' });
            expect(screen.getByText(/Debug:/i)).toBeInTheDocument();
            expect(screen.getByText(/Attempted: \/admin\/users/i)).toBeInTheDocument();

            process.env.NODE_ENV = originalEnv;
        });
    });
});
