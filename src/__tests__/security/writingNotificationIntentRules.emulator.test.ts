import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const rules = readFileSync('firestore.rules', 'utf8');
const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const submissionId = 'writing-submission-1';
const studentId = 'writing-student-1';
const teacherId = 'writing-teacher-1';
const occurredAt = Date.now();
const eventId = `writing-${submissionId}-graded-1`;
const submitStudentEventId = `writing-${submissionId}-submitted-student`;
const submitTeacherEventId = `writing-${submissionId}-submitted-teacher`;
const submissionOccurredAt = occurredAt - 1000;

let testEnv: RulesTestEnvironment;
const publishedGrading = {
  teacherId, teacherName: 'Writing Teacher', gradedAt: occurredAt, updatedAt: occurredAt,
  overallBand: 6, overallSummary: '', auditVersion: 1, perTask: {},
};
const submission = {
  id: submissionId, studentId, studentName: 'Student',
  context: { type: 'solo-practice', selectedTeacherId: teacherId },
  testMeta: { testId: 'test-1', testTitle: 'Writing Check', format: 'IELTS', duration: 60 },
  submittedAt: submissionOccurredAt, markingStatus: 'pending-review', tasks: [], annotations: [], auditTrail: [],
};
const auditTrail = [{ version: 1, gradedAt: occurredAt, teacherId, teacherName: 'Writing Teacher', action: 'published', reason: 'Initial publish', previousScores: null }];
const intent = {
  schemaVersion: 1, eventId, kind: 'writing-graded', authorityRecordId: submissionId,
  occurrenceId: eventId, actorUid: teacherId, auditVersion: 1, occurredAt,
  dueAt: occurredAt + 3_600_000, attempts: 1, state: 'retry_due',
};
const submittedIntent = (kind: 'writing-submitted-student' | 'writing-submitted-teacher') => {
  const eventId = kind === 'writing-submitted-student' ? submitStudentEventId : submitTeacherEventId;
  return {
    schemaVersion: 1, eventId, kind, authorityRecordId: submissionId, occurrenceId: eventId,
    actorUid: studentId, occurredAt: submissionOccurredAt, dueAt: submissionOccurredAt + 3_600_000,
    attempts: 1, state: 'retry_due',
  };
};

describeEmulator('writing grade notification intent Firestore rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-writing-notification-intents', firestore: { rules },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`writing_submissions/${submissionId}`).set(submission);
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('allows an assigned teacher to atomically publish a grade and save its recipient-free intent', async () => {
    const firestore = testEnv.authenticatedContext(teacherId).firestore();
    const batch = firestore.batch();
    batch.update(firestore.doc(`writing_submissions/${submissionId}`), {
      publishedGrading, markingStatus: 'graded', auditTrail,
    });
    batch.set(firestore.doc(`writing_notification_intents/${eventId}`), intent);
    await assertSucceeds(batch.commit());
    await testEnv.withSecurityRulesDisabled(async (context) => {
      expect((await context.firestore().doc(`writing_notification_intents/${eventId}`).get()).data()).toEqual(intent);
    });
  });

  it('rejects detached, forged, or caller-authored intents and recipient changes', async () => {
    const teacher = testEnv.authenticatedContext(teacherId).firestore();
    await assertFails(teacher.doc(`writing_notification_intents/${eventId}`).set(intent));

    const batch = teacher.batch();
    batch.update(teacher.doc(`writing_submissions/${submissionId}`), {
      publishedGrading, markingStatus: 'graded', auditTrail,
    });
    batch.set(teacher.doc(`writing_notification_intents/${eventId}`), { ...intent, recipientId: 'forged-student' });
    await assertFails(batch.commit());

    const student = testEnv.authenticatedContext(studentId).firestore();
    await assertFails(student.doc(`writing_submissions/${submissionId}`).update({ studentId: 'forged-student' }));
  });

  it('rejects a teacher creating a solo submission for a victim student', async () => {
    const teacher = testEnv.authenticatedContext(teacherId).firestore();
    await assertFails(teacher.doc('writing_submissions/forged-victim-submission').set({
      ...submission,
      id: 'forged-victim-submission',
      studentId: 'victim-student',
      context: { type: 'solo-practice', selectedTeacherId: teacherId },
    }));
  });

  it('allows student intents only with the new source submission and one stable event key', async () => {
    await testEnv.clearFirestore();
    const student = testEnv.authenticatedContext(studentId).firestore();
    const batch = student.batch();
    batch.set(student.doc(`writing_submissions/${submissionId}`), submission);
    batch.set(student.doc(`writing_notification_intents/${submitStudentEventId}`), submittedIntent('writing-submitted-student'));
    batch.set(student.doc(`writing_notification_intents/${submitTeacherEventId}`), submittedIntent('writing-submitted-teacher'));
    await assertSucceeds(batch.commit());

    const wrongActor = testEnv.authenticatedContext(teacherId).firestore();
    const forged = wrongActor.batch();
    forged.set(wrongActor.doc(`writing_submissions/forged-submission`), { ...submission, id: 'forged-submission' });
    forged.set(wrongActor.doc(`writing_notification_intents/writing-forged-submission-submitted-student`), {
      ...submittedIntent('writing-submitted-student'),
      eventId: 'writing-forged-submission-submitted-student',
      authorityRecordId: 'forged-submission',
      occurrenceId: 'writing-forged-submission-submitted-student',
      actorUid: teacherId,
    });
    await assertFails(forged.commit());
  });
});
