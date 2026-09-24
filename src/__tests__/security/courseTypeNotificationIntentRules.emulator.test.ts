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
const requestId = 'course-type-request-1';
const teacherId = 'course-type-teacher';
const adminId = 'course-type-admin';
const typeId = 'course-type-id-1';
const requestedAt = 100;

let testEnv: RulesTestEnvironment;

const savedRequest = {
  id: requestId,
  teacherId,
  typeName: 'History of English',
  requestedAt,
  status: 'pending',
};

const intent = (status: 'approved' | 'rejected', occurredAt: number) => ({
  eventKind: `course-type-${status}`,
  authorityRecordId: requestId,
  occurrenceId: `${requestId}_${status}`,
  occurredAt,
  dueAt: occurredAt,
  attempts: 0,
  state: 'due',
});

const decision = (
  status: 'approved' | 'rejected',
  overrides: Record<string, unknown> = {},
) => {
  const at = 200;
  return {
    ...savedRequest,
    status,
    ...(status === 'approved'
      ? { approvedBy: adminId, approvedAt: at }
      : { handledBy: adminId, handledAt: at, rejectionReason: 'Already offered' }),
    notificationIntent: intent(status, at),
    ...overrides,
  };
};

describeEmulator('course type notification intent RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-course-type-notification-intents',
      database: { rules: DATABASE_RULES },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({
        users: {
          [teacherId]: { role: 'teacher' },
          [adminId]: { role: 'super_admin' },
          'other-admin': { role: 'super_admin' },
        },
        course_type_requests: { [requestId]: savedRequest },
      });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('atomically allows approval with the approved course type and intent', async () => {
    const admin = testEnv.authenticatedContext(adminId).database();
    await assertSucceeds(admin.ref().update({
      [`course_types/${typeId}`]: {
        id: typeId,
        name: savedRequest.typeName,
        isSystem: false,
        createdBy: teacherId,
        createdAt: 200,
      },
      [`course_type_requests/${requestId}`]: decision('approved'),
    }));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const result = (await context.database().ref(`course_type_requests/${requestId}`).get()).val();
      expect(result).toMatchObject({ status: 'approved', approvedBy: adminId, notificationIntent: intent('approved', 200) });
    });
  });

  it('allows a pending request to be rejected with its intent in the same write', async () => {
    const admin = testEnv.authenticatedContext(adminId).database();
    await assertSucceeds(admin.ref(`course_type_requests/${requestId}`).set(decision('rejected')));
  });

  it('denies stale decisions, wrong actors, and decisions without an intent', async () => {
    const admin = testEnv.authenticatedContext(adminId).database();
    await admin.ref(`course_type_requests/${requestId}`).set(decision('rejected'));
    await assertFails(admin.ref(`course_type_requests/${requestId}`).set(decision('approved')));

    const wrongAdmin = testEnv.authenticatedContext('other-admin').database();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref(`course_type_requests/${requestId}`).set(savedRequest);
    });
    await assertFails(wrongAdmin.ref(`course_type_requests/${requestId}`).set(decision('rejected')));

    await assertFails(admin.ref(`course_type_requests/${requestId}`).set(decision('approved', { notificationIntent: null })));
  });

  it('denies direct teacher updates that bypass the decision intent', async () => {
    const teacher = testEnv.authenticatedContext(teacherId).database();
    await assertFails(teacher.ref(`course_type_requests/${requestId}`).update({ status: 'approved' }));
  });

  it('denies child-path status or intent writes that would skip the atomic decision', async () => {
    const admin = testEnv.authenticatedContext(adminId).database();
    await assertFails(admin.ref(`course_type_requests/${requestId}/status`).set('approved'));
    await assertFails(admin.ref(`course_type_requests/${requestId}/notificationIntent`).set(intent('approved', 200)));
  });
});
