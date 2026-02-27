
import React, { useEffect, useState } from 'react';
import {
    Table, Badge, Group, Text, ActionIcon, Tooltip, TextInput,
    Select, Loader, Stack, Menu, Button, Avatar
} from '@mantine/core';
import {
    IconSearch, IconEdit, IconTrash, IconArchive,
    IconUserPlus, IconExternalLink, IconDotsVertical, IconCheck
} from '@tabler/icons-react';
import { getAllCourses, archiveCourse, hardDeleteCourse, restoreCourse } from '../../services/courseManager';
import { getAllUsersSecure } from '../../services/userService';
import { getEnrollmentsByCourse } from '../../services/enrollmentManager';
import type { Course } from '../../types/course.types';
import type { UserProfile } from '../../types/user.types';
import { notifications } from '@mantine/notifications';
import { useNavigation } from '../../hooks/useNavigation';
import { useSecureService } from '../../hooks/useSecureService';
import { AdminEnrollmentModal } from './AdminEnrollmentModal';

interface AdminCourseManagementProps {
    currentUserId: string;
}

export const AdminCourseManagement: React.FC<AdminCourseManagementProps> = ({ }) => {
    const { navigateTo } = useNavigation('admin');
    const { authContext } = useSecureService();
    const [courses, setCourses] = useState<Course[]>([]);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter] = useState<string | null>(null);
    const [teacherFilter, setTeacherFilter] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('active');

    // Enrollment Modal state
    const [enrollmentModalOpened, setEnrollmentModalOpened] = useState(false);
    const [selectedCourseForEnrollment, setSelectedCourseForEnrollment] = useState<Course | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Use secure version with auth context (PRD-0016 Task 3.11)
            const [allCourses, allUsers] = await Promise.all([
                getAllCourses(),
                getAllUsersSecure(authContext)
            ]);

            setCourses(allCourses);
            setUsers(allUsers.filter(u => u.role === 'teacher' || u.role === 'super_admin') as any);

            // Fetch enrollment counts for each course
            const counts: Record<string, number> = {};
            await Promise.all(allCourses.map(async (course) => {
                const enrollments = await getEnrollmentsByCourse(course.id);
                counts[course.id] = enrollments.filter(e => e.status === 'active').length;
            }));
            setEnrollmentCounts(counts);

        } catch (error) {
            console.error('Error loading admin course data:', error);
            notifications.show({ title: 'Error', message: 'Failed to load courses', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const handleArchive = async (course: Course) => {
        if (!window.confirm(`Archive "${course.name}"?`)) return;
        try {
            const res = await archiveCourse(course.id);
            if (res.success) {
                notifications.show({ title: 'Success', message: 'Course archived', color: 'blue' });
                loadData();
            } else {
                notifications.show({ title: 'Error', message: res.error || 'Failed to archive', color: 'red' });
            }
        } catch (err) {
            notifications.show({ title: 'Error', message: 'An unexpected error occurred', color: 'red' });
        }
    };

    const handleRestore = async (courseId: string) => {
        try {
            const res = await restoreCourse(courseId);
            if (res.success) {
                notifications.show({ title: 'Success', message: 'Course restored', color: 'green' });
                loadData();
            }
        } catch (err) {
            notifications.show({ title: 'Error', message: 'Failed to restore', color: 'red' });
        }
    };

    const handleHardDelete = async (course: Course) => {
        if (!window.confirm(`PERMANENTLY delete "${course.name}"? This cannot be undone.`)) return;
        try {
            const res = await hardDeleteCourse(course.id);
            if (res.success) {
                notifications.show({ title: 'Deleted', message: 'Course permanently removed', color: 'red' });
                loadData();
            }
        } catch (err) {
            notifications.show({ title: 'Error', message: 'Failed to delete', color: 'red' });
        }
    };

    const filteredCourses = courses.filter(course => {
        const matchesSearch = course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter ? course.type === typeFilter : true;
        const matchesTeacher = teacherFilter ? course.ownerId === teacherFilter : true;

        const isArchived = !!course.archivedAt;
        const matchesStatus = statusFilter === 'all' ? true :
            statusFilter === 'archived' ? isArchived : !isArchived;

        return matchesSearch && matchesType && matchesTeacher && matchesStatus;
    });

    const handleOpenEnrollment = (course: Course) => {
        setSelectedCourseForEnrollment(course);
        setEnrollmentModalOpened(true);
    };

    const getTeacherName = (ownerId: string): string => {
        const teacher = users.find(u => u.uid === ownerId);
        if (!teacher) return 'Unknown';
        return (teacher.displayName || teacher.email || 'Unknown') as string;
    };

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Group>
                    <TextInput
                        placeholder="Search courses..."
                        leftSection={<IconSearch size={14} />}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.currentTarget.value)}
                        style={{ width: 250 }}
                    />
                    <Select
                        placeholder="Teacher"
                        data={users.map(u => ({ value: u.uid, label: (u.displayName || u.email) as string }))}
                        value={teacherFilter}
                        onChange={setTeacherFilter}
                        clearable
                        style={{ width: 200 }}
                    />
                    <Select
                        placeholder="Status"
                        data={[
                            { value: 'active', label: 'Active Only' },
                            { value: 'archived', label: 'Archived Only' },
                            { value: 'all', label: 'All Courses' }
                        ]}
                        value={statusFilter}
                        onChange={(val) => setStatusFilter(val || 'active')}
                        style={{ width: 150 }}
                    />
                </Group>
                <Button variant="light" onClick={loadData} disabled={loading}>Refresh List</Button>
            </Group>

            {/* Basic Analytics */}
            {!loading && courses.length > 0 && (
                <Stack gap="xs">
                    <Text fw={700} size="sm">Most Popular Courses</Text>
                    <Group gap="md">
                        {Object.entries(enrollmentCounts)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 3)
                            .map(([courseId, count]) => {
                                const course = courses.find(c => c.id === courseId);
                                if (!course || count === 0) return null;
                                return (
                                    <Badge key={courseId} size="lg" variant="dot" color="blue" py="md">
                                        {course.name}: {count} students
                                    </Badge>
                                );
                            })}
                    </Group>
                </Stack>
            )}

            {loading ? (
                <Group justify="center" py="xl"><Loader /></Group>
            ) : filteredCourses.length === 0 ? (
                <Text ta="center" py="xl" c="dimmed">No courses found matching criteria</Text>
            ) : (
                <Table striped highlightOnHover verticalSpacing="sm">
                    <thead>
                        <tr>
                            <th>Course Name / Code</th>
                            <th>Owner (Teacher)</th>
                            <th>Type</th>
                            <th>Students</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCourses.map(course => (
                            <tr key={course.id}>
                                <td>
                                    <Stack gap={2}>
                                        <Text fw={500}>{course.name}</Text>
                                        <Badge size="xs" variant="outline">{course.code}</Badge>
                                    </Stack>
                                </td>
                                <td>
                                    <Group gap="xs">
                                        <Avatar size="sm" radius="xl" color="blue">
                                            {getTeacherName(course.ownerId).charAt(0).toUpperCase() || '?'}
                                        </Avatar>
                                        <Text size="sm">{getTeacherName(course.ownerId)}</Text>
                                    </Group>
                                </td>
                                <td><Badge color="blue" variant="light">{course.type}</Badge></td>
                                <td>
                                    <Badge color="teal" variant="filled">
                                        {enrollmentCounts[course.id] || 0} enrolled
                                    </Badge>
                                </td>
                                <td>
                                    {course.archivedAt ? (
                                        <Badge color="gray">Archived</Badge>
                                    ) : (
                                        <Badge color="green">Active</Badge>
                                    )}
                                </td>
                                <td>
                                    <Group justify="flex-end" gap="xs">
                                        <Tooltip label="View Details">
                                            <ActionIcon onClick={() => navigateTo('TEACHER_COURSE_DETAIL', { courseId: course.id })}>
                                                <IconExternalLink size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Menu position="bottom-end" shadow="md">
                                            <Menu.Target>
                                                <ActionIcon variant="light">
                                                    <IconDotsVertical size={16} />
                                                </ActionIcon>
                                            </Menu.Target>
                                            <Menu.Dropdown>
                                                <Menu.Item leftSection={<IconEdit size={14} />}>Edit Course (Soon)</Menu.Item>
                                                <Menu.Item
                                                    leftSection={<IconUserPlus size={14} />}
                                                    onClick={() => handleOpenEnrollment(course)}
                                                >
                                                    Enroll Students
                                                </Menu.Item>
                                                <Menu.Divider />
                                                {!course.archivedAt ? (
                                                    <Menu.Item
                                                        color="orange"
                                                        leftSection={<IconArchive size={14} />}
                                                        onClick={() => handleArchive(course)}
                                                    >
                                                        Archive Course
                                                    </Menu.Item>
                                                ) : (
                                                    <>
                                                        <Menu.Item
                                                            color="green"
                                                            leftSection={<IconCheck size={14} />}
                                                            onClick={() => handleRestore(course.id)}
                                                        >
                                                            Restore Course
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            color="red"
                                                            leftSection={<IconTrash size={14} />}
                                                            onClick={() => handleHardDelete(course)}
                                                        >
                                                            Delete Permanently
                                                        </Menu.Item>
                                                    </>
                                                )}
                                            </Menu.Dropdown>
                                        </Menu>
                                    </Group>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            )}

            <AdminEnrollmentModal
                opened={enrollmentModalOpened}
                onClose={() => setEnrollmentModalOpened(false)}
                course={selectedCourseForEnrollment}
                onSuccess={loadData}
            />
        </Stack>
    );
};
