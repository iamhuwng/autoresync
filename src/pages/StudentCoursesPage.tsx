import React, { useState, useEffect } from 'react';
import { Badge, Progress, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { getEnrollmentsByStudent, unenrollStudent } from '../services/enrollmentManager';
import { getCourse, getMaterialsByCourse, getStudentCourseProgress } from '../services/courseManager';
import { getUserById } from '../services/userService';
import { getRequestsByStudent, cancelCourseRequest } from '../services/courseRequestManager';
import { useStudentHomeworkList } from '../hooks/useHomeworkSubmission';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S } from '../components/layout/studentLayoutStyles';
import type { CourseEnrollment, Course, CourseVisibility, CourseRequest } from '../types/course.types';

interface PopulatedEnrollment extends CourseEnrollment {
    course?: Course;
    teacherName?: string;
    progress?: number;
    visibility?: CourseVisibility;
}

const localStyles = {
    card: { background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 16 },
    primaryBtn: { background: '#4f46e5', color: 'white', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', width: '100%', transition: 'background 0.2s' },
    disabledBtn: { background: '#f3f4f6', color: '#9ca3af', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'not-allowed', fontSize: '0.875rem', width: '100%' },
    outlineBtn: { background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', width: '100%' },
    ghostBtnRed: { background: 'transparent', color: '#ef4444', border: '1px solid transparent', borderRadius: 999, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', width: '100%' },
    ghostBtnGray: { background: 'transparent', color: '#6b7280', border: '1px solid transparent', borderRadius: 999, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', width: '100%' },
    modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000 },
    modalContent: { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw', zIndex: 1001, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }
};

const StudentCoursesPage: React.FC = () => {
    const { user, profile } = useAuth();
    const { navigateTo } = useNavigation('student');
    const { notStarted } = useStudentHomeworkList(user?.uid || '');

    const [enrollments, setEnrollments] = useState<PopulatedEnrollment[]>([]);
    const [requests, setRequests] = useState<CourseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<string>('active');

    const [unenrollConfirm, setUnenrollConfirm] = useState<{ id: string, name: string, courseId: string } | null>(null);
    const [processing, setProcessing] = useState(false);
    const [cancelRequestConfirm, setCancelRequestConfirm] = useState<string | null>(null);

    useEffect(() => {
        if (user?.uid) {
            loadEnrollments();
        }
    }, [user]);

    const loadEnrollments = async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            // Fetch enrollments and requests in parallel
            const [data, reqData] = await Promise.all([
                getEnrollmentsByStudent(user.uid),
                getRequestsByStudent(user.uid)
            ]);

            // Cache teacher lookups to avoid duplicate calls for same ownerId
            const teacherCache = new Map<string, string>();

            const populated = (await Promise.all(
                data.map(async (enrollment) => {
                    const course = await getCourse(enrollment.courseId);
                    // Skip phantom enrollments where the course was deleted
                    if (!course) return null;

                    let teacherName = 'Unknown Teacher';
                    if (course.ownerId) {
                        if (teacherCache.has(course.ownerId)) {
                            teacherName = teacherCache.get(course.ownerId)!;
                        } else {
                            const teacher = await getUserById(course.ownerId);
                            teacherName = teacher?.displayName || teacher?.email || 'Unknown Teacher';
                            teacherCache.set(course.ownerId, teacherName);
                        }
                    }

                    // Calculate progress
                    const [materials, studentProgress] = await Promise.all([
                        getMaterialsByCourse(enrollment.courseId),
                        getStudentCourseProgress(user.uid, enrollment.courseId)
                    ]);

                    let progress = 0;
                    if (materials.length > 0 && studentProgress?.completedMaterials) {
                        const completedCount = Object.keys(studentProgress.completedMaterials).length;
                        progress = Math.round((completedCount / materials.length) * 100);
                    }

                    return {
                        ...enrollment,
                        course,
                        teacherName,
                        progress,
                        visibility: course.visibility || 'private'
                    };
                })
            )).filter(Boolean) as PopulatedEnrollment[];

            setEnrollments(populated);
            setRequests(reqData.filter(r => r.status === 'pending'));
        } catch (error) {
            console.error('Error loading student enrollments:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelRequest = (requestId: string) => {
        setCancelRequestConfirm(requestId);
    };

    const confirmCancelRequest = async () => {
        if (!cancelRequestConfirm) return;
        try {
            const res = await cancelCourseRequest(cancelRequestConfirm);
            if (res.success) {
                setRequests(prev => prev.filter(r => r.id !== cancelRequestConfirm));
                notifications.show({
                    title: 'Request Cancelled',
                    message: 'Your course request has been cancelled',
                    color: 'green',
                });
            } else {
                notifications.show({
                    title: 'Error',
                    message: res.error || 'Failed to cancel request',
                    color: 'red',
                });
            }
        } catch (err) {
            notifications.show({
                title: 'Error',
                message: 'Failed to cancel request. Please try again.',
                color: 'red',
            });
        } finally {
            setCancelRequestConfirm(null);
        }
    };

    const filteredEnrollments = enrollments.filter(e => {
        if (activeTab === 'all') return !e.course?.archivedAt;
        if (activeTab === 'active') return e.status === 'active' && !e.course?.archivedAt;
        if (activeTab === 'expired') return e.status === 'expired' && !e.course?.archivedAt;
        if (activeTab === 'archived') return !!e.course?.archivedAt;
        return true;
    });

    const handleUnenroll = async () => {
        if (!user?.uid || !unenrollConfirm) return;
        setProcessing(true);
        try {
            const res = await unenrollStudent(user.uid, unenrollConfirm.courseId);
            if (res.success) {
                setUnenrollConfirm(null);
                loadEnrollments();
                notifications.show({
                    title: 'Successfully Unenrolled',
                    message: `You have been unenrolled from "${unenrollConfirm.name}"`,
                    color: 'green',
                });
            } else {
                notifications.show({
                    title: 'Unenrollment Failed',
                    message: res.error || 'Failed to unenroll from this course',
                    color: 'red',
                });
            }
        } catch (error) {
            console.error('Unenroll error:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to unenroll. Please try again later.',
                color: 'red',
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleUnenrollRequest = (enrollment: PopulatedEnrollment) => {
        notifications.show({
            title: 'Request Sent',
            message: `Your request to unenroll from "${enrollment.course?.name}" has been sent to the teacher/admin.`,
            color: 'blue',
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'green';
            case 'expired': return 'red';
            case 'archived': return 'gray';
            default: return 'blue';
        }
    };

    const renderContent = () => {
        if (loading) {
            return (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <Loader size="md" color="#4f46e5" />
                    <p style={{ color: '#6b7280', marginTop: 16 }}>Loading your courses...</p>
                </div>
            );
        }

        if (activeTab === 'pending') {
            if (requests.length === 0) {
                return (
                    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>⏳</div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>No pending requests</h2>
                        <p style={{ color: '#6b7280', fontSize: '1rem', margin: 0 }}>You have no outstanding enrollment or unenrollment requests.</p>
                    </div>
                );
            }

            return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, padding: 16, animation: 'dashFadeIn 0.3s ease-out' }}>
                    {requests.map(req => (
                        <div key={req.id} style={localStyles.card}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, background: '#dbeafe', color: '#1e40af' }}>
                                        {req.type === 'join' ? 'Enrollment' : 'Unenrollment'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                        Requested {new Date(req.requestedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>{req.courseName}</h3>
                                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 4px' }}>Status: <strong>{req.status}</strong></p>
                                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Expires: {new Date(req.expiresAt).toLocaleDateString()}</p>
                            </div>
                            <div style={{ marginTop: 'auto' }}>
                                <button
                                    style={localStyles.ghostBtnRed}
                                    onClick={() => handleCancelRequest(req.id)}
                                >
                                    Cancel Request
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        if (filteredEnrollments.length === 0) {
            return (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 16 }}>📚</div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>No courses found</h2>
                    <p style={{ color: '#6b7280', fontSize: '1rem', margin: '0 0 24px' }}>You haven't been enrolled in any {activeTab} courses yet.</p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                        <button style={{ ...localStyles.primaryBtn, width: 'auto' }} onClick={() => navigateTo('STUDENT_COURSE_CATALOG')}>Browse Course Catalog</button>
                    </div>
                </div>
            );
        }

        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, padding: 16, animation: 'dashFadeIn 0.3s ease-out' }}>
                {filteredEnrollments.map((enrollment) => (
                    <div key={enrollment.id} style={localStyles.card} onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'} onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Badge color={getStatusColor(enrollment.status)} variant="light">
                                {enrollment.status.toUpperCase()}
                            </Badge>
                            {enrollment.expiresAt > 0 && (
                                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                    Expires: {new Date(enrollment.expiresAt).toLocaleDateString()}
                                </span>
                            )}
                        </div>

                        <div>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
                                {enrollment.course?.originalName || enrollment.course?.name || 'Untitled Course'}
                            </h3>
                            <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>by {enrollment.teacherName}</p>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5' }}>Progress</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5' }}>{enrollment.progress}%</span>
                            </div>
                            <Progress value={enrollment.progress || 0} size="sm" radius="xl" color="#4f46e5" style={{ background: '#f3f4f6' }} />
                        </div>

                        <div>
                            <Badge variant="dot" color="blue" size="sm">
                                {enrollment.enrollmentType === 'class-based' ? 'Class Enrollment' : 'Individual'}
                            </Badge>
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button
                                style={enrollment.status === 'expired' ? localStyles.disabledBtn : localStyles.primaryBtn}
                                disabled={enrollment.status === 'expired'}
                                onClick={() => navigateTo('STUDENT_COURSE_DETAIL', { courseId: enrollment.courseId })}
                            >
                                {enrollment.status === 'expired' ? 'Course Expired' : 'Continue Learning'}
                            </button>

                            {enrollment.status !== 'expired' && enrollment.visibility !== 'private' && (
                                <button
                                    style={enrollment.visibility === 'public' ? localStyles.ghostBtnRed : localStyles.ghostBtnGray}
                                    onClick={() => {
                                        if (enrollment.visibility === 'public') {
                                            setUnenrollConfirm({
                                                id: enrollment.id,
                                                name: enrollment.course?.name || 'this course',
                                                courseId: enrollment.courseId
                                            });
                                        } else {
                                            handleUnenrollRequest(enrollment);
                                        }
                                    }}
                                >
                                    {enrollment.visibility === 'public' ? 'Unenroll' : 'Request Unenroll'}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <StudentLayout
            mobileTitle="My Courses"
            sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />}
        >
            <div style={S.feedHeader}>
                <h2 style={S.feedHeaderTitle}>My Courses</h2>
            </div>

            <div style={S.filterBar}>
                <button
                    onClick={() => setActiveTab('active')}
                    style={{ ...S.filterTab, ...(activeTab === 'active' ? S.filterTabActive : {}) }}
                >
                    Active
                </button>
                <button
                    onClick={() => setActiveTab('expired')}
                    style={{ ...S.filterTab, ...(activeTab === 'expired' ? S.filterTabActive : {}) }}
                >
                    Expired
                </button>
                <button
                    onClick={() => setActiveTab('pending')}
                    style={{ ...S.filterTab, ...(activeTab === 'pending' ? S.filterTabActive : {}) }}
                >
                    Pending ({requests.length})
                </button>
                <button
                    onClick={() => setActiveTab('all')}
                    style={{ ...S.filterTab, ...(activeTab === 'all' ? S.filterTabActive : {}) }}
                >
                    All Courses
                </button>
            </div>

            {renderContent()}

            {unenrollConfirm && (
                <>
                    <div style={localStyles.modalOverlay} onClick={() => !processing && setUnenrollConfirm(null)} />
                    <div style={localStyles.modalContent}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px', color: '#111827' }}>Confirm Unenrollment</h2>
                        <p style={{ fontSize: '0.938rem', color: '#374151', margin: '0 0 24px', lineHeight: 1.5 }}>
                            Are you sure you want to unenroll from <strong>{unenrollConfirm.name}</strong>?
                            This will remove your access to all materials and modules in this course.
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                            <button style={{ ...localStyles.outlineBtn, width: 'auto' }} onClick={() => setUnenrollConfirm(null)} disabled={processing}>Cancel</button>
                            <button style={{ ...localStyles.primaryBtn, width: 'auto', background: '#ef4444' }} onClick={handleUnenroll} disabled={processing}>
                                {processing ? 'Processing...' : 'Confirm Unenroll'}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {cancelRequestConfirm && (
                <>
                    <div style={localStyles.modalOverlay} onClick={() => setCancelRequestConfirm(null)} />
                    <div style={localStyles.modalContent}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px', color: '#111827' }}>Cancel Course Request</h2>
                        <p style={{ fontSize: '0.938rem', color: '#374151', margin: '0 0 24px', lineHeight: 1.5 }}>
                            Are you sure you want to cancel your course enrollment request?
                            You can always request enrollment again later.
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                            <button style={{ ...localStyles.outlineBtn, width: 'auto' }} onClick={() => setCancelRequestConfirm(null)}>Keep Request</button>
                            <button style={{ ...localStyles.primaryBtn, width: 'auto', background: '#ef4444' }} onClick={confirmCancelRequest}>Cancel Request</button>
                        </div>
                    </div>
                </>
            )}
        </StudentLayout>
    );
};

export default StudentCoursesPage;
