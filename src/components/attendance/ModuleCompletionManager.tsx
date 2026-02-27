/**
 * Module Completion Manager
 * 
 * Component for teachers to mark modules as complete and manage attendance.
 */

import { useState, useEffect } from 'react';
import { Card, Stack, Group, Button, Text, Badge, Table, Alert, Loader } from '@mantine/core';
import { IconCheck, IconAlertCircle, IconUsers } from '@tabler/icons-react';
import {
    getModuleAttendance,
    markModuleComplete,
    isModuleComplete,
    getModuleCompletion
} from '@/services/attendanceService';
import type { ModuleAttendance, ModuleCompletion } from '@/types/attendance.types';
import { ExceptionManager } from './ExceptionManager';

interface ModuleCompletionManagerProps {
    courseId: string;
    classId: string;
    moduleId: string;
    teacherId: string;
    teacherName: string;
    onCompletionChange?: () => void;
}

export function ModuleCompletionManager({
    courseId,
    classId,
    moduleId,
    teacherId,
    teacherName,
    onCompletionChange
}: ModuleCompletionManagerProps) {
    const [attendance, setAttendance] = useState<ModuleAttendance | null>(null);
    const [completion, setCompletion] = useState<ModuleCompletion | null>(null);
    const [loading, setLoading] = useState(true);
    const [marking, setMarking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [courseId, classId, moduleId]);

    const loadData = async () => {
        setLoading(true);
        setError(null);

        try {
            const [attendanceData, isComplete] = await Promise.all([
                getModuleAttendance(courseId, classId, moduleId),
                isModuleComplete(courseId, classId, moduleId)
            ]);

            setAttendance(attendanceData);

            if (isComplete) {
                const completionData = await getModuleCompletion(courseId, classId, moduleId);
                setCompletion(completionData);
            } else {
                setCompletion(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load attendance data');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkComplete = async () => {
        setMarking(true);
        setError(null);

        try {
            await markModuleComplete(courseId, classId, moduleId, teacherId, teacherName);
            await loadData();
            onCompletionChange?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to mark module as complete');
        } finally {
            setMarking(false);
        }
    };

    if (loading) {
        return (
            <Card withBorder>
                <Group justify="center" p="xl">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">Loading attendance data...</Text>
                </Group>
            </Card>
        );
    }

    if (error) {
        return (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
            </Alert>
        );
    }

    const attendancePercentage = attendance?.attendancePercentage || 0;
    const attendeeCount = attendance?.attendees.length || 0;
    const totalStudents = attendance?.totalStudentsInClass || 0;

    return (
        <Card withBorder>
            <Stack gap="md">
                {/* Header */}
                <Group justify="space-between">
                    <Group gap="xs">
                        <IconUsers size={20} />
                        <Text fw={600}>Module Attendance</Text>
                    </Group>
                    {completion ? (
                        <Badge color="green" leftSection={<IconCheck size={14} />}>
                            Completed
                        </Badge>
                    ) : (
                        <Badge color="gray">In Progress</Badge>
                    )}
                </Group>

                {/* Attendance Summary */}
                <Group gap="xl">
                    <div>
                        <Text size="xs" c="dimmed">Attendance Rate</Text>
                        <Text size="xl" fw={700} c={attendancePercentage >= 80 ? 'green' : attendancePercentage >= 60 ? 'yellow' : 'red'}>
                            {attendancePercentage.toFixed(0)}%
                        </Text>
                    </div>
                    <div>
                        <Text size="xs" c="dimmed">Students Attended</Text>
                        <Text size="xl" fw={700}>
                            {attendeeCount} / {totalStudents}
                        </Text>
                    </div>
                </Group>

                {/* Completion Info */}
                {completion && (
                    <Alert color="green" variant="light">
                        <Stack gap={4}>
                            <Text size="sm" fw={500}>Marked as complete</Text>
                            <Text size="xs" c="dimmed">
                                By {completion.completedByName} on {new Date(completion.completedAt).toLocaleDateString()}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {completion.totalAttendees} students attended at completion
                            </Text>
                        </Stack>
                    </Alert>
                )}

                {/* Attendee List */}
                {attendance && attendance.attendees.length > 0 && (
                    <div>
                        <Text size="sm" fw={500} mb="xs">Attendees</Text>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Student Name</Table.Th>
                                    <Table.Th>Joined At</Table.Th>
                                    <Table.Th>Test Result</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {attendance.attendees.map((attendee) => (
                                    <Table.Tr key={attendee.studentId}>
                                        <Table.Td>{attendee.studentName}</Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {new Date(attendee.joinedAt).toLocaleString()}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            {attendee.testResultId ? (
                                                <Badge color="green" size="sm">Submitted</Badge>
                                            ) : (
                                                <Badge color="gray" size="sm">Pending</Badge>
                                            )}
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </div>
                )}

                {/* Empty State */}
                {(!attendance || attendance.attendees.length === 0) && (
                    <Alert color="blue" variant="light">
                        <Text size="sm">No students have attended this module yet.</Text>
                    </Alert>
                )}

                {/* Exception Manager */}
                <ExceptionManager
                    courseId={courseId}
                    classId={classId}
                    moduleId={moduleId}
                    teacherId={teacherId}
                    teacherName={teacherName}
                    onExceptionChange={loadData}
                />

                {/* Mark Complete Button */}
                {!completion && (
                    <Button
                        onClick={handleMarkComplete}
                        loading={marking}
                        leftSection={<IconCheck size={16} />}
                        fullWidth
                    >
                        Mark Module as Complete
                    </Button>
                )}
            </Stack>
        </Card>
    );
}
