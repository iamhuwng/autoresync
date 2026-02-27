/**
 * useOwnershipCheck Hook
 * 
 * Hook for component-level ownership validation.
 * Part of RBAC Security Hardening (PRD-0016).
 * 
 * Use this hook to verify a user can access a specific resource
 * before rendering sensitive data.
 * 
 * @security Critical for protecting user data at the component level
 */

import { useState, useEffect, useCallback } from 'react';
import { useSecureService } from './useSecureService';
import { validateOwnership, ValidationResult } from '../services/securityMiddleware';
import { OwnershipResourceType } from '../types/security.types';

/**
 * Result of the ownership check
 */
export interface OwnershipCheckResult {
    /** Whether access is allowed */
    allowed: boolean;
    /** Whether the check is still loading */
    loading: boolean;
    /** Error message if check failed */
    error: string | null;
    /** Reason for denial (for logging/debugging) */
    denialReason?: 'not_owner' | 'no_assignment' | 'blocked' | 'session' | 'error';
    /** Re-run the ownership check */
    recheck: () => void;
}

/**
 * Hook to verify ownership of a resource before rendering.
 * 
 * This hook performs async validation and returns the result.
 * It checks:
 * 1. If user is authenticated
 * 2. If user is blocked
 * 3. If user owns the resource OR has assignment
 * 
 * @param resourceType - Type of resource ('result', 'student_data', etc.)
 * @param resourceOwnerId - The owner ID to check against (e.g., studentId for results)
 * @param options - Additional options for the check
 * 
 * @example
 * ```tsx
 * // In ResultDetailPage.tsx
 * const { resultId } = useParams();
 * const { allowed, loading, error } = useOwnershipCheck('result', resultOwnerId);
 * 
 * if (loading) return <Loader />;
 * if (!allowed) return <Navigate to="/access-denied" state={{ reason: 'ownership' }} />;
 * 
 * // Render result...
 * ```
 */
export const useOwnershipCheck = (
    resourceType: OwnershipResourceType,
    resourceOwnerId: string | undefined | null,
    options?: {
        /** Skip the check (useful when owner ID isn't known yet) */
        skip?: boolean;
        /** Additional resource details for complex checks */
        resourceDetails?: Record<string, unknown>;
    }
): OwnershipCheckResult => {
    const { authContext, loading: authLoading } = useSecureService();
    const [checkResult, setCheckResult] = useState<ValidationResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [checkId, setCheckId] = useState(0);

    // Function to perform the check
    const performCheck = useCallback(async () => {
        // Skip if explicitly requested or no owner ID yet
        if (options?.skip || !resourceOwnerId) {
            setLoading(false);
            setCheckResult({ allowed: true }); // Allow if skipping
            return;
        }

        // Wait for auth context
        if (authLoading) {
            return;
        }

        // No auth context = not authenticated
        if (!authContext) {
            setCheckResult({
                allowed: false,
                reason: 'session',
                message: 'Authentication required',
            });
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await validateOwnership(
                authContext,
                resourceType,
                resourceOwnerId,
                options?.resourceDetails
            );
            setCheckResult(result);
        } catch (err) {
            console.error('[useOwnershipCheck] Validation failed:', err);
            setError(err instanceof Error ? err.message : 'Ownership check failed');
            setCheckResult({
                allowed: false,
                reason: 'unknown',
                message: 'Failed to verify access',
            });
        } finally {
            setLoading(false);
        }
    }, [authContext, authLoading, resourceType, resourceOwnerId, options?.skip, options?.resourceDetails, checkId]);

    // Run the check when dependencies change
    useEffect(() => {
        performCheck();
    }, [performCheck]);

    // Function to manually recheck
    const recheck = useCallback(() => {
        setCheckId(prev => prev + 1);
    }, []);

    // Map validation reason to denial reason
    const getDenialReason = (): OwnershipCheckResult['denialReason'] => {
        if (!checkResult || checkResult.allowed) return undefined;

        switch (checkResult.reason) {
            case 'ownership':
                return 'not_owner';
            case 'blocked':
                return 'blocked';
            case 'session':
                return 'session';
            default:
                return 'error';
        }
    };

    return {
        allowed: checkResult?.allowed ?? false,
        loading: loading || authLoading,
        error,
        denialReason: getDenialReason(),
        recheck,
    };
};

/**
 * Hook variant for checking result ownership.
 * Specifically for ResultDetailPage.
 */
export const useResultOwnershipCheck = (
    resultOwnerId: string | undefined | null
): OwnershipCheckResult => {
    return useOwnershipCheck('result', resultOwnerId);
};

/**
 * Hook variant for checking student data access.
 * For TeacherStudentHistoryPage.
 */
export const useStudentDataAccessCheck = (
    studentId: string | undefined | null
): OwnershipCheckResult => {
    return useOwnershipCheck('student_data', studentId);
};

export default useOwnershipCheck;
