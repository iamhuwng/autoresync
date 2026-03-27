/**
 * useOwnershipCheck Hook Tests
 * 
 * Comprehensive tests for the useOwnershipCheck hook.
 * Part of RBAC Security Hardening (PRD-0016), Task 3.14.
 * 
 * Tests cover:
 * - Ownership validation for different resource types
 * - Loading and error states
 * - Skip option behavior
 * - Recheck functionality
 * - Denial reason mapping
 * - Convenience hooks (useResultOwnershipCheck, useStudentDataAccessCheck)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
    useOwnershipCheck,
    useResultOwnershipCheck,
    useStudentDataAccessCheck,
} from './useOwnershipCheck';
import { SecurityAuthContext, UserRole } from '../types/security.types';

// =============================================================================
// MOCKS
// =============================================================================

// Mock useSecureService
const mockUseSecureService = vi.fn();
vi.mock('./useSecureService', () => ({
    useSecureService: () => mockUseSecureService(),
}));

// Mock securityMiddleware
const mockValidateOwnership = vi.fn();
vi.mock('../services/securityMiddleware', () => ({
    validateOwnership: (...args: unknown[]) => mockValidateOwnership(...args),
}));

const mockSubscribeToAssignments = vi.fn();
vi.mock('../services/assignmentManager', () => ({
    subscribeToAssignments: (...args: unknown[]) => mockSubscribeToAssignments(...args),
}));

// =============================================================================
// TEST HELPERS
// =============================================================================

const createMockAuthContext = (
    role: UserRole,
    userId: string = 'user-123',
    options: Partial<SecurityAuthContext> = {}
): SecurityAuthContext => ({
    userId,
    userRole: role,
    activeRole: role,
    roles: [role],
    isActive: true,
    ...options,
});

const createMockSecureServiceResult = (
    authContext: SecurityAuthContext | null,
    loading: boolean = false
) => ({
    authContext,
    loading,
    error: null,
    isAuthenticated: authContext !== null,
    userRole: authContext?.userRole ?? null,
    userId: authContext?.userId ?? null,
});

// =============================================================================
// TEST SETUP
// =============================================================================

describe('useOwnershipCheck', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: validation passes
        mockValidateOwnership.mockResolvedValue({ allowed: true });
        mockSubscribeToAssignments.mockImplementation((_teacherId: string, callback: (assignments: Array<{ studentId: string; status: string }>) => void) => {
            callback([
                { studentId: 'student-123', status: 'active' },
                { studentId: 'student-456', status: 'active' },
            ]);
            return () => {};
        });
    });

    // =========================================================================
    // LOADING STATE TESTS
    // =========================================================================

    describe('Loading states', () => {
        it('should return loading=true when auth is loading', () => {
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(null, true)
            );

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123')
            );

            expect(result.current.loading).toBe(true);
            expect(result.current.allowed).toBe(false);
        });

        it('should return loading=true while validation is in progress', async () => {
            const authContext = createMockAuthContext('student', 'user-123');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );

            // Create a promise that we can control
            let resolveValidation: (value: { allowed: boolean }) => void;
            mockValidateOwnership.mockImplementation(
                () => new Promise((resolve) => { resolveValidation = resolve; })
            );

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123')
            );

            // Initially loading
            expect(result.current.loading).toBe(true);

            // Resolve validation
            resolveValidation!({ allowed: true });

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });
        });
    });

    // =========================================================================
    // SKIP OPTION TESTS
    // =========================================================================

    describe('Skip option', () => {
        it('should skip validation when skip=true', async () => {
            const authContext = createMockAuthContext('student');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123', { skip: true })
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(true);
            expect(mockValidateOwnership).not.toHaveBeenCalled();
        });

        it('should skip validation when resourceOwnerId is undefined', async () => {
            const authContext = createMockAuthContext('student');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );

            const { result } = renderHook(() =>
                useOwnershipCheck('result', undefined)
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(true);
            expect(mockValidateOwnership).not.toHaveBeenCalled();
        });

        it('should skip validation when resourceOwnerId is null', async () => {
            const authContext = createMockAuthContext('student');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );

            const { result } = renderHook(() =>
                useOwnershipCheck('result', null)
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(true);
        });
    });

    // =========================================================================
    // NO AUTH CONTEXT TESTS
    // =========================================================================

    describe('No auth context', () => {
        it('should deny when auth context is null', async () => {
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(null, false)
            );

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(false);
            expect(result.current.denialReason).toBe('session');
            expect(mockValidateOwnership).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // VALIDATION TESTS
    // =========================================================================

    describe('Validation', () => {
        it('should call validateOwnership with correct parameters', async () => {
            const authContext = createMockAuthContext('student', 'student-123');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockResolvedValue({ allowed: true });

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-456', {
                    resourceDetails: { testId: 'test-789' }
                })
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(mockValidateOwnership).toHaveBeenCalledWith(
                authContext,
                'result',
                'owner-456',
                { testId: 'test-789' }
            );
        });

        it('should return allowed=true when validation passes', async () => {
            const authContext = createMockAuthContext('student', 'owner-123');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockResolvedValue({ allowed: true });

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(true);
            expect(result.current.denialReason).toBeUndefined();
        });

        it('should return allowed=false when validation fails - ownership', async () => {
            const authContext = createMockAuthContext('student', 'user-123');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockResolvedValue({
                allowed: false,
                reason: 'ownership',
                message: 'Not the owner',
            });

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'other-owner')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(false);
            expect(result.current.denialReason).toBe('not_owner');
        });

        it('should return allowed=false when validation fails - blocked', async () => {
            const authContext = createMockAuthContext('student', 'user-123', { isActive: false });
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockResolvedValue({
                allowed: false,
                reason: 'blocked',
                message: 'User is blocked',
            });

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(false);
            expect(result.current.denialReason).toBe('blocked');
        });

        it('should return allowed=false when validation fails - session', async () => {
            const authContext = createMockAuthContext('student', 'user-123');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockResolvedValue({
                allowed: false,
                reason: 'session',
                message: 'Session expired',
            });

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(false);
            expect(result.current.denialReason).toBe('session');
        });

        it('should deny result access when normalized visibility is unresolved or mismatched', async () => {
            const authContext = createMockAuthContext('teacher', 'teacher-456', {
                assignedStudentIds: ['student-123'],
            });
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockResolvedValue({
                allowed: false,
                reason: 'ownership',
                message: 'Result visibility denied',
            });

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'student-123', {
                    resourceDetails: {
                        visibilityOwnerTeacherId: 'teacher-999',
                        ownershipResolved: false,
                        unresolvedReason: 'owner_not_resolved',
                    },
                })
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(mockValidateOwnership).toHaveBeenCalledWith(
                authContext,
                'result',
                'student-123',
                expect.objectContaining({
                    visibilityOwnerTeacherId: 'teacher-999',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                })
            );
            expect(result.current.allowed).toBe(false);
            expect(result.current.denialReason).toBe('not_owner');
        });
    });

    // =========================================================================
    // ERROR HANDLING TESTS
    // =========================================================================

    describe('Error handling', () => {
        it('should handle validation errors gracefully', async () => {
            const authContext = createMockAuthContext('student', 'user-123');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(false);
            expect(result.current.error).toBe('Network error');
            expect(result.current.denialReason).toBe('error');
        });

        it('should handle non-Error rejections', async () => {
            const authContext = createMockAuthContext('student', 'user-123');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockRejectedValue('String error');

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(false);
            expect(result.current.error).toBe('Ownership check failed');
        });
    });

    // =========================================================================
    // RECHECK FUNCTIONALITY TESTS
    // =========================================================================

    describe('Recheck functionality', () => {
        it('should re-run validation when recheck is called', async () => {
            const authContext = createMockAuthContext('student', 'user-123');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockResolvedValue({ allowed: true });

            const { result } = renderHook(() =>
                useOwnershipCheck('result', 'owner-123')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(mockValidateOwnership).toHaveBeenCalledTimes(1);

            // Call recheck
            act(() => {
                result.current.recheck();
            });

            await waitFor(() => {
                expect(mockValidateOwnership).toHaveBeenCalledTimes(2);
            });
        });
    });

    // =========================================================================
    // RESOURCE TYPE TESTS
    // =========================================================================

    describe('Different resource types', () => {
        it('should validate student_data resource type', async () => {
            const authContext = createMockAuthContext('teacher', 'teacher-123', {
                assignedStudentIds: ['student-456'],
            });
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockResolvedValue({ allowed: true });

            const { result } = renderHook(() =>
                useOwnershipCheck('student_data', 'student-456')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(mockValidateOwnership).toHaveBeenCalledWith(
                authContext,
                'student_data',
                'student-456',
                undefined
            );
            expect(result.current.allowed).toBe(true);
        });

        it('denies immediately when realtime assignment access is revoked', async () => {
            const authContext = createMockAuthContext('teacher', 'teacher-123', {
                assignedStudentIds: ['student-456'],
            });
            let emitAssignments: ((assignments: Array<{ studentId: string; status: string }>) => void) | null = null;

            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockSubscribeToAssignments.mockImplementation((_teacherId: string, callback: (assignments: Array<{ studentId: string; status: string }>) => void) => {
                emitAssignments = callback;
                callback([{ studentId: 'student-456', status: 'active' }]);
                return () => {};
            });
            mockValidateOwnership.mockResolvedValue({ allowed: true });

            const { result } = renderHook(() =>
                useOwnershipCheck('student_data', 'student-456')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.allowed).toBe(true);

            act(() => {
                emitAssignments?.([]);
            });

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
                expect(result.current.allowed).toBe(false);
            });

            expect(result.current.denialReason).toBe('not_owner');
        });

        it('revalidates when realtime assignment access is restored', async () => {
            const authContext = createMockAuthContext('teacher', 'teacher-123', {
                assignedStudentIds: ['student-456'],
            });
            let emitAssignments: ((assignments: Array<{ studentId: string; status: string }>) => void) | null = null;

            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockSubscribeToAssignments.mockImplementation((_teacherId: string, callback: (assignments: Array<{ studentId: string; status: string }>) => void) => {
                emitAssignments = callback;
                callback([]);
                return () => {};
            });
            mockValidateOwnership.mockResolvedValue({ allowed: true });

            const { result } = renderHook(() =>
                useOwnershipCheck('student_data', 'student-456')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
                expect(result.current.allowed).toBe(false);
            });

            act(() => {
                emitAssignments?.([{ studentId: 'student-456', status: 'active' }]);
            });

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
                expect(result.current.allowed).toBe(true);
            });

            expect(mockValidateOwnership).toHaveBeenCalledTimes(1);
        });

        it('should validate course resource type', async () => {
            const authContext = createMockAuthContext('teacher', 'teacher-123');
            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockValidateOwnership.mockResolvedValue({ allowed: true });

            const { result } = renderHook(() =>
                useOwnershipCheck('course', 'course-789')
            );

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(mockValidateOwnership).toHaveBeenCalledWith(
                authContext,
                'course',
                'course-789',
                undefined
            );
        });

        it('cleans up the realtime assignment subscription', async () => {
            const authContext = createMockAuthContext('teacher', 'teacher-123', {
                assignedStudentIds: ['student-456'],
            });
            const unsubscribe = vi.fn();

            mockUseSecureService.mockReturnValue(
                createMockSecureServiceResult(authContext, false)
            );
            mockSubscribeToAssignments.mockImplementation((_teacherId: string, callback: (assignments: Array<{ studentId: string; status: string }>) => void) => {
                callback([{ studentId: 'student-456', status: 'active' }]);
                return unsubscribe;
            });

            const { unmount } = renderHook(() =>
                useOwnershipCheck('student_data', 'student-456')
            );

            await waitFor(() => {
                expect(mockValidateOwnership).toHaveBeenCalled();
            });

            unmount();

            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });
    });
});

// =============================================================================
// CONVENIENCE HOOKS TESTS
// =============================================================================

describe('useResultOwnershipCheck', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockValidateOwnership.mockResolvedValue({ allowed: true });
    });

    it('should call useOwnershipCheck with "result" resource type', async () => {
        const authContext = createMockAuthContext('student', 'student-123');
        mockUseSecureService.mockReturnValue(
            createMockSecureServiceResult(authContext, false)
        );

        const { result } = renderHook(() =>
            useResultOwnershipCheck('result-owner-456')
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(mockValidateOwnership).toHaveBeenCalledWith(
            authContext,
            'result',
            'result-owner-456',
            undefined
        );
    });

    it('should handle undefined resultOwnerId', async () => {
        const authContext = createMockAuthContext('student');
        mockUseSecureService.mockReturnValue(
            createMockSecureServiceResult(authContext, false)
        );

        const { result } = renderHook(() =>
            useResultOwnershipCheck(undefined)
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Should skip validation
        expect(result.current.allowed).toBe(true);
        expect(mockValidateOwnership).not.toHaveBeenCalled();
    });
});

describe('useStudentDataAccessCheck', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockValidateOwnership.mockResolvedValue({ allowed: true });
    });

    it('should call useOwnershipCheck with "student_data" resource type', async () => {
        const authContext = createMockAuthContext('teacher', 'teacher-123');
        mockUseSecureService.mockReturnValue(
            createMockSecureServiceResult(authContext, false)
        );

        const { result } = renderHook(() =>
            useStudentDataAccessCheck('student-456')
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(mockValidateOwnership).toHaveBeenCalledWith(
            authContext,
            'student_data',
            'student-456',
            undefined
        );
    });

    it('should handle null studentId', async () => {
        const authContext = createMockAuthContext('teacher');
        mockUseSecureService.mockReturnValue(
            createMockSecureServiceResult(authContext, false)
        );

        const { result } = renderHook(() =>
            useStudentDataAccessCheck(null)
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Should skip validation
        expect(result.current.allowed).toBe(true);
        expect(mockValidateOwnership).not.toHaveBeenCalled();
    });
});
