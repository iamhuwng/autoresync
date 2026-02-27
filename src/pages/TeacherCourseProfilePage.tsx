

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TeacherHeader } from '../components/navigation';
import { Tabs, Loader, Alert, Group, Text, Badge, Switch, Stack, Divider } from '@mantine/core';
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
import { notifications } from '@mantine/notifications';

// Modern Components
import { Card, CardBody, Button } from '../components/modern';

const TeacherCourseProfilePage = () => {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();

    const { user, profile } = useAuth();
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
                notifications.show({
                    title: 'Announcement Sent',
                    message: 'Your announcement has been posted and students notified.',
                    color: 'green'
                });
                setIsCreatingAnnouncement(false);
                // Refresh list
                const updated = await getCourseAnnouncements(course.id);
                setAnnouncements(updated);
            } else {
                throw new Error(result.error);
            }
        } catch (err: any) {
            notifications.show({
                title: 'Error',
                message: err.message || 'Failed to send announcement',
                color: 'red'
            });
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
                <Loader size="xl" color="violet" />
            </div>
        );
    }

    if (error || !course) {
        return (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
                <Alert color="red" title="Error" style={{ maxWidth: '500px', margin: '0 auto' }}>
                    {error || 'Course not found'}
                </Alert>
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
                        <Badge color={course.visibility === 'public' ? 'green' : 'blue'} variant="light" size="lg" styles={{ root: { fontWeight: 800 } }}>
                            {course.visibility.toUpperCase()}
                        </Badge>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>CODE:</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', color: '#4f46e5', background: 'rgba(99, 102, 241, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '0.5rem' }}>
                            {course.code}
                        </span>
                        <span style={{ margin: '0 0.25rem', opacity: 0.3 }}>|</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>TYPE:</span>
                        <Badge variant="outline" color="gray" size="md">
                            {course.type.toUpperCase()}
                        </Badge>
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
                                <Text color="#64748b" style={{ lineHeight: 1.6 }}>
                                    {course.description || "No description provided for this course. Access the settings tab to update course information."}
                                </Text>
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
                            <Tabs value={activeTab} onChange={setActiveTab} variant="pills" color="grape" radius="md">
                                <Tabs.List style={{ marginBottom: '2rem', gap: '0.5rem' }}>
                                    <Tabs.Tab value="modules" style={{ fontWeight: 700 }} leftSection={<IconList size={16} />}>Modules</Tabs.Tab>
                                    <Tabs.Tab value="announcements" style={{ fontWeight: 700 }} leftSection={<IconSpeakerphone size={16} />}>Announcements</Tabs.Tab>
                                    <Tabs.Tab value="students" style={{ fontWeight: 700 }} leftSection={<IconUsers size={16} />}>Students</Tabs.Tab>
                                    <Tabs.Tab value="requests" style={{ fontWeight: 700 }} leftSection={<IconInbox size={16} />}>Requests</Tabs.Tab>
                                    <Tabs.Tab value="practice_settings" style={{ fontWeight: 700 }} leftSection={<IconSettings size={16} />}>Practice Settings</Tabs.Tab>
                                    <Tabs.Tab value="settings" style={{ fontWeight: 700 }} leftSection={<IconSettings size={16} />}>Settings</Tabs.Tab>
                                </Tabs.List>

                                <Tabs.Panel value="modules">
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
                                </Tabs.Panel>

                                <Tabs.Panel value="announcements">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Course Board</h3>
                                        {!isCreatingAnnouncement && (
                                            <Button variant="primary" size="sm" onClick={() => setIsCreatingAnnouncement(true)}>
                                                <IconPlus size={18} style={{ marginRight: '0.4rem' }} />
                                                Post Announcement
                                            </Button>
                                        )}
                                    </div>

                                    <Stack gap="xl">
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
                                                                    <Badge variant="light" color="indigo" size="sm" styles={{ root: { fontWeight: 800 } }}>
                                                                        BOARD POST
                                                                    </Badge>
                                                                </div>

                                                                <div
                                                                    style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, marginBottom: '1.5rem' }}
                                                                    dangerouslySetInnerHTML={{ __html: announcement.content }}
                                                                />

                                                                {announcement.attachments && announcement.attachments.length > 0 && (
                                                                    <div style={{ marginBottom: '1.5rem' }}>
                                                                        <Text size="xs" fw={800} c="dimmed" mb="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attached Resources</Text>
                                                                        <Group gap="xs">
                                                                            {announcement.attachments.map((att, idx) => (
                                                                                <Badge
                                                                                    key={idx}
                                                                                    variant="outline"
                                                                                    color="gray"
                                                                                    size="sm"
                                                                                    leftSection={<IconExternalLink size={12} />}
                                                                                    styles={{ root: { cursor: 'pointer', padding: '0.75rem', height: 'auto', fontWeight: 600 } }}
                                                                                >
                                                                                    {att.name}
                                                                                </Badge>
                                                                            ))}
                                                                        </Group>
                                                                    </div>
                                                                )}

                                                                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                                                                            {announcement.teacherName?.charAt(0) || 'T'}
                                                                        </div>
                                                                        <Text size="xs" fw={700} c="dimmed">{announcement.teacherName}</Text>
                                                                    </div>
                                                                    <Badge size="xs" variant="dot" color="blue" styles={{ root: { fontWeight: 700 } }}>
                                                                        Sent to {announcement.sentToStudentIds?.length || 0} students
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </Stack>
                                </Tabs.Panel>

                                <Tabs.Panel value="students">
                                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8' }}>
                                        <IconUsers size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                        <h4 style={{ color: '#444', fontWeight: 800 }}>Student Roster</h4>
                                        <p style={{ maxWidth: '300px', margin: '0 auto', fontSize: '0.9rem' }}>Comprehensive student enrollment list and participation tracking coming soon.</p>
                                    </div>
                                </Tabs.Panel>

                                <Tabs.Panel value="requests">
                                    {courseId && <RequestReviewList courseId={courseId} />}
                                </Tabs.Panel>

                                <Tabs.Panel value="settings">
                                    <Stack gap="xl" mt="md">
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
                                                    <Group gap="xs" mb="xs">
                                                        <IconShieldCheck size={20} color="#4f46e5" />
                                                        <Text fw={800} size="sm">Auto-approve with code</Text>
                                                    </Group>
                                                    <Text size="xs" color="dimmed" style={{ lineHeight: 1.5 }}>
                                                        When enabled, students who enter the correct course code for this protected course
                                                        will be enrolled automatically, bypassing the manual request phase.
                                                    </Text>
                                                </div>
                                                <Switch
                                                    checked={course.autoApproveWithCode || false}
                                                    onChange={async (event) => {
                                                        const newVal = event.currentTarget.checked;
                                                        setCourse({ ...course, autoApproveWithCode: newVal });
                                                        await updateCourse(course.id, { autoApproveWithCode: newVal });
                                                        notifications.show({ title: 'Setting Updated', message: 'Enrollment flow updated successfully', color: 'indigo' });
                                                    }}
                                                    color="indigo"
                                                    size="md"
                                                />
                                            </div>
                                        </div>

                                        <div style={{ paddingTop: '2rem', borderTop: '1px solid #f1f5f9' }}>
                                            <Divider label={<span style={{ fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk & Maintenance</span>} labelPosition="center" color="red" mb="xl" />

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                <div>
                                                    <Text size="sm" fw={800} color="#1e293b">Archive Course</Text>
                                                    <Text size="xs" color="dimmed">Temporarily remove access for all students. Course will be hidden from catalog.</Text>
                                                </div>
                                                <Button variant="danger" size="sm" disabled>Archive Course</Button>
                                            </div>
                                        </div>
                                    </Stack>
                                </Tabs.Panel>

                                <Tabs.Panel value="practice_settings">
                                    <Stack gap="xl" mt="md">
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
                                    </Stack>
                                </Tabs.Panel>
                            </Tabs>
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
