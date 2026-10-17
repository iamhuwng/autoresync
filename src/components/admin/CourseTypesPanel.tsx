import React, { useMemo } from 'react';
import { Button } from '../modern/Button';
import type { User } from './admin.types';
import type { CourseType, PendingTypeRequest } from '../../types/admin.types';

export type TypeRequest = PendingTypeRequest;

interface CourseTypesPanelProps {
    courseTypes: CourseType[];
    pendingRequests: PendingTypeRequest[];
    users: User[];
    loading?: boolean;
    onApprove: (requestId: string) => void;
    onReject: (requestId: string) => void;
}

const cellStyle = { padding: '0.625rem', textAlign: 'left' as const, borderBottom: '1px solid #e2e8f0' };

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
            <h4 style={{ margin: '1rem 0 0.625rem' }}>
                Pending Requests
            </h4>

            {pendingRequests.length === 0 ? (
                <p style={{ color: '#64748b', marginBottom: '2rem' }}>
                    No pending requests
                </p>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }} aria-label="Pending course type requests">
                    <thead>
                        <tr>
                            <th scope="col" style={cellStyle}>Type Name</th>
                            <th scope="col" style={cellStyle}>Requester</th>
                            <th scope="col" style={cellStyle}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pendingRequests.map((request) => {
                            const requester = userMap.get(request.requestedBy);
                            const requesterDisplay = requester?.displayName || requester?.email || 'Unknown';

                            return (
                                <tr key={request.id}>
                                    {/* Type Name */}
                                    <td style={cellStyle}>
                                        <span style={{ fontWeight: 600 }}>{request.name}</span>
                                    </td>

                                    {/* Requester */}
                                    <td style={cellStyle}>{requesterDisplay}</td>

                                    {/* Actions */}
                                    <td style={cellStyle}>
                                        <div style={{ display: 'flex', gap: '0.625rem' }}>
                                            <Button
                                                size="sm"
                                                variant="success"
                                                onClick={() => onApprove(request.id)}
                                                loading={loading}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                style={{ color: '#dc2626', borderColor: '#dc2626' }}
                                                onClick={() => onReject(request.id)}
                                                loading={loading}
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            {/* Active Course Types Section */}
            <h4 style={{ margin: '2rem 0 0.625rem' }}>
                Active Course Types
            </h4>

            {courseTypes.length === 0 ? (
                <p style={{ color: '#64748b' }}>No course types yet.</p>
            ) : (
                <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                    {courseTypes.map(type => (
                        <span key={type.id} style={{ padding: '0.25rem 0.625rem', borderRadius: '4px', background: '#eff6ff', color: '#2563eb', fontWeight: 600 }}>
                            {type.name}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};
