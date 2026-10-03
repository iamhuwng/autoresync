import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from 'firebase/auth';
import { get, ref, update } from 'firebase/database';
import { isRestoreInProgress } from './restoreGuard';
import { notifyCommittedEvent } from './notificationProducerClient';

vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({ currentUser: { uid: 'teacher-1' } })) }));
vi.mock('firebase/database', () => ({
    get: vi.fn(), ref: vi.fn((_database, path) => path ?? '/'), update: vi.fn(),
}));
vi.mock('./firebase', () => ({ database: {} }));
vi.mock('./restoreGuard', () => ({ isRestoreInProgress: vi.fn().mockResolvedValue(false) }));
vi.mock('./reportingService', () => ({ reportingService: { reportNotificationFailure: vi.fn() } }));

const event = { eventKind: 'course-request-decided' as const, requestId: 'request-1',
    decision: 'approved' as const, occurredAt: 1234 };
const request = { id: 'request-1', status: 'approved', processedBy: 'teacher-1', processedAt: 1234,
    type: 'join', studentId: 'student-1', courseId: 'course-1', teacherId: 'teacher-1' };

describe('committed course request notification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(get).mockImplementation(async (path) => ({
            val: () => path === 'course_requests/request-1' ? request
                : path === 'users/teacher-1/role' ? 'teacher'
                    : path === 'courses/course-1/ownerId' ? 'teacher-1' : null,
        }) as any);
    });

    it('writes the fixed student notice from the committed source without changing read', async () => {
        const result = await notifyCommittedEvent(event);
        const id = 'ordinary_course_request_approved_request-1_1234';
        expect(result).toEqual({ status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 });
        expect(update).toHaveBeenCalledWith('/', expect.objectContaining({
            [`notifications/student-1/${id}/id`]: id,
            [`notifications/student-1/${id}/title`]: 'Course Request Approved',
            [`notifications/student-1/${id}/createdAt`]: 1234,
        }));
        expect(Object.keys(vi.mocked(update).mock.calls[0]![1] as object).some(key => key.endsWith('/read'))).toBe(false);
    });

    it('uses the committed leave decision for a declined request', async () => {
        vi.mocked(get).mockImplementationOnce(async () => ({ val: () => ({
            ...request, status: 'denied', type: 'unenroll',
        }) }) as any);
        const result = await notifyCommittedEvent({ ...event, decision: 'denied' });
        const id = 'ordinary_course_request_denied_request-1_1234';
        expect(result).toEqual({ status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 });
        expect(update).toHaveBeenCalledWith('/', expect.objectContaining({
            [`notifications/student-1/${id}/message`]: 'Your request to leave the course was declined.',
        }));
    });

    it('does not write for a mismatched source, actor or restore', async () => {
        vi.mocked(get).mockImplementationOnce(async () => ({ val: () => ({ ...request, status: 'pending' }) }) as any);
        expect((await notifyCommittedEvent(event)).status).toBe('skipped');
        vi.mocked(getAuth).mockReturnValueOnce({ currentUser: { uid: 'other' } } as any);
        expect((await notifyCommittedEvent(event)).status).toBe('skipped');
        vi.mocked(isRestoreInProgress).mockResolvedValueOnce(true);
        expect((await notifyCommittedEvent(event)).status).toBe('skipped');
        expect(update).not.toHaveBeenCalled();
    });
});
