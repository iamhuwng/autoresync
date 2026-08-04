import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;
const capacityRules = JSON.stringify({
  rules: {
    public_ticket04_harness: {
      '.read': true,
      '.write': true,
    },
    book_source_upload_accounts: {
      '.read': false,
      '.write': false,
    },
  },
});
let testEnv: RulesTestEnvironment;

describe('Ticket 04 Book source-capacity RTDB rule fragment emulator behavior', () => {
  if (!hasDatabaseEmulator) {
    it('requires the RTDB emulator when this test is selected', () => {
      throw new Error(
        'FIREBASE_DATABASE_EMULATOR_HOST is required; run this test through Firebase emulators:exec.',
      );
    });
  }

  describeEmulator('deny-only canonical capacity boundary', () => {
    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-prd-0062-ticket-04',
        database: { rules: capacityRules },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('book_source_upload_accounts/account-1').set({
          revision: 7,
          capacity: {
            trackedAccountBytes: 100,
            temporaryBytes: 0,
          },
          operations: {},
        });
      });
    });

    it('denies direct, cross-owner, stale, and ancestor-shaped browser writes', async () => {
      const teacher = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1', {
        role: 'super_admin',
      }).database();

      await assertFails(teacher.ref(
        'book_source_upload_accounts/account-1/operations/reservation-1',
      ).set({ ownerId: 'teacher-1' }));
      await assertFails(otherTeacher.ref(
        'book_source_upload_accounts/account-1/operations/reservation-2',
      ).set({ ownerId: 'teacher-2' }));
      await assertFails(admin.ref('book_source_upload_accounts/account-1').update({
        revision: 6,
      }));
      await assertFails(admin.ref('book_source_upload_accounts').set({
        'account-1': {
          revision: 0,
          capacity: {
            trackedAccountBytes: 0,
            temporaryBytes: 0,
          },
          operations: {},
        },
      }));
    });

    it('denies multi-location ancestor writes atomically and all browser reads', async () => {
      const teacher = testEnv.authenticatedContext('teacher-1').database();
      const unauthenticated = testEnv.unauthenticatedContext().database();

      await assertSucceeds(teacher.ref('public_ticket04_harness/probe').set(
        'before',
      ));
      await assertFails(teacher.ref().update({
        'public_ticket04_harness/probe': 'after',
        'book_source_upload_accounts/account-1/revision': 8,
      }));
      await expect(
        teacher.ref('public_ticket04_harness/probe').once('value'),
      ).resolves.toMatchObject({ key: 'probe' });
      expect((
        await teacher.ref('public_ticket04_harness/probe').once('value')
      ).val()).toBe('before');
      await assertFails(teacher.ref(
        'book_source_upload_accounts/account-1',
      ).once('value'));
      await assertFails(unauthenticated.ref(
        'book_source_upload_accounts/account-1',
      ).once('value'));
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
