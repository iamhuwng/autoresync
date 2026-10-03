import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ actor: 'admin-1', values: {} as Record<string, unknown>, update: vi.fn(), report: vi.fn() }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: mocks.actor } }) }));
vi.mock('./firebase', () => ({ database: {} }));
vi.mock('./restoreGuard', () => ({ isRestoreInProgress: async () => false }));
vi.mock('./reportingService', () => ({ reportingService: { reportNotificationFailure: mocks.report } }));
vi.mock('firebase/database', () => ({ ref: (_: unknown, path = '') => path, get: async (path: string) => ({ val: () => mocks.values[path] }), update: mocks.update }));
import { notifyCommittedEvent } from './notificationProducerClient';
beforeEach(() => { vi.clearAllMocks(); mocks.actor = 'admin-1'; mocks.values = { 'users/admin-1/role': 'super_admin' }; mocks.update.mockResolvedValue(undefined); });
describe('assignment and course-type shared port', () => {
    it('writes both assignment recipients in one patch without resetting read', async () => {
        mocks.values['student_requests/request-1'] = { id: 'request-1', status: 'approved', reviewedBy: 'admin-1', reviewedAt: 456, teacherId: 'teacher-1', studentId: 'student-1', assignmentId: 'assignment-1' };
        mocks.values['student_teacher_assignments/assignment-1'] = { id: 'assignment-1', status: 'active', teacherId: 'teacher-1', studentId: 'student-1' };
        await expect(notifyCommittedEvent({ eventKind: 'assignment-approved', requestId: 'request-1', occurredAt: 456 })).resolves.toMatchObject({ status: 'written', delivered: 2 });
        const patch = mocks.update.mock.calls[0][1];
        expect(Object.keys(patch)).toHaveLength(14);
        expect(Object.keys(patch).some(key => key.endsWith('/read'))).toBe(false);
        expect(patch['notifications/student-1/ordinary_assignment_approved_request-1_456/link']).toBe('/student/dashboard');
    });
    it.each(['approved', 'rejected'] as const)('writes a saved %s Course Type occurrence to its teacher', async decision => {
        mocks.values['course_type_requests/request-1'] = { id: 'request-1', status: decision, teacherId: 'teacher-1', [decision === 'approved' ? 'approvedBy' : 'handledBy']: 'admin-1', [decision === 'approved' ? 'approvedAt' : 'handledAt']: 456 };
        await expect(notifyCommittedEvent({ eventKind: 'course-type-decided', requestId: 'request-1', decision, occurredAt: 456 })).resolves.toMatchObject({ status: 'written', delivered: 1 });
        expect(mocks.update.mock.calls[0][1][`notifications/teacher-1/ordinary_course_type_${decision}_request-1_456/metadata`]).toEqual({ eventKind: 'ordinary-course-type', requestId: 'request-1', decision, occurredAt: 456 });
    });
    it('refuses a changed source occurrence', async () => {
        mocks.values['course_type_requests/request-1'] = { id: 'request-1', status: 'approved', teacherId: 'teacher-1', approvedBy: 'admin-2', approvedAt: 456 };
        await expect(notifyCommittedEvent({ eventKind: 'course-type-decided', requestId: 'request-1', decision: 'approved', occurredAt: 456 })).resolves.toMatchObject({ status: 'skipped', code: 'source_not_current' });
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('reports actual delivery failure through the existing reporting port', async () => {
        mocks.values['course_type_requests/request-1'] = { id: 'request-1', status: 'approved', teacherId: 'teacher-1', approvedBy: 'admin-1', approvedAt: 456 };
        mocks.update.mockRejectedValueOnce(new Error('rules denied'));
        await expect(notifyCommittedEvent({ eventKind: 'course-type-decided', requestId: 'request-1', decision: 'approved', occurredAt: 456 })).resolves.toMatchObject({ status: 'failed', failed: 1 });
        expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ action: 'approveCourseType', failed: 1 }));
    });
});
