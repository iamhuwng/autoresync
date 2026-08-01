import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;
const rules = JSON.stringify({
  rules: {
    public_ticket89_probe: { '.read': true, '.write': true },
    book_activity_evaluations: { '.read': false, '.write': false },
  },
});
let testEnv: RulesTestEnvironment;

describe('Ticket #89 Book Activity evaluation browser-write denial', () => {
  if (!hasDatabaseEmulator) {
    it('requires the RTDB emulator when selected', () => {
      throw new Error(
        'FIREBASE_DATABASE_EMULATOR_HOST is required; run through Firebase emulators:exec.',
      );
    });
  }

  describeEmulator('canonical evaluation boundary', () => {
    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-prd-0062-ticket-89',
        database: { rules },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref(
          'book_activity_evaluations/scopes/student-1/homework-1/placement-1/activity-1/attempt-1',
        ).set({
          current: { revision: 1 },
          history: { r000001: { revision: 1 } },
          corrections: { r000001: { revision: 1, facts: [] } },
          aggregateScores: { r000001: { revision: 1, earnedScore: 1, maximumScore: 1 } },
        });
      });
    });

    it('denies teacher, cross-teacher, super-admin, overwrite, delete, and forged aggregate writes', async () => {
      const teacher = testEnv.authenticatedContext('teacher-1', { role: 'teacher' }).database();
      const other = testEnv.authenticatedContext('teacher-2', { role: 'teacher' }).database();
      const admin = testEnv.authenticatedContext('admin-1', { role: 'super_admin' }).database();
      const root = 'book_activity_evaluations/scopes/student-1/homework-1/placement-1/activity-1/attempt-1';
      await assertFails(teacher.ref(`${root}/current`).update({ revision: 2 }));
      await assertFails(other.ref(`${root}/history/r000002`).set({ revision: 2 }));
      await assertFails(teacher.ref(`${root}/corrections/r000002`).set({ revision: 2, facts: [] }));
      await assertFails(admin.ref(`${root}/history/r000001`).remove());
      await assertFails(teacher.ref(`${root}/aggregateScores/r000002`).set({
        revision: 2,
        earnedScore: 100,
        maximumScore: 100,
      }));
    });

    it('denies ancestor-shaped and multi-location writes atomically', async () => {
      const teacher = testEnv.authenticatedContext('teacher-1', { role: 'teacher' }).database();
      await assertSucceeds(teacher.ref('public_ticket89_probe/value').set('before'));
      await assertFails(teacher.ref().update({
        'public_ticket89_probe/value': 'after',
        'book_activity_evaluations/scopes/student-1/homework-1/placement-1/activity-1/attempt-1/current/revision': 2,
      }));
      expect((await teacher.ref('public_ticket89_probe/value').once('value')).val()).toBe('before');
      await assertFails(teacher.ref('book_activity_evaluations').set({
        forged: { aggregateScores: { score: 100 } },
      }));
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
