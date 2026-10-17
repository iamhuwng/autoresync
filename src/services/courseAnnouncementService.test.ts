import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), notify: vi.fn() }));
vi.mock('firebase/database', () => ({
    ref: (_db: unknown, path: string) => ({ path }),
    push: (_ref: unknown) => ({ path: 'course_announcements/announcement-1', key: 'announcement-1' }),
    set: mocks.set,
    get: mocks.get,
    query: (value: unknown) => value,
    orderByChild: (value: string) => value,
    equalTo: (value: string) => value,
}));
vi.mock('./firebase', () => ({ database: {} }));
vi.mock('./notificationProducerClient', () => ({ notifyCommittedEvent: mocks.notify }));

import { createCourseAnnouncement } from './courseAnnouncementService';

const input = {
    courseId: 'course-1', courseName: 'Course', teacherId: 'teacher-1', teacherName: 'Teacher',
    title: 'News', content: '<p>Details</p>', targetClassIds: ['class-1'], attachments: [],
};

describe('createCourseAnnouncement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.set.mockResolvedValue(undefined);
        mocks.get.mockResolvedValueOnce({ exists: () => true, child: () => ({ val: () => 'teacher-1' }) });
        mocks.notify.mockResolvedValue({ status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 });
    });

    it('saves the occurrence before passing only its ID to the public producer port', async () => {
        const result = await createCourseAnnouncement(input);
        expect(result).toMatchObject({ success: true, announcementId: 'announcement-1' });
        await result.deliveryPromise;
        expect(mocks.set.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0]);
        expect(mocks.set.mock.calls[0][1]).toMatchObject({ id: 'announcement-1', targetClassIds: { 'class-1': true }, notificationPreview: 'Details' });
        expect(mocks.notify).toHaveBeenCalledWith({ eventKind: 'course-announcement-posted', announcementId: 'announcement-1' });
    });

    it('does not hold the saved product action pending on a slow notification pass', async () => {
        mocks.notify.mockReturnValue(new Promise(() => {}));
        const result = await createCourseAnnouncement(input);
        expect(result).toMatchObject({ success: true, announcementId: 'announcement-1' });
        expect(result.deliveryPromise).toBeInstanceOf(Promise);
    });

    it('posts with unrestricted audience selection', async () => {
        const result = await createCourseAnnouncement({ ...input, targetClassIds: [] });
        expect(result).toMatchObject({ success: true });
        await result.deliveryPromise;
        expect(mocks.set.mock.calls[0][1]).not.toHaveProperty('targetClassIds');
    });

    it('does not save for a non-owner', async () => {
        mocks.get.mockReset().mockResolvedValue({ exists: () => true, child: () => ({ val: () => 'teacher-2' }) });
        expect(await createCourseAnnouncement(input)).toMatchObject({ success: false });
        expect(mocks.set).not.toHaveBeenCalled();
    });
});
