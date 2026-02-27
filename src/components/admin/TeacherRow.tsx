/**
 * TeacherRow Component
 * 
 * Displays a single teacher in a table row format.
 * Shows avatar, name, email, role badge, student count, status, and action buttons.
 * 
 * @example
 * <table className="glass-table">
 *   <thead>
 *     <tr>
 *       <th>Identification</th>
 *       <th>Role Path</th>
 *       <th>Managed Student Count</th>
 *       <th>Activity Status</th>
 *       <th>Admin Controls</th>
 *     </tr>
 *   </thead>
 *   <tbody>
 *     <TeacherRow
 *       teacher={teacherData}
 *       index={0}
 *       studentCount={15}
 *       onEdit={() => handleEdit(teacher)}
 *       onAssignStudents={() => handleAssign(teacher)}
 *       onDelete={() => handleDelete(teacher)}
 *       isSuperAdmin={true}
 *     />
 *   </tbody>
 * </table>
 */

import { Group, Avatar, Text, Badge, Tooltip, ActionIcon } from '@mantine/core';
import { IconEdit, IconUserPlus, IconTrash } from '@tabler/icons-react';
import type { UserProfile } from '../../services/userService';

export interface TeacherRowProps {
    teacher: UserProfile;
    index: number;
    studentCount: number;

    // Actions
    onEdit: (teacher: UserProfile) => void;
    onAssignStudents: (teacher: UserProfile) => void;
    onDelete?: (teacher: UserProfile) => void;

    // Permissions
    isSuperAdmin?: boolean;
}

export function TeacherRow({
    teacher,
    index,
    studentCount,
    onEdit,
    onAssignStudents,
    onDelete,
    isSuperAdmin = false
}: TeacherRowProps) {
    const isSuperAdminRole = teacher.role === 'super_admin';

    return (
        <tr
            className="glass-row staggered-item"
            style={{ animationDelay: `${index * 0.05}s` }}
        >
            {/* Identification: Avatar + Name + Email */}
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
                    gradient={isSuperAdminRole ? { from: 'violet', to: 'indigo' } : { from: 'blue', to: 'cyan' }}
                    style={{ fontWeight: 800 }}
                >
                    {isSuperAdminRole ? 'SYSTEM ADMIN' : 'TEACHER'}
                </Badge>
            </td>

            {/* Managed Student Count */}
            <td>
                <Badge color="indigo" variant="glass" size="sm">
                    {studentCount} Assigned Student{studentCount !== 1 ? 's' : ''}
                </Badge>
            </td>

            {/* Activity Status */}
            <td>
                <Badge color={teacher.status === 'blocked' ? 'red' : 'green'} variant="light">
                    {teacher.status?.toUpperCase() || 'ACTIVE'}
                </Badge>
            </td>

            {/* Admin Controls */}
            <td>
                <Group justify="flex-end" gap="xs">
                    {/* Edit Profile */}
                    <Tooltip label="Edit Profile">
                        <ActionIcon variant="glass" color="blue" onClick={() => onEdit(teacher)}>
                            <IconEdit size={18} />
                        </ActionIcon>
                    </Tooltip>

                    {/* Assign Students */}
                    <Tooltip label="Assign Students">
                        <ActionIcon
                            variant="glass"
                            color="indigo"
                            onClick={() => onAssignStudents(teacher)}
                            aria-label="Assign Students"
                        >
                            <IconUserPlus size={18} />
                        </ActionIcon>
                    </Tooltip>

                    {/* Delete Access (Super Admin Only) */}
                    {isSuperAdmin && onDelete && (
                        <Tooltip label="Delete Access">
                            <ActionIcon variant="glass" color="red" onClick={() => onDelete(teacher)}>
                                <IconTrash size={18} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            </td>
        </tr>
    );
}
