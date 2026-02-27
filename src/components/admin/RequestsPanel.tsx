import React, { useMemo } from 'react';
import { Table, Button, Group, Badge, Text } from '@mantine/core';
import { User } from './admin.types';

export interface StudentRequest {
    id: string;
    teacherId: string;
    studentEmail: string;
    status: 'pending' | 'approved' | 'denied';
    createdAt: number;
    approvedAt?: number;
    approvedBy?: string;
    deniedAt?: number;
    deniedBy?: string;
}

interface RequestsPanelProps {
    requests: StudentRequest[];
    users: User[];
    loading?: boolean;
    onApprove: (requestId: string) => void;
    onDeny: (requestId: string) => void;
}

export const RequestsPanel: React.FC<RequestsPanelProps> = ({
    requests,
    users,
    loading = false,
    onApprove,
    onDeny,
}) => {
    // Create a map for faster teacher lookups
    const teacherMap = useMemo(() => {
        const map = new Map<string, User>();
        users.forEach(user => {
            if (user.role === 'teacher' || user.role === 'super_admin') {
                map.set(user.uid, user);
            }
        });
        return map;
    }, [users]);

    const getStatusColor = (status: StudentRequest['status']) => {
        switch (status) {
            case 'pending':
                return 'orange';
            case 'approved':
                return 'green';
            case 'denied':
                return 'red';
            default:
                return 'gray';
        }
    };

    return (
        <Table striped highlightOnHover>
            <thead>
                <tr>
                    <th>Teacher</th>
                    <th>Student Email</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {requests.length === 0 ? (
                    <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                            <Text c="dimmed">No student requests yet.</Text>
                        </td>
                    </tr>
                ) : (
                    requests.map((request) => {
                        const teacher = teacherMap.get(request.teacherId);
                        const teacherDisplay = teacher?.displayName || teacher?.email || request.teacherId;

                        return (
                            <tr key={request.id}>
                                {/* Teacher */}
                                <td>{teacherDisplay}</td>

                                {/* Student Email */}
                                <td>{request.studentEmail}</td>

                                {/* Status */}
                                <td>
                                    <Badge color={getStatusColor(request.status)}>
                                        {request.status.toUpperCase()}
                                    </Badge>
                                </td>

                                {/* Date */}
                                <td>{new Date(request.createdAt).toLocaleDateString()}</td>

                                {/* Actions */}
                                <td>
                                    {request.status === 'pending' && (
                                        <Group gap="xs">
                                            <Button
                                                size="xs"
                                                color="green"
                                                onClick={() => onApprove(request.id)}
                                                loading={loading}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                size="xs"
                                                color="red"
                                                variant="outline"
                                                onClick={() => onDeny(request.id)}
                                                loading={loading}
                                            >
                                                Deny
                                            </Button>
                                        </Group>
                                    )}
                                </td>
                            </tr>
                        );
                    })
                )}
            </tbody>
        </Table>
    );
};
