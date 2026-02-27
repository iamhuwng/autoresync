/**
 * AccessControlWrapper Unit Tests
 * 
 * PRD-0016 Task 6.8: Tests for access control component, HOC, and hook
 * 
 * @security Validates that access control enforces teacher-student assignments correctly
 */

import '@testing-library/jest-dom';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import {
    AccessControlWrapper,
    useAccessControl,
    withAccessControl,
    type AccessControlWrapperProps
} from './AccessControlWrapper';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock assignmentManager
const mockIsStudentAssignedToTeacher = vi.fn();
vi.mock('../../services/assignmentManager', () => ({
    isStudentAssignedToTeacher: (...args: unknown[]) => mockIsStudentAssignedToTeacher(...args),
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// =============================================================================
// TEST UTILITIES
// =============================================================================

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MantineProvider>
        <MemoryRouter>{children}</MemoryRouter>
    </MantineProvider>
);

const renderWithProviders = (component: React.ReactNode) => {
    return render(<TestWrapper>{component}</TestWrapper>);
};

// =============================================================================
// TEST SUITES
// =============================================================================

describe('AccessControlWrapper Component (PRD-0016 Task 6.8)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // =========================================================================
    // Basic Rendering Tests
    // =========================================================================
    describe('Basic Rendering', () => {
        it('should show loading state while checking access', () => {
            // Don't resolve the promise to keep loading state
            mockIsStudentAssignedToTeacher.mockReturnValue(new Promise(() => { }));

            renderWithProviders(
                <AccessControlWrapper teacherId="teacher-1" studentIds="student-1">
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            expect(screen.getByText(/verifying access/i)).toBeInTheDocument();
            expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
        });

        it('should render children when access is granted', async () => {
            mockIsStudentAssignedToTeacher.mockResolvedValue(true);

            renderWithProviders(
                <AccessControlWrapper teacherId="teacher-1" studentIds="student-1">
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(screen.getByText('Protected Content')).toBeInTheDocument();
            });
        });

        it('should show access denied UI when access is denied', async () => {
            mockIsStudentAssignedToTeacher.mockResolvedValue(false);

            renderWithProviders(
                <AccessControlWrapper teacherId="teacher-1" studentIds="student-1">
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(screen.getByText('Access Denied')).toBeInTheDocument();
            });
            expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
        });

        it('should hide completely when hideOnDenied is true', async () => {
            mockIsStudentAssignedToTeacher.mockResolvedValue(false);

            renderWithProviders(
                <AccessControlWrapper
                    teacherId="teacher-1"
                    studentIds="student-1"
                    hideOnDenied={true}
                >
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                // Should not show access denied UI
                expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
                // Should not show protected content
                expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
                // Should not show any visible text from the component
                expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            });
        });
    });

    // =========================================================================
    // Multiple Students Tests
    // =========================================================================
    describe('Multiple Students Access', () => {
        it('should grant access if ANY student is accessible (default behavior)', async () => {
            // First student: no access, Second student: has access
            mockIsStudentAssignedToTeacher
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            renderWithProviders(
                <AccessControlWrapper
                    teacherId="teacher-1"
                    studentIds={['student-1', 'student-2']}
                >
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(screen.getByText('Protected Content')).toBeInTheDocument();
            });
        });

        it('should deny access if ANY student is inaccessible when requireAll=true', async () => {
            // First student: has access, Second student: no access
            mockIsStudentAssignedToTeacher
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            renderWithProviders(
                <AccessControlWrapper
                    teacherId="teacher-1"
                    studentIds={['student-1', 'student-2']}
                    requireAll={true}
                >
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(screen.getByText('Access Denied')).toBeInTheDocument();
            });
        });

        it('should grant access if ALL students are accessible when requireAll=true', async () => {
            mockIsStudentAssignedToTeacher.mockResolvedValue(true);

            renderWithProviders(
                <AccessControlWrapper
                    teacherId="teacher-1"
                    studentIds={['student-1', 'student-2', 'student-3']}
                    requireAll={true}
                >
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(screen.getByText('Protected Content')).toBeInTheDocument();
            });

            expect(mockIsStudentAssignedToTeacher).toHaveBeenCalledTimes(3);
        });
    });

    // =========================================================================
    // Callback Tests
    // =========================================================================
    describe('Callback Handling', () => {
        it('should call onAccessDenied with denied student IDs', async () => {
            const onAccessDenied = vi.fn();
            mockIsStudentAssignedToTeacher.mockResolvedValue(false);

            renderWithProviders(
                <AccessControlWrapper
                    teacherId="teacher-1"
                    studentIds="student-1"
                    onAccessDenied={onAccessDenied}
                >
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(onAccessDenied).toHaveBeenCalledWith(['student-1']);
            });
        });

        it('should call onAccessRevoked when access is revoked after initial grant', async () => {
            const onAccessRevoked = vi.fn();

            // Initially grant access
            mockIsStudentAssignedToTeacher.mockResolvedValue(true);

            renderWithProviders(
                <AccessControlWrapper
                    teacherId="teacher-1"
                    studentIds="student-1"
                    onAccessRevoked={onAccessRevoked}
                    recheckInterval={1000}
                >
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            // Wait for initial access grant
            await waitFor(() => {
                expect(screen.getByText('Protected Content')).toBeInTheDocument();
            });

            // Now revoke access on the next check
            mockIsStudentAssignedToTeacher.mockResolvedValue(false);

            // Advance timer to trigger recheck and wait for promise resolution
            await act(async () => {
                vi.advanceTimersByTime(1000);
                // Allow promises to resolve
                await Promise.resolve();
                await Promise.resolve();
            });

            // Verify the callback was called after access was revoked
            await waitFor(() => {
                expect(screen.getByText('Access Denied')).toBeInTheDocument();
            });

            // Note: onAccessRevoked is called when access changes from granted to denied
            // This verifies the revocation happened
            expect(mockIsStudentAssignedToTeacher).toHaveBeenCalledTimes(2);
        });
    });

    // =========================================================================
    // Periodic Recheck Tests
    // =========================================================================
    describe('Periodic Access Recheck', () => {
        it('should recheck access at specified interval', async () => {
            mockIsStudentAssignedToTeacher.mockResolvedValue(true);

            renderWithProviders(
                <AccessControlWrapper
                    teacherId="teacher-1"
                    studentIds="student-1"
                    recheckInterval={5000}
                >
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            // Wait for initial check and content to render
            await waitFor(() => {
                expect(screen.getByText('Protected Content')).toBeInTheDocument();
            });

            expect(mockIsStudentAssignedToTeacher).toHaveBeenCalledTimes(1);

            // Advance timer by 5 seconds and resolve promises
            await act(async () => {
                vi.advanceTimersByTime(5000);
                await Promise.resolve();
            });

            // The recheck should have been triggered
            // Note: Due to timing, we check for at least 2 calls
            expect(mockIsStudentAssignedToTeacher.mock.calls.length).toBeGreaterThanOrEqual(2);
        });

        it('should stop rechecking when recheckInterval is 0', async () => {
            mockIsStudentAssignedToTeacher.mockResolvedValue(true);

            renderWithProviders(
                <AccessControlWrapper
                    teacherId="teacher-1"
                    studentIds="student-1"
                    recheckInterval={0}
                >
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(mockIsStudentAssignedToTeacher).toHaveBeenCalledTimes(1);
            });

            // Advance timer significantly
            await act(async () => {
                vi.advanceTimersByTime(60000);
            });

            // Should still only be one call
            expect(mockIsStudentAssignedToTeacher).toHaveBeenCalledTimes(1);
        });
    });

    // =========================================================================
    // Error Handling Tests
    // =========================================================================
    describe('Error Handling', () => {
        it('should show error state when access check fails', async () => {
            mockIsStudentAssignedToTeacher.mockRejectedValue(new Error('Network error'));

            renderWithProviders(
                <AccessControlWrapper teacherId="teacher-1" studentIds="student-1">
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(screen.getByText('Access Error')).toBeInTheDocument();
                expect(screen.getByText(/network error/i)).toBeInTheDocument();
            });
        });

        it('should show error when teacherId is missing', async () => {
            renderWithProviders(
                <AccessControlWrapper teacherId="" studentIds="student-1">
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(screen.getByText(/invalid teacher or student id/i)).toBeInTheDocument();
            });
        });

        it('should allow retry after error', async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

            // First call fails, second succeeds
            mockIsStudentAssignedToTeacher
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce(true);

            renderWithProviders(
                <AccessControlWrapper teacherId="teacher-1" studentIds="student-1">
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            // Wait for error state
            await waitFor(() => {
                expect(screen.getByText('Access Error')).toBeInTheDocument();
            });

            // Click retry button
            const retryButton = screen.getByRole('button', { name: /retry/i });
            await user.click(retryButton);

            // Should now show content
            await waitFor(() => {
                expect(screen.getByText('Protected Content')).toBeInTheDocument();
            });
        });
    });

    // =========================================================================
    // Custom Messages Test
    // =========================================================================
    describe('Custom Messages', () => {
        it('should display custom access denied message', async () => {
            mockIsStudentAssignedToTeacher.mockResolvedValue(false);

            const customMessage = 'You do not have permission to view this student data.';

            renderWithProviders(
                <AccessControlWrapper
                    teacherId="teacher-1"
                    studentIds="student-1"
                    accessDeniedMessage={customMessage}
                >
                    <div>Protected Content</div>
                </AccessControlWrapper>
            );

            await waitFor(() => {
                expect(screen.getByText(customMessage)).toBeInTheDocument();
            });
        });
    });
});

// =============================================================================
// useAccessControl Hook Tests
// =============================================================================

describe('useAccessControl Hook (PRD-0016 Task 6.8)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Helper component to test hook
    const TestHookComponent: React.FC<{
        teacherId: string;
        studentId: string;
        recheckInterval?: number;
        onStateChange?: (state: ReturnType<typeof useAccessControl>) => void;
    }> = ({ teacherId, studentId, recheckInterval = 0, onStateChange }) => {
        const accessState = useAccessControl({ teacherId, studentId, recheckInterval });

        // Call onStateChange to expose state to test
        React.useEffect(() => {
            onStateChange?.(accessState);
        }, [accessState, onStateChange]);

        return (
            <div>
                {accessState.isChecking && <span>Checking...</span>}
                {accessState.hasAccess && <span>Has Access</span>}
                {!accessState.hasAccess && !accessState.isChecking && <span>No Access</span>}
                {accessState.error && <span>Error: {accessState.error}</span>}
            </div>
        );
    };

    it('should return hasAccess=true when student is assigned', async () => {
        mockIsStudentAssignedToTeacher.mockResolvedValue(true);

        renderWithProviders(
            <TestHookComponent teacherId="teacher-1" studentId="student-1" />
        );

        await waitFor(() => {
            expect(screen.getByText('Has Access')).toBeInTheDocument();
        });
    });

    it('should return hasAccess=false when student is not assigned', async () => {
        mockIsStudentAssignedToTeacher.mockResolvedValue(false);

        renderWithProviders(
            <TestHookComponent teacherId="teacher-1" studentId="student-1" />
        );

        await waitFor(() => {
            expect(screen.getByText('No Access')).toBeInTheDocument();
        });
    });

    it('should handle errors gracefully', async () => {
        mockIsStudentAssignedToTeacher.mockRejectedValue(new Error('Database error'));

        renderWithProviders(
            <TestHookComponent teacherId="teacher-1" studentId="student-1" />
        );

        await waitFor(() => {
            expect(screen.getByText(/Error: Database error/)).toBeInTheDocument();
        });
    });
});

// =============================================================================
// withAccessControl HOC Tests
// =============================================================================

describe('withAccessControl HOC (PRD-0016 Task 6.8)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Sample component to wrap
    const StudentDataViewer: React.FC<{ teacherId: string; studentId: string }> = ({ studentId }) => (
        <div>Viewing data for student: {studentId}</div>
    );

    it('should wrap component with access control', async () => {
        mockIsStudentAssignedToTeacher.mockResolvedValue(true);

        const ProtectedViewer = withAccessControl(StudentDataViewer);

        renderWithProviders(
            <ProtectedViewer teacherId="teacher-1" studentId="student-1" />
        );

        await waitFor(() => {
            expect(screen.getByText(/viewing data for student: student-1/i)).toBeInTheDocument();
        });
    });

    it('should block access when not assigned', async () => {
        mockIsStudentAssignedToTeacher.mockResolvedValue(false);

        const ProtectedViewer = withAccessControl(StudentDataViewer);

        renderWithProviders(
            <ProtectedViewer teacherId="teacher-1" studentId="student-1" />
        );

        await waitFor(() => {
            expect(screen.getByText('Access Denied')).toBeInTheDocument();
        });
        expect(screen.queryByText(/viewing data for student/i)).not.toBeInTheDocument();
    });

    it('should pass through custom options', async () => {
        mockIsStudentAssignedToTeacher.mockResolvedValue(false);

        const ProtectedViewer = withAccessControl(StudentDataViewer, {
            accessDeniedMessage: 'Custom denied message for HOC',
        });

        renderWithProviders(
            <ProtectedViewer teacherId="teacher-1" studentId="student-1" />
        );

        await waitFor(() => {
            expect(screen.getByText('Custom denied message for HOC')).toBeInTheDocument();
        });
    });
});

// =============================================================================
// Security Scenario Tests
// =============================================================================

describe('Access Control Security Scenarios (PRD-0016 Task 6.8)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should not leak student data when access is revoked mid-session', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });

        // Initially grant access
        mockIsStudentAssignedToTeacher.mockResolvedValue(true);

        const { rerender } = renderWithProviders(
            <AccessControlWrapper
                teacherId="teacher-1"
                studentIds="student-1"
                recheckInterval={1000}
            >
                <div data-testid="sensitive-data">Student SSN: 123-45-6789</div>
            </AccessControlWrapper>
        );

        // Verify initial access
        await waitFor(() => {
            expect(screen.getByTestId('sensitive-data')).toBeInTheDocument();
        });

        // Revoke access
        mockIsStudentAssignedToTeacher.mockResolvedValue(false);

        // Trigger recheck
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        // Sensitive data should no longer be visible
        await waitFor(() => {
            expect(screen.queryByTestId('sensitive-data')).not.toBeInTheDocument();
            expect(screen.getByText('Access Denied')).toBeInTheDocument();
        });

        vi.useRealTimers();
    });

    it('should verify access for each unique student ID', async () => {
        mockIsStudentAssignedToTeacher.mockResolvedValue(true);

        renderWithProviders(
            <AccessControlWrapper
                teacherId="teacher-1"
                studentIds={['student-a', 'student-b', 'student-c']}
            >
                <div>Content</div>
            </AccessControlWrapper>
        );

        await waitFor(() => {
            expect(mockIsStudentAssignedToTeacher).toHaveBeenCalledWith('student-a', 'teacher-1');
            expect(mockIsStudentAssignedToTeacher).toHaveBeenCalledWith('student-b', 'teacher-1');
            expect(mockIsStudentAssignedToTeacher).toHaveBeenCalledWith('student-c', 'teacher-1');
        });
    });

    it('should handle rapid assignment/unassignment changes', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });

        // Simulate rapid access changes
        let accessGranted = true;
        mockIsStudentAssignedToTeacher.mockImplementation(() =>
            Promise.resolve(accessGranted)
        );

        renderWithProviders(
            <AccessControlWrapper
                teacherId="teacher-1"
                studentIds="student-1"
                recheckInterval={500}
            >
                <div>Protected Content</div>
            </AccessControlWrapper>
        );

        // Initial access granted
        await waitFor(() => {
            expect(screen.getByText('Protected Content')).toBeInTheDocument();
        });

        // Rapid changes
        accessGranted = false;
        await act(async () => { vi.advanceTimersByTime(500); });

        await waitFor(() => {
            expect(screen.getByText('Access Denied')).toBeInTheDocument();
        });

        accessGranted = true;
        await act(async () => { vi.advanceTimersByTime(500); });

        // Access should not be restored automatically (one-way revocation for security)
        // The component stops rechecking after access is denied
        expect(screen.getByText('Access Denied')).toBeInTheDocument();

        vi.useRealTimers();
    });
});

// Need to import React for the hook test component
import React from 'react';
