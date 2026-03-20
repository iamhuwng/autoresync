/**
 * StudentCard Component
 * 
 * Displays a single student in a premium card format.
 * Shows avatar, name, email, class, role, teacher assignments, and action buttons.
 * 
 * @example
 * <StudentCard
 *   student={studentData}
 *   variant="lavender"
 *   index={0}
 *   assignments={studentAssignments}
 *   teachers={teachersList}
 *   onViewAnalytics={() => navigate(...)}
 *   onEdit={() => handleEdit(student)}
 *   onAssignToTeacher={() => handleAssign(student)}
 *   onRelease={() => handleRelease(student)}
 *   onAddToClass={() => handleAddToClass(student)}
 *   isSuperAdmin={true}
 *   isTeacher={false}
 * />
 */

import { Group, Avatar, Text, Badge, Tooltip, ActionIcon } from '@mantine/core';
import { IconSchool, IconUser, IconEdit, IconUserPlus, IconBan } from '@tabler/icons-react';
import { Card, Button } from '../modern';
import type { UserProfile } from '../../services/userService';
import type { StudentTeacherAssignment } from '../../types/assignment.types';

export interface StudentCardProps {
    student: UserProfile;
    variant?: 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
    index: number;

    // Data
    assignments: StudentTeacherAssignment[];
    teachers: UserProfile[];

    // Actions
    onViewAnalytics: (studentId: string) => void;
    onEdit: (student: UserProfile) => void;
    onAssignToTeacher?: (student: UserProfile) => void;
    onRelease: (student: UserProfile) => void;
    onAddToClass?: (student: UserProfile) => void;

    // Permissions
    isSuperAdmin?: boolean;
    isTeacher?: boolean;
}

export function StudentCard({
    student,
    variant = 'lavender',
    index,
    assignments,
    teachers,
    onViewAnalytics,
    onEdit,
    onAssignToTeacher,
    onRelease,
    onAddToClass,
    isSuperAdmin = false,
    isTeacher = false
}: StudentCardProps) {
    const hasTeachers = assignments.length > 0;

    return (
        <div
            className="staggered-item"
            style={{ animationDelay: `${index * 0.05}s` }}
        >
            <Card
                variant={variant}
                hover
                style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    padding: '1.25rem'
                }}
            >
                {/* Header: Avatar + Name + Email */}
                <Group justify="space-between" align="flex-start">
                    <Group gap="md">
                        <div style={{ position: 'relative' }}>
                            <Avatar
                                src={student.photoURL}
                                radius="xl"
                                size="lg"
                                style={{ border: '3px solid white', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                            >
                                {student.displayName?.charAt(0).toUpperCase() || student.email?.charAt(0).toUpperCase()}
                            </Avatar>
                            {/* Status Indicator */}
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                backgroundColor: student.status === 'blocked' ? '#f87171' : '#4ade80',
                                border: '2px solid white'
                            }}></div>
                        </div>
                        <div>
                            <Text size="md" fw={900} c="dark" style={{ lineHeight: 1.2 }}>
                                {student.displayName || 'Unnamed User'}
                            </Text>
                            <Text size="xs" c="dimmed" fw={600} style={{ opacity: 0.8 }}>
                                {student.email}
                            </Text>
                        </div>
                    </Group>
                </Group>

                {/* Body: Class + Role Badges */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Group gap="xs">
                        <Badge variant="glass" color="indigo" size="xs" leftSection={<IconSchool size={10} />}>
                            {(student as any).studentGroup || 'No Class'}
                        </Badge>
                        <Badge variant="glass" color="violet" size="xs" leftSection={<IconUser size={10} />}>
                            {student.role?.toUpperCase() || 'STUDENT'}
                        </Badge>
                    </Group>

                    {/* Teacher Assignments */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.3)',
                        backdropFilter: 'blur(5px)',
                        borderRadius: '12px',
                        padding: '0.75rem',
                        border: '1px solid rgba(255, 255, 255, 0.4)'
                    }}>
                        <Text size="xs" fw={800} c="dimmed" mb={6} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Oversight
                        </Text>
                        {!hasTeachers ? (
                            <Text size="sm" fw={700} c="orange">Floating (Unlinked)</Text>
                        ) : (
                            <Group gap={4}>
                                {assignments.map((assignment, i) => {
                                    const teacher = teachers.find(t => t.uid === assignment.teacherId);
                                    return (
                                        <Tooltip label={teacher?.email || 'Teacher'} key={i} withArrow>
                                            <Badge variant="filled" color="indigo" size="xs" style={{ cursor: 'help' }}>
                                                {teacher?.displayName?.split(' ')[0] || 'Teacher'}
                                            </Badge>
                                        </Tooltip>
                                    );
                                })}
                            </Group>
                        )}
                    </div>
                </div>

                {/* Footer: Action Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <Button
                        variant="primary"
                        size="sm"
                        style={{ flex: 1 }}
                        onClick={() => onViewAnalytics(student.uid)}
                    >
                        Analytics
                    </Button>
                    <Group gap={4}>
                        {/* Edit */}
                        <ActionIcon
                            variant="glass"
                            size="lg"
                            radius="md"
                            onClick={() => onEdit(student)}
                        >
                            <IconEdit size={18} />
                        </ActionIcon>

                        {/* Assign to Teacher (Super Admin Only) */}
                        {isSuperAdmin && onAssignToTeacher && (
                            <Tooltip label="Assign to Teacher">
                                <ActionIcon
                                    variant="glass"
                                    size="lg"
                                    radius="md"
                                    color="indigo"
                                    onClick={() => onAssignToTeacher(student)}
                                    aria-label="Assign to Teacher"
                                >
                                    <IconUserPlus size={18} />
                                </ActionIcon>
                            </Tooltip>
                        )}

                        {/* Release/Block */}
                        <ActionIcon
                            variant="glass"
                            size="lg"
                            radius="md"
                            color="red"
                            onClick={() => onRelease(student)}
                            aria-label="Release from Teacher(s)"
                        >
                            <IconBan size={18} />
                        </ActionIcon>

                        {/* Add to Class (Teacher Only) */}
                        {isTeacher && onAddToClass && (
                            <Tooltip label="Add to Class">
                                <ActionIcon
                                    variant="glass"
                                    size="lg"
                                    radius="md"
                                    color="teal"
                                    onClick={() => onAddToClass(student)}
                                    aria-label="Add to Class"
                                >
                                    <IconSchool size={18} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                </div>
            </Card>
        </div>
    );
}
