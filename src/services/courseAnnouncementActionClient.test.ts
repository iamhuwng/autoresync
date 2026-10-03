import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), user: { uid: 'teacher-1' } }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: mocks.user }) }));
vi.mock('firebase/database', () => ({
    ref: (_db: unknown, path = '') => ({ path }), get: mocks.get, update: mocks.update,
    query: (value: unknown) => value, orderByChild: (value: string) => value,
    equalTo: (value: string) => value,
}));
vi.mock('./firebase', () => ({ database: {} }));
import { notifyCourseAnnouncementCommitted } from './courseAnnouncementActionClient';

const source = { id: 'announcement-1', courseId: 'course-1', teacherId: 'teacher-1', createdAt: 1000 };
const audience = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `enroll-${index}`, { id: 'forged-row-id', studentId: `student-${String(index).padStart(3, '0')}`,
        courseId: 'course-1', status: 'active', expiresAt: 0 },
]));
const snapshot = (value: unknown) => ({ val: () => value });

describe('course announcement private mapping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.update.mockResolvedValue(undefined);
        mocks.get.mockImplementation(({ path }: { path: string }) => Promise.resolve(snapshot(
            path.startsWith('course_announcements/') ? source
                : path.startsWith('courses/') ? 'teacher-1' : audience(51),
        )));
    });

    it('sends sequential bounded field patches from exact enrollment keys, preserving read on replay', async () => {
        const result = await notifyCourseAnnouncementCommitted('announcement-1');
        expect(result).toEqual({ status: 'written', delivered: 51, failed: 0, unknown: 0, unattempted: 0 });
        expect(mocks.update).toHaveBeenCalledTimes(2);
        const first = mocks.update.mock.calls[0][1];
        expect(Object.keys(first)).toHaveLength(50 * 8);
        expect(new TextEncoder().encode(JSON.stringify(first)).byteLength).toBeLessThanOrEqual(128 * 1024);
        const prefix = 'notifications/student-000/ordinary_course_announcement_announcement-1';
        expect(first[`${prefix}/metadata/enrollmentId`]).toBe('enroll-0');
        expect(first[`${prefix}/title`]).toBe('New course announcement');
        expect(first[`${prefix}/message`]).toBe('Your teacher posted an announcement in your course.');
        expect(first[`${prefix}/read`]).toBeUndefined();
        expect(first[prefix]).toBeUndefined();
    });

    it('counts a failed batch and exact unattempted remainder without retry', async () => {
        mocks.update.mockRejectedValueOnce({ code: 'PERMISSION_DENIED' });
        expect(await notifyCourseAnnouncementCommitted('announcement-1'))
            .toEqual({ status: 'failed', delivered: 0, failed: 50, unknown: 0, unattempted: 1,
                code: 'notification_permission_denied' });
        expect(mocks.update).toHaveBeenCalledTimes(1);
    });

    it('marks the event ceiling as partial failure with the exact unattempted count', async () => {
        mocks.get.mockImplementation(({ path }: { path: string }) => Promise.resolve(snapshot(
            path.startsWith('course_announcements/') ? source
                : path.startsWith('courses/') ? 'teacher-1' : audience(501),
        )));
        expect(await notifyCourseAnnouncementCommitted('announcement-1'))
            .toEqual({ status: 'failed', delivered: 500, failed: 0, unknown: 0,
                unattempted: 1, code: 'notification_event_budget' });
        expect(mocks.update).toHaveBeenCalledTimes(10);
    });

    it('rejects an unowned saved source before recipient derivation', async () => {
        mocks.get.mockResolvedValueOnce(snapshot({ ...source, teacherId: 'teacher-2' }));
        expect(await notifyCourseAnnouncementCommitted('announcement-1'))
            .toMatchObject({ status: 'failed', unattempted: 0, code: 'source_not_current' });
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
