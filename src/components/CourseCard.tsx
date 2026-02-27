
import React from 'react';
import { Card, CardBody, CardFooter, Button } from './modern';
import type { Course } from '../types/course.types';
import { Badge, Group, Text, ActionIcon, Menu } from '@mantine/core';
import { IconEdit, IconArchive, IconEye, IconDots, IconTrash, IconSchool, IconClock } from '@tabler/icons-react';

interface CourseCardProps {
    course: Course;
    onEdit: (course: Course) => void;
    onArchive: (course: Course) => void;
    onView: (course: Course) => void;
    onRestore: (course: Course) => void;
    onDelete?: (course: Course) => void; // Hard delete if needed
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

export const CourseCard: React.FC<CourseCardProps> = ({ course, onEdit, onArchive, onView, onRestore, onDelete, variant = 'glass' }) => {
    const isArchived = !!course.archivedAt;

    return (
        <Card
            variant={isArchived ? 'glass' : variant}
            hover={!isArchived}
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                opacity: isArchived ? 0.7 : 1,
                filter: isArchived ? 'grayscale(80%)' : 'none',
            }}
        >
            <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                    <Group justify="space-between" mb="xs">
                        <Badge color="blue" variant="light" size="xs">{course.type || 'Unknown'}</Badge>
                        {isArchived && <Badge color="gray" size="xs">Archived</Badge>}
                    </Group>

                    <h3 style={{
                        fontSize: '1.25rem',
                        fontWeight: '700',
                        color: '#1e293b',
                        margin: '0 0 0.5rem 0',
                        lineHeight: 1.3
                    }}>
                        {course.name || 'Unnamed Course'}
                    </h3>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <Badge color="gray" variant="outline" size="sm">
                            Code: {course.code || 'N/A'}
                        </Badge>
                        {course.visibility === 'public' && (
                            <Badge color="green" variant="outline" size="sm">Public</Badge>
                        )}
                        {course.visibility === 'private' && (
                            <Badge color="gray" variant="outline" size="sm">Private</Badge>
                        )}
                    </div>

                    {isArchived && course.hardDeleteAt && (
                        <Text size="xs" color="red" fw={700} mt="xs" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <IconClock size={14} />
                            Deletes in {Math.max(0, Math.ceil((course.hardDeleteAt - Date.now()) / (1000 * 60 * 60 * 24)))} days
                        </Text>
                    )}
                </div>

                {course.description && (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                        {course.description}
                    </Text>
                )}

                <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                    <Group gap="xs">
                        <IconSchool size={16} style={{ color: '#64748b' }} />
                        <Text size="xs" c="dimmed">
                            Duration: {course.duration?.value ?? 'N/A'} {course.duration?.unit ?? ''}
                        </Text>
                    </Group>
                </div>
            </CardBody>

            <CardFooter style={{ gap: '0.5rem', justifyContent: 'space-between' }}>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onView(course)}
                    style={{ flex: 1 }}
                >
                    <IconEye size={16} style={{ marginRight: '0.25rem' }} />
                    View
                </Button>
                <Menu shadow="md" width={200}>
                    <Menu.Target>
                        <ActionIcon variant="light" size="lg">
                            <IconDots size={20} />
                        </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEdit(course)}>Edit Course</Menu.Item>
                        {/* <Menu.Item leftSection={<IconCopy size={14} />}>Duplicate</Menu.Item> */}

                        <Menu.Divider />

                        {!isArchived ? (
                            <Menu.Item color="orange" leftSection={<IconArchive size={14} />} onClick={() => onArchive(course)}>
                                Archive
                            </Menu.Item>
                        ) : (
                            <>
                                <Menu.Item color="blue" leftSection={<IconArchive size={14} />} onClick={() => onRestore(course)}>
                                    Restore Course
                                </Menu.Item>
                                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onDelete && onDelete(course)}>
                                    Delete Permanently
                                </Menu.Item>
                            </>
                        )}
                    </Menu.Dropdown>
                </Menu>
            </CardFooter>
        </Card>
    );
};
