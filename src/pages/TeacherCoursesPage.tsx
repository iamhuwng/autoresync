
import React, { useEffect, useState } from 'react';
import { AppShell, Select, Loader } from '@mantine/core'; // Keep AppShell/Select/Loader
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { CourseCard } from '../components/CourseCard';
import { CourseCreateModal } from '../components/course/CourseCreateModal';
import { getCoursesByOwner, getAllCourses, archiveCourse, restoreCourse, hardDeleteCourse } from '../services/courseManager';
import type { Course } from '../types/course.types';
import { notifications } from '@mantine/notifications';

// Modern Components
import { Card, CardBody, Button, Input } from '../components/modern';
import { TeacherHeader } from '../components/navigation';

const TeacherCoursesPage: React.FC = () => {
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [courseToEdit, setCourseToEdit] = useState<Course | null>(null);

    // Card Colors
    const cardVariants = ['lavender', 'sky', 'mint', 'rose', 'peach'] as const;

    useEffect(() => {
        if (user?.uid) {
            loadCourses();
        }
    }, [user]);

    const loadCourses = async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            // Super admins see ALL courses, teachers see only their own
            const data = profile?.role === 'super_admin'
                ? await getAllCourses()
                : await getCoursesByOwner(user.uid);
            setCourses(data);
        } catch (error) {
            console.error('Error loading courses:', error);
            notifications.show({ title: 'Error', message: 'Failed to load courses', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCourse = () => {
        setCourseToEdit(null);
        setIsModalOpen(true);
    };

    const handleEditCourse = (course: Course) => {
        setCourseToEdit(course);
        setIsModalOpen(true);
    };

    const handleModalSuccess = () => {
        loadCourses();
        setIsModalOpen(false); // Ensure modal closes
    };

    const handleArchiveCourse = async (course: Course) => {
        if (window.confirm(`Are you sure you want to archive "${course.name}"? This will move it to the Archived tab and block student access.`)) {
            try {
                const res = await archiveCourse(course.id);
                if (res.success) {
                    notifications.show({ title: 'Archived', message: `${course.name} has been archived`, color: 'blue' });
                    loadCourses();
                } else {
                    notifications.show({ title: 'Cannot Archive', message: res.error || 'Failed to archive course', color: 'red' });
                }
            } catch (error) {
                console.error('Error archiving course:', error);
                notifications.show({ title: 'Error', message: 'An unexpected error occurred', color: 'red' });
            }
        }
    };

    const handleRestoreCourse = async (course: Course) => {
        try {
            const res = await restoreCourse(course.id);
            if (res.success) {
                notifications.show({ title: 'Restored', message: `${course.name} has been restored`, color: 'green' });
                loadCourses();
            } else {
                notifications.show({ title: 'Error', message: res.error || 'Failed to restore course', color: 'red' });
            }
        } catch (error) {
            console.error('Error restoring course:', error);
            notifications.show({ title: 'Error', message: 'An unexpected error occurred', color: 'red' });
        }
    };

    const handleHardDeleteCourse = async (course: Course) => {
        const confirmMsg = `WARNING: Are you sure you want to PERMANENTLY delete "${course.name}"? This action cannot be undone and will remove all modules and material links. Student test records will be preserved for history.`;
        if (window.confirm(confirmMsg)) {
            try {
                const res = await hardDeleteCourse(course.id);
                if (res.success) {
                    notifications.show({ title: 'Deleted', message: `${course.name} has been permanently deleted`, color: 'red' });
                    loadCourses();
                } else {
                    notifications.show({ title: 'Error', message: res.error || 'Failed to delete course', color: 'red' });
                }
            } catch (error) {
                console.error('Error deleting course:', error);
                notifications.show({ title: 'Error', message: 'An unexpected error occurred', color: 'red' });
            }
        }
    };

    const handleViewCourse = (course: Course) => {
        navigateTo('TEACHER_COURSE_DETAIL', { courseId: course.id });
    };

    const handleLogout = async () => {
        try {
            await logout();
            sessionStorage.removeItem('isAdmin');
            navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
        } catch (error) {
            console.error('Logout error:', error);
        }
    };



    // Filter and Sort
    const filteredCourses = courses.filter(course => {
        const matchesSearch = course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType ? course.type === filterType : true;

        const isArchived = !!course.archivedAt;
        const matchesArchived = showArchived ? true : !isArchived;

        return matchesSearch && matchesType && matchesArchived;
    });

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
                    pageTitle="Courses"
                    userId={user?.uid}
                    userRole={profile?.role}
                    onLogout={handleLogout}
                />

                <AppShell.Main>
                    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
                        {/* Page Header */}
                        <div style={{ marginBottom: '2.5rem', animation: 'slideDown 0.5s ease-out' }}>
                            <h1
                                style={{
                                    fontSize: '2.5rem',
                                    fontWeight: '800',
                                    marginBottom: '0.5rem',
                                    color: '#1e293b',
                                }}
                            >
                                My Courses
                            </h1>
                            <p style={{ fontSize: '1rem', color: '#64748b' }}>
                                Manage your curriculum, lessons, and learning materials
                            </p>
                        </div>

                        {/* Search and Actions Bar */}
                        <Card
                            variant="glass"
                            style={{
                                marginBottom: '2rem',
                                animation: 'slideUp 0.5s ease-out 0.1s backwards',
                            }}
                        >
                            <CardBody>
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        alignItems: 'flex-end',
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <div style={{ flex: '1 1 300px' }}>
                                        <Input
                                            placeholder="Search courses by name or code..."
                                            value={searchTerm}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                                            variant="default"
                                        />
                                    </div>
                                    <div style={{ flex: '0 0 200px' }}>
                                        <Select
                                            placeholder="Filter by Type"
                                            data={[
                                                { value: 'IELTS', label: 'IELTS' },
                                                { value: 'TOEIC', label: 'TOEIC' },
                                                { value: 'THCS', label: 'THCS' },
                                                { value: 'THPT', label: 'THPT' },
                                                { value: 'Communicative', label: 'Communicative' },
                                            ]}
                                            clearable
                                            value={filterType}
                                            onChange={setFilterType}
                                            styles={{
                                                input: {
                                                    height: '42px',
                                                    borderRadius: '12px',
                                                    border: '2px solid #e2e8f0',
                                                }
                                            }}
                                        />
                                    </div>

                                    <Button
                                        variant="primary"
                                        onClick={handleCreateCourse}
                                        style={{ marginRight: '0.5rem' }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                                        </svg>
                                        Create New Course
                                    </Button>

                                    <Button
                                        variant={showArchived ? "warning" : "glass"}
                                        onClick={() => setShowArchived(!showArchived)}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                                            <path d="M21 8v13H3V8" />
                                            <path d="M1 3h22v5H1z" />
                                            <path d="M10 12h4" />
                                        </svg>
                                        {showArchived ? 'Hide Archived' : 'Show Archived'}
                                    </Button>
                                </div>
                            </CardBody>
                        </Card>

                        {/* Courses Grid */}
                        {loading ? (
                            <Card
                                variant="default"
                                style={{
                                    textAlign: 'center',
                                    padding: '4rem 2rem',
                                    animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                                }}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1e293b' }}>
                                    Loading courses...
                                </h2>
                            </Card>
                        ) : filteredCourses.length === 0 ? (
                            <Card
                                variant="default"
                                style={{
                                    textAlign: 'center',
                                    padding: '4rem 2rem',
                                    animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                                }}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1e293b' }}>
                                    No courses found
                                </h2>
                                <p style={{ fontSize: '1rem', color: '#64748b', marginBottom: '1.5rem' }}>
                                    Create a new course to get started with your curriculum.
                                </p>
                                <Button variant="primary" onClick={handleCreateCourse}>
                                    Create First Course
                                </Button>
                            </Card>
                        ) : (
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                    gap: '1.5rem',
                                }}
                            >
                                {filteredCourses.map((course, index) => (
                                    <div
                                        key={course.id}
                                        style={{ animation: `slideUp 0.5s ease-out ${index * 0.1}s backwards` }}
                                    >
                                        <CourseCard
                                            course={course}
                                            variant={cardVariants[index % cardVariants.length]}
                                            onEdit={handleEditCourse}
                                            onArchive={handleArchiveCourse}
                                            onView={handleViewCourse}
                                            onRestore={handleRestoreCourse}
                                            onDelete={handleHardDeleteCourse}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </AppShell.Main>

                <CourseCreateModal
                    opened={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={handleModalSuccess}
                    courseToEdit={courseToEdit}
                />
            </AppShell>
        </div>
    );
};

export default TeacherCoursesPage;
