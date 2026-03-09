/**
 * TeacherStudentsPage
 * 
 * Dedicated student management page for teachers.
 * Security: Teachers can ONLY see students assigned to them.
 * Separated from /admin/users for proper access control.
 * 
 * @security This page enforces teacher-level access only.
 * @route /teacher/students
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { getCoursesByOwner } from '../services/courseManager';
import { getClasses, enrollStudent } from '../services/classManager';
import { removeAssignment } from '../services/assignmentManager';
import { IconUsers, IconTrendingUp, IconUserPlus } from '@tabler/icons-react';
import type { AdminTab, EditUserForm } from '../types/admin.types';

// Custom Hooks - Reusing from admin
import {
    useUserManagement,
    useAssignments,
    useAdminModals,
    useStudentRequests
} from '../hooks/admin';

// Components - Reusing from admin
import {
    AlertMessages,
    AdminPageTitle,
    AdminTabsContainer,
    AdminModalsManager
} from '../components/admin';
import { TeacherHeader } from '../components/navigation';
import { AppShell } from '@mantine/core';

const TeacherStudentsPage: React.FC = () => {
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');

    // Security: Force teacher mode - Always filter by current teacher
    const isTeacher = true; // This page is ONLY for teachers
    const isSuperAdmin = false; // Never show super admin features
    const filterByTeacherId = user?.uid || null;

    // Tab state - Limited tabs for teachers (only 'students' and 'requests')
    const [activeTab, setActiveTab] = useState<AdminTab>('students');

    // ============================================================================
    // CUSTOM HOOKS
    // ============================================================================
    const assignments = useAssignments();
    const userManagement = useUserManagement({
        activeTab,
        assignmentsByStudent: assignments.assignmentsByStudent,
        filterByTeacherId // Always filtered to this teacher
    });
    const modals = useAdminModals();
    const studentRequestsHook = useStudentRequests();

    // Local state for courses/classes (teacher's only)
    const [courses, setCourses] = useState<Array<{ value: string; label: string }>>([]);
    const [classes, setClasses] = useState<Array<{ value: string; label: string }>>([]);

    // Derived options - Only students (no teacher list needed for teachers)
    const studentOptions = userManagement.users
        .filter(u => u.role === 'student')
        .map(u => ({ value: u.uid, label: u.displayName || u.email }));

    // ============================================================================
    // LOAD DATA
    // ============================================================================
    useEffect(() => {
        if (!user?.uid) return;

        if (activeTab === 'requests') {
            studentRequestsHook.loadRequests();
        } else {
            userManagement.loadUsers().then(() => assignments.loadAssignments());
            loadCoursesAndClasses();
        }
        userManagement.setAssignmentFilter('all');
    }, [user?.uid, activeTab]);

    const loadCoursesAndClasses = async () => {
        if (!user?.uid) return;

        try {
            // Teacher's courses only
            const fetchedCourses = await getCoursesByOwner(user.uid);
            setCourses(fetchedCourses.map(c => ({ value: c.id, label: `${c.name} (${c.code})` })));

            // Teacher's classes only
            const fetchedClasses = await getClasses(user.uid);
            setClasses(fetchedClasses.map(c => ({ value: c.id, label: `${c.name} (${c.classCode})` })));
        } catch (err) {
            console.error('[TeacherStudentsPage] Error loading courses/classes:', err);
        }
    };

    // ============================================================================
    // HANDLERS
    // ============================================================================
    const handleLogout = async () => {
        await logout();
        sessionStorage.removeItem('isAdmin');
        navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
    };



    const handleTabChange = (tab: string | null) => {
        // Only allow valid teacher tabs: 'students' and 'requests'
        if (tab === 'students' || tab === 'requests') {
            setActiveTab(tab);
        }
    };

    const handleConfirmRelease = async (assignmentIds: string[], unenrollCourseIds?: string[]) => {
        if (!modals.modals.studentToRelease) return;
        modals.setReleaseLoading(true);
        try {
            const results = await Promise.all(assignmentIds.map(id =>
                removeAssignment(id, 'Released by teacher', unenrollCourseIds || [])
            ));
            const failed = results.filter(r => !r.success);
            if (failed.length > 0) {
                userManagement.setError(`Failed to release ${failed.length} assignment(s)`);
            } else {
                userManagement.setSuccessMessage(
                    `Successfully released ${modals.modals.studentToRelease.displayName || modals.modals.studentToRelease.email}`
                );
                await userManagement.loadUsers().then(() => assignments.loadAssignments());
            }
        } catch (err) {
            userManagement.setError('Failed to release student. Please try again.');
        } finally {
            modals.setReleaseLoading(false);
            modals.closeReleaseModal();
        }
    };

    const handleRequestStudent = async (email: string) => {
        if (!user?.uid) throw new Error("No teacher context");
        await studentRequestsHook.createRequest(user.uid, email);
        userManagement.setSuccessMessage(`Request sent for ${email}. Pending admin approval.`);
    };

    const handleConfirmAddToClass = async (classId: string) => {
        if (!modals.modals.selectedStudentForClass) return;
        const student = modals.modals.selectedStudentForClass;
        const result = await enrollStudent(classId, student.uid, student.displayName || 'Student', student.email);
        result.success
            ? userManagement.setSuccessMessage(`Added ${student.displayName} to class`)
            : userManagement.setError(result.error || 'Failed to add to class');
        if (result.success) loadCoursesAndClasses();
    };

    const handleApproveRequest = async (id: string) => {
        if (!user?.uid) return;
        await studentRequestsHook.approveRequest(id, user.uid);
        userManagement.setSuccessMessage('Request approved');
    };

    const handleDenyRequest = async (id: string) => {
        if (!confirm('Deny this request?')) return;
        if (!user?.uid) return;
        await studentRequestsHook.denyRequest(id, user.uid);
        userManagement.setSuccessMessage('Request denied');
    };

    // Placeholder edit form for disabled modal
    const placeholderEditForm: EditUserForm = {
        displayName: '',
        studentGroup: '',
        status: 'active'
    };

    // ============================================================================
    // RENDER
    // ============================================================================
    const pendingRequestCount = studentRequestsHook.requests.filter(r => r.status === 'pending').length;

    // Security check: Only teachers can access this page
    // Note: Super admins should use /admin/users instead (per security architecture)
    if (profile?.role !== 'teacher') {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'
            }}>
                <div style={{
                    textAlign: 'center',
                    padding: '2rem',
                    background: 'white',
                    borderRadius: '1rem',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                }}>
                    <h1 style={{ color: '#dc2626', marginBottom: '1rem' }}>🚫 Access Denied</h1>
                    <p style={{ color: '#64748b' }}>This page is for teachers only.</p>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        Super admins: Please use Admin Console → Users
                    </p>
                    <button
                        onClick={() => navigateTo('LOGIN', {}, { replace: true })}
                        style={{
                            marginTop: '1rem',
                            padding: '0.75rem 1.5rem',
                            background: '#6366f1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
                backgroundAttachment: 'fixed',
            }}
        >
            <AppShell padding="md">
                {/* Unified Teacher Header with Navigation */}
                <TeacherHeader
                    pageTitle="Students"
                    userId={user?.uid}
                    userRole={profile?.role}
                    userDisplayName={profile?.displayName || user?.displayName || user?.email}
                    userEmail={profile?.email || user?.email}
                    userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                    onLogout={handleLogout}
                />

                <AppShell.Main>
                    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
                        <AdminPageTitle
                            title="My Students"
                            subtitle="Manage your assigned students and track their progress"
                            stats={[
                                {
                                    label: 'Active Students',
                                    value: userManagement.filteredUsers.length,
                                    icon: <IconUsers size={24} />,
                                    color: '#6366f1',
                                    bg: 'rgba(99, 102, 241, 0.1)'
                                },
                                {
                                    label: 'Attendance Rate',
                                    value: 98,
                                    icon: <IconTrendingUp size={24} />,
                                    color: '#10b981',
                                    bg: 'rgba(16, 185, 129, 0.1)'
                                },
                                {
                                    label: 'Pending Requests',
                                    value: pendingRequestCount,
                                    icon: <IconUserPlus size={24} />,
                                    color: '#f59e0b',
                                    bg: 'rgba(245, 158, 11, 0.1)'
                                }
                            ]}
                        />

                        <AlertMessages
                            error={userManagement.error}
                            successMessage={userManagement.successMessage}
                            onClearError={userManagement.clearMessages}
                            onClearSuccess={userManagement.clearMessages}
                        />

                        <AdminTabsContainer
                            activeTab={activeTab}
                            onTabChange={handleTabChange}
                            isSuperAdmin={isSuperAdmin}
                            isTeacher={isTeacher}
                            currentUserId={user?.uid || ''}
                            userManagement={userManagement}
                            assignments={assignments}
                            requests={studentRequestsHook.requests}
                            pendingRequestCount={pendingRequestCount}
                            filterByTeacherId={filterByTeacherId}
                            onTeacherFilterChange={() => { }} // Teachers can't change filter
                            invitations={[]} // No invitations for teachers
                            onGenerateInvite={() => { }} // Disabled for teachers
                            onRevokeInvite={() => { }} // Disabled for teachers
                            courseTypes={[]} // No course types for teachers
                            pendingTypeRequests={[]} // No pending requests for teachers
                            onApproveType={() => { }} // Disabled for teachers
                            onRejectType={() => { }} // Disabled for teachers
                            onApproveRequest={handleApproveRequest}
                            onDenyRequest={handleDenyRequest}
                            onViewAnalytics={(studentId) => {
                                // Navigate to teacher's student history page
                                window.location.href = `/teacher/student/${studentId}/history`;
                            }}
                            onEdit={() => { }} // Teachers can't edit users
                            onAssignToTeacher={() => { }} // Teachers can't assign to other teachers
                            onRelease={modals.openReleaseModal}
                            onAddToClass={modals.openAddToClassModal}
                            onDeleteUser={() => { }} // Teachers can't delete users
                            onAssignStudents={() => { }} // Teachers can't bulk assign
                            onAddStudent={() => modals.openRequestModal()}
                        />
                    </div>

                    <AdminModalsManager
                        isEditModalOpen={false} // Teachers can't edit
                        closeEditModal={() => { }}
                        editForm={placeholderEditForm}
                        setEditForm={() => { }}
                        onSaveUser={() => { }}
                        isAssignmentModalOpen={false} // Teachers can't assign
                        closeAssignmentModal={() => { }}
                        assignmentMode={null}
                        selectedUserForAssignment={null}
                        teacherOptions={[]}
                        studentOptions={studentOptions}
                        courses={courses}
                        currentUserId={user?.uid}
                        onAssignmentSuccess={() => { }}
                        loadAssignments={assignments.loadAssignments}
                        isReleaseModalOpen={modals.modals.isReleaseModalOpen}
                        closeReleaseModal={modals.closeReleaseModal}
                        studentToRelease={modals.modals.studentToRelease}
                        assignmentsByStudent={assignments.assignmentsByStudent}
                        currentTeacherId={user?.uid || null}
                        availableCourses={courses}
                        onConfirmRelease={handleConfirmRelease}
                        isRequestModalOpen={modals.modals.isRequestModalOpen}
                        closeRequestModal={modals.closeRequestModal}
                        onRequestStudent={handleRequestStudent}
                        isAddToClassModalOpen={modals.modals.isAddToClassModalOpen}
                        closeAddToClassModal={modals.closeAddToClassModal}
                        selectedStudentForClass={modals.modals.selectedStudentForClass}
                        classes={classes}
                        onConfirmAddToClass={handleConfirmAddToClass}
                    />
                </AppShell.Main>
            </AppShell>
        </div>
    );
};

export default TeacherStudentsPage;
