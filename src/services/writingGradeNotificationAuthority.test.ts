import { describe, expect, it } from 'vitest';
import {
  deliverWritingGradeNotification,
  writingGradeNotification,
  type WritingGradeNotificationIntent,
} from '../../cloudflare/src/upload-worker/notifications/writing-grade-authority';
import { InMemoryNotificationCommandRepository } from '../../cloudflare/src/upload-worker/notifications/repository';

const submissionId = 'writing-submission-1';
const eventId = `writing-${submissionId}-graded-1`;
const occurredAt = 1_800_000_000_000;
const intent: WritingGradeNotificationIntent = {
  schemaVersion: 1, eventId, kind: 'writing-graded', authorityRecordId: submissionId,
  occurrenceId: eventId, actorUid: 'writing-teacher-1', auditVersion: 1,
  occurredAt, dueAt: occurredAt + 3_600_000, attempts: 1, state: 'retry_due',
};
const submission = {
  id: submissionId, studentId: 'writing-student-1', testMeta: { testTitle: 'Caller text is ignored' },
  context: { selectedTeacherId: intent.actorUid },
  auditTrail: [{ version: 1, gradedAt: occurredAt, teacherId: intent.actorUid, action: 'published' }],
};

describe('writing grade notification authority', () => {
  it('derives the stable student recipient and fixed notice from saved submission facts', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const rows = new Map<string, unknown>([[eventId, intent], [submissionId, submission]]);
    const storage = {
      async readIntent(id: string) { return rows.get(id); },
      async readSubmission(id: string) { return rows.get(id); },
      async updateIntent(next: WritingGradeNotificationIntent) { rows.set(eventId, next); },
      async dueIntents() { return []; },
      async claimRetry() { return null; },
      async readTeacherLink() { return true; },
      async readSessionSubmissionProof() { return false; },
      async readInbox() { return null; },
      async reportFailure() {},
    };

    await expect(deliverWritingGradeNotification({
      eventId, submissionId, actorUid: intent.actorUid, storage, repository, now: () => occurredAt,
    })).resolves.toBe('delivered');
    expect(repository.snapshot()).toEqual({
      [`notifications/${submission.studentId}/${eventId}`]: {
        id: eventId,
        type: 'success',
        title: 'Writing graded',
        message: 'Your writing submission has been graded. View your academic record.',
        link: '/student/academic-record',
        read: false,
        createdAt: occurredAt,
      },
    });
    expect(rows.get(eventId)).toMatchObject({ state: 'done' });
  });

  it('rejects a changed actor, audit event, or recipient authority', () => {
    expect(writingGradeNotification({ ...intent, actorUid: 'forged-teacher' }, submission)).toBeNull();
    expect(writingGradeNotification(intent, { ...submission, studentId: 'bad/id' })).toBeNull();
    expect(writingGradeNotification(intent, {
      ...submission,
      auditTrail: [{ ...submission.auditTrail[0], version: 2 }],
    })).toBeNull();
  });

  it('only derives a solo-practice teacher recipient after checking the saved assignment link', () => {
    const submittedAt = occurredAt - 1000;
    const teacherIntent = {
      ...intent,
      eventId: `writing-${submissionId}-submitted-teacher`,
      kind: 'writing-submitted-teacher',
      occurrenceId: `writing-${submissionId}-submitted-teacher`,
      actorUid: 'writing-student-1',
      occurredAt: submittedAt,
      dueAt: submittedAt + 3_600_000,
      auditVersion: undefined,
    };
    const submitted = {
      ...submission,
      studentName: 'Student One',
      submittedAt,
      context: { type: 'solo-practice', selectedTeacherId: 'writing-teacher-1' },
    };

    expect(writingGradeNotification(teacherIntent, submitted, false)).toBeNull();
    expect(writingGradeNotification(teacherIntent, submitted, true)).toMatchObject({
      recipientId: 'writing-teacher-1',
      notification: {
        type: 'info',
        message: 'A student submitted writing for review.',
        link: '/teacher/grading/writing/writing-submission-1',
      },
    });
  });

  it('derives the student submission notice from the source submission and canonical event identity', () => {
    const submittedAt = occurredAt - 1000;
    const studentEventId = `writing-${submissionId}-submitted-student`;
    expect(writingGradeNotification({
      schemaVersion: 1,
      eventId: studentEventId,
      kind: 'writing-submitted-student',
      authorityRecordId: submissionId,
      occurrenceId: studentEventId,
      actorUid: submission.studentId,
      occurredAt: submittedAt,
      dueAt: submittedAt + 3_600_000,
      attempts: 1,
      state: 'retry_due',
    }, {
      ...submission, submittedAt,
      context: { type: 'solo-practice', selectedTeacherId: 'writing-teacher-1' },
      auditTrail: undefined,
    })).toMatchObject({
      recipientId: submission.studentId,
      notification: { link: '/student/academic-record', type: 'success' },
    });
  });

  it('requires saved session submission proof for live-session student notices', async () => {
    const studentEventId = `writing-${submissionId}-submitted-student`;
    const submittedAt = occurredAt - 1000;
    const liveIntent: WritingGradeNotificationIntent = {
      schemaVersion: 1, eventId: studentEventId, kind: 'writing-submitted-student',
      authorityRecordId: submissionId, occurrenceId: studentEventId, actorUid: 'writing-teacher-1',
      occurredAt: submittedAt, dueAt: submittedAt + 3_600_000, attempts: 1, state: 'retry_due',
    };
    const liveSubmission = {
      ...submission, submittedAt,
      context: { type: 'live-session', sessionCode: 'session-1', assigningTeacherId: liveIntent.actorUid },
    };
    const storage = {
      async readIntent() { return liveIntent; },
      async readSubmission() { return liveSubmission; },
      async updateIntent() {},
      async dueIntents() { return []; },
      async claimRetry() { return null; },
      async readTeacherLink() { return false; },
      async readSessionSubmissionProof() { return false; },
      async readInbox() { return null; },
      async reportFailure() {},
    };
    const repository = new InMemoryNotificationCommandRepository();

    await expect(deliverWritingGradeNotification({
      eventId: studentEventId, submissionId, actorUid: liveIntent.actorUid, storage, repository,
    })).resolves.toBe('forbidden');
    expect(repository.snapshot()).toEqual({});
  });
});
