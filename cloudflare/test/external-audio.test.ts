import { decodeJwt, exportPKCS8, generateKeyPair } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BackblazeAudioSource } from '../src/upload-worker/external-audio/b2-source.ts';
import { createAudioCredentialStore } from '../src/upload-worker/external-audio/credential-store.ts';
import { createExternalAudioConnections } from '../src/upload-worker/external-audio/connections.ts';
import { createUploadWorker } from '../worker.js';
import { createExternalPlaybackRefresh, verifyExternalPlaybackRefresh } from '../src/upload-worker/listening-delivery.ts';

const now = () => 1_800_000_000_000;
const appDatabase = 'https://luyentap-pdf-qa-20261021-default-rtdb.asia-southeast1.firebasedatabase.app';
const storeProject = 'fixture-external-audio-qa';
const storeHost = `${storeProject}-default-rtdb.firebaseio.com`;
const apiHost = 'api004.backblazeb2.com';
const s3Host = 's3.us-west-004.backblazeb2.com';
const storeIdentity = `external-audio-worker@${storeProject}.iam.gserviceaccount.com`;
const oauthToken = 'test-only-dedicated-oauth';
const accountToken = 'test-only-native-account-token';
const file = {
  accountId: 'account-1', bucketId: 'bucket-1', action: 'upload',
  fileName: "shared/Term 1/ Chào + 100%25 #take's?.mp3",
  fileId: '4_zbucket1_fversion1', contentType: 'audio/mpeg', contentLength: 12_345,
};
const credentials = {
  applicationKeyId: 'test-original-key-id', applicationKey: 'test-original-secret',
  bucketName: 'teacher-archive', prefix: 'shared/',
};
const replacement = { applicationKeyId: 'test-rotate-key-id', applicationKey: 'test-rotate-secret' };
const selection = { objectKey: file.fileName, providerVersionId: file.fileId };
const encryptionKey = (fill: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)));
const keyring = (active = 'v1', environment = 'qualification') => JSON.stringify({
  environment, active, keys: { v1: encryptionKey(1), v2: encryptionKey(2) },
});
let privateKey: string;

beforeAll(async () => {
  privateKey = await exportPKCS8((await generateKeyPair('RS256', { extractable: true })).privateKey);
});

afterEach(() => vi.restoreAllMocks());

it('binds the THCS refresh handle to each scope field and expiry', async () => {
  const scope = ['thcs-external-audio', 'student-1', 'test-1', 'version-1', 'section-1', 'asset-1', 'homework-1', 'attempt-1'];
  const env = { LISTENING_DELIVERY_SECRET: 'test-only-hmac-for-external-playback' };
  const handle = await createExternalPlaybackRefresh(env, scope, now());
  expect(await verifyExternalPlaybackRefresh(env, scope, now() + 5_000, handle)).toBe(true);
  for (const index of scope.keys()) {
    const changed = scope.map((field, fieldIndex) => fieldIndex === index ? 'different' : field);
    expect(await verifyExternalPlaybackRefresh(env, changed, now() + 5_000, handle)).toBe(false);
  }
  expect(await verifyExternalPlaybackRefresh(env, scope, now() + 3_600_000, handle)).toBe(false);
});

function fixture(localDrafts = false) {
  const project = localDrafts ? 'fixture-external-audio-local' : storeProject;
  const host = `${project}-default-rtdb.firebaseio.com`;
  const listeningDraft = { ownerId: 'owner-1', state: 'active', document: { audioSections: [{ number: 1 }, { number: 2 }] } };
  const snapshots = new Map<string, { etag: string; body: string }>();
  const providerRequests: URL[] = [];
  const databaseRequests: Request[] = [];
  const appValues = new Map<string, unknown>();
  const rateKeys: string[] = [];
  const profiles: Record<string, unknown> = {
    'owner-1': { role: 'teacher' }, 'owner-2': { role: 'super_admin' },
    'student-1': { role: 'student' }, 'student-2': { role: 'student' }, 'disabled-1': { role: 'teacher', disabled: true },
  };
  const behavior = {
    capabilities: ['listBuckets', 'listFiles', 'readFiles'],
    partnerCapabilities: [] as string[],
    bucketType: 'allPrivate',
    providerHost: apiHost,
    wrongScope: false,
    badKey: false,
    nextFileName: 'shared/zzz.mp3' as string | null,
    metadata: file,
    rangeVersion: file.fileId,
    namePrefix: 'shared/' as string | null,
    providerStatus: 0,
    restoring: false,
    rateLimited: false,
    beforeAuthorization: async (_authorization: string) => {},
    beforeRange: async () => {},
  };
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    expect(request.redirect).toBe('manual');
    if (url.hostname === 'oauth2.googleapis.com') {
      const assertion = (await request.formData()).get('assertion');
      expect(typeof assertion === 'string' && decodeJwt(assertion).iss).toBe(`external-audio-worker@${project}.iam.gserviceaccount.com`);
      return Response.json({ access_token: oauthToken });
    }
    if (url.hostname === host) {
      databaseRequests.push(request.clone());
      expect(request.headers.get('Authorization')).toBe(`Bearer ${oauthToken}`);
      if (request.method === 'GET') {
        const current = snapshots.get(url.pathname) ?? { etag: 'null_etag', body: 'null' };
        if (url.pathname.startsWith('/external_audio_connections/')) expect(request.headers.get('X-Firebase-ETag')).toBe('true');
        return new Response(current.body, { headers: { ETag: current.etag } });
      }
      expect(request.method).toBe('PUT');
      const body = await request.text();
      const current = snapshots.get(url.pathname) ?? { etag: 'null_etag', body: 'null' };
      if (request.headers.get('If-Match') !== current.etag) return new Response(current.body, { status: 412 });
      snapshots.set(url.pathname, { etag: JSON.stringify(JSON.parse(body).generation), body });
      return new Response(body);
    }
    if (url.origin === 'http://localhost:8080') {
      if (url.pathname.endsWith('/documents:runQuery')) return Response.json([]);
      if (!url.pathname.endsWith('/thcs_drafts/thcs-1')) return new Response(null, { status: 404 });
      expect(request.headers.get('Authorization')).toMatch(/^Bearer owner-[12]$/u);
      return Response.json({ fields: {
        userId: { stringValue: 'owner-1' },
        testType: { stringValue: 'THCS-THPT' },
        status: { stringValue: 'editing' },
        sections: { arrayValue: { values: [{ mapValue: { fields: { id: { stringValue: 'section-1' } } } }] } },
      } });
    }
    providerRequests.push(url);
    if (url.hostname === 'api.backblazeb2.com') {
      const auth = request.headers.get('Authorization')!;
      expect(auth).toMatch(/^Basic /u);
      const key = atob(auth.slice(6));
      await behavior.beforeAuthorization(key);
      if (behavior.providerStatus === 302) {
        return new Response(null, { status: 302, headers: { Location: 'https://redirect.example/' } });
      }
      if (behavior.badKey || behavior.providerStatus) {
        return Response.json({ code: 'unauthorized', message: `private provider detail: ${key} ${accountToken}` },
          { status: behavior.providerStatus || 401 });
      }
      const switched = key.includes('test-other-key');
      const bucketName = switched ? 'second-archive' : credentials.bucketName;
      return Response.json({
        accountId: switched ? 'account-2' : 'account-1', authorizationToken: accountToken,
        apiInfo: { groupsApi: { capabilities: behavior.partnerCapabilities }, storageApi: {
          apiUrl: `https://${behavior.providerHost}`, s3ApiUrl: `https://${s3Host}`,
          allowed: {
            buckets: [{ id: switched ? 'bucket-2' : 'bucket-1', name: bucketName }],
            capabilities: behavior.capabilities, namePrefix: behavior.wrongScope ? 'shared-other/' : behavior.namePrefix,
          },
        } },
      });
    }
    if (url.hostname === apiHost) {
      expect(request.headers.get('Authorization')).toBe(accountToken);
      if (url.pathname.endsWith('/b2_list_buckets')) {
        expect(request.method).toBe('POST');
        const { accountId, bucketId } = await request.json() as { accountId: string; bucketId: string };
        return Response.json({
          buckets: [{ accountId, bucketId, bucketName: bucketId === 'bucket-1' ? credentials.bucketName : 'second-archive',
            bucketType: behavior.bucketType }],
        });
      }
      if (url.pathname.endsWith('/b2_list_file_names')) {
        expect(url.searchParams.get('maxFileCount')).toBe('50');
        const cursor = url.searchParams.get('startFileName');
        return Response.json({
          files: cursor ? [{ ...file, fileName: cursor }] : [
            file, { ...file, fileName: 'shared/worksheet.pdf', contentType: 'application/pdf' },
          ],
          nextFileName: cursor ? null : behavior.nextFileName,
        });
      }
      if (url.pathname.endsWith('/b2_get_file_info')) {
        if (url.searchParams.get('fileId') === 'missing-file') {
          return Response.json({ code: 'file_not_present', message: accountToken }, { status: 400 });
        }
        return Response.json(behavior.metadata);
      }
    }
    if (url.hostname === s3Host) {
      expect(request.headers.get('Authorization')).toBeNull();
      expect(request.headers.get('Range')).toBe('bytes=0-0');
      await behavior.beforeRange();
      return new Response(new Uint8Array([0]), {
        status: 206,
        headers: {
          'x-amz-version-id': behavior.rangeVersion,
          'Content-Range': `bytes 0-0/${file.contentLength}`,
          'Content-Length': '1',
        },
      });
    }
    throw new Error('unexpected test network target');
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
  const env = {
    EXTERNAL_AUDIO_ROUTES_ENABLED: 'enabled', EXTERNAL_AUDIO_ENVIRONMENT: 'qualification',
    EXTERNAL_AUDIO_STORE_PROJECT_ID: storeProject, EXTERNAL_AUDIO_STORE_DATABASE_URL: `https://${storeHost}`,
    EXTERNAL_AUDIO_ENCRYPTION_KEYRING: keyring(),
    EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT: JSON.stringify({
      project_id: storeProject, client_email: storeIdentity, private_key: privateKey,
    }),
    FIREBASE_PROJECT_ID: 'luyentap-pdf-qa-20261021', FIREBASE_DB_URL: appDatabase,
    UPLOAD_RATE_LIMITER: { limit: async ({ key }: { key: string }) => {
      rateKeys.push(key);
      return { success: !behavior.rateLimited };
    } },
    readDatabaseValue: vi.fn(async (path: string) => appValues.has(path) ? appValues.get(path)
      : path === 'system_flags/restore_in_progress'
      ? behavior.restoring : path === 'listening_authoring/drafts/listening-1'
        ? listeningDraft : profiles[path.replace(/^users\//u, '')]),
    ...(localDrafts ? {
      EXTERNAL_AUDIO_ENVIRONMENT: 'local', EXTERNAL_AUDIO_DRAFTS_ENABLED: 'enabled',
      EXTERNAL_AUDIO_STORE_PROJECT_ID: project, EXTERNAL_AUDIO_STORE_DATABASE_URL: `https://${host}`,
      EXTERNAL_AUDIO_ENCRYPTION_KEYRING: keyring('v1', 'local'),
      EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT: JSON.stringify({
        project_id: project, client_email: `external-audio-worker@${project}.iam.gserviceaccount.com`, private_key: privateKey,
      }),
      FIREBASE_PROJECT_ID: 'demo-luyentap-local',
      FIREBASE_DATABASE_EMULATOR_URL: 'http://localhost:9000', FIRESTORE_EMULATOR_URL: 'http://localhost:8080',
    } : {}),
  };
  const worker = createUploadWorker({
    now,
    firebaseVerifier: { async verifyAuthorizationHeader(header: string | null) {
      const uid = header?.startsWith('Bearer ') ? header.slice(7) : '';
      return Object.hasOwn(profiles, uid) ? { valid: true, uid } : { valid: false };
    } },
  });
  const call = (action: string, body: unknown, uid = 'owner-1', overrides = {}) => worker.fetch(
    new Request(`http://localhost:5173/external-audio/${action}`, {
      method: 'POST', headers: { Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify(body),
    }),
    { ...env, ...overrides },
    undefined,
  );
  const connect = async () => {
    const response = await call('connect', { ...credentials, generation: 0 });
    expect(response.status).toBe(200);
    const state = await response.json() as { generation: number; activeConnectionId: string };
    return state.activeConnectionId;
  };
  const service = () => createExternalAudioConnections({
    store: createAudioCredentialStore(env), source: new BackblazeAudioSource(), now,
  });
  return { snapshots, providerRequests, databaseRequests, rateKeys, behavior, fetchMock, env, worker, call, connect, service, appValues };
}

async function expectError(response: Response, status: number, error: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
}

describe('external audio through the upload Worker entry', () => {
  it('gates THCS issuance and rechecks public access when renewing the exact publisher pin', async () => {
    const f = fixture(true);
    const connectionId = await f.connect();
    const target = { testType: 'thcs-thpt', draftId: 'thcs-1', sectionId: 'section-1' };
    const attached = await f.call('attach-draft', { ...target, connectionId, generation: 1, ...selection });
    expect(attached.status).toBe(200);
    const externalAudio = await attached.json() as { assetId: string };
    const scope = { testId: 'thcs-test', versionId: 'version-1', sectionId: target.sectionId, assetId: externalAudio.assetId };
    const test = { id: scope.testId, testType: 'THCS-THPT', externalAudioVersionId: scope.versionId, isComplete: true,
      publishedAt: now(), isPublic: true, ownerId: 'owner-1', sourceDraftId: target.draftId,
      sections: [{ id: target.sectionId, externalAudio }] };
    f.appValues.set('tests/thcs-test', test);
    f.appValues.set(`media_assets/${scope.assetId}`, {
      testType: 'thcs-thpt', assetId: scope.assetId, canonicalAssetId: scope.assetId, state: 'committed',
      storageProvider: 'b2', ownerId: 'owner-1', sectionId: target.sectionId, sourceDraftId: target.draftId,
      sizeBytes: file.contentLength, contentType: file.contentType,
      references: { tests: { [scope.testId]: true }, versions: { [scope.versionId]: true } },
    });
    const enabled = { EXTERNAL_AUDIO_THCS_ENABLED: 'enabled', FIREBASE_DB_URL: 'http://localhost:9000',
      LISTENING_DELIVERY_SECRET: 'test-only-hmac-for-thcs-playback' };
    expect((await f.call('play-thcs', scope, 'student-1')).status).toBe(404);
    expect((await f.call('play-thcs', scope, 'student-1', { ...enabled, FIREBASE_DB_URL: appDatabase })).status).toBe(404);
    const issued = await f.call('play-thcs', scope, 'student-1', enabled);
    expect(issued.status).toBe(200);
    const grant = await issued.json() as { url: string; refreshHandle: string };
    expect(new URL(grant.url).searchParams.get('versionId')).toBe(file.fileId);
    expect(f.rateKeys.at(-1)).toBe('external-audio:playback:student-1:unknown');
    const renewal = { ...scope, refreshHandle: grant.refreshHandle };
    expect((await f.call('play-thcs', renewal, 'student-1', enabled)).status).toBe(200);
    await expectError(await f.call('play-thcs', renewal, 'owner-2', enabled), 403, 'playback_denied');
    test.isPublic = false;
    await expectError(await f.call('play-thcs', renewal, 'student-1', enabled), 403, 'playback_denied');
  });

  it('issues and refreshes the exact pin only for the assigned private homework viewer', async () => {
    const f = fixture(true);
    const connectionId = await f.connect();
    const attached = await f.call('attach-draft', {
      testType: 'ielts-listening', draftId: 'listening-1', sectionId: '1', connectionId, generation: 1, ...selection,
    });
    const ref = await attached.json() as { assetId: string; scope: 'section' };
    const { assetId } = ref;
    const testId = 'listening-test';
    const versionId = 'immutable-version';
    const homeworkId = 'assignment-1';
    const submissionId = 'attempt-1';
    const scope = { assetId, testId, versionId, mode: 'homework', homeworkId, submissionId };
    const grantPath = `homework_test_access/${testId}/student-1/${homeworkId}`;
    f.appValues.set(`media_assets/${assetId}`, {
      assetId, canonicalAssetId: assetId, ownerId: 'owner-1', storageProvider: 'b2', state: 'committed',
      sourceDraftId: 'listening-1', sectionNumber: 1, sizeBytes: file.contentLength, contentType: file.contentType,
      references: { tests: { [testId]: true }, versions: { [versionId]: true }, assignments: { [homeworkId]: true } },
    });
    f.appValues.set(`tests/${testId}`, { ownerId: 'owner-1', versionId });
    f.appValues.set(`listening_authoring/versions/${versionId}`, {
      recordType: 'published-version', ownerId: 'owner-1', testId, versionId, sourceDraftId: 'listening-1',
      assetIds: { [assetId]: true }, archive: { state: 'active' },
      document: { isPublic: false, type: 'IELTS', skill: 'Listening', audioSections: [{ number: 1, externalAudio: ref }] },
    });
    const grant = { contentKind: 'ielts_listening', teacherId: 'owner-1', versionId, assetIds: [assetId], createdAt: now() };
    f.appValues.set(grantPath, grant);
    const homeworkDocuments: Record<string, unknown> = {
      [`homework_assignments/${homeworkId}`]: {
        id: homeworkId, createdBy: 'owner-1', materialId: testId, materialType: 'test', materialSkill: 'listening',
        archived: false, status: 'active', createdAt: now(), target: { type: 'students', studentIds: ['student-1'] },
        privateListeningPlayback: true,
        contentRef: { contentKind: 'ielts_listening', contentId: testId, version: versionId },
        scheduling: { availableFrom: now() - 1, dueDate: now() + 120_000 },
      },
      [`homework_submissions/${submissionId}`]: {
        id: submissionId, homeworkId, studentId: 'student-1', teacherId: 'owner-1', status: 'in_progress',
        listeningVersionId: versionId,
      },
    };
    let elapsed = 0;
    const worker = createUploadWorker({
      now: () => now() + elapsed,
      firebaseVerifier: { async verifyAuthorizationHeader(header: string | null) {
        return { valid: Boolean(header), uid: header?.slice('Bearer '.length) };
      } },
    });
    let canonicalResult: Record<string, unknown> | null = null;
    const call = (body: unknown, uid: string | null = 'student-1', enabled = true, route = 'solo') => worker.fetch(
      new Request(`http://localhost:8787/listening-delivery/${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5174',
          ...(uid ? { Authorization: `Bearer ${uid}` } : {}) }, body: JSON.stringify(body),
      }), {
        ...f.env, LISTENING_AUDIO_BUCKET: {},
        EXTERNAL_AUDIO_PRIVATE_HOMEWORK_ENABLED: enabled ? 'enabled' : 'disabled',
        EXTERNAL_AUDIO_PLAYBACK_QA_TTL_SECONDS: '6', LISTENING_DELIVERY_SECRET: 'EXTERNAL_AUDIO_FIXTURE_HMAC_SECRET',
        readListeningHomeworkDocument: async (path: string) => homeworkDocuments[path],
        readListeningResultDocument: async (id: string, authorization: string) =>
          id === 'saved-result' && ['Bearer student-1', 'Bearer owner-2'].includes(authorization) ? canonicalResult : null,
      }, undefined,
    );
    for (const response of [
      await call(scope, null), await call(scope, 'student-2'), await call(scope, 'student-1', false),
      await call({ ...scope, versionId: 'guessed-version' }),
      await call({ ...scope, assetId: '53f947d9-2484-4e83-bc3a-6ec82e0e5c81' }),
      await call({ ...scope, mode: 'self_study' }),
    ]) {
      expect(response.ok).toBe(false);
      expect(await response.json()).not.toHaveProperty('url');
    }
    const initial = await call(scope);
    expect(initial.status).toBe(200);
    const result = await initial.json() as { url: string; refreshHandle: string; expiresAt: number };
    expect(result.expiresAt).toBe(now() + 6000);
    expect(new URL(result.url).searchParams.get('versionId')).toBe(file.fileId);
    expect(result.refreshHandle).not.toContain(file.fileId);
    elapsed = 7000;
    const refresh = await call({ ...scope, refreshHandle: result.refreshHandle });
    expect(refresh.status).toBe(200);
    const renewed = await refresh.json() as { url: string; expiresAt: number };
    expect(renewed.expiresAt).toBe(now() + 13_000);
    expect(new URL(renewed.url).searchParams.get('versionId')).toBe(file.fileId);

    f.behavior.metadata = { ...file, fileId: 'newer-same-key' };
    const unavailable = await call({ ...scope, refreshHandle: result.refreshHandle });
    expect(unavailable.status).toBe(422);
    expect(await unavailable.json()).toEqual({ code: 'external_audio_unavailable' });
    f.appValues.delete(grantPath);
    const lostAccess = await call({ ...scope, refreshHandle: result.refreshHandle });
    expect(lostAccess.status).toBe(403);
    expect(await lostAccess.json()).toEqual({ code: 'delivery_not_authorized' });

    f.behavior.metadata = file;
    const versionPath = `listening_authoring/versions/${versionId}`;
    const version = f.appValues.get(versionPath) as { document: { isPublic: boolean }; archive: { state: string } };
    version.document.isPublic = true;
    f.appValues.set(`tests/${testId}`, { ownerId: 'owner-1', versionId, isPublic: true, isPublished: true, state: 'active' });
    f.appValues.set('courses/course-1', { ownerId: 'owner-2' });
    f.appValues.set('course_modules/module-1', { courseId: 'course-1' });
    f.appValues.set('course_enrollments', { enrolled: { courseId: 'course-1', studentId: 'student-1', status: 'active', expiresAt: 0 } });
    f.appValues.set('course_materials', { placement: { testId, materialId: testId, courseId: 'course-1', moduleId: 'module-1' } });
    const courseScope = { testId, versionId, assetId, mode: 'course_material', courseId: 'course-1', moduleId: 'module-1' };
    const courseOpen = { testId, versionId, courseId: 'course-1', moduleId: 'module-1', operationId: 'course-attempt' };
    const open = await call(courseOpen, 'student-1', true, 'course-open');
    expect(open.status).toBe(200);
    const { attemptHandle } = await open.json() as { attemptHandle: string };
    const openedPlayback = { ...courseScope, operationId: courseOpen.operationId, courseAttemptHandle: attemptHandle };
    const courseResponse = await call(openedPlayback);
    expect(courseResponse.status).toBe(200);
    const courseGrant = await courseResponse.json() as { url: string; refreshHandle: string };
    expect(new URL(courseGrant.url).searchParams.get('versionId')).toBe(file.fileId);
    expect((await call(courseScope, 'student-2')).status).toBe(403);
    f.appValues.set(`tests/${testId}`, { ownerId: 'owner-1', versionId: 'new-revision', isPublic: true, isPublished: true, state: 'active' });
    expect((await call(courseOpen, 'student-1', true, 'course-open')).status).toBe(403);
    expect((await call(courseScope)).status).toBe(403);
    expect((await call({ ...openedPlayback, operationId: 'another-attempt' })).status).toBe(403);
    const ongoing = await call({ ...openedPlayback, refreshHandle: courseGrant.refreshHandle });
    expect(ongoing.status).toBe(200);
    expect(new URL((await ongoing.json() as { url: string }).url).searchParams.get('versionId')).toBe(file.fileId);
    f.appValues.delete('course_materials');
    expect((await call({ ...openedPlayback, refreshHandle: courseGrant.refreshHandle })).status).toBe(403);

    canonicalResult = { resultId: 'saved-result', testId, materialVersionId: versionId, testSkill: 'Listening', deliveryEngine: 'listening' };
    version.archive.state = 'archived';
    f.appValues.delete(`tests/${testId}`);
    const review = { resultId: 'saved-result', versionId, assetId };
    expect((await call(review, 'owner-1', true, 'result-review')).status).toBe(403);
    const resultResponse = await call(review, 'owner-2', true, 'result-review');
    expect(resultResponse.status).toBe(200);
    const resultGrant = await resultResponse.json() as { url: string; refreshHandle: string };
    expect(new URL(resultGrant.url).searchParams.get('versionId')).toBe(file.fileId);
    expect((await call({ ...review, refreshHandle: resultGrant.refreshHandle }, 'student-1', true, 'result-review')).status).toBe(403);
    const resultRefresh = await call({ ...review, refreshHandle: resultGrant.refreshHandle }, 'owner-2', true, 'result-review');
    expect(resultRefresh.status).toBe(200);
    expect(new URL((await resultRefresh.json() as { url: string }).url).searchParams.get('versionId')).toBe(file.fileId);
  });

  it.each([
    { testType: 'ielts-listening', draftId: 'listening-1', sectionId: '1' },
    { testType: 'thcs-thpt', draftId: 'thcs-1', sectionId: 'section-1' },
  ])('pins and previews opaque $testType draft audio in its own section', async (target) => {
    const f = fixture(true);
    const connectionId = await f.connect();
    const input = { ...target, ...selection, connectionId, generation: 1 };
    await expectError(await f.call('attach-draft', input, 'owner-2'), 404, 'draft_audio_not_found');
    await expectError(await f.call('attach-draft', input, 'student-1'), 403, 'teacher_required');
    await expectError(await f.call('attach-draft', { ...input, ownerId: 'owner-1' }), 400, 'invalid_request');
    await expectError(await f.call('attach-draft', { ...input, sectionId: 'absent' }), 404, 'draft_audio_not_found');
    await expectError(await f.call('attach-draft', { ...input, generation: 0 }), 409, 'generation_conflict');
    expect((await f.call('attach-draft', input, 'owner-1', { EXTERNAL_AUDIO_DRAFTS_ENABLED: 'disabled' })).status).toBe(404);
    expect((await f.call('attach-draft', input, 'owner-1', { EXTERNAL_AUDIO_UPLOAD_ROLLOUT: 'disabled' })).status).toBe(404);
    const response = await f.call('attach-draft', input);
    expect(response.status).toBe(200);
    const opaque = await response.json() as { scope: string; assetId: string };
    expect(opaque).toEqual({ scope: 'section', assetId: expect.stringMatching(/^[a-f0-9-]{36}$/u) });
    expect(f.snapshots.get(`/external_audio_draft_assets/owner-1/${opaque.assetId}.json`)?.body).toContain(file.fileId);
    const metadata = await f.call('draft-recording', { ...target, assetId: opaque.assetId });
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({ filename: file.fileName.split('/').at(-1) });
    await expectError(await f.call('draft-recording', { ...target, assetId: opaque.assetId }, 'owner-2'), 404, 'draft_audio_not_found');
    await expectError(await f.call('draft-recording', { ...target, assetId: opaque.assetId }, 'student-1'), 403, 'teacher_required');
    const preview = await f.call('preview-draft', { ...target, assetId: opaque.assetId });
    expect(preview.status).toBe(200);
    const value = await preview.json() as { url: string; expiresAt: number };
    expect(Object.keys(value).sort()).toEqual(['expiresAt', 'url']);
    expect(new URL(value.url).searchParams.get('versionId')).toBe(file.fileId);
    await expectError(await f.call('preview-draft', { ...target, assetId: opaque.assetId, ...selection }), 400, 'invalid_request');
    await expectError(await f.call('preview-draft', { ...target, assetId: opaque.assetId, draftId: 'bad-draft' }), 404, 'draft_audio_not_found');
    await expectError(await f.call('preview-draft', { ...target, assetId: opaque.assetId }, 'owner-2'), 404, 'draft_audio_not_found');
    if (target.testType === 'ielts-listening') {
      await expectError(await f.call('preview-draft', { ...target, assetId: opaque.assetId, sectionId: '2' }), 404, 'draft_audio_not_found');
    }

    const revoked = await f.call('revoke', { connectionId, generation: 1 });
    expect(revoked.status).toBe(200);
    await expectError(await f.call('preview-draft', { ...target, assetId: opaque.assetId }), 410, 'revoked_connection');
  });

  it('blocks connection adoption during rollout rollback while preserving existing playback', async () => {
    const f = fixture();
    const connectionId = await f.connect();
    const blockedConnect = await f.call('connect', { ...credentials, generation: 1 }, 'owner-1', { EXTERNAL_AUDIO_UPLOAD_ROLLOUT: 'disabled' });
    expect(blockedConnect.status).toBe(503);
    const blockedSwitch = await f.call('switch', { ...credentials, applicationKeyId: 'test-other-key', bucketName: 'second-archive', connectionId, generation: 1 }, 'owner-1', { EXTERNAL_AUDIO_UPLOAD_ROLLBACK: 'enabled' });
    expect(blockedSwitch.status).toBe(503);
    const asset = { accountId: file.accountId, bucketId: file.bucketId, bucketName: credentials.bucketName,
      storageProvider: 'b2' as const, ownerId: 'owner-1', connectionId, assetId: 'asset-rollback',
      objectKey: file.fileName, providerVersionId: file.fileId, contentType: file.contentType, sizeBytes: file.contentLength, health: 'healthy' as const };
    await expect(f.service().signPlayback(asset)).resolves.toMatchObject({ url: expect.stringContaining(file.fileId) });
  });

  it('rejects a selection that races with a connection change before writing a draft attachment', async () => {
    const f = fixture(true);
    const connectionId = await f.connect();
    f.behavior.beforeAuthorization = async () => {
      f.behavior.beforeAuthorization = async () => {};
      expect((await f.call('rotate', { ...replacement, connectionId, generation: 1 })).status).toBe(200);
    };
    const response = await f.call('attach-draft', {
      testType: 'ielts-listening', draftId: 'listening-1', sectionId: '1', connectionId, generation: 1, ...selection,
    });
    await expectError(response, 409, 'generation_conflict');
    expect([...f.snapshots.keys()].filter((path) => path.includes('draft_assets'))).toEqual([]);
  });

  it('validates without a write, connects with a scoped identity, and exposes only safe metadata', async () => {
    const f = fixture();
    const validated = await f.call('validate', credentials);
    expect(await validated.json()).toEqual({ bucketName: credentials.bucketName, prefix: credentials.prefix, health: 'healthy' });
    expect(f.databaseRequests.map(({ method }) => method)).toEqual(['GET']);
    const id = await f.connect();
    const read = await f.call('connections', {});
    expect(read.headers.get('Cache-Control')).toBe('no-store');
    expect(await read.json()).toEqual({
      generation: 1, activeConnectionId: id,
      connections: [{ id, bucketName: credentials.bucketName, prefix: credentials.prefix,
        state: 'active', checkedAt: now(), lastSuccessfulAt: now(), health: 'healthy' }],
    });
    const stored = [...f.snapshots.values()][0].body;
    expect(JSON.parse(stored).connections[id].envelope.version).toBe('v1');
    for (const secret of [credentials.applicationKey, credentials.applicationKeyId, accountToken, oauthToken, privateKey]) {
      expect(stored).not.toContain(secret);
    }
    expect(f.databaseRequests.every(({ url }) => new URL(url).hostname === storeHost)).toBe(true);
    expect(f.rateKeys[0]).toBe('external-audio:credentials:owner-1:unknown');
  });

  it('preserves provider upload timestamps for same-name version disambiguation', async () => {
    const f = fixture();
    const id = await f.connect();
    f.behavior.metadata = { ...file, uploadTimestamp: 1_700_000_000_000 };
    const inspected = await f.call('inspect', { connectionId: id, ...selection });
    expect(await inspected.json()).toMatchObject({ providerVersionId: file.fileId, lastModifiedAt: 1_700_000_000_000 });
  });

  it('requires an eligible owner, sends only POST CORS, and has no signing route', async () => {
    const f = fixture();
    await expectError(await f.call('connections', {}, 'stranger'), 401, 'Unauthorized');
    await expectError(await f.call('connections', {}, 'student-1'), 403, 'teacher_required');
    await expectError(await f.call('connections', {}, 'disabled-1'), 403, 'teacher_required');
    expect(f.fetchMock).not.toHaveBeenCalled();
    const id = await f.connect();
    const before = f.providerRequests.length;
    await expectError(await f.call('list', { connectionId: id }, 'owner-2'), 404, 'connection_not_found');
    await expectError(await f.call('list', { connectionId: id, ownerId: 'owner-1' }, 'owner-2'), 400, 'invalid_request');
    expect(f.providerRequests).toHaveLength(before);
    expect((await f.call('sign-playback', { connectionId: id, ...selection })).status).toBe(404);
    expect((await f.call('connections', {}, 'owner-1', { EXTERNAL_AUDIO_ROUTES_ENABLED: undefined })).status).toBe(404);
    const preflight = async (origin: string, method: string) => f.worker.fetch(
      new Request('http://localhost:5173/external-audio/list', {
        method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method },
      }), f.env, undefined,
    );
    const allowed = await preflight('http://localhost:5173', 'POST');
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Methods')).toBe('OPTIONS, POST');
    expect((await preflight('http://localhost:5173', 'PUT')).status).toBe(405);
    expect((await preflight('https://hocthem.net', 'POST')).status).toBe(403);
    f.behavior.rateLimited = true;
    await expectError(await f.call('list', { connectionId: id }), 429, 'rate_limited');
    expect(f.rateKeys.at(-1)).toBe('external-audio:browse:owner-1:unknown');
  });

  it('rejects invalid isolation settings and blocks lifecycle writes during restore', async () => {
    const f = fixture();
    const brokenSettings = [
      { EXTERNAL_AUDIO_STORE_DATABASE_URL: appDatabase },
      { EXTERNAL_AUDIO_STORE_DATABASE_URL: `https://${storeHost}/a/path` },
      { EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT: '{}' },
      { EXTERNAL_AUDIO_ENCRYPTION_KEYRING: keyring('absent') },
      { EXTERNAL_AUDIO_ENCRYPTION_KEYRING: keyring('v1', 'local') },
      { EXTERNAL_AUDIO_ENVIRONMENT: 'production' },
      { FIREBASE_PROJECT_ID: 'temp-a1437' },
      { FIREBASE_DB_URL: 'https://other-app-default-rtdb.firebaseio.com' },
      { FIREBASE_DATABASE_EMULATOR_URL: 'http://localhost:9000' },
    ];
    for (const settings of brokenSettings) {
      await expectError(await f.call('connect', { ...credentials, generation: 0 }, 'owner-1', settings), 503, 'store_unavailable');
    }
    f.behavior.restoring = true;
    await expectError(await f.call('connect', { ...credentials, generation: 0 }), 503, 'restore_in_progress');
    expect(f.fetchMock).not.toHaveBeenCalled();
  });

  it('paginates inside a directory and verifies exact versions, media type, and bounds', async () => {
    const f = fixture();
    const id = await f.connect();
    const current = { connectionId: id };
    const first = await f.call('list', current);
    const selected = { ...selection, contentType: 'audio/mpeg', sizeBytes: file.contentLength };
    expect(await first.json()).toEqual({ files: [selected], nextCursor: f.behavior.nextFileName });
    const second = await f.call('list', { ...current, cursor: f.behavior.nextFileName });
    expect(await second.json()).toEqual({ files: [{ ...selected, objectKey: f.behavior.nextFileName }], nextCursor: null });
    expect(await (await f.call('inspect', { ...current, ...selection })).json()).toEqual(selected);
    await expectError(await f.call('list', { ...current, prefix: 'shared-other/' }), 422, 'wrong_prefix');
    await expectError(await f.call('list', { ...current, cursor: 'elsewhere/file.mp3' }), 422, 'wrong_prefix');
    await expectError(await f.call('inspect', { ...current, ...selection, objectKey: 'shared/a/../file.mp3' }), 422, 'wrong_prefix');
    await expectError(await f.call('inspect', { ...current, ...selection, providerVersionId: 'missing-file' }), 404, 'object_missing');
    await expectError(await f.call('inspect', { ...current, ...selection, providerVersionId: 'changed' }), 409, 'object_changed');
    f.behavior.metadata = { ...file, contentLength: 50 * 1024 * 1024 + 1 };
    await expectError(await f.call('inspect', { ...current, ...selection }), 422, 'oversized_audio');
    f.behavior.metadata = { ...file, contentType: 'text/html' };
    await expectError(await f.call('inspect', { ...current, ...selection }), 422, 'unsupported_audio');
  });

  it('signs only the selected exact object with a short expiry and verifies the provider range', async () => {
    const f = fixture();
    const id = await f.connect();
    const response = await f.call('preview', { connectionId: id, ...selection });
    expect(response.status).toBe(200);
    const body = await response.json() as { url: string; expiresAt: number };
    const url = new URL(body.url);
    expect(url.origin).toBe(`https://${s3Host}`);
    expect(decodeURIComponent(url.pathname)).toBe(`/${credentials.bucketName}/${file.fileName}`);
    expect(url.searchParams.get('versionId')).toBe(file.fileId);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    // Computed independently from the SigV4 canonical request for this fixture.
    expect(url.searchParams.get('X-Amz-Signature')).toBe('17d763d6218d25bc2f27b8fd8ab118f5232ffcb98d26dccd0351cce4272959e3');
    expect(body.expiresAt).toBe(now() + 120_000);
    expect(JSON.stringify(body)).not.toMatch(/test-original-secret|native-account-token|dedicated-oauth|wrappedKey|ciphertext/u);
    expect(f.rateKeys.at(-1)).toBe('external-audio:preview:owner-1:unknown');
    f.behavior.rangeVersion = 'different-version';
    await expectError(await f.call('preview', { connectionId: id, ...selection }), 409, 'object_changed');
  });

  it('rejects broader, insufficient, public-bucket and drifted provider responses and sanitizes failures', async () => {
    const f = fixture();
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const check = () => f.call('validate', credentials);
    for (const caps of [
      ['listFiles', 'readFiles'],
      ['listBuckets', 'listFiles', 'readFiles', 'writeFiles'],
      ['listBuckets', 'listFiles', 'readFiles', 'deleteFiles'],
      ['listBuckets', 'listFiles', 'readFiles', 'writeKeys'],
    ]) {
      f.behavior.capabilities = caps;
      await expectError(await check(), 422, 'insufficient_capabilities');
    }
    // Backblaze Web Console "Read Only" preset capabilities are accepted when bucket-scoped.
    f.behavior.capabilities = ['listBuckets', 'listFiles', 'readFiles', 'shareFiles', 'readBucketEncryption', 'readBucketReplications', 'listAllBucketNames'];
    expect((await check()).status).toBe(200);
    f.behavior.capabilities = ['listBuckets', 'listFiles', 'readFiles'];
    f.behavior.partnerCapabilities = ['all'];
    await expectError(await check(), 422, 'insufficient_capabilities');
    f.behavior.partnerCapabilities = [];
    f.behavior.wrongScope = true;
    await expectError(await check(), 422, 'wrong_prefix');
    f.behavior.wrongScope = false;
    f.behavior.bucketType = 'allPublic';
    await expectError(await check(), 422, 'private_bucket_required');
    f.behavior.providerHost = 'api004.backblazeb2.com.example.net';
    await expectError(await check(), 503, 'provider_unavailable');
    f.behavior.badKey = true;
    await expectError(await check(), 422, 'invalid_key');
    f.behavior.providerStatus = 429;
    await expectError(await check(), 429, 'provider_rate_limited');
    f.behavior.providerStatus = 302;
    await expectError(await check(), 503, 'provider_unavailable');
    expect(f.providerRequests.some(({ hostname }) => hostname === 'redirect.example')).toBe(false);
    expect(f.databaseRequests.every(({ method }) => method === 'GET')).toBe(true);
    expect(logs).not.toHaveBeenCalled();
  });
});

describe('external audio lifecycle and trusted playback', () => {
  it('rotates the same scope in place and archives a switched connection for pinned playback only', async () => {
    const f = fixture();
    const id = await f.connect();
    const asset = await f.service().prepareAsset('owner-1', id, 'asset-1', selection);
    expect(asset).toMatchObject({ storageProvider: 'b2', connectionId: id, providerVersionId: file.fileId });
    f.behavior.badKey = true;
    const recheck = await f.call('recheck', { connectionId: id, generation: 1 });
    expect(await recheck.json()).toMatchObject({ generation: 2, connections: [{ health: 'invalid_key' }] });
    f.behavior.badKey = false;
    f.behavior.wrongScope = true;
    await expectError(await f.call('rotate', { ...replacement, connectionId: id, generation: 2 }), 422, 'wrong_prefix');
    f.behavior.wrongScope = false;
    const rotated = await f.call('rotate', { ...replacement, connectionId: id, generation: 2 });
    expect(await rotated.json()).toMatchObject({ generation: 3, activeConnectionId: id, connections: [{ health: 'healthy' }] });
    const proof = await createAudioCredentialStore(f.env).read('owner-1');
    const row = proof.value.connections![id];
    if (row.state === 'revoked') throw new Error('expected live credential');
    expect(await createAudioCredentialStore(f.env).open('owner-1', row)).toEqual(replacement);

    const switchBody = { ...credentials, applicationKeyId: 'test-other-key', bucketName: 'second-archive', connectionId: id, generation: 3 };
    const switched = await f.call('switch', switchBody);
    const state = await switched.json() as { activeConnectionId: string };
    expect(switched.status).toBe(200);
    expect(state.activeConnectionId).not.toBe(id);
    await expectError(await f.call('list', { connectionId: id }), 409, 'archived_connection');
    await expectError(await f.call('preview', { connectionId: id, ...selection }), 409, 'archived_connection');
    await expect(f.service().prepareAsset('owner-1', id, 'new-asset', selection)).rejects.toMatchObject({ code: 'archived_connection' });
    const signed = await f.service().signPlayback(asset);
    expect(new URL(signed.url).searchParams.get('versionId')).toBe(file.fileId);
    const revoked = await f.call('revoke', { connectionId: id, generation: 4 });
    expect(await revoked.json()).toMatchObject({ activeConnectionId: state.activeConnectionId, generation: 5 });
    const stored = (await createAudioCredentialStore(f.env).read('owner-1')).value.connections![id];
    expect(stored.state).toBe('revoked');
    expect(stored).not.toHaveProperty('envelope');
    await expect(f.service().signPlayback(asset)).rejects.toMatchObject({ code: 'revoked_connection' });
  });

  it.each(['rotate', 'switch'] as const)('rejects a %s write that races with revocation', async (action) => {
    const f = fixture();
    const id = await f.connect();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    f.behavior.beforeAuthorization = async () => {
      entered.resolve();
      await resume.promise;
    };
    const body = action === 'rotate' ? replacement : { ...credentials, applicationKeyId: 'test-other-key', bucketName: 'second-archive' };
    const pending = f.call(action, { ...body, connectionId: id, generation: 1 });
    await entered.promise;
    expect((await f.call('revoke', { connectionId: id, generation: 1 })).status).toBe(200);
    resume.resolve();
    await expectError(await pending, 409, 'generation_conflict');
    const final = await f.call('connections', {});
    expect(await final.json()).toMatchObject({ activeConnectionId: null, generation: 2, connections: [{ state: 'revoked' }] });
    expect([...f.snapshots.values()][0].body).not.toContain('ciphertext');
  });

  it('denies a preview when the connection is revoked during the provider range request', async () => {
    const f = fixture();
    const id = await f.connect();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    f.behavior.beforeRange = async () => {
      entered.resolve();
      await resume.promise;
    };
    const preview = f.call('preview', { connectionId: id, ...selection });
    await entered.promise;
    expect((await f.call('revoke', { connectionId: id, generation: 1 })).status).toBe(200);
    resume.resolve();
    await expectError(await preview, 410, 'revoked_connection');
  });

  it('authenticates encrypted envelopes against owner, scope, environment and key version', async () => {
    const f = fixture();
    const id = await f.connect();
    const store = createAudioCredentialStore(f.env);
    const row = (await store.read('owner-1')).value.connections![id];
    if (row.state === 'revoked') throw new Error('expected live credential');
    const nextVersion = createAudioCredentialStore({ ...f.env, EXTERNAL_AUDIO_ENCRYPTION_KEYRING: keyring('v2') });
    expect(await nextVersion.open('owner-1', row)).toEqual({
      applicationKey: credentials.applicationKey, applicationKeyId: credentials.applicationKeyId,
    });
    expect((await nextVersion.seal('owner-1', id, row.scope, replacement)).version).toBe('v2');
    await expect(store.open('owner-2', row)).rejects.toMatchObject({ code: 'store_unavailable' });
    await expect(store.open('owner-1', { ...row, scope: { ...row.scope, prefix: 'other/' } })).rejects.toMatchObject({ code: 'store_unavailable' });
    const isolated = createAudioCredentialStore({
      ...f.env, EXTERNAL_AUDIO_ENVIRONMENT: 'local', EXTERNAL_AUDIO_STORE_PROJECT_ID: 'fixture-external-audio-local',
      EXTERNAL_AUDIO_STORE_DATABASE_URL: 'https://fixture-external-audio-local-default-rtdb.firebaseio.com',
      EXTERNAL_AUDIO_ENCRYPTION_KEYRING: keyring('v1', 'local'),
      EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT: f.env.EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT.replaceAll(storeProject, 'fixture-external-audio-local'),
    });
    await expect(isolated.open('owner-1', row)).rejects.toMatchObject({ code: 'store_unavailable' });
  });

  it('returns safe dependency impact and keeps cleanup blocked while a pin is linked', async () => {
    const f = fixture();
    const id = await f.connect();
    const asset = { connectionId: id, ownerId: 'owner-1', objectKey: file.fileName, providerVersionId: file.fileId, assetId: 'asset-1' };
    const ref = { assetId: asset.assetId };
    f.appValues.set('media_assets', { 'asset-1': asset });
    f.appValues.set('listening_authoring', { drafts: { draft: { state: 'active', audio: [ref, ref] } }, versions: { current: { audio: ref } } });
    f.appValues.set('tests', { one: { isPublic: true, audio: [ref, ref] } });
    f.appValues.set('homework_test_access', { one: { student: { 'homework-1': { versionId: 'current' } },
      another: { 'homework-1': { versionId: 'current' } } } });
    f.appValues.set('test_results', { 'result-1': { audio: { assetId: 'asset-1' } } });
    const service = createExternalAudioConnections({
      store: createAudioCredentialStore(f.env), source: new BackblazeAudioSource(), now,
      readAppValue: async (path) => f.appValues.get(path),
    });
    await expect(service.impact('owner-1', id)).resolves.toMatchObject({
      connectionId: id, linkedFileCount: 1, draftCount: 1, publishedCount: 1, publicTestCount: 1, homeworkCount: 1, resultCount: 1, cleanupEligible: false,
    });
    expect(JSON.stringify(await service.impact('owner-1', id))).not.toContain('ciphertext');
  });

  it('cleans an archived source only after its last dependency is gone', async () => {
    const f = fixture();
    const id = await f.connect();
    const switched = await f.call('switch', { ...credentials, applicationKeyId: 'test-other-key', bucketName: 'second-archive', connectionId: id, generation: 1 });
    expect(switched.status).toBe(200);
    const cleaned = await f.call('cleanup', { connectionId: id, generation: 2 });
    expect(cleaned.status).toBe(200);
    const state = await f.call('connections', {});
    expect((await state.json() as { connections: Array<{ id: string }> }).connections.some((row) => row.id === id)).toBe(false);
  });

  it('denies admin health to ordinary teachers and returns safe metadata to a super admin', async () => {
    const f = fixture();
    expect((await f.call('admin-health', {})).status).toBe(403);
    const connectionId = await f.connect();
    expect((await f.call('admin-impact', { ownerId: 'owner-1', connectionId })).status).toBe(403);
    const impact = await f.call('admin-impact', { ownerId: 'owner-1', connectionId }, 'owner-2');
    expect(impact.status).toBe(200);
    expect(await impact.json()).toMatchObject({ connectionId, linkedFileCount: 0 });
    const allowed = await f.call('admin-health', {}, 'owner-2');
    expect(allowed.status).toBe(200);
    const body = await allowed.json() as { connections: unknown[] };
    expect(body).toHaveProperty('generatedAt', now());
    expect(body.connections).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('ciphertext');
  });

  it('retains multiple teacher-owned accounts, reactivates without credentials, guards races/duplicates, and isolates revocation', async () => {
    const f = fixture();
    f.behavior.namePrefix = null;
    const accountA = { ...credentials, prefix: '', label: 'Alice Account A', generation: 0 };
    const connectedA = await f.call('connect', accountA);
    expect(connectedA.status).toBe(200);
    const bodyA = await connectedA.json() as { generation: number; activeConnectionId: string; connections: Array<{ id: string; label?: string; state: string; prefix: string }> };
    const idA = bodyA.activeConnectionId;
    expect(bodyA.connections).toEqual([expect.objectContaining({ id: idA, label: 'Alice Account A', state: 'active', prefix: '' })]);

    const service = createExternalAudioConnections({
      store: createAudioCredentialStore(f.env),
      source: new BackblazeAudioSource(),
      now,
    });
    const fileA = { ...file, accountId: 'account-1', bucketId: 'bucket-1', fileName: 'part1.mp3', fileId: 'file-a-v1' };
    f.behavior.metadata = fileA;
    f.behavior.files = [fileA];
    f.behavior.rangeVersion = fileA.fileId;
    const assetA = await service.prepareAsset('owner-1', idA, 'asset-a', { objectKey: fileA.fileName, providerVersionId: fileA.fileId }, 1);
    expect(assetA).toMatchObject({ ownerId: 'owner-1', connectionId: idA, objectKey: fileA.fileName, providerVersionId: fileA.fileId });

    const addedB = await f.call('switch', {
      ...credentials,
      applicationKeyId: 'test-other-key',
      bucketName: 'second-archive',
      prefix: '',
      label: 'Alice Account B',
      connectionId: idA,
      generation: 1,
    });
    expect(addedB.status).toBe(200);
    const bodyB = await addedB.json() as { generation: number; activeConnectionId: string; connections: Array<{ id: string; label?: string; state: string }> };
    const idB = bodyB.activeConnectionId;
    expect(idB).not.toBe(idA);
    expect(bodyB.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: idA, label: 'Alice Account A', state: 'archived' }),
      expect.objectContaining({ id: idB, label: 'Alice Account B', state: 'active' }),
    ]));

    // Archived A cannot browse until reactivated, but still signs pinned playback.
    await expectError(await f.call('list', { connectionId: idA, prefix: '' }), 409, 'archived_connection');
    expect((await service.signPlayback(assetA)).url).toContain('versionId=file-a-v1');

    // Duplicate re-add of retained Account A is rejected instead of creating a duplicate row.
    await expectError(await f.call('switch', {
      ...credentials,
      prefix: '',
      connectionId: idB,
      generation: 2,
    }), 409, 'use_rotation');

    // Unrelated teacher (owner-2) cannot select or browse Alice's connection.
    await expectError(await f.call('select', { connectionId: idA, generation: 0 }, 'owner-2'), 404, 'connection_not_found');

    // Stale generation and restore guard fail closed on select.
    await expectError(await f.call('select', { connectionId: idA, generation: 1 }), 409, 'generation_conflict');
    f.appValues.set('system_flags/restore_in_progress', true);
    await expectError(await f.call('select', { connectionId: idA, generation: 2 }), 503, 'restore_in_progress');
    f.appValues.delete('system_flags/restore_in_progress');

    // Reactivate A without re-entering credentials; B becomes retained.
    const reselectedA = await f.call('select', { connectionId: idA, generation: 2 });
    expect(reselectedA.status).toBe(200);
    const bodyReselected = await reselectedA.json() as { generation: number; activeConnectionId: string; connections: Array<{ id: string; state: string; label?: string }> };
    expect(bodyReselected.generation).toBe(3);
    expect(bodyReselected.activeConnectionId).toBe(idA);
    expect(bodyReselected.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: idA, label: 'Alice Account A', state: 'active' }),
      expect.objectContaining({ id: idB, label: 'Alice Account B', state: 'archived' }),
    ]));

    // Reactivated A can browse again; archived B cannot browse until selected.
    expect((await f.call('list', { connectionId: idA, prefix: '' })).status).toBe(200);
    await expectError(await f.call('list', { connectionId: idB, prefix: '' }), 409, 'archived_connection');

    // Revoking A blocks only A's playback and reactivation; B stays healthy and selectable.
    const fileB = { ...file, accountId: 'account-2', bucketId: 'bucket-2', fileName: 'part2.mp3', fileId: 'file-b-v1' };
    f.behavior.metadata = fileB;
    f.behavior.files = [fileB];
    f.behavior.rangeVersion = fileB.fileId;
    const reselectedB = await f.call('select', { connectionId: idB, generation: 3 });
    expect(reselectedB.status).toBe(200);
    const assetB = await service.prepareAsset('owner-1', idB, 'asset-b', { objectKey: fileB.fileName, providerVersionId: fileB.fileId }, 4);

    const revokedA = await f.call('revoke', { connectionId: idA, generation: 4 });
    expect(revokedA.status).toBe(200);
    await expect(service.signPlayback(assetA)).rejects.toMatchObject({ code: 'revoked_connection' });
    await expectError(await f.call('select', { connectionId: idA, generation: 5 }), 410, 'revoked_connection');
    expect((await service.signPlayback(assetB)).url).toContain('versionId=file-b-v1');
  });

  it('supports isolated production credential store and production origins while rejecting local/unapproved origins', async () => {
    const f = fixture();
    const prodStoreProject = 'luyentap-audio-prod';
    const prodEnv = {
      ...f.env,
      EXTERNAL_AUDIO_ENVIRONMENT: 'production',
      EXTERNAL_AUDIO_DRAFTS_ENABLED: 'enabled',
      EXTERNAL_AUDIO_THCS_ENABLED: 'enabled',
      FIREBASE_PROJECT_ID: 'temp-a1437',
      FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
      EXTERNAL_AUDIO_STORE_PROJECT_ID: prodStoreProject,
      EXTERNAL_AUDIO_STORE_DATABASE_URL: `https://${prodStoreProject}-default-rtdb.asia-southeast1.firebasedatabase.app`,
      EXTERNAL_AUDIO_ENCRYPTION_KEYRING: keyring('v1', 'production'),
      EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT: f.env.EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT.replaceAll(storeProject, prodStoreProject),
    };
    const prodStore = createAudioCredentialStore(prodEnv);
    const scope = { accountId: 'account-1', bucketId: 'bucket-1', bucketName: 'teacher-audio', prefix: 'ielts/' };
    const envelope = await prodStore.seal('owner-1', 'conn-prod-1', scope, {
      applicationKeyId: credentials.applicationKeyId,
      applicationKey: credentials.applicationKey,
    });
    expect(await prodStore.open('owner-1', {
      id: 'conn-prod-1', state: 'active', scope, health: 'healthy', checkedAt: 1, envelope,
    })).toEqual({
      applicationKeyId: credentials.applicationKeyId,
      applicationKey: credentials.applicationKey,
    });

    const { externalAudioDraftsEnabled, externalAudioThcsEnabled } = await import('../src/upload-worker/external-audio/draft-assets.ts');
    const req = (origin: string) => new Request('https://r2-upload-signer.iamhuwng.workers.dev/external-audio/attach-draft', {
      method: 'POST', headers: { Origin: origin },
    });
    expect(externalAudioDraftsEnabled(prodEnv, req('https://kahut1.web.app'))).toBe(true);
    expect(externalAudioDraftsEnabled(prodEnv, req('https://hocthem.net'))).toBe(true);
    expect(externalAudioDraftsEnabled(prodEnv, req('https://www.hocthem.net'))).toBe(true);
    expect(externalAudioThcsEnabled(prodEnv, req('https://kahut1.web.app'))).toBe(true);
    expect(externalAudioDraftsEnabled(prodEnv, req('http://localhost:5173'))).toBe(false);
    expect(externalAudioDraftsEnabled(prodEnv, req('https://evil.example'))).toBe(false);

    // Verify worker.js CORS gate accepts production origins (OPTIONS & POST) and rejects localhost/evil origins in production.
    const prodWorker = createUploadWorker({
      fetchImpl: f.fetchMock,
      verifyToken: async () => ({ uid: 'owner-1' }),
      readDatabaseValue: async (path) => f.appValues.get(path),
      now,
    });
    for (const allowedOrigin of ['https://kahut1.web.app', 'https://hocthem.net', 'https://www.hocthem.net']) {
      const preflight = await prodWorker.fetch(new Request('https://r2-upload-signer.iamhuwng.workers.dev/external-audio/connections', {
        method: 'OPTIONS',
        headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' },
      }), prodEnv as never, {} as never);
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
      expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('OPTIONS, POST');
    }
    for (const blockedOrigin of ['http://localhost:5173', 'https://evil.example']) {
      const rejected = await prodWorker.fetch(new Request('https://r2-upload-signer.iamhuwng.workers.dev/external-audio/connections', {
        method: 'OPTIONS',
        headers: { Origin: blockedOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' },
      }), prodEnv as never, {} as never);
      expect(rejected.status).toBe(403);
    }
  });
});
