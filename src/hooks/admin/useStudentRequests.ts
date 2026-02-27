/**
 * useStudentRequests Hook
 * 
 * Manages student assignment requests for admin users.
 * Teachers can request students, and admins can approve or deny those requests.
 * 
 * @example
 * const requests = useStudentRequests();
 * 
 * useEffect(() => {
 *   requests.loadRequests();
 * }, []);
 * 
 * const handleApprove = async (requestId: string) => {
 *   await requests.approveRequest(requestId, adminUserId);
 * };
 */

import { useState, useCallback } from 'react';
import {
    getAllAssignmentRequests,
    approveStudentRequest,
    denyStudentRequest,
    createStudentRequest
} from '../../services/assignmentManager';
import type { UseStudentRequestsReturn, AssignmentRequest } from '../../types/admin.types';

export function useStudentRequests(): UseStudentRequestsReturn {
    const [requests, setRequests] = useState<AssignmentRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ============================================================================
    // LOAD REQUESTS
    // ============================================================================

    const loadRequests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const allRequests = await getAllAssignmentRequests();
            setRequests(allRequests);
        } catch (err) {
            console.error('Error loading student requests:', err);
            setError('Failed to load student requests');
        } finally {
            setLoading(false);
        }
    }, []);

    // ============================================================================
    // APPROVE REQUEST
    // ============================================================================

    const approveRequest = useCallback(async (requestId: string, approvedBy: string): Promise<void> => {
        try {
            const result = await approveStudentRequest(requestId, approvedBy);

            if (!result.success) {
                throw new Error(result.error || 'Failed to approve request');
            }

            // Reload requests after approval
            await loadRequests();
        } catch (err) {
            console.error('Error approving student request:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to approve request';
            setError(errorMessage);
            throw err;
        }
    }, [loadRequests]);

    // ============================================================================
    // DENY REQUEST
    // ============================================================================

    const denyRequest = useCallback(async (requestId: string, deniedBy: string): Promise<void> => {
        try {
            const result = await denyStudentRequest(requestId, deniedBy);

            if (!result.success) {
                throw new Error(result.error || 'Failed to deny request');
            }

            // Reload requests after denial
            await loadRequests();
        } catch (err) {
            console.error('Error denying student request:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to deny request';
            setError(errorMessage);
            throw err;
        }
    }, [loadRequests]);

    // ============================================================================
    // CREATE REQUEST
    // ============================================================================

    const createRequest = useCallback(async (teacherId: string, studentEmail: string): Promise<void> => {
        try {
            const result = await createStudentRequest(teacherId, studentEmail);

            if (!result.success) {
                throw new Error(result.error || 'Failed to create request');
            }

            // Reload requests after creation
            await loadRequests();
        } catch (err) {
            console.error('Error creating student request:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to create request';
            setError(errorMessage);
            throw err;
        }
    }, [loadRequests]);

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        requests,
        loading,
        error,
        loadRequests,
        approveRequest,
        denyRequest,
        createRequest
    };
}
