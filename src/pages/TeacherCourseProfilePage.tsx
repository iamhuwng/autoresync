

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TeacherHeader } from '../components/navigation';
import { VanillaLoader } from '../components/modern/VanillaLoader';
import { RichContent } from '../core/components/RichContent';
import {
    IconArrowLeft,
    IconUsers,
    IconSettings,
    IconList,
    IconInbox,
    IconShieldCheck,
    IconSpeakerphone,
    IconPlus,
    IconExternalLink,
    IconClock
} from '@tabler/icons-react';
import { getCourse, updateCourse } from '../services/courseManager';
import { getClasses } from '../services/classManager';
import { createCourseAnnouncement, getCourseAnnouncements, CourseAnnouncement } from '../services/courseAnnouncementService';
import type { Course, Module } from '../types/course.types';
import { ModuleList } from '../components/course/ModuleList';
import { RequestReviewList } from '../components/course/RequestReviewList';
import CourseAnnouncementEditor from '../components/course/CourseAnnouncementEditor';
import { ModuleSessionModal } from '../components/session/ModuleSessionModal';
import { PracticeSettingsModal } from '../components/PracticeSettingsModal';
import { useAuth } from '../hooks/useAuth';
import { toast } from '../components/modern/ToastNotification';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import './TeacherCourseProfilePage.css';

// Modern Components
import { Card, CardBody, Button } from '../components/modern';

const TeacherCourseProfilePage = () => {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();

    const { user, profile } = useAuth();
    const { trackAction } = useFeatureTracking(FEATURE_IDS.courses);
    const [course, setCourse] = useState<Course | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string | null>('modules');

    // Announcement State
    const [announcements, setAnnouncements] = useState<CourseAnnouncement[]>([]);
    const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
    const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false);
    const [isSubmittingAnnouncement, setIsSubmittingAnnouncement] = useState(false);

    // Session Modal State
    const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
    const [selectedModule, setSelectedModule] = useState<Module | null>(null);

    useEffect(() => {
        const loadCourseData = async () => {
            if (!courseId || !user?.uid) return;
            try {
                // Super admins see ALL classes, teachers see only their own
                const filterTeacherId = profile?.role === 'super_admin' ? undefined : user.uid;

                const [fetchedCourse, fetchedAnnouncements, fetchedClasses] = await Promise.all([
                    getCourse(courseId),
                    getCourseAnnouncements(courseId),
                    getClasses(filterTeacherId)
                ]);

                if (!fetchedCourse) {
                    setError('Course not found');
                } else {
                    setCourse(fetchedCourse as Course);
                }

                setAnnouncements(fetchedAnnouncements);
                // Null safety for class names
                setClasses(fetchedClasses.map((c: any) => ({
                    id: c.id,
                    name: c.name || 'Unnamed Class'
                })));

            } catch (err) {
                console.error(err);
                setError('Failed to load course data');
            } finally {
                setLoading(false);
            }
        };
        loadCourseData();
    }, [courseId, user?.uid, profile]);

    const handleCreateAnnouncement = async (data: { title: string; content: string; attachments: any[]; targetClassIds: string[] }) => {
        if (!course || !user?.uid) return;

        trackAction('addAnnouncement', { courseId: course.id });
        setIsSubmittingAnnouncement(true);
        try {
            const result = await createCourseAnnouncement({
                courseId: course.id,
                courseName: course.name,
                teacherId: user.uid,
                teacherName: user.displayName || 'Teacher',
                title: data.title,
                content: data.content,
                attachments: data.attachments,
                targetClassIds: data.targetClassIds
            });

            if (result.success) {
                toast.success('Announcement posted.');
                void result.deliveryPromise?.then((delivery) => {
                    if (delivery.delivered > 0 && delivery.failed + delivery.unknown + delivery.unattempted === 0) {
                        toast.info(`${delivery.delivered} student notifications sent.`);
                    } else if (delivery.delivered > 0) {
                        toast.warning(`${delivery.delivered} notifications sent; ${delivery.failed + delivery.unknown + delivery.unattempted} others were not confirmed.`);
                    } else if (delivery.status === 'skipped' && delivery.unattempted === 0) {
                        toast.info('No eligible enrolled students to notify.');
                    } else {
                        toast.warning('Notification delivery could not be confirmed.');
                    }
                }).catch(() => toast.warning('Notification delivery could not be confirmed.'));
                setIsCreatingAnnouncement(false);
                // Refresh list
                const updated = await getCourseAnnouncements(course.id);
                setAnnouncements(updated);
            } else {
                throw new Error(result.error);
            }
        } catch (err: any) {
            toast.error(err.message || 'Could not post announcement.');
        } finally {
            setIsSubmittingAnnouncement(false);
        }
    };

    const handleBack = () => {
        navigate('/teacher/courses');
    };

    const handleStartSession = (module: Module) => {
        setSelectedModule(module);
        setIsSessionModalOpen(true);
    };

    const handleSessionModalClose = () => {
        setIsSessionModalOpen(false);
        setSelectedModule(null);
    };

    const handleLogout = async () => {
        navigate('/login', { replace: true });
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
                <span role="status" aria-label="Loading course"><VanillaLoader size="xl" /></span>
            </div>
        );
    }

    if (error || !course) {
        return (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
                <div role="alert" style={{ maxWidth: '500px', margin: '0 auto' }}>
                    {error || 'Course not found'}
                </div>
                <Button variant="glass" mt="xl" onClick={handleBack}>
                    <IconArrowLeft size={16} /> Back to Courses
                </Button>
            </div>
        );
    }

    return (
        <>
            <TeacherHeader
                pageTitle={course.name}
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
                    {/* Course Code Badge */}
                    <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span className="course-badge">
                            {course.visibility.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>CODE:</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', color: '#4f46e5', background: 'rgba(99, 102, 241, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '0.5rem' }}>
                            {course.code}
                        </span>
                        <span style={{ margin: '0 0.25rem', opacity: 0.3 }}>|</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>TYPE:</span>
                        <span className="course-badge">
                            {course.type.toUpperCase()}
                        </span>
                    </div>

                    {/* Course Overview Card (Glass) */}
                    <Card
                        variant="glass"
                        style={{
                            marginBottom: '2rem',
                            animation: 'slideDown 0.5s ease-out'
                        }}
                    >
                        <CardBody style={{ display: 'flex', alignItems: 'flex-start', gap: '2rem', flexWrap: 'wrap' }}>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '20px',
                                background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: '2.5rem',
                                fontWeight: 900,
                                boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.3)'
                            }}>
                                {course.name.charAt(0)}
                            </div>
                            <div style={{ flex: 1, minWidth: '300px' }}>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>Course Overview</h3>
                                <p style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {course.description || "No description provided for this course. Access the settings tab to update course information."}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <Card variant="lavender" style={{ minWidth: '120px' }}>
                                    <CardBody style={{ textAlign: 'center', padding: '1rem' }}>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#6d28d9' }}>{announcements.length}</div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8b5cf6', textTransform: 'uppercase' }}>Announcements</div>
                                    </CardBody>
                                </Card>
                                <Card variant="sky" style={{ minWidth: '120px' }}>
                                    <CardBody style={{ textAlign: 'center', padding: '1rem' }}>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0369a1' }}>0</div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#0ea5e9', textTransform: 'uppercase' }}>Active Students</div>
                                    </CardBody>
                                </Card>
                            </div>
                        </CardBody>
                    </Card>

                    <Card
                        variant="glass"
                        style={{
                            animation: 'slideUp 0.5s ease-out 0.1s backwards',
                            minHeight: '500px'
                        }}
                    >
                        <CardBody>
                            <div className="course-tabs">
                                <div role="tablist" aria-label="Course sections" className="course-tabs-list" onKeyDown={(event) => {
                                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                                    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
                                    const index = tabs.indexOf(event.target as HTMLButtonElement);
                                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                                        : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
                                    event.preventDefault();
                                    tabs[next]?.focus();
                                    tabs[next]?.click();
                                }}>
                                    <button type="button" role="tab" id="course-tab-modules" aria-controls="course-panel-modules" aria-selected={activeTab === 'modules'} onClick={() => { setActiveTab('modules'); trackAction('viewCourseTab', { courseId: course.id, tab: 'modules' }); }}><IconList size={16} />Modules</button>
                                    <button type="button" role="tab" id="course-tab-announcements" aria-controls="course-panel-announcements" aria-selected={activeTab === 'announcements'} onClick={() => { setActiveTab('announcements'); trackAction('viewCourseTab', { courseId: course.id, tab: 'announcements' }); }}><IconSpeakerphone size={16} />Announcements</button>
                                    <button type="button" role="tab" id="course-tab-students" aria-controls="course-panel-students" aria-selected={activeTab === 'students'} onClick={() => { setActiveTab('students'); trackAction('viewCourseTab', { courseId: course.id, tab: 'students' }); }}><IconUsers size={16} />Students</button>
                                    <button type="button" role="tab" id="course-tab-requests" aria-controls="course-panel-requests" aria-selected={activeTab === 'requests'} onClick={() => { setActiveTab('requests'); trackAction('viewCourseTab', { courseId: course.id, tab: 'requests' }); }}><IconInbox size={16} />Requests</button>
                                    <button type="button" role="tab" id="course-tab-practice_settings" aria-controls="course-panel-practice_settings" aria-selected={activeTab === 'practice_settings'} onClick={() => { setActiveTab('practice_settings'); trackAction('viewCourseTab', { courseId: course.id, tab: 'practice_settings' }); }}><IconSettings size={16} />Practice Settings</button>
                                    <button type="button" role="tab" id="course-tab-settings" aria-controls="course-panel-settings" aria-selected={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); trackAction('viewCourseTab', { courseId: course.id, tab: 'settings' }); }}><IconSettings size={16} />Settings</button>
                                </div>

                                {activeTab === 'modules' && <section role="tabpanel" id="course-panel-modules" aria-labelledby="course-tab-modules">
                                    {courseId && course && (
                                        <>
                                            <ModuleList
                                                courseId={courseId}
                                                onStartSession={handleStartSession}
                                            />

                                            {selectedModule && (
                                                <ModuleSessionModal
                                                    opened={isSessionModalOpen}
                                                    onClose={handleSessionModalClose}
                                                    courseId={courseId}
                                                    courseName={course.name}
                                                    moduleId={selectedModule.id}
                                                    moduleName={selectedModule.name}
                                                />
                                            )}
                                        </>
                                    )}
                                </section>}

                                {activeTab === 'announcements' && <section role="tabpanel" id="course-panel-announcements" aria-labelledby="course-tab-announcements">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Course Board</h3>
                                        {!isCreatingAnnouncement && (
                                            <Button variant="primary" size="sm" onClick={() => setIsCreatingAnnouncement(true)}>
                                                <IconPlus size={18} style={{ marginRight: '0.4rem' }} />
                                                Post Announcement
                                            </Button>
                                        )}
                                    </div>

                                    <div className="course-stack">
                                        {isCreatingAnnouncement ? (
                                            <div style={{
                                                background: 'rgba(255, 255, 255, 0.5)',
                                                padding: '2rem',
                                                borderRadius: '1.5rem',
                                                border: '1px solid #e2e8f0'
                                            }}>
                                                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '1.5rem' }}>Create Board Posting</h4>
                                                <CourseAnnouncementEditor
                                                    courseName={course.name}
                                                    classes={classes}
                                                    onSubmit={handleCreateAnnouncement}
                                                    onCancel={() => setIsCreatingAnnouncement(false)}
                                                    isSubmitting={isSubmittingAnnouncement}
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                {announcements.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8', background: 'rgba(255,255,255,0.3)', borderRadius: '1rem', border: '1px dashed #e2e8f0' }}>
                                                        <IconSpeakerphone size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                                        <h4 style={{ color: '#444', fontWeight: 800 }}>No Announcements</h4>
                                                        <p style={{ maxWidth: '300px', margin: '0 auto', fontSize: '0.9rem' }}>Keep your students updated by posting your first announcement here.</p>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                        {announcements.map((announcement) => (
                                                            <div
                                                                key={announcement.id}
                                                                style={{
                                                                    padding: '1.5rem',
                                                                    background: '#fff',
                                                                    borderRadius: '1.25rem',
                                                                    border: '1px solid #e2e8f0',
                                                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                                                    <div>
                                                                        <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{announcement.title}</h4>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                                                            <IconClock size={12} color="#94a3b8" />
                                                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                                                                                {new Date(announcement.createdAt).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <span className="course-badge">
                                                                        BOARD POST
                                                                    </span>
                                                                </div>

                                                                <RichContent style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, marginBottom: '1.5rem' }}
                                                                    content={announcement.content} format="html"
                                                                />

                                                                {announcement.attachments && announcement.attachments.length > 0 && (
                                                                    <div style={{ marginBottom: '1.5rem' }}>
                                                                        <p style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attached Resources</p>
                                                                        <div className="course-attachments">
                                                                            {announcement.attachments.map((att, idx) => (
                                                                                <span key={idx} className="course-badge">
                                                                                    <IconExternalLink size={12} />
                                                                                    {att.name}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                                                                            {announcement.teacherName?.charAt(0) || 'T'}
                                                                        </div>
                                                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#868e96' }}>{announcement.teacherName}</span>
                                                                    </div>
                                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb' }}>
                                                                        {announcement.targetClassIds ? 'Selected classes' : 'All enrolled students'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </section>}

                                {activeTab === 'students' && <section role="tabpanel" id="course-panel-students" aria-labelledby="course-tab-students">
                                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8' }}>
                                        <IconUsers size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                        <h4 style={{ color: '#444', fontWeight: 800 }}>Student Roster</h4>
                                        <p style={{ maxWidth: '300px', margin: '0 auto', fontSize: '0.9rem' }}>Comprehensive student enrollment list and participation tracking coming soon.</p>
                                    </div>
                                </section>}

                                {activeTab === 'requests' && <section role="tabpanel" id="course-panel-requests" aria-labelledby="course-tab-requests">
                                    {courseId && <RequestReviewList courseId={courseId} />}
                                </section>}

                                {activeTab === 'settings' && <section role="tabpanel" id="course-panel-settings" aria-labelledby="course-tab-settings">
                                    <div className="course-stack" style={{ marginTop: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>Enrollment Flow</h4>
                                            <div style={{
                                                padding: '1.25rem',
                                                background: 'rgba(255, 255, 255, 0.5)',
                                                borderRadius: '1.25rem',
                                                border: '1px solid #e2e8f0',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '1.5rem'
                                            }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                        <IconShieldCheck size={20} color="#4f46e5" />
                                                        <span style={{ fontWeight: 800, fontSize: '0.875rem' }}>Auto-approve with code</span>
                                                    </div>
                                                    <p style={{ fontSize: '0.75rem', color: '#868e96', lineHeight: 1.5, margin: 0 }}>
                                                        When enabled, students who enter the correct course code for this protected course
                                                        will be enrolled automatically, bypassing the manual request phase.
                                                    </p>
                                                </div>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, minHeight: 44, cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        role="switch"
                                                        aria-label="Auto-approve with code"
                                                        className="course-auto-approve-switch"
                                                        checked={course.autoApproveWithCode || false}
                                                        onChange={async (event) => {
                                                            const newVal = event.currentTarget.checked;
                                                            setCourse({ ...course, autoApproveWithCode: newVal });
                                                            trackAction('editCourse', { courseId: course.id, setting: 'autoApproveWithCode' });
                                                            try {
                                                                const result = await updateCourse(course.id, { autoApproveWithCode: newVal });
                                                                if (!result.success) throw new Error(result.error || 'Could not update enrollment flow.');
                                                                toast.success('Enrollment flow updated successfully.');
                                                            } catch (error) {
                                                                setCourse({ ...course, autoApproveWithCode: !newVal });
                                                                toast.error(error instanceof Error ? error.message : 'Could not update enrollment flow.');
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            </div>
                                        </div>

                                        <div style={{ paddingTop: '2rem', borderTop: '1px solid #f1f5f9' }}>
                                            <h4 style={{ color: '#ef4444' }}>Risk & Maintenance</h4>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                <div>
                                                    <p>Archive Course</p>
                                                    <p>Temporarily remove access for all students. Course will be hidden from catalog.</p>
                                                </div>
                                                <Button variant="danger" size="sm" disabled>Archive Course</Button>
                                            </div>
                                        </div>
                                    </div>
                                </section>}

                                {activeTab === 'practice_settings' && <section role="tabpanel" id="course-panel-practice_settings" aria-labelledby="course-tab-practice_settings">
                                    <div className="course-stack" style={{ marginTop: '1rem' }}>
                                        <div style={{ padding: '2rem', background: '#fff', borderRadius: '1.25rem', border: '1px solid #e2e8f0' }}>
                                            {courseId && (
                                                <PracticeSettingsModal
                                                    inline
                                                    opened={true}
                                                    onClose={() => { }}
                                                    courseId={courseId}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </section>}
                            </div>
                        </CardBody>
                    </Card>
                </div>
            </div>

            <style>{`
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

export default TeacherCourseProfilePage;
