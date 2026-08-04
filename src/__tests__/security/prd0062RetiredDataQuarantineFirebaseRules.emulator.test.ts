import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const rulesText = readFileSync('database.rules.json', 'utf8');
const databaseRules = JSON.parse(rulesText) as {
  rules: Record<string, unknown>;
};
const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;
const retiredExpansionRoots = [
  'book_activity',
  'book_source',
  'book_assembly',
  'book_delivery',
  'book_runtime',
] as const;
let testEnv: RulesTestEnvironment;

describe('retired PRD0062 data quarantine', () => {
  it('defines no feature authority and freezes every retired expansion root', () => {
    for (const root of retiredExpansionRoots) {
      expect(databaseRules.rules).not.toHaveProperty(root);
      expect(rulesText).toContain(
        `newData.child('${root}').val() === data.child('${root}').val()`,
      );
    }
    expect(databaseRules.rules).toHaveProperty('material_catalog');
    expect(databaseRules.rules).toHaveProperty('listening_authoring');
  });

  if (!hasDatabaseEmulator) {
    it('requires the RTDB emulator when this quarantine test is selected', () => {
      throw new Error(
        'FIREBASE_DATABASE_EMULATOR_HOST is required; use npm run test:prd0062-retirement',
      );
    });
  }

  describeEmulator('emulator enforcement', () => {
    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-prd-0062-forward-baseline',
        database: { rules: rulesText },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('users/admin-1/role').set('super_admin');
        await db.ref('users/teacher-1/role').set('teacher');
        for (const root of retiredExpansionRoots) {
          await db.ref(`${root}/historical-1`).set({
            ownerId: 'teacher-1',
            title: `Retired historical ${root} data`,
          });
        }
      });
    });

    it('allows forensic admin reads but denies every browser mutation shape for every retired root', async () => {
      const admin = testEnv.authenticatedContext('admin-1').database();
      const teacher = testEnv.authenticatedContext('teacher-1').database();
      const unauthenticated = testEnv.unauthenticatedContext().database();

      for (const root of retiredExpansionRoots) {
        const historicalPath = `${root}/historical-1`;

        await assertSucceeds(admin.ref(historicalPath).once('value'));
        await assertFails(teacher.ref(historicalPath).once('value'));
        await assertFails(unauthenticated.ref(historicalPath).once('value'));
        await assertFails(admin.ref(historicalPath).set({
          ownerId: 'admin-1',
          title: 'overwritten historical expansion record',
        }));
        await assertFails(admin.ref(historicalPath).remove());
        await assertFails(admin.ref(historicalPath).update({ title: 'rewritten' }));
        await assertFails(admin.ref(root).remove());
        await assertFails(admin.ref(`${root}/historical-2`).set({
          ownerId: 'admin-1',
          title: 'recreated',
        }));
        await assertFails(admin.ref().update({
          [`${root}/historical-1/title`]: 'root rewrite',
        }));
        await assertFails(admin.ref().update({ [root]: null }));
      }
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
