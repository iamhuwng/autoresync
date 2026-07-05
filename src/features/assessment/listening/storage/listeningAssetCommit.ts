// @ts-nocheck
import type { ListeningMediaAssetRecord, ListeningMediaAssetReferences } from './listeningAssetRegistry';
import {
  areListeningRegistryWritesEnabled,
  type ListeningStorageRollbackControls,
} from './listeningAssetRollback';

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const AUDIO_EXTENSION_MIME = {
  mp3: new Set(['audio/mpeg']),
  m4a: new Set(['audio/m4a', 'audio/mp4']),
  aac: new Set(['audio/aac']),
  wav: new Set(['audio/wav', 'audio/x-wav']),
  ogg: new Set(['audio/ogg']),
} as const;

export type ListeningAssetReferenceKind = keyof ListeningMediaAssetReferences;

export interface ListeningAssetCommitReference {
  readonly kind: ListeningAssetReferenceKind;
  readonly id: string;
  readonly sourcePath: string;
}

export interface ListeningAssetCommitInput {
  readonly ownerId: string;
  readonly uploadSessionId: string;
  readonly assetId: string;
  readonly idempotencyKey?: string;
  readonly fileName: string;
  readonly declaredMimeType: string;
  readonly expectedChecksum: string;
  readonly expectedDurationMs?: number;
  readonly decodable?: boolean;
  readonly activeAudioFileCount: number;
  readonly reference: ListeningAssetCommitReference;
  readonly now: number;
  readonly publicBaseUrl: string;
  readonly rollbackControls?: ListeningStorageRollbackControls;
}

export interface ListeningAssetObjectSnapshot {
  readonly key: string;
  readonly body?: Uint8Array;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface ListeningAssetCommitObjectStore {
  getTempObject(key: string): Promise<ListeningAssetObjectSnapshot | null>;
  copyToDurable(input: {
    readonly sourceKey: string;
    readonly durableKey: string;
    readonly contentType: string;
    readonly checksum: string;
  }): Promise<void>;
  getDurableObject(key: string): Promise<Omit<ListeningAssetObjectSnapshot, 'body'> | null>;
  deleteTempObject(key: string): Promise<void>;
}

export interface ListeningAssetCommitRegistry {
  getAsset(assetId: string): Promise<ListeningMediaAssetRecord | null>;
  markCommitting(input: {
    readonly assetId: string;
    readonly ownerId: string;
    readonly updatedAt: number;
  }): Promise<void>;
  writeReference(input: {
    readonly assetId: string;
    readonly ownerId: string;
    readonly reference: ListeningAssetCommitReference;
    readonly updatedAt: number;
  }): Promise<void>;
  markCommitted(input: {
    readonly assetId: string;
    readonly ownerId: string;
    readonly durableKey: string;
    readonly committedAt: number;
    readonly publicUrl: string;
  }): Promise<void>;
}

export interface ListeningAssetCommitReconciliationQueue {
  queueUnreferencedDurableCopy(input: {
    readonly assetId: string;
    readonly ownerId: string;
    readonly uploadSessionId: string;
    readonly durableKey: string;
    readonly reference: ListeningAssetCommitReference;
    readonly idempotencyKey?: string;
    readonly reasonCode: 'reference_write_failed';
    readonly queuedAt: number;
  }): Promise<void>;
}

export interface ListeningAssetCommitResult {
  readonly assetId: string;
  readonly durableKey: string;
  readonly audioUrl: string;
  readonly streamUrl: string;
  readonly state: 'committed';
}

export class ListeningAssetCommitError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ListeningAssetCommitError';
  }
}

const fail = (code: string): never => {
  throw new ListeningAssetCommitError(code);
};

const extensionFor = (fileName: string): keyof typeof AUDIO_EXTENSION_MIME => {
  const match = /\.([^.]+)$/.exec(fileName.trim().toLowerCase());
  if (!match) fail('missing_audio_extension');
  const extension = match[1] as keyof typeof AUDIO_EXTENSION_MIME;
  if (!Object.prototype.hasOwnProperty.call(AUDIO_EXTENSION_MIME, extension)) {
    fail('unsupported_audio_extension');
  }
  return extension;
};

const hasMp3Magic = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
  || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);

const hasMp4Magic = (bytes: Uint8Array): boolean =>
  bytes.length >= 12
  && bytes[4] === 0x66
  && bytes[5] === 0x74
  && bytes[6] === 0x79
  && bytes[7] === 0x70;

const hasWavMagic = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x52
  && bytes[1] === 0x49
  && bytes[2] === 0x46
  && bytes[3] === 0x46
  && bytes[8] === 0x57
  && bytes[9] === 0x41
  && bytes[10] === 0x56
  && bytes[11] === 0x45;

const hasOggMagic = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;

const hasAacMagic = (bytes: Uint8Array): boolean =>
  bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0;

const assertMagicBytes = (extension: keyof typeof AUDIO_EXTENSION_MIME, body: Uint8Array | undefined): void => {
  if (!body || body.byteLength < 4) fail('missing_audio_magic_bytes');
  if (extension === 'mp3' && hasMp3Magic(body)) return;
  if (extension === 'm4a' && hasMp4Magic(body)) return;
  if (extension === 'aac' && hasAacMagic(body)) return;
  if (extension === 'wav' && hasWavMagic(body)) return;
  if (extension === 'ogg' && hasOggMagic(body)) return;
  fail('audio_magic_mismatch');
};

const assertCommitContract = (
  input: ListeningAssetCommitInput,
  record: ListeningMediaAssetRecord,
  tempObject: ListeningAssetObjectSnapshot,
): keyof typeof AUDIO_EXTENSION_MIME => {
  if (record.ownerId !== input.ownerId || record.createdBy !== input.ownerId) fail('asset_owner_mismatch');
  if (record.uploadSessionId !== input.uploadSessionId) fail('upload_session_mismatch');
  if (record.assetId !== input.assetId) fail('asset_id_mismatch');
  if (input.activeAudioFileCount > 10) fail('active_audio_limit_exceeded');
  if (input.expectedDurationMs !== undefined && (!Number.isFinite(input.expectedDurationMs) || input.expectedDurationMs <= 0)) {
    fail('invalid_audio_duration');
  }
  if (input.decodable === false) fail('audio_not_decodable');
  if (tempObject.sizeBytes > MAX_AUDIO_BYTES || record.sizeBytes > MAX_AUDIO_BYTES) fail('audio_too_large');
  if (tempObject.checksum !== input.expectedChecksum || record.checksum !== input.expectedChecksum) {
    fail('checksum_mismatch');
  }

  const extension = extensionFor(input.fileName);
  const allowedMimes = AUDIO_EXTENSION_MIME[extension];
  const declaredMimeType = input.declaredMimeType.trim().toLowerCase();
  if (!allowedMimes.has(declaredMimeType as never)) fail('unsupported_audio_mime');
  if (tempObject.contentType.trim().toLowerCase() !== declaredMimeType) fail('declared_mime_mismatch');
  assertMagicBytes(extension, tempObject.body);
  return extension;
};

const durableFileName = (tempKey: string, assetId: string, fileName: string): string => {
  const keyName = tempKey.split('/').pop() ?? fileName;
  const prefix = `${assetId}-`;
  if (keyName.startsWith(prefix)) return keyName.slice(prefix.length);
  return fileName.trim().toLowerCase();
};

const buildDurableKey = (input: ListeningAssetCommitInput, record: ListeningMediaAssetRecord): string =>
  `assessment-assets/listening/${input.ownerId}/${input.assetId}/${durableFileName(record.tempKey, input.assetId, input.fileName)}`;

const resultFor = (input: ListeningAssetCommitInput, durableKey: string): ListeningAssetCommitResult => {
  const publicBaseUrl = input.publicBaseUrl.replace(/\/+$/, '');
  const publicUrl = `${publicBaseUrl}/${durableKey}`;
  return {
    assetId: input.assetId,
    durableKey,
    audioUrl: publicUrl,
    streamUrl: publicUrl,
    state: 'committed',
  };
};

const assertDurableObjectMatches = (
  durableObject: Omit<ListeningAssetObjectSnapshot, 'body'> | null,
  durableKey: string,
  expected: Pick<ListeningAssetObjectSnapshot, 'sizeBytes' | 'checksum'>,
): void => {
  if (
    !durableObject
    || durableObject.key !== durableKey
    || durableObject.sizeBytes !== expected.sizeBytes
    || durableObject.checksum !== expected.checksum
  ) {
    fail('durable_verification_failed');
  }
};

export async function commitListeningMediaAsset(
  input: ListeningAssetCommitInput,
  dependencies: {
    readonly objectStore: ListeningAssetCommitObjectStore;
    readonly registry: ListeningAssetCommitRegistry;
    readonly reconciliationQueue?: ListeningAssetCommitReconciliationQueue;
  },
): Promise<ListeningAssetCommitResult> {
  const record = await dependencies.registry.getAsset(input.assetId);
  if (!record) fail('asset_not_found');
  const durableKey = buildDurableKey(input, record);

  if (record.state === 'committed') {
    const durableObject = await dependencies.objectStore.getDurableObject(durableKey);
    assertDurableObjectMatches(durableObject, durableKey, record);
    return resultFor(input, durableKey);
  }
  if (record.state !== 'temp' && record.state !== 'committing') fail('invalid_asset_state');
  if (!areListeningRegistryWritesEnabled(input.rollbackControls)) fail('registry_writes_disabled');

  const tempObject = await dependencies.objectStore.getTempObject(record.tempKey);
  if (!tempObject || tempObject.key !== record.tempKey) fail('temp_object_missing');
  assertCommitContract(input, record, tempObject);

  await dependencies.registry.markCommitting({
    assetId: input.assetId,
    ownerId: input.ownerId,
    updatedAt: input.now,
  });
  await dependencies.objectStore.copyToDurable({
    sourceKey: record.tempKey,
    durableKey,
    contentType: tempObject.contentType,
    checksum: tempObject.checksum,
  });

  const durableObject = await dependencies.objectStore.getDurableObject(durableKey);
  assertDurableObjectMatches(durableObject, durableKey, tempObject);

  try {
    await dependencies.registry.writeReference({
      assetId: input.assetId,
      ownerId: input.ownerId,
      reference: input.reference,
      updatedAt: input.now,
    });
  } catch (error) {
    await dependencies.reconciliationQueue?.queueUnreferencedDurableCopy({
      assetId: input.assetId,
      ownerId: input.ownerId,
      uploadSessionId: input.uploadSessionId,
      durableKey,
      reference: input.reference,
      idempotencyKey: input.idempotencyKey,
      reasonCode: 'reference_write_failed',
      queuedAt: input.now,
    });
    throw error;
  }
  const result = resultFor(input, durableKey);
  await dependencies.registry.markCommitted({
    assetId: input.assetId,
    ownerId: input.ownerId,
    durableKey,
    committedAt: input.now,
    publicUrl: result.audioUrl,
  });
  await dependencies.objectStore.deleteTempObject(record.tempKey);
  return result;
}
