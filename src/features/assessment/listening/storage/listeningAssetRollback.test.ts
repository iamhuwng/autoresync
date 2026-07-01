import { describe, expect, it, vi } from 'vitest';

import { commitListeningMediaAsset } from './listeningAssetCommit';
import { queueImmediateListeningTempCleanup } from './listeningAssetLifecycle';
import {
  LISTENING_STORAGE_ROLLBACK_CONTROLS,
  canDeleteListeningAssetUnderRollback,
  preserveLegacyPublishReadFields,
} from './listeningAssetRollback';
import type {
  ListeningAssetCommitObjectStore,
  ListeningAssetCommitRegistry,
} from './listeningAssetCommit';
import type { ListeningMediaAssetRecord } from './listeningAssetRegistry';

const now = 1_700_000_000_000;
const mp3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);

const tempRecord = (): ListeningMediaAssetRecord => ({
  assetId: 'asset-1',
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  state: 'temp',
  tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: mp3Bytes.byteLength,
  checksum: 'sha256:proof',
  checksumAlgorithm: 'sha256',
  createdAt: now,
  updatedAt: now,
  createdBy: 'teacher-1',
  lastReferencedAt: now,
  references: {},
});

const committedRecord = (): ListeningMediaAssetRecord => ({
  ...tempRecord(),
  state: 'committed',
  references: {
    versions: {
      'version-1': true,
    },
  },
});

const makeAdapters = () => {
  const record = tempRecord();
  const registry: ListeningAssetCommitRegistry = {
    getAsset: vi.fn(async () => record),
    markCommitting: vi.fn(async () => {}),
    writeReference: vi.fn(async () => {}),
    markCommitted: vi.fn(async () => {}),
  };
  const objectStore: ListeningAssetCommitObjectStore = {
    getTempObject: vi.fn(async () => ({
      key: record.tempKey,
      body: mp3Bytes,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      checksum: record.checksum,
    })),
    copyToDurable: vi.fn(async () => {}),
    getDurableObject: vi.fn(async () => ({
      key: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      checksum: record.checksum,
    })),
    deleteTempObject: vi.fn(async () => {}),
  };
  return { objectStore, registry };
};

const commitInput = {
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  assetId: 'asset-1',
  fileName: 'audio.mp3',
  declaredMimeType: 'audio/mpeg',
  expectedChecksum: 'sha256:proof',
  activeAudioFileCount: 1,
  reference: {
    kind: 'versions' as const,
    id: 'version-1',
    sourcePath: 'listening_authoring/versions/version-1/audioSections/0',
  },
  now,
  publicBaseUrl: 'https://public.example',
};

describe('Listening storage rollback controls', () => {
  it('declares rollback controls required by Task 4.16', () => {
    expect(LISTENING_STORAGE_ROLLBACK_CONTROLS).toEqual({
      registryWritesEnabled: false,
      cleanupDeletionEnabled: false,
      retainReferencedAssets: true,
      preserveLegacyPublishReads: true,
      mutateExistingAudio: false,
      reason: 'task-4.16-storage-rollback',
    });
  });

  it('disables new registry writes before commit mutates registry or R2 objects', async () => {
    const adapters = makeAdapters();

    await expect(commitListeningMediaAsset({
      ...commitInput,
      rollbackControls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
    }, adapters)).rejects.toThrow('registry_writes_disabled');

    expect(adapters.registry.markCommitting).not.toHaveBeenCalled();
    expect(adapters.objectStore.copyToDurable).not.toHaveBeenCalled();
    expect(adapters.objectStore.deleteTempObject).not.toHaveBeenCalled();
  });

  it('stops cleanup/deletion queues while rollback is active', () => {
    expect(queueImmediateListeningTempCleanup({
      assetId: 'asset-temp',
      ownerId: 'teacher-1',
      tempKey: 'temp/listening/teacher-1/session-1/asset-temp-audio.mp3',
      state: 'temp',
      reason: 'builder-cancel',
      now,
      rollbackControls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
    })).toEqual({
      operation: 'cleanup-stopped',
      assetId: 'asset-temp',
      reason: 'builder-cancel',
      queuedAt: now,
      durableDeleteAllowed: false,
    });
  });

  it('retains referenced assets and denies deletion while rollback cleanup is disabled', () => {
    expect(canDeleteListeningAssetUnderRollback({
      asset: committedRecord(),
      controls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
    })).toEqual({
      allowed: false,
      reason: 'cleanup_deletion_disabled',
    });
  });

  it('preserves legacy publish read fields without mutating existing audio', () => {
    const record = {
      assetId: 'asset-legacy',
      audioUrl: 'https://public.example/audio/legacy.mp3',
      streamUrl: 'https://public.example/audio/legacy.mp3',
    };

    expect(preserveLegacyPublishReadFields({
      record,
      controls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
    })).toEqual(record);
  });
});
