/**
 * useAdminModals Hook
 * 
 * Centralizes all modal state management for the Admin User Management page.
 * This hook consolidates 10+ useState calls into a single, manageable state object.
 * 
 * @example
 * const modals = useAdminModals();
 * 
 * // Open edit modal
 * modals.openEditModal(user);
 * 
 * // Check if modal is open
 * if (modals.modals.isEditModalOpen) { ... }
 */

import { useState, useCallback } from 'react';
import type {
    ModalState,
    EditUserForm,
    AssignmentMode,
    UseAdminModalsReturn
} from '../../types/admin.types';
import type { UserProfile } from '../../types/user.types';

const DEFAULT_EDIT_FORM: EditUserForm = {
    displayName: '',
    studentGroup: '',
    status: 'active'
};

const DEFAULT_MODAL_STATE: ModalState = {
    // Edit Modal
    isEditModalOpen: false,
    editingUser: null,
    editForm: DEFAULT_EDIT_FORM,

    // Assignment Modal
    isAssignmentModalOpen: false,
    assignmentMode: 'assign-to-teacher',
    selectedUserForAssignment: null,

    // Release Student Modal
    isReleaseModalOpen: false,
    studentToRelease: null,
    releaseLoading: false,

    // Request Student Modal
    isRequestModalOpen: false,

    // Add to Class Modal
    isAddToClassModalOpen: false,
    selectedStudentForClass: null
};

export function useAdminModals(): UseAdminModalsReturn {
    const [modals, setModals] = useState<ModalState>(DEFAULT_MODAL_STATE);

    // ============================================================================
    // EDIT MODAL ACTIONS
    // ============================================================================

    const openEditModal = useCallback((user: UserProfile) => {
        setModals(prev => ({
            ...prev,
            isEditModalOpen: true,
            editingUser: user,
            editForm: {
                displayName: user.displayName || '',
                studentGroup: user.studentGroup || '',
                status: user.status || 'active'
            }
        }));
    }, []);

    const closeEditModal = useCallback(() => {
        setModals(prev => ({
            ...prev,
            isEditModalOpen: false,
            editingUser: null,
            editForm: DEFAULT_EDIT_FORM
        }));
    }, []);

    const updateEditForm = useCallback((updates: Partial<EditUserForm>) => {
        setModals(prev => ({
            ...prev,
            editForm: {
                ...prev.editForm,
                ...updates
            }
        }));
    }, []);

    // ============================================================================
    // ASSIGNMENT MODAL ACTIONS
    // ============================================================================

    const openAssignmentModal = useCallback((user: UserProfile, mode: AssignmentMode) => {
        setModals(prev => ({
            ...prev,
            isAssignmentModalOpen: true,
            assignmentMode: mode,
            selectedUserForAssignment: user
        }));
    }, []);

    const closeAssignmentModal = useCallback(() => {
        setModals(prev => ({
            ...prev,
            isAssignmentModalOpen: false,
            selectedUserForAssignment: null
        }));
    }, []);

    // ============================================================================
    // RELEASE MODAL ACTIONS
    // ============================================================================

    const openReleaseModal = useCallback((student: UserProfile) => {
        setModals(prev => ({
            ...prev,
            isReleaseModalOpen: true,
            studentToRelease: student,
            releaseLoading: false
        }));
    }, []);

    const closeReleaseModal = useCallback(() => {
        setModals(prev => ({
            ...prev,
            isReleaseModalOpen: false,
            studentToRelease: null,
            releaseLoading: false
        }));
    }, []);

    const setReleaseLoading = useCallback((loading: boolean) => {
        setModals(prev => ({
            ...prev,
            releaseLoading: loading
        }));
    }, []);

    // ============================================================================
    // REQUEST MODAL ACTIONS
    // ============================================================================

    const openRequestModal = useCallback(() => {
        setModals(prev => ({
            ...prev,
            isRequestModalOpen: true
        }));
    }, []);

    const closeRequestModal = useCallback(() => {
        setModals(prev => ({
            ...prev,
            isRequestModalOpen: false
        }));
    }, []);

    // ============================================================================
    // ADD TO CLASS MODAL ACTIONS
    // ============================================================================

    const openAddToClassModal = useCallback((student: UserProfile) => {
        setModals(prev => ({
            ...prev,
            isAddToClassModalOpen: true,
            selectedStudentForClass: student
        }));
    }, []);

    const closeAddToClassModal = useCallback(() => {
        setModals(prev => ({
            ...prev,
            isAddToClassModalOpen: false,
            selectedStudentForClass: null
        }));
    }, []);

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        modals,

        // Edit Modal
        openEditModal,
        closeEditModal,
        updateEditForm,

        // Assignment Modal
        openAssignmentModal,
        closeAssignmentModal,

        // Release Modal
        openReleaseModal,
        closeReleaseModal,
        setReleaseLoading,

        // Request Modal
        openRequestModal,
        closeRequestModal,

        // Add to Class Modal
        openAddToClassModal,
        closeAddToClassModal
    };
}
