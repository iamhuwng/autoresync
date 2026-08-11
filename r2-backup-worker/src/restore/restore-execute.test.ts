import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkerEnv } from '../types';
import { StatusTracker } from '../backup/status-tracker';
import { buildBackupManifest, buildMediaManifest } from '../utils/manifest';
import { createBackupZip, extractBackupZip } from '../utils/zip';
import { executeRestore } from './restore-execute';
import {
  BOOK_METADATA_CANONICAL_ROOTS,
  createBookMetadataBackupInventory,
  buildBookMetadataRestorePreview,
} from './book-source-restore';

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

const makeBookInventory = (
  backupId = 'BK-book-metadata',
  presentPath?: string,
  data: Record<string, unknown> = {},
) => {
  const bookId = typeof data.bookId === 'string' ? data.bookId : null;
  return createBookMetadataBackupInventory({
    backupId,
    firebaseProject: 'project-120',
    generatedAt: '2026-08-11T00:00:00.000Z',
    roots: BOOK_METADATA_CANONICAL_ROOTS.map((path) => {
      if (path === presentPath) {
        return { path, present: true, data };
      }
      if (path === 'material_catalog/books' && bookId) {
        return {
          path,
          present: true,
          data: { [bookId]: data },
        };
      }
      return { path, present: false, data: {} };
    }),
  });
};

const putBookBackup = async (
  r2: FakeR2Client,
  backupId: string,
  inventory: ReturnType<typeof makeBookInventory>,
): Promise<void> => {
  const backupRtdb = { book_metadata_inventory: inventory };
  const manifest = buildBackupManifest({
    backupId,
    trigger: 'manual',
    createdAt: '2026-08-11T00:00:00.000Z',
    completedAt: '2026-08-11T00:01:00.000Z',
    durationMs: 60_000,
    status: 'complete',
    includesFirestore: false,
    firestoreSkipReason: null,
    firestoreCollectionsIncluded: [],
    firebaseProject: 'project-120',
    rtdbBytesRead: JSON.stringify(backupRtdb).length,
    firestoreDocsRead: 0,
    entityCounts: { rtdb: { book_metadata_inventory: inventory.rootCount }, firestore: {} },
    totalSizeBytes: 0,
    checksums: {},
    previousBackupId: null,
  });
  const { zipData } = await createBackupZip({
    rtdb: backupRtdb,
    firestore: null,
    manifest,
    mediaManifest: buildMediaManifest([], backupId),
  });
  await r2.putObject(`backups/${backupId}.zip`, zipData);
};

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

  it('restores book_activity RTDB data through the approved restore inventory', async () => {
    const backupRtdb = {
      users: {
        'teacher-1': { role: 'teacher' },
      },
      listening_authoring: {},
      book_activity: {
        materials: {
          'activity-1': {
            activityId: 'activity-1',
            ownerId: 'teacher-1',
          },
        },
        versions: {
          'activity-1': {
            'version-1': {
              versionId: 'version-1',
            },
          },
        },
      },
      z_misc: {
        'misc-1': { ok: true },
      },
    };
    const manifest = buildBackupManifest({
      backupId: 'BK-book-activity-restore',
      trigger: 'manual',
      createdAt: '2026-07-09T00:00:00.000Z',
      completedAt: '2026-07-09T00:01:00.000Z',
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
          users: 1,
          listening_authoring: 0,
          book_activity: 2,
          z_misc: 1,
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
    await r2.putObject('backups/BK-book-activity-restore.zip', zipData);

    const liveRtdb = new Map<string, unknown>([
      ['users', {}],
      ['listening_authoring', {}],
      ['book_activity', {}],
      ['z_misc', {}],
      ['system_flags', null],
    ]);
    const patchOrder: string[] = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '');

      if (path === 'system_flags/restore_in_progress' && method === 'PUT') {
        liveRtdb.set('system_flags', JSON.parse(String(init?.body ?? 'null')));
        return json({ ok: true });
      }

      if (path === '' && method === 'GET' && url.searchParams.get('shallow') === 'true') {
        return json(Object.fromEntries([...liveRtdb.keys()].filter((key) => key !== 'system_flags').map((key) => [key, true])));
      }

      if (method === 'GET' && url.searchParams.get('shallow') === 'true') {
        const current = liveRtdb.get(path);
        return json(current && typeof current === 'object'
          ? Object.fromEntries(Object.keys(current as Record<string, unknown>).map((key) => [key, true]))
          : null);
      }

      if (method === 'GET') {
        return json(liveRtdb.get(path) ?? null);
      }

      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        liveRtdb.set(path, {
          ...((liveRtdb.get(path) as Record<string, unknown> | undefined) ?? {}),
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
    } as WorkerEnv, r2 as never, 'BK-book-activity-restore', {
      scope: ['all'],
      mode: 'smart_auto',
    }, tracker);

    expect(result.status).toBe('complete');
    expect(result.details.book_activity).toEqual({
      restored: 2,
      skipped: 0,
      failed: 0,
    });
    expect(patchOrder).toEqual([
      'users',
      'book_activity',
      'z_misc',
    ]);
    expect(liveRtdb.get('book_activity')).toMatchObject({
      materials: {
        'activity-1': {
          ownerId: 'teacher-1',
        },
      },
    });
  });

  it('restores only canonical Book metadata with preview ETag fencing', async () => {
    const backupId = 'BK-book-metadata';
    const inventory = makeBookInventory(backupId, 'book_delivery/current', {
      bookId: 'book-1',
      ownerId: 'teacher-1',
      revision: 2,
    });
    const r2 = new FakeR2Client();
    await putBookBackup(r2, backupId, inventory);

    const liveRoots = new Map(BOOK_METADATA_CANONICAL_ROOTS.map((path) => [path, {} as unknown]));
    const etags = new Map(BOOK_METADATA_CANONICAL_ROOTS.map((path) => [path, `etag:${path}`]));
    const metadataPuts: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '');
      if (path === 'system_flags/restore_in_progress' && method === 'PUT') return json({ ok: true });
      if (method === 'GET' && path === '' && url.searchParams.get('shallow') === 'true') return json({});
      if (BOOK_METADATA_CANONICAL_ROOTS.includes(path as typeof BOOK_METADATA_CANONICAL_ROOTS[number])) {
        const canonicalPath = path as typeof BOOK_METADATA_CANONICAL_ROOTS[number];
        if (method === 'GET') {
          return new Response(JSON.stringify(liveRoots.get(canonicalPath) ?? {}), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ETag: etags.get(canonicalPath)! },
          });
        }
        if (method === 'PUT') {
          const headers = new Headers(init?.headers);
          if (headers.get('If-Match') !== etags.get(canonicalPath)) return json({ error: 'stale' }, 412);
          liveRoots.set(canonicalPath, JSON.parse(String(init?.body ?? '{}')));
          metadataPuts.push(path);
          return json({ ok: true });
        }
      }
      if (method === 'GET') return json({});
      throw new Error(`Unexpected fetch ${method} ${url.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const preview = buildBookMetadataRestorePreview(
      inventory,
      backupId,
      BOOK_METADATA_CANONICAL_ROOTS.map((path) => ({
        path,
        etag: etags.get(path)!,
        revision: null,
      })),
    );
    expect(preview.allowed).toBe(true);

    const result = await executeRestore({
      FIREBASE_PROJECT_ID: 'project-120',
      FIREBASE_DB_URL: 'https://db.example.test',
      GOOGLE_SA_KEY: '{}',
    } as WorkerEnv, r2 as never, backupId, {
      scope: ['book_metadata'],
      mode: 'smart_auto',
      bookMetadataPreview: preview,
    }, new StatusTracker('restore'));

    expect(result.status).toBe('complete');
    expect(result.bookMetadata).toEqual({
      restoredRoots: 2,
      skippedRoots: BOOK_METADATA_CANONICAL_ROOTS.length - 2,
      failedRoots: 0,
    });
    expect(metadataPuts).toEqual(['book_delivery/current', 'material_catalog/books']);
    expect(liveRoots.get('book_delivery/current')).toEqual({
      bookId: 'book-1',
      ownerId: 'teacher-1',
      revision: 2,
    });
    expect(fetchMock.mock.calls.some(([input, init]) => (
      JSON.stringify(init?.body ?? '').toLowerCase().includes('pdfbytes')
    ))).toBe(false);
  });

  it('rejects a stale Book ETag before setting the restore flag or writing state', async () => {
    const backupId = 'BK-book-metadata-stale';
    const inventory = makeBookInventory(backupId);
    const r2 = new FakeR2Client();
    await putBookBackup(r2, backupId, inventory);
    const preview = buildBookMetadataRestorePreview(
      inventory,
      backupId,
      BOOK_METADATA_CANONICAL_ROOTS.map((path) => ({
        path,
        etag: `preview:${path}`,
        revision: 1,
      })),
    );
    const writes: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '');
      if (method === 'PUT') writes.push(path);
      if (method === 'GET' && BOOK_METADATA_CANONICAL_ROOTS.includes(path as typeof BOOK_METADATA_CANONICAL_ROOTS[number])) {
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json', ETag: `live:${path}` },
        });
      }
      if (method === 'GET') return json({});
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(executeRestore({
      FIREBASE_PROJECT_ID: 'project-120',
      FIREBASE_DB_URL: 'https://db.example.test',
      GOOGLE_SA_KEY: '{}',
    } as WorkerEnv, r2 as never, backupId, {
      scope: ['book_metadata'],
      mode: 'smart_auto',
      bookMetadataPreview: preview,
    }, new StatusTracker('restore'))).rejects.toThrow(/drift|ETag/i);
    expect(writes).toEqual([]);
  });
});
