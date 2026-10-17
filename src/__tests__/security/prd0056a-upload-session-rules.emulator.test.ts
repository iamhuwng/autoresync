import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;
const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
let testEnv: RulesTestEnvironment;

const sessionRecord = {
  schemaVersion: 1,
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  purpose: 'listening-authoring',
  status: 'active',
  creationRequestIdHash: 'a'.repeat(64),
  createdAt: 1_700_000_000_000,
  createdBy: 'teacher-1',
  expiresAt: 1_700_000_600_000,
  maxEligibilityExpiresAt: 1_700_028_800_000,
  bridgeVersion: '0056A-v1',
  assetIds: {},
  assetRequests: {},
};

describe('PRD-0056A upload-session RTDB rules', () => {
  it('defines owner-level indexes and browser write denial', () => {
    const rules = JSON.parse(DATABASE_RULES) as { rules: Record<string, unknown> };
    const root = rules.rules.media_asset_upload_sessions as Record<string, unknown> | undefined;
    expect(root).toBeDefined();
    expect(root?.$ownerId).toEqual(expect.objectContaining({
      '.write': false,
      '.indexOn': expect.arrayContaining(['creationRequestIdHash', 'status', 'expiresAt', 'maxEligibilityExpiresAt']),
    }));
  });

  describeEmulator('emulator enforcement', () => {
    beforeEach(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-prd-0056a-upload-sessions',
        database: { rules: DATABASE_RULES },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('users/teacher-1/role').set('teacher');
        await db.ref('users/teacher-2/role').set('teacher');
        await db.ref('users/admin-1/role').set('super_admin');
        await db.ref('media_asset_upload_sessions/teacher-1/session-1').set(sessionRecord);
      });
    });

    it('allows only owner and explicit super-admin reads; denies every browser write', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();
      const guest = testEnv.unauthenticatedContext().database();
      const ownerRef = owner.ref('media_asset_upload_sessions/teacher-1/session-1');

      await assertSucceeds(ownerRef.once('value'));
      await assertSucceeds(admin.ref('media_asset_upload_sessions/teacher-1/session-1').once('value'));
      await assertFails(otherTeacher.ref('media_asset_upload_sessions/teacher-1/session-1').once('value'));
      await assertFails(guest.ref('media_asset_upload_sessions/teacher-1/session-1').once('value'));
      await assertFails(ownerRef.update({ status: 'completed' }));
      await assertFails(owner.ref('media_asset_upload_sessions/teacher-1/session-2').set(sessionRecord));
      await assertFails(admin.ref('media_asset_upload_sessions/teacher-1/session-1').remove());
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
