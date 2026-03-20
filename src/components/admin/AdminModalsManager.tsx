import React from 'react';
import { EditUserModal, EditFormState } from './EditUserModal';
import AssignmentModal from '../assignment/AssignmentModal';
import { ReleaseStudentModal } from '../assignment/ReleaseStudentModal';
import TeacherRequestModal from '../assignment/TeacherRequestModal';
import { AddToClassModal } from '../assignment/AddToClassModal';
import { User } from './admin.types';

export interface AdminModalsManagerProps {
    // Edit User Modal
    isEditModalOpen: boolean;
    closeEditModal: () => void;
    editForm: EditFormState;
    setEditForm: (form: EditFormState) => void;
    onSaveUser: () => void;

    // Assignment Modal
    isAssignmentModalOpen: boolean;
    closeAssignmentModal: () => void;
    assignmentMode: 'assign-to-teacher' | 'assign-students' | null;
    selectedUserForAssignment: User | null;
    teacherOptions: Array<{ value: string; label: string; email?: string; photoURL?: string | null; avatarUrl?: string | null }>;
    studentOptions: Array<{ value: string; label: string }>;
    courses: Array<{ value: string; label: string }>;
    currentUserId: string | undefined;
    onAssignmentSuccess: () => void;

    // Release Student Modal
    isReleaseModalOpen: boolean;
    closeReleaseModal: () => void;
    studentToRelease: User | null;
    assignmentsByStudent: Record<string, any[]>;
    currentTeacherId: string | null;
    availableCourses: Array<{ value: string; label: string }>;
    onConfirmRelease: (assignmentIds: string[], unenrollCourseIds?: string[]) => void;

    // Request Student Modal
    isRequestModalOpen: boolean;
    closeRequestModal: () => void;
    onRequestStudent: (email: string) => void;

    // Add to Class Modal
    isAddToClassModalOpen: boolean;
    closeAddToClassModal: () => void;
    selectedStudentForClass: User | null;
    classes: Array<{ value: string; label: string }>;
    onConfirmAddToClass: (classId: string) => void;

    // Loading states
    loading?: boolean;
    loadAssignments?: () => void;
}

export const AdminModalsManager: React.FC<AdminModalsManagerProps> = ({
    // Edit User Modal
    isEditModalOpen,
    closeEditModal,
    editForm,
    setEditForm,
    onSaveUser,

    // Assignment Modal
    isAssignmentModalOpen,
    closeAssignmentModal,
    assignmentMode,
    selectedUserForAssignment,
    teacherOptions,
    studentOptions,
    courses,
    currentUserId,
    onAssignmentSuccess,

    // Release Student Modal
    isReleaseModalOpen,
    closeReleaseModal,
    studentToRelease,
    assignmentsByStudent,
    currentTeacherId,
    availableCourses,
    onConfirmRelease,

    // Request Student Modal
    isRequestModalOpen,
    closeRequestModal,
    onRequestStudent,

    // Add to Class Modal
    isAddToClassModalOpen,
    closeAddToClassModal,
    selectedStudentForClass,
    classes,
    onConfirmAddToClass,

    // Loading states
    loading = false,
    loadAssignments,
}) => {
    return (
        <>
            {/* Edit User Modal */}
            <EditUserModal
                opened={isEditModalOpen}
                onClose={closeEditModal}
                editForm={editForm}
                onFormChange={setEditForm}
                onSave={onSaveUser}
                loading={loading}
            />

            {/* Assignment Modal */}
            {assignmentMode && (
                <AssignmentModal
                    opened={isAssignmentModalOpen}
                    onClose={closeAssignmentModal}
                    mode={assignmentMode as 'assign-to-teacher' | 'assign-students'}
                    student={assignmentMode === 'assign-to-teacher' ? (selectedUserForAssignment as any || undefined) : undefined}
                    teacher={assignmentMode === 'assign-students' ? (selectedUserForAssignment as any || undefined) : undefined}
                    teachers={teacherOptions}
                    students={studentOptions}
                    courses={courses}
                    currentUserId={currentUserId || ''}
                    onSuccess={() => {
                        onAssignmentSuccess();
                        loadAssignments?.(); // Reload assignments to update table
                    }}
                />
            )}

            {/* Release Student Modal */}
            <ReleaseStudentModal
                opened={isReleaseModalOpen}
                onClose={closeReleaseModal}
                student={studentToRelease as any}
                assignments={studentToRelease ? (assignmentsByStudent[studentToRelease.uid] || []) : []}
                currentTeacherId={currentTeacherId}
                availableCourses={availableCourses}
                onConfirm={async (assignmentIds, unenrollCourseIds = []) => {
                    onConfirmRelease(assignmentIds, unenrollCourseIds);
                }}
            />

            {/* Teacher Request Modal */}
            <TeacherRequestModal
                opened={isRequestModalOpen}
                onClose={closeRequestModal}
                onSubmit={async (email) => {
                    onRequestStudent(email);
                }}
            />

            {/* Add to Class Modal */}
            <AddToClassModal
                opened={isAddToClassModalOpen}
                onClose={closeAddToClassModal}
                student={selectedStudentForClass as any}
                classes={classes}
                onConfirm={async (classId) => {
                    onConfirmAddToClass(classId);
                }}
            />
        </>
    );
};
