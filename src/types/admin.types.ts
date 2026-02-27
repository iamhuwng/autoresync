/**
 * TypeScript Types for Admin User Management
 * 
 * This file contains all type definitions for the admin user management feature,
 * including state types, modal types, and filter types.
 */

import type { UserProfile } from '../services/userService';
import type { StudentTeacherAssignment, AssignmentRequest } from './assignment.types';

// Re-export imported types for convenience
export type { StudentTeacherAssignment, AssignmentRequest } from './assignment.types';
export type { UserProfile } from '../services/userService';


// ============================================================================
// FILTER & SEARCH TYPES
// ============================================================================

export type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

export type UserRole = 'student' | 'teacher' | 'super_admin';

export interface UserFilters {
    searchTerm: string;
    assignmentFilter: AssignmentFilter;
    filterByTeacherId: string | null;
}

// ============================================================================
// TAB TYPES
// ============================================================================

export type AdminTab = 'students' | 'teachers' | 'invites' | 'requests' | 'course-types';

// ============================================================================
// MODAL TYPES
// ============================================================================

export interface EditUserForm {
    displayName: string;
    studentGroup: string;
    status: 'active' | 'inactive';
}

export type AssignmentMode = 'assign-to-teacher' | 'assign-students';

export interface ModalState {
    // Edit Modal
    isEditModalOpen: boolean;
    editingUser: UserProfile | null;
    editForm: EditUserForm;

    // Assignment Modal
    isAssignmentModalOpen: boolean;
    assignmentMode: AssignmentMode;
    selectedUserForAssignment: UserProfile | null;

    // Release Student Modal
    isReleaseModalOpen: boolean;
    studentToRelease: UserProfile | null;
    releaseLoading: boolean;

    // Request Student Modal
    isRequestModalOpen: boolean;

    // Add to Class Modal
    isAddToClassModalOpen: boolean;
    selectedStudentForClass: UserProfile | null;
}

// ============================================================================
// COURSE TYPE TYPES
// ============================================================================

export interface CourseType {
    id: string;
    name: string;
    description?: string;
    createdBy: string;
    createdAt: number;
    status: 'active' | 'pending' | 'rejected';
}

export interface PendingTypeRequest {
    id: string;
    name: string;
    description?: string;
    requestedBy: string;
    requestedAt: number;
    status: 'pending' | 'approved' | 'rejected';
}

// ============================================================================
// INVITATION TYPES
// ============================================================================

export interface TeacherInvitation {
    id: string;
    email: string;
    role: 'teacher';
    createdBy: string;
    createdAt: number;
    expiresAt: number;
    status: 'pending' | 'accepted' | 'revoked';
    inviteCode: string;
}

// ============================================================================
// COURSE & CLASS TYPES
// ============================================================================

export interface Course {
    id: string;
    name: string;
    code: string;
    description?: string;
    teacherId: string;
    createdAt: number;
    status: 'active' | 'archived';
}

export interface Class {
    id: string;
    name: string;
    courseId: string;
    teacherId: string;
    students: string[]; // Array of student UIDs
    createdAt: number;
    status: 'active' | 'archived';
}

// ============================================================================
// ORGANIZED DATA TYPES
// ============================================================================

export interface AssignmentsData {
    all: StudentTeacherAssignment[];
    byStudent: Record<string, StudentTeacherAssignment[]>;
    byTeacher: Record<string, StudentTeacherAssignment[]>;
}

// ============================================================================
// SELECT OPTIONS TYPES
// ============================================================================

export interface SelectOption {
    value: string;
    label: string;
}

export interface UserSelectOptions {
    teachers: SelectOption[];
    students: SelectOption[];
}

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

export interface UseUserManagementReturn {
    // State
    users: UserProfile[];
    filteredUsers: UserProfile[];
    loading: boolean;
    error: string | null;
    successMessage: string | null;
    setError: (error: string | null) => void;
    setSuccessMessage: (message: string | null) => void;

    // Filters
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    assignmentFilter: AssignmentFilter;
    setAssignmentFilter: (filter: AssignmentFilter) => void;
    filterByTeacherId: string | null;
    setFilterByTeacherId: (id: string | null) => void;

    // Actions
    loadUsers: () => Promise<void>;
    updateUser: (userId: string, updates: Partial<UserProfile>) => Promise<void>;
    deleteUser: (userId: string) => Promise<void>;
    clearMessages: () => void;
}

export interface UseAssignmentsReturn {
    // State
    assignments: StudentTeacherAssignment[];
    assignmentsByStudent: Record<string, StudentTeacherAssignment[]>;
    assignmentsByTeacher: Record<string, StudentTeacherAssignment[]>;
    loading: boolean;

    // Actions
    loadAssignments: () => Promise<void>;
    removeAssignment: (assignmentId: string, reason?: string) => Promise<void>;

    // Helpers
    getStudentAssignments: (studentId: string) => StudentTeacherAssignment[];
    getTeacherAssignments: (teacherId: string) => StudentTeacherAssignment[];
    isStudentAssigned: (studentId: string) => boolean;
}

export interface UseInvitationsReturn {
    // State
    invitations: TeacherInvitation[];
    loading: boolean;
    error: string | null;

    // Actions
    loadInvitations: () => Promise<void>;
    generateInvite: (email: string) => Promise<{ success: boolean; inviteCode?: string; error?: string }>;
    revokeInvite: (inviteId: string) => Promise<void>;
}

export interface UseStudentRequestsReturn {
    // State
    requests: AssignmentRequest[];
    loading: boolean;
    error: string | null;

    // Actions
    loadRequests: () => Promise<void>;
    approveRequest: (requestId: string, approvedBy: string) => Promise<void>;
    denyRequest: (requestId: string, deniedBy: string) => Promise<void>;
    createRequest: (teacherId: string, studentEmail: string) => Promise<void>;
}

export interface UseCourseTypesReturn {
    // State
    courseTypes: CourseType[];
    pendingRequests: PendingTypeRequest[];
    loading: boolean;
    error: string | null;

    // Actions
    loadCourseTypes: () => Promise<void>;
    loadPendingRequests: () => Promise<void>;
    approveType: (requestId: string) => Promise<void>;
    rejectType: (requestId: string) => Promise<void>;
}

export interface UseAdminModalsReturn {
    // Modal State
    modals: ModalState;

    // Edit Modal Actions
    openEditModal: (user: UserProfile) => void;
    closeEditModal: () => void;
    updateEditForm: (updates: Partial<EditUserForm>) => void;

    // Assignment Modal Actions
    openAssignmentModal: (user: UserProfile, mode: AssignmentMode) => void;
    closeAssignmentModal: () => void;

    // Release Modal Actions
    openReleaseModal: (student: UserProfile) => void;
    closeReleaseModal: () => void;
    setReleaseLoading: (loading: boolean) => void;

    // Request Modal Actions
    openRequestModal: () => void;
    closeRequestModal: () => void;

    // Add to Class Modal Actions
    openAddToClassModal: (student: UserProfile) => void;
    closeAddToClassModal: () => void;
}

// ============================================================================
// ADMIN CONTEXT TYPES
// ============================================================================

export interface AdminContextValue {
    // User Management
    userManagement: UseUserManagementReturn;

    // Assignments
    assignments: UseAssignmentsReturn;

    // Invitations
    invitations: UseInvitationsReturn;

    // Student Requests
    studentRequests: UseStudentRequestsReturn;

    // Course Types
    courseTypes: UseCourseTypesReturn;

    // Modals
    modals: UseAdminModalsReturn;

    // Shared State
    courses: Course[];
    classes: Class[];
    loadCoursesAndClasses: () => Promise<void>;

    // User Info
    isSuperAdmin: boolean;
    isTeacher: boolean;
    currentUserId: string | null;
}
