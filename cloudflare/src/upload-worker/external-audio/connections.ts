import type { AudioAssetRecord } from '../../../../src/types/assessmentAudio.types.ts';
import { sameB2Scope, type B2Key, type B2Scope, type B2Selection, type BackblazeAudioSource } from './b2-source.ts';
import {
  MAX_CONNECTIONS_PER_OWNER, validConnectionLabel, type AudioConnection, type AudioCredentialStore, type OwnerConnections,
} from './credential-store.ts';
import { ExternalAudioError, fail, record } from './protocol.ts';
import {
  buildExternalAudioProxyUrl, createExternalAudioProxyToken, type ExternalAudioProxyConfig,
} from './proxy.ts';

type B2Asset = Extract<AudioAssetRecord, { storageProvider: 'b2' }>;
type CredentialsInput = B2Key & Pick<B2Scope, 'bucketName' | 'prefix'>;
type ConnectionOptions = {
  readonly store: AudioCredentialStore;
  readonly source: BackblazeAudioSource;
  readonly now: () => number;
  readonly proxy?: ExternalAudioProxyConfig;
  readonly readAppValue?: (path: string) => Promise<unknown>;
  readonly readThcsDrafts?: (ownerId: string) => Promise<readonly unknown[]>;
  readonly readHomeworkVersions?: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;
};

export type ExternalAudioImpact = {
  readonly connectionId: string;
  readonly linkedFileCount: number;
  readonly draftCount: number;
  readonly publishedCount: number;
  readonly publicTestCount: number;
  readonly homeworkCount: number;
  readonly resultCount: number;
  readonly cleanupEligible: boolean;
};

function audioReferences(value: unknown, refs: Set<string> = new Set()): Set<string> {
  if (!value || typeof value !== 'object') return refs;
  if (Array.isArray(value)) {
    value.forEach((entry) => audioReferences(entry, refs));
    return refs;
  }
  const row = record(value);
  const ids = Array.isArray(row.assetIds) ? row.assetIds : Object.keys(record(row.assetIds));
  for (const field of [row.assetId, row.audioAssetId, row.assetRef, ...ids]) {
    if (typeof field === 'string') refs.add(field);
  }
  Object.values(row).forEach((entry) => audioReferences(entry, refs));
  return refs;
}

function forSource(value: unknown, connectionId: string, ownerId: string, assets: Map<string, string>) {
  for (const raw of Array.isArray(value) ? value : Object.values(record(value))) {
    const asset = record(raw);
    if (asset.connectionId === connectionId && asset.ownerId === ownerId && typeof asset.assetId === 'string'
      && typeof asset.objectKey === 'string' && typeof asset.providerVersionId === 'string') {
      assets.set(asset.assetId, JSON.stringify([asset.objectKey, asset.providerVersionId]));
    }
  }
}

function summary(state: OwnerConnections) {
  return {
    generation: state.generation,
    activeConnectionId: state.activeConnectionId ?? null,
    connections: Object.values(state.connections ?? {}).map(({ id, label, scope, state, checkedAt, lastSuccessfulAt, health }) => ({
      id, ...(label ? { label } : {}), bucketName: scope.bucketName, prefix: scope.prefix, state, checkedAt, lastSuccessfulAt: lastSuccessfulAt ?? (health === 'healthy' ? checkedAt : undefined), health,
    })),
  };
}

function find(state: OwnerConnections, connectionId: string, activeOnly: boolean) {
  const connections = state.connections ?? {};
  const connection = Object.hasOwn(connections, connectionId) ? connections[connectionId] : undefined;
  if (!connection) fail('connection_not_found');
  if (connection.state === 'revoked') fail('revoked_connection');
  if (activeOnly && (connection.state !== 'active' || connectionId !== state.activeConnectionId)) fail('archived_connection');
  return connection;
}

export function createExternalAudioConnections({ store, source, now, proxy, readAppValue, readThcsDrafts, readHomeworkVersions }: ConnectionOptions) {
  const readyToWrite = async (ownerId: string, expectedGeneration: number) => {
    const snapshot = await store.read(ownerId);
    if (snapshot.value.generation !== expectedGeneration) fail('generation_conflict');
    return snapshot;
  };

  const seeConnection = async (ownerId: string, connectionId: string, activeOnly: boolean) => {
    const { value } = await store.read(ownerId);
    const connection = find(value, connectionId, activeOnly);
    return {
      connection,
      key: await store.open(ownerId, connection),
      generation: value.generation,
    };
  };

  // Linearize completed provider work against the latest connection state before granting access.
  const assertCurrent = async (ownerId: string, id: string, expectedGeneration: number, activeOnly: boolean) => {
    const { value } = await store.read(ownerId);
    find(value, id, activeOnly);
    if (value.generation !== expectedGeneration) fail('generation_conflict');
  };

  const row = async (ownerId: string, id: string, scope: B2Scope, key: B2Key, label?: string) => ({
    id, ...(label ? { label } : {}), scope, envelope: await store.seal(ownerId, id, scope, key), checkedAt: now(), health: 'healthy' as const,
  });

  const verify = (input: CredentialsInput) => source.verify(input, input.bucketName, input.prefix);

  const inspect = async (ownerId: string, connectionId: string, selection: B2Selection, expectedGeneration?: number) => {
    const { connection, generation, key } = await seeConnection(ownerId, connectionId, true);
    if (expectedGeneration !== undefined && generation !== expectedGeneration) fail('generation_conflict');
    const file = await source.inspect(key, connection.scope, selection);
    await assertCurrent(ownerId, connectionId, generation, true);
    return { file, bucketId: connection.scope.bucketId };
  };

  return {
    async connections(ownerId: string) {
      return summary((await store.read(ownerId)).value);
    },
    async impact(ownerId: string, id: string): Promise<ExternalAudioImpact> {
      const { value } = await store.read(ownerId);
      if (!Object.hasOwn(value.connections ?? {}, id)) fail('connection_not_found');
      if (!readAppValue) fail('store_unavailable');
      const [committed, authoring, tests, thcsVersions, homework, results, thcsResults, draftAssets, thcsDrafts] = await Promise.all([
        readAppValue('media_assets'), readAppValue('listening_authoring'), readAppValue('tests'),
        readAppValue('thcs_published_versions'), readAppValue('homework_test_access'), readAppValue('test_results'),
        readAppValue('thcs_result_audio'),
        store.readDraftAssets(ownerId),
        readThcsDrafts?.(ownerId) ?? [],
      ]);
      const assets = new Map<string, string>();
      forSource(committed, id, ownerId, assets);
      forSource(Object.values(record(draftAssets)).map((item) => record(item).asset), id, ownerId, assets);

      const files = new Set<string>();
      const usesConnection = (item: unknown) => {
        let linked = false;
        for (const ref of audioReferences(item)) {
          const key = assets.get(ref);
          if (key) { files.add(key); linked = true; }
        }
        return linked;
      };
      const listening = record(authoring);
      const drafts = [...Object.values(record(listening.drafts)), ...Object.values(record(listening.revision_drafts)), ...thcsDrafts]
        .filter((draft) => ['active', 'editing', 'review'].includes(String(record(draft).state ?? record(draft).status)));
      const draftCount = drafts.filter(usesConnection).length;
      const published = Object.entries(record(tests)).filter(([, test]) => record(test).state !== 'archived' && usesConnection(test));
      const publishedIds = new Set(published.map(([testId]) => testId));
      const versions = new Set<string>();
      for (const [versionId, version] of Object.entries(record(listening.versions))) {
        if (usesConnection(version)) versions.add(versionId);
      }
      const affectedThcsTests = new Set<string>();
      for (const [testId, test] of Object.entries(record(thcsVersions))) {
        for (const [versionId, version] of Object.entries(record(test))) {
          if (usesConnection(version)) {
            versions.add(versionId);
            affectedThcsTests.add(testId);
          }
        }
      }

      const homeworkIds = new Set<string>();
      const thcsHomework = new Set<string>();
      for (const [testId, test] of Object.entries(record(homework))) {
        for (const student of Object.values(record(test))) {
          for (const [homeworkId, grant] of Object.entries(record(student))) {
            const row = record(grant);
            if (usesConnection(row) || versions.has(String(row.versionId ?? row.materialVersionId))) homeworkIds.add(homeworkId);
            if (grant === true && (affectedThcsTests.has(testId) || publishedIds.has(testId))) thcsHomework.add(homeworkId);
          }
        }
      }
      if (thcsHomework.size && readHomeworkVersions) {
        const assignmentVersions = await readHomeworkVersions([...thcsHomework]);
        for (const [homeworkId, versionId] of assignmentVersions) {
          if (versions.has(versionId)) homeworkIds.add(homeworkId);
        }
      }
      const resultIds = new Set<string>();
      for (const dataset of [results, thcsResults]) {
        for (const [resultId, result] of Object.entries(record(dataset))) {
          const row = record(result);
          if (usesConnection(row) || versions.has(String(row.versionId ?? row.materialVersionId))) resultIds.add(resultId);
        }
      }
      return { connectionId: id, linkedFileCount: files.size, draftCount, publishedCount: published.length,
        publicTestCount: published.filter(([, test]) => record(test).isPublic === true).length, homeworkCount: homeworkIds.size,
        resultCount: resultIds.size, cleanupEligible: files.size === 0 };
    },
    async validate(ownerId: string, input: CredentialsInput) {
      await store.read(ownerId);
      const scope = await verify(input);
      return { bucketName: scope.bucketName, prefix: scope.prefix, health: 'healthy' as const };
    },
    async connect(ownerId: string, generation: number, input: CredentialsInput, switchFrom?: string, rawLabel?: string) {
      const label = rawLabel === undefined ? undefined : rawLabel.trim() || undefined;
      if (label !== undefined && !validConnectionLabel(label)) fail('invalid_request');
      const previous = await readyToWrite(ownerId, generation);
      const { activeConnectionId } = previous.value;
      if (activeConnectionId !== switchFrom) fail('generation_conflict');
      const prior = switchFrom ? find(previous.value, switchFrom, true) : undefined;
      const connections = { ...previous.value.connections };
      if (Object.keys(connections).length >= MAX_CONNECTIONS_PER_OWNER) {
        const oldestRevoked = Object.values(connections)
          .filter(({ state }) => state === 'revoked')
          .sort((left, right) => left.checkedAt - right.checkedAt)[0];
        if (!oldestRevoked) fail('connection_limit');
        delete connections[oldestRevoked.id];
      }
      const scope = await verify(input);
      if (Object.values(connections).some((existing) => existing.state !== 'revoked' && sameB2Scope(scope, existing.scope))) {
        fail('use_rotation');
      }
      const id = crypto.randomUUID();
      if (Object.hasOwn(connections, id)) fail('generation_conflict');
      if (prior) connections[prior.id] = { ...prior, state: 'archived' };
      connections[id] = { ...await row(ownerId, id, scope, input, label), state: 'active' };
      const next = { generation: generation + 1, activeConnectionId: id, connections };
      await store.replace(ownerId, previous, next);
      return summary(next);
    },
    async select(ownerId: string, id: string, generation: number) {
      const previous = await readyToWrite(ownerId, generation);
      const target = find(previous.value, id, false);
      if (target.state === 'active' && previous.value.activeConnectionId === id) return summary(previous.value);
      const connections = { ...previous.value.connections };
      const priorId = previous.value.activeConnectionId;
      if (priorId && priorId !== id && Object.hasOwn(connections, priorId)) {
        const prior = connections[priorId];
        if (prior.state === 'active') connections[priorId] = { ...prior, state: 'archived' };
      }
      connections[id] = { ...target, state: 'active' };
      const next = { generation: generation + 1, activeConnectionId: id, connections };
      await store.replace(ownerId, previous, next);
      return summary(next);
    },
    async rotate(ownerId: string, id: string, generation: number, input: B2Key) {
      const previous = await readyToWrite(ownerId, generation);
      const current = find(previous.value, id, false);
      const scope = await source.verify(input, current.scope.bucketName, current.scope.prefix);
      if (!sameB2Scope(scope, current.scope)) fail('rotation_scope_changed');
      const replacement: AudioConnection = { ...await row(ownerId, id, scope, input, current.label), state: current.state };
      const next = {
        ...previous.value, generation: generation + 1,
        connections: { ...previous.value.connections, [id]: replacement },
      };
      await store.replace(ownerId, previous, next);
      return summary(next);
    },
    async revoke(ownerId: string, id: string, generation: number) {
      const previous = await readyToWrite(ownerId, generation);
      const { label, scope, lastSuccessfulAt, checkedAt, health } = find(previous.value, id, false);
      const revoked: AudioConnection = { id, ...(label ? { label } : {}), scope, lastSuccessfulAt: lastSuccessfulAt ?? (health === 'healthy' ? checkedAt : undefined), state: 'revoked', checkedAt: now(), health: 'revoked_connection' };
      const next = {
        generation: generation + 1,
        activeConnectionId: previous.value.activeConnectionId === id ? undefined : previous.value.activeConnectionId,
        connections: { ...previous.value.connections, [id]: revoked },
      };
      await store.replace(ownerId, previous, next);
      return summary(next);
    },
    async cleanup(ownerId: string, id: string, generation: number) {
      const previous = await readyToWrite(ownerId, generation);
      const current = find(previous.value, id, false);
      if (current.state !== 'archived') fail('invalid_request');
      const linked = await this.impact(ownerId, id);
      if (!linked.cleanupEligible) fail('connection_in_use');
      const connections = { ...previous.value.connections };
      delete connections[id];
      const next = { ...previous.value, generation: generation + 1, connections };
      await store.replace(ownerId, previous, next);
      return summary(next);
    },
    async recheck(ownerId: string, id: string, generation: number) {
      const previous = await readyToWrite(ownerId, generation);
      const current = find(previous.value, id, false);
      const key = await store.open(ownerId, current);
      let health: AudioConnection['health'] = 'healthy';
      try {
        const scope = await source.verify(key, current.scope.bucketName, current.scope.prefix);
        if (!sameB2Scope(scope, current.scope)) fail('wrong_bucket');
      } catch (error) {
        if (!(error instanceof ExternalAudioError)) throw error;
        health = error.code;
      }
      const checkedAt = now();
      const lastSuccessfulAt = health === 'healthy' ? checkedAt
        : current.lastSuccessfulAt ?? (current.health === 'healthy' ? current.checkedAt : undefined);
      const next = {
        ...previous.value, generation: generation + 1,
        connections: { ...previous.value.connections, [id]: { ...current, checkedAt, lastSuccessfulAt, health } },
      };
      await store.replace(ownerId, previous, next);
      return summary(next);
    },
    async list(ownerId: string, id: string, prefix?: string, cursor?: string, filenamePrefix?: string) {
      const { connection, generation, key } = await seeConnection(ownerId, id, true);
      const page = await source.list(key, connection.scope, prefix ?? connection.scope.prefix, cursor, filenamePrefix);
      await assertCurrent(ownerId, id, generation, true);
      return page;
    },
    async inspect(ownerId: string, id: string, selection: B2Selection) {
      return (await inspect(ownerId, id, selection)).file;
    },
    async preview(ownerId: string, id: string, selection: B2Selection) {
      const { connection, generation, key } = await seeConnection(ownerId, id, true);
      const preview = await source.playback(key, connection.scope, selection, now);
      await assertCurrent(ownerId, id, generation, true);
      if (!proxy) return preview;
      const token = await createExternalAudioProxyToken(proxy.secret, {
        v: 1,
        ownerId,
        connectionId: id,
        bucketId: connection.scope.bucketId,
        objectKey: preview.file.objectKey,
        providerVersionId: preview.file.providerVersionId,
        contentType: preview.file.contentType,
        sizeBytes: preview.file.sizeBytes,
        expiresAt: preview.expiresAt,
      });
      return { ...preview, url: buildExternalAudioProxyUrl(proxy.origin, preview.file.providerVersionId, token) };
    },
    /** Prepare an exact, trusted attachment. The authoring workflow will own persistence. */
    async prepareAsset(ownerId: string, id: string, assetId: string, selection: B2Selection, expectedGeneration?: number): Promise<B2Asset> {
      const { file, bucketId } = await inspect(ownerId, id, selection, expectedGeneration);
      return { ...file, storageProvider: 'b2', ownerId, connectionId: id, assetId, bucketId, health: 'healthy' };
    },
    async verifyPinnedAsset(asset: B2Asset) {
      const { connection, generation, key } = await seeConnection(asset.ownerId, asset.connectionId, false);
      if (connection.scope.bucketId !== asset.bucketId) fail('wrong_bucket');
      const file = await source.inspect(key, connection.scope, asset);
      if (file.contentType !== asset.contentType || file.sizeBytes !== asset.sizeBytes) fail('object_changed');
      await assertCurrent(asset.ownerId, asset.connectionId, generation, false);
    },
    /** Only call with a trusted asset fetched after the app has authorized the test viewer. */
    async signPlayback(asset: B2Asset, ttlSeconds?: number) {
      const { ownerId, connectionId } = asset;
      const { connection, generation, key } = await seeConnection(ownerId, connectionId, false);
      if (connection.scope.bucketId !== asset.bucketId) fail('wrong_bucket');
      const { file, url, expiresAt } = await source.playback(key, connection.scope, asset, now, ttlSeconds);
      if (file.contentType !== asset.contentType || file.sizeBytes !== asset.sizeBytes) fail('object_changed');
      await assertCurrent(ownerId, connectionId, generation, false);
      if (!proxy) return { url, expiresAt };
      const token = await createExternalAudioProxyToken(proxy.secret, {
        v: 1,
        ownerId,
        connectionId,
        bucketId: asset.bucketId,
        objectKey: file.objectKey,
        providerVersionId: file.providerVersionId,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        expiresAt,
      });
      return { url: buildExternalAudioProxyUrl(proxy.origin, file.providerVersionId, token), expiresAt };
    },
  };
}
