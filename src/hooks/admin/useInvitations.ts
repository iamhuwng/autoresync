/**
 * useInvitations Hook
 * 
 * Manages teacher invitations for admin users.
 * Handles loading, generating, and revoking teacher invitations.
 * 
 * @param adminUserId - The UID of the admin user managing invitations
 * 
 * @example
 * const invitations = useInvitations(user?.uid);
 * 
 * useEffect(() => {
 *   invitations.loadInvitations();
 * }, []);
 * 
 * const handleInvite = async () => {
 *   const result = await invitations.generateInvite('teacher@example.com');
 *   if (result.success) {
 *     console.log('Invite code:', result.inviteCode);
 *   }
 * };
 */

import { useState, useCallback } from 'react';
import {
    getInvitationsByAdmin,
    generateTeacherInvite,
    revokeInvitation
} from '../../services/invitationService';
import type { UseInvitationsReturn, TeacherInvitation } from '../../types/admin.types';

export function useInvitations(adminUserId: string | null | undefined): UseInvitationsReturn {
    const [invitations, setInvitations] = useState<TeacherInvitation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ============================================================================
    // LOAD INVITATIONS
    // ============================================================================

    const loadInvitations = useCallback(async () => {
        if (!adminUserId) {
            setError('Admin user ID is required');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const invites = await getInvitationsByAdmin(adminUserId);
            setInvitations(invites);
        } catch (err) {
            console.error('Error loading invitations:', err);
            setError('Failed to load invitations');
        } finally {
            setLoading(false);
        }
    }, [adminUserId]);

    // ============================================================================
    // GENERATE INVITE
    // ============================================================================

    const generateInvite = useCallback(async (email: string): Promise<{
        success: boolean;
        inviteCode?: string;
        error?: string;
    }> => {
        if (!adminUserId) {
            return {
                success: false,
                error: 'Admin user ID is required'
            };
        }

        try {
            const result = await generateTeacherInvite(email, adminUserId);

            if (result.success) {
                // Reload invitations after generating
                await loadInvitations();
            }

            return result;
        } catch (err) {
            console.error('Error generating invite:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to generate invite';
            setError(errorMessage);
            return {
                success: false,
                error: errorMessage
            };
        }
    }, [adminUserId, loadInvitations]);

    // ============================================================================
    // REVOKE INVITE
    // ============================================================================

    const revokeInvite = useCallback(async (inviteId: string): Promise<void> => {
        try {
            await revokeInvitation(inviteId);
            // Reload invitations after revoking
            await loadInvitations();
        } catch (err) {
            console.error('Error revoking invite:', err);
            setError('Failed to revoke invitation');
            throw err;
        }
    }, [loadInvitations]);

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        invitations,
        loading,
        error,
        loadInvitations,
        generateInvite,
        revokeInvite
    };
}
