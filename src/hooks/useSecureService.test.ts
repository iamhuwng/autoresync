/**
 * useSecureService Hook Tests
 * 
 * Comprehensive tests for the useSecureService hook.
 * Part of RBAC Security Hardening (PRD-0016), Task 3.13.
 * 
 * Tests cover:
 * - Auth context building from user state
 * - Assignment loading for teachers and students
 * - Active role handling (multi-role switching)
 * - Loading and error states
 * - Type guard utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSecureService, isValidAuthContext } from './useSecureService';
import { SecurityAuthContext, UserRole } from '../types/security.types';

// =============================================================================
// MOCKS
// =============================================================================

// Mock useAuth hook
const mockUseAuth = vi.fn();
vi.mock('./useAuth', () => ({
    useAuth: () => mockUseAuth(),
}));

// Mock assignment manager
const mockGetAssignmentsByTeacher = vi.fn();
const mockGetAssignmentsByStudent = vi.fn();
vi.mock('../services/assignmentManager', () => ({
    getAssignmentsByTeacher: (...args: unknown[]) => mockGetAssignmentsByTeacher(...args),
    getAssignmentsByStudent: (...args: unknown[]) => mockGetAssignmentsByStudent(...args),
}));

// =============================================================================
// TEST HELPERS
// =============================================================================

interface MockUser {
    uid: string;
}

interface MockProfile {
    role: UserRole;
    roles?: UserRole[];
    status?: 'active' | 'blocked';
}

const createMockAuthState = (
    user: MockUser | null,
    profile: MockProfile | null,
    loading = false
) => ({
    user,
    profile,
    loading,
});

// =============================================================================
// TEST SETUP
// =============================================================================

describe('useSecureService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: assignments return empty arrays
        mockGetAssignmentsByTeacher.mockResolvedValue([]);
        mockGetAssignmentsByStudent.mockResolvedValue([]);
        // Clear sessionStorage
        sessionStorage.clear();
    });

    afterEach(() => {
        sessionStorage.clear();
    });

    // =========================================================================
    // LOADING STATE TESTS
    // =========================================================================

    describe('Loading states', () => {
        it('should return loading=true when auth is loading', () => {
            mockUseAuth.mockReturnValue(createMockAuthState(null, null, true));

            const { result } = renderHook(() => useSecureService());

            expect(result.current.loading).toBe(true);
            expect(result.current.authContext).toBe(null);
        });

        it('should return loading=true while assignments are loading', async () => {
            // Create a promise that we can control
            let resolveAssignments: (value: unknown[]) => void;
            mockGetAssignmentsByTeacher.mockImplementation(
                () => new Promise((resolve) => { resolveAssignments = resolve; })
            );

            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'teacher-123' }, { role: 'teacher' })
            );

            const { result } = renderHook(() => useSecureService());

            // Initially loading because we're fetching assignments
            expect(result.current.loading).toBe(true);

            // Resolve the promise
            resolveAssignments!([]);

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });
        });
    });

    // =========================================================================
    // AUTH CONTEXT NULL TESTS
    // =========================================================================

    describe('Null auth context', () => {
        it('should return null authContext when user is null', () => {
            mockUseAuth.mockReturnValue(createMockAuthState(null, null, false));

            const { result } = renderHook(() => useSecureService());

            expect(result.current.authContext).toBe(null);
            expect(result.current.isAuthenticated).toBe(false);
        });

        it('should return null authContext when profile is null', () => {
            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'user-123' }, null, false)
            );

            const { result } = renderHook(() => useSecureService());

            expect(result.current.authContext).toBe(null);
            expect(result.current.isAuthenticated).toBe(false);
        });

        it('should return null authContext when profile has no role', () => {
            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'user-123' }, { role: undefined as unknown as UserRole }, false)
            );

            const { result } = renderHook(() => useSecureService());

            expect(result.current.authContext).toBe(null);
        });
    });

    // =========================================================================
    // AUTH CONTEXT BUILDING TESTS
    // =========================================================================

    describe('Auth context building', () => {
        it('should build correct context for student', async () => {
            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'student-123' }, { role: 'student', status: 'active' })
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.authContext).toEqual({
                userId: 'student-123',
                userRole: 'student',
                activeRole: 'student',
                roles: ['student'],
                assignedStudentIds: undefined,
                assignedTeacherIds: undefined,
                isActive: true,
            });
            expect(result.current.isAuthenticated).toBe(true);
            expect(result.current.userRole).toBe('student');
            expect(result.current.userId).toBe('student-123');
        });

        it('should build correct context for teacher', async () => {
            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'teacher-456' }, { role: 'teacher', status: 'active' })
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.authContext?.userId).toBe('teacher-456');
            expect(result.current.authContext?.userRole).toBe('teacher');
            expect(result.current.userRole).toBe('teacher');
        });

        it('should build correct context for super_admin', async () => {
            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'admin-789' }, { role: 'super_admin', status: 'active' })
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.authContext?.userRole).toBe('super_admin');
            expect(result.current.authContext?.isActive).toBe(true);
        });

        it('should mark user as inactive when status is blocked', async () => {
            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'user-123' }, { role: 'student', status: 'blocked' })
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.authContext?.isActive).toBe(false);
        });

        it('should use roles array from profile when available', async () => {
            mockUseAuth.mockReturnValue(
                createMockAuthState(
                    { uid: 'multi-role-user' },
                    { role: 'teacher', roles: ['teacher', 'super_admin'], status: 'active' }
                )
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.authContext?.roles).toEqual(['teacher', 'super_admin']);
        });
    });

    // =========================================================================
    // ASSIGNMENT LOADING TESTS
    // =========================================================================

    describe('Assignment loading', () => {
        it('should load teacher assignments for teacher role', async () => {
            mockGetAssignmentsByTeacher.mockResolvedValue([
                { studentId: 'student-1' },
                { studentId: 'student-2' },
            ]);

            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'teacher-123' }, { role: 'teacher', status: 'active' })
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(mockGetAssignmentsByTeacher).toHaveBeenCalledWith('teacher-123');
            expect(result.current.authContext?.assignedStudentIds).toEqual(['student-1', 'student-2']);
        });

        it('should load teacher assignments for super_admin role', async () => {
            mockGetAssignmentsByTeacher.mockResolvedValue([
                { studentId: 'student-1' },
            ]);

            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'admin-123' }, { role: 'super_admin', status: 'active' })
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(mockGetAssignmentsByTeacher).toHaveBeenCalledWith('admin-123');
            expect(result.current.authContext?.assignedStudentIds).toEqual(['student-1']);
        });

        it('should load student assignments for student role', async () => {
            mockGetAssignmentsByStudent.mockResolvedValue([
                { teacherId: 'teacher-1' },
                { teacherId: 'teacher-2' },
            ]);

            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'student-123' }, { role: 'student', status: 'active' })
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(mockGetAssignmentsByStudent).toHaveBeenCalledWith('student-123');
            expect(result.current.authContext?.assignedTeacherIds).toEqual(['teacher-1', 'teacher-2']);
        });

        it('should handle assignment loading errors gracefully', async () => {
            mockGetAssignmentsByTeacher.mockRejectedValue(new Error('Network error'));

            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'teacher-123' }, { role: 'teacher', status: 'active' })
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.error).toBe('Failed to load user assignments');
            // Context should still be built
            expect(result.current.authContext).not.toBe(null);
        });

        it('should not load assignments when user is null', () => {
            mockUseAuth.mockReturnValue(createMockAuthState(null, null, false));

            renderHook(() => useSecureService());

            expect(mockGetAssignmentsByTeacher).not.toHaveBeenCalled();
            expect(mockGetAssignmentsByStudent).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // ACTIVE ROLE TESTS
    // =========================================================================

    describe('Active role handling', () => {
        it('should use profile role as activeRole by default', async () => {
            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'user-123' }, { role: 'teacher', status: 'active' })
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.authContext?.activeRole).toBe('teacher');
        });

        it('should use sessionStorage activeRole when set', async () => {
            sessionStorage.setItem('activeRole', 'super_admin');

            mockUseAuth.mockReturnValue(
                createMockAuthState(
                    { uid: 'user-123' },
                    { role: 'teacher', roles: ['teacher', 'super_admin'], status: 'active' }
                )
            );

            const { result } = renderHook(() => useSecureService());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.authContext?.activeRole).toBe('super_admin');
            expect(result.current.authContext?.userRole).toBe('teacher');
        });
    });

    // =========================================================================
    // USER STATE CHANGE TESTS
    // =========================================================================

    describe('User state changes', () => {
        it('should clear assignments when user logs out', async () => {
            mockGetAssignmentsByTeacher.mockResolvedValue([{ studentId: 'student-1' }]);

            const { result, rerender } = renderHook(() => useSecureService());

            // Start with a teacher
            mockUseAuth.mockReturnValue(
                createMockAuthState({ uid: 'teacher-123' }, { role: 'teacher', status: 'active' })
            );
            rerender();

            await waitFor(() => {
                expect(result.current.authContext?.assignedStudentIds).toEqual(['student-1']);
            });

            // User logs out
            mockUseAuth.mockReturnValue(createMockAuthState(null, null, false));
            rerender();

            expect(result.current.authContext).toBe(null);
        });
    });
});

// =============================================================================
// isValidAuthContext TYPE GUARD TESTS
// =============================================================================

describe('isValidAuthContext', () => {
    it('should return false for null', () => {
        expect(isValidAuthContext(null)).toBe(false);
    });

    it('should return false for context without userId', () => {
        const ctx = {
            userId: '',
            userRole: 'student' as UserRole,
            activeRole: 'student' as UserRole,
            roles: ['student' as UserRole],
            isActive: true,
        } as SecurityAuthContext;

        expect(isValidAuthContext({ ...ctx, userId: '' })).toBe(false);
    });

    it('should return false for context without userRole', () => {
        const ctx = {
            userId: 'user-123',
            userRole: '' as UserRole,
            activeRole: 'student' as UserRole,
            roles: ['student' as UserRole],
            isActive: true,
        } as SecurityAuthContext;

        expect(isValidAuthContext({ ...ctx, userRole: '' as UserRole })).toBe(false);
    });

    it('should return true for valid context', () => {
        const ctx: SecurityAuthContext = {
            userId: 'user-123',
            userRole: 'student',
            activeRole: 'student',
            roles: ['student'],
            isActive: true,
        };

        expect(isValidAuthContext(ctx)).toBe(true);
    });
});
