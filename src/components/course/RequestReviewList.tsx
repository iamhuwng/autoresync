import React, { useEffect, useState } from 'react';
import {
    IconCheck, IconX, IconClock, IconUser, IconCalendar
} from '@tabler/icons-react';
import { getRequestsByCourse, processCourseRequest } from '../../services/courseRequestManager';
import { enrollStudentInCourse, unenrollStudent } from '../../services/enrollmentManager';
import { createTrustedNotification } from '../../services/notificationProducerClient';
import type { CourseRequest } from '../../types/course.types';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../modern';

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
            await createTrustedNotification({
                producerFamily: 'enrollment',
                authorityRecordId: request.id,
                recipientId: request.studentId,
                operationKey: `course-request-approved:${request.id}`,
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
            toast.error('Failed to approve request: ' + (err instanceof Error ? err.message : 'Unknown error'));
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
            await createTrustedNotification({
                producerFamily: 'enrollment',
                authorityRecordId: denialRequest.id,
                recipientId: denialRequest.studentId,
                operationKey: `course-request-denied:${denialRequest.id}`,
                type: 'info',
                title: denialRequest.type === 'join' ? 'Enrollment Denied' : 'Unenrollment Denied',
                message: `Your ${denialRequest.type} request for ${courseName || denialRequest.courseName || 'the course'} was denied.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`
            });

            setRequests(prev => prev.filter(r => r.id !== denialRequest.id));
            setDenialRequest(null);
            setRejectionReason('');
        } catch (err) {
            toast.error('Failed to deny request');
        } finally {
            setProcessing(null);
        }
    };

    if (loading) return <p role="status" style={{ marginTop: '1rem' }}>Loading requests…</p>;
    if (error) return <p role="alert" style={{ marginTop: '1rem', color: '#b91c1c' }}>{error}</p>;

    if (requests.length === 0) {
        return (
            <div style={{ alignItems: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '3rem 0' }}>
                <IconCheck size={48} color="#94a3b8" />
                <strong style={{ color: '#64748b' }}>No pending requests!</strong>
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>All students are up to date.</span>
            </div>
        );
    }

    return (
        <div style={{ marginTop: '1rem' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                    <tr>
                        <th scope="col" style={{ textAlign: 'left' }}>Student</th>
                        <th scope="col" style={{ textAlign: 'left' }}>Type</th>
                        <th scope="col" style={{ textAlign: 'left' }}>Requested</th>
                        <th scope="col" style={{ textAlign: 'left' }}>Expires</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.map((request) => (
                        <tr key={request.id}>
                            <td>
                                <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
                                    <IconUser size={16} color="#64748b" />
                                    <div>
                                        <strong style={{ display: 'block', fontSize: '0.875rem' }}>{request.studentName || 'Unknown Student'}</strong>
                                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>{request.studentId}</span>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span style={{ background: request.type === 'join' ? '#dbeafe' : '#ffedd5', borderRadius: '999px', color: request.type === 'join' ? '#1d4ed8' : '#c2410c', display: 'inline-block', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                                    {request.type === 'join' ? 'Enrollment' : 'Unenrollment'}
                                </span>
                            </td>
                            <td>
                                <div style={{ alignItems: 'center', display: 'flex', gap: '0.25rem' }}>
                                    <IconCalendar size={14} color="#94a3b8" />
                                    <span style={{ fontSize: '0.75rem' }}>{new Date(request.requestedAt).toLocaleDateString()}</span>
                                </div>
                            </td>
                            <td>
                                <div style={{ alignItems: 'center', display: 'flex', gap: '0.25rem' }}>
                                    <IconClock size={14} color={request.expiresAt < Date.now() ? 'red' : '#94a3b8'} />
                                    <span style={{ color: request.expiresAt < Date.now() ? '#b91c1c' : '#64748b', fontSize: '0.75rem' }}>
                                        {new Date(request.expiresAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        aria-label="Approve request"
                                        aria-busy={processing === request.id}
                                        onClick={() => handleApprove(request)}
                                        disabled={!!processing}
                                        style={{ alignItems: 'center', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '4px', color: '#166534', cursor: 'pointer', display: 'inline-flex', justifyContent: 'center', minHeight: '44px', minWidth: '44px' }}
                                    >
                                        <IconCheck size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Deny request"
                                        onClick={() => setDenialRequest(request)}
                                        disabled={!!processing}
                                        style={{ alignItems: 'center', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', color: '#991b1b', cursor: 'pointer', display: 'inline-flex', justifyContent: 'center', minHeight: '44px', minWidth: '44px' }}
                                    >
                                        <IconX size={16} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <dialog
                open={!!denialRequest}
                aria-labelledby="deny-request-title"
                onClose={() => setDenialRequest(null)}
                onCancel={(event) => {
                    event.preventDefault();
                    setDenialRequest(null);
                }}
                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', maxWidth: '32rem', padding: '1.25rem', width: 'calc(100% - 2rem)' }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h2 id="deny-request-title" style={{ fontSize: '1.125rem', margin: 0 }}>Deny Request</h2>
                    <p style={{ fontSize: '0.875rem', margin: 0 }}>
                        Are you sure you want to deny the <strong>{denialRequest?.type}</strong> request from <strong>{denialRequest?.studentName}</strong>?
                    </p>
                    <label htmlFor="rejection-reason">Rejection Reason (Optional)</label>
                    <input
                        id="rejection-reason"
                        type="text"
                        placeholder="e.g. Please complete prerequisite course first"
                        value={rejectionReason}
                        onChange={(event) => setRejectionReason(event.currentTarget.value)}
                        style={{ border: '1px solid #94a3b8', borderRadius: '4px', minHeight: '44px', padding: '0.5rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setDenialRequest(null)} style={{ background: 'transparent', border: '1px solid #94a3b8', borderRadius: '4px', minHeight: '44px', padding: '0.5rem 1rem' }}>Cancel</button>
                        <button type="button" onClick={handleDeny} disabled={processing === denialRequest?.id} style={{ background: '#b91c1c', border: '1px solid #991b1b', borderRadius: '4px', color: '#fff', minHeight: '44px', padding: '0.5rem 1rem' }}>Reject Request</button>
                    </div>
                </div>
            </dialog>
        </div>
    );
};
