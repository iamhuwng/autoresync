import React, { useMemo } from 'react';
import { Title, Text, Table, Button, Group, Badge } from '@mantine/core';
import { User } from './admin.types';

export interface TypeRequest {
    id: string;
    name: string;
    createdBy: string;
    createdAt: number;
    status?: 'pending' | 'approved' | 'rejected';
}

interface CourseTypesPanelProps {
    courseTypes: string[];
    pendingRequests: TypeRequest[];
    users: User[];
    loading?: boolean;
    onApprove: (requestId: string) => void;
    onReject: (requestId: string) => void;
}

export const CourseTypesPanel: React.FC<CourseTypesPanelProps> = ({
    courseTypes,
    pendingRequests,
    users,
    loading = false,
    onApprove,
    onReject,
}) => {
    // Create a map for faster user lookups
    const userMap = useMemo(() => {
        const map = new Map<string, User>();
        users.forEach(user => map.set(user.uid, user));
        return map;
    }, [users]);

    return (
        <div>
            {/* Pending Requests Section */}
            <Title order={4} mt="md" mb="sm">
                Pending Requests
            </Title>

            {pendingRequests.length === 0 ? (
                <Text c="dimmed" mb="xl">
                    No pending requests
                </Text>
            ) : (
                <Table mb="xl">
                    <thead>
                        <tr>
                            <th>Type Name</th>
                            <th>Requester</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pendingRequests.map((request) => {
                            const requester = userMap.get(request.createdBy);
                            const requesterDisplay = requester?.displayName || requester?.email || 'Unknown';

                            return (
                                <tr key={request.id}>
                                    {/* Type Name */}
                                    <td>
                                        <Text fw={600}>{request.name}</Text>
                                    </td>

                                    {/* Requester */}
                                    <td>{requesterDisplay}</td>

                                    {/* Actions */}
                                    <td>
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
                                                onClick={() => onReject(request.id)}
                                                loading={loading}
                                            >
                                                Reject
                                            </Button>
                                        </Group>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            )}

            {/* Active Course Types Section */}
            <Title order={4} mt="xl" mb="sm">
                Active Course Types
            </Title>

            {courseTypes.length === 0 ? (
                <Text c="dimmed">No course types yet.</Text>
            ) : (
                <Group gap="xs" style={{ flexWrap: 'wrap' }}>
                    {courseTypes.map((type, index) => (
                        <Badge key={`${type}-${index}`} size="lg" variant="light" color="blue">
                            {type}
                        </Badge>
                    ))}
                </Group>
            )}
        </div>
    );
};
