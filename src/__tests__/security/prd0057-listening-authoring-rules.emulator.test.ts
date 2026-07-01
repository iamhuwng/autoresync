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

const document = {
  title: 'Listening draft',
  type: 'IELTS',
  skill: 'Listening',
  duration: 1200,
  displayMode: 'text',
  metadata: {},
  audioSections: [],
  questions: [],
  settings: {},
};

const draftRecord = {
  schemaVersion: 1,
  recordType: 'draft',
  draftId: 'draft-1',
  testId: 'test-1',
  ownerId: 'teacher-1',
  state: 'active',
  conflictToken: 1,
  document,
  assetIds: {},
  createdAt: 1_700_000_000_000,
  createdBy: 'teacher-1',
  updatedAt: 1_700_000_000_000,
  updatedBy: 'teacher-1',
  lastOperationId: 'operation-1',
};

const revisionDraftRecord = {
  ...draftRecord,
  recordType: 'revision-draft',
  draftId: 'revision-1',
  createdFromVersionId: 'version-1',
  createdFromVersionNumber: 1,
};

const versionRecord = {
  schemaVersion: 1,
  recordType: 'published-version',
  versionId: 'version-1',
  versionNumber: 1,
  testId: 'test-1',
  ownerId: 'teacher-1',
  sourceDraftPath: 'drafts',
  sourceDraftId: 'draft-1',
  document,
  assetIds: {},
  publishedAt: 1_700_000_000_000,
  publishedBy: 'teacher-1',
  publishOperationId: 'operation-publish',
  documentHash: 'hash-1',
  archive: { state: 'active' },
  compatibility: { frozenLegacyVersion1: false },
};

const operationRecord = {
  schemaVersion: 1,
  operationId: 'operation-1',
  ownerId: 'teacher-1',
  operationType: 'save-draft',
  targetType: 'draft',
  targetId: 'draft-1',
  idempotencyKeyHash: 'hash-idempotency',
  requestHash: 'hash-request',
  expectedConflictToken: 0,
  status: 'succeeded',
  result: { draftId: 'draft-1', conflictToken: 1 },
  createdAt: 1_700_000_000_000,
  completedAt: 1_700_000_000_000,
  expiresAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000,
};

const legacyTestRecord = {
  id: 'legacy-listening-1',
  ownerId: 'teacher-1',
  createdBy: 'teacher-1',
  isPublic: false,
  title: 'Frozen legacy Listening test',
  testType: 'Listening',
};

const frozenLegacyTestRecord = {
  ...legacyTestRecord,
  id: 'frozen-legacy-listening-1',
  authoringVersioning: {
    frozen: true,
    versionId: 'version-1',
    versionNumber: 1,
    frozenAt: 1_700_000_000_000,
    frozenBy: 'teacher-1',
    decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20',
  },
};

describe('PRD-0057 listening-authoring RTDB rules', () => {
  it('defines approved indexes and root write freeze for canonical authoring paths', () => {
    const rules = JSON.parse(DATABASE_RULES) as { rules: Record<string, any> };
    const root = rules.rules.listening_authoring as Record<string, any> | undefined;
    const legacyTestWrite = rules.rules.tests?.$testId?.['.write'] as string | undefined;

    expect(root).toBeDefined();
    expect(rules.rules['.write']).toContain(
      "newData.child('listening_authoring').val() === data.child('listening_authoring').val()",
    );
    expect(legacyTestWrite).toContain(
      "data.child('authoringVersioning').child('frozen').val() !== true",
    );
    expect(legacyTestWrite).toContain(
      "newData.child('authoringVersioning').child('frozen').val() !== true",
    );
    expect(legacyTestWrite).not.toContain(
      "!data.child('authoringVersioning').child('frozen').val()",
    );
    expect(legacyTestWrite).not.toContain(
      "!newData.child('authoringVersioning').child('frozen').val()",
    );
    expect(root?.drafts?.['.indexOn']).toEqual(['ownerId', 'testId', 'state', 'updatedAt']);
    expect(root?.revision_drafts?.['.indexOn']).toEqual([
      'ownerId',
      'testId',
      'createdFromVersionId',
      'state',
      'updatedAt',
    ]);
    expect(root?.versions?.['.indexOn']).toEqual([
      'ownerId',
      'testId',
      'versionNumber',
      'publishedAt',
      'archive/state',
    ]);
    expect(root?.operations?.['.indexOn']).toEqual([
      'ownerId',
      'operationType',
      'targetId',
      'idempotencyKeyHash',
      'status',
      'createdAt',
      'expiresAt',
    ]);
    expect(root?.drafts?.['.write']).toBe(false);
    expect(root?.revision_drafts?.['.write']).toBe(false);
    expect(root?.versions?.['.write']).toBe(false);
    expect(root?.operations?.['.write']).toBe(false);
  });

  describeEmulator('emulator enforcement', () => {
    beforeEach(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-prd-0057-listening-authoring',
        database: { rules: DATABASE_RULES },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('users/teacher-1/role').set('teacher');
        await db.ref('users/teacher-2/role').set('teacher');
        await db.ref('users/admin-1/role').set('super_admin');
        await db.ref('listening_authoring/drafts/draft-1').set(draftRecord);
        await db.ref('listening_authoring/revision_drafts/revision-1').set(revisionDraftRecord);
        await db.ref('listening_authoring/versions/version-1').set(versionRecord);
        await db.ref('listening_authoring/operations/operation-1').set(operationRecord);
        await db.ref('tests/legacy-listening-1').set(legacyTestRecord);
        await db.ref('tests/frozen-legacy-listening-1').set(frozenLegacyTestRecord);
      });
    });

    it('allows owner and super-admin reads while denying cross-owner and unauthenticated reads', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();
      const guest = testEnv.unauthenticatedContext().database();

      await assertSucceeds(owner.ref('listening_authoring/drafts/draft-1').once('value'));
      await assertSucceeds(owner.ref('listening_authoring/revision_drafts/revision-1').once('value'));
      await assertSucceeds(owner.ref('listening_authoring/versions/version-1').once('value'));
      await assertSucceeds(owner.ref('listening_authoring/operations/operation-1').once('value'));
      await assertSucceeds(admin.ref('listening_authoring/drafts/draft-1').once('value'));
      await assertFails(otherTeacher.ref('listening_authoring/drafts/draft-1').once('value'));
      await assertFails(otherTeacher.ref('listening_authoring/versions/version-1').once('value'));
      await assertFails(guest.ref('listening_authoring/drafts/draft-1').once('value'));
    });

    it('allows only owner-scoped list queries and denies unbounded browser reads', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();

      await assertSucceeds(
        owner.ref('listening_authoring/drafts').orderByChild('ownerId').equalTo('teacher-1').once('value'),
      );
      await assertSucceeds(
        owner.ref('listening_authoring/versions').orderByChild('ownerId').equalTo('teacher-1').once('value'),
      );
      await assertSucceeds(admin.ref('listening_authoring/drafts').once('value'));
      await assertFails(owner.ref('listening_authoring/drafts').once('value'));
      await assertFails(
        owner.ref('listening_authoring/drafts').orderByChild('ownerId').equalTo('teacher-2').once('value'),
      );
      await assertFails(
        otherTeacher.ref('listening_authoring/drafts').orderByChild('ownerId').equalTo('teacher-1').once('value'),
      );
    });

    it('denies every browser create, update, and delete on canonical authoring paths', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const admin = testEnv.authenticatedContext('admin-1').database();

      await assertFails(owner.ref('listening_authoring/drafts/draft-2').set({
        ...draftRecord,
        draftId: 'draft-2',
      }));
      await assertFails(owner.ref('listening_authoring/drafts/draft-1').update({ conflictToken: 2 }));
      await assertFails(owner.ref('listening_authoring/drafts/draft-1').remove());
      await assertFails(admin.ref('listening_authoring/versions/version-2').set({
        ...versionRecord,
        versionId: 'version-2',
      }));
      await assertFails(admin.ref('listening_authoring/versions/version-1/archive').update({
        state: 'archived',
      }));
      await assertFails(admin.ref('listening_authoring/operations/operation-1').remove());
    });

    it('denies browser writes and deletes against frozen legacy Listening rows', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const admin = testEnv.authenticatedContext('admin-1').database();

      await assertSucceeds(owner.ref('tests/legacy-listening-1').update({
        title: 'Allowed non-frozen edit',
      }));
      await assertFails(owner.ref('tests/legacy-listening-1/authoringVersioning').set(
        frozenLegacyTestRecord.authoringVersioning,
      ));
      await assertFails(owner.ref('tests/frozen-legacy-listening-1').update({
        title: 'Blocked stale edit',
      }));
      await assertFails(owner.ref('tests/frozen-legacy-listening-1/authoringVersioning/frozen').set(false));
      await assertFails(owner.ref('tests/frozen-legacy-listening-1').remove());
      await assertFails(admin.ref('tests/frozen-legacy-listening-1').update({
        title: 'Blocked admin browser edit',
      }));
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
