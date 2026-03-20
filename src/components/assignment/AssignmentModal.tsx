/**
 * Assignment Modal Component
 * 
 * Handles student-teacher assignments with two modes:
 * 1. assign-to-teacher: Assign a single student to a teacher
 * 2. assign-students: Assign multiple students to a teacher
 */

import React, { useState, useEffect } from 'react';
import {
    Modal,
    Stack,
    Select,
    MultiSelect,
    Button,
    Group,
    Text,
    Alert,
    Checkbox,
    Divider,
    Avatar
} from '@mantine/core';
import { IconAlertCircle, IconUserPlus, IconUsers } from '@tabler/icons-react';
import { createAssignment } from '../../services/assignmentManager';

interface AssignmentModalProps {
    opened: boolean;
    onClose: () => void;
    mode: 'assign-to-teacher' | 'assign-students';
    // For assign-to-teacher mode
    student?: {
        uid: string;
        displayName: string;
        email: string;
    };
    // For assign-students mode
    teacher?: {
        uid: string;
        displayName: string;
        email: string;
    };
    // Available options
    teachers: Array<{ value: string; label: string; email?: string; photoURL?: string | null; avatarUrl?: string | null }>;
    students: Array<{ value: string; label: string }>;
    courses?: Array<{ value: string; label: string }>;
    // Callbacks
    onSuccess: () => void;
    currentUserId: string; // Admin who is making the assignment
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
    opened,
    onClose,
    mode,
    student,
    teacher,
    teachers,
    students,
    courses = [],
    onSuccess,
    currentUserId
}) => {
    // Form state
    const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
    const [enrollInCourses, setEnrollInCourses] = useState(false);

    // UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form when modal opens/closes or mode changes
    useEffect(() => {
        if (!opened) {
            setSelectedTeacher(null);
            setSelectedStudents([]);
            setSelectedCourses([]);
            setEnrollInCourses(false);
            setError(null);
        }
    }, [opened]);

    const handleSubmit = async () => {
        setError(null);
        setLoading(true);

        // Validate currentUserId (assignedBy) is present
        if (!currentUserId) {
            setError('Authentication error: Unable to determine admin user. Please refresh the page and try again.');
            setLoading(false);
            return;
        }

        try {
            if (mode === 'assign-to-teacher') {
                // Validate
                if (!student || !selectedTeacher) {
                    setError('Please select a teacher');
                    setLoading(false);
                    return;
                }

                // Debug logging - identify missing fields
                console.log('[AssignmentModal] Creating assignment:', {
                    studentId: student?.uid,
                    teacherId: selectedTeacher,
                    assignedBy: currentUserId,
                    studentObj: student
                });

                // Validate student.uid specifically
                if (!student.uid) {
                    setError('Error: Student ID is missing. Please refresh and try again.');
                    console.error('[AssignmentModal] student.uid is missing:', student);
                    setLoading(false);
                    return;
                }

                // Create assignment
                const result = await createAssignment(
                    student.uid,
                    selectedTeacher,
                    currentUserId,
                    enrollInCourses ? selectedCourses : undefined
                );

                if (!result.success) {
                    setError(result.error || 'Failed to create assignment');
                    setLoading(false);
                    return;
                }

                onSuccess();
                onClose();
            } else {
                // assign-students mode
                if (!teacher || selectedStudents.length === 0) {
                    setError('Please select at least one student');
                    setLoading(false);
                    return;
                }

                // Create assignments for all selected students
                const results = await Promise.all(
                    selectedStudents.map(studentId =>
                        createAssignment(
                            studentId,
                            teacher.uid,
                            currentUserId,
                            enrollInCourses ? selectedCourses : undefined
                        )
                    )
                );

                // Check for failures
                const failures = results.filter(r => !r.success);
                if (failures.length > 0) {
                    setError(`Failed to assign ${failures.length} student(s). ${failures[0].error || ''}`);
                    setLoading(false);
                    return;
                }

                onSuccess();
                onClose();
            }
        } catch (err) {
            console.error('Error creating assignment:', err);
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const getTitle = () => {
        if (mode === 'assign-to-teacher') {
            return `Assign Student to Teacher`;
        }
        return `Assign Students to Teacher`;
    };

    const getIcon = () => {
        if (mode === 'assign-to-teacher') {
            return <IconUserPlus size={20} />;
        }
        return <IconUsers size={20} />;
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    {getIcon()}
                    <Text fw={600}>{getTitle()}</Text>
                </Group>
            }
            size="md"
            centered
        >
            <Stack spacing="md">
                {/* Show current context */}
                {mode === 'assign-to-teacher' && student && (
                    <Alert color="blue" variant="light">
                        <Text size="sm">
                            <strong>Student:</strong> {student.displayName || student.email}
                        </Text>
                    </Alert>
                )}

                {mode === 'assign-students' && teacher && (
                    <Alert color="blue" variant="light">
                        <Text size="sm">
                            <strong>Teacher:</strong> {teacher.displayName || teacher.email}
                        </Text>
                    </Alert>
                )}

                {/* Error Alert */}
                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
                        {error}
                    </Alert>
                )}

                {/* Selection Fields */}
                {mode === 'assign-to-teacher' ? (
                    <Select
                        label="Select Teacher"
                        placeholder="Choose a teacher to assign this student to"
                        data={teachers}
                        value={selectedTeacher}
                        onChange={setSelectedTeacher}
                        searchable
                        required
                        disabled={loading}
                        renderOption={({ option }) => {
                            const teacher = teachers.find(t => t.value === option.value);
                            const avatarSrc = teacher?.avatarUrl || teacher?.photoURL || undefined;
                            const email = teacher?.email;
                            return (
                                <Group gap="sm" wrap="nowrap">
                                    <Avatar
                                        src={avatarSrc}
                                        size={32}
                                        radius="xl"
                                        color="indigo"
                                    >
                                        {option.label?.charAt(0)?.toUpperCase()}
                                    </Avatar>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Text size="sm" fw={500} truncate="end">{option.label}</Text>
                                        {email && (
                                            <Text size="xs" c="dimmed" truncate="end">{email}</Text>
                                        )}
                                    </div>
                                </Group>
                            );
                        }}
                    />
                ) : (
                    <MultiSelect
                        label="Select Students"
                        placeholder="Choose students to assign to this teacher"
                        data={students}
                        value={selectedStudents}
                        onChange={setSelectedStudents}
                        searchable
                        required
                        disabled={loading}
                        description={`${selectedStudents.length} student(s) selected`}
                    />
                )}

                {/* Optional Course Enrollment */}
                {courses.length > 0 && (
                    <>
                        <Divider label="Optional" labelPosition="center" />

                        <Checkbox
                            label="Also enroll in courses"
                            description="Automatically enroll the student(s) in selected courses"
                            checked={enrollInCourses}
                            onChange={(e) => setEnrollInCourses(e.currentTarget.checked)}
                            disabled={loading}
                        />

                        {enrollInCourses && (
                            <MultiSelect
                                label="Select Courses"
                                placeholder="Choose courses for enrollment"
                                data={courses}
                                value={selectedCourses}
                                onChange={setSelectedCourses}
                                searchable
                                disabled={loading}
                            />
                        )}
                    </>
                )}

                {/* Action Buttons */}
                <Group position="right" mt="md">
                    <Button variant="subtle" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        loading={loading}
                        disabled={
                            mode === 'assign-to-teacher'
                                ? !selectedTeacher
                                : selectedStudents.length === 0
                        }
                    >
                        {mode === 'assign-to-teacher' ? 'Assign Student' : `Assign ${selectedStudents.length} Student(s)`}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default AssignmentModal;
