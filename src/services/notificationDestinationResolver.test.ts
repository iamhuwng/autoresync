import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveNotificationDestination } from './notificationDestinationResolver';
import type { Notification } from '../types/notification.types';

const { mockGet, mockRef, mockGetDoc } = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockRef: vi.fn(() => ({})),
    mockGetDoc: vi.fn(),
}));

vi.mock('firebase/database', () => ({
    equalTo: vi.fn(),
    get: mockGet,
    orderByChild: vi.fn(),
    query: vi.fn(() => ({})),
    ref: mockRef,
}));
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(() => ({})),
    getDoc: mockGetDoc,
}));
vi.mock('./firebase', () => ({ auth: { currentUser: null }, database: {}, firestore: {} }));

const baseNotification = (overrides: Partial<Notification> = {}): Notification => ({
    id: 'notification-1',
    type: 'info',
    title: 'Notification',
    message: 'Open this item',
    read: false,
    createdAt: 1,
    ...overrides,
});

const studentContext = {
    userId: 'student-1',
    authUserId: 'student-1',
    currentPath: '/student/dashboard',
    role: 'student' as const,
};

const bookMetadata = {
    schemaVersion: 1 as const,
    kind: 'book' as const,
    contextType: 'book' as const,
    contextId: 'book-1',
    updateActionId: 'update-1',
    checkpointAvailable: true,
    deadlineClass: 'none' as const,
    actionClass: 'open' as const,
};

describe('notification destination resolver', () => {
    beforeEach(() => {
        mockGet.mockReset();
        mockRef.mockClear();
        mockGetDoc.mockReset();
    });

    it('allows a registered legacy route after auth validation', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({ link: '/student/dashboard' }),
            studentContext,
        )).resolves.toEqual({
            status: 'allowed',
            destination: 'STUDENT_DASHBOARD',
            params: {},
        });
    });

    it('blocks arbitrary and external stored links', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({ link: 'https://attacker.invalid/collect' }),
            studentContext,
        )).resolves.toEqual({ status: 'blocked', reason: 'invalid-link' });

        await expect(resolveNotificationDestination(
            baseNotification({ link: '/admin/secrets' }),
            studentContext,
        )).resolves.toEqual({ status: 'blocked', reason: 'invalid-link' });
    });

    it('blocks when the current auth user no longer owns the notification', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({ link: '/student/dashboard' }),
            { ...studentContext, authUserId: 'other-user' },
        )).resolves.toEqual({ status: 'blocked', reason: 'unauthorized' });
    });

    it('keeps student routes out of the teacher port', async () => {
        const teacherContext = {
            userId: 'teacher-1',
            authUserId: 'teacher-1',
            currentPath: '/teacher/grading',
            role: 'teacher' as const,
        };

        await expect(resolveNotificationDestination(
            baseNotification({ link: '/student/dashboard' }),
            teacherContext,
        )).resolves.toEqual({ status: 'blocked', reason: 'unauthorized' });

        await expect(resolveNotificationDestination(
            baseNotification({ link: '/teacher/grading' }),
            teacherContext,
        )).resolves.toEqual({
            status: 'allowed',
            destination: 'TEACHER_GRADING',
            params: {},
        });
    });

    it('keeps current teacher and student producer routes compatible', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({ link: '/teacher/classes/CLASS1' }),
            { userId: 'teacher-1', authUserId: 'teacher-1', currentPath: '/teacher/classes', role: 'teacher' },
        )).resolves.toEqual({
            status: 'allowed',
            destination: 'TEACHER_CLASS_DETAIL',
            params: { classId: 'CLASS1' },
        });

        await expect(resolveNotificationDestination(
            baseNotification({ link: '/teacher/courses' }),
            { userId: 'teacher-1', authUserId: 'teacher-1', currentPath: '/teacher/courses', role: 'teacher' },
        )).resolves.toEqual({ status: 'allowed', destination: 'TEACHER_COURSES', params: {} });

        await expect(resolveNotificationDestination(
            baseNotification({ link: '/teacher/students' }),
            { userId: 'teacher-1', authUserId: 'teacher-1', currentPath: '/teacher/students', role: 'teacher' },
        )).resolves.toEqual({ status: 'allowed', destination: 'TEACHER_STUDENTS', params: {} });

        await expect(resolveNotificationDestination(
            baseNotification({ link: '/teacher/grading/writing/-FirebasePushId12345' }),
            { userId: 'teacher-1', authUserId: 'teacher-1', currentPath: '/lobby', role: 'teacher' },
        )).resolves.toEqual({
            status: 'allowed',
            destination: 'TEACHER_GRADING_DETAIL',
            params: { submissionId: '-FirebasePushId12345' },
        });

        await expect(resolveNotificationDestination(
            baseNotification({ link: '/student/courses/course-1' }),
            {
                ...studentContext,
                currentPath: '/student/courses',
                readCurrentState: vi.fn().mockResolvedValue({ exists: true, authorized: true }),
            },
        )).resolves.toEqual({
            status: 'allowed',
            destination: 'STUDENT_COURSE_DETAIL',
            params: { courseId: 'course-1' },
        });
    });

    it('fails closed for foreign teacher homework and course destinations', async () => {
        mockGetDoc.mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ createdBy: 'other-teacher' }),
        });
        await expect(resolveNotificationDestination(
            baseNotification({ link: '/teacher/homework/homework-1' }),
            { userId: 'teacher-1', authUserId: 'teacher-1', currentPath: '/teacher/homework', role: 'teacher' },
        )).resolves.toEqual({ status: 'blocked', reason: 'unauthorized' });

        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({ ownerId: 'other-teacher' }),
        });
        await expect(resolveNotificationDestination(
            baseNotification({ link: '/teacher/courses/course-1' }),
            { userId: 'teacher-1', authUserId: 'teacher-1', currentPath: '/teacher/courses', role: 'teacher' },
        )).resolves.toEqual({ status: 'blocked', reason: 'unauthorized' });
    });

    it('maps legacy course-announcement links only for active enrolled students', async () => {
        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({ ownerId: 'teacher-1' }),
        });
        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({
                enrollment: {
                    studentId: 'student-1',
                    courseId: 'course-1',
                    status: 'active',
                    expiresAt: 0,
                },
            }),
        });
        await expect(resolveNotificationDestination(
            baseNotification({ link: '/courses/course-1/announcements/announcement-1' }),
            studentContext,
        )).resolves.toEqual({
            status: 'allowed',
            destination: 'STUDENT_COURSE_DETAIL',
            params: { courseId: 'course-1' },
        });

        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({ ownerId: 'teacher-1' }),
        });
        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({
                enrollment: {
                    studentId: 'student-1',
                    courseId: 'other-course',
                    status: 'active',
                    expiresAt: 0,
                },
            }),
        });
        await expect(resolveNotificationDestination(
            baseNotification({ link: '/courses/course-1/announcements/announcement-1' }),
            studentContext,
        )).resolves.toEqual({ status: 'blocked', reason: 'unauthorized' });
    });

    it('canonicalizes the legacy student results producer link with live session state', async () => {
        const readCurrentState = vi.fn().mockResolvedValue({ exists: true, authorized: true });

        await expect(resolveNotificationDestination(
            baseNotification({
                link: '/student/results',
                metadata: { classId: 'class-1', sessionCode: 'SESSION123', testName: 'Reading' },
            }),
            { ...studentContext, readCurrentState },
        )).resolves.toEqual({
            status: 'allowed',
            destination: 'STUDENT_TEST_RESULTS',
            params: { sessionCode: 'SESSION123' },
        });
        expect(readCurrentState).toHaveBeenCalledWith(expect.objectContaining({
            destination: 'STUDENT_TEST_RESULTS',
            params: { sessionCode: 'SESSION123' },
        }));
    });

    it('requires the authenticated student to be a session player for legacy results', async () => {
        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({ players: { 'student-1': { submittedAt: 1 } } }),
        });

        await expect(resolveNotificationDestination(
            baseNotification({
                link: '/student/results',
                metadata: { sessionCode: 'SESSION123' },
            }),
            studentContext,
        )).resolves.toEqual({
            status: 'allowed',
            destination: 'STUDENT_TEST_RESULTS',
            params: { sessionCode: 'SESSION123' },
        });

        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({ players: { 'other-student': { submittedAt: 1 } } }),
        });

        await expect(resolveNotificationDestination(
            baseNotification({
                link: '/student/results',
                metadata: { sessionCode: 'SESSION123' },
            }),
            studentContext,
        )).resolves.toEqual({ status: 'blocked', reason: 'unauthorized' });
    });

    it('rejects the legacy student results link without a safe session code', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({
                link: '/student/results',
                metadata: { sessionCode: '../private' },
            }),
            studentContext,
        )).resolves.toEqual({ status: 'blocked', reason: 'invalid-link' });
    });

    it('requires live state for cached session destinations', async () => {
        const readCurrentState = vi.fn().mockResolvedValue({
            exists: false,
            authorized: false,
            active: false,
        });

        await expect(resolveNotificationDestination(
            baseNotification({ link: '/student-wait/LIVE123' }),
            { ...studentContext, readCurrentState },
        )).resolves.toEqual({ status: 'blocked', reason: 'stale-destination' });
        expect(readCurrentState).toHaveBeenCalledWith(expect.objectContaining({
            destination: 'STUDENT_WAITING',
            params: { gameSessionId: 'LIVE123' },
        }));
    });

    it('resolves a valid Book destination only after current-state authorization', async () => {
        const readCurrentState = vi.fn().mockResolvedValue({ exists: true, authorized: true });

        await expect(resolveNotificationDestination(
            baseNotification({ metadata: bookMetadata }),
            { ...studentContext, readCurrentState },
        )).resolves.toEqual({
            status: 'allowed',
            destination: 'STUDENT_PRACTICE',
            params: { materialId: 'book-1' },
        });
    });

    it('fails closed without a trusted student Book projection reader', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({ metadata: bookMetadata }),
            studentContext,
        )).resolves.toEqual({
            status: 'blocked',
            reason: 'destination-state-unavailable',
        });
        expect(mockRef).not.toHaveBeenCalled();
    });

    it('applies the Book state gate to legacy teacher and student routes', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({ link: '/student/practice/book-1' }),
            studentContext,
        )).resolves.toEqual({
            status: 'blocked',
            reason: 'destination-state-unavailable',
        });

        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({ ownerId: 'other-teacher' }),
        });
        await expect(resolveNotificationDestination(
            baseNotification({ link: '/teacher/materials/books/book-1' }),
            {
                userId: 'teacher-1',
                authUserId: 'teacher-1',
                currentPath: '/teacher/materials',
                role: 'teacher',
            },
        )).resolves.toEqual({ status: 'blocked', reason: 'unauthorized' });
    });

    it('fails closed without a trusted Book Homework projection reader', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({
                metadata: { ...bookMetadata, contextType: 'book-homework' },
            }),
            { ...studentContext, role: 'student' },
        )).resolves.toEqual({
            status: 'blocked',
            reason: 'destination-state-unavailable',
        });
        expect(mockRef).not.toHaveBeenCalled();
    });

    it('denies teacher Book access when ownership is missing', async () => {
        mockGet.mockResolvedValueOnce({
            exists: () => true,
            val: () => ({ title: 'Book without owner' }),
        });

        await expect(resolveNotificationDestination(
            baseNotification({ metadata: bookMetadata }),
            {
                userId: 'teacher-1',
                authUserId: 'teacher-1',
                currentPath: '/teacher/materials/books/book-1',
                role: 'teacher',
            },
        )).resolves.toEqual({ status: 'blocked', reason: 'unauthorized' });
    });

    it('blocks stale or unauthorized Book destinations', async () => {
        const readCurrentState = vi.fn().mockResolvedValue({ exists: true, authorized: false });

        await expect(resolveNotificationDestination(
            baseNotification({ metadata: bookMetadata }),
            { ...studentContext, readCurrentState },
        )).resolves.toEqual({ status: 'blocked', reason: 'unauthorized' });
    });

    it('fails closed when live destination state is unavailable', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({ metadata: bookMetadata }),
            {
                ...studentContext,
                readCurrentState: vi.fn().mockRejectedValue(new Error('temporary read failure')),
            },
        )).resolves.toEqual({ status: 'blocked', reason: 'destination-state-unavailable' });
    });

    it('fails closed for malformed structured metadata', async () => {
        await expect(resolveNotificationDestination(
            baseNotification({ metadata: { schemaVersion: 99, kind: 'book' } }),
            studentContext,
        )).resolves.toEqual({ status: 'blocked', reason: 'invalid-metadata' });
    });
});
