import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const teacherId = 'session-teacher';
const classId = 'session-class';
const code = 'SESSION1';
const eventId = 'session-opened-event';
const eventFor = (recipientIds: string[]) => ({
  eventId, kind: 'session-opened', sessionCode: code, actorUid: teacherId,
  classId, className: 'Class', testName: 'Test', testId: null, occurredAt: 1000,
  recipientCount: recipientIds.length,
  recipients: Object.fromEntries(recipientIds.map((id) => [id, true])),
});
const patchFor = (event: ReturnType<typeof eventFor>, queueRecipients = event.recipients) => ({
  [`game_sessions/${code}`]: {
    sessionCode: code, createdByUserId: teacherId, createdBy: teacherId, teacherId,
    linkedClassId: classId, createdAt: 1000, expiresAt: 9999999999999, status: 'waiting',
    mode: 'test', notificationEvents: { [eventId]: event },
  },
  [`session_notification_intents/${eventId}`]: {
    eventId, sessionCode: code, classId, actorUid: teacherId, occurredAt: 1000, dueAt: 1000,
    recipientCount: Object.keys(queueRecipients).length,
    event: { ...event, recipientCount: Object.keys(queueRecipients).length, recipients: queueRecipients },
    attempts: 1, initialCursor: 0, retryCursor: 0, state: 'initial_due',
  },
});

let testEnv: RulesTestEnvironment;

describeEmulator('session notification intent RTDB rules', () => {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-session-notification-intents', database: { rules: DATABASE_RULES },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({
        users: { [teacherId]: { role: 'teacher' } },
        classes: { [classId]: { createdBy: teacherId, name: 'Class', students: { 'student-1': true, 'student-2': true } } },
      });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it('commits the lifecycle event and exact saved roster atomically', async () => {
    const browser = testEnv.authenticatedContext(teacherId).database();
    const event = eventFor(['student-1', 'student-2']);
    await assertSucceeds(browser.ref().update(patchFor(event)));
  });

  it('rejects omitted or invented recipients', async () => {
    const browser = testEnv.authenticatedContext(teacherId).database();
    await assertFails(browser.ref().update(patchFor(eventFor(['student-1']))));
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({
        users: { [teacherId]: { role: 'teacher' } },
        classes: { [classId]: { createdBy: teacherId, name: 'Class', students: { 'student-1': true, 'student-2': true } } },
      });
    });
    await assertFails(browser.ref().update(patchFor(eventFor(['student-1', 'outsider']))));
  });

  it('records an explicit empty roster', async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({
        users: { [teacherId]: { role: 'teacher' } },
        classes: { [classId]: { createdBy: teacherId, name: 'Class', students: {} } },
      });
    });
    const browser = testEnv.authenticatedContext(teacherId).database();
    await assertSucceeds(browser.ref().update(patchFor(eventFor([]))));
    let count = -1;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const queue = await context.database().ref(`session_notification_intents/${eventId}/recipientCount`).get();
      count = queue.val();
    });
    expect(count).toBe(0);
  });
});
