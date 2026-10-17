import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), notify: vi.fn(), actor: 'admin-1' }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: mocks.actor } }) }));
vi.mock('./firebase', () => ({ database: {} }));
vi.mock('./auditService', () => ({ logCreate: vi.fn(), logUpdate: vi.fn(), logDelete: vi.fn() }));
vi.mock('./notificationProducerClient', () => ({ notifyCommittedEvent: mocks.notify, createTrustedBulkNotifications: vi.fn(), createTrustedNotification: vi.fn() }));
vi.mock('firebase/database', () => ({ ref: (_: unknown, path = '') => path, push: () => ({ key: 'type-1' }), get: mocks.get, update: mocks.update, set: vi.fn(), remove: vi.fn(), query: vi.fn(), orderByChild: vi.fn(), equalTo: vi.fn() }));
import { approveCourseType, rejectCourseType } from './courseManager';
import * as admin from './courseTypeService';
const request = { id: 'request-1', teacherId: 'teacher-1', typeName: 'IELTS', requestedAt: 123, status: 'pending' };
beforeEach(() => {
    vi.resetAllMocks(); mocks.actor = 'admin-1';
    mocks.get.mockResolvedValue({ exists: () => true, val: () => request });
    mocks.update.mockResolvedValue(undefined);
    mocks.notify.mockImplementation(() => { throw new Error('notice unavailable'); });
});
describe('course-type product and admin path', () => {
    it.each([['approved', approveCourseType], ['rejected', rejectCourseType]] as const)('commits %s atomically before a failing detached notice', async (decision, decide) => {
        await expect(decide('request-1')).resolves.toEqual({ success: true });
        const patch = mocks.update.mock.calls[0][1];
        expect(patch['course_type_requests/request-1']).toMatchObject({ status: decision, [decision === 'approved' ? 'approvedBy' : 'handledBy']: 'admin-1' });
        if (decision === 'approved') expect(patch['course_types/type-1']).toMatchObject({ createdBy: 'teacher-1' });
        expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0]);
    });
    it.each([approveCourseType, rejectCourseType])('does not notify a failed commit', async decide => {
        mocks.update.mockRejectedValueOnce(new Error('write denied'));
        await expect(decide('request-1')).resolves.toMatchObject({ success: false });
        expect(mocks.notify).not.toHaveBeenCalled();
    });
    it('connects admin approval to the real save and propagates failure', async () => {
        await expect(admin.approveCourseType('request-1')).resolves.toBeUndefined();
        expect(mocks.update).toHaveBeenCalledTimes(1);
        mocks.update.mockRejectedValueOnce(new Error('write denied'));
        await expect(admin.rejectCourseType('request-1')).rejects.toThrow('write denied');
    });
    it('adapts the persisted pending request into the admin reader shape', async () => {
        mocks.get.mockResolvedValueOnce({ exists: () => true, val: () => ({ 'request-1': request }) });
        await expect(admin.getPendingTypeRequests()).resolves.toEqual([{ id: 'request-1', name: 'IELTS', requestedBy: 'teacher-1', requestedAt: 123, status: 'pending' }]);
    });
});
