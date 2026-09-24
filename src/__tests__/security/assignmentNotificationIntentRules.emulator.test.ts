import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const rules = readFileSync('database.rules.json', 'utf8');
const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const requestId = 'assignment-request-notification';
const studentId = 'assignment-notification-student';
const teacherId = 'assignment-notification-teacher';
const adminId = 'assignment-notification-admin';
const request = { id: requestId, teacherId, studentEmail: 'student@example.com', requestedAt: 100, status: 'pending' };
const approved = (now: number) => ({
  ...request, status: 'approved', reviewedBy: adminId, reviewedAt: now, studentId, assignmentId: 'assignment-1',
  notificationIntent: { schemaVersion: 1, actionId: requestId, kind: 'assignment-request-approved', occurredAt: now,
    dueAt: now + 3_600_000, attempts: 0, state: 'pending' },
});

let env: RulesTestEnvironment;
describeEmulator('assignment notification intent RTDB rules', () => {
  beforeEach(async () => {
    env = await initializeTestEnvironment({ projectId: 'demo-assignment-notification-intents', database: { rules } });
    await env.withSecurityRulesDisabled(async context => {
      await context.database().ref().set({
        users: { [teacherId]: { role: 'teacher' }, [adminId]: { role: 'super_admin' }, [studentId]: { role: 'student' } },
        student_requests: { [requestId]: request },
      });
    });
  });
  afterAll(async () => { await env?.cleanup(); });

  it('allows one atomic approval with immutable intent, assignment and link writes', async () => {
    const now = Date.now();
    const admin = env.authenticatedContext(adminId).database();
    await assertSucceeds(admin.ref().update({
      [`student_requests/${requestId}`]: approved(now),
      'student_teacher_assignments/assignment-1': { id: 'assignment-1', studentId, teacherId, assignedBy: adminId,
        assignedAt: now, unassignedAt: null, status: 'active' },
      [`student_teacher_links/${teacherId}/${studentId}`]: true,
      'assignment_history/history-1': { id: 'history-1', studentId, teacherId, action: 'assigned', performedBy: adminId, timestamp: now },
    }));
    const stored = await admin.ref(`student_requests/${requestId}`).get();
    expect(stored.val()).toMatchObject({ status: 'approved', studentId, assignmentId: 'assignment-1',
      notificationIntent: { actionId: requestId, attempts: 0, state: 'pending' } });
  });

  it('denies teacher source-only approval patches', async () => {
    const teacher = env.authenticatedContext(teacherId).database();
    await assertFails(teacher.ref().update({ [`student_requests/${requestId}/status`]: 'approved' }));
    await assertFails(teacher.ref().update({ [`student_requests/${requestId}`]: { ...request, status: 'approved' } }));
  });

  it('documents the existing super-admin root grant on a direct intent child write', async () => {
    const admin = env.authenticatedContext(adminId).database();
    await assertSucceeds(admin.ref(`student_requests/${requestId}/notificationIntent`).set(approved(Date.now()).notificationIntent));
  });

  it('denies non-admin approval and documents the super-admin ancestor grant', async () => {
    const now = Date.now();
    const teacher = env.authenticatedContext(teacherId).database();
    const admin = env.authenticatedContext(adminId).database();
    await assertFails(teacher.ref(`student_requests/${requestId}`).update(approved(now)));
    await assertSucceeds(admin.ref(`student_requests/${requestId}`).update(approved(now + 1)));
    await assertSucceeds(admin.ref(`student_requests/${requestId}`).update({ ...approved(now), studentEmail: 'forged@example.com' }));
  });

  it('keeps teacher request creation and administrator denial available', async () => {
    const teacher = env.authenticatedContext(teacherId).database();
    await assertSucceeds(teacher.ref('student_requests/new-request').set({ id: 'new-request', teacherId,
      studentEmail: 'new@example.com', requestedAt: Date.now(), status: 'pending' }));
    await assertSucceeds(env.authenticatedContext(adminId).database().ref(`student_requests/${requestId}`).update({
      ...request, status: 'denied', reviewedBy: adminId, reviewedAt: Date.now(),
    }));
  });
});
