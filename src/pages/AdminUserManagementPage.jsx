/**
 * AdminUserManagementPage
 * 
 * Main admin page for managing users, assignments, invitations, and course types.
 * Refactored to use custom hooks for state management.
 */
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { getAllCourses, getCoursesByOwner } from '../services/courseManager';
import { getClasses, enrollStudent } from '../services/classManager';
import { removeAssignment } from '../services/assignmentManager';
import { IconUsers, IconTrendingUp, IconUserPlus } from '@tabler/icons-react';

// Custom Hooks
import {
  useUserManagement,
  useAssignments,
  useAdminModals,
  useCourseTypes,
  useInvitations,
  useStudentRequests
} from '../hooks/admin';

// Components
import {
  AlertMessages,
  AdminPageTitle,
  AdminTabsContainer,
  AdminModalsManager
} from '../components/admin';
import { AdminLayout } from '../components/navigation';

const AdminUserManagementPage = () => {
  const { user, profile, logout } = useAuth();
  const { navigateTo } = useNavigation('admin');
  const location = useLocation();

  // Role checks
  const isSuperAdmin = profile?.role === 'super_admin';
  const isTeacher = profile?.role === 'teacher';

  // Tab and filter state
  const [activeTab, setActiveTab] = useState('students');
  const [filterByTeacherId, setFilterByTeacherId] = useState(
    isTeacher ? user?.uid : (location.state?.teacherId || null)
  );

  useEffect(() => {
    if (location.state?.teacherId) setFilterByTeacherId(location.state.teacherId);
  }, [location.state]);

  // ============================================================================
  // CUSTOM HOOKS
  // ============================================================================
  const assignments = useAssignments();
  const userManagement = useUserManagement({
    activeTab,
    assignmentsByStudent: assignments.assignmentsByStudent,
    filterByTeacherId
  });
  const modals = useAdminModals();
  const courseTypesHook = useCourseTypes();
  const invitationsHook = useInvitations(user?.uid);
  const studentRequestsHook = useStudentRequests();

  // Local state for courses/classes
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);

  // Derived options
  const teacherOptions = userManagement.users
    .filter(u => u.role === 'teacher' || u.role === 'super_admin')
    .map(u => ({ value: u.uid, label: u.displayName || u.email, email: u.email, photoURL: u.photoURL, avatarUrl: u.avatarUrl }));
  const studentOptions = userManagement.users
    .filter(u => u.role === 'student')
    .map(u => ({ value: u.uid, label: u.displayName || u.email }));

  // ============================================================================
  // LOAD DATA
  // ============================================================================
  useEffect(() => {
    if (!user?.uid) return;
    if (activeTab === 'invites') invitationsHook.loadInvitations();
    else if (activeTab === 'requests') studentRequestsHook.loadRequests();
    else if (activeTab === 'course-types') {
      courseTypesHook.loadCourseTypes();
      courseTypesHook.loadPendingRequests();
    } else {
      userManagement.loadUsers().then(() => assignments.loadAssignments());
      loadCoursesAndClasses();
    }
    userManagement.setAssignmentFilter('all');
  }, [user?.uid, activeTab]);

  const loadCoursesAndClasses = async () => {
    try {
      const fetchedCourses = isTeacher && user?.uid
        ? await getCoursesByOwner(user.uid)
        : isSuperAdmin ? await getAllCourses() : [];
      setCourses(fetchedCourses.map(c => ({ value: c.id, label: `${c.name} (${c.code})` })));

      const fetchedClasses = await getClasses(isTeacher ? user?.uid : undefined);
      setClasses(fetchedClasses.map(c => ({ value: c.id, label: `${c.name} (${c.classCode})` })));
    } catch (err) {
      console.error('Error loading courses/classes:', err);
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleLogout = async () => {
    await logout();
    sessionStorage.removeItem('isAdmin');
    navigateTo('LOGIN', {}, { reason: 'admin_logout', replace: true });
  };

    const handleSidebarNavigate = (page) => {
    // Map sidebar page IDs to routes
    const pageRoutes = {
      dashboard: 'ADMIN_DASHBOARD',
      materials: 'ADMIN_MATERIALS',
      users: 'ADMIN_USERS',
      courses: 'ADMIN_COURSES',
      classes: 'ADMIN_CLASSES',
      sessions: 'ADMIN_SESSIONS',
      settings: 'ADMIN_SETTINGS',
      backup: 'ADMIN_BACKUP',
      reports: 'ADMIN_REPORTS',
    };

    const route = pageRoutes[page];
    if (route) {
      navigateTo(route, {}, { reason: `admin_nav_${page}` });
    }
  };

  const handleConfirmRelease = async (assignmentIds, unenrollCourseIds) => {
    if (!modals.modals.studentToRelease) return;
    modals.setReleaseLoading(true);
    try {
      const results = await Promise.all(assignmentIds.map(id =>
        removeAssignment(id, 'Released by admin/teacher', unenrollCourseIds)
      ));
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) userManagement.setError(`Failed to release ${failed.length} assignment(s)`);
      else {
        userManagement.setSuccessMessage(`Successfully released ${modals.modals.studentToRelease.displayName || modals.modals.studentToRelease.email}`);
        await userManagement.loadUsers().then(() => assignments.loadAssignments());
      }
    } catch (err) {
      userManagement.setError('Failed to release student. Please try again.');
    } finally {
      modals.setReleaseLoading(false);
      modals.closeReleaseModal();
    }
  };

  const handleRequestStudent = async (email) => {
    const teacherId = filterByTeacherId || (isTeacher ? user?.uid : null);
    if (!teacherId) throw new Error("No teacher context");
    await studentRequestsHook.createRequest(teacherId, email);
    userManagement.setSuccessMessage(`Request sent for ${email}. Pending admin approval.`);
  };

  const handleConfirmAddToClass = async (classId) => {
    if (!modals.modals.selectedStudentForClass) return;
    const student = modals.modals.selectedStudentForClass;
    const result = await enrollStudent(classId, student.uid, student.displayName || 'Student', student.email);
    result.success
      ? userManagement.setSuccessMessage(`Added ${student.displayName} to class`)
      : userManagement.setError(result.error || 'Failed to add to class');
    if (result.success) loadCoursesAndClasses();
  };

  const handleApproveRequest = async (id) => {
    await studentRequestsHook.approveRequest(id, user.uid);
    userManagement.setSuccessMessage('Request approved');
  };

  const handleDenyRequest = async (id) => {
    if (!confirm('Deny this request?')) return;
    await studentRequestsHook.denyRequest(id, user.uid);
    userManagement.setSuccessMessage('Request denied');
  };

  const handleApproveType = async (id) => {
    if (!confirm('Approve this course type?')) return;
    await courseTypesHook.approveType(id);
    userManagement.setSuccessMessage('Course type approved');
  };

  const handleRejectType = async (id) => {
    if (!confirm('Reject this course type?')) return;
    await courseTypesHook.rejectType(id);
    userManagement.setSuccessMessage('Course type rejected');
  };

  const handleSaveUser = async () => {
    if (!modals.modals.editingUser) return;
    await userManagement.updateUser(modals.modals.editingUser.uid, modals.modals.editForm);
    modals.closeEditModal();
  };

  const handleGenerateInvite = async () => {
    const result = await invitationsHook.generateInvite(user.uid, 7);
    result.success
      ? userManagement.setSuccessMessage(`Invitation code: ${result.code}`)
      : userManagement.setError(result.error || 'Failed to generate');
  };

  const handleRevokeInvite = async (code) => {
    if (!confirm(`Revoke invitation ${code}?`)) return;
    await invitationsHook.revokeInvite(code);
    userManagement.setSuccessMessage(`Invitation ${code} revoked`);
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  const pendingRequestCount = studentRequestsHook.requests.filter(r => r.status === 'pending').length;

  return (
    <AdminLayout
      pageTitle={isTeacher ? 'Student Management' : 'User Management'}
      currentPage="users"
      onNavigate={handleSidebarNavigate}
      onLogout={handleLogout}
      userRole={profile?.role}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <AdminPageTitle
          title={isTeacher ? 'My Students' : 'User Management'}
          subtitle={isTeacher ? 'Manage your assigned students and track their progress' : 'Super Admin Control Panel'}
          stats={[
            { label: isTeacher ? 'Active Students' : 'Total Users', value: userManagement.filteredUsers.length, icon: <IconUsers size={24} />, color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)' },
            { label: 'Attendance Rate', value: 98, icon: <IconTrendingUp size={24} />, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
            { label: 'Pending Requests', value: pendingRequestCount, icon: <IconUserPlus size={24} />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }
          ]}
        />

        <AlertMessages
          error={userManagement.error}
          successMessage={userManagement.successMessage}
          onDismissError={userManagement.clearMessages}
          onDismissSuccess={userManagement.clearMessages}
        />

        <AdminTabsContainer
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isSuperAdmin={isSuperAdmin}
          isTeacher={isTeacher}
          currentUserId={user?.uid || ''}
          userManagement={userManagement}
          assignments={assignments}
          requests={studentRequestsHook.requests}
          pendingRequestCount={pendingRequestCount}
          filterByTeacherId={filterByTeacherId}
          onTeacherFilterChange={setFilterByTeacherId}
          invitations={invitationsHook.invitations}
          onGenerateInvite={handleGenerateInvite}
          onRevokeInvite={handleRevokeInvite}
          courseTypes={courseTypesHook.courseTypes}
          pendingTypeRequests={courseTypesHook.pendingRequests}
          onApproveType={handleApproveType}
          onRejectType={handleRejectType}
          onApproveRequest={handleApproveRequest}
          onDenyRequest={handleDenyRequest}
          onViewAnalytics={(studentId) => navigateTo('TEACHER_STUDENT_HISTORY', { studentId })}
          onEdit={modals.openEditModal}
          onAssignToTeacher={(student) => modals.openAssignmentModal(student, 'assign-to-teacher')}
          onRelease={modals.openReleaseModal}
          onAddToClass={modals.openAddToClassModal}
          onDeleteUser={(uid) => userManagement.deleteUser(uid)}
          onAssignStudents={(teacher, mode) => modals.openAssignmentModal(teacher, mode)}
          onAddStudent={() => modals.openRequestModal()}
        />
      </div>

      <AdminModalsManager
        isEditModalOpen={modals.modals.isEditModalOpen}
        closeEditModal={modals.closeEditModal}
        editForm={modals.modals.editForm}
        setEditForm={modals.updateEditForm}
        onSaveUser={handleSaveUser}
        isAssignmentModalOpen={modals.modals.isAssignmentModalOpen}
        closeAssignmentModal={modals.closeAssignmentModal}
        assignmentMode={modals.modals.assignmentMode}
        selectedUserForAssignment={modals.modals.selectedUserForAssignment}
        teacherOptions={teacherOptions}
        studentOptions={studentOptions}
        courses={courses}
        currentUserId={user?.uid}
        onAssignmentSuccess={() => userManagement.setSuccessMessage('Assignment update successful')}
        loadAssignments={assignments.loadAssignments}
        isReleaseModalOpen={modals.modals.isReleaseModalOpen}
        closeReleaseModal={modals.closeReleaseModal}
        studentToRelease={modals.modals.studentToRelease}
        assignmentsByStudent={assignments.assignmentsByStudent}
        currentTeacherId={isTeacher ? user?.uid : null}
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
    </AdminLayout>
  );
};

export default AdminUserManagementPage;
