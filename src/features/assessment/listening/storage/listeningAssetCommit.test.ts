import { describe, expect, it, vi } from 'vitest';

import {
  commitListeningMediaAsset,
  type ListeningAssetCommitObjectStore,
  type ListeningAssetCommitReconciliationQueue,
  type ListeningAssetCommitRegistry,
} from './listeningAssetCommit';
import type { ListeningMediaAssetRecord } from './listeningAssetRegistry';

const mp3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
const invalidMp3LikeBytes = new Uint8Array([0xff, 0x00, 0x00, 0x00]);

const tempRecord = (overrides: Partial<ListeningMediaAssetRecord> = {}): ListeningMediaAssetRecord => ({
  assetId: 'asset-1',
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  state: 'temp',
  tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: mp3Bytes.byteLength,
  checksum: 'sha256:proof',
  checksumAlgorithm: 'sha256',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  createdBy: 'teacher-1',
  lastReferencedAt: 1_700_000_000_000,
  references: {},
  ...overrides,
});

const makeAdapters = (record: ListeningMediaAssetRecord = tempRecord()) => {
  const order: string[] = [];
  const registry: ListeningAssetCommitRegistry = {
    getAsset: vi.fn(async () => record),
    markCommitting: vi.fn(async () => { order.push('mark-committing'); }),
    writeReference: vi.fn(async () => { order.push('write-reference'); }),
    markCommitted: vi.fn(async () => { order.push('mark-committed'); }),
  };
  const objectStore: ListeningAssetCommitObjectStore = {
    getTempObject: vi.fn(async () => {
      order.push('get-temp');
      return {
        key: record.tempKey,
        body: mp3Bytes,
        contentType: record.contentType,
        sizeBytes: record.sizeBytes,
        checksum: record.checksum,
      };
    }),
    copyToDurable: vi.fn(async () => { order.push('copy-durable'); }),
    getDurableObject: vi.fn(async (_key) => {
      order.push('verify-durable');
      return {
        key: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
        contentType: record.contentType,
        sizeBytes: record.sizeBytes,
        checksum: record.checksum,
      };
    }),
    deleteTempObject: vi.fn(async () => { order.push('delete-temp'); }),
  };
  const reconciliationQueue: ListeningAssetCommitReconciliationQueue = {
    queueUnreferencedDurableCopy: vi.fn(async () => { order.push('queue-reconciliation'); }),
  };
  return { objectStore, order, reconciliationQueue, registry };
};

const makeAdaptersWithBody = (body: Uint8Array) => {
  const adapters = makeAdapters();
  vi.mocked(adapters.objectStore.getTempObject).mockImplementation(async () => ({
    key: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
    body,
    contentType: 'audio/mpeg',
    sizeBytes: body.byteLength,
    checksum: 'sha256:proof',
  }));
  return adapters;
};

const commitInput = {
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  assetId: 'asset-1',
  fileName: 'audio.mp3',
  declaredMimeType: 'audio/mpeg',
  expectedChecksum: 'sha256:proof',
  idempotencyKey: 'commit-asset-1',
  expectedDurationMs: 30_000,
  decodable: true,
  activeAudioFileCount: 9,
  reference: {
    kind: 'tests' as const,
    id: 'test-1',
    sourcePath: 'tests/test-1/audioSections/0',
  },
  now: 1_700_000_060_000,
  publicBaseUrl: 'https://public.example',
};

describe('Listening asset commit service', () => {
  it('commits temp audio idempotently into immutable durable storage and public reader fields', async () => {
    const adapters = makeAdapters();

    await expect(commitListeningMediaAsset(commitInput, adapters)).resolves.toEqual({
      assetId: 'asset-1',
      durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      audioUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      streamUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      state: 'committed',
    });

    expect(adapters.order).toEqual([
      'get-temp',
      'mark-committing',
      'copy-durable',
      'verify-durable',
      'write-reference',
      'mark-committed',
      'delete-temp',
    ]);
    expect(adapters.registry.writeReference).toHaveBeenCalledWith(expect.objectContaining({
      assetId: 'asset-1',
      reference: commitInput.reference,
    }));
    expect(adapters.objectStore.deleteTempObject).toHaveBeenCalledWith(
      'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
    );
  });

  it('re-verifies existing committed durable object before returning idempotent success', async () => {
    const adapters = makeAdapters(tempRecord({
      state: 'committed',
      committedAt: 1_700_000_050_000,
      references: { tests: { 'test-1': true } },
      tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
    }));

    await expect(commitListeningMediaAsset(commitInput, adapters)).resolves.toMatchObject({
      assetId: 'asset-1',
      durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      state: 'committed',
    });

    expect(adapters.objectStore.copyToDurable).not.toHaveBeenCalled();
    expect(adapters.objectStore.deleteTempObject).not.toHaveBeenCalled();
    expect(adapters.objectStore.getDurableObject).toHaveBeenCalledWith(
      'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
    );
    expect(adapters.order).toEqual(['verify-durable']);
  });

  it('fails committed retry closed when durable object no longer verifies', async () => {
    const adapters = makeAdapters(tempRecord({
      state: 'committed',
      committedAt: 1_700_000_050_000,
      references: { tests: { 'test-1': true } },
    }));
    vi.mocked(adapters.objectStore.getDurableObject).mockResolvedValueOnce(null);

    await expect(commitListeningMediaAsset(commitInput, adapters)).rejects.toThrow('durable_verification_failed');

    expect(adapters.objectStore.copyToDurable).not.toHaveBeenCalled();
    expect(adapters.objectStore.deleteTempObject).not.toHaveBeenCalled();
  });

  it.each([
    ['extension', { fileName: 'audio.exe' }],
    ['mime', { declaredMimeType: 'audio/webm' }],
    ['file count', { activeAudioFileCount: 11 }],
    ['checksum', { expectedChecksum: 'sha256:wrong' }],
    ['duration', { expectedDurationMs: 0 }],
    ['decodability', { decodable: false }],
  ])('fails closed on invalid %s before durable copy', async (_label, overrides) => {
    const adapters = makeAdapters();

    await expect(commitListeningMediaAsset({
      ...commitInput,
      ...overrides,
    }, adapters)).rejects.toThrow();

    expect(adapters.objectStore.copyToDurable).not.toHaveBeenCalled();
    expect(adapters.objectStore.deleteTempObject).not.toHaveBeenCalled();
  });

  it('rejects invalid mp3-like bytes beginning with 0xff 00 00 00 before durable copy', async () => {
    const adapters = makeAdaptersWithBody(invalidMp3LikeBytes);

    await expect(commitListeningMediaAsset(commitInput, adapters)).rejects.toThrow('audio_magic_mismatch');

    expect(adapters.objectStore.copyToDurable).not.toHaveBeenCalled();
    expect(adapters.objectStore.deleteTempObject).not.toHaveBeenCalled();
  });

  it('allows the approved tenth active audio file while rejecting the eleventh', async () => {
    const adapters = makeAdapters();

    await expect(commitListeningMediaAsset({
      ...commitInput,
      activeAudioFileCount: 10,
    }, adapters)).resolves.toMatchObject({
      assetId: 'asset-1',
      state: 'committed',
    });

    const eleventhAdapters = makeAdapters();
    await expect(commitListeningMediaAsset({
      ...commitInput,
      activeAudioFileCount: 11,
    }, eleventhAdapters)).rejects.toThrow('active_audio_limit_exceeded');
    expect(eleventhAdapters.objectStore.copyToDurable).not.toHaveBeenCalled();
  });

  it('queues copied unreferenced durable object and preserves temp source when reference write fails', async () => {
    const adapters = makeAdapters();
    vi.mocked(adapters.registry.writeReference).mockRejectedValueOnce(new Error('reference denied'));

    await expect(commitListeningMediaAsset(commitInput, adapters)).rejects.toThrow('reference denied');

    expect(adapters.objectStore.copyToDurable).toHaveBeenCalled();
    expect(adapters.objectStore.deleteTempObject).not.toHaveBeenCalled();
    expect(adapters.reconciliationQueue.queueUnreferencedDurableCopy).toHaveBeenCalledWith({
      assetId: 'asset-1',
      ownerId: 'teacher-1',
      uploadSessionId: 'session-1',
      durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      reference: commitInput.reference,
      idempotencyKey: 'commit-asset-1',
      reasonCode: 'reference_write_failed',
      queuedAt: 1_700_000_060_000,
    });
  });
});
