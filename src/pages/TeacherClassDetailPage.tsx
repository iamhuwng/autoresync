// @ts-nocheck

/**
 * Teacher Class Detail Page
 * detailed view for a specific class: roster, assignments, and settings
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { useHomeworkList } from '../hooks/useHomeworkList';
import { TeacherHeader } from '../components/navigation';
import { Card, CardBody, Button, VanillaTabs, VanillaLoader } from '../components/modern';
import { classManager, removeStudentFromClass, approveClassStudent, rejectClassStudent } from '../services/classManager';
import { LinkCourseModal } from '../components/course/LinkCourseModal';
import { ExtendCourseModal } from '../components/course/ExtendCourseModal';
import { CourseCreateModal } from '../components/course/CourseCreateModal';
import { HomeworkCard, HomeworkCreateModal } from '../components/homework';
import { toast } from '../components/modern/ToastNotification';
import { FEATURE_IDS } from '../config/featureRegistry';
import { getLinkedCourses, unlinkCourseFromClass, syncCourseWithOriginal } from '../services/enrollmentManager';
import { getCourse } from '../services/courseManager';
import { detectSyncUpdates, applySyncMaterials, applySyncNewModule } from '../services/courseSyncService';
import type { ClassSession } from '../types/class.types';
import type { ClassCourseLink, Course } from '../types/course.types';
import type { HomeworkTarget } from '../types/homework.types';
import { ModuleList } from '../components/course/ModuleList';
import {
  IconChevronDown,
  IconChevronUp,
  IconPencil,
  IconSettings,
  IconUsers,
  IconBook,
  IconClipboardList,
  IconHistory,
  IconExternalLink,
  IconRefresh,
  IconClock,
  IconTrash,
  IconPlus,
  IconCheck,
  IconX
} from '@tabler/icons-react';

const TeacherClassDetailPage: React.FC = () => {
  const { classId } = useParams();
  const { navigateTo } = useNavigation('teacher');
  const { user, profile } = useAuth();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.classes);
  const [classData, setClassData] = useState<ClassSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>('students');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [linkedCourses, setLinkedCourses] = useState<{ link: ClassCourseLink, course: Course }[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [selectedLinkForExtend, setSelectedLinkForExtend] = useState<string | null>(null);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [showHomeworkCreateModal, setShowHomeworkCreateModal] = useState(false);

  const [accessDenied, setAccessDenied] = useState(false);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);
  const [approvingStudentId, setApprovingStudentId] = useState<string | null>(null);
  const [rejectingStudentId, setRejectingStudentId] = useState<string | null>(null);

  // Edit course details modal (for class instance copies)
  const [courseToEditDetails, setCourseToEditDetails] = useState<Course | null>(null);
  const [isEditDetailsModalOpen, setIsEditDetailsModalOpen] = useState(false);
  const homeworkTargetClassId = activeTab === 'homework' ? classId : undefined;
  const {
    filteredHomework: classHomework,
    loading: homeworkLoading,
    error: homeworkError,
    refetch: refetchHomework,
    statusCounts: homeworkStatusCounts,
  } = useHomeworkList({
    classId: homeworkTargetClassId,
    autoRefresh: activeTab === 'homework',
    excludeArchived: true,
    excludeClosed: false,
    pageSize: 12,
  });

  const handleEditCourseDetails = (course: Course) => {
    setCourseToEditDetails(course);
    setIsEditDetailsModalOpen(true);
  };

  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    if (!classId) return;

    const confirmed = window.confirm(
      `Remove ${studentName || 'this student'} from this class? This will also remove class-linked course access.`
    );
    if (!confirmed) {
      trackAction('removeStudent', { classId, studentId, outcome: 'cancelled' });
      return;
    }

    setRemovingStudentId(studentId);
    try {
      const result = await removeStudentFromClass(classId, studentId);
      if (!result.success) {
        trackAction('removeStudent', { classId, studentId, outcome: 'failure' });
        toast.show({
          title: 'Remove Failed',
          message: result.error || 'Could not remove student from class',
          tone: 'error',
        });
        return;
      }

      trackAction('removeStudent', { classId, studentId, outcome: 'success' });
      toast.show({
        title: 'Student Removed',
        message: `${studentName || 'Student'} was removed from the class.`,
        tone: 'success',
      });
    } catch (error) {
      console.error('Error removing student:', error);
      trackAction('removeStudent', { classId, studentId, outcome: 'error' });
      toast.show({
        title: 'Error',
        message: 'An unexpected error occurred while removing the student.',
        tone: 'error',
      });
    } finally {
      setRemovingStudentId(null);
    }
  };

  const handleApproveStudent = async (studentId: string, studentName: string) => {
    if (!classId || !user?.uid) return;
    setApprovingStudentId(studentId);
    try {
      const result = await approveClassStudent(classId, studentId, user.uid);
      if (result.success) {
        trackAction('approveStudent', { classId, studentId, outcome: 'success' });
        toast.show({
          title: 'Student Approved',
          message: `${studentName} is now an active member of this class.`,
          tone: 'success',
        });
        loadClassData();
      } else {
        trackAction('approveStudent', { classId, studentId, outcome: 'failure' });
        toast.show({
          title: 'Approval Failed',
          message: result.error || 'Could not approve student',
          tone: 'error',
        });
      }
    } catch (error) {
      console.error('Error approving student:', error);
      trackAction('approveStudent', { classId, studentId, outcome: 'error' });
      toast.show({ title: 'Error', message: 'An unexpected error occurred.', tone: 'error' });
    } finally {
      setApprovingStudentId(null);
    }
  };

  const handleRejectStudent = async (studentId: string, studentName: string) => {
    if (!classId) return;
    const confirmed = window.confirm(
      `Reject ${studentName || 'this student'}? They will be removed from the class.`
    );
    if (!confirmed) {
      trackAction('rejectStudent', { classId, studentId, outcome: 'cancelled' });
      return;
    }

    setRejectingStudentId(studentId);
    try {
      const result = await rejectClassStudent(classId, studentId);
      if (result.success) {
        trackAction('rejectStudent', { classId, studentId, outcome: 'success' });
        toast.show({
          title: 'Student Rejected',
          message: `${studentName} has been removed from the class.`,
          tone: 'warning',
        });
        loadClassData();
      } else {
        trackAction('rejectStudent', { classId, studentId, outcome: 'failure' });
        toast.show({
          title: 'Rejection Failed',
          message: result.error || 'Could not reject student',
          tone: 'error',
        });
      }
    } catch (error) {
      console.error('Error rejecting student:', error);
      trackAction('rejectStudent', { classId, studentId, outcome: 'error' });
      toast.show({ title: 'Error', message: 'An unexpected error occurred.', tone: 'error' });
    } finally {
      setRejectingStudentId(null);
    }
  };

  // Load class data
  useEffect(() => {
    if (classId) {
      loadClassData();

      // Subscribe to real-time updates
      const unsubscribe = classManager.subscribeToClass(classId, (data) => {
        if (data) setClassData(data);
      });
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
    return () => { };
  }, [classId]);

  useEffect(() => {
    if (classId && activeTab === 'courses') {
      loadLinkedCourses();
    }
  }, [classId, activeTab]);

  const loadClassData = async () => {
    if (!classId || !user?.uid) return;
    setLoading(true);
    try {
      const data = await classManager.getClass(classId);

      // Security: Verify ownership before allowing access
      const isOwner = data?.createdBy === user.uid;
      const isSuperAdmin = profile?.role === 'super_admin';

      if (!isOwner && !isSuperAdmin) {
        console.warn(`[Security] Access denied to class ${classId} for user ${user.uid}`);
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setClassData(data);
    } catch (error) {
      console.error('Error loading class:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLinkedCourses = async () => {
    if (!classId) return;
    setLoadingCourses(true);
    try {
      const links = await getLinkedCourses(classId);
      const coursesWithLinks = await Promise.all(links.map(async (link) => {
        const course = await getCourse(link.courseId);
        return course ? { link, course } : null;
      }));
      setLinkedCourses(coursesWithLinks.filter(c => c !== null) as { link: ClassCourseLink, course: Course }[]);
    } catch (error) {
      console.error('Error loading linked courses:', error);
    } finally {
      setLoadingCourses(false);
    }
  };

  const handleUnlinkCourse = async (courseId: string) => {
    if (!classId) return;
    if (window.confirm('Are you sure you want to unlink this course? Access will be removed for all students.')) {
      try {
        const result = await unlinkCourseFromClass(classId, courseId);
        if (result.success) {
          toast.show({ title: 'Success', message: 'Course unlinked successfully', tone: 'success' });
          loadLinkedCourses();
        } else {
          toast.show({ title: 'Error', message: result.error || 'Failed to unlink course', tone: 'error' });
        }
      } catch (error) {
        console.error('Error unlinking course:', error);
        toast.show({ title: 'Error', message: 'An unexpected error occurred', tone: 'error' });
      }
    }
  };

  const handleSyncCourse = async (linkId: string, copyCourseId: string) => {
    try {
      // 1. Metadata sync (name, description, etc.)
      await syncCourseWithOriginal(linkId);

      // 2. Material & module sync — detect then auto-apply ALL pending updates
      let materialsAdded = 0;
      let modulesAdded = 0;
      const syncStatus = await detectSyncUpdates(copyCourseId);

      if (syncStatus) {
        // Apply new materials within existing modules
        for (const modUpdate of syncStatus.moduleUpdates) {
          if (modUpdate.pendingMaterials.length > 0) {
            const materialIds = modUpdate.pendingMaterials.map(m => m.materialId);
            const result = await applySyncMaterials(
              copyCourseId,
              modUpdate.copyModuleId,
              materialIds
            );
            if (result.success) materialsAdded += result.addedCount;
          }
        }

        // Apply entirely new modules
        for (const newMod of syncStatus.newModules) {
          const result = await applySyncNewModule(copyCourseId, newMod.originalModuleId);
          if (result.success) modulesAdded++;
        }
      }

      // 3. Show result
      if (materialsAdded > 0 || modulesAdded > 0) {
        const parts = [];
        if (materialsAdded > 0) parts.push(`${materialsAdded} material${materialsAdded > 1 ? 's' : ''}`);
        if (modulesAdded > 0) parts.push(`${modulesAdded} module${modulesAdded > 1 ? 's' : ''}`);
        toast.show({
          title: 'Sync Complete',
          message: `Added ${parts.join(' and ')} from the original course. Students can now access the new content.`,
          tone: 'success',
        });
      } else {
        toast.show({ title: 'Up to Date', message: 'Course metadata synced. No new materials or modules to add.', tone: 'info' });
      }

      loadLinkedCourses(); // Refresh
    } catch (error) {
      console.error('Error syncing course:', error);
      toast.show({ title: 'Error', message: 'Failed to sync course', tone: 'error' });
    }
  };

  const handleToggleExpand = (courseId: string) => {
    setExpandedCourseId(expandedCourseId === courseId ? null : courseId);
  };

  const handleBack = () => {
    navigateTo('TEACHER_CLASSES', {}, { reason: 'back_to_classes' });
  };

  const handleTabChange = (nextTab: string | null) => {
    setActiveTab(nextTab);

    if (nextTab === 'homework' && classId) {
      trackAction('viewHomeworkTab', { classId });
    }
  };

  const handleOpenHomeworkCreateModal = () => {
    if (classId) {
      trackAction('openHomeworkCreateModal', { classId });
    }

    setShowHomeworkCreateModal(true);
  };

  const handleOpenHomeworkDashboard = () => {
    if (classId) {
      trackAction('openHomeworkDashboard', { classId });
    }

    navigateTo('TEACHER_HOMEWORK', {}, { reason: 'view_all_homework_from_class' });
  };

  const handleOpenHomeworkDetail = (homeworkId: string) => {
    if (classId) {
      trackAction('openHomeworkDetail', { classId, homeworkId });
    }

    navigateTo('TEACHER_HOMEWORK_DETAIL', { homeworkId }, { reason: 'teacher_open_class_homework_detail' });
  };

  const handleLogout = async () => {
    navigateTo('LOGIN', {}, { reason: 'logout', replace: true });
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 100%)'
      }}>
        <VanillaLoader size="xl" color="#8b5cf6" />
      </div>
    );
  }

  // Security: Show access denied message
  if (accessDenied) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 100%)',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '4rem' }}>🔒</div>
        <h2 style={{ color: '#1e293b', fontWeight: 800 }}>Access Denied</h2>
        <p style={{ color: '#64748b', maxWidth: '400px', textAlign: 'center' }}>
          You don't have permission to view this class. You can only access classes you created.
        </p>
        <Button variant="primary" onClick={handleBack}>
          Back to My Classes
        </Button>
      </div>
    );
  }

  if (!classData) {
    return <div style={{ padding: '4rem', textAlign: 'center' }}>Class not found</div>;
  }

  const students = Object.values(classData.students || {});
  const assignments = Object.values(classData.assignments || {});
  const homeworkTarget: HomeworkTarget = {
    type: 'class',
    classId: classId || classData.id,
    className: classData.name,
  };

  return (
    <>
      <TeacherHeader
        pageTitle={classData.name}
        userId={user?.uid || ''}
        userRole={profile?.role || 'teacher'}
        userDisplayName={profile?.displayName || user?.displayName || user?.email}
        userEmail={profile?.email || user?.email}
        userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
        onLogout={handleLogout}
        hideBackButton={false}
        hideNavigation={false}
        hideBreadcrumbs={false}
      />

      <div
        style={{
          minHeight: 'calc(100vh - 180px)',
          background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
          backgroundAttachment: 'fixed',
          padding: '2rem 1rem',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* Class Code Badge */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>CLASS CODE:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', color: '#4f46e5', background: 'rgba(99, 102, 241, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '0.5rem' }}>
              {classData.classCode}
            </span>
            <Button
              variant="glass"
              size="xs"
              style={{ marginLeft: 'auto' }}
              onClick={() => setShowSettingsModal(true)}
            >
              <IconSettings size={16} style={{ marginRight: '0.25rem' }} />
              Settings
            </Button>
          </div>

          {/* Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.25rem',
            marginBottom: '2.5rem',
            animation: 'slideDown 0.5s ease-out'
          }}>
            <Card variant="sky">
              <CardBody style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0369a1', marginBottom: '0.25rem' }}>{students.length}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Students</div>
              </CardBody>
            </Card>
            <Card variant="mint">
              <CardBody style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#047857', marginBottom: '0.25rem' }}>{classData.stats.activeStudents}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Active Players</div>
              </CardBody>
            </Card>
            <Card variant="lavender">
              <CardBody style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#6d28d9', marginBottom: '0.25rem' }}>{assignments.length}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assigned Tests</div>
              </CardBody>
            </Card>
            <Card variant="peach">
              <CardBody style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#b45309', marginBottom: '0.25rem' }}>{classData.stats.completedAssignments}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Submissions</div>
              </CardBody>
            </Card>
          </div>

          <Card
            variant="glass"
            style={{
              animation: 'slideUp 0.5s ease-out 0.1s backwards',
              minHeight: '500px'
            }}
          >
            <CardBody>
              <div className="class-detail-content">
                <VanillaTabs
                  activeTab={activeTab || 'students'}
                  onTabChange={handleTabChange}
                  tabs={[
                    { key: 'students', label: 'Students', icon: <IconUsers size={16} /> },
                    { key: 'courses', label: 'Courses', icon: <IconBook size={16} /> },
                    { key: 'assignments', label: 'Assignments', icon: <IconClipboardList size={16} /> },
                    { key: 'homework', label: 'Homework', icon: <IconClipboardList size={16} /> },
                    { key: 'activity', label: 'Activity', icon: <IconHistory size={16} /> },
                  ]}
                />

                <div hidden={activeTab !== 'students'}>
                  {(() => {
                    const pendingStudents = students.filter(s => s.status === 'pending_approval');
                    const activeStudents = students.filter(s => !s.status || s.status === 'active');

                    if (students.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                          <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>👥</div>
                          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>No Students Yet</h3>
                          <p style={{ maxWidth: '400px', margin: '0 auto' }}>
                            Share your class code <strong>{classData.classCode}</strong> with students to have them join this class.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Pending Approval Section */}
                        {pendingStudents.length > 0 && (
                          <div style={{
                            background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(245, 158, 11, 0.05) 100%)',
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                            borderRadius: '1rem',
                            padding: '1.25rem',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                              <span style={{ fontSize: '1.25rem' }}>⏳</span>
                              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#92400e' }}>
                                Pending Approval
                              </h4>
                              <span className="class-detail-badge" style={{ background: '#fef3c7', color: '#92400e' }}>
                                {pendingStudents.length}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {pendingStudents.map((student) => (
                                <div
                                  key={student.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.75rem 1rem',
                                    background: 'rgba(255, 255, 255, 0.7)',
                                    borderRadius: '0.75rem',
                                    border: '1px solid rgba(245, 158, 11, 0.15)',
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{student.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                      {student.email && <span>{student.email} · </span>}
                                      Requested {new Date(student.joinedAt).toLocaleDateString()}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <Button
                                      variant="primary"
                                      size="xs"
                                      onClick={() => handleApproveStudent(student.id, student.name)}
                                      disabled={approvingStudentId === student.id}
                                      style={{ background: '#16a34a', fontWeight: 700 }}
                                    >
                                      <IconCheck size={14} style={{ marginRight: '0.25rem' }} />
                                      {approvingStudentId === student.id ? 'Approving...' : 'Approve'}
                                    </Button>
                                    <Button
                                      variant="danger"
                                      size="xs"
                                      onClick={() => handleRejectStudent(student.id, student.name)}
                                      disabled={rejectingStudentId === student.id}
                                    >
                                      <IconX size={14} style={{ marginRight: '0.25rem' }} />
                                      {rejectingStudentId === student.id ? 'Rejecting...' : 'Reject'}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Active Students Table */}
                        {activeStudents.length > 0 && (
                          <div style={{ overflowX: 'auto' }}>
                            <table className="class-detail-table">
                              <thead>
                                <tr>
                                  <th style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student Name</th>
                                  <th style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                                  <th style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Joined Date</th>
                                  <th style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Active</th>
                                  <th style={{ textAlign: 'right', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {activeStudents.map((student) => (
                                  <tr key={student.id}>
                                    <td style={{ fontWeight: 700, color: '#1e293b' }}>{student.name}</td>
                                    <td>
                                      <span className="class-detail-badge" style={{ color: student.isOnline ? '#15803d' : '#64748b' }}>
                                        {student.isOnline ? 'Online' : 'Offline'}
                                      </span>
                                    </td>
                                    <td style={{ fontSize: '0.875rem', color: '#64748b' }}>{new Date(student.joinedAt).toLocaleDateString()}</td>
                                    <td style={{ fontSize: '0.875rem', color: '#64748b' }}>{new Date(student.lastActiveAt).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right' }}>
                                      <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <Button variant="glass" size="xs">View Progress</Button>
                                        <Button
                                          variant="danger"
                                          size="xs"
                                          onClick={() => handleRemoveStudent(student.id, student.name)}
                                          disabled={removingStudentId === student.id}
                                        >
                                          {removingStudentId === student.id ? 'Removing...' : 'Remove'}
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* If only pending students and no active ones */}
                        {activeStudents.length === 0 && pendingStudents.length > 0 && (
                          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                            <p style={{ fontSize: '0.9rem' }}>No approved students yet. Approve pending requests above to add students to this class.</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div hidden={activeTab !== 'courses'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Linked Study Materials</h3>
                    <Button variant="primary" size="sm" onClick={() => setShowLinkModal(true)}>
                      <IconBook size={18} style={{ marginRight: '0.4rem' }} />
                      Link New Course
                    </Button>
                  </div>

                  {loadingCourses ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}><VanillaLoader size="md" color="#8b5cf6" /></div>
                  ) : linkedCourses.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8', background: 'rgba(255,255,255,0.3)', borderRadius: '1rem', border: '1px dashed #e2e8f0' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#475569', marginBottom: '0.5rem' }}>No Linked Courses</h3>
                      <p style={{ maxWidth: '350px', margin: '0 auto', fontSize: '0.9rem' }}>
                        Link a course to provide students with modules, reading materials, and practice quizzes.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {linkedCourses.map(({ link, course }) => (
                        <div
                          key={link.id}
                          style={{
                            borderRadius: '1.25rem',
                            overflow: 'hidden',
                            border: '1px solid rgba(226, 232, 240, 0.6)',
                            background: expandedCourseId === course.id ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.5)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div
                            onClick={() => handleToggleExpand(course.id)}
                            style={{
                              padding: '1.25rem 1.5rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                background: 'linear-gradient(135deg, #8b5cf6 0%, #d8b4fe 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 800
                              }}>
                                {course.name.charAt(0)}
                              </div>
                              <div>
                                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>{course.name}</h4>
                                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                                  <span style={{ color: '#64748b' }}>REF: <span style={{ fontWeight: 700, color: '#444' }}>{course.code}</span></span>
                                  <span style={{ color: '#64748b' }}>EXPIRES: <span style={{ fontWeight: 700, color: '#444' }}>{link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'NEVER'}</span></span>
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ display: 'flex', gap: '0.25rem', marginRight: '1rem' }}>
                                <button type="button" className="class-detail-icon-button" title="Edit Course Details" aria-label="Edit Course Details" onClick={(e) => { e.stopPropagation(); handleEditCourseDetails(course); }}>
                                  <IconPencil size={16} />
                                </button>
                                <button type="button" className="class-detail-icon-button" title="Open Course Settings" aria-label="Open Course Settings" onClick={(e) => { e.stopPropagation(); navigateTo('TEACHER_COURSE_DETAIL', { courseId: course.id }); }}>
                                  <IconExternalLink size={16} />
                                </button>
                                <button type="button" className="class-detail-icon-button" title="Extend Access" aria-label="Extend Access" onClick={(e) => { e.stopPropagation(); setSelectedLinkForExtend(link.id); setExtendModalOpen(true); }}>
                                  <IconClock size={16} />
                                </button>
                                <button type="button" className="class-detail-icon-button" title="Sync Updates" aria-label="Sync Updates" onClick={(e) => { e.stopPropagation(); handleSyncCourse(link.id, course.id); }}>
                                  <IconRefresh size={16} />
                                </button>
                                <button type="button" className="class-detail-icon-button" title="Unlink Course" aria-label="Unlink Course" onClick={(e) => { e.stopPropagation(); handleUnlinkCourse(course.id); }}>
                                  <IconTrash size={16} />
                                </button>
                              </div>
                              {expandedCourseId === course.id ? <IconChevronUp size={20} color="#94a3b8" /> : <IconChevronDown size={20} color="#94a3b8" />}
                            </div>
                          </div>

                          {expandedCourseId === course.id && (
                            <div style={{ padding: '0 1.5rem 1.5rem', background: 'rgba(255, 255, 255, 0.3)' }}>
                              <div style={{ borderTop: '1px solid rgba(226, 232, 240, 0.6)', paddingTop: '1.25rem' }}>
                                <ModuleList courseId={course.id} classId={classId} />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div hidden={activeTab !== 'assignments'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Active Class Assignments</h3>
                    <Button variant="primary" size="sm" onClick={() => navigateTo('TEACHER_LOBBY', { sessionCode: classData.classCode }, { reason: 'assign_test_from_class' })}>
                      <IconPlus size={18} style={{ marginRight: '0.4rem' }} />
                      New Test or Quiz
                    </Button>
                  </div>

                  {assignments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8', background: 'rgba(255,255,255,0.3)', borderRadius: '1rem', border: '1px dashed #e2e8f0' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#475569', marginBottom: '0.5rem' }}>No Active Assignments</h3>
                      <p style={{ maxWidth: '350px', margin: '0 auto', fontSize: '0.9rem' }}>
                        Assign a test or quiz to this class from the Teacher Lobby.
                      </p>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="class-detail-table">
                        <thead>
                          <tr>
                            <th style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignment Title</th>
                            <th style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                            <th style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                            <th style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progress</th>
                            <th style={{ textAlign: 'right', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignments.map((assignment) => (
                            <tr key={assignment.id}>
                              <td style={{ fontWeight: 800, color: '#1e293b' }}>{assignment.testTitle}</td>
                              <td>
                                <span className="class-detail-badge" style={{ color: assignment.testType === 'test' ? '#2563eb' : '#7c3aed' }}>
                                  {assignment.testType.toUpperCase()}
                                </span>
                              </td>
                              <td>
                                <span className="class-detail-badge" style={{ color: assignment.status === 'in_progress' || assignment.status === 'available' ? '#15803d' : '#64748b' }}>
                                  {assignment.status.toUpperCase()}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', flex: 1, position: 'relative', overflow: 'hidden' }}>
                                    <div style={{
                                      position: 'absolute',
                                      left: 0,
                                      top: 0,
                                      height: '100%',
                                      background: '#8b5cf6',
                                      width: `${((assignment.stats?.submitted || 0) / (assignment.stats?.totalStudents || 1)) * 100}%`
                                    }} />
                                  </div>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: '40px' }}>
                                    {assignment.stats?.submitted || 0} / {assignment.stats?.totalStudents || 0}
                                  </span>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <Button
                                  variant="glass"
                                  size="xs"
                                  onClick={() => navigateTo('TEACHER_TEST_RESULTS', { sessionCode: classData.id }, { reason: 'view_results_from_class' })}
                                >
                                  View Results
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div hidden={activeTab !== 'homework'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Class Homework</h3>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleOpenHomeworkCreateModal}
                    >
                      <IconPlus size={18} style={{ marginRight: '0.4rem' }} />
                      Assign Homework
                    </Button>
                  </div>

                  <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.9rem' }}>
                    {classHomework.length} assignment{classHomework.length === 1 ? '' : 's'} for this class.
                    {' '}
                    {(homeworkStatusCounts.active ?? 0) + (homeworkStatusCounts.scheduled ?? 0)} open,
                    {' '}
                    {homeworkStatusCounts.past_due ?? 0} past due,
                    {' '}
                    {homeworkStatusCounts.closed ?? 0} closed.
                  </p>

                  {homeworkLoading ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                      <VanillaLoader size="md" color="#8b5cf6" />
                      <p style={{ marginTop: '1rem', color: '#64748b', fontWeight: 600 }}>Loading class homework...</p>
                    </div>
                  ) : homeworkError ? (
                    <div style={{ textAlign: 'center', padding: '3rem 2rem', color: '#94a3b8', background: 'rgba(255,255,255,0.3)', borderRadius: '1rem', border: '1px dashed #e2e8f0' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>!</div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#475569', marginBottom: '0.5rem' }}>Could not load class homework</h3>
                      <p style={{ maxWidth: '450px', margin: '0 auto 1.5rem', fontSize: '0.9rem' }}>
                        {homeworkError}
                      </p>
                      <Button variant="glass" onClick={() => void refetchHomework()}>
                        Retry
                      </Button>
                    </div>
                  ) : classHomework.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                      {classHomework.map((homework) => (
                        <HomeworkCard
                          key={homework.id}
                          homework={homework}
                          onClick={() => handleOpenHomeworkDetail(homework.id)}
                          onResetComplete={() => void refetchHomework()}
                        />
                      ))}
                    </div>
                  ) : (
                  <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8', background: 'rgba(255,255,255,0.3)', borderRadius: '1rem', border: '1px dashed #e2e8f0' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#475569', marginBottom: '0.5rem' }}>Homework Management</h3>
                    <p style={{ maxWidth: '450px', margin: '0 auto 1.5rem', fontSize: '0.9rem' }}>
                      View and manage homework assignments for this class. Create new homework from your materials library or view existing assignments.
                    </p>
                    <Button
                      variant="glass"
                      onClick={handleOpenHomeworkDashboard}
                    >
                      View All Homework →
                    </Button>
                  </div>
                  )}
                </div>

                <div hidden={activeTab !== 'activity'}>
                  <div style={{
                    margin: '3rem auto',
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#94a3b8',
                    maxWidth: '400px'
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏛️</div>
                    <h4 style={{ color: '#475569', fontWeight: 800, marginBottom: '0.5rem' }}>Activity History</h4>
                    <p style={{ fontSize: '0.9rem' }}>The full history of class activities, including logins and submission timelines, will be displayed here soon.</p>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {showSettingsModal && (
        <dialog
          className="class-settings-dialog"
          aria-labelledby="class-settings-title"
          ref={(dialog) => { if (dialog && !dialog.open) dialog.showModal(); }}
          onClose={() => setShowSettingsModal(false)}
          onClick={(event) => { if (event.target === event.currentTarget) setShowSettingsModal(false); }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <h2 id="class-settings-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0, fontSize: '1.25rem' }}>
              <IconSettings size={22} /> Class Settings
            </h2>
            <button type="button" className="class-detail-icon-button" aria-label="Close class settings" onClick={() => setShowSettingsModal(false)}>
              <IconX size={20} />
            </button>
          </div>
          <p style={{ color: '#64748b' }}>Settings editing implementation pending. You can update common class metadata in the main Class Management dashboard.</p>
        </dialog>
      )}

      <LinkCourseModal
        opened={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        classId={classId || ''}
        teacherId={user?.uid || ''}
        onSuccess={() => {
          loadLinkedCourses();
        }}
      />

      <ExtendCourseModal
        opened={extendModalOpen}
        onClose={() => setExtendModalOpen(false)}
        classCourseId={selectedLinkForExtend}
        onSuccess={() => loadLinkedCourses()}
      />

      {/* Edit Course Details modal for class instance copies */}
      <CourseCreateModal
        opened={isEditDetailsModalOpen}
        onClose={() => setIsEditDetailsModalOpen(false)}
        onSuccess={() => { setIsEditDetailsModalOpen(false); loadLinkedCourses(); }}
        courseToEdit={courseToEditDetails}
      />

      <HomeworkCreateModal
        isOpen={showHomeworkCreateModal}
        onClose={() => setShowHomeworkCreateModal(false)}
        onSuccess={() => {
          setShowHomeworkCreateModal(false);
          void refetchHomework();
        }}
        preselectedTarget={homeworkTarget}
      />

      <style>{`
            .class-detail-content > .vanilla-tabs { margin-bottom: 2rem; }
            .class-detail-table { width: 100%; border-collapse: collapse; text-align: left; }
            .class-detail-table th, .class-detail-table td { padding: 0.75rem; border-bottom: 1px solid #e2e8f0; }
            .class-detail-table tbody tr:nth-child(odd) { background: #f8fafc; }
            .class-detail-table tbody tr:hover { background: #f1f5f9; }
            .class-detail-badge { display: inline-flex; padding: 0.2rem 0.5rem; border-radius: 4px; background: #f1f5f9; font-size: 0.75rem; font-weight: 700; }
            .class-detail-icon-button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 0; border-radius: 4px; color: #4f46e5; background: #eef2ff; cursor: pointer; }
            .class-settings-dialog { box-sizing: border-box; width: min(480px, calc(100vw - 2rem)); padding: 1.5rem; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; }
            .class-settings-dialog::backdrop { background: rgb(15 23 42 / 40%); }

            @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes slideDown {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `}</style>
    </>
  );
};

export default TeacherClassDetailPage;
