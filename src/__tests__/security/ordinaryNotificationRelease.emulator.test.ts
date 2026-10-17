import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { increment } from 'firebase/firestore';

let env: RulesTestEnvironment;
beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Both Firebase emulators are required for notification release checks.');
  }
  env = await initializeTestEnvironment({
    projectId: 'demo-notification-release-20261017',
    database: { rules: readFileSync('database.rules.json', 'utf8') },
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => { await env.clearDatabase(); await env.clearFirestore(); });
afterAll(async () => { await env?.cleanup(); });

it('delivers a source-proven class request only to its recipient and preserves read state on replay', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await context.database().ref().set({
      users: { teacher: { role: 'teacher' }, student: { role: 'student' }, stranger: { role: 'teacher' } },
      classes: { class1: { createdBy: 'teacher', status: 'active', students: {
        student: { uid: 'student', status: 'pending_approval', joinedAt: 100 },
      } } },
    });
  });
  const id = 'ordinary_class_join-pending_class1_student_100';
  const notice = {
    id, type: 'info', title: 'New class request', message: 'A student requested to join your class.',
    createdAt: 100, link: '/teacher/classes/class1',
    metadata: { eventKind: 'ordinary-class', action: 'join-pending', classId: 'class1', studentId: 'student', occurredAt: 100 },
  };
  const path = `notifications/teacher/${id}`;
  const sender = env.authenticatedContext('student').database().ref(path);
  const recipient = env.authenticatedContext('teacher').database().ref(path);
  const stranger = env.authenticatedContext('stranger').database().ref(path);
  await assertSucceeds(sender.set(notice));
  expect((await assertSucceeds(recipient.get())).val().id).toBe(id);
  await assertFails(stranger.get());
  await assertFails(stranger.set(notice));
  await assertSucceeds(recipient.child('read').set(true));
  await assertSucceeds(sender.set({ ...notice, read: true }));
  expect((await recipient.get()).val().read).toBe(true);
  await assertFails(recipient.child('title').set('Forged content'));
});

it('requires the owner reminder counter and immutable intent to commit atomically', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await context.firestore().doc('homework_assignments/homework1').set({
      id: 'homework1', createdBy: 'teacher', materialType: 'test', materialId: 'test1',
      target: { type: 'students', studentIds: ['student'] }, studentOverrides: {},
    });
  });
  const teacher = env.authenticatedContext('teacher').firestore();
  const intent = { eventId: 'reminder1', homeworkId: 'homework1', studentId: 'student', actorUid: 'teacher', occurredAt: Date.now() - 1000 };
  const intentRef = teacher.doc('homework_manual_reminder_intents/reminder1');
  await assertFails(intentRef.set(intent));
  const batch = teacher.batch();
  batch.update(teacher.doc('homework_assignments/homework1'), {
    'studentOverrides.student.reminderCount': increment(1),
    'studentOverrides.student.lastRemindedAt': intent.occurredAt,
  });
  batch.set(intentRef, intent);
  await assertSucceeds(batch.commit());
  expect((await intentRef.get()).data()?.eventId).toBe('reminder1');
  await assertFails(intentRef.update({ occurredAt: Date.now() }));
  await assertFails(env.authenticatedContext('stranger').firestore()
    .doc('homework_manual_reminder_intents/reminder1').get());
});
