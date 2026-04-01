/**
 * AdminClassesPage
 * 
 * Super admin page for managing all classes in the system.
 * Provides a comprehensive view of all classes across all teachers.
 * 
 * Route: /admin/classes
 * Allowed Roles: super_admin only
 */
import React, { useEffect, useState } from 'react';
import {
    Table, Badge, Group, Text, ActionIcon, Tooltip, TextInput,
    Loader, Stack, Menu, Button
} from '@mantine/core';
import {
    IconSearch, IconEdit, IconTrash, IconExternalLink,
    IconDotsVertical, IconUsers
} from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { AdminLayout } from '../components/navigation';
import { getClasses } from '../services/classManager';
import { notifications } from '@mantine/notifications';
import type { ClassSummary } from '../types/class.types';

const AdminClassesPage: React.FC = () => {
    const { profile, logout } = useAuth();
    const { navigateTo } = useNavigation('admin');

    // State
    const [classes, setClasses] = useState<ClassSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Role check
    const isSuperAdmin = profile?.role === 'super_admin';

    useEffect(() => {
        if (isSuperAdmin) {
            loadData();
        }
    }, [isSuperAdmin]);

    const loadData = async () => {
        setLoading(true);
        try {
            const allClasses = await getClasses();
            setClasses(allClasses);
        } catch (error) {
            console.error('Error loading admin class data:', error);
            notifications.show({ title: 'Error', message: 'Failed to load classes', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigateTo('LOGIN', {}, { reason: 'admin_logout', replace: true });
    };

    const handleSidebarNavigate = (page: string) => {
        const pageRoutes: Record<string, string> = {
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
            navigateTo(route as any, {}, { reason: `admin_nav_${page}` });
        }
    };

    const filteredClasses = classes.filter(cls => {
        return cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cls.classCode.toLowerCase().includes(searchTerm.toLowerCase());
    });


    if (!isSuperAdmin) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Access Denied</h2>
                <p>This page is only accessible to super administrators.</p>
            </div>
        );
    }

    return (
        <AdminLayout
            pageTitle="Class Management"
            currentPage="classes"
            onNavigate={handleSidebarNavigate}
            onLogout={handleLogout}
            userRole={profile?.role}
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <Stack gap="md">
                    {/* Filters */}
                    <Group justify="space-between">
                        <Group>
                            <TextInput
                                placeholder="Search classes..."
                                leftSection={<IconSearch size={14} />}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.currentTarget.value)}
                                style={{ width: 300 }}
                            />
                        </Group>
                        <Button variant="light" onClick={loadData} disabled={loading}>Refresh List</Button>
                    </Group>

                    {/* Summary Stats */}
                    {!loading && classes.length > 0 && (
                        <Group gap="md">
                            <Badge size="lg" variant="filled" color="blue">
                                {classes.length} Total Classes
                            </Badge>
                            <Badge size="lg" variant="filled" color="teal">
                                {classes.reduce((sum, cls) => sum + (cls.studentCount || 0), 0)} Total Students
                            </Badge>
                        </Group>
                    )}

                    {/* Table */}
                    {loading ? (
                        <Group justify="center" py="xl"><Loader /></Group>
                    ) : filteredClasses.length === 0 ? (
                        <Text ta="center" py="xl" c="dimmed">No classes found matching criteria</Text>
                    ) : (
                        <Table striped highlightOnHover verticalSpacing="sm">
                            <thead>
                                <tr>
                                    <th>Class Name / Code</th>
                                    <th>Status</th>
                                    <th>Students</th>
                                    <th>Created</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredClasses.map(cls => (
                                    <tr key={cls.id}>
                                        <td>
                                            <Stack gap={2}>
                                                <Text fw={500}>{cls.name}</Text>
                                                <Badge size="xs" variant="outline">{cls.classCode}</Badge>
                                            </Stack>
                                        </td>
                                        <td>
                                            <Badge color={cls.status === 'active' ? 'green' : 'gray'}>
                                                {cls.status}
                                            </Badge>
                                        </td>
                                        <td>
                                            <Badge color="teal" variant="filled" leftSection={<IconUsers size={12} />}>
                                                {cls.studentCount || 0}
                                            </Badge>
                                        </td>
                                        <td>
                                            <Text size="sm" c="dimmed">
                                                {cls.createdAt ? new Date(cls.createdAt).toLocaleDateString() : 'N/A'}
                                            </Text>
                                        </td>
                                        <td>
                                            <Group justify="flex-end" gap="xs">
                                                <Tooltip label="View Details">
                                                    <ActionIcon onClick={() => navigateTo('TEACHER_CLASS_DETAIL', { classId: cls.id })}>
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
                                                        <Menu.Item leftSection={<IconEdit size={14} />}>Edit Class (Soon)</Menu.Item>
                                                        <Menu.Divider />
                                                        <Menu.Item color="red" leftSection={<IconTrash size={14} />}>Delete Class</Menu.Item>
                                                    </Menu.Dropdown>
                                                </Menu>
                                            </Group>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    )}
                </Stack>
            </div>
        </AdminLayout>
    );
};

export default AdminClassesPage;
