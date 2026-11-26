/**
 * TeacherStudentsPage
 *
 * Dedicated student management page for teachers.
 * Security: Teachers can ONLY see students assigned to them.
 * Separated from /admin/users for proper access control.
 *
 * Native HTML/CSS only (Rule 15 - no Mantine).
 *
 * @security This page enforces teacher-level access only.
 * @route /teacher/students
 */
import React, { useMemo, useState } from 'react';
import {
    IconUsers,
    IconSchool,
    IconUserPlus,
    IconRefresh,
    IconX,
} from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { useTeacherStudentRoster } from '../hooks/admin/useTeacherStudentRoster';
import { enrollStudent } from '../services/classManager';
import { createStudentRequest, removeAssignments } from '../services/assignmentManager';
import type { UserProfile } from '../services/userService';
import { TeacherHeader } from '../components/navigation';
import { StudentGrid } from '../components/admin/StudentGrid';
import { AddToClassModal } from '../components/assignment/AddToClassModal';
import { ReleaseStudentModal } from '../components/assignment/ReleaseStudentModal';
import { TeacherRequestModal } from '../components/assignment/TeacherRequestModal';
import { Card, CardBody, Button, VanillaLoader, toast } from '../components/modern';
import { SearchIcon } from '../components/modern/icons';
import './TeacherStudentsPage.css';

type TeacherStudentsTab = 'students' | 'requests';
type ClassFilterValue = 'all' | 'none' | string;

const formatRequestDate = (timestamp?: number): string => {
    if (!timestamp) return 'Recently requested';
    try {
        return new Date(timestamp).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return 'Recently requested';
    }
};

const TeacherStudentsPage: React.FC = () => {
    const { user, profile, loading: authLoading, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const { trackAction } = useFeatureTracking(FEATURE_IDS.teacherStudents);

    const isTeacher = profile?.role === 'teacher';
    const roster = useTeacherStudentRoster(isTeacher ? user?.uid : null);

    // UI state
    const [activeTab, setActiveTab] = useState<TeacherStudentsTab>('students');
    const [searchTerm, setSearchTerm] = useState('');
    const [classFilter, setClassFilter] = useState<ClassFilterValue>('all');

    // Modal state
    const [studentForClass, setStudentForClass] = useState<UserProfile | null>(null);
    const [studentToRelease, setStudentToRelease] = useState<UserProfile | null>(null);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

    const filteredStudents = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return roster.students.filter((student) => {
            const studentClasses = roster.classesByStudent[student.uid] || [];

            if (classFilter === 'none') {
                if (studentClasses.length > 0) return false;
            } else if (classFilter !== 'all') {
                if (!studentClasses.some((cls) => cls.id === classFilter)) return false;
            }

            if (!normalizedSearch) return true;

            const classText = studentClasses
                .map((cls) => `${cls.name} ${cls.classCode}`)
                .join(' ')
                .toLowerCase();

            return (
                (student.displayName || '').toLowerCase().includes(normalizedSearch) ||
                (student.email || '').toLowerCase().includes(normalizedSearch) ||
                ((student.studentGroup as string | undefined) || '').toLowerCase().includes(normalizedSearch) ||
                classText.includes(normalizedSearch)
            );
        });
    }, [roster.students, roster.classesByStudent, searchTerm, classFilter]);

    const selectedStudentEnrolledClassIds = useMemo(() => {
        if (!studentForClass) return [];
        return (roster.classesByStudent[studentForClass.uid] || []).map((cls) => cls.id);
    }, [studentForClass, roster.classesByStudent]);

    const hasActiveFilters = searchTerm.trim().length > 0 || classFilter !== 'all';

    // ============================================================================
    // HANDLERS
    // ============================================================================
    const handleLogout = async () => {
        await logout();
        navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
    };

    const handleSwitchTab = (tab: TeacherStudentsTab) => {
        setActiveTab(tab);
        trackAction('switchStudentsTab', { tab });
    };

    const handleSync = async () => {
        trackAction('syncStudents', { tab: activeTab });
        await roster.reload();
    };

    const handleClassFilterChange = (value: ClassFilterValue) => {
        setClassFilter(value);
        trackAction('filterStudentsByClass', { classFilter: value });
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        trackAction('clearStudentSearch');
    };

    const handleClearFilters = () => {
        setSearchTerm('');
        setClassFilter('all');
        trackAction('clearStudentFilters');
    };

    const handleViewAnalytics = (studentId: string) => {
        trackAction('openStudentAnalytics', { studentId });
        navigateTo('TEACHER_STUDENT_HISTORY', { studentId }, { reason: 'view_student_history' });
    };

    const handleOpenAddToClass = (student: UserProfile) => {
        trackAction('openAddToClassModal', { studentId: student.uid });
        setStudentForClass(student);
    };

    const handleOpenRelease = (student: UserProfile) => {
        trackAction('openReleaseStudentModal', { studentId: student.uid });
        setStudentToRelease(student);
    };

    const handleOpenRequestModal = () => {
        trackAction('openRequestStudentModal');
        setIsRequestModalOpen(true);
    };

    const handleConfirmAddToClass = async (classId: string) => {
        if (!studentForClass) return;
        const student = studentForClass;
        const studentLabel = student.displayName || student.email || 'Student';
        const targetClass = roster.classes.find((cls) => cls.id === classId);

        const result = await enrollStudent(
            classId,
            student.uid,
            studentLabel,
            student.email,
            { approvalMode: 'active' }
        );

        if (!result.success) {
            const message = result.error || 'Could not add student to class.';
            toast.error(message);
            throw new Error(message);
        }

        trackAction('addStudentToClass', { studentId: student.uid, classId });
        toast.success(
            targetClass
                ? `Added ${studentLabel} to ${targetClass.name}.`
                : `Added ${studentLabel} to class.`
        );
        await roster.reloadClasses();
    };

    const handleConfirmRelease = async (assignmentIds: string[]) => {
        if (!studentToRelease) return;
        const student = studentToRelease;
        const studentLabel = student.displayName || student.email || 'Student';

        const result = await removeAssignments(assignmentIds, 'Released by teacher');
        const succeededCount = result.releasedIds.length;
        const failureMessages = result.failed.map(
            (item) => item.error || 'Failed to release assignment.'
        );

        if (succeededCount > 0) {
            await roster.reload();
        }

        if (failureMessages.length > 0 || !result.success) {
            const failedCount = Math.max(failureMessages.length, assignmentIds.length - succeededCount);
            const firstError = failureMessages[0] || `Failed to release ${failedCount} assignment(s).`;
            const message = succeededCount > 0
                ? `Released ${succeededCount} of ${assignmentIds.length} assignments for ${studentLabel}, but ${failedCount} failed: ${firstError}`
                : firstError;
            if (succeededCount > 0) {
                trackAction('releaseStudent', {
                    studentId: student.uid,
                    assignmentCount: assignmentIds.length,
                    releasedCount: succeededCount,
                    failedCount,
                });
            }
            toast.error(message);
            throw new Error(message);
        }

        trackAction('releaseStudent', {
            studentId: student.uid,
            assignmentCount: assignmentIds.length,
        });
        toast.success(`Released ${studentLabel} from your oversight.`);
    };

    const handleRequestStudent = async (email: string) => {
        if (!user?.uid) {
            const message = 'No teacher account is signed in.';
            toast.error(message);
            throw new Error(message);
        }

        const normalizedEmail = email.trim().toLowerCase();
        const result = await createStudentRequest(user.uid, normalizedEmail);
        if (!result.success) {
            const message = result.error || 'Could not submit student request.';
            toast.error(message);
            throw new Error(message);
        }

        trackAction('requestStudent', { studentEmail: normalizedEmail });
        toast.success(`Requested access to ${normalizedEmail}. Pending admin approval.`);
        await roster.reloadRequests();
    };

    // ============================================================================
    // RENDER
    // ============================================================================
    if (authLoading) {
        return (
            <div className="teacher-students-shell">
                <main className="teacher-students-main">
                    <div className="teacher-students-loading" role="status" aria-live="polite">
                        <VanillaLoader size="lg" />
                        <span>Loading your students...</span>
                    </div>
                </main>
            </div>
        );
    }

    if (!isTeacher) {
        return (
            <div className="teacher-students-denied">
                <div className="teacher-students-denied__card">
                    <h1 className="teacher-students-denied__title">Access Denied</h1>
                    <p className="teacher-students-denied__text">This page is for teachers only.</p>
                    <p className="teacher-students-denied__hint">
                        Super admins: Please use Admin Console &rarr; Users.
                    </p>
                    <Button
                        variant="primary"
                        onClick={() => navigateTo('LOGIN', {}, { replace: true })}
                    >
                        Go to Login
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="teacher-students-shell">
            {/* Shared Teacher Header attached directly to the viewport edge */}
            <TeacherHeader
                pageTitle="Students"
                userId={user?.uid}
                userRole={profile?.role}
                userDisplayName={profile?.displayName || user?.displayName || user?.email}
                userEmail={profile?.email || user?.email}
                userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                onLogout={handleLogout}
            />

            <main className="teacher-students-main">
                {/* Page Title & Live Stats */}
                <header className="teacher-students-header">
                    <div className="teacher-students-heading">
                        <h1 className="teacher-students-title">My Students</h1>
                        <p className="teacher-students-subtitle">
                            Manage your assigned students, classes, and progress
                        </p>
                    </div>

                    <div className="teacher-students-stats" aria-label="Student roster summary">
                        <div className="teacher-students-stat">
                            <span className="teacher-students-stat__icon teacher-students-stat__icon--indigo" aria-hidden="true">
                                <IconUsers size={22} />
                            </span>
                            <div>
                                <span className="teacher-students-stat__label">Active Students</span>
                                <span className="teacher-students-stat__value" data-testid="stat-active-students">
                                    {roster.students.length}
                                </span>
                            </div>
                        </div>

                        <div className="teacher-students-stat">
                            <span className="teacher-students-stat__icon teacher-students-stat__icon--teal" aria-hidden="true">
                                <IconSchool size={22} />
                            </span>
                            <div>
                                <span className="teacher-students-stat__label">Active Classes</span>
                                <span className="teacher-students-stat__value" data-testid="stat-active-classes">
                                    {roster.classOptions.length}
                                </span>
                            </div>
                        </div>

                        <div className="teacher-students-stat">
                            <span className="teacher-students-stat__icon teacher-students-stat__icon--amber" aria-hidden="true">
                                <IconUserPlus size={22} />
                            </span>
                            <div>
                                <span className="teacher-students-stat__label">Pending Requests</span>
                                <span className="teacher-students-stat__value" data-testid="stat-pending-requests">
                                    {roster.pendingRequestCount}
                                </span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Native Section Tabs */}
                <div className="teacher-students-tabs" role="tablist" aria-label="Student views">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'students'}
                        className={`teacher-students-tab${activeTab === 'students' ? ' is-active' : ''}`}
                        onClick={() => handleSwitchTab('students')}
                    >
                        <IconUsers size={16} aria-hidden="true" />
                        Students
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'requests'}
                        className={`teacher-students-tab${activeTab === 'requests' ? ' is-active' : ''}`}
                        onClick={() => handleSwitchTab('requests')}
                    >
                        <IconUserPlus size={16} aria-hidden="true" />
                        My Requests
                        {roster.pendingRequestCount > 0 && (
                            <span className="teacher-students-tab__badge">{roster.pendingRequestCount}</span>
                        )}
                    </button>
                </div>

                {/* Toolbar */}
                <Card variant="glass" className="teacher-students-toolbar">
                    <CardBody>
                        <div className="teacher-students-toolbar__row">
                            {activeTab === 'students' && (
                                <>
                                    <div className="teacher-students-search">
                                        <span className="teacher-students-search__icon" aria-hidden="true">
                                            <SearchIcon size={16} />
                                        </span>
                                        <input
                                            type="search"
                                            className="teacher-students-search__input"
                                            aria-label="Search students"
                                            placeholder="Search students by name, email, or class..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        {searchTerm && (
                                            <button
                                                type="button"
                                                className="teacher-students-search__clear"
                                                onClick={handleClearSearch}
                                                aria-label="Clear search"
                                            >
                                                <IconX size={15} aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="teacher-students-filter">
                                        <select
                                            aria-label="Filter by class"
                                            className="teacher-students-filter__select"
                                            value={classFilter}
                                            onChange={(e) => handleClassFilterChange(e.target.value)}
                                        >
                                            <option value="all">All Classes</option>
                                            {roster.classOptions.map((cls) => (
                                                <option key={cls.value} value={cls.value}>
                                                    {cls.label}
                                                </option>
                                            ))}
                                            <option value="none">Not in a Class</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            <div className="teacher-students-toolbar__actions" style={activeTab === 'requests' ? { marginLeft: 'auto' } : undefined}>
                                <Button variant="primary" onClick={handleOpenRequestModal}>
                                    <IconUserPlus size={16} aria-hidden="true" />
                                    Add Student
                                </Button>

                                <Button
                                    variant="glass"
                                    onClick={handleSync}
                                    disabled={roster.loading || roster.refreshing}
                                >
                                    <IconRefresh
                                        size={16}
                                        aria-hidden="true"
                                        className={roster.refreshing ? 'teacher-students-spin' : undefined}
                                    />
                                    {roster.refreshing ? 'Syncing...' : 'Sync'}
                                </Button>
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {/* Main Content Panel */}
                <Card variant="glass" className="teacher-students-panel">
                    <CardBody>
                        {activeTab === 'students' && roster.error && (
                            <div className="teacher-students-error" role="alert">
                                <span>{roster.error}</span>
                                <Button variant="outline" size="sm" onClick={handleSync}>
                                    Retry
                                </Button>
                            </div>
                        )}

                        {activeTab === 'students' && roster.classesError && (
                            <div className="teacher-students-error" role="alert">
                                <span>{roster.classesError}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        void roster.reloadClasses();
                                    }}
                                >
                                    Retry classes
                                </Button>
                            </div>
                        )}

                        {activeTab === 'requests' && roster.requestsError && (
                            <div className="teacher-students-error" role="alert">
                                <span>{roster.requestsError}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        void roster.reloadRequests();
                                    }}
                                >
                                    Retry requests
                                </Button>
                            </div>
                        )}

                        {activeTab === 'students' ? (
                            roster.loading ? (
                                <div className="teacher-students-loading" role="status" aria-live="polite">
                                    <VanillaLoader size="lg" />
                                    <span>Loading your students...</span>
                                </div>
                            ) : roster.students.length === 0 ? (
                                roster.error ? null : (
                                    <div className="teacher-students-empty">
                                        <div className="teacher-students-empty__icon" aria-hidden="true">
                                            <IconUsers size={28} />
                                        </div>
                                        <h2 className="teacher-students-empty__title">No students assigned yet</h2>
                                        <p className="teacher-students-empty__desc">
                                            Request access to a student by email to start managing their classes and tracking progress.
                                        </p>
                                        <div className="teacher-students-empty__actions">
                                            <Button variant="primary" onClick={handleOpenRequestModal}>
                                                <IconUserPlus size={16} aria-hidden="true" />
                                                Add Student
                                            </Button>
                                        </div>
                                    </div>
                                )
                            ) : filteredStudents.length === 0 ? (
                                <div className="teacher-students-empty">
                                    <div className="teacher-students-empty__icon" aria-hidden="true">
                                        <IconUsers size={28} />
                                    </div>
                                    <h2 className="teacher-students-empty__title">No students match your filter</h2>
                                    <p className="teacher-students-empty__desc">
                                        Try adjusting your search query or switching the class filter.
                                    </p>
                                    <div className="teacher-students-empty__actions">
                                        {hasActiveFilters && (
                                            <Button
                                                variant="glass"
                                                onClick={handleClearFilters}
                                            >
                                                Clear Filters
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="teacher-students-summary">
                                        <span>
                                            Showing <strong>{filteredStudents.length}</strong> of{' '}
                                            <strong>{roster.students.length}</strong>{' '}
                                            {roster.students.length === 1 ? 'student' : 'students'}
                                        </span>
                                        {hasActiveFilters && (
                                            <Button
                                                variant="glass"
                                                size="xs"
                                                onClick={handleClearFilters}
                                            >
                                                Clear Filters
                                            </Button>
                                        )}
                                    </div>

                                    <StudentGrid
                                        students={filteredStudents}
                                        assignments={roster.assignmentsByStudent}
                                        teachers={[]}
                                        classesByStudent={roster.classesByStudent}
                                        currentUserId={user?.uid || null}
                                        onViewAnalytics={handleViewAnalytics}
                                        onAddToClass={handleOpenAddToClass}
                                        onRelease={handleOpenRelease}
                                        isTeacher
                                    />
                                </>
                            )
                        ) : roster.requests.length === 0 ? (
                            roster.requestsError ? null : (
                                <div className="teacher-students-empty">
                                    <div className="teacher-students-empty__icon" aria-hidden="true">
                                        <IconUserPlus size={28} />
                                    </div>
                                    <h2 className="teacher-students-empty__title">No student requests yet</h2>
                                    <p className="teacher-students-empty__desc">
                                        When you request access to a student, the request status will appear here until an administrator reviews it.
                                    </p>
                                    <div className="teacher-students-empty__actions">
                                        <Button variant="primary" onClick={handleOpenRequestModal}>
                                            <IconUserPlus size={16} aria-hidden="true" />
                                            Add Student
                                        </Button>
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="teacher-requests-list" aria-label="Submitted student requests">
                                {roster.requests.map((request) => (
                                    <div key={request.id} className="teacher-request-row">
                                        <div>
                                            <p className="teacher-request-row__email">{request.studentEmail}</p>
                                            <p className="teacher-request-row__meta">
                                                Requested {formatRequestDate(request.requestedAt)}
                                            </p>
                                        </div>
                                        <span className={`teacher-request-status teacher-request-status--${request.status}`}>
                                            {request.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardBody>
                </Card>
            </main>

            {/* Native Modals */}
            <AddToClassModal
                opened={Boolean(studentForClass)}
                onClose={() => setStudentForClass(null)}
                student={studentForClass}
                classes={roster.classOptions}
                enrolledClassIds={selectedStudentEnrolledClassIds}
                onConfirm={handleConfirmAddToClass}
            />

            <ReleaseStudentModal
                opened={Boolean(studentToRelease)}
                onClose={() => setStudentToRelease(null)}
                student={studentToRelease}
                assignments={studentToRelease ? (roster.assignmentsByStudent[studentToRelease.uid] || []) : []}
                currentTeacherId={user?.uid || null}
                onConfirm={handleConfirmRelease}
            />

            <TeacherRequestModal
                opened={isRequestModalOpen}
                onClose={() => setIsRequestModalOpen(false)}
                onSubmit={handleRequestStudent}
            />
        </div>
    );
};

export default TeacherStudentsPage;
