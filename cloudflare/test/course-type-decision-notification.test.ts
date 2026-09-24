import { describe, expect, it } from 'vitest';
import {
  deliverCourseTypeDecisionNotice,
  resolveCourseTypeDecisionNotice,
  type CourseTypeDecisionRecord,
} from '../src/upload-worker/notifications/course-type-decision.ts';
import { InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

const request = (
  status: 'approved' | 'rejected',
  overrides: Partial<CourseTypeDecisionRecord> = {},
): CourseTypeDecisionRecord => ({
  id: 'request-1',
  teacherId: 'teacher-1',
  typeName: 'History of English',
  status,
  approvedBy: status === 'approved' ? 'admin-1' : undefined,
  approvedAt: status === 'approved' ? 100 : undefined,
  handledBy: status === 'rejected' ? 'admin-1' : undefined,
  handledAt: status === 'rejected' ? 100 : undefined,
  rejectionReason: status === 'rejected' ? 'Already offered' : undefined,
  notificationIntent: {
    eventKind: `course-type-${status}`,
    authorityRecordId: 'request-1',
    occurrenceId: `request-1_${status}`,
    occurredAt: 100,
    dueAt: 100,
    attempts: 0,
    state: 'due',
  },
  ...overrides,
});

describe('course type decision notification', () => {
  it('derives the sole recipient and notice from the saved decision', async () => {
    const approved = resolveCourseTypeDecisionNotice('request-1', request('approved'));
    expect(approved).toMatchObject({
      recipientId: 'teacher-1',
      occurredAt: 100,
      notification: {
        type: 'success',
        title: 'Course Type Approved',
        link: '/teacher/courses',
      },
    });
    expect(approved?.notification.message).toContain('History of English');

    const rejected = resolveCourseTypeDecisionNotice('request-1', request('rejected'));
    expect(rejected?.notification).toMatchObject({
      type: 'error',
      title: 'Course Type Rejected',
      message: 'Your request for course type "History of English" was rejected: Already offered',
    });

    expect(resolveCourseTypeDecisionNotice('request-1', request('approved', {
      teacherId: '',
    }))).toBeNull();
    expect(resolveCourseTypeDecisionNotice('request-1', request('approved', {
      notificationIntent: { eventKind: 'course-type-rejected' },
    }))).toBeNull();

    const retrying = request('approved', {
      notificationIntent: {
        eventKind: 'course-type-approved',
        authorityRecordId: 'request-1',
        occurrenceId: 'request-1_approved',
        occurredAt: 100,
        dueAt: 7_200_100,
        attempts: 2,
        state: 'retrying',
      },
    });
    expect(resolveCourseTypeDecisionNotice('request-1', retrying)).toMatchObject({ recipientId: 'teacher-1' });
  });

  it('uses one stable inbox ID and original event time on replay', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const saved = request('approved');
    expect(await deliverCourseTypeDecisionNotice('request-1', saved, repository)).toBe(true);
    expect(await deliverCourseTypeDecisionNotice('request-1', saved, repository)).toBe(true);
    const rows = Object.values(repository.snapshot());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      read: false,
      createdAt: 100,
      title: 'Course Type Approved',
    });
  });
});
