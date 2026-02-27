import React, { useEffect, useState } from 'react';
import {
    Table, Group, Text, Button, ActionIcon,
    Badge, Stack, Loader, Alert, Tooltip, Modal, TextInput
} from '@mantine/core';
import {
    IconCheck, IconX, IconClock, IconUser, IconCalendar
} from '@tabler/icons-react';
import { getRequestsByCourse, processCourseRequest } from '../../services/courseRequestManager';
import { enrollStudentInCourse, unenrollStudent } from '../../services/enrollmentManager';
import { createNotification } from '../../services/notificationService';
import type { CourseRequest } from '../../types/course.types';
import { useAuth } from '../../hooks/useAuth';

interface RequestReviewListProps {
    courseId: string;
    courseName?: string;
}

export const RequestReviewList: React.FC<RequestReviewListProps> = ({ courseId, courseName }) => {
    const { user } = useAuth();
    const [requests, setRequests] = useState<CourseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState<string | null>(null);

    // Denial Modal State
    const [denialRequest, setDenialRequest] = useState<CourseRequest | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        loadRequests();
    }, [courseId]);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const data = await getRequestsByCourse(courseId);
            setRequests(data.filter(r => r.status === 'pending'));
        } catch (err) {
            setError('Failed to load requests');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (request: CourseRequest) => {
        if (!user) return;
        setProcessing(request.id);
        try {
            // 1. Update Database (Actual Enrollment/Unenrollment)
            if (request.type === 'join') {
                const res = await enrollStudentInCourse(
                    request.studentId,
                    request.courseId,
                    'individual', // Public courses usually use 'public', 
                    // but protected joining via request is 'individual'?
                    // Let's stick to what's appropriate.
                    // PRD says protected courses create enrollment on approve.
                    undefined
                );
                if (!res.success) throw new Error(res.error);
            } else {
                const res = await unenrollStudent(request.studentId, request.courseId);
                if (!res.success) throw new Error(res.error);
            }

            // 2. Mark request as approved
            await processCourseRequest(request.id, 'approved', user.uid);

            // 3. Send Notification
            await createNotification({
                userId: request.studentId,
                type: 'success',
                title: request.type === 'join' ? 'Enrollment Approved' : 'Unenrollment Approved',
                message: request.type === 'join'
                    ? `You have been enrolled in ${courseName || request.courseName || 'the course'}.`
                    : `Your unenrollment from ${courseName || request.courseName || 'the course'} has been approved.`,
                link: request.type === 'join' ? `/student/courses/${request.courseId}` : '/student/courses'
            });

            // 4. Update UI
            setRequests(prev => prev.filter(r => r.id !== request.id));
        } catch (err) {
            alert('Failed to approve request: ' + (err instanceof Error ? err.message : 'Unknown error'));
        } finally {
            setProcessing(null);
        }
    };

    const handleDeny = async () => {
        if (!user || !denialRequest) return;
        setProcessing(denialRequest.id);
        try {
            await processCourseRequest(denialRequest.id, 'denied', user.uid, rejectionReason);

            // Send Notification
            await createNotification({
                userId: denialRequest.studentId,
                type: 'info',
                title: denialRequest.type === 'join' ? 'Enrollment Denied' : 'Unenrollment Denied',
                message: `Your ${denialRequest.type} request for ${courseName || denialRequest.courseName || 'the course'} was denied.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`
            });

            setRequests(prev => prev.filter(r => r.id !== denialRequest.id));
            setDenialRequest(null);
            setRejectionReason('');
        } catch (err) {
            alert('Failed to deny request');
        } finally {
            setProcessing(null);
        }
    };

    if (loading) return <Loader size="sm" mt="md" />;
    if (error) return <Alert color="red" mt="md">{error}</Alert>;

    if (requests.length === 0) {
        return (
            <Stack align="center" py="xl" gap="xs">
                <IconCheck size={48} color="#94a3b8" />
                <Text fw={700} color="dimmed">No pending requests!</Text>
                <Text size="xs" color="dimmed">All students are up to date.</Text>
            </Stack>
        );
    }

    return (
        <div style={{ marginTop: '1rem' }}>
            <Table verticalSpacing="sm">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Student</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Requested</Table.Th>
                        <Table.Th>Expires</Table.Th>
                        <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {requests.map((request) => (
                        <Table.Tr key={request.id}>
                            <Table.Td>
                                <Group gap="sm">
                                    <IconUser size={16} color="#64748b" />
                                    <div>
                                        <Text size="sm" fw={600}>{request.studentName || 'Unknown Student'}</Text>
                                        <Text size="xs" c="dimmed">{request.studentId}</Text>
                                    </div>
                                </Group>
                            </Table.Td>
                            <Table.Td>
                                <Badge
                                    color={request.type === 'join' ? 'blue' : 'orange'}
                                    variant="light"
                                >
                                    {request.type === 'join' ? 'Enrollment' : 'Unenrollment'}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <Group gap={4}>
                                    <IconCalendar size={14} color="#94a3b8" />
                                    <Text size="xs">{new Date(request.requestedAt).toLocaleDateString()}</Text>
                                </Group>
                            </Table.Td>
                            <Table.Td>
                                <Group gap={4}>
                                    <IconClock size={14} color={request.expiresAt < Date.now() ? 'red' : '#94a3b8'} />
                                    <Text size="xs" color={request.expiresAt < Date.now() ? 'red' : 'dimmed'}>
                                        {new Date(request.expiresAt).toLocaleDateString()}
                                    </Text>
                                </Group>
                            </Table.Td>
                            <Table.Td>
                                <Group justify="flex-end" gap="xs">
                                    <Tooltip label="Approve">
                                        <ActionIcon
                                            variant="light"
                                            color="green"
                                            onClick={() => handleApprove(request)}
                                            loading={processing === request.id}
                                            disabled={!!processing}
                                        >
                                            <IconCheck size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="Deny">
                                        <ActionIcon
                                            variant="light"
                                            color="red"
                                            onClick={() => setDenialRequest(request)}
                                            disabled={!!processing}
                                        >
                                            <IconX size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>

            <Modal
                opened={!!denialRequest}
                onClose={() => setDenialRequest(null)}
                title="Deny Request"
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        Are you sure you want to deny the <strong>{denialRequest?.type}</strong> request from <strong>{denialRequest?.studentName}</strong>?
                    </Text>
                    <TextInput
                        label="Rejection Reason (Optional)"
                        placeholder="e.g. Please complete prerequisite course first"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.currentTarget.value)}
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="outline" color="gray" onClick={() => setDenialRequest(null)}>Cancel</Button>
                        <Button color="red" onClick={handleDeny} loading={processing === denialRequest?.id}>Reject Request</Button>
                    </Group>
                </Stack>
            </Modal>
        </div>
    );
};
