import React from 'react';
import { Group, Avatar, Text, Badge, Tooltip, ActionIcon } from '@mantine/core';
import { IconEdit, IconUserPlus, IconTrash } from '@tabler/icons-react';
import { User, Assignment } from './admin.types';

interface TeacherTableProps {
    teachers: User[];
    assignmentsByTeacher: Record<string, Assignment[]>;
    onEdit: (user: User) => void;
    onAssignStudents: (user: User, mode: 'assign-students') => void;
    onDelete: (user: User) => void;
    isSuperAdmin: boolean;
    activeTab: string;
}

export const TeacherTable: React.FC<TeacherTableProps> = ({
    teachers,
    assignmentsByTeacher,
    onEdit,
    onAssignStudents,
    onDelete,
    isSuperAdmin,
    activeTab,
}) => {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="glass-table">
                <thead>
                    <tr>
                        <th>Identification</th>
                        <th>Role Path</th>
                        {activeTab === 'teachers' && <th>Managed Student Count</th>}
                        <th>Activity Status</th>
                        <th style={{ textAlign: 'right' }}>Admin Controls</th>
                    </tr>
                </thead>
                <tbody>
                    {teachers.map((teacher, index) => (
                        <tr
                            key={teacher.uid}
                            className="glass-row staggered-item"
                            style={{ animationDelay: `${index * 0.05}s` }}
                        >
                            {/* Identification */}
                            <td>
                                <Group gap="sm">
                                    <Avatar src={teacher.photoURL} radius="xl" size="md">
                                        {teacher.displayName?.charAt(0).toUpperCase() || teacher.email?.charAt(0).toUpperCase()}
                                    </Avatar>
                                    <div>
                                        <Text size="sm" fw={800} c="dark">
                                            {teacher.displayName || 'Unnamed User'}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            {teacher.email}
                                        </Text>
                                    </div>
                                </Group>
                            </td>

                            {/* Role Path */}
                            <td>
                                <Badge
                                    variant="gradient"
                                    gradient={
                                        teacher.role === 'super_admin'
                                            ? { from: 'violet', to: 'indigo' }
                                            : { from: 'blue', to: 'cyan' }
                                    }
                                    style={{ fontWeight: 800 }}
                                >
                                    {teacher.role === 'super_admin' ? 'SYSTEM ADMIN' : 'TEACHER'}
                                </Badge>
                            </td>

                            {/* Managed Student Count */}
                            {activeTab === 'teachers' && (
                                <td>
                                    {(() => {
                                        const count = (assignmentsByTeacher[teacher.uid] || []).length;
                                        return (
                                            <Badge color="indigo" variant="glass" size="sm">
                                                {count} Assigned Students
                                            </Badge>
                                        );
                                    })()}
                                </td>
                            )}

                            {/* Activity Status */}
                            <td>
                                <Badge color={teacher.status === 'blocked' ? 'red' : 'green'} variant="light">
                                    {teacher.status?.toUpperCase() || 'ACTIVE'}
                                </Badge>
                            </td>

                            {/* Admin Controls */}
                            <td>
                                <Group justify="flex-end" gap="xs">
                                    <Tooltip label="Edit Profile">
                                        <ActionIcon variant="glass" color="blue" onClick={() => onEdit(teacher)}>
                                            <IconEdit size={18} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="Assign Students">
                                        <ActionIcon
                                            variant="glass"
                                            color="indigo"
                                            onClick={() => onAssignStudents(teacher, 'assign-students')}
                                            aria-label="Assign Students"
                                        >
                                            <IconUserPlus size={18} />
                                        </ActionIcon>
                                    </Tooltip>
                                    {isSuperAdmin && (
                                        <Tooltip label="Delete Access">
                                            <ActionIcon variant="glass" color="red" onClick={() => onDelete(teacher)}>
                                                <IconTrash size={18} />
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </Group>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
