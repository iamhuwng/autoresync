
import React, { useState, useEffect } from 'react';
import {
    Modal, MultiSelect, Button, Group, Stack, Alert
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { enrollStudentInCourse } from '../../services/enrollmentManager';
import { getAllUsersSecure } from '../../services/userService';
import { useSecureService } from '../../hooks/useSecureService';
import type { Course } from '../../types/course.types';
import type { UserProfile } from '../../types/user.types';
import { notifications } from '@mantine/notifications';

interface AdminEnrollmentModalProps {
    opened: boolean;
    onClose: () => void;
    course: Course | null;
    onSuccess: () => void;
}

export const AdminEnrollmentModal: React.FC<AdminEnrollmentModalProps> = ({
    opened,
    onClose,
    course,
    onSuccess
}) => {
    const { authContext } = useSecureService();
    const [students, setStudents] = useState<UserProfile[]>([]);
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (opened) {
            loadStudents();
        } else {
            setSelectedStudents([]);
            setError(null);
        }
    }, [opened]);

    const loadStudents = async () => {
        try {
            // Use secure version with auth context (PRD-0016 Task 3.11)
            const allUsers = await getAllUsersSecure(authContext);
            setStudents(allUsers.filter(u => u.role === 'student') as any);
        } catch (err) {
            console.error('Error loading students for enrollment:', err);
        }
    };

    const handleEnroll = async () => {
        if (!course || selectedStudents.length === 0) return;

        setLoading(true);
        setError(null);

        try {
            const results = await Promise.all(
                selectedStudents.map(studentId =>
                    enrollStudentInCourse(studentId, course.id, 'individual')
                )
            );

            const failures = results.filter(r => !r.success);

            if (failures.length > 0) {
                setError(`Failed to enroll ${failures.length} student(s)`);
            } else {
                notifications.show({
                    title: 'Success',
                    message: `Enrolled ${selectedStudents.length} student(s) in ${course.name}`,
                    color: 'green'
                });
                onSuccess();
                onClose();
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={`Enroll Students in "${course?.name}"`}
            centered
        >
            <Stack gap="md">
                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} color="red">
                        {error}
                    </Alert>
                )}

                <MultiSelect
                    label="Select Students"
                    placeholder="Choose students to enroll"
                    data={students.map(s => ({
                        value: s.uid,
                        label: `${s.displayName || s.email} (${s.email})`
                    }))}
                    value={selectedStudents}
                    onChange={setSelectedStudents}
                    searchable
                    nothingFoundMessage="No students found"
                />

                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button onClick={handleEnroll} loading={loading} disabled={selectedStudents.length === 0}>
                        Enroll {selectedStudents.length} student(s)
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
