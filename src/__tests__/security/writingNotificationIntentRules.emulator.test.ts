import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const rules = readFileSync(process.env.FIRESTORE_RULES_PATH || 'firestore.rules', 'utf8');
const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const studentId = 'writing-student-1';
const teacherId = 'writing-teacher-1';
const submissionId = 'writing-submission-1';
const submittedAt = 100;
const studentEventId = `writing-${submissionId}-submitted-student`;
const teacherEventId = `writing-${submissionId}-submitted-teacher`;
let testEnv: RulesTestEnvironment;

const base = () => ({
  id: submissionId, studentId, sourceActorUid: studentId,
  context: { type: 'solo-practice', selectedTeacherId: teacherId, classId: 'class-1' },
  submittedAt,
});
const receipt = (eventId: string, kind: string, actorUid: string, occurredAt: number, extra = {}) => ({
  schemaVersion: 1, eventId, kind, authorityRecordId: submissionId, occurrenceId: eventId, actorUid, occurredAt, ...extra,
});

describeEmulator('Writing immutable notification authority receipts', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-writing-notification-receipts', firestore: { rules },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`writing_submissions/${submissionId}`).set(base());
    });
  });
  afterAll(async () => { await testEnv?.cleanup(); });

  it('binds solo student and selected-teacher receipts to the student source and makes receipts immutable', async () => {
    const student = testEnv.authenticatedContext(studentId).firestore();
    await assertSucceeds(student.doc(`writing_notification_intents/${studentEventId}`).set(
      receipt(studentEventId, 'writing-submitted-student', studentId, submittedAt)));
    await assertSucceeds(student.doc(`writing_notification_intents/${teacherEventId}`).set(
      receipt(teacherEventId, 'writing-submitted-teacher', studentId, submittedAt)));
    await assertSucceeds(student.doc(`writing_notification_intents/${studentEventId}`).get());
    await assertFails(testEnv.authenticatedContext('stranger').firestore()
      .doc(`writing_notification_intents/${studentEventId}`).get());
    await assertFails(student.collection('writing_notification_intents').get());
    await assertFails(student.doc(`writing_notification_intents/${studentEventId}`).update({ actorUid: 'stranger' }));
    await assertFails(student.doc(`writing_notification_intents/${studentEventId}`).delete());
  });

});
