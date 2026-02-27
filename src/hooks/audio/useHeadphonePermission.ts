/**
 * useHeadphonePermission Hook
 * 
 * Manages headphone permission requests for offline mode.
 * - Student: Request and track permission status
 * - Teacher: View pending requests and approve/deny
 * 
 * @see PRD-0018: Unified Audio Architecture - Headphone Permissions
 */

import { useState, useEffect, useCallback } from 'react';
// @ts-ignore - Firebase is a .js file
import { database } from '../../services/firebase';
// @ts-ignore - Firebase is a .js file
import { ref, onValue, update, serverTimestamp, get } from 'firebase/database';
import type { HeadphoneRequest, HeadphoneRequestStatus } from '../../types/audio.types';

// ============================================================
// TYPES
// ============================================================

export interface UseHeadphonePermissionOptions {
    /** Session code for Firebase path */
    sessionCode: string | undefined;

    /** Role determines student vs teacher behavior */
    role: 'teacher' | 'student';

    /** Student ID (required for student role) */
    studentId?: string;

    /** Whether the hook is enabled */
    enabled?: boolean;
}

/** Pending request with student info (for teacher view) */
export interface PendingHeadphoneRequest {
    studentId: string;
    studentName: string;
    requestedAt: number;
    status: HeadphoneRequestStatus;
}

export interface UseHeadphonePermissionReturn {
    // Student-specific
    /** Current permission status for this student */
    permissionStatus: HeadphoneRequestStatus | null;

    /** Whether a request is currently pending */
    isPending: boolean;

    /** Whether permission is granted */
    isApproved: boolean;

    /** Submit a headphone request (student only) */
    requestPermission: () => Promise<void>;

    // Teacher-specific
    /** List of all pending requests (teacher only) */
    pendingRequests: PendingHeadphoneRequest[];

    /** Count of pending requests */
    pendingCount: number;

    /** Approve a student's request (teacher only) */
    approveRequest: (studentId: string) => Promise<void>;

    /** Deny a student's request (teacher only) */
    denyRequest: (studentId: string) => Promise<void>;

    /** Revoke a previously approved permission (teacher only) */
    revokePermission: (studentId: string) => Promise<void>;

    /** All requests with their statuses (teacher only) */
    allRequests: PendingHeadphoneRequest[];
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

export function useHeadphonePermission({
    sessionCode,
    role,
    studentId,
    enabled = true,
}: UseHeadphonePermissionOptions): UseHeadphonePermissionReturn {
    // Student state
    const [permissionStatus, setPermissionStatus] = useState<HeadphoneRequestStatus | null>(null);

    // Teacher state
    const [allRequests, setAllRequests] = useState<PendingHeadphoneRequest[]>([]);

    // ============================================================
    // STUDENT: Listen to own permission status
    // ============================================================

    useEffect(() => {
        if (role !== 'student' || !sessionCode || !studentId || !enabled) {
            return;
        }

        const requestPath = `game_sessions/${sessionCode}/players/${studentId}/headphoneRequest`;
        const requestRef = ref(database, requestPath);

        console.log(`🎧 [HeadphonePermission] Student listening to ${requestPath}`);

        const unsubscribe = onValue(requestRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val() as HeadphoneRequest;
                setPermissionStatus(data.status);

                console.log(`🎧 [HeadphonePermission] Status updated: ${data.status}`);
            } else {
                setPermissionStatus(null);
            }
        });

        return () => unsubscribe();
    }, [sessionCode, studentId, role, enabled]);

    // ============================================================
    // STUDENT: Request permission
    // ============================================================

    const requestPermission = useCallback(async (): Promise<void> => {
        if (role !== 'student' || !sessionCode || !studentId) {
            console.warn('[HeadphonePermission] Cannot request: not a student or missing IDs');
            return;
        }

        const requestPath = `game_sessions/${sessionCode}/players/${studentId}/headphoneRequest`;
        const requestRef = ref(database, requestPath);

        const request: HeadphoneRequest = {
            requested: true,
            requestedAt: Date.now(), // Will be replaced by serverTimestamp
            status: 'pending',
        };

        try {
            await update(requestRef, {
                ...request,
                requestedAt: serverTimestamp(),
            });

            console.log('🎧 [HeadphonePermission] Request submitted');
        } catch (error) {
            console.error('[HeadphonePermission] Failed to submit request:', error);
            throw error;
        }
    }, [sessionCode, studentId, role]);

    // ============================================================
    // TEACHER: Listen to all player requests
    // ============================================================

    useEffect(() => {
        if (role !== 'teacher' || !sessionCode || !enabled) {
            return;
        }

        const playersPath = `game_sessions/${sessionCode}/players`;
        const playersRef = ref(database, playersPath);

        console.log(`🎧 [HeadphonePermission] Teacher listening to ${playersPath}`);

        const unsubscribe = onValue(playersRef, (snapshot) => {
            if (!snapshot.exists()) {
                setAllRequests([]);
                return;
            }

            const players = snapshot.val();
            const requests: PendingHeadphoneRequest[] = [];

            Object.entries(players).forEach(([playerId, playerData]: [string, any]) => {
                if (playerData.headphoneRequest?.requested) {
                    requests.push({
                        studentId: playerId,
                        studentName: playerData.name || `Student ${playerId.slice(-4)}`,
                        requestedAt: playerData.headphoneRequest.requestedAt || Date.now(),
                        status: playerData.headphoneRequest.status || 'pending',
                    });
                }
            });

            // Sort by request time (oldest first)
            requests.sort((a, b) => a.requestedAt - b.requestedAt);

            setAllRequests(requests);

            const pendingCount = requests.filter(r => r.status === 'pending').length;
            console.log(`🎧 [HeadphonePermission] Found ${requests.length} requests (${pendingCount} pending)`);
        });

        return () => unsubscribe();
    }, [sessionCode, role, enabled]);

    // ============================================================
    // TEACHER: Approve request
    // ============================================================

    const approveRequest = useCallback(async (targetStudentId: string): Promise<void> => {
        if (role !== 'teacher' || !sessionCode) {
            console.warn('[HeadphonePermission] Cannot approve: not a teacher');
            return;
        }

        const requestPath = `game_sessions/${sessionCode}/players/${targetStudentId}/headphoneRequest`;
        const requestRef = ref(database, requestPath);

        try {
            await update(requestRef, {
                status: 'approved',
                approvedAt: serverTimestamp(),
            });

            console.log(`✅ [HeadphonePermission] Approved request for ${targetStudentId}`);
        } catch (error) {
            console.error('[HeadphonePermission] Failed to approve:', error);
            throw error;
        }
    }, [sessionCode, role]);

    // ============================================================
    // TEACHER: Deny request
    // ============================================================

    const denyRequest = useCallback(async (targetStudentId: string): Promise<void> => {
        if (role !== 'teacher' || !sessionCode) {
            console.warn('[HeadphonePermission] Cannot deny: not a teacher');
            return;
        }

        const requestPath = `game_sessions/${sessionCode}/players/${targetStudentId}/headphoneRequest`;
        const requestRef = ref(database, requestPath);

        try {
            await update(requestRef, {
                status: 'denied',
                deniedAt: serverTimestamp(),
            });

            console.log(`❌ [HeadphonePermission] Denied request for ${targetStudentId}`);
        } catch (error) {
            console.error('[HeadphonePermission] Failed to deny:', error);
            throw error;
        }
    }, [sessionCode, role]);

    // ============================================================
    // TEACHER: Revoke permission
    // ============================================================

    const revokePermission = useCallback(async (targetStudentId: string): Promise<void> => {
        if (role !== 'teacher' || !sessionCode) {
            console.warn('[HeadphonePermission] Cannot revoke: not a teacher');
            return;
        }

        const requestPath = `game_sessions/${sessionCode}/players/${targetStudentId}/headphoneRequest`;
        const requestRef = ref(database, requestPath);

        try {
            await update(requestRef, {
                status: 'denied',
                deniedAt: serverTimestamp(),
            });

            console.log(`🚫 [HeadphonePermission] Revoked permission for ${targetStudentId}`);
        } catch (error) {
            console.error('[HeadphonePermission] Failed to revoke:', error);
            throw error;
        }
    }, [sessionCode, role]);

    // ============================================================
    // COMPUTED VALUES
    // ============================================================

    const isPending = permissionStatus === 'pending';
    const isApproved = permissionStatus === 'approved';
    const pendingRequests = allRequests.filter(r => r.status === 'pending');
    const pendingCount = pendingRequests.length;

    return {
        // Student
        permissionStatus,
        isPending,
        isApproved,
        requestPermission,

        // Teacher
        pendingRequests,
        pendingCount,
        approveRequest,
        denyRequest,
        revokePermission,
        allRequests,
    };
}
