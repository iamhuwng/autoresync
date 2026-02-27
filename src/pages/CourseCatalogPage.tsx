import React, { useState, useEffect } from 'react';
import {
    AppShell, Group, Stack, Text, Badge, Center,
    TextInput, Select, SimpleGrid, ThemeIcon, Alert, Button,
    ActionIcon, Container, Skeleton, Modal, Box
} from '@mantine/core';
import {
    IconSearch, IconFilter, IconBook, IconSchool,
    IconChevronLeft, IconPlus, IconCheck, IconCertificate
} from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { getPublicCourses, getCourseByCode } from '../services/courseManager';
import { getEnrollmentsByStudent, enrollStudentInCourse } from '../services/enrollmentManager';
import { createCourseRequest } from '../services/courseRequestManager';
import { getUserById } from '../services/userService';
import type { Course } from '../types/course.types';

interface CatalogCourse extends Course {
    teacherName?: string;
    isEnrolled?: boolean;
}

const CourseCatalogPage: React.FC = () => {
    const { user } = useAuth();
    const { navigateTo } = useNavigation('student');

    const [courses, setCourses] = useState<CatalogCourse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [searchCode, setSearchCode] = useState('');
    const [joiningCode, setJoiningCode] = useState(false);
    const [typeFilter, setTypeFilter] = useState<string | null>(null);
    const [enrollProcessing, setEnrollProcessing] = useState<string | null>(null);
    const [selectedCourse, setSelectedCourse] = useState<CatalogCourse | null>(null);

    useEffect(() => {
        loadCatalogData();
    }, [user]);

    const loadCatalogData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [publicCourses, studentEnrollments] = await Promise.all([
                getPublicCourses(),
                user ? getEnrollmentsByStudent(user.uid) : Promise.resolve([])
            ]);

            // Populate with teacher names
            const populated = await Promise.all(publicCourses.map(async (course) => {
                const teacher = await getUserById(course.ownerId);
                const isEnrolled = studentEnrollments.some(e => e.courseId === course.id && e.status === 'active');
                return {
                    ...course,
                    teacherName: teacher?.displayName || 'Unknown Teacher',
                    isEnrolled
                };
            }));

            setCourses(populated);
        } catch (err) {
            setError('Failed to load course catalog');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleEnroll = async (course: CatalogCourse) => {
        if (!user) {
            alert('Please login to enroll in courses');
            return;
        }

        setEnrollProcessing(course.id);
        try {
            if (course.visibility === 'public') {
                // Public courses allow immediate enrollment
                let expiresAt = 0;
                if (course.duration && course.duration.value > 0) {
                    const now = Date.now();
                    const multiplier = course.duration.unit === 'days' ? 86400000 :
                        course.duration.unit === 'months' ? 2592000000 :
                            31536000000;
                    expiresAt = now + (course.duration.value * multiplier);
                }

                const res = await enrollStudentInCourse(user.uid, course.id, 'public', undefined, expiresAt);
                if (res.success) {
                    setCourses(prev => prev.map(c => c.id === course.id ? { ...c, isEnrolled: true } : c));
                } else {
                    alert('Enrollment failed: ' + res.error);
                }
            } else if (course.visibility === 'protected') {
                // Protected courses require a request
                const studentProfile = await getUserById(user.uid);
                const res = await createCourseRequest(
                    user.uid,
                    studentProfile?.name || user.displayName || 'Unknown Student',
                    course.id,
                    course.name,
                    course.ownerId,
                    'join'
                );

                if (res.success) {
                    alert(`Your request to join "${course.name}" has been sent for approval.`);
                } else {
                    alert(res.error || 'Failed to send request');
                }
            }
        } catch (err) {
            alert('An error occurred during enrollment');
        } finally {
            setEnrollProcessing(null);
        }
    };

    const handleJoinByCode = async () => {
        if (!user || !searchCode.trim()) return;
        setJoiningCode(true);
        try {
            const course = await getCourseByCode(searchCode.trim());
            if (!course) {
                alert('Course not found. Please check the code.');
                return;
            }

            if (course.visibility === 'private') {
                alert('This course is private. Only teachers can enroll students.');
                return;
            }

            // check if already enrolled
            const studentEnrollments = await getEnrollmentsByStudent(user.uid);
            if (studentEnrollments.some(e => e.courseId === course.id && e.status === 'active')) {
                alert('You are already enrolled in this course!');
                navigateTo('STUDENT_COURSE_DETAIL', { courseId: course.id });
                return;
            }

            if (course.visibility === 'public' || (course.visibility === 'protected' && course.autoApproveWithCode)) {
                // Public or Auto-approve Protected
                await handleEnroll({ ...course, isEnrolled: false });
                if (course.visibility === 'protected') {
                    alert(`Correct code! You have been automatically enrolled in "${course.name}".`);
                    setSearchCode('');
                }
            } else {
                // Protected - create request
                const studentProfile = await getUserById(user.uid);
                const res = await createCourseRequest(
                    user.uid,
                    studentProfile?.name || user.displayName || 'Unknown Student',
                    course.id,
                    course.name,
                    course.ownerId,
                    'join'
                );

                if (res.success) {
                    alert(`"${course.name}" is a protected course. Your request to join has been sent to the teacher.`);
                    setSearchCode('');
                } else {
                    alert(res.error || 'Failed to send request');
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setJoiningCode(false);
        }
    };

    const filteredCourses = courses.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.type.toLowerCase().includes(search.toLowerCase());
        const matchesType = !typeFilter || c.type === typeFilter;
        return matchesSearch && matchesType;
    });

    const courseTypes = Array.from(new Set(courses.map(c => c.type)));

    return (
        <AppShell
            header={{ height: 100 }}
            padding="md"
            style={{ background: '#f1f5f9' }}
        >
            <AppShell.Header style={{
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(10px)',
                borderBottom: '1px solid #e2e8f0',
                padding: '0 2rem',
                display: 'flex',
                alignItems: 'center'
            }}>
                <Group justify="space-between" w="100%">
                    <Group gap="md">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={() => navigateTo('STUDENT_COURSES')}
                            size="lg"
                            aria-label="Back to My Courses"
                        >
                            <IconChevronLeft size={24} />
                        </ActionIcon>
                        <div>
                            <Text size="xl" fw={800} style={{
                                background: 'linear-gradient(45deg, #4f46e5, #9333ea)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent'
                            }}>Course Catalog</Text>
                            <Text size="xs" color="dimmed" fw={600}>Discover knowledge, unlock your potential</Text>
                        </div>
                    </Group>

                    <Group gap="sm">
                        <Group gap={0} style={{
                            background: 'white',
                            borderRadius: '12px',
                            padding: '2px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}>
                            <TextInput
                                placeholder="Course Code"
                                value={searchCode}
                                onChange={(e) => setSearchCode(e.currentTarget.value)}
                                variant="unstyled"
                                px="md"
                                w={140}
                                styles={{ input: { height: '36px' } }}
                            />
                            <Button
                                variant="filled"
                                color="indigo"
                                size="sm"
                                radius="md"
                                onClick={handleJoinByCode}
                                loading={joiningCode}
                            >
                                Join
                            </Button>
                        </Group>

                        <div style={{ height: '30px', borderLeft: '1px solid #e2e8f0', margin: '0 4px' }} />

                        <TextInput
                            placeholder="Search courses..."
                            leftSection={<IconSearch size={16} />}
                            value={search}
                            onChange={(e) => setSearch(e.currentTarget.value)}
                            radius="md"
                            w={250}
                        />
                        <Select
                            placeholder="Filter by type"
                            leftSection={<IconFilter size={16} />}
                            data={courseTypes}
                            value={typeFilter}
                            onChange={setTypeFilter}
                            clearable
                            radius="md"
                            w={180}
                        />
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Main>
                <Container size="xl" py="xl">
                    {loading ? (
                        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <Skeleton key={i} height={300} radius="xl" />
                            ))}
                        </SimpleGrid>
                    ) : error ? (
                        <Center py={100}>
                            <Alert color="red" title="Error" icon={<IconSearch />}>
                                {error}
                            </Alert>
                        </Center>
                    ) : filteredCourses.length === 0 ? (
                        <Center py={100}>
                            <Stack align="center" gap="md">
                                <ThemeIcon size={80} radius="xl" variant="light" color="gray">
                                    <IconBook size={40} />
                                </ThemeIcon>
                                <Text fw={700} size="xl" color="dimmed">No courses found matching your criteria</Text>
                                <Button variant="subtle" onClick={() => { setSearch(''); setTypeFilter(null); }}>
                                    Clear Filters
                                </Button>
                            </Stack>
                        </Center>
                    ) : (
                        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
                            {filteredCourses.map((course) => (
                                <div key={course.id} style={{
                                    background: 'white',
                                    borderRadius: '24px',
                                    border: '1px solid #e2e8f0',
                                    overflow: 'hidden',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    position: 'relative'
                                }} className="catalog-card">
                                    {/* Thumbnail / Header */}
                                    <div style={{
                                        height: '140px',
                                        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                        padding: '1.5rem',
                                        position: 'relative'
                                    }}>
                                        <Badge
                                            variant="glass"
                                            color="white"
                                            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white' }}
                                        >
                                            {course.type}
                                        </Badge>
                                        <div style={{ position: 'absolute', bottom: '1rem', left: '1.5rem', right: '1.5rem' }}>
                                            <Text color="white" fw={800} size="lg" style={{ lineHeight: 1.2 }}>{course.name}</Text>
                                        </div>
                                    </div>

                                    {/* Body */}
                                    <Stack p="xl" gap="md" style={{ flex: 1 }}>
                                        <Text size="sm" color="dimmed" lineClamp={3} style={{ flex: 1 }}>
                                            {course.description || 'No description available for this course. Start learning today!'}
                                        </Text>

                                        <Stack gap="xs">
                                            <Group gap="xs">
                                                <ThemeIcon size={24} radius="xl" variant="light" color="indigo">
                                                    <IconSchool size={14} />
                                                </ThemeIcon>
                                                <Text size="xs" fw={700} color="#64748b">Instructor: {course.teacherName}</Text>
                                            </Group>
                                            <Group gap="xs">
                                                <ThemeIcon size={24} radius="xl" variant="light" color="cyan">
                                                    <IconCertificate size={14} />
                                                </ThemeIcon>
                                                <Text size="xs" fw={700} color="#64748b">
                                                    Duration: {course.duration?.value ? `${course.duration.value} ${course.duration.unit}` : 'Flexible'}
                                                </Text>
                                            </Group>
                                        </Stack>

                                        <Group justify="space-between" mt="md">
                                            <Group grow>
                                                <Button
                                                    variant="light"
                                                    radius="xl"
                                                    onClick={() => setSelectedCourse(course)}
                                                >
                                                    View Details
                                                </Button>
                                                <Button
                                                    variant={course.isEnrolled ? "light" : "filled"}
                                                    color={course.isEnrolled ? "green" : "indigo"}
                                                    radius="xl"
                                                    leftSection={course.isEnrolled ? <IconCheck size={18} /> : (course.visibility === 'public' ? <IconPlus size={18} /> : <IconSchool size={18} />)}
                                                    onClick={() => !course.isEnrolled && handleEnroll(course)}
                                                    loading={enrollProcessing === course.id}
                                                    disabled={course.isEnrolled}
                                                    style={{
                                                        background: course.isEnrolled ? '' : 'linear-gradient(45deg, #4f46e5, #7c3aed)',
                                                        boxShadow: course.isEnrolled ? 'none' : '0 4px 12px rgba(79, 70, 229, 0.3)'
                                                    }}
                                                >
                                                    {course.isEnrolled ? 'Enrolled' : (course.visibility === 'public' ? 'Enroll' : 'Join')}
                                                </Button>
                                            </Group>
                                        </Group>
                                    </Stack>
                                </div>
                            ))}
                        </SimpleGrid>
                    )}
                </Container>
            </AppShell.Main>

            <style>{`
        .catalog-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
      `}</style>
            <Modal
                opened={!!selectedCourse}
                onClose={() => setSelectedCourse(null)}
                title={<Text fw={700} size="lg">{selectedCourse?.name}</Text>}
                centered
                size="lg"
                radius="md"
            >
                {selectedCourse && (
                    <Stack gap="md">
                        <Group justify="space-between">
                            <Badge size="lg" radius="sm">{selectedCourse.type}</Badge>
                            <Group gap="xs">
                                <IconSchool size={16} />
                                <Text size="sm">{selectedCourse.visibility.toUpperCase()}</Text>
                            </Group>
                        </Group>

                        <Text size="sm" c="dimmed">{selectedCourse.description || 'No description provided.'}</Text>

                        {selectedCourse.entranceRequirements && (
                            <Box p="sm" style={{ backgroundColor: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #4f46e5' }}>
                                <Text size="xs" fw={700} tt="uppercase" c="indigo" mb={4}>Requirements</Text>
                                <Text size="sm">{selectedCourse.entranceRequirements}</Text>
                            </Box>
                        )}

                        {selectedCourse.graduateTarget && (
                            <Box p="sm" style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                                <Text size="xs" fw={700} tt="uppercase" c="green" mb={4}>Target Outcome</Text>
                                <Text size="sm">{selectedCourse.graduateTarget}</Text>
                            </Box>
                        )}

                        <Group justify="flex-end" mt="xl">
                            <Button variant="outline" color="gray" onClick={() => setSelectedCourse(null)}>Close</Button>
                            {!selectedCourse.isEnrolled && (
                                <Button
                                    color="indigo"
                                    onClick={() => {
                                        handleEnroll(selectedCourse);
                                        setSelectedCourse(null);
                                    }}
                                    loading={enrollProcessing === selectedCourse.id}
                                >
                                    {selectedCourse.visibility === 'public' ? 'Enroll Now' : 'Request to Join'}
                                </Button>
                            )}
                        </Group>
                    </Stack>
                )}
            </Modal>
        </AppShell>
    );
};

export default CourseCatalogPage;
