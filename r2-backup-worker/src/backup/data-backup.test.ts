import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkerEnv } from '../types';
import { StatusTracker } from './status-tracker';
import { executeStep1_RTDB, readBookMetadataInventory } from './data-backup';
import { BOOK_METADATA_CANONICAL_ROOTS } from '../restore/book-source-restore';

vi.mock('../auth/google-oauth', () => ({
  TokenCache: class {
    async getToken() {
      return 'google-token';
    }
  },
}));

vi.mock('./backup-lock', () => ({
  acquireLock: vi.fn(async () => ({ acquired: true })),
  releaseLock: vi.fn(async () => undefined),
}));

class FakeR2Client {
  readonly objects = new Map<string, string>();

  async putObject(key: string, body: Uint8Array | string): Promise<void> {
    const text = typeof body === 'string'
      ? body
      : new TextDecoder().decode(body);
    this.objects.set(key, text);
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    const text = this.objects.get(key);
    return text ? new TextEncoder().encode(text) : null;
  }

  async getObjectAsJson<T>(key: string): Promise<T | null> {
    const text = this.objects.get(key);
    return text ? JSON.parse(text) as T : null;
  }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('data backup RTDB step', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('backs up media_assets with checksum metadata and excludes system_flags', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '');

      if (path === '' && url.searchParams.get('shallow') === 'true') {
        return json({
          users: true,
          media_asset_upload_sessions: true,
          media_assets: true,
          media_asset_events: true,
          media_asset_metrics: true,
          media_asset_sweeps: true,
          tests: true,
          system_flags: true,
        });
      }

      if (path === 'users') {
        return json({
          'teacher-1': { role: 'teacher' },
        });
      }

      if (path === 'media_assets') {
        return json({
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
            references: {
              drafts: {
                'draft-1': true,
              },
            },
          },
        });
      }

      if (path === 'media_asset_upload_sessions') {
        return json({
          'teacher-1': {
            'session-1': {
              ownerId: 'teacher-1',
              uploadSessionId: 'session-1',
              status: 'active',
              lastHeartbeatAt: 1_700_000_060_000,
            },
          },
        });
      }

      if (path === 'media_asset_events') {
        return json({
          'event-1': {
            eventId: 'event-1',
            ownerId: 'teacher-1',
            assetId: 'asset-1',
            reasonCode: 'reference_write_failed',
          },
        });
      }

      if (path === 'media_asset_metrics') {
        return json({
          'metric-1': {
            metricEventId: 'metric-1',
            assetId: 'asset-1',
            stopAction: 'disable new registry writes',
          },
        });
      }

      if (path === 'media_asset_sweeps') {
        return json({
          'sweep-1': {
            sweepId: 'sweep-1',
            status: 'planned',
          },
        });
      }

      if (path === 'listening_authoring') {
        return json({
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
              expiresAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000,
            },
          },
        });
      }

      if (path === 'book_activity') {
        return json({
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
        });
      }

      if (path === 'tests') {
        return json({
          'legacy-test-1': {
            id: 'legacy-test-1',
            ownerId: 'teacher-1',
            authoringVersioning: {
              frozen: true,
              versionId: 'version-1',
              versionNumber: 1,
              decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20',
            },
          },
        });
      }

      throw new Error(`Unexpected fetch ${url.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const r2 = new FakeR2Client();
    const tracker = new StatusTracker('backup');
    tracker.setR2Client(r2 as never);

    await executeStep1_RTDB({
      FIREBASE_DB_URL: 'https://db.example.test',
      GOOGLE_SA_KEY: '{}',
    } as WorkerEnv, r2 as never, 'manual', tracker);

    const savedData = await r2.getObjectAsJson<Record<string, unknown>>(`steps/${tracker.state.id}/rtdb.json`);
    const savedMeta = await r2.getObjectAsJson<{
      entityCounts: {
        rtdb: Record<string, number>;
      };
    }>(`steps/${tracker.state.id}/meta.json`);

    expect(savedData).toEqual({
      users: {
        'teacher-1': { role: 'teacher' },
      },
      media_asset_upload_sessions: {
        'teacher-1': {
          'session-1': expect.objectContaining({
            lastHeartbeatAt: 1_700_000_060_000,
          }),
        },
      },
      media_assets: {
        'asset-1': expect.objectContaining({
          checksum: 'sha256:asset-1',
          checksumAlgorithm: 'sha256',
        }),
      },
      media_asset_events: {
        'event-1': expect.objectContaining({
          reasonCode: 'reference_write_failed',
        }),
      },
      media_asset_metrics: {
        'metric-1': expect.objectContaining({
          stopAction: 'disable new registry writes',
        }),
      },
      media_asset_sweeps: {
        'sweep-1': expect.objectContaining({
          status: 'planned',
        }),
      },
      listening_authoring: {
        drafts: {
          'draft-1': expect.objectContaining({
            conflictToken: 3,
          }),
        },
        revision_drafts: {
          'revision-1': expect.objectContaining({
            createdFromVersionId: 'version-1',
          }),
        },
        versions: {
          'version-1': expect.objectContaining({
            documentHash: 'hash-1',
          }),
        },
        operations: {
          'operation-1': expect.objectContaining({
            expiresAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000,
          }),
        },
      },
      book_activity: {
        materials: {
          'activity-1': expect.objectContaining({
            ownerId: 'teacher-1',
          }),
        },
        versions: {
          'activity-1': {
            'version-1': expect.objectContaining({
              versionId: 'version-1',
            }),
          },
        },
      },
      tests: {
        'legacy-test-1': expect.objectContaining({
          authoringVersioning: expect.objectContaining({
            frozen: true,
            versionId: 'version-1',
            versionNumber: 1,
          }),
        }),
      },
    });
    expect(savedData).not.toHaveProperty('system_flags');
    expect(savedMeta?.entityCounts.rtdb).toMatchObject({
      users: 1,
      media_asset_upload_sessions: 1,
      media_assets: 1,
      media_asset_events: 1,
      media_asset_metrics: 1,
      media_asset_sweeps: 1,
      listening_authoring: 4,
      book_activity: 2,
      tests: 1,
    });
  });

  it('includes book_activity in RTDB backup coverage', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '');

      if (path === '' && url.searchParams.get('shallow') === 'true') {
        return json({
          users: true,
        });
      }

      if (path === 'users') {
        return json({
          'teacher-1': { role: 'teacher' },
        });
      }

      if (path === 'listening_authoring') {
        return json({});
      }

      if (path === 'book_activity') {
        return json({
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
        });
      }

      throw new Error(`Unexpected fetch ${url.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const r2 = new FakeR2Client();
    const tracker = new StatusTracker('backup');
    tracker.setR2Client(r2 as never);

    await executeStep1_RTDB({
      FIREBASE_DB_URL: 'https://db.example.test',
      GOOGLE_SA_KEY: '{}',
    } as WorkerEnv, r2 as never, 'manual', tracker);

    const savedData = await r2.getObjectAsJson<Record<string, unknown>>(`steps/${tracker.state.id}/rtdb.json`);
    const savedMeta = await r2.getObjectAsJson<{
      entityCounts: {
        rtdb: Record<string, number>;
      };
    }>(`steps/${tracker.state.id}/meta.json`);

    expect(savedData).toHaveProperty('book_activity.materials.activity-1.ownerId', 'teacher-1');
    expect(savedMeta?.entityCounts.rtdb).toMatchObject({
      book_activity: 2,
    });
  });

  it('captures each final Book metadata root exactly once without a broad scan', async () => {
    const requestedPaths: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '');
      requestedPaths.push(path);
      if (!BOOK_METADATA_CANONICAL_ROOTS.includes(path as typeof BOOK_METADATA_CANONICAL_ROOTS[number])) {
        throw new Error(`Unexpected non-canonical Book path ${path}`);
      }
      if (path === 'book_delivery/current' || path === 'material_catalog/books') {
        return json({ 'book-1': { bookId: 'book-1', ownerId: 'teacher-1', revision: 1 } });
      }
      return json({});
    });

    const result = await readBookMetadataInventory(
      {
        FIREBASE_PROJECT_ID: 'project-120',
        FIREBASE_DB_URL: 'https://db.example.test',
      } as WorkerEnv,
      'BK-120',
      '2026-08-11T00:00:00.000Z',
      async () => 'google-token',
      fetchMock,
    );

    expect(result.inventory.roots.map((root) => root.path)).toEqual([...BOOK_METADATA_CANONICAL_ROOTS]);
    expect(requestedPaths).toEqual([...BOOK_METADATA_CANONICAL_ROOTS]);
    expect(new Set(requestedPaths).size).toBe(requestedPaths.length);
    expect(requestedPaths.some((path) => path.includes('*') || path.includes('$') || path === '')).toBe(false);
    expect(result.inventory.pdfBodyReads).toBe(0);
    expect(result.inventory.pdfBodyWrites).toBe(0);
  });
});
