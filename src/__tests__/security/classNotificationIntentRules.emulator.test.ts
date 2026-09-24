import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const classId = 'class-notification-rules';
const studentId = 'student-notification-rules';
const teacherId = 'teacher-notification-rules';
const actionId = 'action-notification-rules';

let testEnv: RulesTestEnvironment;

const actionClaims = (overrides: Record<string, unknown> = {}) => ({
  notificationClassAction: true,
  actionId,
  classId,
  studentId,
  actionKind: 'approve',
  actorUid: teacherId,
  ...overrides,
});

const approvedStudent = {
  id: studentId,
  uid: studentId,
  name: 'Test Student',
  status: 'active',
  joinedAt: 100,
  lastActiveAt: 100,
  isOnline: true,
  assignments: {},
};

const approvedProjection = { joinedAt: 100, status: 'active' };

const pendingIntent = {
  actionId,
  kind: 'approve',
  classId,
  studentId,
  actorUid: teacherId,
  teacherId,
  occurredAt: 200,
  className: 'Test Class',
  studentName: 'Test Student',
  dueAt: 3600200,
  attempts: 1,
  state: 'retry_due',
};

const approvePatch = (overrides: Record<string, unknown> = {}) => ({
  [`classes/${classId}/students/${studentId}`]: approvedStudent,
  [`student_classes/${studentId}/${classId}`]: approvedProjection,
  [`notification_intents/${actionId}`]: pendingIntent,
  ...overrides,
});

describeEmulator('class notification intent RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-class-notification-intents',
      database: { rules: DATABASE_RULES },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({
        users: { [teacherId]: { role: 'teacher' } },
        classes: {
          [classId]: {
            createdBy: teacherId,
            status: 'active',
            students: { [studentId]: { ...approvedStudent, status: 'pending_approval' } },
          },
        },
        student_classes: { [studentId]: { [classId]: { joinedAt: 100, status: 'pending_approval' } } },
      });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('allows one scoped pending-to-active transition and initial retry intent', async () => {
    const service = testEnv.authenticatedContext(
      `notification-class-action:${actionId}`,
      actionClaims(),
    ).database();

    await assertSucceeds(service.ref().update(approvePatch()));

    let result: Record<string, unknown>;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snapshot = await context.database().ref().get();
      result = snapshot.val() as Record<string, unknown>;
    });
    expect(result!.classes).toMatchObject({ [classId]: { students: { [studentId]: { status: 'active' } } } });
    expect(result!.notification_intents).toMatchObject({ [actionId]: { attempts: 1, state: 'retry_due' } });
  });

  it('denies stale or wrong-scope service transitions', async () => {
    const stale = testEnv.authenticatedContext(
      `notification-class-action:${actionId}`,
      actionClaims(),
    ).database();
    await assertFails(stale.ref().update(approvePatch()));

    const wrongStudent = testEnv.authenticatedContext(
      `notification-class-action:${actionId}`,
      actionClaims({ studentId: 'another-student' }),
    ).database();
    await assertFails(wrongStudent.ref().update(approvePatch()));

    const wrongActor = testEnv.authenticatedContext(
      `notification-class-action:${actionId}`,
      actionClaims({ actorUid: 'other-teacher' }),
    ).database();
    await assertFails(wrongActor.ref().update(approvePatch()));
  });

  it('denies browser creation of an intent directly and through a root multi-location patch', async () => {
    const browser = testEnv.authenticatedContext(teacherId).database();
    await assertFails(browser.ref(`notification_intents/${actionId}`).set(pendingIntent));
    await assertFails(browser.ref().update({
      [`classes/${classId}/students/${studentId}`]: approvedStudent,
      [`student_classes/${studentId}/${classId}`]: approvedProjection,
      [`notification_intents/${actionId}`]: pendingIntent,
    }));
    await assertFails(browser.ref('notification_intents').set({ [actionId]: pendingIntent }));
  });

  it('documents the existing teacher ancestor grant still permits direct roster mutation', async () => {
    const browser = testEnv.authenticatedContext(teacherId).database();
    await assertSucceeds(browser.ref(`classes/${classId}/students/${studentId}`).update({ status: 'active' }));
  });
});
