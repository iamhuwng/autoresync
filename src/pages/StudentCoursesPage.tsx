import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { getEnrollmentsByStudent, unenrollStudent } from '../services/enrollmentManager';
import { getCourse, getMaterialsByCourse, getStudentCourseProgress } from '../services/courseManager';
import { getUserById } from '../services/userService';
import { getRequestsByStudent, cancelCourseRequest } from '../services/courseRequestManager';
import { toast } from '../components/modern/ToastNotification';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S, studentTokens } from '../components/layout/studentLayoutStyles';
import { useResolvedStudentHomeworkList, useResolvedStudentShellData } from '../context/StudentShellDataContext';
import type { CourseEnrollment, Course, CourseVisibility, CourseRequest } from '../types/course.types';

interface PopulatedEnrollment extends CourseEnrollment {
    course?: Course;
    teacherName?: string;
    progress?: number;
    visibility?: CourseVisibility;
}

interface StudentCoursesCacheEntry {
    enrollments: PopulatedEnrollment[];
    requests: CourseRequest[];
}

type StudentClassesOption = NonNullable<Parameters<typeof getEnrollmentsByStudent>[1]>['studentClasses'];

const studentCoursesCache = new Map<string, StudentCoursesCacheEntry>();

function getStudentCoursesCache(studentId?: string | null): StudentCoursesCacheEntry | null {
    if (!studentId) return null;
    return studentCoursesCache.get(studentId) ?? null;
}

async function fetchStudentCoursesData(
    studentId: string,
    studentClasses: StudentClassesOption = []
): Promise<StudentCoursesCacheEntry> {
    const [data, reqData] = await Promise.all([
        getEnrollmentsByStudent(studentId, { studentClasses }),
        getRequestsByStudent(studentId)
    ]);

    const teacherCache = new Map<string, string>();

    const populated = (await Promise.all(
        data.map(async (enrollment) => {
            const course = await getCourse(enrollment.courseId);
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

            const [materials, studentProgress] = await Promise.all([
                getMaterialsByCourse(enrollment.courseId),
                getStudentCourseProgress(studentId, enrollment.courseId)
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

    return {
        enrollments: populated,
        requests: reqData.filter(r => r.status === 'pending'),
    };
}

export async function preloadStudentCoursesPageData(
    studentId: string,
    studentClasses: StudentClassesOption = []
): Promise<StudentCoursesCacheEntry | null> {
    if (!studentId) return null;

    const cachedEntry = getStudentCoursesCache(studentId);
    if (cachedEntry) {
        return cachedEntry;
    }

    const nextEntry = await fetchStudentCoursesData(studentId, studentClasses);
    studentCoursesCache.set(studentId, nextEntry);
    return nextEntry;
}

const localStyles = {
    card: { background: studentTokens.bgSurface, borderRadius: 12, border: `1px solid ${studentTokens.borderWhisper}`, padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 16 },
    primaryBtn: { background: studentTokens.accent, color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const, width: '100%', transition: 'background 0.2s' },
    disabledBtn: { background: studentTokens.bgSurfaceAlt, color: studentTokens.textDim, border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'not-allowed', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const, width: '100%' },
    outlineBtn: { background: 'transparent', color: studentTokens.textBody, border: `1px solid ${studentTokens.borderSoft}`, borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const, width: '100%' },
    ghostBtnRed: { background: 'transparent', color: '#9e3f4e', border: '1px solid transparent', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const, width: '100%' },
    ghostBtnGray: { background: 'transparent', color: studentTokens.textMuted, border: '1px solid transparent', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const, width: '100%' },
    modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(12,15,16,0.24)', zIndex: 1000 },
    modalContent: { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: studentTokens.bgSurface, borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw', zIndex: 1001, boxShadow: '0 20px 60px rgba(43,52,55,0.12)' },
    loaderWrap: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2dfff', borderTopColor: studentTokens.accent, animation: 'studentSpinner 0.8s linear infinite' },
    progressTrack: { width: '100%', height: 6, borderRadius: 999, background: studentTokens.bgSurfaceAlt, overflow: 'hidden' as const },
    progressFill: { height: '100%', borderRadius: 999, background: studentTokens.accent, transition: 'width 0.2s ease-out' },
};

function showCourseToast(tone: 'success' | 'error' | 'info', title: string, message: string) {
    toast.show({ tone, title, message });
}

function InlineLoader({ label, size = 32 }: { label?: string; size?: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div
                aria-hidden="true"
                style={{
                    ...localStyles.loaderWrap,
                    width: size,
                    height: size,
                }}
            />
            {label ? <p style={{ color: studentTokens.textMuted, margin: 0 }}>{label}</p> : null}
        </div>
    );
}

function StatusBadge({
    children,
    tone = 'neutral',
    dot = false,
}: {
    children: React.ReactNode;
    tone?: 'success' | 'error' | 'info' | 'neutral';
    dot?: boolean;
}) {
    const palette = {
        success: { background: '#dcfce7', color: '#166534', dot: '#22c55e' },
        error: { background: '#fee2e2', color: '#b91c1c', dot: '#ef4444' },
        info: { background: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' },
        neutral: { background: studentTokens.bgSurfaceAlt, color: studentTokens.textBody, dot: studentTokens.textMuted },
    }[tone];

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: dot ? 6 : 0,
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: '0.75rem',
                fontWeight: 700,
                background: palette.background,
                color: palette.color,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
            }}
        >
            {dot ? (
                <span
                    aria-hidden="true"
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: palette.dot,
                    }}
                />
            ) : null}
            {children}
        </span>
    );
}

function ProgressBar({ value }: { value: number }) {
    const safeValue = Math.max(0, Math.min(100, value || 0));
    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={safeValue}
            style={localStyles.progressTrack}
        >
            <div style={{ ...localStyles.progressFill, width: `${safeValue}%` }} />
        </div>
    );
}

const StudentCoursesPage: React.FC = () => {
    const { user, profile } = useAuth();
    const { navigateTo } = useNavigation('student');
    const { notStarted } = useResolvedStudentHomeworkList(user?.uid || '');
    const { enrolledClasses } = useResolvedStudentShellData();
    const initialCacheEntry = getStudentCoursesCache(user?.uid);

    const [enrollments, setEnrollments] = useState<PopulatedEnrollment[]>(() => initialCacheEntry?.enrollments ?? []);
    const [requests, setRequests] = useState<CourseRequest[]>(() => initialCacheEntry?.requests ?? []);
    const [loading, setLoading] = useState(() => Boolean(user?.uid) && !initialCacheEntry);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string>('active');

    const [unenrollConfirm, setUnenrollConfirm] = useState<{ id: string, name: string, courseId: string } | null>(null);
    const [processing, setProcessing] = useState(false);
    const [cancelRequestConfirm, setCancelRequestConfirm] = useState<string | null>(null);

    useEffect(() => {
        if (user?.uid) {
            const cachedEntry = getStudentCoursesCache(user.uid);
            if (cachedEntry) {
                setEnrollments(cachedEntry.enrollments);
                setRequests(cachedEntry.requests);
                setLoading(false);
            }

            void loadEnrollments();
            return;
        }

        setEnrollments([]);
        setRequests([]);
        setLoading(false);
        setError(null);
    }, [enrolledClasses, user?.uid]);

    const loadEnrollments = async () => {
        if (!user?.uid) return;
        const cachedEntry = getStudentCoursesCache(user.uid);
        if (cachedEntry) {
            setEnrollments(cachedEntry.enrollments);
            setRequests(cachedEntry.requests);
        }

        setLoading(!cachedEntry);
        setError(null);
        try {
            const nextEntry = await fetchStudentCoursesData(user.uid, enrolledClasses);
            setEnrollments(nextEntry.enrollments);
            setRequests(nextEntry.requests);
            studentCoursesCache.set(user.uid, nextEntry);
        } catch (error) {
            console.error('Error loading student enrollments:', error);
            setError('Failed to load your courses. Please try again.');
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
                setRequests(prev => {
                    const nextRequests = prev.filter(r => r.id !== cancelRequestConfirm);
                    if (user?.uid) {
                        studentCoursesCache.set(user.uid, {
                            enrollments,
                            requests: nextRequests,
                        });
                    }
                    return nextRequests;
                });
                showCourseToast('success', 'Request Cancelled', 'Your course request has been cancelled');
            } else {
                showCourseToast('error', 'Error', res.error || 'Failed to cancel request');
            }
        } catch (err) {
            showCourseToast('error', 'Error', 'Failed to cancel request. Please try again.');
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
                showCourseToast('success', 'Successfully Unenrolled', `You have been unenrolled from "${unenrollConfirm.name}"`);
            } else {
                showCourseToast('error', 'Unenrollment Failed', res.error || 'Failed to unenroll from this course');
            }
        } catch (error) {
            console.error('Unenroll error:', error);
            showCourseToast('error', 'Error', 'Failed to unenroll. Please try again later.');
        } finally {
            setProcessing(false);
        }
    };

    const handleUnenrollRequest = (enrollment: PopulatedEnrollment) => {
        showCourseToast('info', 'Request Sent', `Your request to unenroll from "${enrollment.course?.name}" has been sent to the teacher/admin.`);
    };

    const getStatusTone = (status: string) => {
        switch (status) {
            case 'active': return 'success';
            case 'expired': return 'error';
            case 'archived': return 'neutral';
            default: return 'info';
        }
    };

    const renderContent = () => {
        const hasVisibleContent = enrollments.length > 0 || requests.length > 0;

        if (loading && !hasVisibleContent) {
            return (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <InlineLoader label="Loading your courses..." />
                </div>
            );
        }

        if (error && !hasVisibleContent) {
            return (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠️</div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 8px' }}>Unable to load courses</h2>
                    <p style={{ color: studentTokens.textMuted, fontSize: '1rem', margin: '0 0 24px' }}>{error}</p>
                    <button style={{ ...localStyles.primaryBtn, width: 'auto' }} onClick={() => void loadEnrollments()}>Try Again</button>
                </div>
            );
        }

        if (activeTab === 'pending') {
            if (requests.length === 0) {
                return (
                    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>⏳</div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 8px' }}>No pending requests</h2>
                        <p style={{ color: studentTokens.textMuted, fontSize: '1rem', margin: 0 }}>You have no outstanding enrollment or unenrollment requests.</p>
                    </div>
                );
            }

            return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, padding: 16, animation: 'dashFadeIn 0.3s ease-out' }}>
                    {requests.map(req => (
                        <div key={req.id} style={localStyles.card}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <span style={{ padding: '4px 10px', borderRadius: studentTokens.radiusSoft, fontSize: '0.75rem', fontWeight: 700, background: studentTokens.accentSoft, color: studentTokens.accentHover }}>
                                        {req.type === 'join' ? 'Enrollment' : 'Unenrollment'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: studentTokens.textMuted }}>
                                        Requested {new Date(req.requestedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 4px' }}>{req.courseName}</h3>
                                <p style={{ fontSize: '0.875rem', color: studentTokens.textMuted, margin: '0 0 4px' }}>Status: <strong>{req.status}</strong></p>
                                <p style={{ fontSize: '0.75rem', color: studentTokens.textDim, margin: 0 }}>Expires: {new Date(req.expiresAt).toLocaleDateString()}</p>
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
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 8px' }}>No courses found</h2>
                    <p style={{ color: studentTokens.textMuted, fontSize: '1rem', margin: '0 0 24px' }}>You haven't been enrolled in any {activeTab} courses yet.</p>
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
                            <StatusBadge tone={getStatusTone(enrollment.status)}>
                                {enrollment.status.toUpperCase()}
                            </StatusBadge>
                            {enrollment.expiresAt > 0 && (
                                <span style={{ fontSize: '0.75rem', color: studentTokens.textMuted }}>
                                    Expires: {new Date(enrollment.expiresAt).toLocaleDateString()}
                                </span>
                            )}
                        </div>

                        <div>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 4px' }}>
                                {enrollment.course?.originalName || enrollment.course?.name || 'Untitled Course'}
                            </h3>
                            <p style={{ fontSize: '0.875rem', color: studentTokens.textMuted, margin: 0 }}>by {enrollment.teacherName}</p>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: studentTokens.accent }}>Progress</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: studentTokens.accent }}>{enrollment.progress}%</span>
                            </div>
                            <ProgressBar value={enrollment.progress || 0} />
                        </div>

                        <div>
                            <StatusBadge tone="info" dot>
                                {enrollment.enrollmentType === 'class-based' ? 'Class Enrollment' : 'Individual'}
                            </StatusBadge>
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
            <style>{`
                @keyframes studentSpinner {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
            <div style={S.feedHeader}>
                <div style={S.feedHeaderText}>
                    <h2 style={S.feedHeaderTitle}>My Courses</h2>
                    <p style={S.feedHeaderSubtitle}>Manage active study paths, review pending approvals, and continue learning without switching shells.</p>
                </div>
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
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px', color: studentTokens.textPrimary }}>Confirm Unenrollment</h2>
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
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px', color: studentTokens.textPrimary }}>Cancel Course Request</h2>
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
