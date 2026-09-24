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
const requestId = 'course-request-notification';
const courseId = 'course-request-course';
const studentId = 'course-request-student';
const teacherId = 'course-request-teacher';
const otherTeacherId = 'course-request-other-teacher';
const request = (now: number) => ({
  id: requestId,
  studentId,
  studentName: 'Student',
  courseId,
  courseName: 'Saved course snapshot',
  teacherId,
  type: 'join',
  status: 'pending',
  requestedAt: now - 60_000,
  expiresAt: now + 86_400_000,
});
const decision = (now: number, overrides: Record<string, unknown> = {}) => ({
  status: 'approved',
  processedBy: teacherId,
  processedAt: now,
  notificationIntent: {
    schemaVersion: 1,
    actionId: requestId,
    kind: 'course-request-decision',
    occurredAt: now,
    dueAt: now + 3_600_000,
    attempts: 0,
    state: 'pending',
  },
  ...overrides,
});

let testEnv: RulesTestEnvironment;

describeEmulator('course request notification intent RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-course-request-notification-intents',
      database: { rules: DATABASE_RULES },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({
        users: {
          [studentId]: { uid: studentId, role: 'student' },
          [teacherId]: { uid: teacherId, role: 'teacher' },
          [otherTeacherId]: { uid: otherTeacherId, role: 'teacher' },
        },
        courses: { [courseId]: { ownerId: teacherId, name: 'Canonical course' } },
        course_requests: { [requestId]: request(Date.now()) },
      });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('allows the course owner to atomically resolve a pending request and create one retry intent', async () => {
    const now = Date.now();
    const teacher = testEnv.authenticatedContext(teacherId).database();
    await assertSucceeds(teacher.ref(`course_requests/${requestId}`).update(decision(now)));
    const stored = await teacher.ref(`course_requests/${requestId}`).get();
    expect(stored.val()).toMatchObject({
      status: 'approved', processedBy: teacherId,
      notificationIntent: { actionId: requestId, attempts: 0, state: 'pending' },
    });
  });

  it('denies direct status or intent writes that bypass the atomic transition', async () => {
    const teacher = testEnv.authenticatedContext(teacherId).database();
    await assertFails(teacher.ref(`course_requests/${requestId}/status`).set('approved'));
    await assertFails(teacher.ref(`course_requests/${requestId}/notificationIntent`).set(decision(Date.now()).notificationIntent));
    await assertFails(teacher.ref(`course_requests/${requestId}`).update({
      status: 'approved', processedBy: teacherId, processedAt: Date.now(),
    }));
  });

  it('denies a forged actor, wrong course owner, and edits to saved request facts', async () => {
    const now = Date.now();
    const student = testEnv.authenticatedContext(studentId).database();
    const otherTeacher = testEnv.authenticatedContext(otherTeacherId).database();
    await assertFails(student.ref(`course_requests/${requestId}`).update(decision(now)));
    await assertFails(otherTeacher.ref(`course_requests/${requestId}`).update(decision(now, { processedBy: otherTeacherId })));
    await assertFails(testEnv.authenticatedContext(teacherId).database()
      .ref(`course_requests/${requestId}`).update(decision(now, { studentId: 'another-student' })));
  });

  it('allows a student to create and cancel only their pending request', async () => {
    const student = testEnv.authenticatedContext(studentId).database();
    const fresh = {
      id: 'student-created-request', studentId, courseId, teacherId,
      type: 'unenroll', status: 'pending', requestedAt: Date.now(), expiresAt: Date.now() + 86_400_000,
    };
    await assertSucceeds(student.ref(`course_requests/${fresh.id}`).set(fresh));
    await assertSucceeds(student.ref(`course_requests/${fresh.id}`).remove());
  });
});
