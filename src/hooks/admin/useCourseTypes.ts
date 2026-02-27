/**
 * useCourseTypes Hook
 * 
 * Manages course types and pending type requests for admin users.
 * Handles loading, approval, and rejection of course type requests.
 * 
 * @example
 * const courseTypes = useCourseTypes(user?.uid);
 * 
 * useEffect(() => {
 *   courseTypes.loadCourseTypes();
 *   courseTypes.loadPendingRequests();
 * }, []);
 */

import { useState, useCallback } from 'react';
import {
    getCourseTypes,
    getPendingTypeRequests,
    approveCourseType,
    rejectCourseType
} from '../../services/courseTypeService';
import type { UseCourseTypesReturn, CourseType, PendingTypeRequest } from '../../types/admin.types';

export function useCourseTypes(): UseCourseTypesReturn {
    const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
    const [pendingRequests, setPendingRequests] = useState<PendingTypeRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ============================================================================
    // LOAD COURSE TYPES
    // ============================================================================

    const loadCourseTypes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const types = await getCourseTypes();
            setCourseTypes(types);
        } catch (err) {
            console.error('Error loading course types:', err);
            setError('Failed to load course types');
        } finally {
            setLoading(false);
        }
    }, []);

    // ============================================================================
    // LOAD PENDING REQUESTS
    // ============================================================================

    const loadPendingRequests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const pending = await getPendingTypeRequests();
            setPendingRequests(pending);
        } catch (err) {
            console.error('Error loading pending type requests:', err);
            setError('Failed to load pending requests');
        } finally {
            setLoading(false);
        }
    }, []);

    // ============================================================================
    // APPROVE TYPE REQUEST
    // ============================================================================

    const approveType = useCallback(async (requestId: string) => {
        try {
            await approveCourseType(requestId);
            // Reload data after approval
            await Promise.all([loadCourseTypes(), loadPendingRequests()]);
        } catch (err) {
            console.error('Error approving course type:', err);
            setError('Failed to approve course type');
            throw err;
        }
    }, [loadCourseTypes, loadPendingRequests]);

    // ============================================================================
    // REJECT TYPE REQUEST
    // ============================================================================

    const rejectType = useCallback(async (requestId: string) => {
        try {
            await rejectCourseType(requestId);
            // Reload pending requests after rejection
            await loadPendingRequests();
        } catch (err) {
            console.error('Error rejecting course type:', err);
            setError('Failed to reject course type');
            throw err;
        }
    }, [loadPendingRequests]);

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        courseTypes,
        pendingRequests,
        loading,
        error,
        loadCourseTypes,
        loadPendingRequests,
        approveType,
        rejectType
    };
}
