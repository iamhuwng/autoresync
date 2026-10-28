import { createHash } from 'node:crypto';
import {
  prepareListeningMediaAsset,
  finalizeListeningMediaAsset,
  ListeningAssetCommitError,
  type ListeningAssetCommitInput,
  type ListeningAssetCommitObjectStore,
  type ListeningAssetCommitReference,
  type ListeningAssetCommitRegistry,
  type ListeningAssetPreparedResult,
  type ListeningAssetObjectSnapshot,
} from '../../../../src/features/assessment/listening/storage/listeningAssetCommit.ts';
import {
  createListeningMediaAssetRecord,
  type ListeningMediaAssetRecord,
} from '../../../../src/features/assessment/listening/storage/listeningAssetRegistry.ts';
import type { ListeningAuthoringDocumentV1 } from '../../../../functions/src/listening-authoring/repository.shared.ts';
import type { ListeningUploadSessionRecord } from '../listening-upload-session-types.ts';
import type { FirebaseRtdbRestClient } from './rtdb.ts';

interface AudioObject {
  size: number;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface ListeningAssetBucket {
  get(key: string): Promise<AudioObject | null>;
  put(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}
type PreparedAsset = { input: ListeningAssetCommitInput; prepared: ListeningAssetPreparedResult };
export interface PreparedListeningDocument {
  document: ListeningAuthoringDocumentV1;
  assets: PreparedAsset[];
}
const fail = (code: string): never => { throw new ListeningAssetCommitError(code); };
const identifier = (value: string): boolean => /^[A-Za-z0-9_-]{1,160}$/.test(value);
const maxBytes = 50 * 1024 * 1024;

/** Coordinates storage phases with the repository's canonical record transaction. */
export class ListeningAuthoringAssets {
  // Durable keys are immutable; the Worker creates a fresh coordinator for each request.
  private readonly verifiedDurable = new Map<string, Omit<ListeningAssetObjectSnapshot, 'body'>>();

  constructor(private readonly options: {
    rtdb: FirebaseRtdbRestClient;
    bucket?: ListeningAssetBucket;
    publicUrl?: string;
    now: () => number;
  }) {}

  private async snapshot(key: string, bodyBytes = 0) {
    if (!this.options.bucket) fail('asset_storage_unavailable');
    const object = await this.options.bucket.get(key);
    if (!object) return null;
    if (!Number.isSafeInteger(object.size) || object.size <= 0 || object.size > maxBytes) fail('invalid_audio_size');
    const body = new Uint8Array(await object.arrayBuffer());
    if (body.byteLength !== object.size) fail('audio_size_mismatch');
    return { key, body: bodyBytes ? (bodyBytes >= body.byteLength ? body : body.slice(0, bodyBytes)) : undefined, sizeBytes: body.byteLength, contentType: object.httpMetadata?.contentType ?? '',
      checksum: createHash('sha256').update(body).digest('hex') };
  }

  private async mutateAsset(assetId: string, ownerId: string, update: (record: ListeningMediaAssetRecord) => unknown) {
    const path = `media_assets/${assetId}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.options.rtdb.readWithEtag<ListeningMediaAssetRecord | null>(path);
      if (!current.data || current.data.ownerId !== ownerId || current.data.assetId !== assetId) fail('asset_owner_mismatch');
      if (await this.options.rtdb.writeIfMatch(path, update(current.data), current.etag)) return;
    }
    fail('asset_transaction_retries_exhausted');
  }

  private adapters(ownerId: string) {
    const registry: ListeningAssetCommitRegistry = {
      getAsset: async assetId => this.options.rtdb.readValue(`media_assets/${assetId}`) as Promise<ListeningMediaAssetRecord | null>,
      markCommitting: async input => this.mutateAsset(input.assetId, ownerId, record => {
        if (record.state === 'committed') return record;
        if (record.state !== 'temp' && record.state !== 'committing') fail('invalid_asset_state');
        return { ...record, state: 'committing', updatedAt: input.updatedAt };
      }),
      writeReference: async input => {
        const saved = await this.options.rtdb.readValue(input.reference.sourcePath) as Record<string, unknown> | null;
        const ids = saved?.assetIds as Record<string, unknown> | undefined;
        if (saved?.ownerId !== ownerId || ids?.[input.assetId] !== true) fail('canonical_reference_missing');
        await this.mutateAsset(input.assetId, ownerId, record => ({ ...record,
          references: { ...record.references, [input.reference.kind]: { ...record.references?.[input.reference.kind], [input.reference.id]: true } },
          updatedAt: input.updatedAt, lastReferencedAt: input.updatedAt }));
      },
      markCommitted: async input => this.mutateAsset(input.assetId, ownerId, record => ({ ...record,
        canonicalAssetId: input.assetId, durableKey: input.durableKey, state: 'committed', committedAt: input.committedAt,
        updatedAt: input.committedAt, publicUrl: input.publicUrl })),
    };
    const objectStore: ListeningAssetCommitObjectStore = {
      getTempObject: key => this.snapshot(key, 12),
      getDurableObject: async key => {
        const cached = this.verifiedDurable.get(key);
        if (cached) return cached;
        const object = await this.snapshot(key);
        if (object) this.verifiedDurable.set(key, object);
        return object;
      },
      copyToDurable: async input => {
        const existing = await objectStore.getDurableObject(input.durableKey);
        if (existing) {
          if (existing.checksum !== input.checksum || existing.contentType !== input.contentType) fail('durable_verification_failed');
          return;
        }
        const source = await this.snapshot(input.sourceKey, maxBytes);
        if (!source || source.checksum !== input.checksum || source.contentType !== input.contentType) fail('temp_object_missing');
        this.verifiedDurable.delete(input.durableKey);
        await this.options.bucket!.put(input.durableKey, source.body!, { httpMetadata: { contentType: input.contentType } });
      },
      deleteTempObject: async key => { await this.options.bucket!.delete(key); },
    };
    return { registry, objectStore };
  }

  private async resolve(ownerId: string, section: ListeningAuthoringDocumentV1['audioSections'][number]) {
    const assetId = section.assetId ?? '';
    if (!identifier(ownerId) || !identifier(assetId)) fail('canonical_asset_required');
    const path = `media_assets/${assetId}`;
    const current = await this.options.rtdb.readWithEtag<ListeningMediaAssetRecord | null>(path);
    if (current.data) {
      if (current.data.ownerId !== ownerId || current.data.createdBy !== ownerId || current.data.assetId !== assetId) fail('asset_owner_mismatch');
      return current.data;
    }
    let url: URL;
    try { url = new URL(section.audioUrl || section.streamUrl || ''); } catch { return fail('upload_session_required'); }
    if (!this.options.publicUrl || url.origin !== new URL(this.options.publicUrl).origin) fail('upload_origin_mismatch');
    const segments = url.pathname.slice(1).split('/');
    const [prefix, kind, keyOwner, sessionId, fileName] = segments;
    if (segments.length !== 5 || prefix !== 'temp' || kind !== 'listening' || keyOwner !== ownerId
      || !identifier(sessionId) || !fileName.startsWith(`${assetId}-`)) fail('upload_key_mismatch');
    const session = await this.options.rtdb.readValue(`media_asset_upload_sessions/${ownerId}/${sessionId}`) as ListeningUploadSessionRecord | null;
    if (!session || session.ownerId !== ownerId || session.createdBy !== ownerId || session.uploadSessionId !== sessionId
      || session.purpose !== 'listening-authoring' || session.status !== 'active'
      || !Number.isFinite(session.maxEligibilityExpiresAt) || session.maxEligibilityExpiresAt <= this.options.now()
      || session.assetIds?.[assetId] !== true) fail('upload_session_invalid');
    const request = Object.values(session.assetRequests ?? {}).find(asset => asset.assetId === assetId);
    const tempKey = segments.join('/');
    if (!request || request.tempKey !== tempKey || fileName !== `${assetId}-${request.sanitizedFileName}`) fail('upload_key_mismatch');
    const actual = await this.snapshot(tempKey);
    if (!actual) fail('temp_object_missing');
    if (actual.sizeBytes !== request.sizeBytes || actual.contentType !== request.declaredMimeType) fail('upload_metadata_mismatch');
    const record = createListeningMediaAssetRecord({ assetId, ownerId, uploadSessionId: sessionId, tempKey,
      contentType: actual.contentType, sizeBytes: actual.sizeBytes, checksum: actual.checksum,
      createdAt: this.options.now(), createdBy: ownerId });
    if (await this.options.rtdb.writeIfMatch(path, record, current.etag)) return record;
    const concurrent = await this.options.rtdb.readValue(path) as ListeningMediaAssetRecord | null;
    if (!concurrent || concurrent.ownerId !== ownerId || concurrent.assetId !== assetId
      || concurrent.uploadSessionId !== sessionId || concurrent.tempKey !== tempKey || concurrent.checksum !== actual.checksum) fail('asset_identity_conflict');
    return concurrent;
  }

  async prepare(ownerId: string, document: ListeningAuthoringDocumentV1, reference: ListeningAssetCommitReference): Promise<PreparedListeningDocument> {
    const assets: PreparedAsset[] = [];
    const audioSections = [];
    for (const section of document.audioSections) {
      if (!section.assetId && !section.audioUrl && !section.streamUrl) { audioSections.push(section); continue; }
      if (!this.options.publicUrl) fail('asset_public_url_unavailable');
      try {
        const url = new URL(this.options.publicUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('asset_public_url_invalid');
      } catch { fail('asset_public_url_invalid'); }
      const record = await this.resolve(ownerId, section);
      const fileName = record.tempKey.split('/').pop()!.slice(record.assetId.length + 1);
      const input: ListeningAssetCommitInput = { ownerId, assetId: record.assetId, uploadSessionId: record.uploadSessionId,
        fileName, declaredMimeType: record.contentType, expectedChecksum: record.checksum,
        activeAudioFileCount: document.audioSections.length, reference, now: this.options.now(),
        publicBaseUrl: this.options.publicUrl };
      const prepared = await prepareListeningMediaAsset(input, this.adapters(ownerId));
      assets.push({ input, prepared });
      audioSections.push({ ...section, audioUrl: prepared.audioUrl, streamUrl: prepared.streamUrl });
    }
    return { document: { ...document, audioSections }, assets };
  }

  async finalize(prepared: PreparedListeningDocument) {
    for (const asset of prepared.assets) await finalizeListeningMediaAsset(asset.input, asset.prepared, this.adapters(asset.input.ownerId));
  }

  async verifyCommittedAudio(record: Record<string, any>): Promise<void> {
    const object = this.verifiedDurable.get(record.durableKey) ?? await this.snapshot(record.durableKey);
    if (!object || object.checksum !== record.checksum || object.sizeBytes !== record.sizeBytes
      || object.contentType !== record.contentType) fail('durable_verification_failed');
  }
}
