/**
 * Admin Hooks - Barrel Export
 * 
 * Centralized export for all admin-related hooks.
 * This makes importing hooks cleaner and more maintainable.
 * 
 * @example
 * // Instead of multiple imports:
 * import { useUserManagement } from './hooks/admin/useUserManagement';
 * import { useAssignments } from './hooks/admin/useAssignments';
 * 
 * // Use barrel export:
 * import { useUserManagement, useAssignments } from './hooks/admin';
 */

export { useAdminModals } from './useAdminModals';
export { useAssignments } from './useAssignments';
export { useCourseTypes } from './useCourseTypes';
export { useInvitations } from './useInvitations';
export { useStudentRequests } from './useStudentRequests';
export { useUserManagement } from './useUserManagement';

// Re-export types for convenience
export type {
    UseAdminModalsReturn,
    UseAssignmentsReturn,
    UseCourseTypesReturn,
    UseInvitationsReturn,
    UseStudentRequestsReturn,
    UseUserManagementReturn
} from '../../types/admin.types';
