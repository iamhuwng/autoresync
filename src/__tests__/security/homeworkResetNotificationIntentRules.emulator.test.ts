import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const rules = readFileSync('firestore.rules', 'utf8');
const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const eventId = 'a0b1c2d3-e4f5-4678-9abc-def012345678';
let testEnv: RulesTestEnvironment;

describe('homework reset notification intent rules contract', () => {
  it('binds event creation to an owner reset deleting a matching source submission', () => {
    expect(rules).toContain('match /homework_reset_notification_intents/{eventId}');
    expect(rules).toContain('get(/databases/$(database)/documents/homework_submissions/$(request.resource.data.sourceSubmissionId)).data.studentId == request.resource.data.studentId');
    expect(rules).toContain('!existsAfter(/databases/$(database)/documents/homework_submissions/$(request.resource.data.sourceSubmissionId))');
    expect(rules).toContain('allow update, delete: if false;');
  });
});

describeEmulator('homework reset notification intent Firestore rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'demo-homework-reset-intents', firestore: { rules } });
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('homework_assignments/homework-1').set({ id: 'homework-1', createdBy: 'teacher-1' });
      await context.firestore().doc('homework_submissions/submission-1').set({
        id: 'submission-1', homeworkId: 'homework-1', studentId: 'student-1', teacherId: 'teacher-1', status: 'submitted',
      });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('requires an owner reset to delete a saved submission with the immutable event', async () => {
    const teacher = testEnv.authenticatedContext('teacher-1').firestore();
    const occurredAt = Date.now();
    const event = {
      schemaVersion: 1, eventId, homeworkId: 'homework-1', studentId: 'student-1',
      sourceSubmissionId: 'submission-1', actorUid: 'teacher-1', occurredAt,
      state: 'retry_due', attempts: 0, dueAt: occurredAt,
    };
    const batch = teacher.batch();
    batch.delete(teacher.doc('homework_submissions/submission-1'));
    batch.set(teacher.doc(`homework_reset_notification_intents/${eventId}`), event);
    await assertSucceeds(batch.commit());
    await assertFails(teacher.doc(`homework_reset_notification_intents/${eventId}`).update({ state: 'done' }));
    await assertFails(testEnv.authenticatedContext('teacher-2').firestore()
      .doc(`homework_reset_notification_intents/${eventId}`).get());
  });

  it('rejects an event without the source submission deletion or with a forged actor', async () => {
    const teacher = testEnv.authenticatedContext('teacher-1').firestore();
    const occurredAt = Date.now();
    const event = {
      schemaVersion: 1, eventId, homeworkId: 'homework-1', studentId: 'student-1',
      sourceSubmissionId: 'submission-1', actorUid: 'teacher-1', occurredAt,
      state: 'retry_due', attempts: 0, dueAt: occurredAt,
    };
    await assertFails(teacher.doc(`homework_reset_notification_intents/${eventId}`).set(event));
    await assertFails(testEnv.authenticatedContext('teacher-2').firestore()
      .doc(`homework_reset_notification_intents/${eventId}`).set({ ...event, actorUid: 'teacher-2' }));
  });
});
