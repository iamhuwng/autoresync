import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const rules = readFileSync(process.env.BRIDGE_FIRESTORE_RULES ?? 'firestore.rules', 'utf8');
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
    testEnv ??= await initializeTestEnvironment({
      projectId: 'demo-writing-notification-intents', firestore: { rules },
    });
    await testEnv.clearFirestore();
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

  const homeworkId = 'writing-homework-1';
  const attemptId = 'writing-attempt-1';
  const assignment = {
    id: homeworkId, createdBy: teacherId, materialId: 'test-1', materialType: 'test', materialSkill: 'writing',
    target: { type: 'students', studentIds: [studentId] },
  };
  const attempt = { id: attemptId, studentId, homeworkId, teacherId, status: 'in_progress', startedAt: submissionOccurredAt };
  const homeworkWriting = {
    ...submission,
    context: { type: 'homework', homeworkId, homeworkSubmissionId: attemptId, assigningTeacherId: teacherId },
  };
  const seedHomework = async () => testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`homework_assignments/${homeworkId}`).set(assignment);
    await context.firestore().doc(`writing_submissions/${submissionId}`).delete();
  });
  const submitUpdates = () => {
    const submittedAt = Date.now();
    return {
      status: 'submitted', resultId: submissionId, submittedAt,
    };
  };

  it('saves ordinary homework without permitting new notification outbox fields', async () => {
    await seedHomework();
    const student = testEnv.authenticatedContext(studentId).firestore();
    const attemptRef = student.doc(`homework_submissions/${attemptId}`);
    await assertSucceeds(attemptRef.set(attempt));
    await assertSucceeds(student.doc(`writing_submissions/${submissionId}`).set(homeworkWriting));
    const updates = submitUpdates();
    const notificationIntent = {
      schemaVersion: 1, eventId: `homework-submitted:${submissionId}`, resultId: submissionId,
      homeworkId, studentId, teacherId, submittedAt: updates.submittedAt,
    };
    const notificationDelivery = { state: 'retry_due', attempts: 1, dueAt: updates.submittedAt + 3_600_000 };
    for (const fields of [{ notificationIntent }, { notificationDelivery }, { notificationIntent, notificationDelivery }]) {
      await assertFails(attemptRef.update({ ...updates, ...fields }));
    }
    await assertSucceeds(attemptRef.update(updates));
  });

  it('preserves the individual Writing create, progress, submit, grade, reset, and new-attempt lifecycle', async () => {
    await seedHomework();
    const student = testEnv.authenticatedContext(studentId).firestore();
    const teacher = testEnv.authenticatedContext(teacherId).firestore();
    const attemptRef = student.doc(`homework_submissions/${attemptId}`);
    await assertSucceeds(attemptRef.set(attempt));
    await assertSucceeds(attemptRef.update({ timeSpent: 60 }));
    await assertSucceeds(student.doc(`writing_submissions/${submissionId}`).set(homeworkWriting));
    await assertSucceeds(attemptRef.update(submitUpdates()));
    await assertSucceeds(teacher.doc(`writing_submissions/${submissionId}`).update({
      publishedGrading, markingStatus: 'graded', auditTrail,
      'context.studentNote': 'Review complete', annotations: [],
    }));
    await assertSucceeds(teacher.doc(`homework_submissions/${attemptId}`).update({ status: 'graded', bandScore: 6 }));
    const reset = teacher.batch();
    const resetEventId = 'a0b1c2d3-e4f5-4678-9abc-def012345678';
    const resetAt = Date.now();
    reset.delete(teacher.doc(`homework_submissions/${attemptId}`));
    reset.set(teacher.doc(`homework_reset_notification_intents/${resetEventId}`), {
      schemaVersion: 1, eventId: resetEventId, homeworkId, studentId, sourceSubmissionId: attemptId,
      actorUid: teacherId, occurredAt: resetAt, state: 'retry_due', attempts: 0, dueAt: resetAt,
    });
    await assertSucceeds(reset.commit());
    await assertSucceeds(student.doc('homework_submissions/writing-attempt-2').set({ ...attempt, id: 'writing-attempt-2' }));
  });

  it('preserves class Writing creation and previously allowed teacher homework import updates', async () => {
    await seedHomework();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`homework_assignments/${homeworkId}`).update({ target: { type: 'class', classId: 'class-1' } });
    });
    const student = testEnv.authenticatedContext(studentId).firestore();
    await assertSucceeds(student.doc(`homework_submissions/${attemptId}`).set(attempt));
    await assertSucceeds(student.doc(`writing_submissions/${submissionId}`).set(homeworkWriting));
    const teacher = testEnv.authenticatedContext(teacherId).firestore();
    const administrativeImport = { source: 'external-admin-import', importedByTeacherId: teacherId, importedAt: Date.now() };
    await assertSucceeds(teacher.doc(`homework_submissions/${attemptId}`).update({
      status: 'submitted', resultId: submissionId, submittedAt: Date.now(), administrativeImport,
    }));
    await assertFails(teacher.doc(`homework_submissions/${attemptId}`).update({ administrativeImport: null }));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('writing_submissions/imported-writing').set({
        ...homeworkWriting, id: 'imported-writing',
        context: { ...homeworkWriting.context, homeworkSubmissionId: 'imported-attempt', externalImport: administrativeImport },
      });
    });
    await assertSucceeds(teacher.doc('homework_submissions/imported-attempt').set({
      ...attempt, id: 'imported-attempt', status: 'submitted', resultId: 'imported-writing', submittedAt: Date.now(), administrativeImport,
    }));
  });

  it('rejects forged initial homework occurrences and wrong source actors, targets, and bindings', async () => {
    await seedHomework();
    const student = testEnv.authenticatedContext(studentId).firestore();
    const attemptRef = student.doc(`homework_submissions/${attemptId}`);
    for (const fields of [
      { status: 'submitted', resultId: submissionId, submittedAt: Date.now() },
      { notificationIntent: { schemaVersion: 1 } },
      { notificationDelivery: { state: 'retry_due' } },
      { teacherId: 'wrong-teacher' }, { studentId: 'victim' }, { id: 'wrong-id' }, { homeworkId: 'missing-homework' },
    ]) await assertFails(attemptRef.set({ ...attempt, ...fields }));
    await assertFails(testEnv.authenticatedContext('unassigned-student').firestore().doc('homework_submissions/unassigned-attempt')
      .set({ ...attempt, id: 'unassigned-attempt', studentId: 'unassigned-student' }));
    await assertSucceeds(attemptRef.set(attempt));
    for (const fields of [
      { studentId: 'victim' }, { id: 'wrong-id' }, { testMeta: { ...submission.testMeta, testId: 'wrong-test' } },
      { context: { ...homeworkWriting.context, assigningTeacherId: 'wrong-teacher' } },
      { context: { ...homeworkWriting.context, homeworkId: 'missing-homework' } },
      { context: { ...homeworkWriting.context, homeworkSubmissionId: 'missing-attempt' } },
    ]) await assertFails(student.doc(`writing_submissions/${submissionId}`).set({ ...homeworkWriting, ...fields }));
    await assertFails(testEnv.authenticatedContext(teacherId).firestore()
      .doc(`writing_submissions/${submissionId}`).set(homeworkWriting));
    await assertSucceeds(student.doc(`writing_submissions/${submissionId}`).set(homeworkWriting));
    await assertFails(testEnv.authenticatedContext('other-teacher').firestore()
      .doc(`writing_submissions/${submissionId}`).update({ submittedAt: Date.now(), grading: { teacherId: 'other-teacher' } }));
  });

  it('freezes occurrence bindings while rejecting wrong-student, wrong-attempt, and wrong-test results', async () => {
    await seedHomework();
    const student = testEnv.authenticatedContext(studentId).firestore();
    const teacher = testEnv.authenticatedContext(teacherId).firestore();
    const attemptRef = student.doc(`homework_submissions/${attemptId}`);
    const writingRef = student.doc(`writing_submissions/${submissionId}`);
    await assertSucceeds(attemptRef.set(attempt));
    for (const fields of [
      { studentId: 'victim' }, { homeworkId: 'wrong-homework' }, { teacherId: 'wrong-teacher' }, { id: 'wrong-id' },
    ]) {
      await assertFails(attemptRef.update(fields));
      await assertFails(teacher.doc(`homework_submissions/${attemptId}`).update(fields));
    }
    for (const fields of [
      { studentId: 'victim' }, { testMeta: { ...submission.testMeta, testId: 'wrong-test' } },
      { context: { ...homeworkWriting.context, homeworkSubmissionId: 'wrong-attempt' } },
      { context: { ...homeworkWriting.context, homeworkId: 'wrong-homework' } },
    ]) {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`writing_submissions/${submissionId}`).set({ ...homeworkWriting, ...fields });
      });
      await assertFails(attemptRef.update(submitUpdates()));
    }
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`writing_submissions/${submissionId}`).set(homeworkWriting);
    });
    await assertSucceeds(attemptRef.update(submitUpdates()));
    for (const fields of [{ resultId: 'wrong-result' }, { submittedAt: Date.now() + 1000 }]) {
      await assertFails(attemptRef.update(fields));
      await assertFails(teacher.doc(`homework_submissions/${attemptId}`).update(fields));
    }
    for (const fields of [
      { submittedAt: Date.now() }, { 'testMeta.testId': 'wrong-test' }, { 'context.homeworkId': 'wrong-homework' },
      { 'context.homeworkSubmissionId': 'wrong-attempt' }, { 'context.assigningTeacherId': 'wrong-teacher' },
    ]) {
      await assertFails(writingRef.update(fields));
      await assertFails(teacher.doc(`writing_submissions/${submissionId}`).update(fields));
    }
  });
});
