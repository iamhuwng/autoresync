/**
 * Exception Manager
 * 
 * Component for managing student exceptions (excused absences) for modules.
 */

import { useState, useEffect } from 'react';
import { Stack, Group, Button, Text, TextInput, Table, ActionIcon, Badge, Collapse, Alert } from '@mantine/core';
import { IconPlus, IconTrash, IconChevronDown, IconChevronUp, IconAlertCircle } from '@tabler/icons-react';
import {
    getModuleExceptions,
    addException,
    removeException
} from '@/services/attendanceService';
import type { ModuleException } from '@/types/attendance.types';

interface ExceptionManagerProps {
    courseId: string;
    classId: string;
    moduleId: string;
    teacherId: string;
    teacherName: string;
    onExceptionChange?: () => void;
}

export function ExceptionManager({
    courseId,
    classId,
    moduleId,
    teacherId,
    teacherName,
    onExceptionChange
}: ExceptionManagerProps) {
    const [exceptions, setExceptions] = useState<ModuleException[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);

    // Add exception form state
    const [addingException, setAddingException] = useState(false);
    const [newStudentId, setNewStudentId] = useState('');
    const [newStudentName, setNewStudentName] = useState('');
    const [newReason, setNewReason] = useState('');

    useEffect(() => {
        loadExceptions();
    }, [courseId, classId, moduleId]);

    const loadExceptions = async () => {
        setError(null);

        try {
            const data = await getModuleExceptions(courseId, classId, moduleId);
            setExceptions(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load exceptions');
        }
    };

    const handleAddException = async () => {
        if (!newStudentId.trim() || !newStudentName.trim() || !newReason.trim()) {
            setError('Please fill in all fields');
            return;
        }

        setAddingException(true);
        setError(null);

        try {
            await addException(
                courseId,
                classId,
                moduleId,
                newStudentId.trim(),
                newStudentName.trim(),
                newReason.trim(),
                teacherId,
                teacherName
            );

            // Reset form
            setNewStudentId('');
            setNewStudentName('');
            setNewReason('');

            // Reload exceptions
            await loadExceptions();
            onExceptionChange?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add exception');
        } finally {
            setAddingException(false);
        }
    };

    const handleRemoveException = async (studentId: string) => {
        if (!confirm('Are you sure you want to remove this exception?')) {
            return;
        }

        setError(null);

        try {
            await removeException(courseId, classId, moduleId, studentId);
            await loadExceptions();
            onExceptionChange?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove exception');
        }
    };

    return (
        <Stack gap="sm">
            {/* Header */}
            <Group justify="space-between">
                <Group gap="xs">
                    <Text size="sm" fw={500}>Exceptions</Text>
                    {exceptions.length > 0 && (
                        <Badge size="sm" color="blue">{exceptions.length}</Badge>
                    )}
                </Group>
                <ActionIcon
                    variant="subtle"
                    onClick={() => setExpanded(!expanded)}
                    aria-label="Toggle exceptions"
                >
                    {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                </ActionIcon>
            </Group>

            {/* Collapsible Content */}
            <Collapse in={expanded}>
                <Stack gap="md">
                    {/* Error Display */}
                    {error && (
                        <Alert color="red" icon={<IconAlertCircle size={16} />} onClose={() => setError(null)} withCloseButton>
                            {error}
                        </Alert>
                    )}

                    {/* Add Exception Form */}
                    <Stack gap="xs">
                        <Text size="xs" fw={500} c="dimmed">Add Exception</Text>
                        <Group align="flex-end">
                            <TextInput
                                placeholder="Student ID"
                                value={newStudentId}
                                onChange={(e) => setNewStudentId(e.currentTarget.value)}
                                style={{ flex: 1 }}
                            />
                            <TextInput
                                placeholder="Student Name"
                                value={newStudentName}
                                onChange={(e) => setNewStudentName(e.currentTarget.value)}
                                style={{ flex: 1 }}
                            />
                            <TextInput
                                placeholder="Reason (e.g., Sick leave)"
                                value={newReason}
                                onChange={(e) => setNewReason(e.currentTarget.value)}
                                style={{ flex: 2 }}
                            />
                            <Button
                                onClick={handleAddException}
                                loading={addingException}
                                leftSection={<IconPlus size={16} />}
                            >
                                Add
                            </Button>
                        </Group>
                    </Stack>

                    {/* Exceptions List */}
                    {exceptions.length > 0 ? (
                        <Table striped>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Student</Table.Th>
                                    <Table.Th>Reason</Table.Th>
                                    <Table.Th>Added By</Table.Th>
                                    <Table.Th>Date</Table.Th>
                                    <Table.Th></Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {exceptions.map((exception) => (
                                    <Table.Tr key={exception.studentId}>
                                        <Table.Td>
                                            <Text size="sm">{exception.studentName}</Text>
                                            <Text size="xs" c="dimmed">{exception.studentId}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm">{exception.reason}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">{exception.addedByName}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {new Date(exception.addedAt).toLocaleDateString()}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <ActionIcon
                                                color="red"
                                                variant="subtle"
                                                onClick={() => handleRemoveException(exception.studentId)}
                                                aria-label="Remove exception"
                                            >
                                                <IconTrash size={16} />
                                            </ActionIcon>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    ) : (
                        <Alert color="blue" variant="light">
                            <Text size="sm">No exceptions added yet.</Text>
                        </Alert>
                    )}
                </Stack>
            </Collapse>
        </Stack>
    );
}
