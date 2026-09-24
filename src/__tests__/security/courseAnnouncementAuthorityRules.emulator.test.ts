import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const teacherId = 'announcement-teacher';
const studentId = 'announcement-student';
const announcementId = 'announcement-event';
let testEnv: RulesTestEnvironment;

describeEmulator('course announcement authority RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-course-announcement-authority',
      database: { rules: DATABASE_RULES },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({
        users: { [teacherId]: { role: 'teacher' }, [studentId]: { role: 'student' } },
        course_announcements: {
          [announcementId]: {
            id: announcementId, courseId: 'course-1', courseName: 'English', teacherId,
            teacherName: 'Teacher', targetClassIds: [], title: 'Exam update', content: 'Saved body',
            createdAt: 100, sentToStudentIds: [studentId],
            notificationIntent: {
              schemaVersion: 1, eventId: announcementId, kind: 'course-announcement-created',
              courseId: 'course-1', actorUid: teacherId, occurredAt: 100, dueAt: 100,
              attempts: 1, state: 'done',
            },
          },
        },
      });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('keeps saved announcements readable while denying browser create and recipient-list edits', async () => {
    const teacher = testEnv.authenticatedContext(teacherId).database();
    await assertSucceeds(teacher.ref(`course_announcements/${announcementId}`).get());
    await assertFails(teacher.ref('course_announcements/forged').set({
      id: 'forged', courseId: 'course-1', teacherId, sentToStudentIds: ['other-student'],
    }));
    await assertFails(teacher.ref(`course_announcements/${announcementId}/sentToStudentIds`).set(['other-student']));
    await assertFails(teacher.ref(`course_announcements/${announcementId}/notificationIntent`).set({ state: 'done' }));
  });
});
