import { BackblazeAudioSource } from './b2-source.ts';
import { createExternalAudioConnections } from './connections.ts';
import { createAudioCredentialStore } from './credential-store.ts';
import {
  assertDraftAudioTarget, externalAudioAdoptionEnabled, externalAudioDraftsEnabled, parseDraftAudioTarget, readAudioHomeworkVersions, readDraftAudioAsset, readThcsDraftRecordingReferences, type DraftAudioEnv,
} from './draft-assets.ts';
import { CONNECTION_ID, ExternalAudioError, fail, OWNER_ID, readJson, record } from './protocol.ts';
import { resolveExternalAudioProxyConfig, type ExternalAudioProxyEnv } from './proxy.ts';
import { handleThcsAudio, type ThcsAudioAction } from './thcs.ts';
import { getFirebaseServiceAccountAccessToken, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

const groups = {
  connections: 'credentials',
  impact: 'credentials',
  'admin-health': 'credentials',
  'admin-impact': 'credentials',
  validate: 'credentials',
  connect: 'credentials',
  recheck: 'credentials',
  rotate: 'credentials',
  select: 'credentials',
  switch: 'credentials',
  revoke: 'credentials',
  cleanup: 'credentials',
  list: 'browse',
  inspect: 'browse',
  preview: 'preview',
  'attach-draft': 'browse',
  'preview-draft': 'preview',
  'draft-recording': 'browse',
  'validate-thcs-draft': 'browse',
  'publish-thcs': 'publish',
  'play-thcs': 'playback',
  'read-thcs': 'playback',
  'retain-thcs-result': 'publish',
  'submit-thcs-course': 'publish',
} as const;

type Action = keyof typeof groups;

export function resolveExternalAudioRoute(path: string) {
  if (!path.startsWith('/external-audio/')) return;
  const action = path.slice('/external-audio/'.length) as Action;
  if (Object.hasOwn(groups, action)) return {
    action, draftOnly: draftActions.has(action), thcsOnly: thcsActions.has(action), limiterGroup: `external-audio:${groups[action]}`,
  };
}

const changesConnection = new Set<Action>(['connect', 'recheck', 'rotate', 'select', 'switch', 'revoke', 'cleanup']);
const draftActions = new Set<Action>(['attach-draft', 'preview-draft', 'draft-recording']);
const thcsActions = new Set<Action>(['validate-thcs-draft', 'publish-thcs', 'play-thcs', 'read-thcs', 'retain-thcs-result', 'submit-thcs-course']);
const draftFields = ['testType', 'draftId', 'sectionId'];

function exactFields(body: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (!required.every((field) => Object.hasOwn(body, field))
    || Object.keys(body).some((field) => !required.includes(field) && !optional.includes(field))) fail('invalid_request');
}

function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string') fail('invalid_request');
  return value;
}

function connectionId(body: Record<string, unknown>): string {
  const value = stringField(body, 'connectionId');
  if (!CONNECTION_ID.test(value)) fail('invalid_request');
  return value;
}

function generation(body: Record<string, unknown>): number {
  const value = body.generation;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('invalid_request');
  return value;
}

function keyFields(body: Record<string, unknown>) {
  return { applicationKeyId: stringField(body, 'applicationKeyId'), applicationKey: stringField(body, 'applicationKey') };
}

function credentials(body: Record<string, unknown>) {
  return { ...keyFields(body), bucketName: stringField(body, 'bucketName'), prefix: stringField(body, 'prefix') };
}

function selection(body: Record<string, unknown>) {
  return { objectKey: stringField(body, 'objectKey'), providerVersionId: stringField(body, 'providerVersionId') };
}

export async function handleExternalAudioRoute(input: {
  request: Request;
  env: DraftAudioEnv & RepositoryEnv & ExternalAudioProxyEnv;
  uid: string;
  action: Action;
  now: () => number;
  readAppValue: (path: string) => Promise<unknown>;
}, fetchImpl: typeof fetch = globalThis.fetch) {
  const { request, env, uid, action, now, readAppValue } = input;
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  try {
    if (draftActions.has(action) && !externalAudioDraftsEnabled(env, request)) fail('draft_audio_not_found');
    if (action === 'attach-draft' && !externalAudioAdoptionEnabled(env)) fail('draft_audio_not_found');
    if ((action === 'connect' || action === 'switch') && !externalAudioAdoptionEnabled(env)) fail('store_unavailable');
    if (!OWNER_ID.test(uid)) fail('teacher_required');
    if (thcsActions.has(action)) {
      if (new URL(request.url).search || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail('invalid_request');
      const body = record(await readJson(request, action === 'submit-thcs-course' ? 256 * 1024 : 8192, 'invalid_request'));
      return { body: await handleThcsAudio(action as ThcsAudioAction, { ...input, env: { ...env } }, body, fetchImpl), init: { headers } };
    }
    const store = createAudioCredentialStore(env, fetchImpl);
    const profile = record(await readAppValue(`users/${uid}`));
    if ((profile.role !== 'teacher' && profile.role !== 'super_admin') || profile.forceReauth === true
      || profile.disabled === true || ['blocked', 'disabled', 'inactive', 'suspended'].includes(String(profile.status))) fail('teacher_required');
    const assertNotRestoring = async () => {
      const restoring = await readAppValue('system_flags/restore_in_progress');
      if (restoring === true || record(restoring).active === true) fail('restore_in_progress');
    };
    if (changesConnection.has(action) || action === 'attach-draft') await assertNotRestoring();
    if (new URL(request.url).search || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      fail('invalid_request');
    }
    const payload = await readJson(request, 8192, 'invalid_request');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('invalid_request');
    const body = record(payload);
    const service = createExternalAudioConnections({
      store, source: new BackblazeAudioSource(fetchImpl), now, readAppValue,
      proxy: resolveExternalAudioProxyConfig(env),
      readThcsDrafts: async (ownerId) => {
        if (env.EXTERNAL_AUDIO_THCS_ENABLED !== 'enabled') return [];
        if (env.EXTERNAL_AUDIO_ENVIRONMENT === 'local' && !env.FIRESTORE_EMULATOR_URL) return [];
        const authorization = ownerId === uid ? request.headers.get('Authorization')
          : `Bearer ${await getFirebaseServiceAccountAccessToken(env, fetchImpl)}`;
        if (!authorization) fail('store_unavailable');
        return readThcsDraftRecordingReferences(ownerId, env, authorization, fetchImpl);
      },
      readHomeworkVersions: async (ids) => {
        const token = await getFirebaseServiceAccountAccessToken(env, fetchImpl);
        return readAudioHomeworkVersions(ids, env, `Bearer ${token}`, fetchImpl);
      },
    });
    let result: unknown;
    switch (action) {
      case 'connections':
        exactFields(body, []);
        result = await service.connections(uid);
        break;
      case 'impact':
        exactFields(body, ['connectionId']);
        result = await service.impact(uid, connectionId(body));
        break;
      case 'admin-impact': {
        exactFields(body, ['ownerId', 'connectionId']);
        if (profile.role !== 'super_admin') fail('teacher_required');
        const ownerId = stringField(body, 'ownerId');
        if (!OWNER_ID.test(ownerId)) fail('invalid_request');
        result = await service.impact(ownerId, connectionId(body));
        break;
      }
      case 'admin-health':
        exactFields(body, []);
        if (profile.role !== 'super_admin') fail('teacher_required');
        result = { generatedAt: now(), connections: Object.entries(await store.readAll()).flatMap(([ownerId, state]) =>
          Object.values(state.connections ?? {}).map(({ id, label, scope, state: connectionState, checkedAt, lastSuccessfulAt, health }) => ({
            ownerId, id, ...(label ? { label } : {}), bucketName: scope.bucketName, prefix: scope.prefix, state: connectionState, checkedAt, lastSuccessfulAt: lastSuccessfulAt ?? (health === 'healthy' ? checkedAt : undefined), health,
          }))) };
        break;
      case 'validate':
        exactFields(body, ['applicationKeyId', 'applicationKey', 'bucketName', 'prefix']);
        result = await service.validate(uid, credentials(body));
        break;
      case 'connect':
      case 'switch':
        exactFields(body, [
          'applicationKeyId', 'applicationKey', 'bucketName', 'prefix', 'generation',
          ...(action === 'switch' ? ['connectionId'] : []),
        ], ['label']);
        result = await service.connect(
          uid,
          generation(body),
          credentials(body),
          action === 'switch' ? connectionId(body) : undefined,
          body.label === undefined ? undefined : stringField(body, 'label'),
        );
        break;
      case 'rotate':
        exactFields(body, ['applicationKeyId', 'applicationKey', 'connectionId', 'generation']);
        result = await service.rotate(uid, connectionId(body), generation(body), keyFields(body));
        break;
      case 'select':
      case 'recheck':
      case 'revoke':
      case 'cleanup':
        exactFields(body, ['connectionId', 'generation']);
        result = await service[action](uid, connectionId(body), generation(body));
        break;
      case 'list':
        exactFields(body, ['connectionId'], ['prefix', 'cursor', 'filenamePrefix']);
        result = await service.list(uid, connectionId(body),
          body.prefix === undefined ? undefined : stringField(body, 'prefix'),
          body.cursor === undefined ? undefined : stringField(body, 'cursor'),
          body.filenamePrefix === undefined ? undefined : stringField(body, 'filenamePrefix'));
        break;
      case 'inspect':
      case 'preview':
        exactFields(body, ['connectionId', 'objectKey', 'providerVersionId']);
        result = await service[action](uid, connectionId(body), selection(body));
        break;
      case 'attach-draft': {
        exactFields(body, [...draftFields, 'connectionId', 'generation', 'objectKey', 'providerVersionId']);
        const target = parseDraftAudioTarget(body);
        const assertTarget = () => assertDraftAudioTarget(target, uid, env, request, readAppValue, fetchImpl);
        await assertTarget();
        const assetId = crypto.randomUUID();
        const expectedGeneration = generation(body);
        const asset = await service.prepareAsset(uid, connectionId(body), assetId, selection(body), expectedGeneration);
        await assertTarget();
        await assertNotRestoring();
        await store.writeDraftAsset(uid, assetId, { ...target, asset });
        if ((await store.read(uid)).value.generation !== expectedGeneration) fail('generation_conflict');
        result = { assetId, scope: 'section' };
        break;
      }
      case 'draft-recording':
      case 'preview-draft': {
        exactFields(body, [...draftFields, 'assetId']);
        const target = parseDraftAudioTarget(body);
        await assertDraftAudioTarget(target, uid, env, request, readAppValue, fetchImpl);
        const asset = await readDraftAudioAsset(store, uid, target, stringField(body, 'assetId'));
        result = action === 'draft-recording'
          ? { filename: asset.objectKey.split('/').at(-1), lastModifiedAt: asset.lastModifiedAt }
          : await service.signPlayback(asset);
        break;
      }
    }
    return { body: result, init: { headers } };
  } catch (error) {
    return {
      body: { error: error instanceof ExternalAudioError ? error.code : 'store_unavailable' },
      init: { status: error instanceof ExternalAudioError ? error.status : 503, headers },
    };
  }
}
