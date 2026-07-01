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

const assetRecord = {
  assetId: 'asset-1',
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  state: 'temp',
  tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: 12_345,
  checksum: 'sha256:asset-1',
  checksumAlgorithm: 'sha256',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  createdBy: 'teacher-1',
  lastReferencedAt: 1_700_000_000_000,
  references: {
    drafts: {
      'draft-1': true,
    },
  },
};

const metricEvent = {
  schemaVersion: 1,
  metricEventId: 'metric-1',
  createdAt: 1_700_000_000_000,
  ownerScope: 'teacher-1',
  assetId: 'asset-1',
  operation: 'commit-failure',
  outcome: 'threshold-exceeded',
  reasonCode: 'durable_verification_failed',
  stateBefore: 'committing',
  stateAfter: 'committing',
  sizeBytes: 12_345,
  durationMs: 1200,
  attemptCount: 2,
  runId: 'task-4.15-rules',
  budgetName: 'commit-failure-count',
  budgetValue: 0,
  thresholdName: 'commit-failure-count',
  thresholdValue: 0,
  stopAction: 'disable new registry writes',
};

const uploadSession = {
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  purpose: 'listening-authoring',
  status: 'active',
  createdAt: 1_700_000_000_000,
  expiresAt: 1_700_000_900_000,
  maxEligibilityExpiresAt: 1_700_028_800_000,
  lastHeartbeatAt: 1_700_000_060_000,
  bridgeVersion: '0056A-v1',
};

const assetEvent = {
  schemaVersion: 1,
  eventId: 'event-1',
  ownerId: 'teacher-1',
  actorUserId: 'service-account',
  assetId: 'asset-1',
  operation: 'commit',
  outcome: 'failed-closed',
  reasonCode: 'reference_write_failed',
  createdAt: 1_700_000_000_000,
};

const assetSweep = {
  schemaVersion: 1,
  sweepId: 'sweep-1',
  status: 'planned',
  createdAt: 1_700_000_000_000,
  approvedAt: 1_700_000_060_000,
};

describe('PRD-0058 media-asset RTDB rules', () => {
  it('defines approved media asset indexes and root write freeze for all registry nodes', () => {
    const rules = JSON.parse(DATABASE_RULES) as { rules: Record<string, unknown> };
    const sessionsRoot = rules.rules.media_asset_upload_sessions as Record<string, unknown> | undefined;
    const assetsRoot = rules.rules.media_assets as Record<string, unknown> | undefined;
    const eventsRoot = rules.rules.media_asset_events as Record<string, unknown> | undefined;
    const metricsRoot = rules.rules.media_asset_metrics as Record<string, unknown> | undefined;
    const sweepsRoot = rules.rules.media_asset_sweeps as Record<string, unknown> | undefined;

    expect(sessionsRoot).toBeDefined();
    expect((sessionsRoot?.$ownerId as Record<string, unknown>)?.['.indexOn']).toEqual([
      'creationRequestIdHash',
      'status',
      'expiresAt',
      'maxEligibilityExpiresAt',
      'lastHeartbeatAt',
    ]);
    expect(assetsRoot).toBeDefined();
    expect(assetsRoot?.['.indexOn']).toEqual([
      'ownerId',
      'state',
      'uploadSessionId',
      'createdAt',
      'committedAt',
      'pendingDeleteAt',
      'deleteAfter',
      'tombstoneExpiresAt',
      'lastReferencedAt',
    ]);
    expect(eventsRoot).toBeDefined();
    expect(eventsRoot?.['.indexOn']).toEqual([
      'createdAt',
      'actorUserId',
      'assetId',
      'operation',
      'outcome',
      'reasonCode',
    ]);
    expect(metricsRoot).toBeDefined();
    expect(metricsRoot?.['.indexOn']).toEqual([
      'createdAt',
      'operation',
      'outcome',
      'reasonCode',
      'runId',
      'stopAction',
    ]);
    expect(sweepsRoot).toBeDefined();
    expect(sweepsRoot?.['.indexOn']).toEqual([
      'status',
      'createdAt',
      'approvedAt',
    ]);
    expect(rules.rules['.write']).toContain("newData.child('media_asset_upload_sessions').val() === data.child('media_asset_upload_sessions').val()");
    expect(rules.rules['.write']).toContain("newData.child('media_assets').val() === data.child('media_assets').val()");
    expect(rules.rules['.write']).toContain("newData.child('media_asset_events').val() === data.child('media_asset_events').val()");
    expect(rules.rules['.write']).toContain("newData.child('media_asset_metrics').val() === data.child('media_asset_metrics').val()");
    expect(rules.rules['.write']).toContain("newData.child('media_asset_sweeps').val() === data.child('media_asset_sweeps').val()");
  });

  describeEmulator('emulator enforcement', () => {
    beforeEach(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-prd-0058-media-assets',
        database: { rules: DATABASE_RULES },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('users/teacher-1/role').set('teacher');
        await db.ref('users/teacher-2/role').set('teacher');
        await db.ref('users/admin-1/role').set('super_admin');
        await db.ref('media_asset_upload_sessions/teacher-1/session-1').set(uploadSession);
        await db.ref('media_assets/asset-1').set(assetRecord);
        await db.ref('media_asset_events/event-1').set(assetEvent);
        await db.ref('media_asset_metrics/metric-1').set(metricEvent);
        await db.ref('media_asset_sweeps/sweep-1').set(assetSweep);
      });
    });

    it('allows only the owner and super-admin to read a concrete asset record', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();
      const guest = testEnv.unauthenticatedContext().database();

      await assertSucceeds(owner.ref('media_assets/asset-1').once('value'));
      await assertSucceeds(admin.ref('media_assets/asset-1').once('value'));
      await assertFails(otherTeacher.ref('media_assets/asset-1').once('value'));
      await assertFails(guest.ref('media_assets/asset-1').once('value'));
      await assertFails(owner.ref('media_assets').once('value'));
    });

    it('denies browser creation, committed-state forging, pending-delete forging, and deletion', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();

      await assertFails(owner.ref('media_assets/asset-2').set({
        ...assetRecord,
        assetId: 'asset-2',
      }));
      await assertFails(owner.ref('media_assets/asset-1').update({
        state: 'committed',
        committedAt: 1_700_000_010_000,
      }));
      await assertFails(owner.ref('media_assets/asset-1').update({
        state: 'pending-delete',
        pendingDeleteAt: 1_700_000_020_000,
      }));
      await assertFails(owner.ref('media_assets/asset-1').remove());
      await assertFails(otherTeacher.ref('media_assets/asset-1').update({
        checksum: 'sha256:forged',
      }));
      await assertFails(admin.ref('media_assets/asset-1').remove());
    });

    it('keeps trusted-service mutation separate from teacher browser authority', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('media_assets/asset-1').update({
          state: 'committed',
          committedAt: 1_700_000_030_000,
        });
      });

      const owner = testEnv.authenticatedContext('teacher-1').database();

      await assertSucceeds(owner.ref('media_assets/asset-1').once('value'));
      await assertFails(owner.ref('media_assets/asset-1').update({
        state: 'pending-delete',
        pendingDeleteAt: 1_700_000_040_000,
      }));
    });

    it('allows only super-admin reads and no browser writes for metric events', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();
      const guest = testEnv.unauthenticatedContext().database();

      await assertSucceeds(admin.ref('media_asset_metrics/metric-1').once('value'));
      await assertFails(owner.ref('media_asset_metrics/metric-1').once('value'));
      await assertFails(otherTeacher.ref('media_asset_metrics/metric-1').once('value'));
      await assertFails(guest.ref('media_asset_metrics/metric-1').once('value'));
      await assertSucceeds(admin.ref('media_asset_metrics').once('value'));
      await assertFails(owner.ref('media_asset_metrics/metric-2').set({
        ...metricEvent,
        metricEventId: 'metric-2',
      }));
      await assertFails(admin.ref('media_asset_metrics/metric-1').update({
        outcome: 'ignored',
      }));
      await assertFails(admin.ref('media_asset_metrics/metric-1').remove());
    });

    it('allows matching owner reads but no browser writes for upload sessions and asset events', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();
      const guest = testEnv.unauthenticatedContext().database();

      await assertSucceeds(owner.ref('media_asset_upload_sessions/teacher-1/session-1').once('value'));
      await assertSucceeds(admin.ref('media_asset_upload_sessions/teacher-1/session-1').once('value'));
      await assertFails(otherTeacher.ref('media_asset_upload_sessions/teacher-1/session-1').once('value'));
      await assertFails(guest.ref('media_asset_upload_sessions/teacher-1/session-1').once('value'));
      await assertFails(owner.ref('media_asset_upload_sessions/teacher-1/session-2').set({
        ...uploadSession,
        uploadSessionId: 'session-2',
      }));

      await assertSucceeds(owner.ref('media_asset_events/event-1').once('value'));
      await assertSucceeds(admin.ref('media_asset_events/event-1').once('value'));
      await assertFails(otherTeacher.ref('media_asset_events/event-1').once('value'));
      await assertFails(guest.ref('media_asset_events/event-1').once('value'));
      await assertFails(owner.ref('media_asset_events/event-2').set({
        ...assetEvent,
        eventId: 'event-2',
      }));
      await assertFails(admin.ref('media_asset_events/event-1').update({
        outcome: 'forged',
      }));
      await assertFails(admin.ref('media_asset_events/event-1').remove());
    });

    it('allows only super-admin reads and no browser writes for reconciliation sweeps', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const admin = testEnv.authenticatedContext('admin-1').database();
      const guest = testEnv.unauthenticatedContext().database();

      await assertSucceeds(admin.ref('media_asset_sweeps/sweep-1').once('value'));
      await assertSucceeds(admin.ref('media_asset_sweeps').once('value'));
      await assertFails(owner.ref('media_asset_sweeps/sweep-1').once('value'));
      await assertFails(guest.ref('media_asset_sweeps/sweep-1').once('value'));
      await assertFails(owner.ref('media_asset_sweeps/sweep-2').set({
        ...assetSweep,
        sweepId: 'sweep-2',
      }));
      await assertFails(admin.ref('media_asset_sweeps/sweep-1').update({
        status: 'running',
      }));
      await assertFails(admin.ref('media_asset_sweeps/sweep-1').remove());
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
