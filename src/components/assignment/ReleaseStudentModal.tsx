/**
 * Release Student Modal Component
 * 
 * Handles releasing a student from a teacher's oversight.
 * Includes option to unenroll from associated courses.
 */

import React, { useState, useEffect } from 'react';
import {
    Modal,
    Stack,
    Button,
    Group,
    Text,
    Alert,
    Checkbox,
    MultiSelect,
    Divider
} from '@mantine/core';
import { IconAlertCircle, IconUserMinus } from '@tabler/icons-react';
import { StudentTeacherAssignment } from '../../types/assignment.types';

interface ReleaseStudentModalProps {
    opened: boolean;
    onClose: () => void;
    student: {
        uid: string;
        displayName: string;
        email: string;
    } | null;
    assignments: StudentTeacherAssignment[];
    currentTeacherId?: string | null; // If provided, only release from THIS teacher
    availableCourses: Array<{ value: string; label: string }>;
    onConfirm: (assignmentIds: string[], unenrollCourseIds: string[]) => Promise<void>;
}

export const ReleaseStudentModal: React.FC<ReleaseStudentModalProps> = ({
    opened,
    onClose,
    student,
    assignments,
    currentTeacherId,
    availableCourses,
    onConfirm
}) => {
    // State
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [unenrollFromCourses, setUnenrollFromCourses] = useState(false);
    const [selectedCoursesToUnenroll, setSelectedCoursesToUnenroll] = useState<string[]>([]);

    // Filter assignments to only those for the current teacher if applicable
    const relevantAssignments = currentTeacherId
        ? assignments.filter(a => a.teacherId === currentTeacherId && a.status === 'active')
        : assignments.filter(a => a.status === 'active');

    // Get all enrolled courses for this student from the relevant assignments
    const enrolledCourseIds = Array.from(new Set(
        relevantAssignments.flatMap(a => a.coursesEnrolled || [])
    ));

    // Filter available courses to only those the student is actually enrolled in
    const filteredAvailableCourses = availableCourses.filter(c => enrolledCourseIds.includes(c.value));

    // Reset when modal opens/closes
    useEffect(() => {
        if (!opened) {
            setUnenrollFromCourses(false);
            setSelectedCoursesToUnenroll([]);
            setError(null);
        } else if (enrolledCourseIds.length > 0) {
            // Default to selecting all currently enrolled courses if unenroll is toggled
            setSelectedCoursesToUnenroll(enrolledCourseIds);
        }
    }, [opened]);

    const handleConfirm = async () => {
        if (!student || relevantAssignments.length === 0) return;

        setLoading(true);
        setError(null);

        try {
            const assignmentIds = relevantAssignments.map(a => a.id);
            await onConfirm(assignmentIds, unenrollFromCourses ? selectedCoursesToUnenroll : []);
            onClose();
        } catch (err) {
            console.error('Error in release modal:', err);
            setError(err instanceof Error ? err.message : 'Failed to release student');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <IconUserMinus size={20} color="orange" />
                    <Text fw={600}>Release Student</Text>
                </Group>
            }
            size="md"
            centered
        >
            <Stack spacing="md">
                {student && (
                    <Text size="sm">
                        Are you sure you want to release <strong>{student.displayName || student.email}</strong> from {currentTeacherId ? 'your oversight' : 'all assigned teachers'}?
                    </Text>
                )}

                {relevantAssignments.length > 1 && !currentTeacherId && (
                    <Alert color="orange" icon={<IconAlertCircle size={16} />}>
                        This student is assigned to {relevantAssignments.length} teachers. Releasing will remove all these assignments.
                    </Alert>
                )}

                {error && (
                    <Alert color="red" icon={<IconAlertCircle size={16} />}>
                        {error}
                    </Alert>
                )}

                {enrolledCourseIds.length > 0 && (
                    <>
                        <Divider label="Course Access" labelPosition="center" />

                        <Checkbox
                            label="Also unenroll from courses?"
                            description="Remove the student from selected courses associated with this assignment"
                            checked={unenrollFromCourses}
                            onChange={(e) => setUnenrollFromCourses(e.currentTarget.checked)}
                            disabled={loading}
                        />

                        {unenrollFromCourses && filteredAvailableCourses.length > 0 && (
                            <MultiSelect
                                label="Select Courses to Unenroll"
                                placeholder="Choose courses"
                                data={filteredAvailableCourses}
                                value={selectedCoursesToUnenroll}
                                onChange={setSelectedCoursesToUnenroll}
                                disabled={loading}
                                clearable
                            />
                        )}

                        {unenrollFromCourses && filteredAvailableCourses.length === 0 && enrolledCourseIds.length > 0 && (
                            <Text size="xs" c="dimmed" fs="italic">
                                Note: Student is enrolled in {enrolledCourseIds.length} course(s), but course names are not available.
                            </Text>
                        )}
                    </>
                )}

                <Group position="right" mt="md">
                    <Button variant="subtle" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        color="orange"
                        onClick={handleConfirm}
                        loading={loading}
                        disabled={relevantAssignments.length === 0}
                    >
                        Confirm Release
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
