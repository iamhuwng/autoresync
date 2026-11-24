import { LISTENING_AUTHORING_PATHS } from '../../../../functions/src/listening-authoring/constants.ts';
import { supportsTestAudio, type AudioTestType } from '../../../../src/config/testTypeCapabilities.ts';
import { DRAFT_AUDIO_ASSET_ID, type AudioAssetRecord } from '../../../../src/types/assessmentAudio.types.ts';
// @ts-ignore JavaScript module has no declaration file.
import { isApprovedLocalAppOrigin, isApprovedOrigin } from '../cors-policy.js';
import type { createAudioCredentialStore, CredentialStoreEnv } from './credential-store.ts';
import { fail, readJson, record } from './protocol.ts';

type Store = ReturnType<typeof createAudioCredentialStore>;
type Asset = Extract<AudioAssetRecord, { storageProvider: 'b2' }>;

const PRODUCTION_APP_ORIGINS = new Set(['https://kahut1.web.app', 'https://hocthem.net']);

export interface DraftAudioEnv extends CredentialStoreEnv {
  readonly EXTERNAL_AUDIO_DRAFTS_ENABLED?: string;
  readonly EXTERNAL_AUDIO_PRIVATE_HOMEWORK_ENABLED?: string;
  readonly EXTERNAL_AUDIO_PUBLIC_LISTENING_ENABLED?: string;
  readonly EXTERNAL_AUDIO_THCS_ENABLED?: string;
  readonly EXTERNAL_AUDIO_UPLOAD_ROLLOUT?: string;
  readonly EXTERNAL_AUDIO_UPLOAD_ROLLBACK?: string;
  readonly EXTERNAL_AUDIO_PLAYBACK_QA_TTL_SECONDS?: string;
  readonly FIRESTORE_EMULATOR_URL?: string;
  readonly FIREBASE_DB_URL?: string;
}

export interface DraftAudioTarget {
  readonly testType: AudioTestType;
  readonly draftId: string;
  readonly sectionId: string;
}

const targetId = /^[A-Za-z0-9_-]{1,128}$/u;
const localEndpoint = /^http:\/\/localhost:[1-9][0-9]{1,4}$/u;

export function externalAudioDraftsEnabled(env: DraftAudioEnv, request: Request) {
  if (env.EXTERNAL_AUDIO_ROUTES_ENABLED !== 'enabled' || env.EXTERNAL_AUDIO_DRAFTS_ENABLED !== 'enabled') return false;
  const origin = request.headers.get('Origin');
  if (env.EXTERNAL_AUDIO_ENVIRONMENT === 'local') {
    return env.FIREBASE_PROJECT_ID === 'demo-luyentap-local'
      && localEndpoint.test(env.FIREBASE_DATABASE_EMULATOR_URL ?? '')
      && isApprovedLocalAppOrigin(origin, env);
  }
  if (env.EXTERNAL_AUDIO_ENVIRONMENT === 'production') {
    return env.FIREBASE_PROJECT_ID === 'temp-a1437'
      && !env.FIREBASE_DATABASE_EMULATOR_URL
      && typeof origin === 'string' && PRODUCTION_APP_ORIGINS.has(origin);
  }
  if (env.EXTERNAL_AUDIO_ENVIRONMENT === 'qualification') {
    return env.FIREBASE_PROJECT_ID === 'luyentap-pdf-qa-20261021'
      && !env.FIREBASE_DATABASE_EMULATOR_URL
      && isApprovedOrigin(origin, env);
  }
  return false;
}

/** Adoption is independently reversible while existing playback remains available. */
export function externalAudioAdoptionEnabled(env: DraftAudioEnv) {
  return env.EXTERNAL_AUDIO_UPLOAD_ROLLOUT !== 'disabled' && env.EXTERNAL_AUDIO_UPLOAD_ROLLBACK !== 'enabled';
}

export function externalAudioPrivateHomeworkEnabled(env: DraftAudioEnv, request: Request) {
  return env.EXTERNAL_AUDIO_PRIVATE_HOMEWORK_ENABLED === 'enabled' && externalAudioDraftsEnabled(env, request);
}

export function externalAudioPublicListeningEnabled(env: DraftAudioEnv, request: Request) {
  return env.EXTERNAL_AUDIO_PUBLIC_LISTENING_ENABLED === 'enabled' && externalAudioDraftsEnabled(env, request);
}

export function externalAudioThcsEnabled(env: DraftAudioEnv, request: Request) {
  if (env.EXTERNAL_AUDIO_THCS_ENABLED !== 'enabled' || !externalAudioDraftsEnabled(env, request)) return false;
  if (env.EXTERNAL_AUDIO_ENVIRONMENT === 'local') {
    return env.FIREBASE_DB_URL === env.FIREBASE_DATABASE_EMULATOR_URL
      && localEndpoint.test(env.FIRESTORE_EMULATOR_URL ?? '');
  }
  return !env.FIRESTORE_EMULATOR_URL && !env.FIREBASE_DATABASE_EMULATOR_URL;
}

function resolveFirestoreTarget(env: DraftAudioEnv): { origin: string; projectId: string } {
  if (env.EXTERNAL_AUDIO_ENVIRONMENT === 'local') {
    const origin = env.FIRESTORE_EMULATOR_URL;
    if (env.FIREBASE_PROJECT_ID !== 'demo-luyentap-local' || !origin || !localEndpoint.test(origin)) {
      fail('store_unavailable');
    }
    return { origin, projectId: 'demo-luyentap-local' };
  }
  if (env.EXTERNAL_AUDIO_ENVIRONMENT === 'production' && env.FIREBASE_PROJECT_ID === 'temp-a1437' && !env.FIRESTORE_EMULATOR_URL) {
    return { origin: 'https://firestore.googleapis.com', projectId: 'temp-a1437' };
  }
  if (env.EXTERNAL_AUDIO_ENVIRONMENT === 'qualification' && env.FIREBASE_PROJECT_ID === 'luyentap-pdf-qa-20261021' && !env.FIRESTORE_EMULATOR_URL) {
    return { origin: 'https://firestore.googleapis.com', projectId: 'luyentap-pdf-qa-20261021' };
  }
  return fail('store_unavailable');
}

export function parseDraftAudioTarget(body: Record<string, unknown>): DraftAudioTarget {
  const { testType, draftId, sectionId } = body;
  if (!supportsTestAudio(testType, 'section') || typeof draftId !== 'string' || !targetId.test(draftId)
    || typeof sectionId !== 'string' || !targetId.test(sectionId)) fail('invalid_request');
  return { testType: testType as AudioTestType, draftId, sectionId };
}

export async function assertDraftAudioTarget(
  target: DraftAudioTarget,
  uid: string,
  env: DraftAudioEnv,
  request: Request,
  readAppValue: (path: string) => Promise<unknown>,
  fetchImpl: typeof fetch,
) {
  if (target.testType === 'ielts-listening') {
    const draft = record(await readAppValue(`${LISTENING_AUTHORING_PATHS.drafts}/${target.draftId}`)
      ?? await readAppValue(`${LISTENING_AUTHORING_PATHS.revisionDrafts}/${target.draftId}`));
    const sections = record(draft.document).audioSections;
    if (draft.ownerId !== uid || draft.state !== 'active' || !Array.isArray(sections)
      || sections.filter((section) => String(record(section).number) === target.sectionId).length !== 1) {
      fail('draft_audio_not_found');
    }
    return;
  }
  if (target.testType !== 'thcs-thpt') fail('invalid_request');

  const { draft } = await readThcsAudioDraft(target.draftId, uid, env, request, fetchImpl);
  if (!Array.isArray(draft.sections) || draft.sections.filter((section) => record(section).id === target.sectionId).length !== 1) {
    fail('draft_audio_not_found');
  }
}

function decode(value: unknown): unknown {
  const field = record(value);
  if ('stringValue' in field) return field.stringValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('mapValue' in field) return decodeFields(record(field.mapValue).fields);
  const entries = record(field.arrayValue).values;
  if ('arrayValue' in field) return Array.isArray(entries) ? entries.map(decode) : [];
  return null;
}

function decodeFields(fields: unknown) {
  return Object.fromEntries(Object.entries(record(fields)).map(([key, value]) => [key, decode(value)]));
}

export async function readThcsAudioDraft(
  draftId: string, uid: string, env: DraftAudioEnv, request: Request, fetchImpl: typeof fetch,
) {
  if (!targetId.test(draftId)) fail('invalid_request');
  // Firebase evaluates the signed-in caller's owner-only rules.
  const { origin, projectId } = resolveFirestoreTarget(env);
  const authorization = request.headers.get('Authorization');
  if (!authorization) fail('store_unavailable');
  const response = await fetchImpl.call(globalThis,
    `${origin}/v1/projects/${projectId}/databases/(default)/documents/thcs_drafts/${draftId}`, {
      headers: { Authorization: authorization },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
  if (!response.ok) {
    await response.body?.cancel();
    fail([401, 403, 404].includes(response.status) ? 'draft_audio_not_found' : 'store_unavailable');
  }
  const result = record(await readJson(response, 2_000_000, 'store_unavailable'));
  const draft = decodeFields(result.fields);
  if (draft.userId !== uid || draft.testType !== 'THCS-THPT' ||
    (!['editing', 'review'].includes(String(draft.status)) &&
      !(draft.status === 'published' && externalAudioThcsEnabled(env, request)))) fail('draft_audio_not_found');
  return { draft, updateTime: result.updateTime };
}

export async function readThcsDraftRecordingReferences(
  ownerId: string, env: DraftAudioEnv, bearer: string, fetchImpl: typeof fetch,
) {
  const { origin, projectId } = resolveFirestoreTarget(env);
  const response = await fetchImpl.call(globalThis,
    `${origin}/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
      method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: 'thcs_drafts' }],
        select: { fields: [{ fieldPath: 'status' }, { fieldPath: 'sections' }] },
        where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: ownerId } } },
      } }),
      redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
  if (!response.ok) {
    await response.body?.cancel();
    fail('store_unavailable');
  }
  const rows = await readJson(response, 4_000_000, 'store_unavailable');
  if (!Array.isArray(rows)) fail('store_unavailable');
  return rows.flatMap((row) => {
    const document = record(row).document;
    return document ? [decodeFields(record(document).fields)] : [];
  });
}

export async function readAudioHomeworkVersions(
  ids: readonly string[], env: DraftAudioEnv, bearer: string, fetchImpl: typeof fetch,
) {
  const { origin, projectId } = resolveFirestoreTarget(env);
  const db = `projects/${projectId}/databases/(default)/documents`;
  const versions = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    if (batch.some((id) => !targetId.test(id))) fail('store_unavailable');
    const response = await fetchImpl.call(globalThis, `${origin}/v1/${db}:batchGet`, {
      method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents: batch.map((id) => `${db}/homework_assignments/${id}`),
        mask: { fieldPaths: ['contentRef.contentKind', 'contentRef.version'] },
      }),
      redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      fail('store_unavailable');
    }
    const rows = await readJson(response, 1_000_000, 'store_unavailable');
    if (!Array.isArray(rows)) fail('store_unavailable');
    for (const row of rows) {
      const found = record(record(row).found);
      const id = typeof found.name === 'string' ? found.name.split('/').at(-1) : undefined;
      const content = record(decodeFields(found.fields).contentRef);
      if (id && batch.includes(id) && content.contentKind === 'thcs_test' && typeof content.version === 'string') {
        versions.set(id, content.version);
      }
    }
  }
  return versions;
}

export async function readDraftAudioAsset(store: Store, ownerId: string, target: DraftAudioTarget, assetId: string): Promise<Asset> {
  if (!DRAFT_AUDIO_ASSET_ID.test(assetId)) fail('invalid_request');
  const stored = record(await store.readDraftAsset(ownerId, assetId));
  const asset = record(stored.asset);
  if (stored.testType !== target.testType || stored.draftId !== target.draftId || stored.sectionId !== target.sectionId
    || asset.ownerId !== ownerId || asset.assetId !== assetId || asset.storageProvider !== 'b2') fail('draft_audio_not_found');
  return asset as unknown as Asset;
}
