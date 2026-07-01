import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkerEnv } from '../types';
import { StatusTracker } from '../backup/status-tracker';
import { buildBackupManifest, buildMediaManifest } from '../utils/manifest';
import { createBackupZip, extractBackupZip } from '../utils/zip';
import { executeRestore } from './restore-execute';

vi.mock('../auth/google-oauth', () => ({
  TokenCache: class {
    async getToken() {
      return 'google-token';
    }
  },
}));

class FakeR2Client {
  readonly objects = new Map<string, Uint8Array>();

  async putObject(key: string, body: Uint8Array | string): Promise<void> {
    const bytes = typeof body === 'string'
      ? new TextEncoder().encode(body)
      : body;
    this.objects.set(key, bytes);
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key) ?? null;
  }

  async getObjectAsJson<T>(key: string): Promise<T | null> {
    const bytes = this.objects.get(key);
    return bytes ? JSON.parse(new TextDecoder().decode(bytes)) as T : null;
  }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('registry restore drill', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('restores media_assets before unknown nodes and preserves references plus checksum metadata', async () => {
    const backupRtdb = {
      z_misc: {
        'misc-1': {
          ok: true,
        },
      },
      media_assets: {
        'asset-1': {
          assetId: 'asset-1',
          ownerId: 'teacher-1',
          uploadSessionId: 'session-1',
          state: 'committed',
          tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
          contentType: 'audio/mpeg',
          sizeBytes: 12_345,
          checksum: 'sha256:asset-1',
          checksumAlgorithm: 'sha256',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_010_000,
          committedAt: 1_700_000_020_000,
          lastReferencedAt: 1_700_000_020_000,
          references: {
            drafts: {
              'draft-1': true,
            },
            tests: {
              'test-1': true,
            },
          },
        },
      },
      media_asset_upload_sessions: {
        'teacher-1': {
          'session-1': {
            ownerId: 'teacher-1',
            uploadSessionId: 'session-1',
            purpose: 'listening-authoring',
            status: 'active',
            createdAt: 1_700_000_000_000,
            expiresAt: 1_700_000_900_000,
            maxEligibilityExpiresAt: 1_700_028_800_000,
            lastHeartbeatAt: 1_700_000_060_000,
            bridgeVersion: '0056A-v1',
          },
        },
      },
      media_asset_events: {
        'event-1': {
          schemaVersion: 1,
          eventId: 'event-1',
          ownerId: 'teacher-1',
          actorUserId: 'service-account',
          assetId: 'asset-1',
          operation: 'commit',
          outcome: 'failed-closed',
          reasonCode: 'reference_write_failed',
          createdAt: 1_700_000_030_000,
        },
      },
      media_asset_metrics: {
        'metric-1': {
          schemaVersion: 1,
          metricEventId: 'metric-1',
          createdAt: 1_700_000_040_000,
          ownerScope: 'teacher-1',
          assetId: 'asset-1',
          operation: 'commit-failure',
          outcome: 'threshold-exceeded',
          reasonCode: 'reference_write_failed',
          stateBefore: 'committing',
          stateAfter: 'committing',
          sizeBytes: 12_345,
          durationMs: 1200,
          attemptCount: 1,
          runId: 'restore-drill',
          budgetName: 'commit-failure-count',
          budgetValue: 0,
          thresholdName: 'commit-failure-count',
          thresholdValue: 0,
          stopAction: 'disable new registry writes',
        },
      },
      media_asset_sweeps: {
        'sweep-1': {
          schemaVersion: 1,
          sweepId: 'sweep-1',
          status: 'planned',
          createdAt: 1_700_000_050_000,
          approvedAt: 1_700_000_060_000,
        },
      },
      listening_authoring: {
        drafts: {
          'draft-1': {
            draftId: 'draft-1',
            ownerId: 'teacher-1',
            conflictToken: 3,
          },
        },
        revision_drafts: {
          'revision-1': {
            draftId: 'revision-1',
            ownerId: 'teacher-1',
            createdFromVersionId: 'version-1',
          },
        },
        versions: {
          'version-1': {
            versionId: 'version-1',
            ownerId: 'teacher-1',
            versionNumber: 1,
            documentHash: 'hash-1',
          },
        },
        operations: {
          'operation-1': {
            operationId: 'operation-1',
            ownerId: 'teacher-1',
            idempotencyKeyHash: 'hash-idempotency',
            requestHash: 'hash-request',
            expiresAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000,
          },
        },
      },
      tests: {
        'legacy-test-1': {
          id: 'legacy-test-1',
          ownerId: 'teacher-1',
          authoringVersioning: {
            frozen: true,
            versionId: 'version-1',
            versionNumber: 1,
            frozenAt: 1_700_000_000_000,
            frozenBy: 'teacher-1',
            decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20',
          },
        },
      },
      users: {
        'teacher-1': {
          role: 'teacher',
        },
      },
    };
    const manifest = buildBackupManifest({
      backupId: 'BK-restore-drill',
      trigger: 'manual',
      createdAt: '2026-06-27T00:00:00.000Z',
      completedAt: '2026-06-27T00:01:00.000Z',
      durationMs: 60_000,
      status: 'complete',
      includesFirestore: false,
      firestoreSkipReason: null,
      firestoreCollectionsIncluded: [],
      firebaseProject: 'temp-a1437',
      rtdbBytesRead: JSON.stringify(backupRtdb).length,
      firestoreDocsRead: 0,
      entityCounts: {
        rtdb: {
          z_misc: 1,
          media_assets: 1,
          media_asset_upload_sessions: 1,
          media_asset_events: 1,
          media_asset_metrics: 1,
          media_asset_sweeps: 1,
          listening_authoring: 4,
          tests: 1,
          users: 1,
        },
        firestore: {},
      },
      totalSizeBytes: 0,
      checksums: {},
      previousBackupId: null,
    });
    const mediaManifest = buildMediaManifest([], manifest.backupId);
    const { zipData } = await createBackupZip({
      rtdb: backupRtdb,
      firestore: null,
      manifest,
      mediaManifest,
    });

    const r2 = new FakeR2Client();
    await r2.putObject('backups/BK-restore-drill.zip', zipData);

    const liveRtdb = new Map<string, unknown>([
      ['users', {
        'teacher-live': {
          role: 'teacher',
        },
      }],
      ['media_assets', {}],
      ['media_asset_upload_sessions', {}],
      ['media_asset_events', {}],
      ['media_asset_metrics', {}],
      ['media_asset_sweeps', {}],
      ['listening_authoring', {
        live_only: {
          'live-record': {
            ownerId: 'teacher-live',
            retainedForRollback: true,
          },
        },
      }],
      ['tests', {
        'legacy-live': {
          id: 'legacy-live',
          ownerId: 'teacher-live',
          authoringVersioning: {
            frozen: true,
            versionId: 'version-live',
            versionNumber: 1,
          },
        },
      }],
      ['z_misc', {}],
      ['system_flags', null],
    ]);
    const patchOrder: string[] = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '');

      if (path === 'system_flags/restore_in_progress' && method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? 'null'));
        liveRtdb.set('system_flags', body);
        return json({ ok: true });
      }

      if (path === '' && method === 'GET' && url.searchParams.get('shallow') === 'true') {
        const shallow = Object.fromEntries(
          [...liveRtdb.entries()]
            .filter(([key, value]) => (
              key !== 'listening_authoring'
              && value
              && typeof value === 'object'
            ))
            .map(([key]) => [key, true]),
        );
        return json(shallow);
      }

      if (method === 'GET' && url.searchParams.get('shallow') === 'true') {
        const current = liveRtdb.get(path);
        if (!current || typeof current !== 'object') {
          return json(null);
        }
        return json(Object.fromEntries(Object.keys(current as Record<string, unknown>).map((key) => [key, true])));
      }

      if (method === 'GET') {
        return json(liveRtdb.get(path) ?? null);
      }

      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        const current = (liveRtdb.get(path) as Record<string, unknown> | undefined) ?? {};
        liveRtdb.set(path, {
          ...current,
          ...patch,
        });
        patchOrder.push(path);
        return json({ ok: true });
      }

      throw new Error(`Unexpected fetch ${method} ${url.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const tracker = new StatusTracker('restore');
    const result = await executeRestore({
      FIREBASE_PROJECT_ID: 'temp-a1437',
      FIREBASE_DB_URL: 'https://db.example.test',
      GOOGLE_SA_KEY: '{}',
    } as WorkerEnv, r2 as never, 'BK-restore-drill', {
      scope: ['all'],
      mode: 'smart_auto',
    }, tracker);

    expect(result.status).toBe('complete');
    expect(result.details.media_assets).toEqual({
      restored: 1,
      skipped: 0,
      failed: 0,
    });
    expect(result.details.media_asset_upload_sessions).toEqual({
      restored: 1,
      skipped: 0,
      failed: 0,
    });
    expect(result.details.media_asset_events).toEqual({
      restored: 1,
      skipped: 0,
      failed: 0,
    });
    expect(result.details.media_asset_metrics).toEqual({
      restored: 1,
      skipped: 0,
      failed: 0,
    });
    expect(result.details.media_asset_sweeps).toEqual({
      restored: 1,
      skipped: 0,
      failed: 0,
    });
    expect(result.details.listening_authoring).toEqual({
      restored: 4,
      skipped: 0,
      failed: 0,
    });
    expect(patchOrder).toEqual([
      'users',
      'media_asset_upload_sessions',
      'media_assets',
      'media_asset_events',
      'media_asset_metrics',
      'media_asset_sweeps',
      'listening_authoring',
      'tests',
      'z_misc',
    ]);
    expect(liveRtdb.get('media_asset_upload_sessions')).toMatchObject({
      'teacher-1': {
        'session-1': {
          lastHeartbeatAt: 1_700_000_060_000,
        },
      },
    });
    expect(liveRtdb.get('media_assets')).toMatchObject({
      'asset-1': {
        checksum: 'sha256:asset-1',
        checksumAlgorithm: 'sha256',
        references: {
          drafts: {
            'draft-1': true,
          },
          tests: {
            'test-1': true,
          },
        },
      },
    });
    expect(liveRtdb.get('media_asset_events')).toMatchObject({
      'event-1': {
        reasonCode: 'reference_write_failed',
      },
    });
    expect(liveRtdb.get('media_asset_metrics')).toMatchObject({
      'metric-1': {
        stopAction: 'disable new registry writes',
      },
    });
    expect(liveRtdb.get('media_asset_sweeps')).toMatchObject({
      'sweep-1': {
        status: 'planned',
      },
    });
    expect(liveRtdb.get('listening_authoring')).toMatchObject({
      drafts: {
        'draft-1': {
          conflictToken: 3,
        },
      },
      revision_drafts: {
        'revision-1': {
          createdFromVersionId: 'version-1',
        },
      },
      versions: {
        'version-1': {
          documentHash: 'hash-1',
        },
      },
      operations: {
        'operation-1': {
          idempotencyKeyHash: 'hash-idempotency',
        },
      },
    });
    expect(liveRtdb.get('tests')).toMatchObject({
      'legacy-test-1': {
        authoringVersioning: {
          frozen: true,
          versionId: 'version-1',
          versionNumber: 1,
          decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20',
        },
      },
    });

    const preRestoreEntry = [...r2.objects.entries()].find(([key]) => key.startsWith('pre-restore/'));
    expect(preRestoreEntry).toBeDefined();
    const snapshot = extractBackupZip(preRestoreEntry![1]);
    expect(snapshot.rtdb).toHaveProperty('media_assets');
    expect(snapshot.rtdb).toHaveProperty('media_asset_upload_sessions');
    expect(snapshot.rtdb).toHaveProperty('media_asset_events');
    expect(snapshot.rtdb).toHaveProperty('media_asset_metrics');
    expect(snapshot.rtdb).toHaveProperty('media_asset_sweeps');
    expect(snapshot.rtdb).toHaveProperty(
      'listening_authoring.live_only.live-record.retainedForRollback',
      true,
    );
    expect(snapshot.rtdb).toHaveProperty(
      'tests.legacy-live.authoringVersioning.versionId',
      'version-live',
    );
  });
});
